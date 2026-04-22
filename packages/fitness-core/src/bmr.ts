/**
 * Basal metabolic rate (BMR) calculations.
 *
 * Uses the Mifflin-St Jeor equation — the current clinical-consensus default
 * for estimating resting energy expenditure. This is the same formula Zepp,
 * Garmin, Fitbit, and Whoop all rely on.
 */

import type { Sex } from '@openfit/types';

export interface BMRInput {
  weightKg: number;
  heightCm: number;
  ageYears: number;
  sex: Sex;
}

/**
 * Compute daily BMR (kilocalories / day) using Mifflin-St Jeor.
 *
 *   Men:   10·W + 6.25·H − 5·A + 5
 *   Women: 10·W + 6.25·H − 5·A − 161
 */
export function computeBMR({ weightKg, heightCm, ageYears, sex }: BMRInput): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  return sex === 'male' ? base + 5 : base - 161;
}

/**
 * Prorate a daily BMR over the portion of the day that has elapsed. Useful
 * when subtracting resting energy from a partial-day TotalCaloriesBurned
 * reading — a full-day BMR would overestimate the resting component and make
 * active calories look smaller than they should.
 */
export function bmrCaloriesElapsed(
  bmrPerDay: number,
  now: Date = new Date(),
): number {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const elapsedMinutes = (now.getTime() - startOfDay.getTime()) / 60000;
  const dayMinutes = 24 * 60;
  return bmrPerDay * (elapsedMinutes / dayMinutes);
}

export function ageYearsFromDob(dob: Date, now: Date = new Date()): number {
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
}
