import { describe, it, expect } from 'vitest';
import { sleepScore, DEFAULT_SLEEP_NEED_MINUTES } from '../scores';

describe('sleepScore — duration component', () => {
  it('returns 0 for no sleep', () => {
    const r = sleepScore({ durationMinutes: 0, awakeMinutes: 0 });
    expect(r.score).toBe(0);
    expect(r.components.duration).toBe(0);
  });

  it('full credit exactly at the 8 h target (no stages)', () => {
    const r = sleepScore({ durationMinutes: 480, awakeMinutes: 0 });
    // Duration 100 · 0.80 + efficiency 100 · 0.20 = 100
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
    // Target + 4 h = 12 h. Should be noticeably below 100, above 75.
    const r = sleepScore({ durationMinutes: 720, awakeMinutes: 0 });
    expect(r.components.duration).toBeLessThan(90);
    expect(r.components.duration).toBeGreaterThan(75);
  });

  it('respects a custom sleep-need target', () => {
    // 7 h target, 7 h actual → full duration credit.
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
    // 210 asleep + 90 awake = 300 total → 70 %
    const r = sleepScore({ durationMinutes: 210, awakeMinutes: 90 });
    expect(r.components.efficiency).toBe(0);
  });

  it('awards 50 at 80 % efficiency', () => {
    // 240 asleep + 60 awake = 300 total → 80 %
    const r = sleepScore({ durationMinutes: 240, awakeMinutes: 60 });
    expect(r.components.efficiency).toBe(50);
  });

  it('awards full credit at 90 % efficiency', () => {
    // 450 asleep + 50 awake = 500 total → 90 %
    const r = sleepScore({ durationMinutes: 450, awakeMinutes: 50 });
    expect(r.components.efficiency).toBe(100);
  });

  it('efficiency is 0 if total time-in-bed is 0', () => {
    const r = sleepScore({ durationMinutes: 0, awakeMinutes: 0 });
    expect(r.components.efficiency).toBe(0);
  });
});

describe('sleepScore — stage components', () => {
  it('omits deep/rem when stage data is missing', () => {
    const r = sleepScore({ durationMinutes: 480, awakeMinutes: 0 });
    expect(r.components.deep).toBeNull();
    expect(r.components.rem).toBeNull();
  });

  it('full credit inside the clinical sweet spot (18 % deep, 22 % REM)', () => {
    // 480 asleep, 90 deep (≈19 %), 105 REM (≈22 %), rest light
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

  it('penalises insufficient deep sleep', () => {
    // 5 % deep → well below the 13 % lower bound
    const r = sleepScore({
      durationMinutes: 480,
      awakeMinutes: 0,
      deepMinutes: 24,
      remMinutes: 100,
      lightMinutes: 356,
    });
    expect(r.components.deep).toBeLessThan(50);
    // Overall still respectable because duration + efficiency are perfect
    expect(r.score).toBeLessThan(95);
    expect(r.score).toBeGreaterThan(80);
  });

  it('penalises missing REM', () => {
    const r = sleepScore({
      durationMinutes: 480,
      awakeMinutes: 0,
      deepMinutes: 90,
      remMinutes: 20,
      lightMinutes: 370,
    });
    expect(r.components.rem).toBeLessThan(30);
    expect(r.components.rem).toBeGreaterThan(0);
  });
});

describe('sleepScore — realistic scenarios', () => {
  it('great night: 7 h 45 m, 5 m awake, balanced stages', () => {
    const r = sleepScore({
      durationMinutes: 465,
      awakeMinutes: 5,
      deepMinutes: 85,
      remMinutes: 95,
      lightMinutes: 285,
    });
    expect(r.score).toBeGreaterThanOrEqual(90);
  });

  it('rough night: 5 h 30 m with 40 m awake, low deep', () => {
    const r = sleepScore({
      durationMinutes: 330,
      awakeMinutes: 40,
      deepMinutes: 20,
      remMinutes: 45,
      lightMinutes: 265,
    });
    expect(r.score).toBeLessThan(75);
    expect(r.score).toBeGreaterThan(30);
  });

  it('excellent night without stage data still lands in the 90s', () => {
    const r = sleepScore({ durationMinutes: 475, awakeMinutes: 15 });
    expect(r.score).toBeGreaterThanOrEqual(90);
  });
});
