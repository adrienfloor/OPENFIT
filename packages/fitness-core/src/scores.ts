/**
 * Daily wellness scores for the Today dashboard — sleep, effort, and readiness
 * (a.k.a. Zepp's BioCharge / Whoop Recovery / Garmin Body Battery).
 *
 * All algorithms here are open and published. We deliberately avoid reverse-
 * engineering Zepp's proprietary numbers: the goal is a transparent model that
 * a user can read and understand from the code.
 *
 *   Sleep    — composite of duration, efficiency (+ awakenings), stage balance,
 *              and bedtime regularity.
 *   Effort   — HUNT Fitness Study PAI algorithm (TBD — Slice 2).
 *   Readiness — HRV/RHR baseline deviation + sleep + training-load decay (Slice 3).
 */

export const DEFAULT_SLEEP_NEED_MINUTES = 480; // 8 hours

export interface SleepScoreInput {
  /** Time actually asleep (session span minus awake). */
  durationMinutes: number;
  /** Minutes awake during the session. Drives the efficiency sub-score. */
  awakeMinutes: number;
  /** Number of contiguous awake episodes during the session. */
  awakeningCount?: number;
  /** Optional stage breakdown — if present, deep/REM components are scored. */
  deepMinutes?: number;
  remMinutes?: number;
  lightMinutes?: number;
  /** 0–100 bedtime-consistency score over the last ~7 nights. */
  regularityScore?: number;
  /** Nightly sleep target. Defaults to 480 min (8 h). */
  sleepNeedMinutes?: number;
}

export interface SleepScoreResult {
  /** Overall 0–100. */
  score: number;
  /** Sub-scores for UI drill-down. `null` where data was missing. */
  components: {
    duration: number;
    efficiency: number;
    deep: number | null;
    rem: number | null;
    regularity: number | null;
  };
}

/**
 * Weights for each component. The formula is a weighted mean over whichever
 * components are available; missing ones drop out and the remaining weights
 * renormalise so a user with no stage data still gets a meaningful score.
 */
const W = {
  duration: 0.35,
  efficiency: 0.15,
  deep: 0.15,
  rem: 0.15,
  regularity: 0.2,
} as const;

/** Every extra awakening beyond this grace count docks the efficiency score. */
const AWAKENING_GRACE = 2;
const AWAKENING_PENALTY_PER = 5;

