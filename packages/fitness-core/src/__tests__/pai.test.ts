import { describe, it, expect } from 'vitest';
import { dailyPAI, paiWeightPerMinute, weeklyPAI } from '../pai';
import type { EffortHRSample } from '../scores';

function steadyMinutes(bpm: number, minutes: number): EffortHRSample[] {
  const start = new Date('2026-05-01T00:00:00Z');
  const samples: EffortHRSample[] = [];
  for (let i = 0; i <= minutes; i++) {
    samples.push({ time: new Date(start.getTime() + i * 60_000), bpm });
  }
  return samples;
}

describe('paiWeightPerMinute', () => {
  it('zero below the 50% HRR threshold', () => {
    expect(paiWeightPerMinute(0)).toBe(0);
    expect(paiWeightPerMinute(0.49)).toBe(0);
  });
  it('tiers progress monotonically', () => {
    expect(paiWeightPerMinute(0.55)).toBe(0.5);
    expect(paiWeightPerMinute(0.75)).toBe(1.0);
    expect(paiWeightPerMinute(0.9)).toBe(1.5);
    expect(paiWeightPerMinute(1.0)).toBe(1.5);
  });
  it('clamps below-zero and above-one HRR', () => {
    expect(paiWeightPerMinute(-0.2)).toBe(0);
    expect(paiWeightPerMinute(1.5)).toBe(1.5);
  });
});

describe('dailyPAI', () => {
  // Bob's profile: RHR 50, age 36 (Tanaka maxHR 184), reserve 134.
  const restingHR = 50;
  const maxHR = 184;

  it('returns 0 for too-few samples', () => {
    expect(dailyPAI({ samples: [], restingHR, maxHR })).toBe(0);
    expect(
      dailyPAI({
        samples: [{ time: new Date(), bpm: 120 }],
        restingHR,
        maxHR,
      }),
    ).toBe(0);
  });

  it('returns 0 when HRR reserve is non-positive', () => {
    expect(
      dailyPAI({
        samples: steadyMinutes(120, 30),
        restingHR: 200,
        maxHR: 180,
      }),
    ).toBe(0);
  });

  it('30 min @ ~60% HRR (130 bpm) → light tier (~15 PAI)', () => {
    // 60% HRR → bpm = 50 + 0.6 × 134 = 130.4
    const pai = dailyPAI({
      samples: steadyMinutes(130, 30),
      restingHR,
      maxHR,
    });
    expect(pai).toBeGreaterThanOrEqual(13);
    expect(pai).toBeLessThanOrEqual(17);
  });

  it('30 min @ ~75% HRR (151 bpm) → moderate tier (~30 PAI)', () => {
    // 75% HRR → bpm = 50 + 0.75 × 134 = 150.5
    const pai = dailyPAI({
      samples: steadyMinutes(151, 30),
      restingHR,
      maxHR,
    });
    expect(pai).toBeGreaterThanOrEqual(28);
    expect(pai).toBeLessThanOrEqual(32);
  });

  it('30 min @ ~90% HRR (171 bpm) → vigorous tier (~45 PAI)', () => {
    // 90% HRR → bpm = 50 + 0.9 × 134 = 170.6
    const pai = dailyPAI({
      samples: steadyMinutes(171, 30),
      restingHR,
      maxHR,
    });
    expect(pai).toBeGreaterThanOrEqual(43);
    expect(pai).toBeLessThanOrEqual(47);
  });

  it('drops gaps larger than maxGapMinutes (device off)', () => {
    const start = new Date('2026-05-01T00:00:00Z');
    const samples: EffortHRSample[] = [
      { time: start, bpm: 150 },
      { time: new Date(start.getTime() + 60 * 60_000), bpm: 150 },
      ...steadyMinutes(150, 30).map((s) => ({
        time: new Date(s.time.getTime() + 60 * 60_000),
        bpm: s.bpm,
      })),
    ];
    const pai = dailyPAI({ samples, restingHR, maxHR });
    const reference = dailyPAI({
      samples: steadyMinutes(150, 30),
      restingHR,
      maxHR,
    });
    expect(pai).toBeCloseTo(reference, -1);
  });

  it("realistic mixed day: 60-min run at 70% HRR + 60 idle min ≈ 60 PAI", () => {
    // 60 min steady @ 70% HRR → 60 × 1.0 = 60 PAI exactly.
    const pai = dailyPAI({
      samples: steadyMinutes(144, 60),
      restingHR,
      maxHR,
    });
    expect(pai).toBeGreaterThanOrEqual(58);
    expect(pai).toBeLessThanOrEqual(62);
  });
});

describe('weeklyPAI', () => {
  it('sums the trailing 7 days', () => {
    expect(weeklyPAI([10, 20, 30, 40, 50, 60, 70])).toBe(280);
  });
  it('handles fewer than 7 entries', () => {
    expect(weeklyPAI([10, 20, 30])).toBe(60);
  });
  it('treats nulls as 0', () => {
    expect(weeklyPAI([null, 20, null, 40, 50, null, 70])).toBe(180);
  });
  it('only takes the last 7 entries when given more', () => {
    expect(weeklyPAI([1000, 1, 2, 3, 4, 5, 6, 7])).toBe(28);
  });
});
