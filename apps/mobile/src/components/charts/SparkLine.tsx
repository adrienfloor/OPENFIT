import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polyline, Circle, Line, Text as SvgText, G } from 'react-native-svg';
import { colors, spacing, typography } from '../../theme';

interface Props {
  values: number[];
  color?: string;
  labels?: string[];
  height?: number;
  /** Show numeric value labels above each point. */
  showValues?: boolean;
  /** Render a y-axis on the left with min / mid / max gridlines + labels. */
  yAxis?: boolean;
  /** Optional unit suffix appended to y-axis labels (e.g. "ms", "bpm"). */
  yUnit?: string;
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
  yAxis = false,
  yUnit,
}: Props) {
  if (values.length === 0) return null;

  const numericValues = values.filter((v) => Number.isFinite(v) && v > 0);
  const min = numericValues.length ? Math.min(...numericValues) : 0;
  const max = numericValues.length ? Math.max(...numericValues) : 1;
  // Pad the y-range a touch so the polyline doesn't kiss the top/bottom.
  const pad = (max - min) * 0.15 || 1;
  const yMin = Math.max(0, min - pad);
  const yMax = max + pad;
  const span = yMax - yMin || 1;

  const width = 280;
  const padTop = showValues ? 16 : 8;
  const padBottom = labels ? 8 : 4;
  const padLeft = yAxis ? 32 : 0;
  const padRight = 4;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;

  const stepX = innerW / Math.max(1, values.length - 1);
  const points = values.map((v, i) => {
    const x = padLeft + i * stepX;
    const y = padTop + (1 - (v - yMin) / span) * innerH;
    return { x, y, v };
  });

  const formatTick = (v: number) =>
    `${Math.round(v)}${yUnit ? ` ${yUnit}` : ''}`;

  return (
    <View>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        {yAxis
          ? [yMax, (yMin + yMax) / 2, yMin].map((tickValue, i) => {
              const y = padTop + (i * innerH) / 2;
              return (
                <G key={i}>
                  <Line
                    x1={padLeft}
                    y1={y}
                    x2={padLeft + innerW}
                    y2={y}
                    stroke={colors.borderSubtle}
                    strokeWidth={1}
                  />
                  <SvgText
                    x={padLeft - 6}
                    y={y + 3}
                    fontSize={10}
                    fill={colors.textMuted}
                    textAnchor="end"
                  >
                    {formatTick(tickValue)}
                  </SvgText>
                </G>
              );
            })
          : null}
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
        <View
          style={[
            styles.labelsRow,
            // Match the chart's left padding so weekday letters align under
            // their corresponding dots when a y-axis is rendered.
            yAxis ? { paddingLeft: `${(padLeft / width) * 100}%` } : null,
          ]}
        >
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
