/**
 * Derive the Overview "Effort load" metric from the last 7 days of earned
 * effort minutes plus the user's personalised daily target.
 *
 * - `current` = sum of the 7-day series. The daily target × 7 is the implicit
 *   weekly anchor — staying near it = balanced, well above = overreaching,
 *   well below = recovered.
 * - `statusLabel` / `statusTone` mirror Garmin / Zepp tiers based on the ratio
 *   to the weekly target.
 * - `trend` is per-day earned minutes (oldest → newest, today last).
 * - `trendLabels` are weekday letters ("S", "M", ...) anchored on the date.
 */

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

type Tone = 'good' | 'warn' | 'bad' | 'neutral';

export interface EffortLoadView {
  current: number | null;
  statusLabel: string;
  statusTone: Tone;
  trend: number[];
  trendLabels: string[];
  weeklyTarget: number | null;
}

export function computeEffortLoad(
  series: { date: Date; earnedMinutes: number | null }[] | null,
  dailyTargetMinutes: number | null,
): EffortLoadView {
  if (!series || series.length === 0) {
    return {
      current: null,
      statusLabel: 'NO DATA',
      statusTone: 'neutral',
      trend: [],
      trendLabels: [],
      weeklyTarget: null,
    };
  }

  const trend = series.map((d) => Math.round(d.earnedMinutes ?? 0));
  const trendLabels = series.map((d) => WEEKDAY_LETTERS[d.date.getDay()]!);
  const current = trend.reduce((a, b) => a + b, 0);

  const weeklyTarget =
    dailyTargetMinutes != null ? Math.round(dailyTargetMinutes * 7) : null;

  let statusLabel = 'BALANCED';
  let statusTone: Tone = 'good';
  if (weeklyTarget && weeklyTarget > 0) {
    const ratio = current / weeklyTarget;
    if (ratio < 0.5) {
      statusLabel = 'RECOVERED';
      statusTone = 'neutral';
    } else if (ratio < 1.0) {
      statusLabel = 'BALANCED';
      statusTone = 'good';
    } else if (ratio < 1.3) {
      statusLabel = 'PRODUCTIVE';
      statusTone = 'good';
    } else {
      statusLabel = 'OVERREACHING';
      statusTone = 'warn';
    }
  }

  return { current, statusLabel, statusTone, trend, trendLabels, weeklyTarget };
}
