/**
 * BioCharge intraday + wake-time helpers. Builds on `readinessScore` for
 * the headline number, then adds the curve / contribution / cumulative
 * effort plumbing the BioCharge sub-tab needs to render its dashboard
 * without mock data.
 *
 * Two key derivations:
 *
 *   1. **Wake BioCharge** — the readiness score *before* today's training
 *      drained anything. Calculated by calling `readinessScore` with
 *      `todayEarnedMinutes: 0`. Renders as the morning peak in the chart
 *      and as the headline number on the Wake card.
 *
 *   2. **Intraday curve** — a 0-100 BioCharge value sampled every 30
 *      minutes from local midnight to midnight. Uses cumulative effort
 *      minutes (HR samples → intensity-weighted minutes accumulated as
 *      the day progresses) to drain the wake score linearly. Pre-wake
 *      hours show the overnight recovery ramp; post-now hours hold flat
 *      (no projection — we don't fake the future).
 */

import type { EffortHRSample } from './scores';

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

/** Same intensity tiers as `effortScore` — kept local so this module is
 *  standalone. If we ever need a third caller, hoist it. */
function weightForIntensity(hrrFraction: number): number {
  if (hrrFraction >= 0.9) return 4;
  if (hrrFraction >= 0.8) return 3;
  if (hrrFraction >= 0.6) return 2;
  if (hrrFraction >= 0.4) return 1;
  return 0;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ──────────────────────────────────────────────────────────────────────────
// Sleep contribution
// ──────────────────────────────────────────────────────────────────────────

/**
 * Approximate the BioCharge contribution from last night's sleep — used
 * for the "+35 Sleep" pill on the Wake card. Sleep accounts for 30 % of
 * `readinessScore` per the published weights, so the contribution is the
 * sleep score multiplied by that weight (rounded to integer points).
 *
 * Returns 0 when the sleep score is missing.
 */
export function sleepContribution(sleepScore: number | null): number {
  if (sleepScore == null) return 0;
  return Math.round(sleepScore * 0.3);
}

// ──────────────────────────────────────────────────────────────────────────
// Cumulative effort minutes
// ──────────────────────────────────────────────────────────────────────────

export interface CumulativeEffortPoint {
  /** Local minutes since midnight. */
  minute: number;
  /** Effort minutes accumulated by this minute (intensity-weighted). */
  cumMinutes: number;
}

export interface CumulativeEffortInput {
  /** 24h HR samples — unevenly spaced is fine. Gaps over `maxGapMinutes`
   *  are dropped (treats device-off windows as no data). */
  samples: EffortHRSample[];
  restingHR: number;
  maxHR: number;
  /** Output sample interval in minutes. Default 30. */
  stepMinutes?: number;
  /** Drop gaps larger than this. Default 10. */
  maxGapMinutes?: number;
}

/**
 * Walk HR samples in chronological order and emit cumulative
 * intensity-weighted minutes every `stepMinutes` of wall time. The first
 * point is at minute 0 (midnight, value 0); the last point is at minute
 * 1440 (next midnight) or earlier if samples don't cover the full day.
 *
 * Used by `intradayBioCharge` to subtract drain at each chart point.
 */
export function cumulativeEffortMinutes({
  samples,
  restingHR,
  maxHR,
  stepMinutes = 30,
  maxGapMinutes = 10,
}: CumulativeEffortInput): CumulativeEffortPoint[] {
  const reserve = maxHR - restingHR;
  if (reserve <= 0 || samples.length < 2) {
    return [{ minute: 0, cumMinutes: 0 }];
  }

  const sorted = [...samples].sort(
    (a, b) => a.time.getTime() - b.time.getTime(),
  );
  // Anchor "minute 0" at the local midnight of the first sample so that
  // multi-day inputs don't fold together. Caller is expected to pass a
  // single day of samples.
  const dayStart = new Date(sorted[0]!.time);
  dayStart.setHours(0, 0, 0, 0);
  const dayStartMs = dayStart.getTime();
  const minuteOf = (t: Date) => (t.getTime() - dayStartMs) / 60000;

  // Step 1: walk samples to build a sparse list of breakpoints (minute, cum).
  const breaks: CumulativeEffortPoint[] = [{ minute: 0, cumMinutes: 0 }];
  let cum = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const s1 = sorted[i] as EffortHRSample;
    const s2 = sorted[i + 1] as EffortHRSample;
    const t1 = minuteOf(s1.time);
    const t2 = minuteOf(s2.time);
    const gap = t2 - t1;
    if (gap <= 0 || gap > maxGapMinutes) {
      // Device-off window — anchor the running cum at both ends so the
      // sampler knows nothing accumulated across this stretch.
      breaks.push({ minute: t1, cumMinutes: cum });
      breaks.push({ minute: t2, cumMinutes: cum });
      continue;
    }
    const avgBpm = (s1.bpm + s2.bpm) / 2;
    const hrr = clamp((avgBpm - restingHR) / reserve, 0, 1);
    cum += weightForIntensity(hrr) * gap;
    breaks.push({ minute: t2, cumMinutes: cum });
  }

  // Step 2: emit one point per `stepMinutes` interpolating between breaks.
  const out: CumulativeEffortPoint[] = [];
  let bIdx = 0;
  for (let m = 0; m <= 24 * 60; m += stepMinutes) {
    // Advance bIdx to the segment containing m.
    while (
      bIdx < breaks.length - 1 &&
      breaks[bIdx + 1]!.minute <= m
    ) {
      bIdx++;
    }
    const a = breaks[bIdx]!;
    const b = breaks[Math.min(bIdx + 1, breaks.length - 1)]!;
    if (m <= a.minute) {
      out.push({ minute: m, cumMinutes: a.cumMinutes });
      continue;
    }
    if (m >= b.minute || b.minute === a.minute) {
      out.push({ minute: m, cumMinutes: b.cumMinutes });
      continue;
    }
    const f = (m - a.minute) / (b.minute - a.minute);
    out.push({
      minute: m,
      cumMinutes: a.cumMinutes + (b.cumMinutes - a.cumMinutes) * f,
    });
  }

  return out;
}

