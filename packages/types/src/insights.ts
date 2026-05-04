import { z } from 'zod';

// ──────────────────────────────────────────────────────────────────────────
// AI insights — short LLM-generated briefs surfaced on the Today tab
// (`/insights/today?focus=…`). Server-side cached per
// (userId, focus, dateBucket, lastEventStamp) so refreshes are free until
// either the day rolls over or a workout/health-sync moves the inputs.
// ──────────────────────────────────────────────────────────────────────────

export const InsightFocusSchema = z.enum([
  /** Default Today-tab brief — overall recovery + day plan. */
  'general',
  /** BioCharge sub-tab — readiness drilldown. */
  'biocharge',
  /** Sleep sub-tab — quality + regularity coaching. */
  'sleep',
  /** Effort sub-tab — load + fitness trend coaching. */
  'effort',
]);
export type InsightFocus = z.infer<typeof InsightFocusSchema>;

export const InsightWindowSchema = z.enum(['morning', 'afternoon', 'evening']);
export type InsightWindow = z.infer<typeof InsightWindowSchema>;

/**
 * Output shape returned to the client. Mirrors the existing AIInsight
 * mock the AIInsightCard already consumes (headline + body + inputs +
 * window + generatedAt).
 */
export const InsightOutputSchema = z.object({
  headline: z.string().min(1).max(120),
  body: z.string().min(1).max(800),
  inputs: z.array(z.string().min(1).max(80)).min(2).max(6),
  window: InsightWindowSchema,
  generatedAt: z.string().datetime(),
});
export type InsightOutput = z.infer<typeof InsightOutputSchema>;

/**
 * Snapshot of the user state we feed Claude. All fields nullable so we
 * can run with partial data — the prompt builder substitutes "n/a" and
 * the model is told not to fabricate around missing inputs.
 */
export const InsightPromptInputSchema = z.object({
  user: z.object({
    name: z.string(),
    ageYears: z.number().int().positive(),
    sex: z.enum(['male', 'female']),
  }),
  focus: InsightFocusSchema,
  window: InsightWindowSchema,
  today: z.object({
    sleepScore: z.number().nullable(),
    sleepDurationMinutes: z.number().nullable(),
    readinessScore: z.number().nullable(),
    readinessCalibrating: z.boolean(),
    effortScore: z.number().nullable(),
    effortEarnedMinutes: z.number().nullable(),
    effortTargetMinutes: z.number().nullable(),
    restingHRBpm: z.number().nullable(),
    hrvRmssdMs: z.number().nullable(),
  }),
  baselines: z.object({
    rhrBaseline7d: z.number().nullable(),
    hrvBaseline7d: z.number().nullable(),
    sleepScore7dAvg: z.number().nullable(),
  }),
  recentLoad: z.object({
    /** Exponentially-decayed earned-effort minutes over last 3 days. */
    decayedLoad: z.number().nullable(),
    last3DaysEarned: z.array(z.number()),
  }),
  plannedToday: z
    .object({
      sessionName: z.string(),
      exerciseCount: z.number().int().nonnegative(),
    })
    .nullable(),
  lastWorkout: z
    .object({
      type: z.string(),
      completedAt: z.string().datetime(),
      durationMinutes: z.number(),
    })
    .nullable(),
});
export type InsightPromptInput = z.infer<typeof InsightPromptInputSchema>;
