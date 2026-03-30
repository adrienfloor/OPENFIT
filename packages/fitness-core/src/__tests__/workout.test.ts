import { describe, it, expect } from 'vitest';
import { estimateCaloriesBurned, calculateTrainingLoad, calculateRPE } from '../workout.js';
import type { WorkoutLog } from '@openfit/types';

describe('estimateCaloriesBurned', () => {
  it('returns a positive value for typical inputs', () => {
    const calories = estimateCaloriesBurned(45, 145, 75, 30);
    expect(calories).toBeGreaterThan(0);
  });

  it('throws for invalid inputs', () => {
    expect(() => estimateCaloriesBurned(0, 145, 75, 30)).toThrow(RangeError);
    expect(() => estimateCaloriesBurned(45, 0, 75, 30)).toThrow(RangeError);
    expect(() => estimateCaloriesBurned(45, 145, 0, 30)).toThrow(RangeError);
    expect(() => estimateCaloriesBurned(45, 145, 75, 0)).toThrow(RangeError);
  });

  it('returns higher calories for longer sessions', () => {
    const short = estimateCaloriesBurned(30, 140, 75, 30);
    const long = estimateCaloriesBurned(60, 140, 75, 30);
    expect(long).toBeGreaterThan(short);
  });
});

describe('calculateTrainingLoad', () => {
  it('returns 0 for empty sessions', () => {
    expect(calculateTrainingLoad([])).toBe(0);
  });

  it('calculates ACWR correctly', () => {
    const now = new Date();
    const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
    const makeSession = (daysBack: number, durationMinutes: number): WorkoutLog => ({
      id: `session-${daysBack}`,
      userId: 'user1',
      sessionId: null,
      startedAt: daysAgo(daysBack),
      completedAt: new Date(daysAgo(daysBack).getTime() + durationMinutes * 60 * 1000),
      heartRateData: [],
      exerciseLogs: [],
    });

    // 4 sessions over 28 days, each 60 minutes = 240 total chronic = 60/week avg
    // 2 sessions in last 7 days = 120 min acute
    // ACWR = 120 / 60 = 2.0
    const sessions = [
      makeSession(1, 60),
      makeSession(3, 60),
      makeSession(14, 60),
      makeSession(21, 60),
    ];

    const ratio = calculateTrainingLoad(sessions);
    expect(ratio).toBeCloseTo(2.0, 1);
  });
});

describe('calculateRPE', () => {
  it('returns on_target within ±1 RPE', () => {
    expect(calculateRPE(7, 7)).toBe('on_target');
    expect(calculateRPE(7, 8)).toBe('on_target');
    expect(calculateRPE(7, 6)).toBe('on_target');
  });

  it('returns overperformed when actual > planned + 1', () => {
    expect(calculateRPE(7, 9)).toBe('overperformed');
    expect(calculateRPE(5, 8)).toBe('overperformed');
  });

  it('returns underperformed when actual < planned - 1', () => {
    expect(calculateRPE(7, 5)).toBe('underperformed');
    expect(calculateRPE(9, 6)).toBe('underperformed');
  });
});
