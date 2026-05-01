/**
 * Nutrition helpers — pure aggregation + balance math used by both the
 * mobile Today card and (later) the API's day-totals endpoint.
 *
 * Macros are stored per-item in absolute grams/kcal (already multiplied by
 * portion), so summing is straightforward.
 */

import type { FoodItem, FoodLog, MacroTotals } from '@openfit/types';

/**
 * Sum macros across a list of items. Useful both for computing per-meal
 * totals from the AI's per-item output and for daily aggregation across
 * multiple FoodLogs.
 */
export function sumItems(items: ReadonlyArray<FoodItem>): MacroTotals {
  const totals: MacroTotals = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  for (const it of items) {
    totals.kcal += it.kcal;
    totals.proteinG += it.proteinG;
    totals.carbsG += it.carbsG;
    totals.fatG += it.fatG;
  }
  return roundTotals(totals);
}

/** Sum a day's worth of FoodLog totals. */
export function sumDayTotals(logs: ReadonlyArray<Pick<FoodLog, 'totals'>>): MacroTotals {
  const totals: MacroTotals = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  for (const l of logs) {
    totals.kcal += l.totals.kcal;
    totals.proteinG += l.totals.proteinG;
    totals.carbsG += l.totals.carbsG;
    totals.fatG += l.totals.fatG;
  }
  return roundTotals(totals);
}

export interface CalorieBalanceInput {
  /** kcal eaten so far today. */
  intakeKcal: number;
  /** Mifflin-St Jeor BMR for the full day. */
  bmrKcal: number;
  /** Active-calories estimate for the day so far (workouts, NEAT). */
  activeKcal: number;
  /**
   * Fraction of the day elapsed (0–1). Used to prorate BMR when computing a
   * mid-day balance — full-day BMR vs partial-day intake would always show a
   * deficit in the morning. Defaults to 1 (end-of-day balance).
   */
  dayFraction?: number;
}

export interface CalorieBalance {
  intakeKcal: number;
  expenditureKcal: number;
  /** intake − expenditure. Positive = surplus, negative = deficit. */
  balanceKcal: number;
}

/**
 * Compute today's calorie balance. Expenditure = BMR (prorated) + active.
 * BMR is prorated so the balance is meaningful at any point during the day.
 */
export function calorieBalance({
  intakeKcal,
  bmrKcal,
  activeKcal,
  dayFraction = 1,
}: CalorieBalanceInput): CalorieBalance {
  const proratedBMR = bmrKcal * Math.max(0, Math.min(1, dayFraction));
  const expenditureKcal = proratedBMR + activeKcal;
  return {
    intakeKcal: Math.round(intakeKcal),
    expenditureKcal: Math.round(expenditureKcal),
    balanceKcal: Math.round(intakeKcal - expenditureKcal),
  };
}

/**
 * Suggest a default macro split when the user hasn't set explicit targets.
 * Uses a 30/40/30 P/C/F kcal split — a sensible aesthetic-leaning baseline
 * that the user can override anytime. Caller decides the kcal target
 * (typically BMR × activity multiplier ± deficit).
 */
export function defaultMacroTargets(kcalTarget: number): {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
} {
  // 4 kcal/g protein + carbs, 9 kcal/g fat.
  return {
    kcal: Math.round(kcalTarget),
    proteinG: Math.round((kcalTarget * 0.3) / 4),
    carbsG: Math.round((kcalTarget * 0.4) / 4),
    fatG: Math.round((kcalTarget * 0.3) / 9),
  };
}

function roundTotals(t: MacroTotals): MacroTotals {
  return {
    kcal: Math.round(t.kcal),
    proteinG: Math.round(t.proteinG * 10) / 10,
    carbsG: Math.round(t.carbsG * 10) / 10,
    fatG: Math.round(t.fatG * 10) / 10,
  };
}
