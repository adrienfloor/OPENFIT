import { describe, it, expect } from 'vitest';
import {
  sleepScore,
  effortScore,
  DEFAULT_SLEEP_NEED_MINUTES,
  type EffortHRSample,
} from '../scores';

function fakeMinuteSamples(
  startBpm: number,
  endBpm: number,
  minutes: number,
  anchor = new Date('2026-04-22T08:00:00Z'),
): EffortHRSample[] {
  const result: EffortHRSample[] = [];
  for (let i = 0; i <= minutes; i++) {
    const t = new Date(anchor.getTime() + i * 60_000);
    const frac = minutes === 0 ? 0 : i / minutes;
    result.push({ time: t, bpm: Math.round(startBpm + (endBpm - startBpm) * frac) });
  }
  return result;
}

function constantSamples(
  bpm: number,
  minutes: number,
  anchor = new Date('2026-04-22T08:00:00Z'),
): EffortHRSample[] {
  return fakeMinuteSamples(bpm, bpm, minutes, anchor);
}

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

describe('effortScore — PAI-style daily effort', () => {
  // Bob's profile: resting 60, max HR (Tanaka at 36y) = 208 - 0.7·36 = 183
  const RESTING = 60;
  const MAX = 183;
  const HRR = MAX - RESTING; // 123

  it('returns zero result with no samples', () => {
    const r = effortScore({ samples: [], restingHR: RESTING, maxHR: MAX });
    expect(r.score).toBe(0);
    expect(r.earnedMinutes).toBe(0);
    expect(r.targetMinutes).toBe(100);
  });

  it('returns zero with a single sample', () => {
    const r = effortScore({
      samples: [{ time: new Date(), bpm: 140 }],
      restingHR: RESTING,
      maxHR: MAX,
    });
    expect(r.score).toBe(0);
  });

  it('returns zero when max ≤ resting (bad profile)', () => {
    const r = effortScore({
      samples: constantSamples(140, 60),
      restingHR: 180,
      maxHR: 180,
    });
    expect(r.score).toBe(0);
  });

  it('gives 0 pts for a resting day', () => {
    // 480 min at 65 bpm → HRR = (65-60)/123 = 0.04 → below 0.40 threshold
    const r = effortScore({
      samples: constantSamples(65, 480),
      restingHR: RESTING,
      maxHR: MAX,
    });
    expect(r.score).toBe(0);
    expect(r.earnedMinutes).toBe(0);
  });

  it('60 min in the moderate zone scores 60', () => {
    // HRR = 0.50 → need bpm such that (bpm-60)/123 = 0.50 → bpm ≈ 122
    const r = effortScore({
      samples: constantSamples(122, 60),
      restingHR: RESTING,
      maxHR: MAX,
    });
    // 60 min × 1 pt/min = 60 → 60/100 = 60 %
    expect(r.score).toBe(60);
    expect(r.earnedMinutes).toBe(60);
  });

  it('30 min in the vigorous zone scores 60', () => {
    // HRR = 0.70 → bpm ≈ 60 + 0.70·123 = 146
    const r = effortScore({
      samples: constantSamples(146, 30),
      restingHR: RESTING,
      maxHR: MAX,
    });
    // 30 × 2 = 60 → 60 %
    expect(r.score).toBe(60);
    expect(r.earnedMinutes).toBe(60);
  });

  it('clamps at 100 for very intense + long workouts (but earnedMinutes uncapped)', () => {
    // 90 min at HRR ~0.85 → 90 × 3 = 270 pts → clamps score to 100, earned stays 270
    const bpm = Math.round(RESTING + 0.85 * HRR); // ≈165
    const r = effortScore({
      samples: constantSamples(bpm, 90),
      restingHR: RESTING,
      maxHR: MAX,
    });
    expect(r.score).toBe(100);
    expect(r.earnedMinutes).toBeGreaterThan(100);
  });

  it('near-max effort gets peak weight (4 pts/min)', () => {
    // 25 min at HRR 0.92 → 25 × 4 = 100 → 100 %
    const bpm = Math.round(RESTING + 0.92 * HRR); // ≈173
    const r = effortScore({
      samples: constantSamples(bpm, 25),
      restingHR: RESTING,
      maxHR: MAX,
    });
    expect(r.score).toBe(100);
    expect(r.earnedMinutes).toBe(100);
  });

  it('drops gaps larger than maxGapMinutes (device off)', () => {
    const first = constantSamples(122, 30, new Date('2026-04-22T08:00:00Z'));
    const second = constantSamples(122, 30, new Date('2026-04-22T10:30:00Z'));
    const merged = [...first, ...second];
    const r = effortScore({
      samples: merged,
      restingHR: RESTING,
      maxHR: MAX,
    });
    expect(r.score).toBe(60);
  });

  it('sorts unsorted samples before integrating', () => {
    const reversed = [...constantSamples(122, 60)].reverse();
    const r = effortScore({
      samples: reversed,
      restingHR: RESTING,
      maxHR: MAX,
    });
    expect(r.score).toBe(60);
  });

  it('respects a custom target', () => {
    // 30 min vigorous (60 pts) vs target 30 = 200 % → clamp to 100
    const r = effortScore({
      samples: constantSamples(146, 30),
      restingHR: RESTING,
      maxHR: MAX,
      targetMinutes: 30,
    });
    expect(r.score).toBe(100);
    expect(r.earnedMinutes).toBe(60);
    expect(r.targetMinutes).toBe(30);
  });
});
