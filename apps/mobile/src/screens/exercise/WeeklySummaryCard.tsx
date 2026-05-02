import { View, Text, StyleSheet } from 'react-native';
import { formatDuration } from '../../utils';
import { colors, spacing, radii, typography } from '../../theme';

interface Props {
  totalSessions: number;
  totalDurationSeconds: number;
  totalCalories: number;
  totalDistanceMeters: number;
}

/**
 * Compact 4-stat overview of the current calendar week's training. Sits
 * between the picker and the history list so the user sees their volume
 * at a glance.
 */
export function WeeklySummaryCard({
  totalSessions,
  totalDurationSeconds,
  totalCalories,
  totalDistanceMeters,
}: Props) {
  const distanceKm = totalDistanceMeters / 1000;
  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>This week</Text>
      <View style={styles.row}>
        <Stat value={`${totalSessions}`} label="sessions" />
        <Stat value={formatDuration(totalDurationSeconds)} label="time" />
        <Stat value={`${Math.round(totalCalories)}`} label="kcal" />
        <Stat value={distanceKm > 0 ? `${distanceKm.toFixed(1)}` : '—'} label="km" />
      </View>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  eyebrow: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    fontWeight: typography.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'center', flex: 1 },
  value: {
    fontSize: typography.size.lg + 2,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  label: {
    fontSize: typography.size.xs - 1,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 2,
  },
});
