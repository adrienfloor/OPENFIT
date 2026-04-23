/**
 * All passive daily data is read from Health Connect.
 * Zepp syncs Helio Strap data into Health Connect automatically in the background.
 * This service is the single point of contact for all passive health data.
 * Android only.
 */

import {
  initialize,
  requestPermission,
  readRecords,
  aggregateRecord,
  getSdkStatus,
  SdkAvailabilityStatus,
} from 'react-native-health-connect';
import type { DailyHealth, UserProfile } from '@openfit/types';
import {
  computeBMR,
  bmrCaloriesElapsed,
  ageYearsFromDob,
  sleepScore,
} from '@openfit/fitness-core';

export class HealthConnectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HealthConnectError';
  }
}

let initialized = false;

function assertInitialized(): void {
  if (!initialized) {
    throw new HealthConnectError(
      'Health Connect is not initialized. Call initializeHealthConnect() first.',
    );
  }
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Initialize Health Connect and check SDK availability.
 * Must be called once on app start.
 * Returns false if Health Connect is not installed — in that case,
 * prompt the user to install it from the Play Store:
 * https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata
 */
export async function initializeHealthConnect(): Promise<boolean> {
  const status = await getSdkStatus();
  if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE) {
    return false;
  }

  const result = await initialize();
  initialized = result;
  return result;
}

const REQUIRED_PERMISSIONS = [
  { accessType: 'read', recordType: 'HeartRate' },
  { accessType: 'read', recordType: 'SleepSession' },
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'OxygenSaturation' },
  { accessType: 'read', recordType: 'RestingHeartRate' },
  { accessType: 'read', recordType: 'HeartRateVariabilityRmssd' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
  { accessType: 'read', recordType: 'TotalCaloriesBurned' },
] as const;

export const REQUIRED_PERMISSION_COUNT = REQUIRED_PERMISSIONS.length;

/**
 * Request all READ permissions declared in AndroidManifest.
 * Safe to call multiple times — no-op if already granted.
 */
export async function requestHealthPermissions(): Promise<boolean> {
  assertInitialized();
  const granted = await requestPermission(REQUIRED_PERMISSIONS);
  console.log('[HealthConnect] permissions result:', JSON.stringify(granted));
  // Treat any granted permissions as success — partial access is better than none
  return granted.length > 0;
}

/**
 * Fetch aggregated daily stats for a date range.
 * Each entry in the returned array corresponds to one calendar day.
 */
