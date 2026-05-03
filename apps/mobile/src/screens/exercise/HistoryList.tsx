import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import type { WorkoutType } from '@openfit/types';
import { formatDuration } from '../../utils';
import { colors, spacing, radii, typography } from '../../theme';
import type { TodayWorkout } from '../home/effort/WorkoutDetail';

export type HistoryWorkout = TodayWorkout & {
  /** Run-only metric. */
  avgPaceSecondsPerKm?: number | null;
};

type Filter = 'all' | WorkoutType;

interface Props {
  workouts: HistoryWorkout[];
  onSelect: (log: HistoryWorkout) => void;
}

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'strength', label: 'Strength' },
  { value: 'run', label: 'Run' },
  { value: 'free', label: 'Free' },
];

const TYPE_COLOR: Record<WorkoutType, string> = {
  strength: colors.strength,
  run: colors.run,
  free: colors.free,
};

const TYPE_LABEL: Record<WorkoutType, string> = {
  strength: 'Strength',
  run: 'Run',
  free: 'Free',
};

function formatDate(d: string | Date): string {
  return new Date(d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatPace(secondsPerKm: number): string {
  const m = Math.floor(secondsPerKm / 60);
  const s = Math.round(secondsPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}/km`;
}

/**
 * Inline workout history. Filter chips at the top, compact rows below.
 * Tapping a row delegates to the parent (which opens the rich detail
 * modal) — this list itself stays scroll-friendly and read-only.
 */
export function HistoryList({ workouts, onSelect }: Props) {
  const [filter, setFilter] = useState<Filter>('all');

  const counts = useMemo(() => {
    return {
      all: workouts.length,
      strength: workouts.filter((w) => w.type === 'strength').length,
      run: workouts.filter((w) => w.type === 'run').length,
      free: workouts.filter((w) => w.type === 'free').length,
    };
  }, [workouts]);

  const filtered = useMemo(
    () => (filter === 'all' ? workouts : workouts.filter((w) => w.type === filter)),
    [filter, workouts],
  );

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {FILTERS.map((f) => {
          const selected = filter === f.value;
          const count = counts[f.value];
          return (
            <TouchableOpacity
              key={f.value}
              onPress={() => setFilter(f.value)}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {f.label}
              </Text>
              <View style={[styles.chipBadge, selected && styles.chipBadgeSelected]}>
                <Text
                  style={[
                    styles.chipBadgeText,
                    selected && styles.chipBadgeTextSelected,
                  ]}
                >
                  {count}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No workouts yet</Text>
          <Text style={styles.emptyBody}>
            Pick a workout type above to log your first session.
          </Text>
        </View>
      ) : (
        filtered.map((w) => {
          const setCount = w.exerciseLogs.reduce(
            (n, el) => n + (el.completedSets?.length ?? 0),
            0,
          );
          const meta =
            w.type === 'strength'
              ? `${setCount} sets`
              : w.type === 'run' && w.distanceMeters
                ? `${(w.distanceMeters / 1000).toFixed(2)} km${
                    w.avgPaceSecondsPerKm != null
                      ? ` · ${formatPace(w.avgPaceSecondsPerKm)}`
                      : ''
                  }`
                : w.durationSeconds
                  ? formatDuration(w.durationSeconds)
                  : '—';
          return (
            <TouchableOpacity
              key={w.id}
              activeOpacity={0.85}
              onPress={() => onSelect(w)}
              style={[styles.row, { borderLeftColor: TYPE_COLOR[w.type] }]}
            >
              <View style={styles.rowMain}>
                <View style={styles.rowHeader}>
                  <View style={[styles.typeChip, { backgroundColor: TYPE_COLOR[w.type] }]}>
                    <Text style={styles.typeChipText}>{TYPE_LABEL[w.type]}</Text>
                  </View>
                  <Text style={styles.rowDate}>{formatDate(w.startedAt)}</Text>
                </View>
                <Text style={styles.rowName} numberOfLines={1}>
                  {w.session?.name ?? TYPE_LABEL[w.type]}
                </Text>
                <Text style={styles.rowMeta}>{meta}</Text>
              </View>
              {w.caloriesBurned != null ? (
                <View style={styles.rowKcal}>
                  <Text style={styles.rowKcalValue}>{Math.round(w.caloriesBurned)}</Text>
                  <Text style={styles.rowKcalLabel}>kcal</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: { paddingHorizontal: 0, gap: spacing.sm, paddingBottom: spacing.md },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.text },
  chipText: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
  },
  chipTextSelected: { color: colors.bg },
  chipBadge: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
  },
  chipBadgeSelected: { backgroundColor: colors.bg },
  chipBadgeText: {
    fontSize: typography.size.xs - 1,
    color: colors.textSecondary,
    fontWeight: typography.weight.bold,
  },
  chipBadgeTextSelected: { color: colors.text },
  empty: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  emptyBody: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderLeftWidth: 3,
  },
  rowMain: { flex: 1 },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 4 },
  typeChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  typeChipText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: typography.weight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  rowDate: { fontSize: typography.size.xs, color: colors.textMuted },
  rowName: {
    fontSize: typography.size.sm + 1,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  rowMeta: {
    fontSize: typography.size.xs + 1,
    color: colors.textSecondary,
    marginTop: 2,
  },
  rowKcal: { alignItems: 'flex-end' },
  rowKcalValue: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  rowKcalLabel: {
    fontSize: typography.size.xs - 1,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});
