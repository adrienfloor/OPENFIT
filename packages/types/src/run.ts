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

export type GPSPoint = z.infer<typeof GPSPointSchema>;
export type RunSession = z.infer<typeof RunSessionSchema>;
