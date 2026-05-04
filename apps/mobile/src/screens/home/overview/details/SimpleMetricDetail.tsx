import { View, Text, StyleSheet } from 'react-native';
import { DetailModal } from '../../../../components/DetailModal';
import { SparkLine } from '../../../../components/charts/SparkLine';
import { SparkBars } from '../../../../components/charts/SparkBars';
import { colors, spacing, radii, typography } from '../../../../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  eyebrow: string;
  title: string;
  /** Big value rendered at the top. */
  value: string;
  unit?: string;
  /** Status pill text below the value. */
  status?: string;
  /** Series for the trend chart. */
  trend: number[];
  trendLabels?: string[];
  trendType?: 'line' | 'bar';
  trendColor?: string;
  /** Section heading above the chart. Defaults to "Last 7 days". */
  trendTitle?: string;
  /** Shown in place of the chart when fewer than 2 points exist. */
  trendEmpty?: string;
  /** Explanatory paragraph at the bottom. */
  note?: string;
}

/**
 * One-size-fits-most detail modal for metrics whose deep-dive is
 * "current value + 7-day chart + plain-language explanation". Used
 * by Effort load, Training status, VO₂ Max, Sleep duration, Heart
 * rate variability, PAI, and the 7-day deep-dives that
 * Slice 4–6 will reuse for BioCharge / Sleep / Effort sub-tabs.
 */
export function SimpleMetricDetail({
  visible,
  onClose,
  eyebrow,
  title,
  value,
  unit,
  status,
  trend,
  trendLabels,
  trendType = 'line',
  trendColor = colors.accent,
  trendTitle = 'Last 7 days',
  trendEmpty,
  note,
}: Props) {
  const hasTrend = trend.length >= 2;
  return (
    <DetailModal visible={visible} onClose={onClose} eyebrow={eyebrow} title={title}>
      <View style={styles.heroCard}>
        <View style={styles.valueRow}>
          <Text style={styles.value}>{value}</Text>
          {unit ? <Text style={styles.unit}>{unit}</Text> : null}
        </View>
        {status ? <Text style={styles.status}>{status}</Text> : null}
      </View>

      <Text style={styles.sectionLabel}>{trendTitle}</Text>
      <View style={styles.chartCard}>
        {hasTrend ? (
          trendType === 'bar' ? (
            <SparkBars
              values={trend}
              color={trendColor}
              labels={trendLabels}
              showValues
              height={120}
            />
          ) : (
            <SparkLine
              values={trend}
              color={trendColor}
              labels={trendLabels}
              showValues
              height={140}
            />
          )
        ) : (
          <Text style={styles.emptyText}>
            {trendEmpty ?? 'Not enough data yet — keep training to build a trend.'}
          </Text>
        )}
      </View>

      {note ? <Text style={styles.note}>{note}</Text> : null}
    </DetailModal>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.xl,
    marginBottom: spacing.xl,
    alignItems: 'center',
  },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  value: {
    fontSize: 48,
    fontWeight: typography.weight.bold,
    color: colors.text,
    lineHeight: 56,
  },
  unit: { fontSize: typography.size.md, color: colors.textSecondary },
  status: {
    marginTop: spacing.sm,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    fontWeight: typography.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
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
  emptyText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
});
