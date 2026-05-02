import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polyline, Rect, G, Circle } from 'react-native-svg';
import { colors, spacing, typography } from '../../theme';

export interface IntradayDatum {
  /** Minutes since local midnight (0-1440). */
  minute: number;
  value: number;
}

export interface IntradayWindow {
  /** Minutes since local midnight. */
  startMinute: number;
  endMinute: number;
  /** Optional text label rendered above the band. */
  label?: string;
  /** Visual emphasis. */
  tone?: 'sleep' | 'workout';
}

interface Props {
  data: IntradayDatum[];
  /** Time-shaded windows (sleep, workouts) drawn as background bands. */
  windows?: IntradayWindow[];
  color?: string;
  height?: number;
  /** Min / max for the y-axis. Auto if omitted. */
  yMin?: number;
  yMax?: number;
}

const TONE_BG: Record<NonNullable<IntradayWindow['tone']>, string> = {
  sleep: 'rgba(96, 165, 250, 0.18)',
  workout: 'rgba(34, 197, 94, 0.20)',
};

/**
 * 24-hour timeseries chart used by the BioCharge sub-tab. Draws:
 *   - shaded bands for sleep / workout windows
 *   - a polyline for the value series
 *   - a single dot at the most recent point so the user can read it
 *
 * X-axis = minutes since midnight (0–1440). Y-axis = the value range.
 * Pure SVG via react-native-svg — no chart lib dependency.
 */
export function IntradayLineChart({
  data,
  windows = [],
  color = colors.bioCharge,
  height = 180,
  yMin,
  yMax,
}: Props) {
  if (data.length === 0) return null;

  const width = 320;
  const padTop = 12;
  const padBottom = 28;
  const padLeft = 8;
  const padRight = 8;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;

  const min = yMin ?? Math.min(...data.map((d) => d.value));
  const max = yMax ?? Math.max(...data.map((d) => d.value));
  const span = max - min || 1;

  const xFor = (minute: number) => padLeft + (minute / 1440) * innerW;
  const yFor = (value: number) =>
    padTop + (1 - (value - min) / span) * innerH;

  const polyPoints = data.map((d) => `${xFor(d.minute)},${yFor(d.value)}`).join(' ');
  const last = data[data.length - 1]!;

  return (
    <View>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* Grid lines at 25/50/75/100 along the y-axis */}
        {[0.25, 0.5, 0.75].map((p, i) => {
          const y = padTop + p * innerH;
          return (
            <Rect
              key={i}
              x={padLeft}
              y={y - 0.5}
              width={innerW}
              height={1}
              fill={colors.borderSubtle}
            />
          );
        })}

        {/* Time-shaded bands */}
        {windows.map((w, i) => {
          const x1 = xFor(w.startMinute);
          const x2 = xFor(w.endMinute);
          return (
            <Rect
              key={i}
              x={x1}
              y={padTop}
              width={Math.max(2, x2 - x1)}
              height={innerH}
              fill={TONE_BG[w.tone ?? 'sleep']}
              rx={4}
            />
          );
        })}

        {/* Value polyline */}
        <Polyline
          points={polyPoints}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Latest-point dot */}
        <G>
          <Circle cx={xFor(last.minute)} cy={yFor(last.value)} r={5} fill={color} />
          <Circle cx={xFor(last.minute)} cy={yFor(last.value)} r={2} fill={colors.bg} />
        </G>
      </Svg>

      {/* X-axis tick labels — 0/8/16/24h */}
      <View style={styles.axisRow}>
        <Text style={styles.tick}>0h</Text>
        <Text style={styles.tick}>8h</Text>
        <Text style={styles.tick}>16h</Text>
        <Text style={styles.tick}>24h</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  axisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
    marginTop: -spacing.lg,
  },
  tick: { fontSize: typography.size.xs, color: colors.textMuted },
});
