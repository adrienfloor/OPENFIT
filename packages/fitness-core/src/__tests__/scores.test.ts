import { describe, it, expect } from 'vitest';
import { sleepScore, DEFAULT_SLEEP_NEED_MINUTES } from '../scores';

describe('sleepScore — duration component', () => {
  it('returns 0 for no sleep', () => {
    const r = sleepScore({ durationMinutes: 0, awakeMinutes: 0 });
    expect(r.score).toBe(0);
    expect(r.components.duration).toBe(0);
  });

  it('full credit exactly at the 8 h target (no stages, no regularity)', () => {
    const r = sleepScore({ durationMinutes: 480, awakeMinutes: 0 });
    // Only duration (100) + efficiency (100) contribute; both full credit.
    expect(r.components.duration).toBe(100);
    expect(r.components.efficiency).toBe(100);
    expect(r.score).toBe(100);
  });

  it('full credit in the target..target+1h window', () => {
    const r = sleepScore({ durationMinutes: 540, awakeMinutes: 0 });
    expect(r.components.duration).toBe(100);
  });

  it('half credit at half the target (4 h)', () => {
    const r = sleepScore({ durationMinutes: 240, awakeMinutes: 0 });
    expect(r.components.duration).toBe(50);
  });

  it('gently penalises significant oversleep', () => {
    const r = sleepScore({ durationMinutes: 720, awakeMinutes: 0 });
    expect(r.components.duration).toBeLessThan(90);
    expect(r.components.duration).toBeGreaterThan(75);
  });

  it('respects a custom sleep-need target', () => {
    const r = sleepScore({
      durationMinutes: 420,
      awakeMinutes: 0,
      sleepNeedMinutes: 420,
    });
    expect(r.components.duration).toBe(100);
  });

  it('exposes the default target as 8 h', () => {
    expect(DEFAULT_SLEEP_NEED_MINUTES).toBe(480);
  });
});

describe('sleepScore — efficiency component', () => {
  it('awards 0 at 70 % efficiency', () => {
    const r = sleepScore({ durationMinutes: 210, awakeMinutes: 90 });
    expect(r.components.efficiency).toBe(0);
  });

  it('awards 50 at 80 % efficiency', () => {
    const r = sleepScore({ durationMinutes: 240, awakeMinutes: 60 });
    expect(r.components.efficiency).toBe(50);
  });

  it('awards full credit at 90 % efficiency', () => {
    const r = sleepScore({ durationMinutes: 450, awakeMinutes: 50 });
    expect(r.components.efficiency).toBe(100);
  });

  it('efficiency is 0 if total time-in-bed is 0', () => {
    const r = sleepScore({ durationMinutes: 0, awakeMinutes: 0 });
    expect(r.components.efficiency).toBe(0);
  });

  it('tolerates up to 2 awakenings without penalty', () => {
    const r = sleepScore({
      durationMinutes: 450,
      awakeMinutes: 50,
      awakeningCount: 2,
    });
    expect(r.components.efficiency).toBe(100);
  });

  it('docks 5 pts per awakening past the 2nd', () => {
    const r = sleepScore({
      durationMinutes: 450,
      awakeMinutes: 50,
      awakeningCount: 5,
    });
    // 3 over grace × 5 = 15 pts off the 100 base.
    expect(r.components.efficiency).toBe(85);
  });
});

