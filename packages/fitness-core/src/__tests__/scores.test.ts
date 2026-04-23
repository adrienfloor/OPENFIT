import { describe, it, expect } from 'vitest';
import {
  sleepScore,
  effortScore,
  readinessScore,
  recentTrainingLoad,
  personalisedEffortTarget,
  DEFAULT_SLEEP_NEED_MINUTES,
  READINESS_MIN_BASELINE_DAYS,
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

describe('readinessScore — morning recovery composite', () => {
  const base = {
    hrvToday: 50,
    hrvBaseline: 50,
    rhrToday: 55,
    rhrBaseline: 55,
    sleepScore: 80,
    recentLoad: 0,
    baselineDays: 7,
  } as const;

  it('returns neutral 50 + calibrating flag when baseline is thin', () => {
    const r = readinessScore({ ...base, baselineDays: 2 });
    expect(r.score).toBe(50);
    expect(r.calibrating).toBe(true);
    // All components null when calibrating — nothing trustworthy to show.
    expect(r.components.hrv).toBeNull();
    expect(r.components.rhr).toBeNull();
    expect(r.components.sleep).toBeNull();
    expect(r.components.load).toBeNull();
  });

  it(`requires at least ${READINESS_MIN_BASELINE_DAYS} baseline days`, () => {
    const calibrating = readinessScore({
      ...base,
      baselineDays: READINESS_MIN_BASELINE_DAYS - 1,
    });
    expect(calibrating.calibrating).toBe(true);

    const ok = readinessScore({ ...base, baselineDays: READINESS_MIN_BASELINE_DAYS });
    expect(ok.calibrating).toBe(false);
  });

  it('baseline day with average sleep + no load lands in the 70s', () => {
    // HRV at baseline = 70, RHR at baseline = 70, sleep 80, load 0 (100) →
    // 0.30·70 + 0.20·70 + 0.30·80 + 0.20·100 = 21 + 14 + 24 + 20 = 79
    const r = readinessScore(base);
    expect(r.calibrating).toBe(false);
    expect(r.score).toBe(79);
    expect(r.components.hrv).toBe(70);
    expect(r.components.rhr).toBe(70);
  });

  it('boosts when HRV is 20 % above baseline', () => {
    const r = readinessScore({ ...base, hrvToday: 60 });
    expect(r.components.hrv).toBe(100);
    // 0.30·100 + 0.20·70 + 0.30·80 + 0.20·100 = 30 + 14 + 24 + 20 = 88
    expect(r.score).toBe(88);
  });

  it('penalises when RHR is well above baseline (poor recovery)', () => {
    // RHR 66 vs baseline 55 = +20 % elevation → inverted reading: "current=55, baseline=66"
    // deviation = (55-66)/66 = -0.167 → 70 + (-0.167/0.2)*50 ≈ 28
    const r = readinessScore({ ...base, rhrToday: 66 });
    expect(r.components.rhr).toBeLessThan(40);
    expect(r.components.rhr).toBeGreaterThan(20);
  });

  it('heavy recent load drags the score down', () => {
    const r = readinessScore({ ...base, recentLoad: 300 });
    expect(r.components.load).toBe(0);
    // 0.30·70 + 0.20·70 + 0.30·80 + 0.20·0 = 21 + 14 + 24 + 0 = 59
    expect(r.score).toBe(59);
  });

  it('drops components whose data is missing and renormalises', () => {
    // No HRV data at all → formula falls back to RHR + sleep + load only
    const r = readinessScore({ ...base, hrvToday: null, hrvBaseline: null });
    expect(r.components.hrv).toBeNull();
    expect(r.components.rhr).not.toBeNull();
    expect(r.components.sleep).not.toBeNull();
    expect(r.components.load).not.toBeNull();
  });

  it('bad night + bad HRV + bad RHR tanks the score', () => {
    const r = readinessScore({
      ...base,
      hrvToday: 40, // 20 % below baseline → 20
      rhrToday: 66, // 20 % above baseline → 20
      sleepScore: 35,
      recentLoad: 200,
    });
    expect(r.score).toBeLessThan(40);
  });
});

describe('readinessScore — intraday drain from todayEarnedMinutes', () => {
  const base = {
    hrvToday: 50,
    hrvBaseline: 50,
    rhrToday: 55,
    rhrBaseline: 55,
    sleepScore: 80,
    recentLoad: 0,
    baselineDays: 7,
  } as const;

  it('no drain when today earned is 0 or missing', () => {
    expect(readinessScore(base).score).toBe(79);
    expect(readinessScore({ ...base, todayEarnedMinutes: 0 }).score).toBe(79);
    expect(readinessScore({ ...base, todayEarnedMinutes: null }).score).toBe(79);
  });

  it('drains proportionally through the day', () => {
    // 50 earned × 0.15 = 7.5 drain → 79 − 8 = 71
    const mid = readinessScore({ ...base, todayEarnedMinutes: 50 });
    expect(mid.score).toBe(72);
  });

  it('caps drain at 30 points (monster workout)', () => {
    const hard = readinessScore({ ...base, todayEarnedMinutes: 500 });
    expect(hard.score).toBe(79 - 30);
  });

  it('morning readiness unchanged — drain does not affect components', () => {
    const r = readinessScore({ ...base, todayEarnedMinutes: 200 });
    expect(r.components.hrv).toBe(70);
    expect(r.components.sleep).toBe(80);
  });
});

describe('personalisedEffortTarget', () => {
  it('returns 50 fallback when RHR or age is missing', () => {
    expect(personalisedEffortTarget({ restingHR: null, hrvRmssd: 50, ageYears: 30 })).toBe(50);
    expect(personalisedEffortTarget({ restingHR: 55, hrvRmssd: 50, ageYears: null })).toBe(50);
  });

  it('matches a fit athlete profile (Bob)', () => {
    // RHR 47, HRV 64, age 36 → 20 + 8.4 + 6.8 − 0.3 = 34.9 → 35
    const t = personalisedEffortTarget({ restingHR: 47, hrvRmssd: 64, ageYears: 36 });
    expect(t).toBe(35);
  });

  it('floors at 20 for very unfit profiles', () => {
    const t = personalisedEffortTarget({ restingHR: 85, hrvRmssd: 20, ageYears: 50 });
    expect(t).toBe(20);
  });

  it('caps at 120 for extreme profiles', () => {
    const t = personalisedEffortTarget({ restingHR: 35, hrvRmssd: 120, ageYears: 25 });
    expect(t).toBeLessThanOrEqual(120);
  });

  it('penalises older users to keep targets realistic', () => {
    const young = personalisedEffortTarget({ restingHR: 55, hrvRmssd: 40, ageYears: 35 });
    const old = personalisedEffortTarget({ restingHR: 55, hrvRmssd: 40, ageYears: 70 });
    expect(old).toBeLessThan(young);
  });

  it('rewards better HRV with a higher target', () => {
    const low = personalisedEffortTarget({ restingHR: 55, hrvRmssd: 25, ageYears: 35 });
    const high = personalisedEffortTarget({ restingHR: 55, hrvRmssd: 70, ageYears: 35 });
    expect(high).toBeGreaterThan(low);
  });

  it('works without HRV data (RHR + age only)', () => {
    const t = personalisedEffortTarget({ restingHR: 55, hrvRmssd: null, ageYears: 35 });
    // 20 + 5.2 + 0 - 0 = 25.2 → 25
    expect(t).toBe(25);
  });
});

describe('recentTrainingLoad', () => {
  it('weighs yesterday heavier than older days', () => {
    // 100 each day: 100*1.0 + 100*0.6 + 100*0.3 = 190
    expect(recentTrainingLoad([100, 100, 100])).toBe(190);
  });

  it('treats missing days as zero', () => {
    expect(recentTrainingLoad([100, null, 100])).toBeCloseTo(130, 5);
  });

  it('returns 0 for an empty history', () => {
    expect(recentTrainingLoad([])).toBe(0);
  });

  it('ignores anything past the 3-day window', () => {
    expect(recentTrainingLoad([100, 100, 100, 999, 999])).toBe(190);
  });
});
