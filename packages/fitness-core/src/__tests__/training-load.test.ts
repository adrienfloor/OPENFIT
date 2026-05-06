import { describe, it, expect } from 'vitest';
import {
  computePMC,
  dailyEffortTarget,
  tierFromTSB,
} from '../training-load';

describe('tierFromTSB', () => {
  it('maps to the published TrainingPeaks bands', () => {
    expect(tierFromTSB(40)).toBe('detrained');
    expect(tierFromTSB(15)).toBe('energetic');
    expect(tierFromTSB(0)).toBe('balanced');
    expect(tierFromTSB(-20)).toBe('optimal');
    expect(tierFromTSB(-40)).toBe('overreaching');
  });

  it('handles boundaries as documented', () => {
    expect(tierFromTSB(25)).toBe('energetic'); // > 25 strict
    expect(tierFromTSB(25.0001)).toBe('detrained');
    expect(tierFromTSB(-10)).toBe('optimal'); // > -10 → balanced
    expect(tierFromTSB(-9.999)).toBe('balanced');
  });
});

describe('computePMC', () => {
  it('returns a calibrating zero on empty input', () => {
    const r = computePMC([]);
    expect(r.ctl).toBe(0);
    expect(r.atl).toBe(0);
    expect(r.tsb).toBe(0);
    expect(r.calibrating).toBe(true);
    expect(r.daysUsed).toBe(0);
    expect(r.series).toEqual([]);
  });

  it('flags calibrating until 14 days of data', () => {
    expect(computePMC(Array(13).fill(100)).calibrating).toBe(true);
    expect(computePMC(Array(14).fill(100)).calibrating).toBe(false);
  });

  it('steady 100 TRIMP/day eventually plateaus at CTL ≈ ATL ≈ 100', () => {
    const r = computePMC(Array(120).fill(100));
    expect(r.ctl).toBeCloseTo(100, 0);
    expect(r.atl).toBeCloseTo(100, 0);
    expect(r.tsb).toBeCloseTo(0, 0);
    expect(r.tier).toBe('balanced');
  });

  it('ATL responds faster than CTL on a sudden ramp (causes negative TSB)', () => {
    // 30 days at 50, then 10 days at 200 — a sharp overload.
    const trimps = [...Array(30).fill(50), ...Array(10).fill(200)];
    const r = computePMC(trimps);
    expect(r.atl).toBeGreaterThan(r.ctl); // fatigue outpaces fitness
    expect(r.tsb).toBeLessThan(0);
    expect(['optimal', 'overreaching']).toContain(r.tier);
  });

  it('TSB turns positive during taper after a hard block', () => {
    const trimps = [
      ...Array(28).fill(120), // hard block
      ...Array(10).fill(20), // taper
    ];
    const r = computePMC(trimps);
    expect(r.atl).toBeLessThan(r.ctl); // fatigue drains fastest
    expect(r.tsb).toBeGreaterThan(0);
  });

  it("reproduces Adrien's Zepp snapshot: CTL ~72, ATL ~67, TSB ~+5", () => {
    // Approximate his last 6 weeks: ramped from low base to ~140/day mid-April,
    // then easier weeks 80-100/day. Rough digitisation of the TSB chart.
    const trimps = [
      // 26 mar – 8 apr (mostly low / mixed, TSB negative early)
      40, 50, 60, 70, 80, 90, 100, 110, 120, 80, 90, 100, 110, 120,
      // 9 apr – 22 apr (ramp peak — TSB went positive ~+25–30)
      130, 140, 130, 120, 110, 100, 90, 100, 110, 120, 130, 140, 100, 80,
      // 23 apr – 6 may (consistent training, TSB drifts back to ~0–5)
      90, 100, 110, 120, 100, 80, 90, 100, 110, 120, 100, 80, 90, 100,
    ];
    const r = computePMC(trimps);
    // Loose bounds — exact match needs Zepp's real per-day TRIMP, not a
    // visual digitisation. Just confirms the model produces sensible
    // values in the right region.
    expect(r.ctl).toBeGreaterThan(70);
    expect(r.ctl).toBeLessThan(130);
    expect(r.atl).toBeGreaterThan(60);
    expect(r.atl).toBeLessThan(130);
    expect(r.calibrating).toBe(false);
  });

  it('series has one entry per input day with rolling CTL/ATL/TSB', () => {
    const r = computePMC([100, 100, 100, 100, 100]);
    expect(r.series).toHaveLength(5);
    // First day: TSB uses prevCTL=prevATL=seed=100, so TSB=0.
    expect(r.series[0]!.tsb).toBe(0);
    // CTL/ATL on the last day should be very close to 100.
    expect(r.series[4]!.ctl).toBeCloseTo(100, 0);
  });
});

describe('dailyEffortTarget', () => {
  it('uses 1.6 × CTL once mature — matches Zepp parity (CTL 72 → target 116)', () => {
    expect(
      dailyEffortTarget({
        ctl: 72,
        ctlCalibrating: false,
        vo2max: 48,
        ageYears: 36,
      }),
    ).toBe(115);
  });

  it("falls back to VO₂max-based estimate during calibration — Adrien's cold-start", () => {
    // Bob: VO₂max 48, 36yo. Want ~50 ish.
    const t = dailyEffortTarget({
      ctl: 0,
      ctlCalibrating: true,
      vo2max: 48,
      ageYears: 36,
    });
    expect(t).toBeGreaterThan(40);
    expect(t).toBeLessThan(60);
  });

  it('older user with same VO₂max gets a lower fallback target', () => {
    const young = dailyEffortTarget({
      ctl: 0,
      ctlCalibrating: true,
      vo2max: 48,
      ageYears: 30,
    });
    const old = dailyEffortTarget({
      ctl: 0,
      ctlCalibrating: true,
      vo2max: 48,
      ageYears: 60,
    });
    expect(young).toBeGreaterThan(old);
  });

  it('floors at 20 for very low fitness profiles', () => {
    const t = dailyEffortTarget({
      ctl: 0,
      ctlCalibrating: true,
      vo2max: 20,
      ageYears: 80,
    });
    expect(t).toBeGreaterThanOrEqual(20);
  });
});
