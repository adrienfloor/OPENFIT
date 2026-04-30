import { z } from 'zod';
import { EquipmentSchema, MuscleGroupSchema, WorkoutTypeSchema } from './workout';

// ──────────────────────────────────────────────────────────────────────────
// Coaching profile — captured once at onboarding, edited from settings.
// Stored as a JSON column on User so it can evolve without DB migrations.
// ──────────────────────────────────────────────────────────────────────────

export const TrainingGoalSchema = z.enum([
  'aesthetics',
  'strength',
  'performance',
  'hybrid',
  'fat_loss',
]);

export const ExperienceLevelSchema = z.enum(['beginner', 'intermediate', 'advanced']);

export const SecondarySportTypeSchema = z.enum(['jiu_jitsu', 'run']);

export const SecondarySportSchema = z.object({
  type: SecondarySportTypeSchema,
  sessionsPerWeek: z.number().int().min(0).max(14),
  avgDurationMinutes: z.number().int().positive(),
});

export const CoachingEmphasisSchema = z.enum([
  'chest',
  'back',
  'shoulders',
  'arms',
  'legs',
  'glutes',
  'core',
]);

export const CoachingProfileSchema = z.object({
  goal: TrainingGoalSchema,
  experience: ExperienceLevelSchema,
  gymSessionsPerWeek: z.number().int().min(2).max(6),
  sessionDurationMinutes: z.number().int().min(30).max(120),
  availableEquipment: z.array(EquipmentSchema).min(1),
  emphasis: z.array(CoachingEmphasisSchema).default([]),
  secondarySports: z.array(SecondarySportSchema).default([]),
  injuriesNotes: z.string().max(500).optional(),
});

// ──────────────────────────────────────────────────────────────────────────
// Mesocycle phases — drives both LLM prompt structure and the deterministic
// daily-adjustment rule engine.
// ──────────────────────────────────────────────────────────────────────────

export const MesocyclePhaseSchema = z.enum([
  'accumulation',
  'intensification',
  'deload',
  'peak',
]);

// ──────────────────────────────────────────────────────────────────────────
// Generated program — the structured shape the LLM must return. Mirrors the
// existing Program/Week/Session/PlannedExercise/PlannedSet hierarchy but
// adds coach-specific metadata (phase, rationale, loadPctOf1RM) that the
// resolver strips before persisting as a regular Program.
// ──────────────────────────────────────────────────────────────────────────

export const CoachPlannedSetSchema = z.object({
  reps: z.number().int().positive(),
  /**
   * Load as a fraction of estimated 1RM (0–1). Resolved to absolute kg by the
   * mobile app using the user's logged history per exercise. Omitted when no
   * 1RM history exists — RPE drives the prescription instead.
   */
  loadPctOf1RM: z.number().min(0).max(1).optional(),
  rpe: z.number().min(1).max(10),
  restSeconds: z.number().int().nonnegative(),
});

export const CoachPlannedExerciseSchema = z.object({
  /** Must be an ID from the exercise library passed into the prompt. */
  exerciseId: z.string().min(1),
  sets: z.array(CoachPlannedSetSchema).min(1).max(8),
  /** One sentence, plain language — surfaced as a tooltip in the UI. */
  rationale: z.string().min(1).max(200),
});

export const CoachSessionSchema = z.object({
  name: z.string().min(1).max(60),
  focus: z.string().min(1).max(120),
  estimatedDurationMinutes: z.number().int().positive(),
  exercises: z.array(CoachPlannedExerciseSchema).min(3).max(8),
});

export const CoachWeekSchema = z.object({
  weekNumber: z.number().int().positive(),
  phase: MesocyclePhaseSchema,
  /** Plain-language summary of what changes this week vs the last. */
  summary: z.string().min(1).max(200),
  sessions: z.array(CoachSessionSchema).min(1),
});

export const GeneratedProgramSchema = z.object({
  name: z.string().min(1).max(80),
  durationWeeks: z.number().int().min(3).max(8),
  /** Top-level explanation, ~3 sentences. */
  overview: z.string().min(1).max(600),
  weeks: z.array(CoachWeekSchema).min(3).max(8),
  assumptions: z.object({
    primaryGoal: TrainingGoalSchema,
    weeklyStrengthSessions: z.number().int().min(2).max(6),
    cardioLoadConsidered: z.boolean(),
    deloadStrategy: z.string().min(1).max(200),
  }),
});

