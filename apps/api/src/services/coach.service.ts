import type { PrismaClient } from '@prisma/client';
import Anthropic from '@anthropic-ai/sdk';
import {
  CoachAdjustmentContextSchema,
  CoachingProfileSchema,
  GeneratedProgramSchema,
  type CoachAdjustmentContext,
  type CoachAdjustmentResult,
  type CoachExerciseLibraryEntry,
  type CoachPromptInput,
  type CoachRecentActivity,
  type CoachTopSet,
  type CoachUserSnapshot,
  type CoachingProfile,
  type CreateProgramInput,
  type GeneratedProgram,
} from '@openfit/types';
import { adjustSession, buildCoachPrompt } from '@openfit/fitness-core';
import { WorkoutService, WorkoutError } from './workout.service.js';

export class CoachError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'CoachError';
  }
}

export const COACH_MODEL = 'claude-sonnet-4-6';

/**
 * Anthropic SDK shape needed by CoachService — narrowed so tests can pass a
 * lightweight mock instead of the full SDK.
 */
export interface AnthropicClient {
  messages: {
    create: (params: Anthropic.Messages.MessageCreateParamsNonStreaming) => Promise<Anthropic.Messages.Message>;
  };
}

/** Lightweight logger interface — Fastify's logger satisfies this. Optional. */
export interface CoachLogger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

interface CoachServiceDeps {
  prisma: PrismaClient;
  anthropic: AnthropicClient;
  workouts: WorkoutService;
  /** Override for tests / cost control. Default `claude-sonnet-4-6`. */
  model?: string;
  /** Optional logger; falls back to console for visibility during dev. */
  logger?: CoachLogger;
}

export class CoachService {
  private readonly prisma: PrismaClient;
  private readonly anthropic: AnthropicClient;
  private readonly workouts: WorkoutService;
  private readonly model: string;
  private readonly logger: CoachLogger;

  constructor(deps: CoachServiceDeps) {
    this.prisma = deps.prisma;
    this.anthropic = deps.anthropic;
    this.workouts = deps.workouts;
    this.model = deps.model ?? COACH_MODEL;
    this.logger = deps.logger ?? console;
  }

  // ──────────────────────────────────────────────────────────────────────
  // Profile persistence
  // ──────────────────────────────────────────────────────────────────────

