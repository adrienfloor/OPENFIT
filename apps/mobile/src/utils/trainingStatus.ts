/**
 * Derive the Overview "Training status" metric from the PMC fields on
 * TodayDailyStats. TSB is the headline value; the tier label maps to
 * Zepp's Detrained / Energetic / Balanced / Optimal / Overreaching tiers.
 */

import type { TodayDailyStats } from '../services/healthConnect';
import type { TrainingStatusTier } from '@openfit/fitness-core';

type Tone = 'good' | 'warn' | 'bad' | 'neutral';

export interface TrainingStatusView {
  /** TSB value (rounded). Null when calibrating with no data. */
  tsb: number | null;
  /** CTL ("fitness"). Null when no data. */
  ctl: number | null;
  /** ATL ("fatigue"). Null when no data. */
  atl: number | null;
  label: string;
  tone: Tone;
  calibrating: boolean;
  /** Days with training data so far — for "X/14 days" copy. */
  daysWithData: number;
  /** Days needed before calibration completes (currently 14). */
  daysNeeded: number;
}

const TIER_TO_LABEL: Record<TrainingStatusTier, string> = {
  detrained: 'DETRAINED',
  energetic: 'ENERGETIC',
  balanced: 'BALANCED',
  optimal: 'OPTIMAL',
  overreaching: 'OVERREACHING',
};

const TIER_TO_TONE: Record<TrainingStatusTier, Tone> = {
  detrained: 'neutral',
  energetic: 'good',
  balanced: 'good',
  optimal: 'good',
  overreaching: 'warn',
};

const DAYS_NEEDED = 14;

export function computeTrainingStatus(
  today: TodayDailyStats | null,
): TrainingStatusView {
  if (!today || today.tsb == null || today.trainingStatusTier == null) {
    return {
      tsb: null,
      ctl: today?.ctl ?? null,
      atl: today?.atl ?? null,
      label: 'CALIBRATING',
      tone: 'neutral',
      calibrating: true,
      daysWithData: today?.trainingStatusDaysWithData ?? 0,
      daysNeeded: DAYS_NEEDED,
    };
  }
  return {
    tsb: Math.round(today.tsb),
    ctl: today.ctl,
    atl: today.atl,
    label: today.trainingStatusCalibrating
      ? 'CALIBRATING'
      : TIER_TO_LABEL[today.trainingStatusTier],
    tone: today.trainingStatusCalibrating
      ? 'neutral'
      : TIER_TO_TONE[today.trainingStatusTier],
    calibrating: today.trainingStatusCalibrating,
    daysWithData: today.trainingStatusDaysWithData,
    daysNeeded: DAYS_NEEDED,
  };
}
