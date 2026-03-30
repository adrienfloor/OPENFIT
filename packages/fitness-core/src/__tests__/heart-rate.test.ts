import { describe, it, expect } from 'vitest';
import { calculateMaxHR, getHeartRateZone, calculateHRV } from '../heart-rate.js';

describe('calculateMaxHR', () => {
  it('uses Tanaka formula: 208 - 0.7 * age', () => {
    expect(calculateMaxHR(30)).toBe(187); // 208 - 21 = 187
    expect(calculateMaxHR(40)).toBe(180); // 208 - 28 = 180
    expect(calculateMaxHR(20)).toBe(194); // 208 - 14 = 194
  });

  it('throws for invalid ages', () => {
    expect(() => calculateMaxHR(0)).toThrow(RangeError);
    expect(() => calculateMaxHR(-5)).toThrow(RangeError);
    expect(() => calculateMaxHR(121)).toThrow(RangeError);
  });
});

describe('getHeartRateZone', () => {
  const maxHR = 190;

  it('returns rest below 50%', () => {
    expect(getHeartRateZone(90, maxHR)).toBe('rest'); // 47%
  });

  it('returns fat_burn at 50-64%', () => {
    expect(getHeartRateZone(100, maxHR)).toBe('fat_burn'); // 52.6%
    expect(getHeartRateZone(120, maxHR)).toBe('fat_burn'); // 63.2%
  });

  it('returns cardio at 65-79%', () => {
    expect(getHeartRateZone(130, maxHR)).toBe('cardio'); // 68.4%
    expect(getHeartRateZone(150, maxHR)).toBe('cardio'); // 78.9%
  });

  it('returns peak at 80-89%', () => {
    expect(getHeartRateZone(160, maxHR)).toBe('peak'); // 84.2%
    expect(getHeartRateZone(168, maxHR)).toBe('peak'); // 88.4%
  });

  it('returns max at 90%+', () => {
    expect(getHeartRateZone(171, maxHR)).toBe('max'); // 90%
    expect(getHeartRateZone(200, maxHR)).toBe('max'); // 105%
  });

  it('throws for invalid inputs', () => {
    expect(() => getHeartRateZone(0, maxHR)).toThrow(RangeError);
    expect(() => getHeartRateZone(100, 0)).toThrow(RangeError);
  });
});

describe('calculateHRV', () => {
  it('calculates RMSSD correctly', () => {
    // diffs: [10, -10, 10] → squared: [100, 100, 100] → mean: 100 → sqrt: 10
    const result = calculateHRV([800, 810, 800, 810]);
    expect(result).toBeCloseTo(10, 1);
  });

  it('returns 0 for perfectly regular rhythm', () => {
    expect(calculateHRV([800, 800, 800, 800])).toBe(0);
  });

  it('throws for fewer than 2 intervals', () => {
    expect(() => calculateHRV([800])).toThrow();
    expect(() => calculateHRV([])).toThrow();
  });

  it('throws for non-positive intervals', () => {
    expect(() => calculateHRV([800, 0])).toThrow(RangeError);
    expect(() => calculateHRV([-100, 800])).toThrow(RangeError);
  });
});
