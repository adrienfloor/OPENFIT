import { describe, it, expect } from 'vitest';
import { calculatePace, formatPace, calculateElevationGain } from '../running.js';

describe('calculatePace', () => {
  it('calculates pace in seconds per km', () => {
    // 5km in 25 minutes = 300 sec/km = 5:00 /km
    const pace = calculatePace(5000, 1500);
    expect(pace).toBe(300);
  });

  it('returns null for zero distance', () => {
    expect(calculatePace(0, 60)).toBeNull();
  });

  it('throws for negative inputs', () => {
    expect(() => calculatePace(-100, 60)).toThrow(RangeError);
    expect(() => calculatePace(100, -60)).toThrow(RangeError);
  });
});

describe('formatPace', () => {
  it('formats seconds per km into mm:ss /km', () => {
    expect(formatPace(272)).toBe('4:32 /km');
    expect(formatPace(300)).toBe('5:00 /km');
    expect(formatPace(360)).toBe('6:00 /km');
  });

  it('pads seconds to two digits', () => {
    expect(formatPace(245)).toBe('4:05 /km');
  });

  it('throws for non-positive pace', () => {
    expect(() => formatPace(0)).toThrow(RangeError);
    expect(() => formatPace(-10)).toThrow(RangeError);
  });
});

describe('calculateElevationGain', () => {
  it('sums only uphill segments', () => {
    // Up 50m, down 30m, up 20m = net 70m gain
    const altitudes = [100, 150, 120, 140];
    expect(calculateElevationGain(altitudes)).toBe(70);
  });

  it('filters GPS jitter below 1m threshold', () => {
    const altitudes = [100, 100.5, 100, 100.5]; // 0.5m oscillation = jitter
    expect(calculateElevationGain(altitudes)).toBe(0);
  });

  it('returns 0 for flat route', () => {
    expect(calculateElevationGain([100, 100, 100])).toBe(0);
  });

  it('returns 0 for fewer than 2 points', () => {
    expect(calculateElevationGain([])).toBe(0);
    expect(calculateElevationGain([100])).toBe(0);
  });
});