// ──────────────────────────────────────────────────────────────────────────
// Intraday curve
// ──────────────────────────────────────────────────────────────────────────

export interface IntradayBioChargePoint {
  /** Local minutes since midnight (0..1440). */
  minute: number;
  /** BioCharge value at this minute, clamped 0–100. */
  value: number;
}

export interface IntradayBioChargeInput {
  /** Today's BioCharge at wake (peak before training). */
  wakeScore: number;
  /** Local minute when the user woke (sleep session end). 0..1440. */
  wakeMinute: number;
  /** Cumulative effort minutes through the day (from `cumulativeEffortMinutes`). */
  effortByMinute: CumulativeEffortPoint[];
  /** Local minute "now" (i.e. clock time at refresh). */
  nowMinute: number;
  /** BioCharge points lost per cumulative effort minute. Default 0.15
   *  matches the readiness intraday-drain coefficient. */
  drainPerEffortMinute?: number;
  /** Sample interval. Default 30 minutes (49 points across 24 h). */
  stepMinutes?: number;
}

/**
 * Build a 24-hour BioCharge curve.
 *
 *   - 00:00 → wakeMinute  : linear ramp from (wakeScore − 30) to wakeScore
 *                            (overnight recovery — purely visual)
 *   - wakeMinute → nowMinute : wakeScore − cumEffort × drainPerEffortMinute
 *   - nowMinute → 24:00   : flat hold at "now" value (no projection)
 *
 * All values clamped 0–100. Returns one point per `stepMinutes`.
 */
export function intradayBioCharge({
  wakeScore,
  wakeMinute,
  effortByMinute,
  nowMinute,
  drainPerEffortMinute = 0.15,
  stepMinutes = 30,
}: IntradayBioChargeInput): IntradayBioChargePoint[] {
  const points: IntradayBioChargePoint[] = [];
  const preDawn = clamp(wakeScore - 30, 30, 100);

  // Build a quick lookup from minute → cum, with linear interpolation between.
  const lookupCum = (m: number): number => {
    if (effortByMinute.length === 0) return 0;
    const first = effortByMinute[0]!;
    if (m <= first.minute) return first.cumMinutes;
    for (let i = 0; i < effortByMinute.length - 1; i++) {
      const a = effortByMinute[i]!;
      const b = effortByMinute[i + 1]!;
      if (m >= a.minute && m <= b.minute) {
        if (b.minute === a.minute) return a.cumMinutes;
        const f = (m - a.minute) / (b.minute - a.minute);
        return a.cumMinutes + (b.cumMinutes - a.cumMinutes) * f;
      }
    }
    return effortByMinute[effortByMinute.length - 1]!.cumMinutes;
  };

  let lastValue = wakeScore;

  for (let m = 0; m <= 24 * 60; m += stepMinutes) {
    let v: number;
    if (m <= wakeMinute) {
      // Sleep ramp.
      const fraction = wakeMinute > 0 ? m / wakeMinute : 1;
      v = preDawn + (wakeScore - preDawn) * fraction;
    } else if (m <= nowMinute) {
      // Drain proportional to cumulative effort minutes since wake.
      const cumNow = lookupCum(m);
      const cumWake = lookupCum(wakeMinute);
      const drain = (cumNow - cumWake) * drainPerEffortMinute;
      v = wakeScore - drain;
      lastValue = v;
    } else {
      // Future — hold at the "now" value, don't project.
      v = lastValue;
    }
    points.push({ minute: m, value: clamp(Math.round(v), 0, 100) });
  }

  return points;
}
