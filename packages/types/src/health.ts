import { z } from 'zod';

export const HeartRateZoneSchema = z.enum(['rest', 'fat_burn', 'cardio', 'peak', 'max']);

export const HeartRateSampleSchema = z.object({
  timestamp: z.coerce.date(),
  bpm: z.number().int().positive().max(300),
  zone: HeartRateZoneSchema,
});

export const DailyHealthSchema = z.object({
  id: z.string(),
  date: z.coerce.date(),
  userId: z.string(),
  steps: z.number().int().nonnegative().nullable(),
  caloriesActive: z.number().nonnegative().nullable(),
  caloriesTotal: z.number().nonnegative().nullable(),
  heartRateResting: z.number().int().positive().nullable(),
  hrvRmssd: z.number().nonnegative().nullable(),
  sleepDurationMinutes: z.number().int().nonnegative().nullable(),
  sleepScore: z.number().min(0).max(100).nullable(),
  recoveryScore: z.number().min(0).max(100).nullable(),
  effortScore: z.number().min(0).max(100).nullable(),
  effortEarnedMinutes: z.number().nonnegative().nullable(),
  dailyTrimp: z.number().nonnegative().nullable(),
});

// --- Input schemas for CRUD operations ---

export const UpsertDailyHealthInputSchema = z.object({
  date: z.coerce.date(),
  steps: z.number().int().nonnegative().nullable().optional(),
  caloriesActive: z.number().nonnegative().nullable().optional(),
  caloriesTotal: z.number().nonnegative().nullable().optional(),
  heartRateResting: z.number().int().positive().nullable().optional(),
  hrvRmssd: z.number().nonnegative().nullable().optional(),
  sleepDurationMinutes: z.number().int().nonnegative().nullable().optional(),
  sleepScore: z.number().min(0).max(100).nullable().optional(),
  recoveryScore: z.number().min(0).max(100).nullable().optional(),
  effortScore: z.number().min(0).max(100).nullable().optional(),
  effortEarnedMinutes: z.number().nonnegative().nullable().optional(),
  dailyTrimp: z.number().nonnegative().nullable().optional(),
});

export const BulkUpsertDailyHealthInputSchema = z.object({
  entries: z.array(UpsertDailyHealthInputSchema).min(1).max(90),
});

export type HeartRateZone = z.infer<typeof HeartRateZoneSchema>;
export type HeartRateSample = z.infer<typeof HeartRateSampleSchema>;
export type DailyHealth = z.infer<typeof DailyHealthSchema>;
export type UpsertDailyHealthInput = z.infer<typeof UpsertDailyHealthInputSchema>;
export type BulkUpsertDailyHealthInput = z.infer<typeof BulkUpsertDailyHealthInputSchema>;
