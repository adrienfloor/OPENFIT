/**
 * VO₂max estimation from a single HR-tracked sustained workout.
 *
 * Uth–Sørensen formula (Uth N. et al. 2004, Eur J Appl Physiol):
 *
 *     VO₂max ≈ 15 · (HRmax / avgHR)
 *
 * It estimates the user's *peak* aerobic capacity (ml O₂ / kg / min) from
 * the ratio of their max HR to their average HR during a sustained, mostly
 * aerobic effort. The intuition: someone whose heart can pump for 30 min
 * at 70 % of HRmax is fitter than someone who has to push to 90 % to keep
 * the same pace.
 *
 * The estimate is noisy on a single workout — that's why we only take the
 * *best* of the qualifying workouts in a recent window (the same approach
 * Garmin and Zepp use). One easy run won't drop your number.
 */

export interface Vo2maxEstimateInput {
  /** User's age-derived HRmax (Tanaka: 208 − 0.7·age, computed by caller). */
  maxHRBpm: number;
  /** Average HR over the qualifying portion of the workout. */
  avgHRBpm: number;
}

/**
 * Apply the Uth–Sørensen formula. The caller is responsible for filtering
 * to qualifying workouts via `qualifiesForVo2maxEstimate` first — running
 * this on a 5-minute warm-up returns garbage.
 */
export function estimateVo2maxFromWorkout({
  maxHRBpm,
  avgHRBpm,
}: Vo2maxEstimateInput): number {
  if (avgHRBpm <= 0 || maxHRBpm <= 0) return 0;
  return 15 * (maxHRBpm / avgHRBpm);
}

export interface Vo2maxQualifyingInput {
  durationSeconds: number;
  avgHRBpm: number;
  maxHRBpm: number;
}

/**
 * Gate for whether a workout's HR signal is rich enough to back out a
 * meaningful VO₂max estimate. Reject:
 *   - sub-10-minute sessions (too short for steady-state HR)
 *   - sessions whose average HR is below 70 % of HRmax (jogs, warm-ups)
 *   - sessions missing HR data
 *
 * These thresholds match the Norwegian HUNT cohort's inclusion criteria
 * for VO₂max regressions, which is where the population norms come from.
 */
export function qualifiesForVo2maxEstimate({
  durationSeconds,
  avgHRBpm,
  maxHRBpm,
}: Vo2maxQualifyingInput): boolean {
  if (durationSeconds < 600) return false;
  if (maxHRBpm <= 0 || avgHRBpm <= 0) return false;
  if (avgHRBpm < 0.7 * maxHRBpm) return false;
  return true;
}

/**
 * Pick today's representative VO₂max from a history of per-workout
 * estimates. Garmin / Zepp both report the *best* recent estimate rather
 * than the average — your peak capacity is your peak capacity, not your
 * mean of easy days.
 *
 * Window defaults to 28 days, mirroring Garmin's "current" definition.
 */
export function currentVo2maxFromHistory(
  estimates: Array<{ value: number; computedAt: Date }>,
  options: { now?: Date; windowDays?: number } = {},
): number | null {
  const { now = new Date(), windowDays = 28 } = options;
  const cutoff = new Date(now.getTime() - windowDays * 86_400_000);
  const recent = estimates.filter((e) => e.computedAt >= cutoff);
  if (recent.length === 0) return null;
  return Math.max(...recent.map((e) => e.value));
}
