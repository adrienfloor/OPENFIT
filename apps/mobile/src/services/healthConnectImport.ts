/**
 * Imports completed workouts from Health Connect into OpenFit.
 *
 * Watches and other writers (Garmin Connect, Strava, Coros, Apple Watch via
 * a relay app, Polar, Suunto, etc.) deposit their finished sessions into
 * Health Connect's `ExerciseSession` table. We pull anything new since the
 * last watermark and POST a `WorkoutLog` per session, tagged with
 * `source='health_connect'` plus the upstream UID and writer package
 * name. The unique `(userId, externalId)` index makes re-syncs idempotent
 * — duplicate POSTs come back as 409 and we swallow them.
 *
 * Effort + BioCharge already absorb HR samples directly from HC, so the
 * only thing missing for non-OpenFit-recorded workouts was the
 * WorkoutLog row + History UI surface; this service fills that gap.
 *
 * Android only — Health Connect is Android-only.
 */
import { readRecords } from 'react-native-health-connect';
import type {
  ExerciseSessionRecord,
  HeartRateRecord,
  DistanceRecord,
  ActiveCaloriesBurnedRecord,
  ElevationGainedRecord,
} from 'react-native-health-connect/lib/typescript/types/records.types';
import axios from 'axios';
import type {
  CreateWorkoutLogInput,
  HeartRateSample,
  GPSPoint,
} from '@openfit/types';
import {
  calculateMaxHR,
  ageYearsFromDob,
  energyToKcal,
  lengthToMeters,
  locationsToGPSPoints,
  mapExerciseTypeToWorkoutType,
} from '@openfit/fitness-core';
import { apiClient } from './api';

const WATERMARK_KEY = 'openfit_hc_import_watermark';
const DEFAULT_LOOKBACK_DAYS = 30;

async function getSecureStore() {
  const mod = await import('expo-secure-store');
  return mod;
}

async function readWatermark(): Promise<Date> {
  try {
    const store = await getSecureStore();
    const raw = await store.getItemAsync(WATERMARK_KEY);
    if (raw) return new Date(raw);
  } catch {
    // fall through to default lookback
  }
  return new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * 86_400_000);
}

async function writeWatermark(date: Date): Promise<void> {
  try {
    const store = await getSecureStore();
    await store.setItemAsync(WATERMARK_KEY, date.toISOString());
  } catch {
    // best-effort — next launch will simply re-read recent sessions
  }
}

interface IntervalQuery {
  operator: 'between';
  startTime: string;
  endTime: string;
}

function makeFilter(start: string, end: string): IntervalQuery {
  return { operator: 'between', startTime: start, endTime: end };
}

async function readIntervalRecords<TRecord>(
  recordType:
    | 'HeartRate'
    | 'Distance'
    | 'ActiveCaloriesBurned'
    | 'ElevationGained',
  start: string,
  end: string,
): Promise<TRecord[]> {
  try {
    const result = await readRecords(recordType, { timeRangeFilter: makeFilter(start, end) });
    // The library has a typed map per recordType; we cast at the call boundary.
    return (result.records ?? []) as unknown as TRecord[];
  } catch {
    return [];
  }
}

function flattenHeartRate(records: HeartRateRecord[], maxHRBpm: number): HeartRateSample[] {
  const samples: HeartRateSample[] = [];
  for (const rec of records) {
    for (const s of rec.samples ?? []) {
      const bpm = s.beatsPerMinute;
      if (!Number.isFinite(bpm) || bpm <= 0) continue;
      samples.push({
        timestamp: new Date(s.time),
        bpm,
        zone: zoneForBpm(bpm, maxHRBpm),
      });
    }
  }
  samples.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  return samples;
}

function zoneForBpm(bpm: number, maxHRBpm: number): HeartRateSample['zone'] {
  if (maxHRBpm <= 0) return 'rest';
  const pct = bpm / maxHRBpm;
  if (pct < 0.6) return 'rest';
  if (pct < 0.7) return 'fat_burn';
  if (pct < 0.8) return 'cardio';
  if (pct < 0.9) return 'peak';
  return 'max';
}