export function sleepScore(input: SleepScoreInput): SleepScoreResult {
  const target = input.sleepNeedMinutes ?? DEFAULT_SLEEP_NEED_MINUTES;
  const duration = Math.max(0, input.durationMinutes);
  const awake = Math.max(0, input.awakeMinutes);
  const awakenings = Math.max(0, input.awakeningCount ?? 0);

  const durationSub = scoreDuration(duration, target);

  const efficiencyBase = scoreEfficiency(duration, awake);
  const awakeningsPenalty =
    Math.max(0, awakenings - AWAKENING_GRACE) * AWAKENING_PENALTY_PER;
  const efficiencySub = clamp0to100(efficiencyBase - awakeningsPenalty);

  const hasStages =
    input.deepMinutes !== undefined && input.remMinutes !== undefined;

  const deepSub =
    hasStages && duration > 0
      ? scoreStageRatio((input.deepMinutes ?? 0) / duration, 0.13, 0.23)
      : null;
  const remSub =
    hasStages && duration > 0
      ? scoreStageRatio((input.remMinutes ?? 0) / duration, 0.2, 0.25)
      : null;

  const regSub =
    input.regularityScore !== undefined
      ? clamp0to100(input.regularityScore)
      : null;

  let totalWeight = W.duration + W.efficiency;
  let weighted = W.duration * durationSub + W.efficiency * efficiencySub;

  if (deepSub !== null) {
    totalWeight += W.deep;
    weighted += W.deep * deepSub;
  }
  if (remSub !== null) {
    totalWeight += W.rem;
    weighted += W.rem * remSub;
  }
  if (regSub !== null) {
    totalWeight += W.regularity;
    weighted += W.regularity * regSub;
  }

  const overall = weighted / totalWeight;

  return {
    score: clamp0to100(Math.round(overall)),
    components: {
      duration: Math.round(durationSub),
      efficiency: Math.round(efficiencySub),
      deep: deepSub !== null ? Math.round(deepSub) : null,
      rem: remSub !== null ? Math.round(remSub) : null,
      regularity: regSub !== null ? Math.round(regSub) : null,
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

/**
 * Stage-ratio score with a tight sweet spot.
 *
 * Inside [lo, hi] = 100. Below lo, score follows a quadratic that hits 0 at
 * lo/2 and 100 at lo — so a stage at ~75 % of the lower target scores around
 * 50, not 75 like a linear curve would give. Above hi, gentle linear drop
 * capped at −40 pts over 1.7 × the sweet-spot width (oversupply is less bad
 * than undersupply, clinically speaking).
 */
function scoreStageRatio(ratio: number, lo: number, hi: number): number {
  if (ratio >= lo && ratio <= hi) return 100;
  if (ratio < lo) {
    const floor = lo / 2;
    if (ratio <= floor) return 0;
    const t = (ratio - floor) / (lo - floor);
    return clamp0to100(t * t * 100);
  }
  const above = ratio - hi;
  const tolerance = (hi - lo) * 1.7;
  const pct = Math.min(above / tolerance, 1);
  return clamp0to100(100 - pct * 40);
}

function clamp0to100(v: number): number {
  return Math.max(0, Math.min(100, v));
}

// ──────────────────────────────────────────────────────────────────────────
// Effort score — PAI-style daily activity intensity
// ──────────────────────────────────────────────────────────────────────────

export interface EffortHRSample {
  time: Date;
  bpm: number;
}

export interface EffortScoreInput {
  /** 24 h heart-rate samples — unevenly spaced is fine. */
  samples: EffortHRSample[];
  /** Resting HR for the %HRR (Karvonen) calculation. */
  restingHR: number;
  /** Age-predicted max HR, e.g. `calculateMaxHR(age)` from heart-rate.ts. */
  maxHR: number;
  /**
   * Daily target of intensity-weighted minutes. A sedentary day scores near 0;
   * ~30 min of vigorous exercise plus a day of light activity lands around
   * 60–80; a heavy training day clamps at 100. Default 100.
   */
  targetMinutes?: number;
  /**
   * Gaps larger than this (in minutes) between consecutive samples are
   * dropped — treats device-off windows as "no data", not as a long block at
   * the last recorded HR. Default 10.
   */
  maxGapMinutes?: number;
}

/**
 * Daily effort score in the style of Zepp's "Effort", Whoop "Strain", and
 * HUNT Fitness Study PAI. Not strictly PAI — we use %HRR (heart rate reserve)
 * rather than %MHR, with 5 published intensity tiers. Transparent and
 * auditable, which is the OpenFit ethos.
 *
 * Intensity tiers (%HRR → pts/min):
 *
 *   < 40  →  0   (rest / incidental)
 *   40–60 →  1   (moderate — brisk walk, easy cycling)
 *   60–80 →  2   (vigorous — run, hard cycling)
 *   80–90 →  3   (hard — tempo, intervals)
 *   ≥ 90  →  4   (near max — sprints)
 *
 * Integrates the weight over time gaps between consecutive samples; returns
 * 0–100 where 100 means the daily intensity-minute target was met.
 */
export function effortScore({
  samples,
  restingHR,
  maxHR,
  targetMinutes = 100,
  maxGapMinutes = 10,
}: EffortScoreInput): number {
  if (samples.length < 2) return 0;
  const hrr = maxHR - restingHR;
  if (hrr <= 0) return 0;

  const sorted = [...samples].sort(
    (a, b) => a.time.getTime() - b.time.getTime(),
  );

  let intensityMinutes = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const s1 = sorted[i] as EffortHRSample;
    const s2 = sorted[i + 1] as EffortHRSample;
    const gapMinutes = (s2.time.getTime() - s1.time.getTime()) / 60000;
    if (gapMinutes <= 0 || gapMinutes > maxGapMinutes) continue;

    const avgBpm = (s1.bpm + s2.bpm) / 2;
    const intensity = Math.max(0, (avgBpm - restingHR) / hrr);
    intensityMinutes += gapMinutes * weightForIntensity(intensity);
  }

  return clamp0to100(Math.round((intensityMinutes / targetMinutes) * 100));
}

function weightForIntensity(hrrFraction: number): number {
  if (hrrFraction >= 0.9) return 4;
  if (hrrFraction >= 0.8) return 3;
  if (hrrFraction >= 0.6) return 2;
  if (hrrFraction >= 0.4) return 1;
  return 0;
}
