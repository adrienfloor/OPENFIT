import { View, Text, StyleSheet } from 'react-native';
import { DetailModal } from '../../../components/DetailModal';
import { SparkBars } from '../../../components/charts/SparkBars';
import type { TodayDailyStats } from '../../../services/healthConnect';
import { colors, spacing, radii, typography } from '../../../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  today: TodayDailyStats | null;
  /** Effort minutes earned from passive daily activity (not workouts). */
  earnedMinutes: number;
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * Drill-in for the "Daily activity" row in Effort. Shows steps + active
 * kcal + the effort-minutes earned from passive movement, plus a 7-day
 * step series so the user can see how today compares.
 */
export function DailyActivityDetail({ visible, onClose, today, earnedMinutes }: Props) {
  const steps = today?.steps ?? 0;
  const distanceKm = (steps * 0.76) / 1000;
  const stepKcal = today?.caloriesActive ?? 0;
  const stepTrend = [3200, 4800, 6100, 7200, 5900, 4400, steps];

  return (
    <DetailModal
      visible={visible}
      onClose={onClose}
      eyebrow="Effort"
      title="Daily activity"
    >
      <View style={styles.statsCard}>
        <Stat label="Earned" value={`+${earnedMinutes}`} unit="min" />
        <Divider />
        <Stat label="Steps" value={steps.toLocaleString()} unit="" />
        <Divider />
        <Stat label="Distance" value={distanceKm.toFixed(2)} unit="km" />
        <Divider />
        <Stat label="Active kcal" value={`${Math.round(stepKcal)}`} unit="kcal" />
      </View>

      <Text style={styles.sectionLabel}>Steps — last 7 days</Text>
      <View style={styles.chartCard}>
        <SparkBars
          values={stepTrend}
          color={colors.run}
          labels={WEEKDAYS}
          showValues
          height={120}
        />
      </View>

      <Text style={styles.note}>
        Daily activity is everything that earns effort minutes outside an
        explicit workout — walking, errands, climbing stairs. Passive
        movement still counts toward the personalised effort target,
        usually adding 10–25% on a typical day.
      </Text>
    </DetailModal>
  );
}

interface StatProps {
  label: string;
  value: string;
  unit: string;
}

function Stat({ label, value, unit }: StatProps) {
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
