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

export interface AIInsight {
  /** Short one-liner shown collapsed. */
  headline: string;
  /** Longer paragraph shown when the card expands. */
  body: string;
  /** Bullet list of inputs feeding the model — surfaced for transparency. */
  inputs: string[];
  /** Window the insight is keyed on (morning / afternoon / evening). */
  window: 'morning' | 'afternoon' | 'evening';
  /** When this insight was generated. */
  generatedAt: Date;
}

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

/**
 * AI insight — three-window rotation. Real version will hit
 * `/insights/today?focus=overview&window=…` once Slice 9 ships.
 */
export function useMockAIInsight(): AIInsight {
  const hour = new Date().getHours();
  const window: AIInsight['window'] =
    hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  const morning: AIInsight = {
    window: 'morning',
    headline: 'Recovered well — go push it today.',
    body:
      'Your HRV is back near baseline and BioCharge is in the green. ' +
      'A high-effort training day is on the table — aim for the upper end ' +
      'of the prescribed RPE on your main lifts. Keep something in the ' +
      'tank for tomorrow if you have a session planned.',
    inputs: [
      'Sleep score 79',
      'HRV 71 ms (baseline 67)',
      'RHR 42 bpm',
      '3-day load: balanced',
    ],
    generatedAt: new Date(),
  };
  const afternoon: AIInsight = {
    window: 'afternoon',
    headline: 'Solid day — protein on point.',
    body:
      'You are tracking ahead of your protein target with calories in a ' +
      'mild deficit. If you train this evening, plan ~30 g of carbs in ' +
      'the next 90 min. Otherwise stay the course.',
    inputs: ['Calorie balance −410 kcal', 'Protein 126/197 g', 'Steps 4 380'],
    generatedAt: new Date(),
  };
  const evening: AIInsight = {
    window: 'evening',
    headline: 'Wind down — sleep is the multiplier.',
    body:
      'Today’s effort was meaningful; the gains compound during sleep. ' +
      'Cut bright screens within an hour of bedtime and aim for the same ' +
      'lights-out time as the past three nights to keep regularity high.',
    inputs: ['Effort 124/100', 'Avg bedtime last 3d: 22:15', 'Caffeine after 16:00 → none'],
    generatedAt: new Date(),
  };
  return window === 'morning' ? morning : window === 'afternoon' ? afternoon : evening;
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

export function useMockBioChargeInsight(): AIInsight {
  return {
    window: 'afternoon',
    headline: 'BioCharge holding steady — push or rest both work.',
    body:
      'Your BioCharge dropped 12 points during the cross-training block but recovered ' +
      'most of the buffer afterward. With ~6 hours of awake time left and HRV near ' +
      'baseline, a moderate evening session would only cost another ~10 points. ' +
      'Skip the session if tomorrow is a heavy training day.',
    inputs: [
      'Wake BioCharge 92',
      'Workout cost −12',
      'Current 58',
      'HRV 71 ms (baseline 67)',
    ],
    generatedAt: new Date(),
  };
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
