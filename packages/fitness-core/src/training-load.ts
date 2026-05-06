/**
 * Performance Management Chart (PMC) — the Banister/TrainingPeaks model
 * for tracking training fitness, fatigue, and form. Fed by daily TRIMP.
 *
 *   ATL  (Acute Training Load)   = EMA(daily TRIMP, τ=7)   → "fatigue"
 *   CTL  (Chronic Training Load) = EMA(daily TRIMP, τ=42)  → "fitness"
 *   TSB  (Training Stress Balance) = CTL_yesterday − ATL_yesterday → "form"
 *
 * Both EMAs use the discrete recursive form:
 *   load_today = load_yesterday + (trimp_today − load_yesterday) · (1 − e^(−1/τ))
 *
 * Mirrors Zepp's "Niveau de fatigue / Niveau de forme / Statut de
 * l'entraînement" exactly (in-app screen 1 confirmed CTL=72 / ATL=67 /
 * TSB=+5 → "Énergique").
 *
 * The TSB tier mapping uses the published TrainingPeaks bands:
 *   TSB > +25         → "Détendu"  (very fresh — racing or detraining)
 *   +5  to +25        → "Énergique" (rested, ready)
 *   −10 to +5         → "Équilibré" (balanced)
 *   −30 to −10        → "Optimal"   (productive overload)
 *   < −30             → "Surchargé" (overreaching — risk zone)
 */

const ATL_TAU = 7;
const CTL_TAU = 42;

const ATL_DECAY = 1 - Math.exp(-1 / ATL_TAU);
const CTL_DECAY = 1 - Math.exp(-1 / CTL_TAU);

export type TrainingStatusTier =
  | 'detrained'
  | 'energetic'
  | 'balanced'
  | 'optimal'
  | 'overreaching';

export interface PMCResult {
  /** Latest CTL ("fitness"). */
  ctl: number;
  /** Latest ATL ("fatigue"). */
  atl: number;
  /** Latest TSB ("form") = CTL_yesterday − ATL_yesterday. */
  tsb: number;
  /** Tier mapped from TSB. */
  tier: TrainingStatusTier;
  /** True until at least 14 days of history are available. CTL needs ~6 weeks
   *  to fully stabilise; below 14 days the values are too noisy to trust. */
  calibrating: boolean;
  /** Number of daily-TRIMP entries actually used (after filtering nulls). */
  daysUsed: number;
  /**
   * Per-day series for charting (oldest → newest, today last). Each entry
   * carries the day's TRIMP plus the rolling CTL / ATL / TSB after that day.
   */
  series: PMCDay[];
}

export interface PMCDay {
  /** Daily TRIMP for this day. Null = no data (treated as 0 for accumulation). */
  trimp: number | null;
  ctl: number;
  atl: number;
  /** TSB on this day = CTL_yesterday − ATL_yesterday (so today's TSB reflects
   *  yesterday's fitness/fatigue, the published convention). */
  tsb: number;
}

/**
 * Compute the rolling PMC from a chronological series of daily TRIMP
 * (oldest → newest). Missing days should be passed as 0 — silence still
 * decays the EMAs.
 *
 * Initial CTL/ATL seeded at the mean of the first 7 days when there's
 * enough data, else seeded at 0 — the EMAs converge regardless given a
 * long enough window, but seeding helps cold-starts read sensibly.
 */
export function computePMC(dailyTrimp: number[]): PMCResult {
  if (dailyTrimp.length === 0) {
    return {
      ctl: 0,
      atl: 0,
      tsb: 0,
      tier: 'balanced',
      calibrating: true,
      daysUsed: 0,
      series: [],
    };
  }

  const seedWindow = dailyTrimp.slice(0, Math.min(7, dailyTrimp.length));
  const seed =
    seedWindow.reduce((a, b) => a + b, 0) / Math.max(1, seedWindow.length);

  let ctl = seed;
  let atl = seed;
  const series: PMCDay[] = [];
  let prevCtl = ctl;
  let prevAtl = atl;

  for (const trimp of dailyTrimp) {
    // TSB convention: today's TSB = yesterday's fitness − yesterday's fatigue.
    const tsbToday = prevCtl - prevAtl;
    prevCtl = ctl;
    prevAtl = atl;
    ctl = ctl + (trimp - ctl) * CTL_DECAY;
    atl = atl + (trimp - atl) * ATL_DECAY;
    series.push({
      trimp,
      ctl: round1(ctl),
      atl: round1(atl),
      tsb: round1(tsbToday),
    });
  }

  const tsb = prevCtl - prevAtl;
  return {
    ctl: round1(ctl),
    atl: round1(atl),
    tsb: round1(tsb),
    tier: tierFromTSB(tsb),
    calibrating: dailyTrimp.length < 14,
    daysUsed: dailyTrimp.length,
    series,
  };
}

/**
 * Map a TSB value to its training-status tier.
 */
export function tierFromTSB(tsb: number): TrainingStatusTier {
  if (tsb > 25) return 'detrained';
  if (tsb > 5) return 'energetic';
  if (tsb > -10) return 'balanced';
  if (tsb > -30) return 'optimal';
  return 'overreaching';
}

/**
 * Personalised daily TRIMP target — the "you should aim for X today" number
 * that drives the Effort load ring. Once CTL is mature (≥ 14 days), this is
 * 1.6× CTL — matches Zepp's observed ratio of target=116 at CTL=72 (1.61×).
 *
 * During calibration, falls back to a profile-based estimate using VO₂max
 * and age. VO₂max is the strongest fitness predictor we have, and it scales
 * the target far better than RHR/HRV alone.
 */
export function dailyEffortTarget(input: {
  ctl: number;
  ctlCalibrating: boolean;
  vo2max: number | null;
  ageYears: number | null;
}): number {
  if (!input.ctlCalibrating && input.ctl > 0) {
    return Math.round(1.6 * input.ctl);
  }

  // Calibration fallback. Designed to land at ~50 for a fit 35yo (VO₂max 48)
  // and rise as CTL stabilises post-calibration.
  const base = 30;
  const vo2Bonus =
    input.vo2max != null ? Math.max(0, (input.vo2max - 35) * 1.5) : 0;
  const agePenalty =
    input.ageYears != null && input.ageYears > 35
      ? (input.ageYears - 35) * 0.4
      : 0;
  return Math.max(20, Math.round(base + vo2Bonus - agePenalty));
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}
