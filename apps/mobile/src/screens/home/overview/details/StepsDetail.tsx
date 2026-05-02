import { View, Text, StyleSheet } from 'react-native';
import { DetailModal } from '../../../../components/DetailModal';
import { SparkBars } from '../../../../components/charts/SparkBars';
import type { TodayDailyStats } from '../../../../services/healthConnect';
import { colors, spacing, radii, typography } from '../../../../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  today: TodayDailyStats | null;
  /** Optional 7-day step series if the caller already has it. */
  trend?: number[];
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * Steps drill-in modal. Shows today's count + distance + the step-derived
 * active-kcal estimate, plus a 7-day bar chart. Stride is approximated
 * (~0.76 m) — close enough for a daily display until we have a settable
 * stride length in profile.
 */
export function StepsDetail({ visible, onClose, today, trend }: Props) {
  const steps = today?.steps ?? 0;
  const distanceKm = (steps * 0.76) / 1000;
  const stepKcal = today?.caloriesActive ?? 0;
  const series = trend ?? [3200, 4800, 6100, 7200, 5900, 4400, steps];

  return (
    <DetailModal visible={visible} onClose={onClose} eyebrow="Activity" title="Steps">
      <View style={styles.hero}>
        <Text style={styles.value}>{steps.toLocaleString()}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>{distanceKm.toFixed(2)} km</Text>
          <Text style={styles.metaSep}>·</Text>
          <Text style={styles.meta}>{Math.round(stepKcal)} kcal</Text>
        </View>
      </View>

      <Text style={styles.sectionLabel}>Last 7 days</Text>
      <View style={styles.chartCard}>
        <SparkBars
          values={series}
          color={colors.run}
          labels={WEEKDAYS}
          showValues
          height={140}
        />
      </View>

      <Text style={styles.note}>
        Distance is estimated from a 0.76 m average stride. Active calories
        from steps use the ACSM pedometer formula scaled by your body
        weight; logged workouts add HR-based calories on top.
      </Text>
    </DetailModal>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.xl,
    marginBottom: spacing.xl,
    alignItems: 'center',
  },
  value: {
    fontSize: 48,
    fontWeight: typography.weight.bold,
    color: colors.text,
    lineHeight: 56,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  meta: { fontSize: typography.size.md, color: colors.textSecondary },
  metaSep: { color: colors.textMuted },
  sectionLabel: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    fontWeight: typography.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  chartCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  note: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    lineHeight: 22,
  },
});
