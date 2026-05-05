import { z } from 'zod';
import { HeartRateSampleSchema } from './health';

export const WorkoutTypeSchema = z.enum([
  'strength',
  'free',
  'martial_arts',
  'run',
  'bike',
  'swim',
  'hike',
  'walk',
  'other',
]);
export type WorkoutType = z.infer<typeof WorkoutTypeSchema>;

// "manual" = recorded inside OpenFit. "health_connect" = imported from
// another writer (Garmin Connect, Strava, etc.) via Health Connect.
export const WorkoutSourceSchema = z.enum(['manual', 'health_connect']);
export type WorkoutSource = z.infer<typeof WorkoutSourceSchema>;

// HC's three exercise-route states. Captured at import time.
// `DATA` — route already attached to the WorkoutLog as gpsPoints.
// `CONSENT_REQUIRED` — writer shared the route, but Google gates it
//   behind a per-session consent dialog (Zepp behaviour).
// `NO_DATA` — writer never shared a route (Garmin behaviour today).
export const HCRouteTypeSchema = z.enum(['DATA', 'CONSENT_REQUIRED', 'NO_DATA']);
export type HCRouteType = z.infer<typeof HCRouteTypeSchema>;

export const MuscleGroupSchema = z.enum([
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'forearms',
  'core',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'full_body',
]);

export const EquipmentSchema = z.enum([
  'barbell',
  'dumbbell',
  'kettlebell',
  'cable',
  'machine',
  'bodyweight',
  'resistance_band',
  'other',
]);

export const GPSPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  altitudeMeters: z.number(),
  timestamp: z.coerce.date(),
  speedMps: z.number().nonnegative(),
});

export const ExerciseSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(200),
  muscleGroups: z.array(MuscleGroupSchema).min(1),
  equipment: EquipmentSchema,
});

export const PlannedSetSchema = z.object({
  reps: z.number().int().positive(),
  weight: z.number().nonnegative().optional(),
  rpe: z.number().min(1).max(10).optional(),
  restSeconds: z.number().int().nonnegative(),
});

export const PlannedExerciseSchema = z.object({
  exercise: ExerciseSchema,
  sets: z.array(PlannedSetSchema).min(1),
});

export const SessionSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(200),
  exercises: z.array(PlannedExerciseSchema),
});

export const WeekSchema = z.object({
  weekNumber: z.number().int().positive(),
  sessions: z.array(SessionSchema),
});

export const ProgramSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string().min(1).max(200),
  weeks: z.array(WeekSchema).min(1),
});

export const CompletedSetSchema = z.object({
  reps: z.number().int().positive(),
  weight: z.number().nonnegative(),
  rpe: z.number().min(1).max(10).nullable(),
  restTaken: z.number().int().nonnegative(),
  heartRateAtCompletion: z.number().int().positive().nullable().optional(),
});

export const ExerciseLogSchema = z.object({
  exerciseId: z.string(),
  sets: z.array(CompletedSetSchema).min(1),
});

/**
 * Unified activity log — strength workouts, free HR-tracked sessions, and runs
 * all live here, distinguished by `type`. Run-specific fields and `gpsTrack`
 * are populated only when `type === 'run'`; `exerciseLogs` is only populated
 * for `type === 'strength'`. The `free` bucket holds any timed HR-tracked
 * session that isn't strength or run (jiu-jitsu, boxing, climbing, etc.).
 */
export const WorkoutLogSchema = z.object({
  id: z.string(),
  userId: z.string(),
  sessionId: z.string().nullable(),
  type: WorkoutTypeSchema,
  startedAt: z.coerce.date(),
  completedAt: z.coerce.date().nullable(),
  caloriesBurned: z.number().nonnegative().nullable(),
  distanceMeters: z.number().nonnegative().nullable(),
  durationSeconds: z.number().int().nonnegative().nullable(),
  avgPaceSecondsPerKm: z.number().positive().nullable(),
  bestPaceSecondsPerKm: z.number().positive().nullable(),
  elevationGainMeters: z.number().nonnegative().nullable(),
  // Provenance + dedup metadata (see Prisma schema for the full rationale).
  source: WorkoutSourceSchema,
  externalId: z.string().nullable(),
  dataOrigin: z.string().nullable(),
  linkedExternalId: z.string().nullable(),
  hcRouteType: HCRouteTypeSchema.nullable(),
  heartRateData: z.array(HeartRateSampleSchema),
  exerciseLogs: z.array(ExerciseLogSchema),
  gpsTrack: z.array(GPSPointSchema),
});

export type MuscleGroup = z.infer<typeof MuscleGroupSchema>;
export type Equipment = z.infer<typeof EquipmentSchema>;
export type Exercise = z.infer<typeof ExerciseSchema>;
export type PlannedSet = z.infer<typeof PlannedSetSchema>;
export type PlannedExercise = z.infer<typeof PlannedExerciseSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type Week = z.infer<typeof WeekSchema>;
export type Program = z.infer<typeof ProgramSchema>;
export type GPSPoint = z.infer<typeof GPSPointSchema>;

// --- Input schemas for CRUD operations ---

export const CreateExerciseInputSchema = z.object({
  name: z.string().min(1).max(200),
  muscleGroups: z.array(MuscleGroupSchema).min(1),
  equipment: EquipmentSchema,
});

export const CreatePlannedSetInputSchema = z.object({
  reps: z.number().int().positive(),
  weight: z.number().nonnegative().optional(),
  rpe: z.number().min(1).max(10).optional(),
  restSeconds: z.number().int().nonnegative(),
});

export const CreatePlannedExerciseInputSchema = z.object({
  exerciseId: z.string(),
  sets: z.array(CreatePlannedSetInputSchema).min(1),
});

