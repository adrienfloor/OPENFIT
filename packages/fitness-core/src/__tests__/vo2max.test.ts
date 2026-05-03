import { describe, expect, it } from 'vitest';
import {
  estimateVo2maxFromRun,
  qualifiesForVo2maxEstimate,
  currentVo2maxFromHistory,
} from '../vo2max';

describe('estimateVo2maxFromRun (ACSM × HR-fraction)', () => {
  it("matches Garmin's range on a 3:54 marathon", () => {
    // Bob's Paris 2026: 42 750 m in 3:53:51 (14 031 s), avg HR 168, peak 195.
    // Expected ~46–48 ml/kg/min by Garmin / Strava on the same effort.
    const v = estimateVo2maxFromRun({
      distanceMeters: 42750,
      durationSeconds: 14031,
      avgHRBpm: 168,
      peakHRBpm: 195,
    });
    expect(v).toBeGreaterThan(45);
    expect(v).toBeLessThan(48);
  });

  it('reports higher VO₂max for a hard 5K than an easy long run at the same speed', () => {
    // Same speed (12 km/h = 200 m/min), but the 5K was paced at 95 % of HRmax
    // (low headroom → not much VO₂max above ACSM cost) vs the easy long run
    // at 75 % (large headroom → bigger projected VO₂max).
    const tempo = estimateVo2maxFromRun({
      distanceMeters: 5000,
      durationSeconds: 1500,
      avgHRBpm: 178,
      peakHRBpm: 188,
    });
    const easy = estimateVo2maxFromRun({
      distanceMeters: 5000,
      durationSeconds: 1500,
      avgHRBpm: 141,
      peakHRBpm: 188,
    });
    expect(easy).toBeGreaterThan(tempo);
  });

  it('returns 0 on bad input', () => {
    expect(estimateVo2maxFromRun({ distanceMeters: 0, durationSeconds: 0, avgHRBpm: 0, peakHRBpm: 0 })).toBe(0);
  });
});

describe('qualifiesForVo2maxEstimate', () => {
  const ok = {
    type: 'run' as const,
    durationSeconds: 30 * 60,
    distanceMeters: 6000,
    avgHRBpm: 158,
    peakHRBpm: 188,
  };

  it('accepts a 30-min run at zone 3', () => {
    expect(qualifiesForVo2maxEstimate(ok)).toBe(true);
  });

  it('rejects strength logs even with HR data', () => {
    expect(qualifiesForVo2maxEstimate({ ...ok, type: 'strength' })).toBe(false);
  });

  it('rejects free workouts (BJJ, climbing) — no accurate pace', () => {
    expect(qualifiesForVo2maxEstimate({ ...ok, type: 'free' })).toBe(false);
  });

  it('rejects sub-10-minute runs', () => {
    expect(qualifiesForVo2maxEstimate({ ...ok, durationSeconds: 8 * 60 })).toBe(false);
  });

  it('rejects runs without distance', () => {
    expect(qualifiesForVo2maxEstimate({ ...ok, distanceMeters: null })).toBe(false);
  });

  it('rejects easy jogs with avg HR below 70 % peak', () => {
    expect(
      qualifiesForVo2maxEstimate({ ...ok, avgHRBpm: 120, peakHRBpm: 188 }),
    ).toBe(false);
  });

  it('rejects sessions missing HR', () => {
    expect(qualifiesForVo2maxEstimate({ ...ok, avgHRBpm: 0 })).toBe(false);
    expect(qualifiesForVo2maxEstimate({ ...ok, peakHRBpm: 0 })).toBe(false);
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
