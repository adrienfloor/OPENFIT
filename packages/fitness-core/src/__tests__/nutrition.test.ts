import { describe, it, expect } from 'vitest';
import {
  sumItems,
  sumDayTotals,
  calorieBalance,
  defaultMacroTargets,
} from '../nutrition';
import type { FoodItem, FoodLog } from '@openfit/types';

const item = (overrides: Partial<FoodItem> = {}): FoodItem => ({
  name: 'test',
  portionGrams: 100,
  kcal: 200,
  proteinG: 20,
  carbsG: 10,
  fatG: 5,
  ...overrides,
});

const log = (totals: FoodLog['totals'], loggedAt = new Date()): FoodLog => ({
  id: 'l',
  userId: 'u',
  photoUrl: null,
  items: [item()],
  totals,
  mealType: null,
  loggedAt,
  analysisId: null,
  createdAt: new Date(),
});

describe('sumItems', () => {
  it('sums macros across multiple items', () => {
    const totals = sumItems([
      item({ kcal: 100, proteinG: 10, carbsG: 5, fatG: 2 }),
      item({ kcal: 250, proteinG: 30, carbsG: 0, fatG: 12 }),
    ]);
    expect(totals.kcal).toBe(350);
    expect(totals.proteinG).toBe(40);
    expect(totals.carbsG).toBe(5);
    expect(totals.fatG).toBe(14);
  });

  it('returns zeros for empty input', () => {
    expect(sumItems([])).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  });

  it('rounds kcal to integer and macros to 0.1g', () => {
    const totals = sumItems([
      item({ kcal: 100.7, proteinG: 10.04, carbsG: 5.55, fatG: 2.49 }),
    ]);
    expect(totals.kcal).toBe(101);
    expect(totals.proteinG).toBe(10);
    expect(totals.carbsG).toBe(5.6);
    expect(totals.fatG).toBe(2.5);
  });
});

describe('sumDayTotals', () => {
  it('sums totals across multiple logs', () => {
    const totals = sumDayTotals([
      log({ kcal: 500, proteinG: 30, carbsG: 60, fatG: 15 }),
      log({ kcal: 800, proteinG: 50, carbsG: 100, fatG: 25 }),
      log({ kcal: 300, proteinG: 20, carbsG: 40, fatG: 8 }),
    ]);
    expect(totals.kcal).toBe(1600);
    expect(totals.proteinG).toBe(100);
    expect(totals.carbsG).toBe(200);
    expect(totals.fatG).toBe(48);
  });

  it('returns zeros when no logs', () => {
    expect(sumDayTotals([])).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  });
});

describe('calorieBalance', () => {
  it('shows surplus when intake exceeds expenditure', () => {
    const result = calorieBalance({
      intakeKcal: 2500,
      bmrKcal: 1700,
      activeKcal: 400,
      dayFraction: 1,
    });
    expect(result.intakeKcal).toBe(2500);
    expect(result.expenditureKcal).toBe(2100);
    expect(result.balanceKcal).toBe(400);
  });

  it('shows deficit when expenditure exceeds intake', () => {
    const result = calorieBalance({
      intakeKcal: 1200,
      bmrKcal: 1800,
      activeKcal: 500,
      dayFraction: 1,
    });
    expect(result.balanceKcal).toBe(-1100);
  });

  it('prorates BMR when called mid-day', () => {
    // Half-day: BMR contribution should halve.
    const result = calorieBalance({
      intakeKcal: 1000,
      bmrKcal: 2000,
      activeKcal: 200,
      dayFraction: 0.5,
    });
    // expenditure = 1000 + 200 = 1200; intake = 1000; balance = -200
    expect(result.expenditureKcal).toBe(1200);
    expect(result.balanceKcal).toBe(-200);
  });

  it('clamps dayFraction to [0, 1]', () => {
    const tooHigh = calorieBalance({
      intakeKcal: 0,
      bmrKcal: 1000,
      activeKcal: 0,
      dayFraction: 5,
    });
    expect(tooHigh.expenditureKcal).toBe(1000);

    const tooLow = calorieBalance({
      intakeKcal: 0,
      bmrKcal: 1000,
      activeKcal: 100,
      dayFraction: -1,
    });
    expect(tooLow.expenditureKcal).toBe(100);
  });

  it('defaults to end-of-day balance when dayFraction omitted', () => {
    const result = calorieBalance({
      intakeKcal: 2000,
      bmrKcal: 1700,
      activeKcal: 0,
    });
    expect(result.expenditureKcal).toBe(1700);
  });
});

describe('defaultMacroTargets', () => {
  it('produces a 30/40/30 P/C/F kcal split for a 2000 kcal target', () => {
    const targets = defaultMacroTargets(2000);
    expect(targets.kcal).toBe(2000);
    // 30% of 2000 = 600 kcal protein → 150g
    expect(targets.proteinG).toBe(150);
    // 40% of 2000 = 800 kcal carbs → 200g
    expect(targets.carbsG).toBe(200);
    // 30% of 2000 = 600 kcal fat → 67g (9 kcal/g)
    expect(targets.fatG).toBe(67);
  });

  it('rounds correctly for non-round kcal targets', () => {
    const targets = defaultMacroTargets(2333);
    expect(targets.kcal).toBe(2333);
    expect(targets.proteinG).toBe(Math.round((2333 * 0.3) / 4));
    expect(targets.carbsG).toBe(Math.round((2333 * 0.4) / 4));
    expect(targets.fatG).toBe(Math.round((2333 * 0.3) / 9));
  });
});
