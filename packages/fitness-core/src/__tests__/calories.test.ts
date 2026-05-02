import { describe, it, expect } from 'vitest';
import {
  keytelKcalPerMinute,
  computeCaloriesFromHRSamples,
  computeCaloriesFromMET,
  activeKcalFromSteps,
} from '../calories';

describe('keytelKcalPerMinute', () => {
  it('matches hand calculation for a typical male workout HR', () => {
    // 40y male, 80kg, 150 bpm
    // kJ/min = −55.0969 + 0.6309·150 + 0.1988·80 + 0.2017·40
    //        = −55.0969 + 94.635 + 15.904 + 8.068 = 63.5101
    // kcal/min = 63.5101 / 4.184 ≈ 15.18
    const value = keytelKcalPerMinute({ bpm: 150, weightKg: 80, ageYears: 40, sex: 'male' });
    expect(value).toBeCloseTo(15.18, 2);
  });

  it('matches hand calculation for a typical female workout HR', () => {
    // 35y female, 65kg, 150 bpm
    // kJ/min = −20.4022 + 0.4472·150 − 0.1263·65 + 0.0740·35
    //        = −20.4022 + 67.08 − 8.2095 + 2.59 = 41.0583
    // kcal/min = 41.0583 / 4.184 ≈ 9.81
    const value = keytelKcalPerMinute({ bpm: 150, weightKg: 65, ageYears: 35, sex: 'female' });
    expect(value).toBeCloseTo(9.81, 2);
  });

  it('clamps to zero when the regression would return negative', () => {
    // Very low HR produces a negative kJ/min under Keytel — physiologically this
    // means "barely above rest" and should not subtract calories. 30 bpm is
    // well below the regression's intercept for a 40y male.
    const value = keytelKcalPerMinute({ bpm: 30, weightKg: 80, ageYears: 40, sex: 'male' });
    expect(value).toBe(0);
  });

  it('scales roughly linearly with HR in the exercising range', () => {
    const at140 = keytelKcalPerMinute({ bpm: 140, weightKg: 80, ageYears: 40, sex: 'male' });
    const at160 = keytelKcalPerMinute({ bpm: 160, weightKg: 80, ageYears: 40, sex: 'male' });
    // 20 bpm × 0.6309 / 4.184 ≈ 3.02 kcal/min delta
    expect(at160 - at140).toBeCloseTo(3.02, 1);
  });
});

describe('computeCaloriesFromHRSamples', () => {
  it('returns 0 for empty samples', () => {
    expect(
      computeCaloriesFromHRSamples({
        samples: [],
        weightKg: 80,
        ageYears: 40,
        sex: 'male',
      }),
    ).toBe(0);
  });

  it('treats a single sample as one minute of exposure', () => {
    const kcal = computeCaloriesFromHRSamples({
      samples: [{ timestamp: new Date('2026-04-22T12:00:00Z'), bpm: 150 }],
      weightKg: 80,
      ageYears: 40,
      sex: 'male',
    });
    expect(kcal).toBeCloseTo(15.18, 2);
  });

  it('integrates a 60-minute constant-HR workout', () => {
    // 60 samples, one per minute, all at 150 bpm → 60 × 15.18 ≈ 910
    const samples = Array.from({ length: 60 }, (_, i) => ({
      timestamp: new Date(new Date('2026-04-22T12:00:00Z').getTime() + i * 60_000),
      bpm: 150,
    }));
    const kcal = computeCaloriesFromHRSamples({
      samples,
      weightKg: 80,
      ageYears: 40,
      sex: 'male',
    });
    // 60 intervals contributing ~15.18/min each (including median-pad for last one)
    expect(kcal).toBeGreaterThan(900);
    expect(kcal).toBeLessThan(920);
  });

  it('handles uneven sampling intervals', () => {
    const start = new Date('2026-04-22T12:00:00Z').getTime();
    const samples = [
      { timestamp: new Date(start), bpm: 150 },
      { timestamp: new Date(start + 30_000), bpm: 155 }, // +30s
      { timestamp: new Date(start + 120_000), bpm: 160 }, // +90s
    ];
    const kcal = computeCaloriesFromHRSamples({
      samples,
      weightKg: 80,
      ageYears: 40,
      sex: 'male',
    });
    // Hand calc:
    //   150 bpm × 30/60 min  ≈  7.59 kcal
    //   155 bpm × 90/60 min  ≈ 23.90 kcal
    //   160 bpm × 90/60 min  ≈ 25.02 kcal (median pad)
    //   total                 ≈ 56.5 kcal
    expect(kcal).toBeCloseTo(56.5, 0);
  });
});

describe('computeCaloriesFromMET', () => {
  it('computes basic MET × weight × hours', () => {
    // 10 METs × 80 kg × 1 h = 800 kcal
    expect(
      computeCaloriesFromMET({ mets: 10, weightKg: 80, durationSeconds: 3600 }),
    ).toBe(800);
  });

  it('scales linearly with duration', () => {
    const oneHour = computeCaloriesFromMET({ mets: 6, weightKg: 75, durationSeconds: 3600 });
    const halfHour = computeCaloriesFromMET({ mets: 6, weightKg: 75, durationSeconds: 1800 });
    expect(halfHour).toBeCloseTo(oneHour / 2, 5);
  });
});

describe('activeKcalFromSteps', () => {
  it('matches Zepp display for an 80kg adult at 2086 steps', () => {
    // 2086 × 0.04 × (80/68) ≈ 98.2 — matches Zepp's "99 kcal" within 1.
    expect(activeKcalFromSteps(2086, 80)).toBeCloseTo(98.2, 1);
  });

  it('scales linearly with weight', () => {
    expect(activeKcalFromSteps(8000, 68)).toBeCloseTo(320, 0);
    expect(activeKcalFromSteps(8000, 136)).toBeCloseTo(640, 0);
  });

  it('returns 0 for non-positive inputs', () => {
    expect(activeKcalFromSteps(0, 80)).toBe(0);
    expect(activeKcalFromSteps(-100, 80)).toBe(0);
    expect(activeKcalFromSteps(2000, 0)).toBe(0);
  });
});
