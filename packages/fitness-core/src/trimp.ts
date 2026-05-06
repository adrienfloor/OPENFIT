/**
 * Banister Training Impulse (TRIMP) — the standard training-load metric
 * used by TrainingPeaks, WKO, Zepp, Garmin Firstbeat, and most published
 * sport-science tooling. Integrates HR-reserve fraction over time with a
 * sex-specific exponential weighting so high-intensity minutes count
 * disproportionately more than low-intensity ones.
 *
 *   TRIMP_per_min(male)   = HRR · 0.64 · e^(1.92 · HRR)
 *   TRIMP_per_min(female) = HRR · 0.86 · e^(1.67 · HRR)
 *
 * where HRR = (HR_avg − HR_rest) / (HR_max − HR_rest), clamped to [0, 1].
 *
 * Reference: Banister EW. "Modeling elite athletic performance." Physiological
 * Testing of Elite Athletes (1991), and Morton/Fitz-Clarke/Banister (1990).
 *
 * Daily TRIMP is the sum across the day. Typical scale:
 *   - sedentary day:                 0–30
 *   - light activity day:           30–80
 *   - 1h moderate session:          80–150
 *   - 1h hard / interval session:  150–300
 *   - long endurance / race day:   300–800+
 */

import type { EffortHRSample } from './scores';

export interface DailyTrimpInput {
  /** 24h HR samples — unevenly spaced is fine. */
  samples: EffortHRSample[];
  /** Resting HR for the HRR (Karvonen) calculation. */
  restingHR: number;
  /** Age-predicted max HR, e.g. `calculateMaxHR(age)` from heart-rate.ts. */
  maxHR: number;
  /** Sex — Banister coefficients differ. */
  sex: 'male' | 'female';
  /**
   * Gaps larger than this (in minutes) between consecutive samples are
   * dropped — treats device-off windows as "no data", not as a long block at
   * the last recorded HR. Default 10.
   */
  maxGapMinutes?: number;
}

const COEFFS = {
  male: { a: 0.64, b: 1.92 },
  female: { a: 0.86, b: 1.67 },
} as const;

/**
 * Banister TRIMP weight per minute at a given HRR fraction.
 * HRR is clamped to [0, 1] — values below resting count as 0, values above
 * max HR are capped at 1.
 */
export function trimpPerMinute(hrrFraction: number, sex: 'male' | 'female'): number {
  const hrr = Math.max(0, Math.min(1, hrrFraction));
  const { a, b } = COEFFS[sex];
  return hrr * a * Math.exp(b * hrr);
}

/**
 * Sum Banister TRIMP across a day's HR samples. Linear-interpolates over
 * each gap (treats consecutive samples as a constant-HR segment at their
 * midpoint, same approach as effortScore).
 *
 * Returns rounded TRIMP units (typically 0–800).
 */
export function dailyTrimp({
  samples,
  restingHR,
  maxHR,
  sex,
  maxGapMinutes = 10,
}: DailyTrimpInput): number {
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
    total += gapMinutes * trimpPerMinute(hrrFraction, sex);
  }

  return Math.round(total);
}
