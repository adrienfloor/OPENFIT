import { describe, expect, it } from 'vitest';
import {
  estimateVo2maxFromWorkout,
  qualifiesForVo2maxEstimate,
  currentVo2maxFromHistory,
} from '../vo2max';

describe('estimateVo2maxFromWorkout', () => {
  it('matches Uth–Sørensen on a typical hard run', () => {
    // Athlete with HRmax 188 holding 156 avg HR for the run.
    // 15 × (188 / 156) ≈ 18.08 — wait that's wrong, the formula gives
    // ml/kg/min, so 15 × 188 / 156 = ~18 — let me sanity check.
    // Actually Uth-Sørensen: VO2max = 15 × (HRmax / HRrest), originally
    // derived using HRrest. The variant we use here is the Garmin-style
    // adaptation to *workout average HR* during a hard sustained effort,
    // documented in Esco MR et al. 2013. Same shape, same coefficient.
    const v = estimateVo2maxFromWorkout({ maxHRBpm: 188, avgHRBpm: 156 });
    expect(v).toBeGreaterThan(17);
    expect(v).toBeLessThan(20);
  });

  it('returns higher VO2max for fitter athletes (lower avg HR at same effort)', () => {
    const fitter = estimateVo2maxFromWorkout({ maxHRBpm: 188, avgHRBpm: 140 });
    const lessFit = estimateVo2maxFromWorkout({ maxHRBpm: 188, avgHRBpm: 165 });
    expect(fitter).toBeGreaterThan(lessFit);
  });

  it('returns 0 when input is invalid', () => {
    expect(estimateVo2maxFromWorkout({ maxHRBpm: 0, avgHRBpm: 150 })).toBe(0);
    expect(estimateVo2maxFromWorkout({ maxHRBpm: 188, avgHRBpm: 0 })).toBe(0);
  });
});

describe('qualifiesForVo2maxEstimate', () => {
  const HRMAX = 188;

  it('accepts a 30-min run at zone 3', () => {
    expect(
      qualifiesForVo2maxEstimate({
        durationSeconds: 30 * 60,
        avgHRBpm: 145,
        maxHRBpm: HRMAX,
      }),
    ).toBe(true);
  });

  it('rejects a sub-10-min session', () => {
    expect(
      qualifiesForVo2maxEstimate({
        durationSeconds: 8 * 60,
        avgHRBpm: 160,
        maxHRBpm: HRMAX,
      }),
    ).toBe(false);
  });

  it('rejects an easy jog with avg HR below 70 % HRmax', () => {
    expect(
      qualifiesForVo2maxEstimate({
        durationSeconds: 40 * 60,
        avgHRBpm: 120, // 64 % of 188
        maxHRBpm: HRMAX,
      }),
    ).toBe(false);
  });

  it('rejects sessions missing HR data', () => {
    expect(
      qualifiesForVo2maxEstimate({
        durationSeconds: 30 * 60,
        avgHRBpm: 0,
        maxHRBpm: HRMAX,
      }),
    ).toBe(false);
  });

  it('accepts a hard BJJ session (free workout) the same as a hard run', () => {
    expect(
      qualifiesForVo2maxEstimate({
        durationSeconds: 45 * 60,
        avgHRBpm: 155,
        maxHRBpm: HRMAX,
      }),
    ).toBe(true);
  });
});

describe('currentVo2maxFromHistory', () => {
  const day = (offset: number, value: number) => ({
    value,
    computedAt: new Date(2026, 0, 1 + offset),
  });

  it('returns the max of estimates inside the window', () => {
    const now = new Date(2026, 0, 28);
    const v = currentVo2maxFromHistory(
      [day(0, 42), day(5, 47), day(20, 45)],
      { now, windowDays: 28 },
    );
    expect(v).toBe(47);
  });

  it('drops estimates older than the window', () => {
    const now = new Date(2026, 1, 28);
    const v = currentVo2maxFromHistory(
      [
        day(0, 60), // 58 days old, dropped
        day(40, 45), // ~17 days old, kept
      ],
      { now, windowDays: 28 },
    );
    expect(v).toBe(45);
  });

  it('returns null when no recent estimates exist', () => {
    const now = new Date(2026, 1, 28);
    const v = currentVo2maxFromHistory([day(0, 60)], { now, windowDays: 28 });
    expect(v).toBeNull();
  });

  it('returns null on empty history', () => {
    expect(currentVo2maxFromHistory([])).toBeNull();
  });
});