export async function getDailyStats(
  startDate: Date,
  endDate: Date,
  userProfile?: Pick<UserProfile, 'weightKg' | 'heightCm' | 'sex' | 'dateOfBirth'>,
): Promise<DailyHealth[]> {
  assertInitialized();

  const results: DailyHealth[] = [];
  const current = startOfDay(startDate);
  const end = startOfDay(endDate);

  // Derive BMR once — it's constant across days for the same user. If we
  // don't have a full profile, we can't compute basal and will fall back to
  // Health Connect's ActiveCaloriesBurned record (workout-only).
  const bmrPerDay =
    userProfile !== undefined
      ? computeBMR({
          weightKg: userProfile.weightKg,
          heightCm: userProfile.heightCm,
          ageYears: ageYearsFromDob(userProfile.dateOfBirth),
          sex: userProfile.sex,
        })
      : null;

  while (current <= end) {
    const dayStart = startOfDay(current);
    const dayEnd = endOfDay(current);
    const timeRangeFilter = {
      operator: 'between' as const,
      startTime: dayStart.toISOString(),
      endTime: dayEnd.toISOString(),
    };

    // Aggregated metrics + sleep run in parallel. Health Connect deduplicates
    // across data sources (e.g. phone pedometer + Zepp both writing Steps)
    // using its priority rules; readRecords would return raw per-source
    // records and summing them double-counts overlapping windows.
    const [sleep, stepsAgg, activeCalAgg, totalCalAgg, restingHRAgg, spo2] =
      await Promise.all([
        getSleepSummary(current).catch(() => null),
        aggregateRecord({ recordType: 'Steps', timeRangeFilter }).catch(
          () => null,
        ),
        aggregateRecord({
          recordType: 'ActiveCaloriesBurned',
          timeRangeFilter,
        }).catch(() => null),
        aggregateRecord({
          recordType: 'TotalCaloriesBurned',
          timeRangeFilter,
        }).catch(() => null),
        aggregateRecord({
          recordType: 'RestingHeartRate',
          timeRangeFilter,
        }).catch(() => null),
        readRecords('OxygenSaturation', { timeRangeFilter }).catch(
          () => ({ records: [] }),
        ),
      ]);

    // HRV is a sleep / wake-transition metric — its value comes from the
    // autonomic state at rest. Averaging over the calendar day would mix in
    // Zepp's daytime stress-feature readings and any naps, diluting the
    // baseline. Restrict the read to the night's sleep session bounds, or
    // fall back to a 22:00 prev-day → 08:00 current-day window if no sleep
    // session was recorded.
    const hrvWindowStart = sleep?.startTime ?? (() => {
      const fb = new Date(current);
      fb.setDate(fb.getDate() - 1);
      fb.setHours(22, 0, 0, 0);
      return fb;
    })();
    const hrvWindowEnd = sleep?.endTime ?? (() => {
      const fb = new Date(current);
      fb.setHours(8, 0, 0, 0);
      return fb;
    })();
    const hrv = await readRecords('HeartRateVariabilityRmssd', {
      timeRangeFilter: {
        operator: 'between' as const,
        startTime: hrvWindowStart.toISOString(),
        endTime: hrvWindowEnd.toISOString(),
      },
    }).catch(() => ({ records: [] }));

    const totalSteps = stepsAgg?.COUNT_TOTAL ?? 0;
    const totalTotalCal = totalCalAgg?.ENERGY_TOTAL.inKilocalories ?? 0;
    const rawActiveCal = activeCalAgg?.ACTIVE_CALORIES_TOTAL.inKilocalories ?? 0;

    // Zepp's "Consommation d'activité" = TotalCaloriesBurned − BMR.
    // Zepp does not write BasalMetabolicRate records to Health Connect, so we
    // compute BMR ourselves from the user profile (Mifflin-St Jeor) and
    // prorate by the portion of the day that has elapsed — a full-day BMR
    // would overestimate the resting component for a still-in-progress day.
    // ActiveCaloriesBurned on its own only covers explicit workout sessions
    // (e.g. the 540 kcal jiu-jitsu log) and misses daily walking / casual
    // activity, so we only fall back to it when the profile is missing.
    const isToday = startOfDay(current).getTime() === startOfDay(new Date()).getTime();
    const now = isToday ? new Date() : endOfDay(current);
    let totalActiveCal: number;
    if (bmrPerDay !== null && totalTotalCal > 0) {
      const basalSoFar = bmrCaloriesElapsed(bmrPerDay, now);
      totalActiveCal = Math.max(0, totalTotalCal - basalSoFar);
    } else {
      totalActiveCal = rawActiveCal;
    }

    const latestRestingHR = restingHRAgg?.BPM_AVG ?? null;

    // RMSSD is computed on ~1-min windows, so a single record can land
    // anywhere from 40–100 ms. The meaningful daily value is the mean of
    // the readings taken across the sleep window — that's what Zepp and
    // similar apps display.
    const avgHRV =
      hrv.records.length > 0
        ? hrv.records.reduce(
            (sum: number, r: { heartRateVariabilityMillis: number }) =>
              sum + r.heartRateVariabilityMillis,
            0,
          ) / hrv.records.length
        : null;

    const avgSpO2 =
      spo2.records.length > 0
        ? spo2.records.reduce(
            (sum: number, r: { percentage: number }) => sum + r.percentage,
            0,
          ) / spo2.records.length
        : null;

    // Health Connect doesn't write a sleep score, so we compute our own from
    // the stage breakdown using the published composite in @openfit/fitness-core.
    const computedSleepScore =
      sleep !== null && sleep.durationMinutes > 0
        ? sleepScore({
            durationMinutes: sleep.durationMinutes,
            awakeMinutes: sleep.awakeMinutes,
            deepMinutes: sleep.deepMinutes,
            remMinutes: sleep.remMinutes,
            lightMinutes: sleep.lightMinutes,
          }).score
        : null;

    results.push({
      id: `hc-${dayStart.toISOString().slice(0, 10)}`,
      date: dayStart,
      userId: '',
      steps: totalSteps || null,
      caloriesActive: totalActiveCal || null,
      caloriesTotal: totalTotalCal || null,
      heartRateResting: latestRestingHR,
      hrvRmssd: avgHRV,
      sleepDurationMinutes: sleep?.durationMinutes ?? null,
      sleepScore: computedSleepScore,
      recoveryScore: null,
      strainScore: null,
    });

    // Unused but available: avgSpO2
    void avgSpO2;

    current.setDate(current.getDate() + 1);
  }

  return results;
}

/**
 * Fetch last night's sleep breakdown.
 */