export const CreateSessionInputSchema = z.object({
  name: z.string().min(1).max(200),
  exercises: z.array(CreatePlannedExerciseInputSchema),
});

export const CreateWeekInputSchema = z.object({
  weekNumber: z.number().int().positive(),
  sessions: z.array(CreateSessionInputSchema).min(1),
});

export const CreateProgramInputSchema = z.object({
  name: z.string().min(1).max(200),
  weeks: z.array(CreateWeekInputSchema).min(1),
});

export const UpdateProgramInputSchema = z.object({
  name: z.string().min(1).max(200).optional(),
});

export const LogCompletedSetInputSchema = z.object({
  setIndex: z.number().int().nonnegative(),
  reps: z.number().int().positive(),
  weight: z.number().nonnegative(),
  rpe: z.number().min(1).max(10).nullable().optional(),
  restTaken: z.number().int().nonnegative(),
  heartRateAtCompletion: z.number().int().positive().nullable().optional(),
});

export const LogExerciseInputSchema = z.object({
  exerciseId: z.string(),
  sets: z.array(LogCompletedSetInputSchema).min(1),
});

export const CreateGPSPointInputSchema = GPSPointSchema;

export const CreateWorkoutLogInputSchema = z
  .object({
    type: WorkoutTypeSchema.default('strength'),
    sessionId: z.string().nullable().optional(),
    startedAt: z.coerce.date(),
    completedAt: z.coerce.date().nullable().optional(),
    caloriesBurned: z.number().nonnegative().nullable().optional(),
    // Run-only fields
    distanceMeters: z.number().nonnegative().optional(),
    durationSeconds: z.number().int().nonnegative().optional(),
    avgPaceSecondsPerKm: z.number().positive().nullable().optional(),
    bestPaceSecondsPerKm: z.number().positive().nullable().optional(),
    elevationGainMeters: z.number().nonnegative().optional(),
    gpsPoints: z.array(CreateGPSPointInputSchema).optional(),
    // Strength-only fields
    exerciseLogs: z.array(LogExerciseInputSchema).optional().default([]),
    heartRateSamples: z.array(HeartRateSampleSchema).optional(),
    // Import provenance — set by the HC import service. Manual writes
    // omit these and the row defaults to source='manual'.
    source: WorkoutSourceSchema.optional().default('manual'),
    externalId: z.string().min(1).optional(),
    dataOrigin: z.string().min(1).optional(),
    hcRouteType: HCRouteTypeSchema.optional(),
  })
  .refine(
    // Manual strength entry must list its sets — that's the whole point.
    // HC-imported strength sessions (Zepp, Garmin, Coros, etc.) carry no
    // per-set data through the bridge, so we skip the check for them and
    // store the row with HR + duration + calories only.
    (data) =>
      data.type !== 'strength' ||
      data.source === 'health_connect' ||
      data.exerciseLogs.length > 0,
    { message: 'Strength workouts require at least one exerciseLog', path: ['exerciseLogs'] },
  )
  .refine(
    (data) => data.source !== 'health_connect' || (data.externalId && data.dataOrigin),
    {
      message: 'Health Connect imports require externalId and dataOrigin',
      path: ['externalId'],
    },
  );

export const UpdateWorkoutLogInputSchema = z.object({
  // Reclassify a workout — useful for HC imports that came in as 'other'
  // or 'free' because the upstream writer (Zepp, Garmin, etc.) didn't
  // have a code for the actual activity (e.g. BJJ → OTHER_WORKOUT). The
  // user picks the right WorkoutType from the detail screen.
  type: WorkoutTypeSchema.optional(),
  completedAt: z.coerce.date().nullable().optional(),
  caloriesBurned: z.number().nonnegative().nullable().optional(),
  distanceMeters: z.number().nonnegative().optional(),
  durationSeconds: z.number().int().nonnegative().optional(),
  avgPaceSecondsPerKm: z.number().positive().nullable().optional(),
  bestPaceSecondsPerKm: z.number().positive().nullable().optional(),
  elevationGainMeters: z.number().nonnegative().optional(),
  // Lazy-loaded GPS route — populated when the user grants per-session
  // consent on an HC-imported run. Replaces any existing gpsPoints on
  // the log (HC routes are immutable once consented).
  gpsPoints: z.array(CreateGPSPointInputSchema).optional(),
  // After a successful consent fetch, the client flips this to 'DATA'
  // so the detail screen stops showing the load button.
  hcRouteType: HCRouteTypeSchema.optional(),
});

export type CreateExerciseInput = z.infer<typeof CreateExerciseInputSchema>;
export type CreatePlannedSetInput = z.infer<typeof CreatePlannedSetInputSchema>;
export type CreatePlannedExerciseInput = z.infer<typeof CreatePlannedExerciseInputSchema>;
export type CreateSessionInput = z.infer<typeof CreateSessionInputSchema>;
export type CreateWeekInput = z.infer<typeof CreateWeekInputSchema>;
export type CreateProgramInput = z.infer<typeof CreateProgramInputSchema>;
export type UpdateProgramInput = z.infer<typeof UpdateProgramInputSchema>;
export type LogCompletedSetInput = z.infer<typeof LogCompletedSetInputSchema>;
export type LogExerciseInput = z.infer<typeof LogExerciseInputSchema>;
export type CreateGPSPointInput = z.infer<typeof CreateGPSPointInputSchema>;
export type CreateWorkoutLogInput = z.infer<typeof CreateWorkoutLogInputSchema>;
export type UpdateWorkoutLogInput = z.infer<typeof UpdateWorkoutLogInputSchema>;

export type CompletedSet = z.infer<typeof CompletedSetSchema>;
export type ExerciseLog = z.infer<typeof ExerciseLogSchema>;
export type WorkoutLog = z.infer<typeof WorkoutLogSchema>;
