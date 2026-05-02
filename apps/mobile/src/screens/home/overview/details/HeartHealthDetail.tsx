import { View, Text, StyleSheet } from 'react-native';
import { DetailModal } from '../../../../components/DetailModal';
import { SparkLine } from '../../../../components/charts/SparkLine';
import type { TodayDailyStats } from '../../../../services/healthConnect';
import { colors, spacing, radii, typography } from '../../../../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  today: TodayDailyStats | null;
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * Heart-health drill-in modal: current RHR/HRV plus 7-day RHR trend.
 * Real today data flows in; the trend is an inline mock until we
 * wire the historical RHR series. Detail modals stay opt-in and
 * tap-to-open per the user's design spec.
 */
export function HeartHealthDetail({ visible, onClose, today }: Props) {
  // 7-day mock RHR trend keyed off today's RHR (variations ±3 bpm).
  const baseline = today?.heartRateResting ?? 50;
  const trend = [-3, 0, 1, 0, 1, 1, 0].map((d) => baseline + d);

  return (
    <DetailModal
      visible={visible}
      onClose={onClose}
      eyebrow="Heart"
      title="Heart Health"
    >
      <View style={styles.row}>
        <Stat
          label="Resting HR"
          value={today?.heartRateResting != null ? `${today.heartRateResting}` : '--'}
          unit="bpm"
        />
        <Stat
          label="HRV"
          value={today?.hrvRmssd != null ? `${Math.round(today.hrvRmssd)}` : '--'}
          unit="ms"
        />
      </View>

      <Text style={styles.sectionLabel}>Resting HR — last 7 days</Text>
      <View style={styles.chartCard}>
        <SparkLine
          values={trend}
          color={colors.danger}
          labels={WEEKDAYS}
          height={120}
        />
      </View>

      <Text style={styles.note}>
        Resting heart rate trends down with cardiovascular fitness and
        recovery. HRV reflects autonomic balance — higher generally means
        better recovery, but it’s a relative-to-baseline metric.
      </Text>
    </DetailModal>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={styles.statValueRow}>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statUnit}>{unit}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xl },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  statLabel: {
    fontSize: typography.size.xs + 1,
    color: colors.textSecondary,
    fontWeight: typography.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  statValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  statValue: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  statUnit: { fontSize: typography.size.sm, color: colors.textSecondary },
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
