import { describe, expect, it } from 'vitest';
import type { CoachSession } from '@openfit/types';
import { adjustSession } from '../coach-adjust';

function makeSession(overrides: Partial<CoachSession> = {}): CoachSession {
  return {
    name: 'Upper A',
    focus: 'Press + back',
    estimatedDurationMinutes: 60,
    exercises: [
      {
        exerciseId: 'ex_bench',
        sets: [
          { reps: 8, loadPctOf1RM: 0.75, rpe: 7, restSeconds: 150 },
          { reps: 8, loadPctOf1RM: 0.75, rpe: 7, restSeconds: 150 },
          { reps: 8, loadPctOf1RM: 0.75, rpe: 7, restSeconds: 150 },
        ],
        rationale: 'Main press.',
      },
      {
        exerciseId: 'ex_row',
        sets: [
          { reps: 10, rpe: 7, restSeconds: 120 },
          { reps: 10, rpe: 7, restSeconds: 120 },
          { reps: 10, rpe: 7, restSeconds: 120 },
        ],
        rationale: 'Main row.',
      },
      {
        exerciseId: 'ex_curl',
        sets: [
          { reps: 12, rpe: 7, restSeconds: 60 },
          { reps: 12, rpe: 7, restSeconds: 60 },
          { reps: 12, rpe: 7, restSeconds: 60 },
          { reps: 12, rpe: 7, restSeconds: 60 },
        ],
        rationale: 'Biceps emphasis.',
      },
      {
        exerciseId: 'ex_tricep',
        sets: [
          { reps: 12, rpe: 7, restSeconds: 60 },
          { reps: 12, rpe: 7, restSeconds: 60 },
          { reps: 12, rpe: 7, restSeconds: 60 },
        ],
        rationale: 'Triceps finisher.',
      },
    ],
    ...overrides,
  };
}

describe('adjustSession', () => {
  it('returns the session unchanged when readiness is normal', () => {
    const session = makeSession();
    const result = adjustSession(session, {
      readiness: 70,
      phase: 'accumulation',
      recentLoad: 100,
    });

    expect(result.session).toBe(session);
    expect(result.volumeMultiplier).toBe(1);
    expect(result.reason).toBe('On plan.');
  });

  it('cuts to 85% with no accessory drop when readiness is mildly low', () => {
    const result = adjustSession(makeSession(), {
      readiness: 50,
      phase: 'accumulation',
      recentLoad: 100,
    });

    expect(result.volumeMultiplier).toBe(0.85);
    // 4 exercises in, 4 exercises out (no drop)
    expect(result.session.exercises).toHaveLength(4);
    // Mains keep all 3 sets, accessories trimmed
    expect(result.session.exercises[0]?.sets).toHaveLength(3);
    expect(result.session.exercises[1]?.sets).toHaveLength(3);
    expect(result.session.exercises[2]?.sets.length).toBeLessThan(4);
    expect(result.reason).toMatch(/trimmed/i);
  });

  it('cuts to 70% AND drops the last accessory when readiness is very low', () => {
    const result = adjustSession(makeSession(), {
      readiness: 30,
      phase: 'intensification',
      recentLoad: 200,
    });

    expect(result.volumeMultiplier).toBe(0.7);
    expect(result.session.exercises).toHaveLength(3);
    // First two (mains) preserved
    expect(result.session.exercises[0]?.exerciseId).toBe('ex_bench');
    expect(result.session.exercises[1]?.exerciseId).toBe('ex_row');
    // Third (accessory) survived; fourth was dropped
    expect(result.session.exercises[2]?.exerciseId).toBe('ex_curl');
    expect(result.reason).toMatch(/dropped/i);
  });

  it('boosts intensification week when readiness is high', () => {
    const session = makeSession();
    const result = adjustSession(session, {
      readiness: 90,
      phase: 'intensification',
      recentLoad: 80,
    });

    expect(result.volumeMultiplier).toBe(1.1);
    // Accessories gain a back-off set
    const lastAccessory = result.session.exercises[3];
    expect(lastAccessory?.sets.length).toBe(4); // was 3, now 4
    expect(lastAccessory?.sets.at(-1)?.rpe).toBeLessThan(7); // back-off RPE
    expect(result.reason).toMatch(/strong recovery/i);
  });

  it('does NOT boost during a deload even when readiness is high', () => {
    const session = makeSession();
    const result = adjustSession(session, {
      readiness: 95,
      phase: 'deload',
      recentLoad: 50,
    });

    expect(result.session).toBe(session);
    expect(result.volumeMultiplier).toBe(1);
  });

  it('does NOT boost during accumulation even when readiness is high', () => {
    const session = makeSession();
    const result = adjustSession(session, {
      readiness: 95,
      phase: 'accumulation',
      recentLoad: 50,
    });

    expect(result.session).toBe(session);
    expect(result.volumeMultiplier).toBe(1);
  });

  it('respects allowBoost: false', () => {
    const session = makeSession();
    const result = adjustSession(
      session,
      { readiness: 95, phase: 'intensification', recentLoad: 50 },
      { allowBoost: false },
    );

    expect(result.session).toBe(session);
    expect(result.volumeMultiplier).toBe(1);
  });

  it('does not drop the last exercise when there are only 3', () => {
    const small = makeSession({
      exercises: makeSession().exercises.slice(0, 3),
    });
    const result = adjustSession(small, {
      readiness: 25,
      phase: 'accumulation',
      recentLoad: 200,
    });

    expect(result.session.exercises).toHaveLength(3);
    expect(result.volumeMultiplier).toBe(0.7);
  });
});
