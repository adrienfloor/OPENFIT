import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../../theme';

export interface StackedBarSegment {
  label: string;
  /** Numeric value (units chosen by caller). */
  value: number;
  color: string;
}

interface Props {
  /** One stack per bar. Each stack's segments render bottom-to-top. */
  data: { label: string; segments: StackedBarSegment[] }[];
  height?: number;
  /** Optional yMax used for scaling — auto if omitted. */
  yMax?: number;
  /** Number of major tick lines on the y-axis (e.g. 5h, 10h). */
  yTicks?: number;
  /** Format a y-axis tick value into a string. */
  formatTick?: (v: number) => string;
}

/**
 * Stacked-bar chart for breakdowns over time (sleep stages per night,
 * etc.). Pure-RN — flex columns with per-segment heights.
 */
export function StackedBars({
  data,
  height = 160,
  yMax,
  yTicks = 2,
  formatTick = (v) => `${Math.round(v)}`,
}: Props) {
  const totals = data.map((d) =>
    d.segments.reduce((sum, s) => sum + s.value, 0),
  );
  const max = yMax ?? Math.max(1, ...totals);

  return (
    <View>
      <View style={[styles.row, { height }]}>
        <View style={styles.yAxis}>
          {Array.from({ length: yTicks + 1 }).map((_, i) => {
            const v = (max * (yTicks - i)) / yTicks;
            return (
              <Text key={i} style={styles.tick}>
                {formatTick(v)}
              </Text>
            );
          })}
        </View>
        {data.map((d, i) => (
          <View key={i} style={styles.col}>
            <View style={styles.barWrap}>
              {[...d.segments].reverse().map((s, j) => {
                const pct = (s.value / max) * 100;
                return (
                  <View
                    key={j}
                    style={{
                      height: `${pct}%`,
                      backgroundColor: s.color,
                      width: '70%',
                      marginHorizontal: 'auto',
                      borderRadius: j === 0 ? 4 : 0,
                    }}
                  />
                );
              })}
            </View>
          </View>
        ))}
      </View>
      <View style={styles.labelsRow}>
        <View style={styles.yAxisSpacer} />
        {data.map((d, i) => (
          <Text key={i} style={styles.label}>
            {d.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  yAxis: {
    width: 32,
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  yAxisSpacer: { width: 32 },
  tick: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    textAlign: 'right',
  },
  col: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  barWrap: {
    width: '100%',
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  labelsRow: { flexDirection: 'row', marginTop: spacing.sm },
  label: {
    flex: 1,
    textAlign: 'center',
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },
});
