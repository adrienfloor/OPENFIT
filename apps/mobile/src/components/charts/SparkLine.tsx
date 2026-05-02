import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polyline, Circle } from 'react-native-svg';
import { colors, spacing, typography } from '../../theme';

interface Props {
  values: number[];
  color?: string;
  labels?: string[];
  height?: number;
  /** Show value labels above each point. */
  showValues?: boolean;
}

/**
 * Tiny line-chart for trends where the magnitude doesn't matter as much
 * as the slope (HRV, RHR, weight). Renders via react-native-svg with a
 * single polyline + dots.
 */
export function SparkLine({
  values,
  color = colors.accent,
  labels,
  height = 96,
  showValues = false,
}: Props) {
  if (values.length === 0) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const width = 280; // logical viewport — Svg auto-scales horizontally

  const stepX = width / Math.max(1, values.length - 1);
  const padTop = showValues ? 16 : 8;
  const padBottom = 8;
  const innerH = height - padTop - padBottom;

  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = padTop + (1 - (v - min) / span) * innerH;
    return { x, y, v };
  });

  return (
    <View>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <Polyline
          points={points.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r={3} fill={color} />
        ))}
      </Svg>
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
  labelsRow: { flexDirection: 'row', marginTop: spacing.sm },
  label: {
    flex: 1,
    textAlign: 'center',
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },
});
