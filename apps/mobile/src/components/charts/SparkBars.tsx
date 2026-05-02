import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../../theme';

interface Props {
  values: number[];
  /** Bar fill colour. */
  color?: string;
  /** Optional X-axis labels (e.g. weekday initials), one per value. */
  labels?: string[];
  /** Show the value at the top of each bar. */
  showValues?: boolean;
  height?: number;
}

/**
 * Tiny bar-chart for 7-day trends. Pure-RN (no SVG) so it stays cheap;
 * each bar is a flex-grown View whose height is proportional to the
 * value within `[0, max]`.
 */
export function SparkBars({
  values,
  color = colors.accent,
  labels,
  showValues = false,
  height = 96,
}: Props) {
  const max = Math.max(1, ...values.map((v) => Math.abs(v)));
  return (
    <View>
      <View style={[styles.row, { height }]}>
        {values.map((v, i) => {
          const pct = (Math.abs(v) / max) * 100;
          return (
            <View key={i} style={styles.col}>
              {showValues ? <Text style={styles.value}>{Math.round(v)}</Text> : null}
              <View style={styles.barWrap}>
                <View
                  style={[
                    styles.bar,
                    { height: `${pct}%`, backgroundColor: color },
                  ]}
                />
              </View>
            </View>
          );
        })}
      </View>
      {labels ? (
        <View style={styles.labelsRow}>
          {labels.map((l, i) => (
            <Text key={i} style={styles.label}>
              {l}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  col: { flex: 1, alignItems: 'center' },
  value: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  barWrap: { width: '70%', flex: 1, justifyContent: 'flex-end' },
  bar: { width: '100%', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  labelsRow: { flexDirection: 'row', marginTop: spacing.sm },
  label: {
    flex: 1,
    textAlign: 'center',
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },
});
