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
  strainScore: z.number().min(0).max(21).nullable(),
});

export type HeartRateZone = z.infer<typeof HeartRateZoneSchema>;
export type HeartRateSample = z.infer<typeof HeartRateSampleSchema>;
export type DailyHealth = z.infer<typeof DailyHealthSchema>;
