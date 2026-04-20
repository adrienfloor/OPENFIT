import { z } from 'zod';
import { HeartRateSampleSchema } from './health.js';

export const GPSPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  altitudeMeters: z.number(),
  timestamp: z.coerce.date(),
  speedMps: z.number().nonnegative(),
});

export const RunSessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  startedAt: z.coerce.date(),
  completedAt: z.coerce.date().nullable(),
  distanceMeters: z.number().nonnegative(),
  durationSeconds: z.number().int().nonnegative(),
  avgPaceSecondsPerKm: z.number().positive().nullable(),
  bestPaceSecondsPerKm: z.number().positive().nullable(),
  elevationGainMeters: z.number().nonnegative(),
  heartRateData: z.array(HeartRateSampleSchema),
  gpsTrack: z.array(GPSPointSchema),
});

// --- Input schemas for CRUD operations ---

export const CreateGPSPointInputSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  altitudeMeters: z.number(),
  timestamp: z.coerce.date(),
  speedMps: z.number().nonnegative(),
});

export const CreateRunSessionInputSchema = z.object({
  startedAt: z.coerce.date(),
  completedAt: z.coerce.date().nullable().optional(),
  distanceMeters: z.number().nonnegative(),
  durationSeconds: z.number().int().nonnegative(),
  avgPaceSecondsPerKm: z.number().positive().nullable().optional(),
  bestPaceSecondsPerKm: z.number().positive().nullable().optional(),
  elevationGainMeters: z.number().nonnegative(),
  gpsPoints: z.array(CreateGPSPointInputSchema).optional(),
  heartRateSamples: z.array(HeartRateSampleSchema).optional(),
});

export const UpdateRunSessionInputSchema = z.object({
  completedAt: z.coerce.date().nullable().optional(),
  distanceMeters: z.number().nonnegative().optional(),
  durationSeconds: z.number().int().nonnegative().optional(),
  avgPaceSecondsPerKm: z.number().positive().nullable().optional(),
  bestPaceSecondsPerKm: z.number().positive().nullable().optional(),
  elevationGainMeters: z.number().nonnegative().optional(),
});

export type GPSPoint = z.infer<typeof GPSPointSchema>;
export type RunSession = z.infer<typeof RunSessionSchema>;
export type CreateGPSPointInput = z.infer<typeof CreateGPSPointInputSchema>;
export type CreateRunSessionInput = z.infer<typeof CreateRunSessionInputSchema>;
export type UpdateRunSessionInput = z.infer<typeof UpdateRunSessionInputSchema>;
