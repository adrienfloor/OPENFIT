import type { WorkoutType } from '@openfit/types';

/**
 * VO₂max estimation from a single sustained run.
 *
 * The naive 15·HRmax/avgHR shape some apps quote is a misreading of
 * Uth–Sørensen 2004 (which uses HRmax/HRrest, not workout-average HR).
 * For a per-workout estimate, the principled approach Garmin (Firstbeat)
 * uses is the **ACSM running equation** scaled by relative HR effort:
 *
 *     VO₂_at_pace = 0.2 · speed_m_per_min + 3.5      (ACSM, flat ground)
 *     VO₂max     = VO₂_at_pace × (HRmax / avgHR)
 *
 * The intuition: ACSM gives the steady-state oxygen cost of running at a
 * given speed; if you held that speed at fraction `avgHR / HRmax` of your
 * heart's maximum, your peak capacity is the cost divided by that
 * fraction.
 *
 * For Bob's 3:54 Paris marathon (5:28/km avg, avgHR 168, peakHR 195) this
 * lands at ~46.5 ml/kg/min — matches what Garmin / Strava report on the
 * same effort.
 *
 * Non-run workouts can't yield a meaningful VO₂max via this method (no
 * accurate distance/pace), so the qualifying gate is run-only. Those
 * workouts still feed the broader Fitness Age via the activity / sleep /
 * lifting bonuses — they just don't move the VO₂max term.
 */

export interface Vo2maxRunInput {
  distanceMeters: number;
  durationSeconds: number;
  avgHRBpm: number;
  /** Observed peak HR over the workout (max of heartRateSamples), not the
   *  age-derived Tanaka estimate. Using observed peak makes the estimate
   *  self-calibrating — a workout that hits a higher HR than your previous
   *  ceiling refines HRmax. */
  peakHRBpm: number;
}

/**
 * Apply the ACSM-running equation scaled by relative-HR effort. Returns
 * ml O₂ / kg / min. Caller is responsible for filtering to qualifying
 * runs first via `qualifiesForVo2maxEstimate`.
 */
export function estimateVo2maxFromRun({
  distanceMeters,
  durationSeconds,
  avgHRBpm,
  peakHRBpm,
}: Vo2maxRunInput): number {
  if (durationSeconds <= 0 || avgHRBpm <= 0 || peakHRBpm <= 0) return 0;
  const speedMperMin = distanceMeters / (durationSeconds / 60);
  const acsmVo2 = 0.2 * speedMperMin + 3.5;
  const hrFraction = avgHRBpm / peakHRBpm;
  if (hrFraction <= 0) return 0;
  return acsmVo2 / hrFraction;
}

// Accepts any WorkoutType — the gate only returns true for 'run',
// everything else (strength, free, bike, swim, …) falls through.
export type WorkoutTypeForGate = WorkoutType;

export interface Vo2maxQualifyingInput {
  type: WorkoutTypeForGate;
  durationSeconds: number;
  distanceMeters: number | null;
  avgHRBpm: number;
  peakHRBpm: number;
}

/**
 * Per-workout VO₂max estimate is reliable only when:
 *   - the activity is a run (need accurate distance / steady speed)
 *   - duration ≥ 10 min (steady-state HR has settled)
 *   - avg HR is at least 70 % of peak (excludes warm-ups, recovery jogs)
 *   - distance is present and non-trivial
 */
export function qualifiesForVo2maxEstimate({
  type,
  durationSeconds,
  distanceMeters,
  avgHRBpm,
  peakHRBpm,
}: Vo2maxQualifyingInput): boolean {
  if (type !== 'run') return false;
  if (durationSeconds < 600) return false;
  if (distanceMeters == null || distanceMeters < 1500) return false;
  if (avgHRBpm <= 0 || peakHRBpm <= 0) return false;
  if (avgHRBpm < 0.7 * peakHRBpm) return false;
  return true;
}

/**
 * Pick today's representative VO₂max from a history of per-workout
 * estimates. Garmin / Strava both report the *best* recent estimate
 * rather than the average — peak capacity is peak capacity, not the
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
