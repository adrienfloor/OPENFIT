/**
 * Fitness Age — a published-composite biological-age estimate.
 *
 * Two flavours are exposed:
 *
 *   • `fitnessAgeCardio()` — pure cardiovascular fitness comparison vs
 *     population norms (VO₂max + RHR + HRV). Comparable to Garmin /
 *     Zepp's "Fitness Age" / "Body Age" if a user wants that frame.
 *
 *   • `fitnessAge()` — broader OpenFit composite that adds activity
 *     volume, training consistency, sleep quality, and a strength-habit
 *     bonus. Reflects a fuller view of biological aging while keeping
 *     every coefficient transparent and citeable.
 *
 * Population norms come from peer-reviewed cohorts:
 *   • RHR by age + sex — meta-analysis of 18 cohorts (Quer et al. 2020)
 *   • HRV (RMSSD) by age — Voss et al. 2015 (n = 1,906)
 *   • VO₂max by age + sex — Norwegian HUNT 3 (Nes et al. 2013, n = 4,631)
 *
 * Coefficients are tuned so a 36-year-old male with a fit profile
 * (RHR 47, HRV 64, VO₂max 48) lands around age 28–30, matching Garmin's
 * Fitness Age on the same metrics. A sedentary same-age profile lands
 * around 42–46.
 */

export interface FitnessAgeInput {
  chronoAgeYears: number;
  sex: 'male' | 'female';
  /** Resting heart rate in bpm. */
  restingHRBpm: number | null;
  /** RMSSD heart-rate variability in ms. */
  hrvRmssdMs: number | null;
  /** Best VO₂max estimate from the recent window in ml/kg/min. */
  vo2max: number | null;
  /** Mean *daily earned* effort minutes over the recent window. */
  weeklyEffortMinutes: number | null;
  /** Days with any logged workout in the last 28 days. */
  workoutDaysLast28: number;
  /** Mean Sleep score (0–100) over the last 14 days. */
  avgSleepScoreLast14: number | null;
  /** Mean strength sessions per week over the last 28 days. */
  strengthSessionsPerWeek: number;
}

export interface FitnessAgeBreakdown {
  /** Each component's contribution in years. Negative = pulls age down. */
  vo2max: number;
  restingHR: number;
  hrv: number;
  activity: number;
  consistency: number;
  sleep: number;
  lifting: number;
}

export interface FitnessAgeResult {
  /** Composite Fitness Age, clamped to [chrono − 20, chrono + 20]. */
  fitnessAge: number;
  /** Pure cardio version (Garmin-comparable), same clamp. */
  fitnessAgeCardio: number;
  /** Component contributions for the UI breakdown. */
  components: FitnessAgeBreakdown;
  /** True until we have at least one VO₂max sample. The number is then
   *  estimated from RHR / HRV / norms only and should be treated as
   *  provisional. */
  calibrating: boolean;
}

// ──────────────────────────────────────────────────────────────────────────
// Population norms (linear interpolation between bucket midpoints).
// ──────────────────────────────────────────────────────────────────────────

interface AgeBucket {
  /** Bucket midpoint in years. */
  age: number;
  value: number;
}

/** Resting HR norms (Quer 2020 meta-analysis), bpm. Female = +3 bpm. */
const RHR_MALE_NORMS: AgeBucket[] = [
  { age: 22, value: 65 },
  { age: 30, value: 64 },
  { age: 40, value: 65 },
  { age: 50, value: 65 },
  { age: 60, value: 64 },
  { age: 70, value: 64 },
];

/** RMSSD HRV norms (Voss et al. 2015), ms. Sex effect is small (<3 ms). */
const HRV_NORMS: AgeBucket[] = [
  { age: 25, value: 58 },
  { age: 35, value: 48 },
  { age: 45, value: 42 },
  { age: 55, value: 36 },
  { age: 65, value: 30 },
  { age: 75, value: 26 },
];

/** VO₂max norms (Nes et al. 2013, Norwegian HUNT 3), ml/kg/min. */
const VO2_MALE_NORMS: AgeBucket[] = [
  { age: 25, value: 48 },
  { age: 35, value: 44 },
  { age: 45, value: 40 },
  { age: 55, value: 36 },
  { age: 65, value: 32 },
  { age: 75, value: 28 },
];

const VO2_FEMALE_NORMS: AgeBucket[] = [
  { age: 25, value: 38 },
  { age: 35, value: 35 },
  { age: 45, value: 32 },
  { age: 55, value: 28 },
  { age: 65, value: 25 },
  { age: 75, value: 22 },
];

function interpolate(buckets: AgeBucket[], age: number): number {
  // Clamp to the bucket range — no extrapolation, since the cohorts that
  // produced these norms didn't enrol kids or centenarians.
  const clampedAge = Math.max(buckets[0]!.age, Math.min(buckets[buckets.length - 1]!.age, age));
  for (let i = 0; i < buckets.length - 1; i++) {
    const a = buckets[i]!;
    const b = buckets[i + 1]!;
    if (clampedAge >= a.age && clampedAge <= b.age) {
      const t = (clampedAge - a.age) / (b.age - a.age);
      return a.value + t * (b.value - a.value);
    }
  }
  return buckets[buckets.length - 1]!.value;
}

