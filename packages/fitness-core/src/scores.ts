/**
 * Daily wellness scores for the Today dashboard — sleep, effort, and readiness
 * (a.k.a. Zepp's BioCharge / Whoop Recovery / Garmin Body Battery).
 *
 * All algorithms here are open and published. We deliberately avoid reverse-
 * engineering Zepp's proprietary numbers: the goal is a transparent model that
 * a user can read and understand from the code.
 *
 *   Sleep    — composite of duration-vs-need, efficiency, and stage balance.
 *   Effort   — HUNT Fitness Study PAI algorithm (TBD — Slice 2).
 *   Readiness — HRV/RHR baseline deviation + sleep + training-load decay (Slice 3).
 */

export const DEFAULT_SLEEP_NEED_MINUTES = 480; // 8 hours

export interface SleepScoreInput {
  /** Time actually asleep (session span minus awake). */
  durationMinutes: number;
  /** Minutes awake during the session. Drives the efficiency sub-score. */
  awakeMinutes: number;
  /** Optional stage breakdown — if present, deep/REM components are scored. */
  deepMinutes?: number;
  remMinutes?: number;
  lightMinutes?: number;
  /** Nightly sleep target. Defaults to 480 min (8 h). */
  sleepNeedMinutes?: number;
}

export interface SleepScoreResult {
  /** Overall 0–100. */
  score: number;
  /** Sub-scores for UI drill-down. `deep` / `rem` are null when stage data is missing. */
  components: {
    duration: number;
    efficiency: number;
    deep: number | null;
    rem: number | null;
  };
}

/**
 * Compute an overall sleep score from last-night's sleep summary.
 *
 * With stages: 0.50 · duration + 0.20 · efficiency + 0.15 · deep + 0.15 · rem
 * Without stages: 0.80 · duration + 0.20 · efficiency (re-normalised)
 */
export function sleepScore(input: SleepScoreInput): SleepScoreResult {
  const target = input.sleepNeedMinutes ?? DEFAULT_SLEEP_NEED_MINUTES;
  const duration = Math.max(0, input.durationMinutes);
  const awake = Math.max(0, input.awakeMinutes);

  const durationSub = scoreDuration(duration, target);
  const efficiencySub = scoreEfficiency(duration, awake);

  const hasStages =
    input.deepMinutes !== undefined && input.remMinutes !== undefined;

  let deepSub: number | null = null;
  let remSub: number | null = null;

  if (hasStages && duration > 0) {
    deepSub = scoreDeepRatio((input.deepMinutes ?? 0) / duration);
    remSub = scoreRemRatio((input.remMinutes ?? 0) / duration);
  }

  const overall =
    hasStages && deepSub !== null && remSub !== null
      ? 0.5 * durationSub + 0.2 * efficiencySub + 0.15 * deepSub + 0.15 * remSub
      : 0.8 * durationSub + 0.2 * efficiencySub;

  return {
    score: clamp0to100(Math.round(overall)),
    components: {
      duration: Math.round(durationSub),
      efficiency: Math.round(efficiencySub),
      deep: deepSub !== null ? Math.round(deepSub) : null,
      rem: remSub !== null ? Math.round(remSub) : null,
    },
  };
}

/**
 * Piecewise duration score. Full credit between target and target+1h; gentle
 * linear penalty past that so chronic oversleep is flagged but not crushed.
 */
function scoreDuration(duration: number, target: number): number {
  if (duration <= 0) return 0;
  const ratio = duration / target;
  if (ratio < 0.5) return 100 * ratio;
  if (ratio < 1.0) return 50 + (ratio - 0.5) * 100;
  if (ratio <= 1.125) return 100;
  // 100 at +1h over target → 80 at +4h over target
  const overshoot = Math.min(ratio - 1.125, 0.375);
  return 100 - (overshoot / 0.375) * 20;
}

/** Asleep fraction of time in bed. 0.70 → 0, 0.90 → 100, clamped. */
function scoreEfficiency(duration: number, awake: number): number {
  const timeInBed = duration + awake;
  if (timeInBed <= 0) return 0;
  const efficiency = duration / timeInBed;
  const raw = ((efficiency - 0.7) / (0.9 - 0.7)) * 100;
  return clamp0to100(raw);
}

/** Clinical sweet spot 13–23 % of total asleep. */
function scoreDeepRatio(ratio: number): number {
  const lo = 0.13;
  const hi = 0.23;
  if (ratio >= lo && ratio <= hi) return 100;
  if (ratio < lo) return clamp0to100((ratio / lo) * 100);
  const excess = Math.min(ratio - hi, 0.17);
  return 100 - (excess / 0.17) * 40;
}

/** Clinical sweet spot 20–25 % of total asleep. */
function scoreRemRatio(ratio: number): number {
  const lo = 0.2;
  const hi = 0.25;
  if (ratio >= lo && ratio <= hi) return 100;
  if (ratio < lo) return clamp0to100((ratio / lo) * 100);
  const excess = Math.min(ratio - hi, 0.15);
  return 100 - (excess / 0.15) * 30;
}

function clamp0to100(v: number): number {
  return Math.max(0, Math.min(100, v));
}
