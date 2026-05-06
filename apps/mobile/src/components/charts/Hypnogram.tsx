import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import type { SleepStage, SleepStageSegment } from '../../types/sleep';
import { colors, spacing, typography } from '../../theme';

interface Props {
  segments: SleepStageSegment[];
  /** Total session length in minutes — sets the x-axis. */
  totalMinutes: number;
  startTime: Date;
  endTime: Date;
  height?: number;
  /** Compact = single colored bar per stage, no y-axis tick labels. */
  compact?: boolean;
}

const STAGE_COLOR: Record<SleepStage, string> = {
  awake: '#ef4444',
  rem: '#22c55e',
  light: '#60a5fa',
  deep: '#7c3aed',
};

/**
 * Sleep-stage timeline. Renders each segment as a coloured rectangle on
 * a 4-row grid (Awake / REM / Light / Deep, top to bottom). Mirrors the
 * Zepp hypnogram look: stages stack vertically by physiological depth
 * with awake at the top and deep at the bottom.
 */
export function Hypnogram({
  segments,
  totalMinutes,
  startTime,
  endTime,
  height = 120,
  compact = false,
}: Props) {
  const width = 320;
  const padLeft = compact ? 4 : 32;
  const padRight = 4;
  const padTop = 8;
  const padBottom = 4;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;

  const ROWS: SleepStage[] = ['awake', 'rem', 'light', 'deep'];
  const rowHeight = innerH / ROWS.length;
  const xFor = (m: number) => padLeft + (m / Math.max(1, totalMinutes)) * innerW;

  return (
    <View>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        {segments.map((s, i) => {
          const rowIndex = ROWS.indexOf(s.stage);
          const x = xFor(s.startMinute);
          const w = Math.max(2, xFor(s.endMinute) - x);
          const y = padTop + rowIndex * rowHeight + 4;
          const h = rowHeight - 8;
          return (
            <Rect
              key={i}
              x={x}
              y={y}
              width={w}
              height={Math.max(2, h)}
              fill={STAGE_COLOR[s.stage]}
              rx={2}
            />
          );
        })}
      </Svg>
      {!compact ? (
        <View style={[styles.axisRow, { paddingLeft: padLeft }]}>
          <Text style={styles.tick}>{formatTime(startTime)}</Text>
          <Text style={styles.tick}>{formatTime(endTime)}</Text>
        </View>
      ) : null}
      <View style={styles.legend}>
        <Legend stage="deep" />
        <Legend stage="rem" />
        <Legend stage="light" />
        <Legend stage="awake" />
      </View>
    </View>
  );
}

function Legend({ stage }: { stage: SleepStage }) {
  return (
    <View style={styles.legendItem}>
      <View
        style={[styles.legendDot, { backgroundColor: STAGE_COLOR[stage] }]}
      />
      <Text style={styles.legendLabel}>
        {stage === 'rem' ? 'REM' : stage[0]?.toUpperCase() + stage.slice(1)}
      </Text>
    </View>
  );
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

const styles = StyleSheet.create({
  axisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingRight: spacing.xs,
    marginTop: -spacing.sm,
  },
  tick: { fontSize: typography.size.xs, color: colors.textMuted },
  legend: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
    flexWrap: 'wrap',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { fontSize: typography.size.xs, color: colors.textSecondary },
});
