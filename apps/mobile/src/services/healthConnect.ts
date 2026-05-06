/**
 * All passive daily data is read from Health Connect.
 * Companion apps (Zepp, Garmin Connect, etc.) sync HR-device data into
 * Health Connect automatically in the background.
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
  /**
   * Last 7 days of daily TRIMP (oldest → newest, today last). Drives the
   * Effort-load metric on the Overview tab: sum = 7-day load, series =
   * sparkline trend, ratio to weekly target = status tier.
   */
  effortLoad7Days: { date: Date; trimp: number | null }[];
  /** Today's Banister TRIMP, or null if HR samples insufficient. */
  dailyTrimp: number | null;
  /** Chronic Training Load (42-day EMA) — Zepp's "Niveau de forme". */
  ctl: number | null;
  /** Acute Training Load (7-day EMA) — Zepp's "Niveau de fatigue". */
  atl: number | null;
  /** Training Stress Balance = CTL_yesterday − ATL_yesterday — Zepp's "Statut d'entraînement". */
  tsb: number | null;
  /** TSB tier ('detrained' | 'energetic' | 'balanced' | 'optimal' | 'overreaching'). */
  trainingStatusTier: TrainingStatusTier | null;
  /** True until ≥ 14 days of TRIMP history have accumulated. */
  trainingStatusCalibrating: boolean;
  /** Number of days with non-zero TRIMP data in the 42-day window — for "X/14 days" copy. */
  trainingStatusDaysWithData: number;
  /** Today's PAI contribution (HUNT study indicator). */
  dailyPAI: number | null;
  /** Rolling 7-day PAI total. Target 100 (HUNT cardiovascular threshold). */
  weeklyPAI: number | null;
  /** Last 7 days of daily PAI (oldest → newest, today last). */
  paiHistory7Days: { date: Date; pai: number | null }[];
  /** Most recent body weight reading (kg) from Health Connect, or null. */
  latestWeightKg: number | null;
  /** Last 30 days of body-weight readings (oldest → newest). */
  weightHistory30Days: { time: Date; kg: number }[];
  /** Today's BioCharge at wake (peak before training drain). */
  wakeBioChargeScore: number | null;
  /** Sleep contribution to today's wake score (sleepScore × 0.30, rounded). */
  sleepContributionPoints: number | null;
  /** 24-hour BioCharge curve sampled every 30 minutes. */
  bioChargeIntraday: { minute: number; value: number }[];
  /** Today's BioCharge events (last sleep + workouts) ordered by start time. */
  bioChargeEvents: {
    kind: 'sleep' | 'workout';
    label: string;
    delta: number;
    startTime: Date;
    endTime: Date;
  }[];
  /** Last 7 days of recovery / HRV / RHR for the BioCharge trend charts. */
  recoveryHistory7Days: {
    date: Date;
    recoveryScore: number | null;
    hrv: number | null;
    rhr: number | null;
  }[];
  /** Last night's stage timeline (offsets in minutes since session start). */
  sleepStageTimeline: {
    stage: 'awake' | 'light' | 'deep' | 'rem';
    startMinute: number;
    endMinute: number;
  }[];
  /** Last night's sleep session bounds. */
  sleepStartTime: Date | null;
  sleepEndTime: Date | null;
  /** Stage-level minute breakdown for last night. */
  sleepDeepMinutes: number | null;
  sleepRemMinutes: number | null;
  sleepLightMinutes: number | null;
  sleepAwakeMinutes: number | null;
  sleepAwakeningCount: number | null;
  /** 0-100 bedtime-regularity score over the last 7 days, or null when <3 nights. */
  sleepRegularityPercent: number | null;
  /** 7-day series for the Sleep sub-tab charts. */
  sleepDashboardData: SleepDashboardData;
};
import {
  computeBMR,
  bmrCaloriesElapsed,
  ageYearsFromDob,
  calculateMaxHR,
  activeKcalFromSteps,
  sleepScore,
  effortScore,
  readinessScore,
  recentTrainingLoad,
  personalisedEffortTarget,
  dailyTrimp,
  dailyPAI,
  weeklyPAI,
  computePMC,
  dailyEffortTarget,
  cumulativeEffortMinutes,
  intradayBioCharge,
  sleepContribution,
  type TrainingStatusTier,
  type EffortHRSample,
} from '@openfit/fitness-core';

