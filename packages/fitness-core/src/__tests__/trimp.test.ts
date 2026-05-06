import { describe, it, expect } from 'vitest';
import { dailyTrimp, trimpPerMinute } from '../trimp';
import type { EffortHRSample } from '../scores';

/**
 * Build a sequence of 1-minute-spaced HR samples at a constant bpm, starting
 * at midnight. Used to verify steady-state TRIMP accumulation.
 */
function steadyMinutes(bpm: number, minutes: number): EffortHRSample[] {
  const start = new Date('2026-05-01T00:00:00Z');
  const samples: EffortHRSample[] = [];
  for (let i = 0; i <= minutes; i++) {
    samples.push({ time: new Date(start.getTime() + i * 60_000), bpm });
  }
  return samples;
}

describe('trimpPerMinute', () => {
  it('returns 0 at rest', () => {
    expect(trimpPerMinute(0, 'male')).toBe(0);
    expect(trimpPerMinute(0, 'female')).toBe(0);
  });

  it('clamps below-zero inputs to 0', () => {
    expect(trimpPerMinute(-0.2, 'male')).toBe(0);
  });

  it('clamps above-one inputs (TRIMP capped at full HRR)', () => {
    const atMax = trimpPerMinute(1, 'male');
    const above = trimpPerMinute(1.5, 'male');
    expect(above).toBeCloseTo(atMax);
  });

  it('exponential weighting — hard intensity worth far more than easy', () => {
    const easy = trimpPerMinute(0.5, 'male'); // 50 % HRR
    const hard = trimpPerMinute(0.9, 'male'); // 90 % HRR
    // Banister's weighting: 1 min @ 90% HRR ≈ 3.9× a min @ 50% HRR (exact 3.88).
    expect(hard / easy).toBeGreaterThan(3.5);
    // …and a min @ 100% HRR is ~6× a min @ 50%.
    expect(trimpPerMinute(1, 'male') / easy).toBeGreaterThan(5);
  });

  it('female coefficients yield slightly higher values at moderate HRR', () => {
    // 0.86 · e^(1.67·HRR) crosses 0.64 · e^(1.92·HRR) around HRR ~ 1.18,
    // so for any HRR < 1 the female curve is higher.
    expect(trimpPerMinute(0.6, 'female')).toBeGreaterThan(
      trimpPerMinute(0.6, 'male'),
    );
  });
});

describe('dailyTrimp', () => {
  const restingHR = 50;
  const maxHR = 184; // 36 yo Tanaka

  it('returns 0 with fewer than 2 samples', () => {
    expect(
      dailyTrimp({ samples: [], restingHR, maxHR, sex: 'male' }),
    ).toBe(0);
    expect(
      dailyTrimp({
        samples: [{ time: new Date(), bpm: 120 }],
        restingHR,
        maxHR,
        sex: 'male',
      }),
    ).toBe(0);
  });

  it('returns 0 when reserve is non-positive', () => {
    expect(
      dailyTrimp({
        samples: steadyMinutes(120, 30),
        restingHR: 200,
        maxHR: 180,
        sex: 'male',
      }),
    ).toBe(0);
  });

  it('30 min steady at ~50% HRR scales to typical "easy" load', () => {
    // 50% of HRR (134) above 50 → 117 bpm. 30 min should land around
    // 25 TRIMP for a male — hallmark of an easy session (Edwards "Z2").
    const trimp = dailyTrimp({
      samples: steadyMinutes(117, 30),
      restingHR,
      maxHR,
      sex: 'male',
    });
    expect(trimp).toBeGreaterThan(15);
    expect(trimp).toBeLessThan(40);
  });

  it('30 min hard intervals (≈85% HRR) yield much higher TRIMP', () => {
    // 85% of HRR (134) above 50 → 164 bpm.
    const trimp = dailyTrimp({
      samples: steadyMinutes(164, 30),
      restingHR,
      maxHR,
      sex: 'male',
    });
    // 30 min at 85% HRR is a brutal stimulus — should be 70+.
    expect(trimp).toBeGreaterThan(70);
    expect(trimp).toBeLessThan(200);
  });

  it('hard session worth more than easy session of same duration', () => {
    const easy = dailyTrimp({
      samples: steadyMinutes(110, 30),
      restingHR,
      maxHR,
      sex: 'male',
    });
    const hard = dailyTrimp({
      samples: steadyMinutes(170, 30),
      restingHR,
      maxHR,
      sex: 'male',
    });
    expect(hard).toBeGreaterThan(easy * 4);
  });

  it('drops gaps larger than maxGapMinutes (device off)', () => {
    const start = new Date('2026-05-01T00:00:00Z');
    const samples: EffortHRSample[] = [
      { time: start, bpm: 150 },
      // 60-minute gap — should be dropped at default maxGapMinutes=10.
      { time: new Date(start.getTime() + 60 * 60_000), bpm: 150 },
      // Then 30 minutes of contiguous data.
      ...steadyMinutes(150, 30).map((s) => ({
        time: new Date(s.time.getTime() + 60 * 60_000),
        bpm: s.bpm,
      })),
    ];
    const trimp = dailyTrimp({
      samples,
      restingHR,
      maxHR,
      sex: 'male',
    });
    // ~30 min at 150 bpm only — the 60-min gap doesn't add load.
    const reference = dailyTrimp({
      samples: steadyMinutes(150, 30),
      restingHR,
      maxHR,
      sex: 'male',
    });
    expect(trimp).toBeCloseTo(reference, -1);
  });

  it("Adrien's Zepp-recorded ~600-700 TRIMP day from a hard-effort 1.5h session", () => {
    // Sanity-check: a 90-min effort averaging ~145 bpm (≈70% HRR for him).
    // This should land somewhere around 100–250 TRIMP, well below the
    // ~750 spike that Zepp recorded for a brutally hard day.
    const samples = steadyMinutes(145, 90);
    const trimp = dailyTrimp({
      samples,
      restingHR: 47,
      maxHR: 184,
      sex: 'male',
    });
    expect(trimp).toBeGreaterThan(80);
    expect(trimp).toBeLessThan(300);
  });
});