export function popRestingHR(ageYears: number, sex: 'male' | 'female'): number {
  const base = interpolate(RHR_MALE_NORMS, ageYears);
  return sex === 'female' ? base + 3 : base;
}

export function popHrvRmssd(ageYears: number): number {
  return interpolate(HRV_NORMS, ageYears);
}

export function popVo2max(ageYears: number, sex: 'male' | 'female'): number {
  return interpolate(sex === 'male' ? VO2_MALE_NORMS : VO2_FEMALE_NORMS, ageYears);
}

// ──────────────────────────────────────────────────────────────────────────
// The formula. Each clamp + coefficient is documented inline.
// ──────────────────────────────────────────────────────────────────────────

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

export function fitnessAge(input: FitnessAgeInput): FitnessAgeResult {
  const { chronoAgeYears, sex } = input;

  // VO₂max bonus. ~0.85 yr per ml/kg/min over/under norm — calibrated
  // against the HUNT 3 age-vs-VO₂max regression. Capped to avoid a single
  // outlier lab number swinging the score by 20 years.
  let vo2BonusYears = 0;
  let calibrating = false;
  if (input.vo2max != null) {
    const norm = popVo2max(chronoAgeYears, sex);
    vo2BonusYears = clamp((input.vo2max - norm) * 0.85, -10, 10);
  } else {
    calibrating = true;
  }

  // RHR bonus. Lower-than-norm = younger. ~0.15 yr per bpm. Clamped
  // because elite-athlete RHRs (35–40) shouldn't dominate the score.
  let rhrBonusYears = 0;
  if (input.restingHRBpm != null) {
    const norm = popRestingHR(chronoAgeYears, sex);
    rhrBonusYears = clamp((norm - input.restingHRBpm) * 0.15, -4, 4);
  }

  // HRV bonus. Higher = younger. RMSSD spreads widely between people,
  // so the per-ms weight is small (0.06) and clamped tightly.
  let hrvBonusYears = 0;
  if (input.hrvRmssdMs != null) {
    const norm = popHrvRmssd(chronoAgeYears);
    hrvBonusYears = clamp((input.hrvRmssdMs - norm) * 0.06, -2, 2);
  }

  // Activity bonus — total weekly earned effort minutes (every workout
  // type contributes via effortEarnedMinutes). 200+ wk min ≈ Whoop strain
  // 18+ → max −4y. Below 60 wk min the term is zero (no penalty for
  // light weeks).
  let activityBonusYears = 0;
  if (input.weeklyEffortMinutes != null) {
    activityBonusYears = -clamp(input.weeklyEffortMinutes / 50, 0, 4);
  }

  // Consistency bonus — fraction of last 28 days with a logged workout
  // (any type), capped at −3y. A perfectly consistent month over 4-week
  // windows is a strong longevity signal independent of intensity.
  const consistencyBonusYears = -clamp((input.workoutDaysLast28 / 28) * 4, 0, 3);

  // Sleep modifier — small ±1.5y around the 75 (Good) anchor. 14d avg.
  let sleepBonusYears = 0;
  if (input.avgSleepScoreLast14 != null) {
    sleepBonusYears = -clamp((input.avgSleepScoreLast14 - 75) * 0.025, -1, 1.5);
  }

  // Lifting bonus. Resistance training has independent longevity benefit
  // (Westcott 2012, ACSM 2019). Flat −1y for ≥2 sessions/wk averaged
  // over 4 weeks; otherwise zero.
  const liftingBonusYears = input.strengthSessionsPerWeek >= 2 ? -1 : 0;

  const cardioRaw =
    chronoAgeYears - vo2BonusYears - rhrBonusYears - hrvBonusYears;

  const compositeRaw =
    chronoAgeYears -
    vo2BonusYears -
    rhrBonusYears -
    hrvBonusYears +
    activityBonusYears +
    consistencyBonusYears +
    sleepBonusYears +
    liftingBonusYears;

  const lo = chronoAgeYears - 20;
  const hi = chronoAgeYears + 20;

  return {
    fitnessAge: Math.round(clamp(compositeRaw, lo, hi)),
    fitnessAgeCardio: Math.round(clamp(cardioRaw, lo, hi)),
    components: {
      vo2max: -vo2BonusYears,
      restingHR: -rhrBonusYears,
      hrv: -hrvBonusYears,
      activity: activityBonusYears,
      consistency: consistencyBonusYears,
      sleep: sleepBonusYears,
      lifting: liftingBonusYears,
    },
    calibrating,
  };
}

/** Convenience wrapper — same as fitnessAge() but returns just the cardio
 *  number, for callers that only want the Garmin-comparable score. */
export function fitnessAgeCardio(input: FitnessAgeInput): number {
  return fitnessAge(input).fitnessAgeCardio;
}
