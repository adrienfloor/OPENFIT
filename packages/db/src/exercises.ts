import type { MuscleGroup, Equipment } from '@prisma/client';

/**
 * Default exercise library for OpenFit.
 *
 * One canonical entry per movement. The first muscle group is treated as
 * the primary in the swap modal's section grouping. `equipment` is a
 * single value — multi-implement variants get separate rows (e.g. "Barbell
 * Bench Press" and "Dumbbell Bench Press" are two distinct exercises).
 *
 * `name` is the unique key. Adding new movements: append below; running
 * `npm run db:seed-exercises` will upsert without touching anything else.
 */
export interface ExerciseSeed {
  name: string;
  muscleGroups: MuscleGroup[];
  equipment: Equipment;
}

export const DEFAULT_EXERCISES: ExerciseSeed[] = [
  // ── Chest ────────────────────────────────────────────────────────────────
  { name: 'Barbell Bench Press', muscleGroups: ['chest', 'triceps', 'shoulders'], equipment: 'barbell' },
  { name: 'Incline Barbell Bench Press', muscleGroups: ['chest', 'shoulders', 'triceps'], equipment: 'barbell' },
  { name: 'Decline Barbell Bench Press', muscleGroups: ['chest', 'triceps'], equipment: 'barbell' },
  { name: 'Dumbbell Bench Press', muscleGroups: ['chest', 'triceps', 'shoulders'], equipment: 'dumbbell' },
  { name: 'Incline Dumbbell Bench Press', muscleGroups: ['chest', 'shoulders', 'triceps'], equipment: 'dumbbell' },
  { name: 'Dumbbell Fly', muscleGroups: ['chest'], equipment: 'dumbbell' },
  { name: 'Cable Crossover', muscleGroups: ['chest'], equipment: 'cable' },
  { name: 'Pec Deck', muscleGroups: ['chest'], equipment: 'machine' },
  { name: 'Machine Chest Press', muscleGroups: ['chest', 'triceps'], equipment: 'machine' },
  { name: 'Push-up', muscleGroups: ['chest', 'triceps', 'shoulders'], equipment: 'bodyweight' },
  { name: 'Dip', muscleGroups: ['chest', 'triceps'], equipment: 'bodyweight' },

  // ── Back ─────────────────────────────────────────────────────────────────
  { name: 'Deadlift', muscleGroups: ['back', 'glutes', 'hamstrings'], equipment: 'barbell' },
  { name: 'Sumo Deadlift', muscleGroups: ['back', 'glutes', 'quads'], equipment: 'barbell' },
  { name: 'Pull-up', muscleGroups: ['back', 'biceps'], equipment: 'bodyweight' },
  { name: 'Chin-up', muscleGroups: ['back', 'biceps'], equipment: 'bodyweight' },
  { name: 'Inverted Row', muscleGroups: ['back', 'biceps'], equipment: 'bodyweight' },
  { name: 'Barbell Row', muscleGroups: ['back', 'biceps'], equipment: 'barbell' },
  { name: 'Pendlay Row', muscleGroups: ['back', 'biceps'], equipment: 'barbell' },
  { name: 'T-Bar Row', muscleGroups: ['back', 'biceps'], equipment: 'barbell' },
  { name: 'One-Arm Dumbbell Row', muscleGroups: ['back', 'biceps'], equipment: 'dumbbell' },
  { name: 'Seated Cable Row', muscleGroups: ['back', 'biceps'], equipment: 'cable' },
  { name: 'Lat Pulldown', muscleGroups: ['back', 'biceps'], equipment: 'cable' },
  { name: 'Face Pull', muscleGroups: ['back', 'shoulders'], equipment: 'cable' },
  { name: 'Machine Row', muscleGroups: ['back', 'biceps'], equipment: 'machine' },

  // ── Shoulders ────────────────────────────────────────────────────────────
  { name: 'Overhead Press', muscleGroups: ['shoulders', 'triceps'], equipment: 'barbell' },
  { name: 'Push Press', muscleGroups: ['shoulders', 'triceps'], equipment: 'barbell' },
  { name: 'Dumbbell Shoulder Press', muscleGroups: ['shoulders', 'triceps'], equipment: 'dumbbell' },
  { name: 'Arnold Press', muscleGroups: ['shoulders', 'triceps'], equipment: 'dumbbell' },
  { name: 'Dumbbell Lateral Raise', muscleGroups: ['shoulders'], equipment: 'dumbbell' },
  { name: 'Cable Lateral Raise', muscleGroups: ['shoulders'], equipment: 'cable' },
  { name: 'Dumbbell Front Raise', muscleGroups: ['shoulders'], equipment: 'dumbbell' },
  { name: 'Reverse Fly', muscleGroups: ['shoulders', 'back'], equipment: 'dumbbell' },
  { name: 'Cable Reverse Fly', muscleGroups: ['shoulders', 'back'], equipment: 'cable' },
  { name: 'Upright Row', muscleGroups: ['shoulders'], equipment: 'barbell' },
  { name: 'Machine Shoulder Press', muscleGroups: ['shoulders', 'triceps'], equipment: 'machine' },

  // ── Biceps ───────────────────────────────────────────────────────────────
  { name: 'Barbell Curl', muscleGroups: ['biceps'], equipment: 'barbell' },
  { name: 'EZ-Bar Curl', muscleGroups: ['biceps'], equipment: 'barbell' },
  { name: 'Dumbbell Curl', muscleGroups: ['biceps'], equipment: 'dumbbell' },
  { name: 'Hammer Curl', muscleGroups: ['biceps', 'forearms'], equipment: 'dumbbell' },
  { name: 'Incline Dumbbell Curl', muscleGroups: ['biceps'], equipment: 'dumbbell' },
  { name: 'Concentration Curl', muscleGroups: ['biceps'], equipment: 'dumbbell' },
  { name: 'Preacher Curl', muscleGroups: ['biceps'], equipment: 'machine' },
  { name: 'Cable Curl', muscleGroups: ['biceps'], equipment: 'cable' },

  // ── Triceps ──────────────────────────────────────────────────────────────
  { name: 'Cable Tricep Pushdown', muscleGroups: ['triceps'], equipment: 'cable' },
  { name: 'Cable Rope Pushdown', muscleGroups: ['triceps'], equipment: 'cable' },
  { name: 'Close-Grip Bench Press', muscleGroups: ['triceps', 'chest'], equipment: 'barbell' },
  { name: 'Barbell Skull Crusher', muscleGroups: ['triceps'], equipment: 'barbell' },
  { name: 'Dumbbell Skull Crusher', muscleGroups: ['triceps'], equipment: 'dumbbell' },
  { name: 'Overhead Tricep Extension', muscleGroups: ['triceps'], equipment: 'dumbbell' },
  { name: 'Cable Overhead Tricep Extension', muscleGroups: ['triceps'], equipment: 'cable' },
  { name: 'Tricep Kickback', muscleGroups: ['triceps'], equipment: 'dumbbell' },
  { name: 'Diamond Push-up', muscleGroups: ['triceps', 'chest'], equipment: 'bodyweight' },
  { name: 'Bench Dip', muscleGroups: ['triceps'], equipment: 'bodyweight' },

  // ── Forearms ─────────────────────────────────────────────────────────────
  { name: 'Wrist Curl', muscleGroups: ['forearms'], equipment: 'barbell' },
  { name: 'Reverse Wrist Curl', muscleGroups: ['forearms'], equipment: 'barbell' },
  { name: "Farmer's Carry", muscleGroups: ['forearms', 'core'], equipment: 'dumbbell' },

  // ── Core ─────────────────────────────────────────────────────────────────
  { name: 'Plank', muscleGroups: ['core'], equipment: 'bodyweight' },
  { name: 'Side Plank', muscleGroups: ['core'], equipment: 'bodyweight' },
  { name: 'Hanging Leg Raise', muscleGroups: ['core'], equipment: 'bodyweight' },
  { name: 'Sit-up', muscleGroups: ['core'], equipment: 'bodyweight' },
  { name: 'Russian Twist', muscleGroups: ['core'], equipment: 'bodyweight' },
  { name: 'Cable Crunch', muscleGroups: ['core'], equipment: 'cable' },
  { name: 'Ab Wheel Rollout', muscleGroups: ['core'], equipment: 'other' },

  // ── Quads ────────────────────────────────────────────────────────────────
  { name: 'Barbell Back Squat', muscleGroups: ['quads', 'glutes', 'hamstrings'], equipment: 'barbell' },
  { name: 'Front Squat', muscleGroups: ['quads', 'glutes'], equipment: 'barbell' },
  { name: 'Hack Squat', muscleGroups: ['quads', 'glutes'], equipment: 'machine' },
  { name: 'Leg Press', muscleGroups: ['quads', 'glutes'], equipment: 'machine' },
  { name: 'Leg Extension', muscleGroups: ['quads'], equipment: 'machine' },
  { name: 'Bulgarian Split Squat', muscleGroups: ['quads', 'glutes'], equipment: 'dumbbell' },
  { name: 'Goblet Squat', muscleGroups: ['quads', 'glutes'], equipment: 'dumbbell' },
  { name: 'Walking Lunge', muscleGroups: ['quads', 'glutes', 'hamstrings'], equipment: 'dumbbell' },

  // ── Hamstrings ───────────────────────────────────────────────────────────
  { name: 'Romanian Deadlift', muscleGroups: ['hamstrings', 'glutes', 'back'], equipment: 'barbell' },
  { name: 'Stiff-Leg Deadlift', muscleGroups: ['hamstrings', 'glutes'], equipment: 'barbell' },
  { name: 'Single-Leg Romanian Deadlift', muscleGroups: ['hamstrings', 'glutes'], equipment: 'dumbbell' },
  { name: 'Lying Leg Curl', muscleGroups: ['hamstrings'], equipment: 'machine' },
  { name: 'Seated Leg Curl', muscleGroups: ['hamstrings'], equipment: 'machine' },
  { name: 'Glute Ham Raise', muscleGroups: ['hamstrings', 'glutes'], equipment: 'bodyweight' },

  // ── Glutes ───────────────────────────────────────────────────────────────
  { name: 'Hip Thrust', muscleGroups: ['glutes', 'hamstrings'], equipment: 'barbell' },
  { name: 'Glute Bridge', muscleGroups: ['glutes', 'hamstrings'], equipment: 'barbell' },
  { name: 'Cable Pull-Through', muscleGroups: ['glutes', 'hamstrings'], equipment: 'cable' },
  { name: 'Machine Hip Abduction', muscleGroups: ['glutes'], equipment: 'machine' },

  // ── Calves ───────────────────────────────────────────────────────────────
  { name: 'Standing Calf Raise', muscleGroups: ['calves'], equipment: 'machine' },
  { name: 'Seated Calf Raise', muscleGroups: ['calves'], equipment: 'machine' },
  { name: 'Calf Press on Leg Press', muscleGroups: ['calves'], equipment: 'machine' },
  { name: 'Dumbbell Calf Raise', muscleGroups: ['calves'], equipment: 'dumbbell' },

  // ── Full body / Olympic / conditioning ──────────────────────────────────
  { name: 'Power Clean', muscleGroups: ['full_body'], equipment: 'barbell' },
  { name: 'Snatch', muscleGroups: ['full_body'], equipment: 'barbell' },
  { name: 'Thruster', muscleGroups: ['full_body'], equipment: 'barbell' },
  { name: 'Kettlebell Swing', muscleGroups: ['full_body', 'glutes'], equipment: 'kettlebell' },
  { name: 'Turkish Get-Up', muscleGroups: ['full_body', 'core'], equipment: 'kettlebell' },
  { name: 'Burpee', muscleGroups: ['full_body'], equipment: 'bodyweight' },
];
