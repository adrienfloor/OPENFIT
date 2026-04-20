import { z } from 'zod';
import { HeartRateSampleSchema } from './health';

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

export const WorkoutLogSchema = z.object({
  id: z.string(),
  userId: z.string(),
  sessionId: z.string().nullable(),
  startedAt: z.coerce.date(),
  completedAt: z.coerce.date().nullable(),
  heartRateData: z.array(HeartRateSampleSchema),
  exerciseLogs: z.array(ExerciseLogSchema),
});

export type MuscleGroup = z.infer<typeof MuscleGroupSchema>;
export type Equipment = z.infer<typeof EquipmentSchema>;
export type Exercise = z.infer<typeof ExerciseSchema>;
export type PlannedSet = z.infer<typeof PlannedSetSchema>;
export type PlannedExercise = z.infer<typeof PlannedExerciseSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type Week = z.infer<typeof WeekSchema>;
export type Program = z.infer<typeof ProgramSchema>;
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

export const CreateWorkoutLogInputSchema = z.object({
  sessionId: z.string().nullable().optional(),
  startedAt: z.coerce.date(),
  completedAt: z.coerce.date().nullable().optional(),
  exerciseLogs: z.array(LogExerciseInputSchema).min(1),
  heartRateSamples: z.array(HeartRateSampleSchema).optional(),
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
export type CreateWorkoutLogInput = z.infer<typeof CreateWorkoutLogInputSchema>;

export type CompletedSet = z.infer<typeof CompletedSetSchema>;
export type ExerciseLog = z.infer<typeof ExerciseLogSchema>;
export type WorkoutLog = z.infer<typeof WorkoutLogSchema>;