export async function getSleepSummary(
  date: Date,
): Promise<{
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  score: number | null;
  deepMinutes: number;
  remMinutes: number;
  lightMinutes: number;
  awakeMinutes: number;
} | null> {
  assertInitialized();

  // Sleep sessions typically span the previous evening to this morning
  const sleepWindowStart = new Date(date);
  sleepWindowStart.setDate(sleepWindowStart.getDate() - 1);
  sleepWindowStart.setHours(18, 0, 0, 0);

  const sleepWindowEnd = endOfDay(date);

  const result = await readRecords('SleepSession', {
    timeRangeFilter: {
      operator: 'between' as const,
      startTime: sleepWindowStart.toISOString(),
      endTime: sleepWindowEnd.toISOString(),
    },
  });

  if (result.records.length === 0) return null;

  const session = result.records[result.records.length - 1] as {
    startTime: string;
    endTime: string;
    stages?: Array<{
      stage: number;
      startTime: string;
      endTime: string;
    }>;
  };

  const start = new Date(session.startTime);
  const end = new Date(session.endTime);
  const sessionSpanMinutes = Math.round(
    (end.getTime() - start.getTime()) / 60000,
  );

  let deepMinutes = 0;
  let remMinutes = 0;
  let lightMinutes = 0;
  let awakeMinutes = 0;

  if (session.stages) {
    for (const stage of session.stages) {
      const stageMs =
        new Date(stage.endTime).getTime() -
        new Date(stage.startTime).getTime();
      const stageMins = Math.round(stageMs / 60000);

      // Health Connect sleep stage constants
      // 1 = Awake, 2 = Sleeping, 3 = Out of bed, 4 = Light, 5 = Deep, 6 = REM
      switch (stage.stage) {
        case 1:
        case 3:
          awakeMinutes += stageMins;
          break;
        case 4:
          lightMinutes += stageMins;
          break;
        case 5:
          deepMinutes += stageMins;
          break;
        case 6:
          remMinutes += stageMins;
          break;
      }
    }
  }

  // Report time actually asleep (industry standard — matches Zepp/Garmin/Whoop).
  // When stage data is missing we fall back to raw session span.
  const durationMinutes = Math.max(0, sessionSpanMinutes - awakeMinutes);

  return {
    startTime: start,
    endTime: end,
    durationMinutes,
    score: null, // Health Connect does not provide a sleep score
    deepMinutes,
    remMinutes,
    lightMinutes,
    awakeMinutes,
  };
}

/** Fetch resting heart rate for a given day (null if unavailable). */
export async function getRestingHeartRate(date: Date): Promise<number | null> {
  assertInitialized();

  const result = await readRecords('RestingHeartRate', {
    timeRangeFilter: {
      operator: 'between' as const,
      startTime: startOfDay(date).toISOString(),
      endTime: endOfDay(date).toISOString(),
    },
  });

  if (result.records.length === 0) return null;
  return (result.records[result.records.length - 1] as { beatsPerMinute: number })
    .beatsPerMinute;
}

/** Fetch HRV (RMSSD) for a given day (null if unavailable). */
export async function getHRV(date: Date): Promise<number | null> {
  assertInitialized();

  const result = await readRecords('HeartRateVariabilityRmssd', {
    timeRangeFilter: {
      operator: 'between' as const,
      startTime: startOfDay(date).toISOString(),
      endTime: endOfDay(date).toISOString(),
    },
  });

  if (result.records.length === 0) return null;
  return (
    result.records[result.records.length - 1] as {
      heartRateVariabilityMillis: number;
    }
  ).heartRateVariabilityMillis;
}

/** Fetch step count for a given day (deduplicated across data sources). */
export async function getSteps(date: Date): Promise<number> {
  assertInitialized();

  const result = await aggregateRecord({
    recordType: 'Steps',
    timeRangeFilter: {
      operator: 'between' as const,
      startTime: startOfDay(date).toISOString(),
      endTime: endOfDay(date).toISOString(),
    },
  });

  return result.COUNT_TOTAL;
}

/** Fetch average SpO2 for a given day (null if unavailable). */
export async function getSpO2(date: Date): Promise<number | null> {
  assertInitialized();

  const result = await readRecords('OxygenSaturation', {
    timeRangeFilter: {
      operator: 'between' as const,
      startTime: startOfDay(date).toISOString(),
      endTime: endOfDay(date).toISOString(),
    },
  });

  if (result.records.length === 0) return null;
  return (
    result.records.reduce(
      (sum: number, r: { percentage: number }) => sum + r.percentage,
      0,
    ) / result.records.length
  );
}
