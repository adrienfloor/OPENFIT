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

/**
 * DailyHealth plus UI-only detail.
 *
 * `effortTargetMinutes` is the personalised daily target (median-over-7d × 1.5,
 * floor 30) computed per-refresh and not persisted — it's pure derivation from
 * the stored effortEarnedMinutes history.
 *
 * `readinessCalibrating` is true when we have < 3 days of baseline data for
 * HRV/RHR, so the UI can show a "Calibrating" caption instead of the tier.
 *
 * `readinessBaselineDays` is the count of baseline days we actually used,
 * for the "3/7" caption.
 */
export type TodayDailyStats = DailyHealth & {
  effortTargetMinutes: number | null;
  readinessCalibrating: boolean;
  readinessBaselineDays: number;
  /**
   * Exponentially-decayed sum of the last 3 days of earned effort minutes.
   * Surfaced for the daily-adjust banner so the coach service receives the
   * same load signal that fed today's readiness score.
   */
  recentLoad: number;
};
import {
  computeBMR,
  bmrCaloriesElapsed,
  ageYearsFromDob,
  calculateMaxHR,
  sleepScore,
  effortScore,
  readinessScore,
  recentTrainingLoad,
  personalisedEffortTarget,
  type EffortHRSample,
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
 * Health Connect can hold multiple writers for the same record type (Zepp +
 * Samsung Health + phone pedometer). `aggregateRecord` sums across writers for
 * non-overlapping windows — inflating totals when each source writes at a
 * different cadence. We pick a single canonical package (the wearable's
 * Steps stream) and read other metrics through that filter.
 */
type WithOrigin = { metadata?: { dataOrigin?: string } };

/**
 * Identify the package writing the most records. Wearables write Steps every
 * few minutes all day, so that source dominates by record count and is the
 * one Zepp's display should agree with.
 */
function dominantSource<T extends WithOrigin>(records: T[]): string | null {
  if (records.length === 0) return null;
  const counts = new Map<string, number>();
  for (const r of records) {
    const key = r.metadata?.dataOrigin ?? 'unknown';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best: { key: string; count: number } | null = null;
  for (const [key, count] of counts.entries()) {
    if (!best || count > best.count) best = { key, count };
  }
  return best?.key ?? null;
}

/**
 * Sum a numeric field over records originating from `pkg`. If `pkg` is null
 * (no records to identify a wearable) sum the largest single source — better
 * than zero, and matches the Phase 2.1 behaviour for users with only one
 * writer.
 */
function sumBySource<T extends WithOrigin>(
  records: T[],
  getValue: (r: T) => number,
  pkg: string | null,
): number {
  if (records.length === 0) return 0;
  if (pkg !== null) {
    return records
      .filter((r) => (r.metadata?.dataOrigin ?? 'unknown') === pkg)
      .reduce((sum, r) => sum + getValue(r), 0);
  }
  // Fallback: pick the source with the largest sum (single writer case).
  const bySource = new Map<string, number>();
  for (const r of records) {
    const key = r.metadata?.dataOrigin ?? 'unknown';
    bySource.set(key, (bySource.get(key) ?? 0) + getValue(r));
  }
  return Math.max(0, ...bySource.values());
}

function bySourceSummary<T extends WithOrigin>(
  records: T[],
  getValue: (r: T) => number,
): Record<string, { count: number; sum: number }> {
  const out: Record<string, { count: number; sum: number }> = {};
  for (const r of records) {
    const key = r.metadata?.dataOrigin ?? 'unknown';
    const cur = out[key] ?? { count: 0, sum: 0 };
    cur.count += 1;
    cur.sum += getValue(r);
    out[key] = cur;
  }
  return out;
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
): Promise<TodayDailyStats[]> {
  assertInitialized();

  const results: TodayDailyStats[] = [];
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
    //
    // Calorie records are pulled raw because HC's aggregate sums across
    // every writer for non-overlapping windows. With Samsung Health and Zepp
    // both writing TotalCaloriesBurned at different cadences, the sum
    // inflates the day total. We additionally read Steps records to
    // discover which package owns the user's wearable stream (whichever
    // package wrote the most Steps records is the wearable worn all day),
    // then filter calorie sums to that single package — locks calorie
    // numbers onto the same source HC's aggregate already favours for
    // steps.
    const [
      sleep,
      stepsAgg,
      stepsRaw,
      activeCalRaw,
      totalCalRaw,
      restingHRAgg,
      spo2,
      regularity,
      hrSamples,
    ] = await Promise.all([
      getSleepSummary(current).catch(() => null),
      aggregateRecord({ recordType: 'Steps', timeRangeFilter }).catch(
        () => null,
      ),
      readRecords('Steps', { timeRangeFilter }).catch(() => ({ records: [] })),
      readRecords('ActiveCaloriesBurned', { timeRangeFilter }).catch(
        () => ({ records: [] }),
      ),
      readRecords('TotalCaloriesBurned', { timeRangeFilter }).catch(
        () => ({ records: [] }),
      ),
      aggregateRecord({
        recordType: 'RestingHeartRate',
        timeRangeFilter,
      }).catch(() => null),
      readRecords('OxygenSaturation', { timeRangeFilter }).catch(
        () => ({ records: [] }),
      ),
      getSleepRegularity(current).catch(() => null),
      getDayHRSamples(current).catch(() => [] as EffortHRSample[]),
    ]);

    // Whichever package wrote the most Steps records today owns this
    // user's wearable stream. Zepp's TotalCaloriesBurned matches their
    // displayed total; Samsung Health (or any other writer) runs a
    // different model. We use the wearable package as a filter on
    // calories so the day total comes from one consistent source.
    const wearablePackage = dominantSource(stepsRaw.records);

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
    const totalTotalCal = sumBySource(
      totalCalRaw.records,
      (r) => r.energy.inKilocalories,
      wearablePackage,
    );
    const rawActiveCal = sumBySource(
      activeCalRaw.records,
      (r) => r.energy.inKilocalories,
      wearablePackage,
    );
    if (__DEV__) {
      console.log('[HC] calories breakdown', {
        date: dayStart.toISOString().slice(0, 10),
        wearablePackage,
        steps: bySourceSummary(stepsRaw.records, (r) => r.count),
        total: bySourceSummary(totalCalRaw.records, (r) => r.energy.inKilocalories),
        active: bySourceSummary(activeCalRaw.records, (r) => r.energy.inKilocalories),
        chosenTotal: totalTotalCal,
        chosenActive: rawActiveCal,
      });
    }

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
    // Regularity comes from the last 7 nights of SleepSession (null if <3 nights).
    const computedSleepScore =
      sleep !== null && sleep.durationMinutes > 0
        ? sleepScore({
            durationMinutes: sleep.durationMinutes,
            awakeMinutes: sleep.awakeMinutes,
            awakeningCount: sleep.awakeningCount,
            deepMinutes: sleep.deepMinutes,
            remMinutes: sleep.remMinutes,
            lightMinutes: sleep.lightMinutes,
            regularityScore: regularity ?? undefined,
          }).score
        : null;

    // Effort score needs user age (→ max HR via Tanaka) and a resting HR. If
    // either is missing we leave it null rather than fake a number.
    const effort =
      userProfile !== undefined && latestRestingHR && hrSamples.length >= 2
        ? effortScore({
            samples: hrSamples,
            restingHR: latestRestingHR,
            maxHR: calculateMaxHR(ageYearsFromDob(userProfile.dateOfBirth)),
          })
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
      recoveryScore: null, // filled in by getTodayDashboard once baselines are in play
      effortScore: effort?.score ?? null,
      effortEarnedMinutes: effort?.earnedMinutes ?? null,
      effortTargetMinutes: effort?.targetMinutes ?? null,
      readinessCalibrating: false,
      readinessBaselineDays: 0,
      recentLoad: 0,
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
  /** Count of contiguous awake segments during the session. */
  awakeningCount: number;
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
  let awakeningCount = 0;
  let prevAwake = false;

  if (session.stages) {
    for (const stage of session.stages) {
      const stageMs =
        new Date(stage.endTime).getTime() -
        new Date(stage.startTime).getTime();
      const stageMins = Math.round(stageMs / 60000);

      // Health Connect sleep stage constants
      // 1 = Awake, 2 = Sleeping, 3 = Out of bed, 4 = Light, 5 = Deep, 6 = REM
      const isAwake = stage.stage === 1 || stage.stage === 3;
      if (isAwake && !prevAwake) awakeningCount++;
      prevAwake = isAwake;

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
    awakeningCount,
  };
}

/**
 * Compute a 0–100 bedtime-regularity score from the last N sleep sessions.
 *
 * Returns null if fewer than 3 sessions are available — statistical noise on
 * stddev of 1–2 values makes the number meaningless.
 *
 * Algorithm: for each session, compute bedtime in minutes past 18:00 (this
 * anchor puts every reasonable bedtime in the 0–720 range, avoiding the
 * midnight-wraparound issue). Take the population stddev. Map linearly:
 * stddev 0 min → 100, stddev 180 min (3 h) → 0.
 */
export async function getSleepRegularity(
  date: Date,
  lookbackDays = 7,
): Promise<number | null> {
  assertInitialized();

  const windowStart = new Date(date);
  windowStart.setDate(windowStart.getDate() - lookbackDays);
  windowStart.setHours(18, 0, 0, 0);

  const result = await readRecords('SleepSession', {
    timeRangeFilter: {
      operator: 'between' as const,
      startTime: windowStart.toISOString(),
      endTime: endOfDay(date).toISOString(),
    },
  });

  // One bedtime per calendar day — if the device logged multiple sessions for
  // a nap + main sleep, keep only the longest (main) session.
  const byDay = new Map<string, { start: Date; durationMs: number }>();
  for (const r of result.records as Array<{ startTime: string; endTime: string }>) {
    const start = new Date(r.startTime);
    const durationMs = new Date(r.endTime).getTime() - start.getTime();
    const key = start.toISOString().slice(0, 10);
    const existing = byDay.get(key);
    if (!existing || durationMs > existing.durationMs) {
      byDay.set(key, { start, durationMs });
    }
  }

  if (byDay.size < 3) return null;

  const bedtimes = [...byDay.values()].map(({ start }) => {
    const mins = start.getHours() * 60 + start.getMinutes() - 18 * 60;
    return mins < 0 ? mins + 24 * 60 : mins;
  });

  const mean = bedtimes.reduce((a, b) => a + b, 0) / bedtimes.length;
  const variance =
    bedtimes.reduce((s, v) => s + (v - mean) ** 2, 0) / bedtimes.length;
  const stdMinutes = Math.sqrt(variance);

  return Math.round(Math.max(0, Math.min(100, 100 * (1 - stdMinutes / 180))));
}

/**
 * Fetch every heart-rate sample for a single calendar day.
 *
 * Health Connect's HeartRate records are "sessions" that each contain a
 * nested `samples` array. This flattens them into a single chronological
 * list that the effort-score integrator can walk through.
 */
export async function getDayHRSamples(date: Date): Promise<EffortHRSample[]> {
  assertInitialized();

  const result = await readRecords('HeartRate', {
    timeRangeFilter: {
      operator: 'between' as const,
      startTime: startOfDay(date).toISOString(),
      endTime: endOfDay(date).toISOString(),
    },
  });

  const samples: EffortHRSample[] = [];
  for (const rec of result.records as Array<{
    samples: Array<{ time: string; beatsPerMinute: number }>;
  }>) {
    for (const s of rec.samples) {
      samples.push({ time: new Date(s.time), bpm: s.beatsPerMinute });
    }
  }
  return samples;
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

/**
 * Today's stats enriched with readiness + a personalised effort target.
 *
 * Pulls the last 7 days of daily stats from Health Connect (today + 6 prior),
 * derives HRV / RHR baselines from the history, computes readiness, and
 * rescales today's effort score against a median-based personal target so
 * a user who typically trains hard doesn't see 100 % for a routine session.
 *
 * Personalised target formula: max(30, median(last7.earnedMinutes) × 1.5).
 * Floor 30 prevents the score from collapsing on rest-heavy weeks. Ceiling
 * is natural — there's no cap, just 100 % clamp on the final score.
 */
export async function getTodayDashboard(
  userProfile?: Pick<UserProfile, 'weightKg' | 'heightCm' | 'sex' | 'dateOfBirth'>,
): Promise<TodayDailyStats | null> {
  const today = new Date();
  const sixDaysAgo = new Date();
  sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);

  const range = await getDailyStats(sixDaysAgo, today, userProfile);
  if (range.length === 0) return null;

  const todayRecord = range[range.length - 1] as TodayDailyStats;
  const history = range.slice(0, -1);

  const hrvValues = history
    .map((d) => d.hrvRmssd)
    .filter((v): v is number => v != null);
  const rhrValues = history
    .map((d) => d.heartRateResting)
    .filter((v): v is number => v != null);

  const avg = (xs: number[]): number | null =>
    xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;

  const hrvBaseline = avg(hrvValues);
  const rhrBaseline = avg(rhrValues);
  const baselineDays = Math.min(hrvValues.length, rhrValues.length);

  // Recent 3-day load — history is oldest→newest, so reverse to get most-recent-first.
  const earnedMostRecentFirst = [...history]
    .reverse()
    .map((d) => d.effortEarnedMinutes);
  const load = recentTrainingLoad(earnedMostRecentFirst.slice(0, 3));

  // Fitness-level-based target using RHR + HRV as VO2max proxies. Prefers
  // baselines (stable over 7 days) but falls back to today's values if the
  // user has < 3 days of history.
  const ageYears = userProfile
    ? ageYearsFromDob(userProfile.dateOfBirth)
    : null;
  const personalisedTarget = personalisedEffortTarget({
    restingHR: rhrBaseline ?? todayRecord.heartRateResting,
    hrvRmssd: hrvBaseline ?? todayRecord.hrvRmssd,
    ageYears,
  });

  // Rescale today's effort score against the personalised target.
  const rescaledEffortScore =
    todayRecord.effortEarnedMinutes !== null
      ? Math.min(
          100,
          Math.round((todayRecord.effortEarnedMinutes / personalisedTarget) * 100),
        )
      : null;

  const readiness = readinessScore({
    hrvToday: todayRecord.hrvRmssd,
    hrvBaseline,
    rhrToday: todayRecord.heartRateResting,
    rhrBaseline,
    sleepScore: todayRecord.sleepScore,
    recentLoad: load,
    baselineDays,
    todayEarnedMinutes: todayRecord.effortEarnedMinutes,
  });

  return {
    ...todayRecord,
    effortScore: rescaledEffortScore,
    effortTargetMinutes: personalisedTarget,
    recoveryScore: readiness.score,
    readinessCalibrating: readiness.calibrating,
    readinessBaselineDays: baselineDays,
    recentLoad: load,
  };
}

