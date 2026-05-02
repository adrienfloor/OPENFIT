import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import type { RegularityRange } from '../../mocks';
import { colors, spacing, typography } from '../../theme';

interface Props {
  data: RegularityRange[];
  /** Earliest minute on the y-axis (since 21:00 prior). 0 = 21:00. */
  yMin?: number;
  /** Latest minute on the y-axis. 720 = 09:00. */
  yMax?: number;
  height?: number;
  labels?: string[];
}

/**
 * Sleep-regularity chart. Each bar spans bedtime → wake on the same y-axis
 * (minutes since 21:00 the previous evening), so the pattern of bars
 * makes regularity visually obvious — equal-height, vertically aligned
 * bars = consistent schedule.
 */
export function RegularityBars({
  data,
  yMin = 0,
  yMax = 720,
  height = 180,
  labels,
}: Props) {
  const width = 320;
  const padLeft = 36;
  const padRight = 8;
  const padTop = 24;
  const padBottom = 24;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;
  const span = yMax - yMin;
  const yFor = (m: number) =>
    padTop + ((m - yMin) / span) * innerH;

  const colW = innerW / data.length;
  const barW = colW * 0.45;

  const formatY = (m: number) => {
    const total = ((m + 21 * 60) % (24 * 60));
    const h = Math.floor(total / 60);
    const min = Math.floor(total % 60);
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  };

  return (
    <View>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* y-axis ticks at top, middle, bottom */}
        {[yMin, (yMin + yMax) / 2, yMax].map((m, i) => {
          const y = yFor(m);
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

        {/* Bedtime → wake bars */}
        {data.map((r, i) => {
          const cx = padLeft + colW * i + colW / 2;
          const x = cx - barW / 2;
          const yTop = yFor(r.bedtimeMinutes);
          const yBottom = yFor(r.wakeMinutes);
          const h = Math.max(2, yBottom - yTop);
          return (
            <Rect
              key={i}
              x={x}
              y={yTop}
              width={barW}
              height={h}
              fill={colors.sleep}
              rx={3}
            />
          );
        })}
      </Svg>

      {/* y-axis text labels overlaid manually */}
      <View pointerEvents="none" style={[styles.yLabel, { top: padTop - 6 }]}>
        <Text style={styles.tick}>{formatY(yMin)}</Text>
      </View>
      <View pointerEvents="none" style={[styles.yLabel, { top: padTop + innerH / 2 - 6 }]}>
        <Text style={styles.tick}>{formatY((yMin + yMax) / 2)}</Text>
      </View>
      <View pointerEvents="none" style={[styles.yLabel, { top: padTop + innerH - 6 }]}>
        <Text style={styles.tick}>{formatY(yMax)}</Text>
      </View>

      {labels ? (
        <View style={[styles.xLabels, { paddingLeft: padLeft }]}>
          {labels.map((l, i) => (
            <Text key={i} style={styles.xLabel}>
              {l}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  yLabel: {
    position: 'absolute',
    left: 0,
    width: 32,
    alignItems: 'flex-end',
  },
  tick: { fontSize: typography.size.xs, color: colors.textMuted },
  xLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -spacing.lg,
  },
  xLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },
});