  async saveCoachingProfile(userId: string, profile: CoachingProfile): Promise<CoachingProfile> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { coachingProfile: profile as unknown as object },
    });
    return profile;
  }

  async getCoachingProfile(userId: string): Promise<CoachingProfile | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { coachingProfile: true },
    });
    if (!user?.coachingProfile) return null;
    const parsed = CoachingProfileSchema.safeParse(user.coachingProfile);
    return parsed.success ? parsed.data : null;
  }

  // ──────────────────────────────────────────────────────────────────────
  // Program generation
  // ──────────────────────────────────────────────────────────────────────

  async generateProgram(
    userId: string,
    profile: CoachingProfile,
  ): Promise<{ programId: string; generated: GeneratedProgram }> {
    const promptInput = await this.gatherPromptInput(userId, profile);
    const generated = await this.callLLMForProgram(promptInput);

    const createInput = resolveGeneratedProgram(generated, promptInput.topSets);
    const program = await this.workouts.createProgram(userId, createInput);

    await this.prisma.programGeneration.create({
      data: {
        programId: program.id,
        userId,
        generated: generated as unknown as object,
        promptInput: promptInput as unknown as object,
        model: this.model,
      },
    });

    return { programId: program.id, generated };
  }

  /**
   * Builds the LLM input from current DB state. Pure data assembly — split
   * out so it can be unit-tested without mocking Anthropic.
   */
  async gatherPromptInput(
    userId: string,
    profile: CoachingProfile,
  ): Promise<CoachPromptInput> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { dateOfBirth: true, weightKg: true, heightCm: true, sex: true },
    });
    if (!user) throw new CoachError('User not found', 404);

    const userSnapshot: CoachUserSnapshot = {
      ageYears: ageFromDOB(user.dateOfBirth),
      weightKg: user.weightKg,
      heightCm: user.heightCm,
      sex: user.sex,
    };

    const [recent, topSets, exerciseLibrary] = await Promise.all([
      this.computeRecentActivity(userId),
      this.computeTopSets(userId),
      this.loadExerciseLibrary(profile.availableEquipment),
    ]);

    return {
      profile,
      user: userSnapshot,
      recent,
      topSets,
      exerciseLibrary,
    };
  }

  private async computeRecentActivity(userId: string): Promise<CoachRecentActivity> {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 30);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);

    const [strengthLogs, runLogs, bjjLogs, recentHealth] = await Promise.all([
      this.prisma.workoutLog.findMany({
        where: { userId, type: 'strength', startedAt: { gte: since } },
        include: { exerciseLogs: { include: { completedSets: true } } },
      }),
      this.prisma.workoutLog.findMany({
        where: { userId, type: 'run', startedAt: { gte: since } },
        select: { distanceMeters: true },
      }),
      this.prisma.workoutLog.count({
        where: { userId, type: 'jiu_jitsu', startedAt: { gte: since } },
      }),
      this.prisma.dailyHealth.findMany({
        where: { userId, date: { gte: sevenDaysAgo } },
        select: { recoveryScore: true, effortEarnedMinutes: true },
      }),
    ]);

    const allRpes: number[] = [];
    for (const log of strengthLogs) {
      for (const el of log.exerciseLogs) {
        for (const set of el.completedSets) {
          if (set.rpe != null) allRpes.push(set.rpe);
        }
      }
    }
    const avgRpe = allRpes.length > 0 ? avg(allRpes) : null;

    const totalRunMeters = runLogs.reduce((s, r) => s + (r.distanceMeters ?? 0), 0);

    const recoveries = recentHealth.map((h) => h.recoveryScore).filter((v): v is number => v != null);
    const avgReadiness7d = recoveries.length > 0 ? avg(recoveries) : null;

    const efforts = recentHealth.map((h) => h.effortEarnedMinutes).filter((v): v is number => v != null);
    const avgWeeklyEffortMinutes = efforts.length > 0 ? avg(efforts) * 7 : null;

    // Naive ACWR: mean of last 7 days / mean of last 28 days. Returns null
    // when we don't have enough history; the prompt builder shows "unknown".
    const acwr = await this.computeACWR(userId);

    return {
      strengthSessionsLast30d: strengthLogs.length,
      avgRpeLast30d: avgRpe,
      runKmLast30d: totalRunMeters / 1000,
      runSessionsLast30d: runLogs.length,
      jiuJitsuSessionsLast30d: bjjLogs,
      avgWeeklyEffortMinutes,
      avgReadiness7d,
      acwr,
    };
  }

  private async computeACWR(userId: string): Promise<number | null> {
    const now = new Date();
    const acuteSince = new Date(now);
    acuteSince.setUTCDate(acuteSince.getUTCDate() - 7);
    const chronicSince = new Date(now);
    chronicSince.setUTCDate(chronicSince.getUTCDate() - 28);

    const records = await this.prisma.dailyHealth.findMany({
      where: { userId, date: { gte: chronicSince } },
      select: { date: true, effortEarnedMinutes: true },
    });
    if (records.length < 14) return null;

    const acute = records
      .filter((r) => r.date >= acuteSince)
      .map((r) => r.effortEarnedMinutes ?? 0);
    const chronic = records.map((r) => r.effortEarnedMinutes ?? 0);
    if (chronic.length === 0 || acute.length === 0) return null;

    const acuteMean = avg(acute);
    const chronicMean = avg(chronic);
    if (chronicMean === 0) return null;
    return acuteMean / chronicMean;
  }

  private async computeTopSets(userId: string): Promise<CoachTopSet[]> {
    // For each exercise, pull the heaviest completed set logged in the last
    // 90 days. Estimated 1RM via Epley: weight × (1 + reps / 30).
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 90);

    const sets = await this.prisma.completedSet.findMany({
      where: {
        exerciseLog: { workoutLog: { userId, startedAt: { gte: since } } },
      },
      include: {
        exerciseLog: { include: { exercise: true } },
      },
    });

    const bestPerExercise = new Map<string, CoachTopSet>();
    for (const s of sets) {
      const ex = s.exerciseLog.exercise;
      const est = s.weight * (1 + s.reps / 30);
      const current = bestPerExercise.get(ex.id);
      if (!current || est > current.estimated1RMKg) {
        bestPerExercise.set(ex.id, {
          exerciseId: ex.id,
          exerciseName: ex.name,
          bestReps: s.reps,
          bestWeightKg: s.weight,
          estimated1RMKg: est,
        });
      }
    }
    return [...bestPerExercise.values()];
  }

  /**
   * Loads exercises filtered to the user's available equipment so the LLM
   * literally cannot pick an exercise the user can't perform. The prompt
   * also names the whitelist explicitly as a belt-and-braces guard.
   */
  private async loadExerciseLibrary(
    availableEquipment: CoachingProfile['availableEquipment'],
  ): Promise<CoachExerciseLibraryEntry[]> {
    const exercises = await this.prisma.exercise.findMany({
      where: { equipment: { in: availableEquipment } },
      orderBy: { name: 'asc' },
    });
    return exercises.map((e) => ({
      id: e.id,
      name: e.name,
      muscleGroups: e.muscleGroups,
      equipment: e.equipment,
    }));
  }

  /**
   * Calls Claude with structured-output via the tool-use trick: a single
   * "submit_program" tool whose input_schema is the GeneratedProgram JSON
   * Schema. The model fills in the tool call instead of writing prose, and
   * we parse the tool input back through Zod for safety.
   *
   * One retry on validation failure with the parse error appended to the
   * conversation. Second failure throws CoachError(422).
   */
  private async callLLMForProgram(input: CoachPromptInput): Promise<GeneratedProgram> {
    const { system, user } = buildCoachPrompt(input);

    const tool: Anthropic.Messages.Tool = {
      name: 'submit_program',
      description: 'Submit the structured training program.',
      input_schema: GENERATED_PROGRAM_TOOL_SCHEMA,
    };

    const messages: Anthropic.Messages.MessageParam[] = [{ role: 'user', content: user }];

    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await this.anthropic.messages.create({
        model: this.model,
        // Raised from 8k after observing a 5-week × 4-session program get
        // truncated mid-`weeks`, leaving the SDK with a partial tool input
        // (no `weeks` key) that failed Zod with "Required".
        max_tokens: 16384,
        system,
        tools: [tool],
        tool_choice: { type: 'tool', name: 'submit_program' },
        messages,
      });

      this.logger.info(
        {
          attempt,
          stopReason: response.stop_reason,
          inputTokens: response.usage?.input_tokens,
          outputTokens: response.usage?.output_tokens,
        },
        'Coach LLM call complete',
      );

      const toolUse = response.content.find(
        (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use',
      );
      if (!toolUse) {
        throw new CoachError('Coach response did not include a tool call', 502);
      }

      const parsed = GeneratedProgramSchema.safeParse(toolUse.input);
      if (parsed.success) return parsed.data;

      // Log the actual validation failure so we can debug what the model
      // produced. Truncate the payload itself to keep logs sane.
      const flat = parsed.error.flatten();
      const payloadPreview = JSON.stringify(toolUse.input).slice(0, 2000);
      this.logger.warn(
        {
          attempt,
          stopReason: response.stop_reason,
          outputTokens: response.usage?.output_tokens,
          fieldErrors: flat.fieldErrors,
          formErrors: flat.formErrors,
          payloadPreview,
        },
        'Coach LLM output failed Zod validation',
      );

      if (attempt === 0) {
        // Append the failed attempt + error feedback and try one more time.
        // Use a verbose, prescriptive error message — flatten() alone often
        // doesn't tell the model where to look.
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
                `The submitted program failed schema validation. Issues:\n${issuesText}\n\n` +
                `Please call submit_program again with a corrected program. ` +
                `Pay special attention to: array length bounds (sessions/exercises/sets), ` +
                `string length limits, and that loadPctOf1RM is between 0 and 1.`,
            },
          ],
        });
        continue;
      }

      throw new CoachError(
        `Coach returned an invalid program after retry: ${JSON.stringify(flat)}`,
        422,
      );
    }

    throw new CoachError('Coach generation exhausted retries', 500);
  }

  // ──────────────────────────────────────────────────────────────────────
  // Daily session adjustment
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Adjusts a generated session for today using the deterministic rule
   * engine. Loads the original session from ProgramGeneration storage so
   * we can apply phase-aware logic (the persisted Program loses phase).
   */
  async adjustSessionForToday(
    userId: string,
    programId: string,
    weekNumber: number,
    sessionIndex: number,
    rawCtx: unknown,
  ): Promise<CoachAdjustmentResult> {
    const ctx = parseCtx(rawCtx);

    const generation = await this.prisma.programGeneration.findUnique({
      where: { programId },
    });
    if (!generation || generation.userId !== userId) {
      throw new CoachError('Generated program not found', 404);
    }
    const generated = GeneratedProgramSchema.safeParse(generation.generated);
    if (!generated.success) {
      throw new CoachError('Stored program is corrupt', 500);
    }

    const week = generated.data.weeks.find((w) => w.weekNumber === weekNumber);
    const session = week?.sessions[sessionIndex];
    if (!week || !session) throw new CoachError('Session not found in program', 404);

    return adjustSession(session, { ...ctx, phase: week.phase });
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Resolver: GeneratedProgram → CreateProgramInput
//
// Strips coach-only metadata (rationale, phase, summary) and resolves
// `loadPctOf1RM` into absolute kg using the user's estimated 1RM. Sets
// without a known 1RM keep their RPE prescription and weight is omitted.
// Exposed for testing.
// ──────────────────────────────────────────────────────────────────────────

export function resolveGeneratedProgram(
  generated: GeneratedProgram,
  topSets: CoachTopSet[],
): CreateProgramInput {
  const oneRMByExercise = new Map<string, number>();
  for (const t of topSets) oneRMByExercise.set(t.exerciseId, t.estimated1RMKg);

  return {
    name: generated.name,
    weeks: generated.weeks.map((w) => ({
      weekNumber: w.weekNumber,
      sessions: w.sessions.map((s) => ({
        name: `${s.name} — ${s.focus}`.slice(0, 200),
        exercises: s.exercises.map((ex) => ({
          exerciseId: ex.exerciseId,
          sets: ex.sets.map((set) => {
            const oneRM = oneRMByExercise.get(ex.exerciseId);
            const weight =
              set.loadPctOf1RM != null && oneRM != null
                ? roundToNearest(oneRM * set.loadPctOf1RM, 2.5)
                : undefined;
            return {
              reps: set.reps,
              ...(weight != null ? { weight } : {}),
              rpe: set.rpe,
              restSeconds: set.restSeconds,
            };
          }),
        })),
      })),
    })),
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function ageFromDOB(dob: Date): number {
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const m = now.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

function avg(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function roundToNearest(value: number, increment: number): number {
  return Math.round(value / increment) * increment;
}

function parseCtx(raw: unknown): CoachAdjustmentContext {
  const parsed = CoachAdjustmentContextSchema.safeParse(raw);
  if (!parsed.success) {
    throw new CoachError(
      `Invalid adjustment context: ${JSON.stringify(parsed.error.flatten())}`,
      400,
    );
  }
  return parsed.data;
}

// Re-export for routes
export { WorkoutError };

// ──────────────────────────────────────────────────────────────────────────
// JSON Schema for the Anthropic tool — kept hand-written (mirroring the
// Zod schema in @openfit/types) because zod-to-json-schema isn't a project
// dep and the schema is small enough to maintain manually. If GeneratedProgram
// changes, update both.
// ──────────────────────────────────────────────────────────────────────────

export const GENERATED_PROGRAM_TOOL_SCHEMA: Anthropic.Messages.Tool.InputSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', maxLength: 80 },
    durationWeeks: { type: 'integer', minimum: 3, maximum: 8 },
    overview: { type: 'string', maxLength: 600 },
    weeks: {
      type: 'array',
      minItems: 3,
      maxItems: 8,
      items: {
        type: 'object',
        properties: {
          weekNumber: { type: 'integer', minimum: 1 },
          phase: { type: 'string', enum: ['accumulation', 'intensification', 'deload', 'peak'] },
          summary: { type: 'string', maxLength: 200 },
          sessions: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', maxLength: 60 },
                focus: { type: 'string', maxLength: 120 },
                estimatedDurationMinutes: { type: 'integer', minimum: 1 },
                exercises: {
                  type: 'array',
                  minItems: 3,
                  maxItems: 8,
                  items: {
                    type: 'object',
                    properties: {
                      exerciseId: { type: 'string' },
                      sets: {
                        type: 'array',
                        minItems: 1,
                        maxItems: 8,
                        items: {
                          type: 'object',
                          properties: {
                            reps: { type: 'integer', minimum: 1 },
                            loadPctOf1RM: { type: 'number', minimum: 0, maximum: 1 },
                            rpe: { type: 'number', minimum: 1, maximum: 10 },
                            restSeconds: { type: 'integer', minimum: 0 },
                          },
                          required: ['reps', 'rpe', 'restSeconds'],
                        },
                      },
                      rationale: { type: 'string', maxLength: 200 },
                    },
                    required: ['exerciseId', 'sets', 'rationale'],
                  },
                },
              },
              required: ['name', 'focus', 'estimatedDurationMinutes', 'exercises'],
            },
          },
        },
        required: ['weekNumber', 'phase', 'summary', 'sessions'],
      },
    },
    assumptions: {
      type: 'object',
      properties: {
        primaryGoal: {
          type: 'string',
          enum: ['aesthetics', 'strength', 'performance', 'hybrid', 'fat_loss'],
        },
        weeklyStrengthSessions: { type: 'integer', minimum: 2, maximum: 6 },
        cardioLoadConsidered: { type: 'boolean' },
        deloadStrategy: { type: 'string', maxLength: 200 },
      },
      required: ['primaryGoal', 'weeklyStrengthSessions', 'cardioLoadConsidered', 'deloadStrategy'],
    },
  },
  required: ['name', 'durationWeeks', 'overview', 'weeks', 'assumptions'],
};
