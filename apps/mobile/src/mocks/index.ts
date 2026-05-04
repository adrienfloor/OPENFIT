/**
 * Mock data hooks for metrics that don't yet have a real data source.
 *
 * Each hook returns the same shape its real version eventually will
 * (typed in `@openfit/types` later). Swapping in real data = replace the
 * hook body. UIs are built against these hooks so they don't change at
 * all when real data arrives.
 *
 * Naming convention: `useMockX` — every consumer is aware it's mock data
 * via the `useX` import path (`from '../mocks'`). When we ship the real
 * service we re-export the real hook from `services/x` under the same
 * name and delete the mocks entry.
 */

export interface TrendPoint {
  date: Date;
  value: number;
}

export interface VO2Max {
  current: number;
  label: string;
  trend7Days: TrendPoint[];
}

export interface FatigueLoad {
  current: number;
  /** Negative = recovered, positive = accumulating fatigue. */
  status: 'recovered' | 'balanced' | 'productive' | 'overreaching';
  trend7Days: TrendPoint[];
}

export interface TrainingStatus {
  current: number;
  label: string;
  trend7Days: TrendPoint[];
}

export interface PAI {
  current: number;
  todayDelta: number;
  trend7Days: TrendPoint[];
}

export interface WeightTrend {
  current: number;
  trend30Days: TrendPoint[];
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function sevenDayTrend(values: number[]): TrendPoint[] {
  return values.map((value, i) => ({ date: daysAgo(6 - i), value }));
}

export function useMockVO2Max(): VO2Max {
  return {
    current: 48,
    label: 'Good',
    trend7Days: sevenDayTrend([47, 47, 48, 48, 48, 48, 48]),
  };
}

export function useMockFatigueLoad(): FatigueLoad {
  return {
    current: 74,
    status: 'balanced',
    trend7Days: sevenDayTrend([73, 75, 92, 95, 86, 66, 74]),
  };
}

export function useMockTrainingStatus(): TrainingStatus {
  return {
    current: -4,
    label: 'Balanced',
    trend7Days: sevenDayTrend([-14, -9, -16, -16, -9, 3, -4]),
  };
}

export function useMockPAI(): PAI {
  return {
    current: 178,
    todayDelta: 22,
    trend7Days: sevenDayTrend([110, 130, 145, 160, 168, 170, 178]),
  };
}

export interface IntradayPoint {
  /** Minutes since local midnight. */
  minute: number;
  value: number;
}

export interface DailyEvent {
  kind: 'sleep' | 'workout';
  label: string;
  /** Positive = added BioCharge, negative = consumed it. */
  delta: number;
  startTime: Date;
  endTime: Date;
}

export interface BioChargeDashboard {
  /** Latest score, 0-100. Real version reads from today.recoveryScore. */
  current: number;
  lastUpdated: Date;
  /** BioCharge at wake — typically the day's peak. */
  wakeScore: number;
  /** Sleep contribution in BioCharge points. */
  sleepContribution: number;
  intraday: IntradayPoint[];
  events: DailyEvent[];
  /** Last 7 days. Index 0 = oldest, last = today. */
  wakeTrend7Days: TrendPoint[];
  hrvTrend7Days: TrendPoint[];
  rhrTrend7Days: TrendPoint[];
}

export function useMockBioCharge(latestScore: number | null): BioChargeDashboard {
  const score = latestScore ?? 58;
  const wake = Math.min(100, score + 20);

  // Intraday curve: starts climbing during sleep (00:00–08:00), plateaus
  // until early afternoon, dips after a midday workout, then drifts down
  // toward evening. Sample every 30 min.
  const intraday: IntradayPoint[] = [];
  for (let m = 0; m <= 24 * 60; m += 30) {
    const h = m / 60;
    let value: number;
    if (h <= 8) {
      // Sleep window — climbs from 65 to ~95.
      value = 65 + (h / 8) * 30;
    } else if (h <= 12) {
      // Morning plateau, gentle drift.
      value = 95 - (h - 8) * 0.5;
    } else if (h <= 14) {
      // Workout drop.
      value = 93 - (h - 12) * 18;
    } else {
      // Afternoon decay.
      value = Math.max(score, 57 + (16 - h) * 0.4);
    }
    intraday.push({ minute: m, value: Math.round(value) });
  }

  // 7-day mock series anchored on today's value.
  const wakeTrend7Days = sevenDayTrend([92, 87, 85, 82, 81, 77, wake]);
  const hrvTrend7Days = sevenDayTrend([67, 67, 69, 67, 71, 65, 71]);
  const rhrTrend7Days = sevenDayTrend([43, 46, 47, 47, 47, 47, 42]);

  // Today's events. Sleep contributed +35 BioCharge, mid-day cross-training
  // session burned −12.
  const today = new Date();
  const sleepStart = new Date(today);
  sleepStart.setDate(sleepStart.getDate() - 1);
  sleepStart.setHours(22, 19, 0, 0);
  const sleepEnd = new Date(today);
  sleepEnd.setHours(8, 11, 0, 0);
  const workoutStart = new Date(today);
  workoutStart.setHours(13, 8, 0, 0);
  const workoutEnd = new Date(today);
  workoutEnd.setHours(13, 44, 0, 0);

  const events: DailyEvent[] = [
    {
      kind: 'sleep',
      label: 'Sleep',
      delta: 35,
      startTime: sleepStart,
      endTime: sleepEnd,
    },
    {
      kind: 'workout',
      label: 'Cross-training',
      delta: -12,
      startTime: workoutStart,
      endTime: workoutEnd,
    },
  ];

  return {
    current: score,
    lastUpdated: new Date(),
    wakeScore: wake,
    sleepContribution: 35,
    intraday,
    events,
    wakeTrend7Days,
    hrvTrend7Days,
    rhrTrend7Days,
  };
}

export type SleepStage = 'awake' | 'light' | 'deep' | 'rem';

export interface SleepStageSegment {
  stage: SleepStage;
  /** Minutes since session start. */
  startMinute: number;
  endMinute: number;
}

export interface SleepStageBreakdown {
  date: Date;
  deepMinutes: number;
  remMinutes: number;
  lightMinutes: number;
  awakeMinutes: number;
}

export interface RegularityRange {
  date: Date;
  /** Bedtime as minutes since 21:00 the prior evening (so 60 = 22:00). */
  bedtimeMinutes: number;
  /** Wake time as minutes since 21:00 the prior evening. */
  wakeMinutes: number;
}

export interface SleepDashboard {
  score: number;
  scoreLabel: string;
  totalMinutes: number;
  deepMinutes: number;
  remMinutes: number;
  lightMinutes: number;
  awakeMinutes: number;
  awakeningCount: number;
  regularityPercent: number;
  startTime: Date;
  endTime: Date;
  stages: SleepStageSegment[];
  /** 7-day stage-stacked durations. */
  durationTrend: SleepStageBreakdown[];
  regularityTrend: RegularityRange[];
  sleepHRTrend: TrendPoint[];
  hypopneaTrend: TrendPoint[];
  breathingTrend: TrendPoint[];
}

/**
 * Generate a synthetic but realistic-looking hypnogram from coarse stage
 * minutes. We don't yet read the per-segment timeline from Health Connect,
 * so this samples a typical sleep architecture (light → deep early in the
 * night, REM bursts late, occasional awakenings) scaled to fit the
 * actual durations.
 */
function buildStageTimeline(input: {
  totalMinutes: number;
  deepMinutes: number;
  remMinutes: number;
  awakeMinutes: number;
  awakeningCount: number;
}): SleepStageSegment[] {
  const { totalMinutes, deepMinutes, remMinutes, awakeMinutes, awakeningCount } = input;
  const segments: SleepStageSegment[] = [];

  // Distribute 4 sleep cycles of ~90 min each. Each cycle: light → deep
  // (more in the first cycles, less later) → light → rem (more later).
  const cycles = Math.max(1, Math.round(totalMinutes / 90));
  const cycleMinutes = totalMinutes / cycles;

  let cursor = 0;
  for (let c = 0; c < cycles; c++) {
    // Deep is front-loaded — give the first cycle 40% of total deep, then
    // halve each subsequent cycle.
    const deepShare =
      c === 0 ? 0.4 : c === 1 ? 0.3 : c === 2 ? 0.2 : 0.1;
    const remShare =
      c === 0 ? 0.05 : c === 1 ? 0.15 : c === 2 ? 0.3 : 0.5;
    const cycleDeep = deepMinutes * deepShare;
    const cycleRem = remMinutes * remShare;
    const cycleLight = cycleMinutes - cycleDeep - cycleRem;

    // Stage order within a cycle: light → deep → light → rem → (light)
    const lightHalf = cycleLight / 2;
    const stages: { stage: SleepStage; mins: number }[] = [
      { stage: 'light', mins: lightHalf },
      { stage: 'deep', mins: cycleDeep },
      { stage: 'light', mins: lightHalf * 0.6 },
      { stage: 'rem', mins: cycleRem },
      { stage: 'light', mins: lightHalf * 0.4 },
    ];

    for (const s of stages) {
      if (s.mins <= 0) continue;
      segments.push({
        stage: s.stage,
        startMinute: cursor,
        endMinute: cursor + s.mins,
      });
      cursor += s.mins;
    }
  }

  // Insert awake segments — split the awake budget across `awakeningCount`
  // events placed at random-ish points (not first or last 30 min).
  const awakeBudget = awakeMinutes;
  const events = Math.max(1, awakeningCount);
  for (let i = 0; i < events; i++) {
    const at = 30 + ((i + 1) * (totalMinutes - 60)) / (events + 1);
    const dur = awakeBudget / events;
    segments.push({
      stage: 'awake',
      startMinute: at,
      endMinute: at + dur,
    });
  }

  // Sort + clip to total session length.
  segments.sort((a, b) => a.startMinute - b.startMinute);
  return segments
    .map((s) => ({
      ...s,
      endMinute: Math.min(s.endMinute, totalMinutes),
    }))
    .filter((s) => s.endMinute > s.startMinute);
}

export function useMockSleep(input: {
  score: number | null;
  totalMinutes: number | null;
}): SleepDashboard {
  const score = input.score ?? 70;
  const totalMinutes = input.totalMinutes ?? 480;

  // Distribute the duration across stages using typical proportions.
  const deepMinutes = Math.round(totalMinutes * 0.16);
  const remMinutes = Math.round(totalMinutes * 0.22);
  const awakeMinutes = 5;
  const awakeningCount = 2;
  const lightMinutes = totalMinutes - deepMinutes - remMinutes - awakeMinutes;

  // Last night's session — rough start/end derived from totalMinutes.
  const endTime = new Date();
  endTime.setHours(8, 11, 0, 0);
  const startTime = new Date(endTime.getTime() - totalMinutes * 60 * 1000);

  const stages = buildStageTimeline({
    totalMinutes,
    deepMinutes,
    remMinutes,
    awakeMinutes,
    awakeningCount,
  });

  const scoreLabel =
    score >= 85
      ? 'Excellent'
      : score >= 75
        ? 'Good'
        : score >= 60
          ? 'Fair'
          : 'Poor';

  // 7-day duration breakdown — varying durations with similar stage ratios.
  const durationTrend: SleepStageBreakdown[] = [];
  const sevenDayMinutes = [550, 470, 460, 500, 520, 560, totalMinutes];
  for (let i = 0; i < 7; i++) {
    const t = sevenDayMinutes[i]!;
    durationTrend.push({
      date: daysAgo(6 - i),
      deepMinutes: Math.round(t * 0.16),
      remMinutes: Math.round(t * 0.22),
      lightMinutes: Math.round(t * 0.6),
      awakeMinutes: Math.round(t * 0.02),
    });
  }

  // Regularity — bedtime/wake variations.
  const regularityTrend: RegularityRange[] = [
    { bedtimeMinutes: 62, wakeMinutes: 617 },
    { bedtimeMinutes: 109, wakeMinutes: 566 },
    { bedtimeMinutes: 119, wakeMinutes: 572 },
    { bedtimeMinutes: 74, wakeMinutes: 576 },
    { bedtimeMinutes: 90, wakeMinutes: 602 },
    { bedtimeMinutes: 192, wakeMinutes: 660 },
    { bedtimeMinutes: 79, wakeMinutes: 611 },
  ].map((r, i) => ({ date: daysAgo(6 - i), ...r }));

  return {
    score,
    scoreLabel,
    totalMinutes,
    deepMinutes,
    remMinutes,
    lightMinutes,
    awakeMinutes,
    awakeningCount,
    regularityPercent: 85,
    startTime,
    endTime,
    stages,
    durationTrend,
    regularityTrend,
    sleepHRTrend: sevenDayTrend([48, 45, 45, 47, 47, 48, 45]),
    hypopneaTrend: sevenDayTrend([4.4, 3.4, 3.2, 4.4, 3.8, 2.7, 3.8]),
    breathingTrend: sevenDayTrend([17.8, 17.5, 17.6, 17.7, 17.4, 17.6, 17.5]),
  };
}

export interface FitnessLevel {
  current: number;
  /** Trend in cyan in the screenshots — typically rises with consistent training. */
  trend7Days: TrendPoint[];
}

export function useMockFitnessLevel(): FitnessLevel {
  return {
    current: 70,
    trend7Days: sevenDayTrend([59, 66, 76, 79, 77, 69, 70]),
  };
}

export interface DailyActivity {
  kind: 'daily' | 'workout';
  label: string;
  /** Effort minutes earned. */
  earnedMinutes: number;
  startTime?: Date;
  endTime?: Date;
  /** Optional workout-log id so the row can drill into its detail. */
  workoutLogId?: string;
}

export function useMockTodayActivities(input: {
  earnedMinutes: number | null;
}): DailyActivity[] {
  // Split today's earned minutes between background daily activity and the
  // logged cross-training session shown in BioCharge mocks.
  const total = input.earnedMinutes ?? 92;
  const dailyShare = Math.max(0, Math.min(20, Math.round(total * 0.15)));
  const workoutShare = Math.max(0, total - dailyShare);

  const today = new Date();
  const start = new Date(today);
  start.setHours(13, 8, 0, 0);
  const end = new Date(today);
  end.setHours(13, 44, 0, 0);

  return [
    {
      kind: 'daily',
      label: 'Daily activity',
      earnedMinutes: dailyShare,
    },
    {
      kind: 'workout',
      label: 'Cross-training',
      earnedMinutes: workoutShare,
      startTime: start,
      endTime: end,
    },
  ];
}

export function useMockWeight(): WeightTrend {
  // 30-day downward trend with daily noise.
  const start = 80.5;
  const values: number[] = [];
  for (let i = 29; i >= 0; i--) {
    const trend = start - (29 - i) * 0.02;
    const noise = ((i * 7) % 5) * 0.05 - 0.1;
    values.push(Math.round((trend + noise) * 10) / 10);
  }
  const points: TrendPoint[] = values.map((value, i) => ({
    date: daysAgo(29 - i),
    value,
  }));
  return { current: points[points.length - 1]!.value, trend30Days: points };
}
