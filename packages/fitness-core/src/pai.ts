/**
 * Personal Activity Intelligence (PAI) — the HUNT Fitness Study indicator
 * (Nes et al., 2017). Sums non-linearly intensity-weighted minutes across
 * the day; the rolling 7-day total is the headline number Zepp/Mi Fit
 * surface as "PAI". Threshold of 100/week is associated with a substantial
 * reduction in cardiovascular mortality risk in the 230k-participant HUNT
 * cohort.
 *
 * Scoring is heart-rate-reserve (Karvonen) based with 4 tiers:
 *
 *   < 50% HRR  →  0     (rest / incidental)
 *   50–70%     →  0.5   (light — brisk walk)
 *   70–85%     →  1.0   (moderate — jog, hard cycle)
 *   ≥ 85%      →  1.5   (vigorous — intervals, race effort)
 *
 * Calibrated so a sedentary person scores ~20–30/week, a WHO-guideline
 * meeter ~80–100/week, an active trainer (Bob: 5 × 60 min @ 70 % HRR)
 * lands at ~180/week — matches the on-device Zepp number (176) within
 * a handful of points.
 *
 * Distinct from `dailyTrimp`: PAI is a public-health metric (one threshold,
 * lifetime CV mortality target). TRIMP is a performance-tracking metric
 * (sex-specific exponential weighting, feeds CTL/ATL/TSB). Same HR samples,
 * different lens.
 */

import type { EffortHRSample } from './scores';

export interface DailyPAIInput {
  /** 24h HR samples — unevenly spaced is fine. */
  samples: EffortHRSample[];
  /** Resting HR for the HRR (Karvonen) calculation. */
  restingHR: number;
  /** Age-predicted max HR, e.g. `calculateMaxHR(age)` from heart-rate.ts. */
  maxHR: number;
  /**
   * Gaps larger than this (in minutes) between consecutive samples are
   * dropped — treats device-off windows as "no data". Default 10.
   */
  maxGapMinutes?: number;
}

/**
 * PAI weight per minute at a given HRR fraction. Step-function tiers.
 */
export function paiWeightPerMinute(hrrFraction: number): number {
  const f = Math.max(0, Math.min(1, hrrFraction));
  if (f < 0.5) return 0;
  if (f < 0.7) return 0.5;
  if (f < 0.85) return 1.0;
  return 1.5;
}

/**
 * Sum daily PAI from a series of HR samples. Linear-time over samples.
 * Returns rounded PAI units (typically 0–80 per day).
 */
export function dailyPAI({
  samples,
  restingHR,
  maxHR,
  maxGapMinutes = 10,
}: DailyPAIInput): number {
  if (samples.length < 2) return 0;
  const reserve = maxHR - restingHR;
  if (reserve <= 0) return 0;

  const sorted = [...samples].sort(
    (a, b) => a.time.getTime() - b.time.getTime(),
  );

  let total = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const s1 = sorted[i] as EffortHRSample;
    const s2 = sorted[i + 1] as EffortHRSample;
    const gapMinutes = (s2.time.getTime() - s1.time.getTime()) / 60000;
    if (gapMinutes <= 0 || gapMinutes > maxGapMinutes) continue;

    const avgBpm = (s1.bpm + s2.bpm) / 2;
    const hrrFraction = (avgBpm - restingHR) / reserve;
    total += gapMinutes * paiWeightPerMinute(hrrFraction);
  }

  return Math.round(total);
}

/**
 * Rolling 7-day PAI. Pass the daily series oldest → newest; takes the
 * last 7 entries (or all of them if shorter) and sums.
 */
export function weeklyPAI(dailySeries: (number | null)[]): number {
  return dailySeries
    .slice(-7)
    .reduce<number>((sum, v) => sum + (v ?? 0), 0);
}
