/**
 * Daily session adjustment — pure rule engine, no LLM.
 *
 * Takes a planned session from a generated program plus the user's current
 * readiness / mesocycle phase / recent load and returns an adjusted session
 * with a short reason string for the UI banner.
 *
 * Why deterministic, not LLM:
 * - Runs on the daily hot path; LLM cost / latency unacceptable.
 * - Adjustments are simple and need to be explainable / testable.
 * - The LLM already shaped the program with this rule engine in mind: phase
 *   drives whether we'll cap reps (deload) or push (intensification).
 */

import type {
  CoachAdjustmentContext,
  CoachAdjustmentResult,
  CoachPlannedExercise,
  CoachPlannedSet,
  CoachSession,
} from '@openfit/types';

export interface AdjustSessionOptions {
  /** Allow upward adjustment when readiness is high. Default true. */
  allowBoost?: boolean;
}

/**
 * Apply daily-readiness modulation to a planned session.
 *
 * Rules (applied in order, first match wins):
 *
 *   readiness < 40                                       → cut to 70%, drop last accessory
 *   readiness < 55                                       → cut to 85%
 *   readiness > 85 AND phase = intensification (boost on) → boost to 110% (last set added)
 *   else                                                  → unchanged
 *
 * Deload weeks never receive a boost — the whole point of a deload is to
 * undertrain on purpose. High-readiness deload days return unchanged.
 */
export function adjustSession(
  session: CoachSession,
  ctx: CoachAdjustmentContext,
  opts: AdjustSessionOptions = {},
): CoachAdjustmentResult {
  const allowBoost = opts.allowBoost ?? true;

  if (ctx.readiness < 40) {
    return {
      session: scaleSession(session, 0.7, { dropLastAccessory: true }),
      reason: 'Low readiness — reduced volume and dropped the last accessory.',
      volumeMultiplier: 0.7,
    };
  }

  if (ctx.readiness < 55) {
    return {
      session: scaleSession(session, 0.85),
      reason: 'Below baseline — trimmed accessory volume.',
      volumeMultiplier: 0.85,
    };
  }

  if (allowBoost && ctx.readiness > 85 && ctx.phase === 'intensification') {
    return {
      session: scaleSession(session, 1.1),
      reason: 'Strong recovery — added a back-off set on accessories.',
      volumeMultiplier: 1.1,
    };
  }

  return {
    session,
    reason: 'On plan.',
    volumeMultiplier: 1,
  };
}

interface ScaleOptions {
  dropLastAccessory?: boolean;
}

function scaleSession(
  session: CoachSession,
  multiplier: number,
  opts: ScaleOptions = {},
): CoachSession {
  const exercises = session.exercises.map((ex, i) => {
    const isMain = i < 2; // first two are the compound mains; never trim sets off them
    return scaleExercise(ex, multiplier, { trimSets: !isMain });
  });

  const trimmed =
    opts.dropLastAccessory && exercises.length > 3
      ? exercises.slice(0, -1)
      : exercises;

  return {
    ...session,
    exercises: trimmed,
    estimatedDurationMinutes: Math.max(
      15,
      Math.round(session.estimatedDurationMinutes * multiplier),
    ),
  };
}

function scaleExercise(
  ex: CoachPlannedExercise,
  multiplier: number,
  opts: { trimSets: boolean },
): CoachPlannedExercise {
  let sets: CoachPlannedSet[] = ex.sets;

  if (opts.trimSets && multiplier < 1) {
    const targetCount = Math.max(1, Math.round(ex.sets.length * multiplier));
    sets = ex.sets.slice(0, targetCount);
  } else if (opts.trimSets && multiplier > 1) {
    // Boost: duplicate the last set as a back-off (cap at 8 to respect schema).
    if (ex.sets.length < 8) {
      const last = ex.sets[ex.sets.length - 1] as CoachPlannedSet;
      sets = [...ex.sets, { ...last, rpe: Math.max(1, last.rpe - 1) }];
    }
  }

  return { ...ex, sets };
}
