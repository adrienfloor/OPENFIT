import type { WorkoutLog } from '@openfit/types';

/**
 * Estimates calories burned using the Keytel formula for heart-rate-based
 * caloric expenditure. More accurate than MET-based estimates because it
 * accounts for individual cardiovascular response to exercise intensity.
 *
 * Formula (males):    (-55.0969 + 0.6309×HR + 0.1988×W + 0.2017×A) / 4.184 × duration_min
 * This implementation uses the male formula as a baseline.
 */
export function estimateCaloriesBurned(
  durationMinutes: number,
  avgBpm: number,
  weightKg: number,
  age: number,
): number {
  if (durationMinutes <= 0) throw new RangeError(`Duration must be positive`);
  if (avgBpm <= 0) throw new RangeError(`Average BPM must be positive`);
  if (weightKg <= 0) throw new RangeError(`Weight must be positive`);
  if (age <= 0) throw new RangeError(`Age must be positive`);

  const caloriesPerMinute =
    (-55.0969 + 0.6309 * avgBpm + 0.1988 * weightKg + 0.2017 * age) / 4.184;

  // Clamp to non-negative — formula can produce negative values at very low heart rates
  return Math.max(0, caloriesPerMinute * durationMinutes);
}

/**
 * Calculates the Acute:Chronic Workload Ratio (ACWR) as a proxy for training load.
 * - Acute load = sum of workout durations (minutes) in the last 7 days
 * - Chronic load = average weekly load over the last 28 days
 *
 * A ratio between 0.8–1.3 is considered the "sweet spot" for adaptation.
 * Values above 1.5 indicate elevated injury risk.
 *
 * Returns 0 if there are no sessions (no chronic load to compare against).
 */
export function calculateTrainingLoad(sessions: WorkoutLog[]): number {
  if (sessions.length === 0) return 0;

  const now = new Date();
  const msPerDay = 1000 * 60 * 60 * 24;

  const acuteSessions = sessions.filter(
    (s) => (now.getTime() - s.startedAt.getTime()) / msPerDay <= 7,
  );
  const chronicSessions = sessions.filter(
    (s) => (now.getTime() - s.startedAt.getTime()) / msPerDay <= 28,
  );

  const sessionDurationMinutes = (s: WorkoutLog): number => {
    if (!s.completedAt) return 0;
    return (s.completedAt.getTime() - s.startedAt.getTime()) / (1000 * 60);
  };

  const acuteLoad = acuteSessions.reduce((sum, s) => sum + sessionDurationMinutes(s), 0);
  const chronicLoad = chronicSessions.reduce((sum, s) => sum + sessionDurationMinutes(s), 0) / 4;

  if (chronicLoad === 0) return 0;
  return acuteLoad / chronicLoad;
}

/**
 * Compares planned vs actual RPE to categorize session performance.
 * A ±1 RPE window is considered "on target" to account for normal day-to-day
 * variation in perceived exertion.
 */
export function calculateRPE(
  plannedRPE: number,
  actualRPE: number,
): 'underperformed' | 'on_target' | 'overperformed' {
  const delta = actualRPE - plannedRPE;
  if (delta < -1) return 'underperformed';
  if (delta > 1) return 'overperformed';
  return 'on_target';
}