function buildPayload(
  session: ExerciseSessionRecord,
  hr: HeartRateSample[],
  totalDistanceMeters: number | undefined,
  totalActiveKcal: number | undefined,
  totalElevationMeters: number | undefined,
  gps: GPSPoint[],
  hcRouteType: 'DATA' | 'CONSENT_REQUIRED' | 'NO_DATA' | undefined,
): CreateWorkoutLogInput {
  const startedAt = new Date(session.startTime);
  const completedAt = new Date(session.endTime);
  const durationSeconds = Math.max(
    0,
    Math.round((completedAt.getTime() - startedAt.getTime()) / 1000),
  );
  const type = mapExerciseTypeToWorkoutType(session.exerciseType);

  const externalId = session.metadata?.id;
  const dataOrigin = session.metadata?.dataOrigin;
  if (!externalId || !dataOrigin) {
    // Without a stable upstream id we can't dedup. Skip this session.
    throw new Error('ExerciseSession missing metadata.id or metadata.dataOrigin');
  }

  const avgPaceSecondsPerKm =
    type === 'run' && totalDistanceMeters && totalDistanceMeters > 0 && durationSeconds > 0
      ? durationSeconds / (totalDistanceMeters / 1000)
      : undefined;

  return {
    type,
    source: 'health_connect',
    externalId,
    dataOrigin,
    hcRouteType,
    startedAt,
    completedAt,
    durationSeconds,
    caloriesBurned: totalActiveKcal,
    distanceMeters: totalDistanceMeters,
    elevationGainMeters: totalElevationMeters,
    avgPaceSecondsPerKm,
    bestPaceSecondsPerKm: null,
    heartRateSamples: hr,
    gpsPoints: gps,
    exerciseLogs: [],
  };
}

export interface ImportSummary {
  imported: number;
  skipped: number;
  errors: number;
  byOrigin: Record<string, number>;
}

/**
 * Pull every ExerciseSession since the last watermark, build a
 * CreateWorkoutLogInput per session, POST it. 409 is swallowed (the
 * server's `(userId, externalId)` unique constraint already has the row).
 *
 * Returns a summary so the caller can render a "Imported N workouts"
 * toast. Pass `now` in tests.
 */
export async function importRecentWorkouts(
  profile: { dateOfBirth: string | Date } | null = null,
  now: Date = new Date(),
): Promise<ImportSummary> {
  const summary: ImportSummary = { imported: 0, skipped: 0, errors: 0, byOrigin: {} };

  const since = await readWatermark();
  const start = since.toISOString();
  const end = now.toISOString();

  const maxHRBpm = profile
    ? calculateMaxHR(ageYearsFromDob(new Date(profile.dateOfBirth)))
    : 190;

  let sessions: ExerciseSessionRecord[];
  try {
    const result = await readRecords('ExerciseSession', {
      timeRangeFilter: makeFilter(start, end),
    });
    sessions = (result.records ?? []) as unknown as ExerciseSessionRecord[];
  } catch {
    return summary;
  }

  // Guard against a future-dated session pushing the watermark past
  // sessions that haven't synced yet — clamp to `now`.
  let highWater = since.getTime();

  for (const session of sessions) {
    try {
      const sStart = session.startTime;
      const sEnd = session.endTime;

      const [hrRecords, distRecords, kcalRecords, elevRecords] = await Promise.all([
        readIntervalRecords<HeartRateRecord>('HeartRate', sStart, sEnd),
        readIntervalRecords<DistanceRecord>('Distance', sStart, sEnd),
        readIntervalRecords<ActiveCaloriesBurnedRecord>('ActiveCaloriesBurned', sStart, sEnd),
        readIntervalRecords<ElevationGainedRecord>('ElevationGained', sStart, sEnd),
      ]);


      const hr = flattenHeartRate(hrRecords, maxHRBpm);
      const distMeters = distRecords.length
        ? distRecords.reduce((s, r) => s + (lengthToMeters(r.distance) ?? 0), 0)
        : undefined;
      const kcal = kcalRecords.length
        ? kcalRecords.reduce((s, r) => s + energyToKcal(r.energy), 0)
        : undefined;
      const elev = elevRecords.length
        ? elevRecords.reduce((s, r) => s + (lengthToMeters(r.elevation) ?? 0), 0)
        : undefined;

      const gps = locationsToGPSPoints(session.exerciseRoute?.route);
      const hcRouteType = (session.exerciseRoute as
        | { type?: 'DATA' | 'CONSENT_REQUIRED' | 'NO_DATA' }
        | undefined)?.type;

      const payload = buildPayload(session, hr, distMeters, kcal, elev, gps, hcRouteType);

      await apiClient.post('/workouts/logs', payload);
      summary.imported += 1;
      const origin = payload.dataOrigin ?? 'unknown';
      summary.byOrigin[origin] = (summary.byOrigin[origin] ?? 0) + 1;

      const endMs = new Date(session.endTime).getTime();
      if (endMs > highWater) highWater = endMs;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        summary.skipped += 1;
        const endMs = new Date(session.endTime).getTime();
        if (endMs > highWater) highWater = endMs;
        continue;
      }
      summary.errors += 1;
    }
  }

  // Advance watermark only as far as the latest successfully-handled
  // session — never past `now`, in case a session lands between our
  // read and the next sync cycle.
  const cap = Math.min(highWater, now.getTime());
  if (cap > since.getTime()) {
    await writeWatermark(new Date(cap));
  }

  return summary;
}

// Visible for tests — pure helpers stay exported via the named bindings
// at the top of the file. The HC bridge calls remain wrapped behind
// `importRecentWorkouts`, the only side-effecting entry point.
