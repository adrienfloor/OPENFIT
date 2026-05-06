/**
 * Sleep dashboard types — shape consumed by the BioCharge → Sleep
 * sub-tab and its chart components (Hypnogram, RegularityBars,
 * StackedBars). Originally lived in `mocks/index.ts`; moved here once
 * the data became real so chart components don't import from a `mocks`
 * directory.
 */

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

export interface TrendPoint {
  date: Date;
  value: number;
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
  /** 7-day stage-stacked durations (oldest → newest, today last). */
  durationTrend: SleepStageBreakdown[];
  /** 7-day bedtime/wake-time ranges. */
  regularityTrend: RegularityRange[];
  /** 7-day sleeping heart-rate average. */
  sleepHRTrend: TrendPoint[];
  /** 7-day breathing-rate average (respirations per minute). */
  breathingTrend: TrendPoint[];
}
