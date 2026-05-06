/**
 * Energy expenditure estimates for workouts.
 *
 * The primary method is Keytel et al. (2005) — sex-specific regression that
 * converts heart rate + weight + age into kcal/min. Polar and several
 * clinical-grade HR devices use the same formula.
 *
 *   Men:   kcal/min = (−55.0969 + 0.6309·HR + 0.1988·W + 0.2017·A) / 4.184
 *   Women: kcal/min = (−20.4022 + 0.4472·HR − 0.1263·W + 0.0740·A) / 4.184
 *
 * Height isn't in the formula — exercise energy from HR is driven by weight
 * and metabolic response, not stature. (Height matters for BMR, not here.)
 */

import type { Sex } from '@openfit/types';

export interface HeartRateSampleInput {
  timestamp: Date;
  bpm: number;
}

export interface CaloriesFromHRInput {
  samples: HeartRateSampleInput[];
  weightKg: number;
  ageYears: number;
  sex: Sex;
}

/**
 * Per-minute calorie burn at a given heart rate (Keytel 2005 without VO2max).
 * Clamped at zero — low HRs can produce negative values that are meaningless
 * for active exercise.
 */
export function keytelKcalPerMinute({
  bpm,
  weightKg,
  ageYears,
  sex,
}: {
  bpm: number;
  weightKg: number;
  ageYears: number;
  sex: Sex;
}): number {
  const kj =
    sex === 'male'
      ? -55.0969 + 0.6309 * bpm + 0.1988 * weightKg + 0.2017 * ageYears
      : -20.4022 + 0.4472 * bpm - 0.1263 * weightKg + 0.0740 * ageYears;
  return Math.max(0, kj / 4.184);
}

/**
 * Integrate Keytel over a list of HR samples to get total calories burned.
 * Each sample contributes (kcal/min at its HR) × (seconds to next sample),
 * so uneven sampling rates or pauses are handled correctly.
 *
 * The final sample's contribution uses the median inter-sample gap as its
 * interval — the alternative (drop it) loses calories if the workout ends
 * right after the last sample was recorded.
 */
export function computeCaloriesFromHRSamples({
  samples,
  weightKg,
  ageYears,
  sex,
}: CaloriesFromHRInput): number {
  if (samples.length === 0) return 0;

  const sorted = [...samples].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  );

  if (sorted.length === 1) {
    // No interval to integrate over — assume 1 minute of exposure.
    return keytelKcalPerMinute({ bpm: sorted[0]!.bpm, weightKg, ageYears, sex });
  }

  const intervalsMs: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    intervalsMs.push(sorted[i]!.timestamp.getTime() - sorted[i - 1]!.timestamp.getTime());
  }

  // Use the median inter-sample gap as the final-sample interval.
  const sortedIntervals = [...intervalsMs].sort((a, b) => a - b);
  const medianMs = sortedIntervals[Math.floor(sortedIntervals.length / 2)]!;

  let totalKcal = 0;
  for (let i = 0; i < sorted.length; i++) {
    const intervalMs = i < sorted.length - 1 ? intervalsMs[i]! : medianMs;
    const minutes = intervalMs / 60000;
    totalKcal += keytelKcalPerMinute({
      bpm: sorted[i]!.bpm,
      weightKg,
      ageYears,
      sex,
    }) * minutes;
  }

  return totalKcal;
}

/**
 * MET-based fallback for activities without HR data.
 *
 *   kcal = MET × weight(kg) × hours
 *
 * Rough reference values (Compendium of Physical Activities, 2011):
 *   - Strength training (general)   ≈ 6.0 METs
 *   - Jiu-jitsu / grappling         ≈ 10.3 METs
 *   - Running 9 km/h (6:40/km)      ≈ 9.8 METs
 *   - Running 12 km/h (5:00/km)     ≈ 11.5 METs
 */
export function computeCaloriesFromMET({
  mets,
  weightKg,
  durationSeconds,
}: {
  mets: number;
  weightKg: number;
  durationSeconds: number;
}): number {
  const hours = durationSeconds / 3600;
  return mets * weightKg * hours;
}

/**
 * Casual (non-workout) active calories from step count, weight-scaled.
 *
 * Reference: a 68 kg adult walking burns ≈ 0.04 kcal per step at average
 * pace (well-cited pedometer estimate, e.g. ACSM). Energy burnt walking
 * scales near-linearly with body mass, so we scale by `weightKg / 68`.
 *
 * This intentionally ignores intensity. For workouts, use the HR-based
 * Keytel integrator (`computeCaloriesFromHRSamples`) and add its kcal on
 * top — this function is for the casual movement that fills the gap
 * between explicit workout sessions.
 *
 *   80 kg, 2086 steps  → 2086 × 0.04 × (80/68)  ≈ 98 kcal
 *   65 kg, 8000 steps  → 8000 × 0.04 × (65/68)  ≈ 306 kcal
 */
export function activeKcalFromSteps(
  steps: number,
  weightKg: number,
): number {
  if (steps <= 0 || weightKg <= 0) return 0;
  return steps * 0.04 * (weightKg / 68);
}
