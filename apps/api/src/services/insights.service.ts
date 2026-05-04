import type { PrismaClient } from '@prisma/client';
import type Anthropic from '@anthropic-ai/sdk';
import {
  InsightFocusSchema,
  InsightOutputSchema,
  type InsightFocus,
  type InsightOutput,
  type InsightPromptInput,
  type InsightWindow,
} from '@openfit/types';

export class InsightsError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'InsightsError';
  }
}

export const INSIGHTS_MODEL = 'claude-haiku-4-5';

export interface AnthropicClient {
  messages: {
    create: (
      params: Anthropic.Messages.MessageCreateParamsNonStreaming,
    ) => Promise<Anthropic.Messages.Message>;
  };
}

export interface InsightsLogger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

interface InsightsServiceDeps {
  prisma: PrismaClient;
  anthropic: AnthropicClient;
  /** Override for tests / cost control. Default `claude-haiku-4-5`. */
  model?: string;
  logger?: InsightsLogger;
  /** Override "now" for deterministic tests. */
  now?: () => Date;
}

export class InsightsService {
  private readonly prisma: PrismaClient;
  private readonly anthropic: AnthropicClient;
  private readonly model: string;
  private readonly logger: InsightsLogger;
  private readonly now: () => Date;

  constructor(deps: InsightsServiceDeps) {
    this.prisma = deps.prisma;
    this.anthropic = deps.anthropic;
    this.model = deps.model ?? INSIGHTS_MODEL;
    this.logger = deps.logger ?? console;
    this.now = deps.now ?? (() => new Date());
  }

  /**
   * Public entry point. Cache key is
   * (userId, focus, dateBucket, lastEventStamp). Hit returns the stored
   * row; miss gathers prompt inputs, calls Claude, and persists.
   */
  async getOrCreate(userId: string, rawFocus: unknown): Promise<InsightOutput> {
    const focusParsed = InsightFocusSchema.safeParse(rawFocus ?? 'general');
    if (!focusParsed.success) {
      throw new InsightsError(`Invalid focus: ${JSON.stringify(rawFocus)}`, 400);
    }
    const focus = focusParsed.data;

    const now = this.now();
    const dateBucket = isoDay(now);
    const lastEventStamp = await this.computeEventStamp(userId);

    const cached = await this.prisma.insight.findUnique({
      where: {
        userId_focus_dateBucket_lastEventStamp: {
          userId,
          focus,
          dateBucket,
          lastEventStamp,
        },
      },
    });
    if (cached) {
      const parsed = InsightOutputSchema.safeParse(cached.output);
      if (parsed.success) return parsed.data;
      this.logger.warn(
        { id: cached.id },
        'Cached insight failed schema validation; regenerating',
      );
    }

    const promptInput = await this.gatherPromptInput(userId, focus, now);
    const output = await this.callLLM(promptInput);

    await this.prisma.insight.create({
      data: {
        userId,
        focus,
        dateBucket,
        lastEventStamp,
        promptInput: promptInput as unknown as object,
        output: output as unknown as object,
        model: this.model,
      },
    });

    return output;
  }

  // ──────────────────────────────────────────────────────────────────────
  // Cache key
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Returns the timestamp of the most recent change to any DB input that
   * feeds an insight: workout completions or DailyHealth writes. If
   * nothing exists yet (brand-new user), returns a stable epoch so the
   * first cache row keys correctly.
   */
  private async computeEventStamp(userId: string): Promise<Date> {
    const [workout, health] = await Promise.all([
      this.prisma.workoutLog.findFirst({
        where: { userId, completedAt: { not: null } },
        select: { completedAt: true },
        orderBy: { completedAt: 'desc' },
      }),
      this.prisma.dailyHealth.findFirst({
        where: { userId },
        select: { updatedAt: true },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);
    const ts = [workout?.completedAt, health?.updatedAt].filter(
      (t): t is Date => t instanceof Date,
    );
    if (ts.length === 0) return new Date(0);
    return new Date(Math.max(...ts.map((t) => t.getTime())));
  }

  // ──────────────────────────────────────────────────────────────────────
  // Prompt input gathering
  // ──────────────────────────────────────────────────────────────────────

  private async gatherPromptInput(
    userId: string,
    focus: InsightFocus,
    now: Date,
  ): Promise<InsightPromptInput> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, dateOfBirth: true, sex: true },
    });
    if (!user) throw new InsightsError('User not found', 404);