// ──────────────────────────────────────────────────────────────────────────
// Inputs to the prompt builder. Kept separate from CoachingProfile because
// they're computed from recent activity, not stored on the user.
// ──────────────────────────────────────────────────────────────────────────

export const CoachUserSnapshotSchema = z.object({
  ageYears: z.number().int().positive(),
  weightKg: z.number().positive(),
  heightCm: z.number().positive(),
  sex: z.enum(['male', 'female']),
});

export const CoachRecentActivitySchema = z.object({
  strengthSessionsLast30d: z.number().int().nonnegative(),
  avgRpeLast30d: z.number().min(1).max(10).nullable(),
  runKmLast30d: z.number().nonnegative(),
  runSessionsLast30d: z.number().int().nonnegative(),
  jiuJitsuSessionsLast30d: z.number().int().nonnegative(),
  avgWeeklyEffortMinutes: z.number().nonnegative().nullable(),
  avgReadiness7d: z.number().min(0).max(100).nullable(),
  /** Acute:Chronic Workload Ratio over the last 28 days. */
  acwr: z.number().nonnegative().nullable(),
});

export const CoachTopSetSchema = z.object({
  exerciseId: z.string().min(1),
  exerciseName: z.string().min(1),
  bestReps: z.number().int().positive(),
  bestWeightKg: z.number().nonnegative(),
  estimated1RMKg: z.number().nonnegative(),
});

export const CoachExerciseLibraryEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  muscleGroups: z.array(MuscleGroupSchema).min(1),
  equipment: EquipmentSchema,
});

export const CoachPromptInputSchema = z.object({
  profile: CoachingProfileSchema,
  user: CoachUserSnapshotSchema,
  recent: CoachRecentActivitySchema,
  topSets: z.array(CoachTopSetSchema),
  exerciseLibrary: z.array(CoachExerciseLibraryEntrySchema).min(1),
});

// ──────────────────────────────────────────────────────────────────────────
// Daily adjustment — the inputs and outputs of the rule engine. No LLM in
// the v1 hot path; the rule engine returns both an adjusted session and a
// short reason string for the UI banner.
// ──────────────────────────────────────────────────────────────────────────

export const CoachAdjustmentContextSchema = z.object({
  readiness: z.number().min(0).max(100),
  phase: MesocyclePhaseSchema,
  /** Exponentially-decayed sum of recent earned effort minutes. */
  recentLoad: z.number().nonnegative(),
});

export const CoachAdjustmentResultSchema = z.object({
  session: CoachSessionSchema,
  /** Short, user-facing explanation. ≤ 120 chars. */
  reason: z.string().min(1).max(120),
  /** Volume multiplier actually applied (1.0 = unchanged). */
  volumeMultiplier: z.number().positive(),
});

// ──────────────────────────────────────────────────────────────────────────
// Type exports
// ──────────────────────────────────────────────────────────────────────────

export type TrainingGoal = z.infer<typeof TrainingGoalSchema>;
export type ExperienceLevel = z.infer<typeof ExperienceLevelSchema>;
export type SecondarySportType = z.infer<typeof SecondarySportTypeSchema>;
export type SecondarySport = z.infer<typeof SecondarySportSchema>;
export type CoachingEmphasis = z.infer<typeof CoachingEmphasisSchema>;
export type CoachingProfile = z.infer<typeof CoachingProfileSchema>;
export type MesocyclePhase = z.infer<typeof MesocyclePhaseSchema>;
export type CoachPlannedSet = z.infer<typeof CoachPlannedSetSchema>;
export type CoachPlannedExercise = z.infer<typeof CoachPlannedExerciseSchema>;
export type CoachSession = z.infer<typeof CoachSessionSchema>;
export type CoachWeek = z.infer<typeof CoachWeekSchema>;
export type GeneratedProgram = z.infer<typeof GeneratedProgramSchema>;
export type CoachUserSnapshot = z.infer<typeof CoachUserSnapshotSchema>;
export type CoachRecentActivity = z.infer<typeof CoachRecentActivitySchema>;
export type CoachTopSet = z.infer<typeof CoachTopSetSchema>;
export type CoachExerciseLibraryEntry = z.infer<typeof CoachExerciseLibraryEntrySchema>;
export type CoachPromptInput = z.infer<typeof CoachPromptInputSchema>;
export type CoachAdjustmentContext = z.infer<typeof CoachAdjustmentContextSchema>;
export type CoachAdjustmentResult = z.infer<typeof CoachAdjustmentResultSchema>;

// Re-export for convenience — secondary sports and workout types share an enum.
export { WorkoutTypeSchema };
