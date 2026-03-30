import type { HeartRateZone } from '@openfit/types';

/**
 * Calculates age-predicted maximum heart rate using the Tanaka formula
 * (208 - 0.7 × age), which is more accurate than the classic 220-age formula
 * for adults over 40.
 */
export function calculateMaxHR(age: number): number {
  if (age <= 0 || age > 120) {
    throw new RangeError(`Age must be between 1 and 120, got ${age}`);
  }
  return Math.round(208 - 0.7 * age);
}

/**
 * Maps a heart rate reading to the corresponding training zone.
 * Zones are defined as percentages of maximum heart rate:
 * - rest:     < 50%
 * - fat_burn: 50–64%
 * - cardio:   65–79%
 * - peak:     80–89%
 * - max:      ≥ 90%
 */
export function getHeartRateZone(bpm: number, maxHR: number): HeartRateZone {
  if (bpm <= 0) throw new RangeError(`BPM must be positive, got ${bpm}`);
  if (maxHR <= 0) throw new RangeError(`Max HR must be positive, got ${maxHR}`);

  const pct = bpm / maxHR;

  if (pct < 0.5) return 'rest';
  if (pct < 0.65) return 'fat_burn';
  if (pct < 0.8) return 'cardio';
  if (pct < 0.9) return 'peak';
  return 'max';
}

/**
 * Calculates RMSSD (Root Mean Square of Successive Differences) HRV from
 * an array of RR intervals in milliseconds. RMSSD reflects parasympathetic
 * nervous system activity and is the standard short-term HRV metric.
 *
 * Requires at least 2 RR interval values.
 */
export function calculateHRV(rrIntervals: number[]): number {
  if (rrIntervals.length < 2) {
    throw new Error(`At least 2 RR intervals required, got ${rrIntervals.length}`);
  }
  for (const rr of rrIntervals) {
    if (rr <= 0) throw new RangeError(`RR interval must be positive, got ${rr}`);
  }

  let sumSquaredDiffs = 0;
  for (let i = 1; i < rrIntervals.length; i++) {
    const diff = (rrIntervals[i] as number) - (rrIntervals[i - 1] as number);
    sumSquaredDiffs += diff * diff;
  }

  return Math.sqrt(sumSquaredDiffs / (rrIntervals.length - 1));
}