    const since7 = new Date(now.getTime() - 7 * 86_400_000);
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today.getTime() - 86_400_000);
    const twoDaysAgo = new Date(today.getTime() - 2 * 86_400_000);

    const recentHealth = await this.prisma.dailyHealth.findMany({
      where: { userId, date: { gte: since7 } },
      select: {
        date: true,
        sleepScore: true,
        sleepDurationMinutes: true,
        recoveryScore: true,
        effortScore: true,
        effortEarnedMinutes: true,
        heartRateResting: true,
        hrvRmssd: true,
      },
      orderBy: { date: 'desc' },
    });

    const todayRow = recentHealth.find((h) => sameDay(h.date, today)) ?? null;

    const rhrSamples = recentHealth
      .filter((h) => !sameDay(h.date, today))
      .map((h) => h.heartRateResting)
      .filter((v): v is number => v != null);
    const hrvSamples = recentHealth
      .filter((h) => !sameDay(h.date, today))
      .map((h) => h.hrvRmssd)
      .filter((v): v is number => v != null);
    const sleepSamples = recentHealth
      .map((h) => h.sleepScore)
      .filter((v): v is number => v != null);

    const earnedByDay = (target: Date): number | null => {
      const row = recentHealth.find((h) => sameDay(h.date, target));
      return row?.effortEarnedMinutes ?? null;
    };
    const last3DaysEarned = [
      earnedByDay(today) ?? 0,
      earnedByDay(yesterday) ?? 0,
      earnedByDay(twoDaysAgo) ?? 0,
    ];
    // Same exponential decay used by the readiness scorer.
    const decayedLoad =
      last3DaysEarned[0]! * 1 +
      last3DaysEarned[1]! * 0.6 +
      last3DaysEarned[2]! * 0.3;

    const lastWorkoutRow = await this.prisma.workoutLog.findFirst({
      where: { userId, completedAt: { not: null } },
      select: { type: true, completedAt: true, durationSeconds: true },
      orderBy: { completedAt: 'desc' },
    });

    return {
      user: {
        name: user.name,
        ageYears: ageYearsFromDob(user.dateOfBirth),
        sex: user.sex,
      },
      focus,
      window: pickWindow(now),
      today: {
        sleepScore: todayRow?.sleepScore ?? null,
        sleepDurationMinutes: todayRow?.sleepDurationMinutes ?? null,
        readinessScore: todayRow?.recoveryScore ?? null,
        readinessCalibrating: rhrSamples.length < 3 || hrvSamples.length < 3,
        effortScore: todayRow?.effortScore ?? null,
        effortEarnedMinutes: todayRow?.effortEarnedMinutes ?? null,
        // Personalised target lives client-side in fitness-core; we don't
        // recompute it here (no need — the model gets the raw earned vs
        // recent baseline). Keep the field present but null-by-default
        // so the prompt builder still has a slot if we want it later.
        effortTargetMinutes: null,
        restingHRBpm: todayRow?.heartRateResting ?? null,
        hrvRmssdMs: todayRow?.hrvRmssd ?? null,
      },
      baselines: {
        rhrBaseline7d: average(rhrSamples),
        hrvBaseline7d: average(hrvSamples),
        sleepScore7dAvg: average(sleepSamples),
      },
      recentLoad: {
        decayedLoad,
        last3DaysEarned,
      },
      // Today's planned session resolution would couple us to the coach
      // service; defer to a follow-up if user value is clear after first
      // testing on device. For now insights are framed around recovery
      // state + recent load.
      plannedToday: null,
      lastWorkout: lastWorkoutRow?.completedAt
        ? {
            type: lastWorkoutRow.type,
            completedAt: lastWorkoutRow.completedAt.toISOString(),
            durationMinutes: Math.round((lastWorkoutRow.durationSeconds ?? 0) / 60),
          }
        : null,
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  // Claude call
  // ──────────────────────────────────────────────────────────────────────

  private async callLLM(input: InsightPromptInput): Promise<InsightOutput> {
    const tool: Anthropic.Messages.Tool = {
      name: 'submit_insight',
      description:
        'Submit the structured Today-tab insight (headline + body + inputs).',
      input_schema: INSIGHT_TOOL_SCHEMA,
    };

    const messages: Anthropic.Messages.MessageParam[] = [
      {
        role: 'user',
        content: buildUserPrompt(input),
      },
    ];

    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: [tool],
        tool_choice: { type: 'tool', name: 'submit_insight' },
        messages,
      });

      this.logger.info(
        {
          attempt,
          stopReason: response.stop_reason,
          inputTokens: response.usage?.input_tokens,
          outputTokens: response.usage?.output_tokens,
        },
        'Insight call complete',
      );

      const toolUse = response.content.find(
        (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use',
      );
      if (!toolUse) {
        throw new InsightsError('Insight response missing tool call', 502);
      }

      // Window comes from the input — the model shouldn't be allowed to
      // override it. Same for generatedAt; we stamp it server-side.
      const candidate = {
        ...(toolUse.input as object),
        window: input.window,
        generatedAt: this.now().toISOString(),
      };

      const parsed = InsightOutputSchema.safeParse(candidate);
      if (parsed.success) return parsed.data;

      const flat = parsed.error.flatten();
      this.logger.warn(
        {
          attempt,
          fieldErrors: flat.fieldErrors,
          formErrors: flat.formErrors,
        },
        'Insight output failed Zod validation',
      );

      if (attempt === 0) {
        const issuesText = parsed.error.errors
          .map((e) => `- ${e.path.join('.')}: ${e.message}`)
          .join('\n');
        messages.push({ role: 'assistant', content: response.content });
        messages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: toolUse.id,
              is_error: true,
              content:
                `The submitted insight failed schema validation. Issues:\n${issuesText}\n\n` +
                `Please call submit_insight again with corrected data.`,
            },
          ],
        });
        continue;
      }

      throw new InsightsError(
        `Insight returned invalid payload after retry: ${JSON.stringify(flat)}`,
        422,
      );
    }

    throw new InsightsError('Insight call exhausted retries', 500);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function isoDay(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function pickWindow(d: Date): InsightWindow {
  const h = d.getHours();
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function ageYearsFromDob(dob: Date): number {
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

// ──────────────────────────────────────────────────────────────────────────
// Prompts
// ──────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert fitness and recovery coach producing a single short, actionable Today-tab insight for the user.

Voice: direct, second-person, encouraging without sycophancy. Like a knowledgeable coach who knows the user's last week of data and respects their time. No emojis. No exclamation points. No corporate "Great job!" tone.

Format you return via the submit_insight tool:
- headline: ≤ 90 characters, one sentence, no period at the end. Captures the day's most important takeaway.
- body: 2–3 sentences. Explain WHY based on the inputs and what to actually DO today. Reference specific numbers from the data (e.g. "HRV 71 vs 7-day baseline 67"). Don't repeat the headline.
- inputs: 2–4 short bullet labels naming the inputs that drove this brief — e.g. "Sleep score 79", "HRV 71 ms (baseline 67)", "3-day load 124 min (decayed)". These are surfaced in the UI for transparency. Do NOT invent numbers — only cite values that appear in the structured input you receive.

Hard rules:
- Never recommend medical action or drug doses.
- Never invent metrics that aren't in the input. If a value is null, don't reference it.
- If readinessCalibrating is true, acknowledge that the recovery signal is still calibrating and lean on sleep / load instead.
- Match the focus: 'general' = whole day, 'biocharge' = readiness/recovery, 'sleep' = sleep quality, 'effort' = training load.`;

function buildUserPrompt(input: InsightPromptInput): string {
  const t = input.today;
  const b = input.baselines;
  const l = input.recentLoad;
  return `Generate a ${input.focus} insight for ${input.user.name} (${input.user.sex}, ${input.user.ageYears}y) for the ${input.window} window.

Today:
- Sleep score: ${fmt(t.sleepScore)}, duration: ${fmt(t.sleepDurationMinutes)} min
- Readiness/BioCharge: ${fmt(t.readinessScore)} (calibrating: ${t.readinessCalibrating})
- Effort: ${fmt(t.effortScore)} score, ${fmt(t.effortEarnedMinutes)} earned min
- Resting HR: ${fmt(t.restingHRBpm)} bpm, HRV: ${fmt(t.hrvRmssdMs)} ms

7-day baselines (excluding today):
- RHR: ${fmt(b.rhrBaseline7d, 1)}, HRV: ${fmt(b.hrvBaseline7d, 1)}, Sleep score: ${fmt(b.sleepScore7dAvg, 0)}

Recent training load:
- Last 3 days earned-effort minutes: [${l.last3DaysEarned.map((v) => v.toFixed(0)).join(', ')}]
- Decayed load: ${l.decayedLoad?.toFixed(1) ?? 'n/a'} min

Last workout: ${input.lastWorkout ? `${input.lastWorkout.type}, ${input.lastWorkout.durationMinutes} min, completed ${input.lastWorkout.completedAt}` : 'none recent'}

Submit your insight via the submit_insight tool. Keep the headline tight and the body specific to these numbers.`;
}

function fmt(v: number | null, digits = 0): string {
  if (v == null) return 'n/a';
  return v.toFixed(digits);
}

// JSON schema mirror of InsightOutputSchema (sans window/generatedAt — we
// inject those server-side so the model can't drift them).
const INSIGHT_TOOL_SCHEMA: Anthropic.Messages.Tool.InputSchema = {
  type: 'object',
  properties: {
    headline: { type: 'string', minLength: 1, maxLength: 120 },
    body: { type: 'string', minLength: 1, maxLength: 800 },
    inputs: {
      type: 'array',
      minItems: 2,
      maxItems: 6,
      items: { type: 'string', minLength: 1, maxLength: 80 },
    },
  },
  required: ['headline', 'body', 'inputs'],
};
