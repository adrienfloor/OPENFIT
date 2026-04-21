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
  getSdkStatus,
  SdkAvailabilityStatus,
} from 'react-native-health-connect';
import type { DailyHealth } from '@openfit/types';

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
): Promise<DailyHealth[]> {
  assertInitialized();

  const results: DailyHealth[] = [];
  const current = startOfDay(startDate);
  const end = startOfDay(endDate);

  while (current <= end) {
    const dayStart = startOfDay(current);
    const dayEnd = endOfDay(current);
    const timeRangeFilter = {
      operator: 'between' as const,
      startTime: dayStart.toISOString(),
      endTime: dayEnd.toISOString(),
    };

    const [steps, activeCal, totalCal, restingHR, hrv, spo2] =
      await Promise.all([
        readRecords('Steps', { timeRangeFilter }).catch(() => ({ records: [] })),
        readRecords('ActiveCaloriesBurned', { timeRangeFilter }).catch(
          () => ({ records: [] }),
        ),
        readRecords('TotalCaloriesBurned', { timeRangeFilter }).catch(
          () => ({ records: [] }),
        ),
        readRecords('RestingHeartRate', { timeRangeFilter }).catch(
          () => ({ records: [] }),
        ),
        readRecords('HeartRateVariabilityRmssd', { timeRangeFilter }).catch(
          () => ({ records: [] }),
        ),
        readRecords('OxygenSaturation', { timeRangeFilter }).catch(
          () => ({ records: [] }),
        ),
      ]);

    const totalSteps = steps.records.reduce(
      (sum: number, r: { count: number }) => sum + r.count,
      0,
    );

    const totalActiveCal = activeCal.records.reduce(
      (sum: number, r: { energy: { inKilocalories: number } }) =>
        sum + r.energy.inKilocalories,
      0,
    );

    const totalTotalCal = totalCal.records.reduce(
      (sum: number, r: { energy: { inKilocalories: number } }) =>
        sum + r.energy.inKilocalories,
      0,
    );

    const latestRestingHR =
      restingHR.records.length > 0
        ? (restingHR.records[restingHR.records.length - 1] as { beatsPerMinute: number })
            .beatsPerMinute
        : null;

    const latestHRV =
      hrv.records.length > 0
        ? (hrv.records[hrv.records.length - 1] as { heartRateVariabilityMillis: number })
            .heartRateVariabilityMillis
        : null;

    const avgSpO2 =
      spo2.records.length > 0
        ? spo2.records.reduce(
            (sum: number, r: { percentage: number }) => sum + r.percentage,
            0,
          ) / spo2.records.length
        : null;

    // Sleep data for the night ending on this day
    const sleep = await getSleepSummary(current);

    results.push({
      id: `hc-${dayStart.toISOString().slice(0, 10)}`,
      date: dayStart,
      userId: '',
      steps: totalSteps || null,
      caloriesActive: totalActiveCal || null,
      caloriesTotal: totalTotalCal || null,
      heartRateResting: latestRestingHR,
      hrvRmssd: latestHRV,
      sleepDurationMinutes: sleep?.durationMinutes ?? null,
      sleepScore: sleep?.score ?? null,
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
  const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);

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

  return {
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

/** Fetch step count for a given day. */
export async function getSteps(date: Date): Promise<number> {
  assertInitialized();

  const result = await readRecords('Steps', {
    timeRangeFilter: {
      operator: 'between' as const,
      startTime: startOfDay(date).toISOString(),
      endTime: endOfDay(date).toISOString(),
    },
  });

  return result.records.reduce(
    (sum: number, r: { count: number }) => sum + r.count,
    0,
  );
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
