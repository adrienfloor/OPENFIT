import { describe, it, expect } from 'vitest';
import {
  cumulativeEffortMinutes,
  intradayBioCharge,
  sleepContribution,
} from '../biocharge';
import type { EffortHRSample } from '../scores';

describe('sleepContribution', () => {
  it('returns 30% of sleep score, rounded', () => {
    expect(sleepContribution(80)).toBe(24);
    expect(sleepContribution(85)).toBe(26); // 25.5 rounds to 26
    expect(sleepContribution(0)).toBe(0);
  });
  it('returns 0 for null sleep score', () => {
    expect(sleepContribution(null)).toBe(0);
  });
});

function steadyMinutes(
  startHour: number,
  durationMinutes: number,
  bpm: number,
): EffortHRSample[] {
  const out: EffortHRSample[] = [];
  for (let i = 0; i <= durationMinutes; i++) {
    const t = new Date('2026-05-01T00:00:00Z');
    t.setHours(startHour, i, 0, 0);
    out.push({ time: t, bpm });
  }
  return out;
}

describe('cumulativeEffortMinutes', () => {
  const restingHR = 50;
  const maxHR = 184;

  it('returns a single zero point when samples are empty', () => {
    expect(
      cumulativeEffortMinutes({ samples: [], restingHR, maxHR }),
    ).toEqual([{ minute: 0, cumMinutes: 0 }]);
  });

  it('zero accumulation for resting HR', () => {
    const samples = steadyMinutes(8, 60, 50); // exactly RHR
    const series = cumulativeEffortMinutes({ samples, restingHR, maxHR });
    // All points should have cumMinutes ≈ 0 (HRR fraction = 0 → tier 0).
    for (const p of series) {
      expect(p.cumMinutes).toBeCloseTo(0);
    }
  });

  it('60 min @ 70% HRR (144 bpm) accumulates to ~120 effort minutes (tier 2)', () => {
    // 70% HRR (134 reserve × 0.7 = 94) + 50 = 144 bpm → tier 2 (60-80%).
    const samples = steadyMinutes(8, 60, 144);
    const series = cumulativeEffortMinutes({ samples, restingHR, maxHR });
    const last = series[series.length - 1]!;
    // 60 min × tier 2 = 120 (with rounding fuzz).
    expect(last.cumMinutes).toBeGreaterThan(110);
    expect(last.cumMinutes).toBeLessThan(130);
  });

  it('cumulative monotonically non-decreasing', () => {
    const samples = steadyMinutes(8, 90, 130);
    const series = cumulativeEffortMinutes({ samples, restingHR, maxHR });
    for (let i = 1; i < series.length; i++) {
      expect(series[i]!.cumMinutes).toBeGreaterThanOrEqual(
        series[i - 1]!.cumMinutes,
      );
    }
  });
});

describe('intradayBioCharge', () => {
  it('starts low, ramps to wakeScore at wake, drains, ends at now', () => {
    const points = intradayBioCharge({
      wakeScore: 90,
      wakeMinute: 8 * 60, // 08:00
      effortByMinute: [
        { minute: 0, cumMinutes: 0 },
        { minute: 8 * 60, cumMinutes: 0 }, // none before wake
        { minute: 13 * 60, cumMinutes: 60 }, // 60 min @ tier 1 by 13:00
        { minute: 14 * 60, cumMinutes: 120 }, // intense session 13:00-14:00
        { minute: 16 * 60, cumMinutes: 120 }, // flat after
      ],
      nowMinute: 16 * 60, // 16:00
    });

    // Curve stops at "now" (16:00 = minute 960). With 30-min step,
    // points 0,30,60,...,960 → 33 points.
    expect(points.length).toBe(33);
    expect(points[points.length - 1]!.minute).toBe(16 * 60);

    // Pre-wake ramp ends at wakeScore.
    const atWake = points.find((p) => p.minute === 8 * 60)!;
    expect(atWake.value).toBe(90);

    // Pre-wake start is below wakeScore.
    expect(points[0]!.value).toBeLessThan(90);

    // 16:00 should be drained: 120 cum × 0.15 = 18 → 90-18 = 72.
    const atNow = points[points.length - 1]!;
    expect(atNow.value).toBeGreaterThanOrEqual(70);
    expect(atNow.value).toBeLessThanOrEqual(74);
  });

  it('anchors a final point at nowMinute even when it falls between steps', () => {
    const points = intradayBioCharge({
      wakeScore: 80,
      wakeMinute: 8 * 60,
      effortByMinute: [{ minute: 0, cumMinutes: 0 }],
      nowMinute: 8 * 60 + 47, // 08:47, between the 480 and 510 steps
    });
    expect(points[points.length - 1]!.minute).toBe(8 * 60 + 47);
  });

  it('clamps below 0 and above 100', () => {
    const points = intradayBioCharge({
      wakeScore: 100,
      wakeMinute: 0,
      effortByMinute: [
        { minute: 0, cumMinutes: 0 },
        { minute: 24 * 60, cumMinutes: 1000 }, // absurd drain
      ],
      nowMinute: 24 * 60,
    });
    for (const p of points) {
      expect(p.value).toBeGreaterThanOrEqual(0);
      expect(p.value).toBeLessThanOrEqual(100);
    }
  });

  it('zero drain when no effort accumulated', () => {
    const points = intradayBioCharge({
      wakeScore: 80,
      wakeMinute: 8 * 60,
      effortByMinute: [
        { minute: 0, cumMinutes: 0 },
        { minute: 24 * 60, cumMinutes: 0 },
      ],
      nowMinute: 16 * 60,
    });
    const atNow = points.find((p) => p.minute === 16 * 60)!;
    expect(atNow.value).toBe(80);
  });
});
