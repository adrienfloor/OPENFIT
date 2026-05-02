import { View, Text, StyleSheet } from 'react-native';
import type { WorkoutType } from '@openfit/types';
import { DetailModal } from '../../../components/DetailModal';
import { formatDuration } from '../../../utils';
import { colors, spacing, radii, typography } from '../../../theme';

/**
 * Local view-model that matches what /workouts/logs actually returns —
 * the canonical @openfit/types WorkoutLog doesn't model the joined
 * `session` name or the `completedSets` shape.
 */
export interface TodayWorkout {
  id: string;
  type: WorkoutType;
  startedAt: string | Date;
  completedAt: string | Date | null;
  durationSeconds: number | null;
  caloriesBurned: number | null;
  distanceMeters: number | null;
  session: { name: string } | null;
  exerciseLogs: { completedSets: unknown[] }[];
}

interface Props {
  visible: boolean;
  onClose: () => void;
  log: TodayWorkout | null;
  /** Effort minutes the workout earned (passed in by the parent screen). */
  earnedMinutes?: number;
}

function formatTime(d: Date): string {
  return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function typeLabel(t: WorkoutType): string {
  if (t === 'strength') return 'Strength';
  if (t === 'jiu_jitsu') return 'Jiu-Jitsu';
  return 'Run';
}

function typeColor(t: WorkoutType): string {
  if (t === 'strength') return colors.strength;
  if (t === 'jiu_jitsu') return colors.jiuJitsu;
  return colors.run;
}

/**
 * Drill-in modal for a today-tab workout row. Lightweight summary —
 * activity type, duration, calories, distance (run), set count
 * (strength), HR averages — without re-implementing the full workout
 * detail screen lives in History.
 */
export function WorkoutDetail({ visible, onClose, log, earnedMinutes }: Props) {
  if (!log) {
    return (
      <DetailModal visible={visible} onClose={onClose} eyebrow="Workout" title="Workout">
        <Text style={styles.note}>Loading workout…</Text>
      </DetailModal>
    );
  }

  const start = log.startedAt instanceof Date ? log.startedAt : new Date(log.startedAt);
  const end = log.completedAt
    ? log.completedAt instanceof Date
      ? log.completedAt
      : new Date(log.completedAt)
    : null;
  const duration = log.durationSeconds ?? 0;
  const distanceKm =
    log.distanceMeters != null ? log.distanceMeters / 1000 : null;
  const setCount = log.exerciseLogs?.reduce(
    (sum, el) => sum + (el.completedSets?.length ?? 0),
    0,
  );

  return (
    <DetailModal
      visible={visible}
      onClose={onClose}
      eyebrow={typeLabel(log.type).toUpperCase()}
      title={log.session?.name ?? typeLabel(log.type)}
    >
      <View style={[styles.heroCard, { borderLeftColor: typeColor(log.type) }]}>
        <Text style={styles.heroValue}>{formatDuration(duration)}</Text>
        <Text style={styles.heroSubtitle}>
          {formatTime(start)}
          {end ? ` – ${formatTime(end)}` : ''}
        </Text>
      </View>

      <View style={styles.statsCard}>
        {earnedMinutes != null ? (
          <>
            <StatRow label="Effort earned" value={`+${earnedMinutes}`} unit="min" />
            <Divider />
          </>
        ) : null}
        {log.caloriesBurned != null ? (
          <>
            <StatRow
              label="Calories"
              value={`${Math.round(log.caloriesBurned)}`}
              unit="kcal"
            />
            <Divider />
          </>
        ) : null}
        {distanceKm != null ? (
          <>
            <StatRow label="Distance" value={distanceKm.toFixed(2)} unit="km" />
            <Divider />
          </>
        ) : null}
        {log.type === 'strength' && setCount ? (
          <StatRow label="Sets" value={`${setCount}`} unit="" />
        ) : null}
        {log.type !== 'strength' && distanceKm == null && log.caloriesBurned == null ? (
          <StatRow label="Duration" value={formatDuration(duration)} unit="" />
        ) : null}
      </View>

      <Text style={styles.note}>
        Workout calories use the Keytel HR-based regression (sex-specific,
        weight + age + per-second HR sample). Effort minutes integrate
        time-in-zone over the workout’s HR samples. Tap History to see
        per-set or per-kilometer detail.
      </Text>
    </DetailModal>
  );
}

interface StatRowProps {
  label: string;
  value: string;
  unit: string;
}

function StatRow({ label, value, unit }: StatRowProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowValueWrap}>
        <Text style={styles.rowValue}>{value}</Text>
        {unit ? <Text style={styles.rowUnit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    borderLeftWidth: 4,
    alignItems: 'center',
  },
  heroValue: {
    fontSize: 40,
    fontWeight: typography.weight.bold,
    color: colors.text,
    lineHeight: 46,
  },
  heroSubtitle: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  statsCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  rowLabel: {
    flex: 1,
    fontSize: typography.size.sm + 1,
    color: colors.textSecondary,
    fontWeight: typography.weight.semibold,
  },
  rowValueWrap: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  rowValue: {
    fontSize: typography.size.lg,
    color: colors.text,
    fontWeight: typography.weight.bold,
  },
  rowUnit: { fontSize: typography.size.sm, color: colors.textSecondary },
  divider: { height: 1, backgroundColor: colors.borderSubtle },
  note: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    lineHeight: 22,
  },
});