describe('sleepScore — stage components (tight sweet spots)', () => {
  it('omits deep/rem when stage data is missing', () => {
    const r = sleepScore({ durationMinutes: 480, awakeMinutes: 0 });
    expect(r.components.deep).toBeNull();
    expect(r.components.rem).toBeNull();
  });

  it('full credit inside the clinical sweet spot (18 % deep, 22 % REM)', () => {
    const r = sleepScore({
      durationMinutes: 480,
      awakeMinutes: 0,
      deepMinutes: 90,
      remMinutes: 105,
      lightMinutes: 285,
    });
    expect(r.components.deep).toBe(100);
    expect(r.components.rem).toBe(100);
    expect(r.score).toBe(100);
  });

  it('harshly penalises REM well below target (14 % → ~16)', () => {
    // Bob's 2026-04-22 night: 14 % REM
    const r = sleepScore({
      durationMinutes: 477,
      awakeMinutes: 29,
      deepMinutes: 58,
      remMinutes: 67,
      lightMinutes: 352,
    });
    expect(r.components.rem).toBeLessThan(25);
    expect(r.components.rem).toBeGreaterThan(10);
  });

  it('zeros REM when at or below half the lower target', () => {
    // 4 % REM: well under lo/2 = 10 %.
    const r = sleepScore({
      durationMinutes: 480,
      awakeMinutes: 0,
      deepMinutes: 90,
      remMinutes: 20,
      lightMinutes: 370,
    });
    expect(r.components.rem).toBe(0);
  });

  it('deep just below the 13 % sweet spot still scores in the 70s', () => {
    // 12 % deep (Bob's 2026-04-22): below lo=0.13 but above lo/2=0.065
    const r = sleepScore({
      durationMinutes: 477,
      awakeMinutes: 29,
      deepMinutes: 58,
      remMinutes: 67,
      lightMinutes: 352,
    });
    expect(r.components.deep).toBeGreaterThan(60);
    expect(r.components.deep).toBeLessThan(85);
  });
});

describe('sleepScore — regularity component', () => {
  it('uses regularity when provided', () => {
    const r = sleepScore({
      durationMinutes: 480,
      awakeMinutes: 0,
      regularityScore: 50,
    });
    expect(r.components.regularity).toBe(50);
    // duration (100) + efficiency (100) + regularity (50), weights
    // renormalised since stages are absent.
    expect(r.score).toBeLessThan(100);
    expect(r.score).toBeGreaterThan(70);
  });

  it('omits regularity when missing', () => {
    const r = sleepScore({ durationMinutes: 480, awakeMinutes: 0 });
    expect(r.components.regularity).toBeNull();
  });

  it('clamps regularity into 0–100', () => {
    const low = sleepScore({
      durationMinutes: 480,
      awakeMinutes: 0,
      regularityScore: -20,
    });
    expect(low.components.regularity).toBe(0);

    const high = sleepScore({
      durationMinutes: 480,
      awakeMinutes: 0,
      regularityScore: 150,
    });
    expect(high.components.regularity).toBe(100);
  });
});

describe('sleepScore — realistic scenarios', () => {
  it('great night: 7 h 45 m, 5 m awake, balanced stages, 90 % regularity', () => {
    const r = sleepScore({
      durationMinutes: 465,
      awakeMinutes: 5,
      awakeningCount: 1,
      deepMinutes: 85,
      remMinutes: 95,
      lightMinutes: 285,
      regularityScore: 90,
    });
    expect(r.score).toBeGreaterThanOrEqual(90);
  });

  it("Bob's 2026-04-22 night: 7:57 asleep, 3 awakenings, low REM — ~79", () => {
    // Zepp scored this night 74. We target the same ballpark (within ~10).
    const r = sleepScore({
      durationMinutes: 477,
      awakeMinutes: 29,
      awakeningCount: 3,
      deepMinutes: 58,
      remMinutes: 67,
      lightMinutes: 352,
      regularityScore: 83,
    });
    expect(r.score).toBeGreaterThanOrEqual(70);
    expect(r.score).toBeLessThanOrEqual(85);
  });

  it('rough night: 5 h 30 m, 40 m awake, 4 awakenings, low deep', () => {
    const r = sleepScore({
      durationMinutes: 330,
      awakeMinutes: 40,
      awakeningCount: 4,
      deepMinutes: 20,
      remMinutes: 45,
      lightMinutes: 265,
      regularityScore: 60,
    });
    expect(r.score).toBeLessThan(60);
    expect(r.score).toBeGreaterThan(20);
  });

  it('excellent night without stage data still lands in the 90s', () => {
    const r = sleepScore({ durationMinutes: 475, awakeMinutes: 15 });
    expect(r.score).toBeGreaterThanOrEqual(90);
  });
});
