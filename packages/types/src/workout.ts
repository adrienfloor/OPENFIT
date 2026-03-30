import { z } from 'zod';
import { HeartRateSampleSchema } from './health.js';

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
export type CompletedSet = z.infer<typeof CompletedSetSchema>;
export type ExerciseLog = z.infer<typeof ExerciseLogSchema>;
export type WorkoutLog = z.infer<typeof WorkoutLogSchema>;
