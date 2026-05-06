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

