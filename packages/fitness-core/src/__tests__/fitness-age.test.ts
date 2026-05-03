import { describe, expect, it } from 'vitest';
import {
  fitnessAge,
  fitnessAgeCardio,
  popHrvRmssd,
  popRestingHR,
  popVo2max,
  type FitnessAgeInput,
} from '../fitness-age';

const fitMaleBob: FitnessAgeInput = {
  chronoAgeYears: 36,
  sex: 'male',
  restingHRBpm: 47,
  hrvRmssdMs: 64,
  vo2max: 48,
  weeklyEffortMinutes: 220,
  workoutDaysLast28: 18,
  avgSleepScoreLast14: 82,
  strengthSessionsPerWeek: 3,
};

const sedentaryMaleSameAge: FitnessAgeInput = {
  chronoAgeYears: 36,
  sex: 'male',
  restingHRBpm: 78,
  hrvRmssdMs: 22,
  vo2max: 32,
  weeklyEffortMinutes: 40,
  workoutDaysLast28: 4,
  avgSleepScoreLast14: 60,
  strengthSessionsPerWeek: 0,
};

describe('population norm tables', () => {
  it('interpolates RHR norms by age', () => {
    expect(popRestingHR(35, 'male')).toBeGreaterThanOrEqual(63);
    expect(popRestingHR(35, 'male')).toBeLessThanOrEqual(66);
    expect(popRestingHR(35, 'female')).toBeGreaterThan(popRestingHR(35, 'male'));
  });

  it('drops HRV norm with age (Voss et al)', () => {
    const young = popHrvRmssd(25);
    const old = popHrvRmssd(65);
    expect(young).toBeGreaterThan(old);
    expect(young).toBeGreaterThan(50);
    expect(old).toBeLessThan(35);
  });

  it('drops VO2max norm with age (HUNT 3)', () => {
    expect(popVo2max(25, 'male')).toBeGreaterThan(popVo2max(65, 'male'));
    expect(popVo2max(35, 'male')).toBeGreaterThan(popVo2max(35, 'female'));
  });

  it('clamps to bucket range (no extrapolation)', () => {
    // Outside the surveyed range — return the edge value, don't extrapolate.
    expect(popVo2max(10, 'male')).toBe(popVo2max(25, 'male'));
    expect(popVo2max(95, 'male')).toBe(popVo2max(75, 'male'));
  });
});

describe('fitnessAge — fit profile', () => {
  it("knocks Bob's 36yo profile down into the late 20s", () => {
    const r = fitnessAge(fitMaleBob);
    expect(r.fitnessAge).toBeLessThanOrEqual(30);
    expect(r.fitnessAge).toBeGreaterThan(18);
    expect(r.calibrating).toBe(false);
  });

  it("cardio-only number is also young (close to but >= composite, since the broader bonuses don't apply)", () => {
    const r = fitnessAge(fitMaleBob);
    // The composite includes activity/consistency/sleep/lifting which are
    // all bonuses for a fit user — composite should be at most cardio.
    expect(r.fitnessAge).toBeLessThanOrEqual(r.fitnessAgeCardio);
  });

  it('exposes per-component contributions for the UI breakdown', () => {
    const r = fitnessAge(fitMaleBob);
    expect(r.components.vo2max).toBeLessThan(0);
    expect(r.components.restingHR).toBeLessThan(0);
    expect(r.components.hrv).toBeLessThan(0);
    expect(r.components.activity).toBeLessThan(0);
    expect(r.components.consistency).toBeLessThan(0);
    expect(r.components.sleep).toBeLessThan(0);
    expect(r.components.lifting).toBe(-1);
  });
});

describe('fitnessAge — sedentary profile', () => {
  it('pushes a 36yo with poor metrics into the 40s', () => {
    const r = fitnessAge(sedentaryMaleSameAge);
    expect(r.fitnessAge).toBeGreaterThanOrEqual(40);
    expect(r.fitnessAge).toBeLessThanOrEqual(56);
  });

  it('lifting bonus is zero with no strength habit', () => {
    const r = fitnessAge(sedentaryMaleSameAge);
    expect(r.components.lifting).toBe(0);
  });
});

describe('fitnessAge — calibration + missing data', () => {
  it('flags calibrating=true when VO2max is missing and zeroes the term', () => {
    const r = fitnessAge({ ...fitMaleBob, vo2max: null });
    expect(r.calibrating).toBe(true);
    // -0 === 0 numerically; using toBeCloseTo to sidestep Object.is
    expect(r.components.vo2max).toBeCloseTo(0, 9);
  });

  it('handles all-null biometrics gracefully (returns chrono-age-ish)', () => {
    const r = fitnessAge({
      chronoAgeYears: 40,
      sex: 'female',
      restingHRBpm: null,
      hrvRmssdMs: null,
      vo2max: null,
      weeklyEffortMinutes: null,
      workoutDaysLast28: 0,
      avgSleepScoreLast14: null,
      strengthSessionsPerWeek: 0,
    });
    expect(r.fitnessAge).toBe(40);
    expect(r.calibrating).toBe(true);
  });

  it('clamps to chrono ± 20', () => {
    // Implausibly elite metrics shouldn't read as a 5yo.
    const r = fitnessAge({
      ...fitMaleBob,
      vo2max: 80,
      restingHRBpm: 30,
      hrvRmssdMs: 200,
    });
    expect(r.fitnessAge).toBeGreaterThanOrEqual(16);
    expect(r.fitnessAgeCardio).toBeGreaterThanOrEqual(16);
  });
});

describe('fitnessAgeCardio convenience', () => {
  it('matches fitnessAge().fitnessAgeCardio', () => {
    const r = fitnessAge(fitMaleBob);
    expect(fitnessAgeCardio(fitMaleBob)).toBe(r.fitnessAgeCardio);
  });
});