const WORKOUT_LABEL: Record<string, string> = {
  strength: 'Strength',
  run: 'Run',
  jiu_jitsu: 'Jiu-Jitsu',
  martial_arts: 'Martial arts',
  hc_imported: 'Workout',
};

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
  { accessType: 'read', recordType: 'ExerciseSession' },
  { accessType: 'read', recordType: 'Distance' },
  { accessType: 'read', recordType: 'ElevationGained' },
  { accessType: 'read', recordType: 'Weight' },
  { accessType: 'read', recordType: 'RespiratoryRate' },
  // ExerciseRoute is not a separately-requestable read permission in
  // react-native-health-connect — the manifest's READ_EXERCISE_ROUTE is
  // honored automatically alongside ExerciseSession reads, and listing it
  // here throws InvalidRecordType in PermissionUtils.parsePermissions.
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
  /**
   * Optional map of `YYYY-MM-DD` → workout calories burned that day, summed
   * across all logs with a `completedAt` on that date. Added on top of the
   * step-based casual-activity estimate so HR-tracked workouts show up in
   * the day's active total.
   */
  workoutKcalByDate?: Record<string, number>,
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
    // We deliberately do NOT read HC's TotalCaloriesBurned /
    // ActiveCaloriesBurned. On this user's setup Zepp writes ~70 kcal/day
    // total (their app computes 1100+ internally and never syncs it), and
    // every other writer uses a different model — the sum is unreliable.
    // Instead we compute calories ourselves from inputs we control:
    // BMR-prorated (Mifflin) for resting + steps × per-step coefficient
    // for active. Workout HR data is integrated via Keytel inside each
    // WorkoutLog at log time, not here.
    const [
      sleep,
      stepsAgg,
      restingHRAgg,
      spo2,
      regularity,
      hrSamples,
    ] = await Promise.all([
      getSleepSummary(current).catch(() => null),
      aggregateRecord({ recordType: 'Steps', timeRangeFilter }).catch(
        () => null,
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

    // Compute calories ourselves. Resting = Mifflin BMR prorated to "now"
    // (so a partial day doesn't claim a full day's basal at noon). Active
    // = step-based casual walk estimate + sum of HR-derived workout kcal
    // from WorkoutLog rows completed on this date.
    const isToday = startOfDay(current).getTime() === startOfDay(new Date()).getTime();
    const now = isToday ? new Date() : endOfDay(current);
    const stepKcal =
      userProfile !== undefined
        ? activeKcalFromSteps(totalSteps, userProfile.weightKg)
        : 0;
    const dateKey = dayStart.toISOString().slice(0, 10);
    const workoutKcal = workoutKcalByDate?.[dateKey] ?? 0;
    const totalActiveCal = stepKcal + workoutKcal;
    const basalSoFar =
      bmrPerDay !== null ? bmrCaloriesElapsed(bmrPerDay, now) : 0;
    const totalTotalCal = basalSoFar + totalActiveCal;

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
    const maxHR = userProfile
      ? calculateMaxHR(ageYearsFromDob(userProfile.dateOfBirth))
      : null;
    const effort =
      userProfile !== undefined && latestRestingHR && hrSamples.length >= 2
        ? effortScore({
            samples: hrSamples,
            restingHR: latestRestingHR,
            maxHR: maxHR!,
          })
        : null;

    // Banister TRIMP — same daily HR samples, sex-specific weighting.
    // Used by the PMC layer (CTL/ATL/TSB) computed in getTodayDashboard.
    const trimpToday =
      userProfile !== undefined &&
      latestRestingHR &&
      maxHR !== null &&
      hrSamples.length >= 2
        ? dailyTrimp({
            samples: hrSamples,
            restingHR: latestRestingHR,
            maxHR,
            sex: userProfile.sex,
          })
        : null;

    // HUNT PAI — same HR samples, public-health intensity tiers.
    const paiToday =
      latestRestingHR && maxHR !== null && hrSamples.length >= 2
        ? dailyPAI({
            samples: hrSamples,
            restingHR: latestRestingHR,
            maxHR,
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
      effortLoad7Days: [],
      dailyTrimp: trimpToday,
      ctl: null,
      atl: null,
      tsb: null,
      trainingStatusTier: null,
      trainingStatusCalibrating: true,
      trainingStatusDaysWithData: 0,
      dailyPAI: paiToday,
      weeklyPAI: null,
      paiHistory7Days: [],
      latestWeightKg: null,
      weightHistory30Days: [],
      wakeBioChargeScore: null,
      sleepContributionPoints: null,
      bioChargeIntraday: [],
      bioChargeEvents: [],
      recoveryHistory7Days: [],
      sleepStageTimeline: sleep?.stageTimeline ?? [],
      sleepStartTime: sleep?.startTime ?? null,
      sleepEndTime: sleep?.endTime ?? null,
      sleepDeepMinutes: sleep?.deepMinutes ?? null,
      sleepRemMinutes: sleep?.remMinutes ?? null,
      sleepLightMinutes: sleep?.lightMinutes ?? null,
      sleepAwakeMinutes: sleep?.awakeMinutes ?? null,
      sleepAwakeningCount: sleep?.awakeningCount ?? null,
      sleepRegularityPercent: regularity,
      sleepDashboardData: {
        durationTrend: [],
        regularityTrend: [],
        sleepHRTrend: [],
        breathingTrend: [],
      },
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
  /** Per-stage timeline (offsets in minutes since session start). Empty
   *  array when the device only logged a coarse "asleep" segment. */
  stageTimeline: SleepStageSegmentDTO[];
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
  const stageTimeline: SleepStageSegmentDTO[] = [];

  if (session.stages) {
    const sessionStartMs = start.getTime();
    for (const stage of session.stages) {
      const stageStartMs = new Date(stage.startTime).getTime();
      const stageEndMs = new Date(stage.endTime).getTime();
      const stageMs = stageEndMs - stageStartMs;
      const stageMins = Math.round(stageMs / 60000);
      const startMinute = Math.max(0, (stageStartMs - sessionStartMs) / 60000);
      const endMinute = Math.max(startMinute, (stageEndMs - sessionStartMs) / 60000);

      // Health Connect sleep stage constants
      // 1 = Awake, 2 = Sleeping, 3 = Out of bed, 4 = Light, 5 = Deep, 6 = REM
      const isAwake = stage.stage === 1 || stage.stage === 3;
      if (isAwake && !prevAwake) awakeningCount++;
      prevAwake = isAwake;

      let stageKey: 'awake' | 'light' | 'deep' | 'rem' | null = null;
      switch (stage.stage) {
        case 1:
        case 3:
          awakeMinutes += stageMins;
          stageKey = 'awake';
          break;
        case 2:
        case 4:
          lightMinutes += stageMins;
          stageKey = 'light';
          break;
        case 5:
          deepMinutes += stageMins;
          stageKey = 'deep';
          break;
        case 6:
          remMinutes += stageMins;
          stageKey = 'rem';
          break;
      }
      if (stageKey) {
        stageTimeline.push({ stage: stageKey, startMinute, endMinute });
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
    stageTimeline,
  };
}

interface SleepStageSegmentDTO {
  stage: 'awake' | 'light' | 'deep' | 'rem';
  startMinute: number;
  endMinute: number;
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

export interface SleepDashboardData {
  durationTrend: {
    date: Date;
    deepMinutes: number;
    remMinutes: number;
    lightMinutes: number;
    awakeMinutes: number;
  }[];
  regularityTrend: {
    date: Date;
    /** Bedtime as minutes since 21:00 prior. */
    bedtimeMinutes: number;
    /** Wake time as minutes since 21:00 prior. */
    wakeMinutes: number;
  }[];
  sleepHRTrend: { date: Date; value: number }[];
  breathingTrend: { date: Date; value: number }[];
}

/**
 * Build the 7-day series powering the Sleep sub-tab charts. Reads sleep
 * sessions, HR records, and respiratory-rate records over an 8-day window
 * (to cover the previous night for the oldest entry), then buckets per
 * night-of-sleep.
 *
 * Falls back to empty arrays when permissions aren't granted, no source
 * is connected, or no data falls in the window. Each subarray is ordered
 * oldest → newest with one entry per recorded night (≤ 7).
 */
export async function getSleepDashboardData(
  endDate: Date = new Date(),
): Promise<SleepDashboardData> {
  assertInitialized();

  const end = endOfDay(endDate);
  const start = new Date(end);
  start.setDate(start.getDate() - 7);
  start.setHours(0, 0, 0, 0);

  const [sleepRes, hrRes, respRes] = await Promise.all([
    readRecords('SleepSession', {
      timeRangeFilter: {
        operator: 'between' as const,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      },
    }).catch(() => ({ records: [] as Array<{
      startTime: string;
      endTime: string;
      stages?: Array<{ stage: number; startTime: string; endTime: string }>;
    }> })),
    readRecords('HeartRate', {
      timeRangeFilter: {
        operator: 'between' as const,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      },
    }).catch(() => ({ records: [] as Array<{
      samples: Array<{ time: string; beatsPerMinute: number }>;
    }> })),
    readRecords('RespiratoryRate', {
      timeRangeFilter: {
        operator: 'between' as const,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      },
    }).catch(() => ({ records: [] as Array<{ time: string; rate: number }> })),
  ]);

  // Bucket sleep sessions by their wake date (one main session per night —
  // pick the longest if multiple). Key on YYYY-MM-DD of session.endTime.
  const sessionsByWakeDate = new Map<
    string,
    { startTime: Date; endTime: Date; stages: typeof sleepRes.records[number]['stages'] }
  >();
  for (const r of sleepRes.records) {
    const sStart = new Date(r.startTime);
    const sEnd = new Date(r.endTime);
    const durationMs = sEnd.getTime() - sStart.getTime();
    if (durationMs <= 0) continue;
    const key = sEnd.toISOString().slice(0, 10);
    const existing = sessionsByWakeDate.get(key);
    if (!existing || durationMs > existing.endTime.getTime() - existing.startTime.getTime()) {
      sessionsByWakeDate.set(key, { startTime: sStart, endTime: sEnd, stages: r.stages });
    }
  }

  // Flatten HR samples once for night-window averaging.
  const allHRSamples: { time: number; bpm: number }[] = [];
  for (const rec of hrRes.records) {
    for (const s of rec.samples) {
      allHRSamples.push({ time: new Date(s.time).getTime(), bpm: s.beatsPerMinute });
    }
  }
  allHRSamples.sort((a, b) => a.time - b.time);

  const respSamples = respRes.records
    .map((r) => ({ time: new Date(r.time).getTime(), rate: r.rate }))
    .sort((a, b) => a.time - b.time);

  const durationTrend: SleepDashboardData['durationTrend'] = [];
  const regularityTrend: SleepDashboardData['regularityTrend'] = [];
  const sleepHRTrend: SleepDashboardData['sleepHRTrend'] = [];
  const breathingTrend: SleepDashboardData['breathingTrend'] = [];

  const sortedKeys = [...sessionsByWakeDate.keys()].sort(); // oldest → newest

  for (const key of sortedKeys) {
    const session = sessionsByWakeDate.get(key)!;
    const startMs = session.startTime.getTime();
    const endMs = session.endTime.getTime();
    const wakeDate = new Date(session.endTime);
    wakeDate.setHours(0, 0, 0, 0);

    // Stage minutes for the duration trend.
    let deep = 0;
    let rem = 0;
    let light = 0;
    let awake = 0;
    if (session.stages) {
      for (const stage of session.stages) {
        const mins = Math.round(
          (new Date(stage.endTime).getTime() - new Date(stage.startTime).getTime()) / 60000,
        );
        switch (stage.stage) {
          case 1:
          case 3:
            awake += mins;
            break;
          case 2:
          case 4:
            light += mins;
            break;
          case 5:
            deep += mins;
            break;
          case 6:
            rem += mins;
            break;
        }
      }
    } else {
      // No stage detail — count the whole session as light sleep.
      light = Math.round((endMs - startMs) / 60000);
    }
    durationTrend.push({
      date: wakeDate,
      deepMinutes: deep,
      remMinutes: rem,
      lightMinutes: light,
      awakeMinutes: awake,
    });

    // Bedtime / wake — minutes since 21:00 the prior evening.
    const minutesSince21 = (d: Date): number => {
      const hr = d.getHours();
      const m = d.getMinutes();
      // 21:00 previous evening = anchor. If d.hours >= 21 it's the same day,
      // otherwise it's the morning side and we add 24h.
      const offset = hr >= 21 ? 0 : 24 * 60;
      return hr * 60 + m - 21 * 60 + offset;
    };
    regularityTrend.push({
      date: wakeDate,
      bedtimeMinutes: minutesSince21(session.startTime),
      wakeMinutes: minutesSince21(session.endTime),
    });

    // Sleep HR average within the session window.
    let hrSum = 0;
    let hrCount = 0;
    for (const s of allHRSamples) {
      if (s.time < startMs) continue;
      if (s.time > endMs) break;
      hrSum += s.bpm;
      hrCount++;
    }
    if (hrCount > 0) {
      sleepHRTrend.push({ date: wakeDate, value: Math.round(hrSum / hrCount) });
    }

    // Breathing rate average within the same window.
    let respSum = 0;
    let respCount = 0;
    for (const s of respSamples) {
      if (s.time < startMs) continue;
      if (s.time > endMs) break;
      respSum += s.rate;
      respCount++;
    }
    if (respCount > 0) {
      breathingTrend.push({
        date: wakeDate,
        value: Math.round((respSum / respCount) * 10) / 10,
      });
    }
  }

  return { durationTrend, regularityTrend, sleepHRTrend, breathingTrend };
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
export interface WeightSample {
  /** Time of the reading (UTC). */
  time: Date;
  /** Body weight in kilograms. */
  kg: number;
}

/**
 * Read body-weight records from Health Connect over the last `days` days
 * (today inclusive). Returned oldest → newest. Empty array when permissions
 * aren't granted, no scale is connected, or no readings fall in the window.
 *
 * Health Connect retains weight indefinitely from any source that writes it
 * (Garmin Connect, Renpho, Withings, manual entry from any companion app),
 * so a 30-day window typically returns plenty of points for the trend.
 */
export async function getWeightHistory(days: number): Promise<WeightSample[]> {
  assertInitialized();
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - days);
  const result = await readRecords('Weight', {
    timeRangeFilter: {
      operator: 'between' as const,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    },
  }).catch(() => ({ records: [] as Array<{ time: string; weight: { inKilograms: number } }> }));

  return result.records
    .map((r) => ({
      time: new Date(r.time),
      kg: r.weight.inKilograms,
    }))
    .sort((a, b) => a.time.getTime() - b.time.getTime());
}

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
  workoutKcalByDate?: Record<string, number>,
  vo2max?: number | null,
  /**
   * Optional 42-day daily-TRIMP history pulled from the API (oldest → newest,
   * today last; missing days as null → treated as 0). When supplied, drives
   * the PMC layer instead of the local 7-day HC slice — that's what lets CTL
   * actually mature past the calibrating threshold. We splice today's freshly
   * computed TRIMP into the last position so the rolling EMA always reflects
   * the latest data.
   */
  trimpHistory42d?: { date: string; dailyTrimp: number | null }[] | null,
  /**
   * Today's workouts (subset of WorkoutLog) — used to build the daily
   * events list on the BioCharge sub-tab. Each event renders as a row with
   * a -BioCharge delta proportional to the session.
   */
  todaysWorkouts?: {
    type: string;
    startedAt: Date;
    completedAt: Date | null;
    durationSeconds: number | null;
    caloriesBurned: number | null;
  }[],
): Promise<TodayDailyStats | null> {
  const today = new Date();
  const sixDaysAgo = new Date();
  sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);

  const range = await getDailyStats(sixDaysAgo, today, userProfile, workoutKcalByDate);
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

  const ageYears = userProfile
    ? ageYearsFromDob(userProfile.dateOfBirth)
    : null;

  // Performance Management Chart. Prefer the 42-day persisted history (so
  // CTL actually matures past calibration) and splice today's freshly
  // computed TRIMP into the last slot. Falls back to the local 7-day HC
  // slice when the API call hasn't run yet (cold start).
  const trimpSeries = (() => {
    if (trimpHistory42d && trimpHistory42d.length > 0) {
      const series = trimpHistory42d.map((d) => d.dailyTrimp ?? 0);
      // Last entry is today — overwrite with the freshly computed value.
      const todayTrimp = todayRecord.dailyTrimp;
      if (todayTrimp != null) {
        series[series.length - 1] = todayTrimp;
      }
      return series;
    }
    return range.map((d) => d.dailyTrimp ?? 0);
  })();
  const pmc = computePMC(trimpSeries);

  // Daily TRIMP target — 1.6 × CTL once mature, else VO₂max + age fallback.
  // Matches Zepp parity (CTL=72 → target=116, ratio 1.61).
  const personalisedTarget = dailyEffortTarget({
    ctl: pmc.ctl,
    ctlCalibrating: pmc.calibrating,
    vo2max: vo2max ?? null,
    ageYears,
  });

  // Rescale today's effort ring against the new TRIMP target.
  const rescaledEffortScore =
    todayRecord.dailyTrimp !== null && personalisedTarget > 0
      ? Math.min(
          100,
          Math.round((todayRecord.dailyTrimp / personalisedTarget) * 100),
        )
      : null;

  // Suppress the unused legacy fallback (kept exported for back-compat).
  void personalisedEffortTarget;

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

  // ─────────── BioCharge sub-tab — wake score, intraday, events, history
  const wakeReadiness = readinessScore({
    hrvToday: todayRecord.hrvRmssd,
    hrvBaseline,
    rhrToday: todayRecord.heartRateResting,
    rhrBaseline,
    sleepScore: todayRecord.sleepScore,
    recentLoad: load,
    baselineDays,
    todayEarnedMinutes: 0, // pre-drain — this is the morning peak
  });

  const sleepWindow = await getSleepSummary(today).catch(() => null);
  const wakeMinute =
    sleepWindow?.endTime != null
      ? sleepWindow.endTime.getHours() * 60 + sleepWindow.endTime.getMinutes()
      : 8 * 60; // sensible default if no sleep data
  const todayHRSamples = userProfile
    ? await getDayHRSamples(today).catch(() => [] as EffortHRSample[])
    : [];
  const todayMaxHR = userProfile
    ? calculateMaxHR(ageYearsFromDob(userProfile.dateOfBirth))
    : null;
  const cumEffort =
    todayHRSamples.length >= 2 &&
    todayRecord.heartRateResting != null &&
    todayMaxHR != null
      ? cumulativeEffortMinutes({
          samples: todayHRSamples,
          restingHR: todayRecord.heartRateResting,
          maxHR: todayMaxHR,
        })
      : [];
  const now = new Date();
  const nowMinute = now.getHours() * 60 + now.getMinutes();
  const intraday =
    wakeReadiness.score != null
      ? intradayBioCharge({
          wakeScore: wakeReadiness.score,
          wakeMinute,
          effortByMinute: cumEffort,
          nowMinute,
        })
      : [];

  // Build today's events — last sleep + workouts.
  const events: TodayDailyStats['bioChargeEvents'] = [];
  if (sleepWindow) {
    events.push({
      kind: 'sleep',
      label: 'Sleep',
      delta: sleepContribution(todayRecord.sleepScore),
      startTime: sleepWindow.startTime,
      endTime: sleepWindow.endTime,
    });
  }
  for (const w of todaysWorkouts ?? []) {
    if (w.completedAt == null) continue;
    // Drain heuristic: 0.3 BioCharge per minute of session — calibrated so
    // a 60-min session ≈ -18 points, matching the readiness-drain coefficient
    // applied to a typical effort-minutes contribution.
    const durationMin =
      w.durationSeconds != null ? w.durationSeconds / 60 : 30;
    const drain = Math.round(durationMin * 0.3);
    events.push({
      kind: 'workout',
      label: WORKOUT_LABEL[w.type] ?? 'Workout',
      delta: -drain,
      startTime: w.startedAt,
      endTime: w.completedAt,
    });
  }
  events.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  // 7-day recovery + HRV + RHR history. Recovery for historical days is
  // re-computed using the same baselines as today (no per-day baseline
  // back-projection — fine for charting, the trend is the signal anyway).
  const recoveryHistory7Days = range.map((d) => {
    if (d === todayRecord) {
      return {
        date: d.date,
        recoveryScore: wakeReadiness.score,
        hrv: d.hrvRmssd,
        rhr: d.heartRateResting,
      };
    }
    const r = readinessScore({
      hrvToday: d.hrvRmssd,
      hrvBaseline,
      rhrToday: d.heartRateResting,
      rhrBaseline,
      sleepScore: d.sleepScore,
      recentLoad: 0,
      baselineDays,
      todayEarnedMinutes: 0,
    });
    return {
      date: d.date,
      recoveryScore: r.score,
      hrv: d.hrvRmssd,
      rhr: d.heartRateResting,
    };
  });

  const effortLoad7Days = range.map((d) => ({
    date: d.date,
    trimp: d.dailyTrimp,
  }));

  const paiHistory7Days = range.map((d) => ({
    date: d.date,
    pai: d.dailyPAI,
  }));
  const paiTotal = weeklyPAI(paiHistory7Days.map((d) => d.pai));

  // Body weight — best-effort, latest reading + 30-day series for the modal.
  const weightHistory30Days = await getWeightHistory(30).catch(() => []);
  const latestWeightKg =
    weightHistory30Days.length > 0
      ? weightHistory30Days[weightHistory30Days.length - 1]!.kg
      : null;

  // 7-day sleep dashboard (duration / regularity / sleep HR / breathing).
  const sleepDashboardData = await getSleepDashboardData(today).catch(
    () => ({
      durationTrend: [],
      regularityTrend: [],
      sleepHRTrend: [],
      breathingTrend: [],
    } as SleepDashboardData),
  );

  return {
    ...todayRecord,
    effortScore: rescaledEffortScore,
    effortTargetMinutes: personalisedTarget,
    recoveryScore: readiness.score,
    readinessCalibrating: readiness.calibrating,
    readinessBaselineDays: baselineDays,
    recentLoad: load,
    effortLoad7Days,
    ctl: pmc.ctl,
    atl: pmc.atl,
    tsb: pmc.tsb,
    trainingStatusTier: pmc.tier,
    trainingStatusCalibrating: pmc.calibrating,
    trainingStatusDaysWithData: trimpSeries.filter((t) => t > 0).length,
    weeklyPAI: paiTotal,
    paiHistory7Days,
    latestWeightKg,
    weightHistory30Days,
    wakeBioChargeScore: wakeReadiness.score,
    sleepContributionPoints: sleepContribution(todayRecord.sleepScore),
    bioChargeIntraday: intraday,
    bioChargeEvents: events,
    recoveryHistory7Days,
    sleepDashboardData,
  };
}

