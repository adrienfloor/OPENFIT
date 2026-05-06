import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { DetailModal } from '../../../../components/DetailModal';
import { SparkLine } from '../../../../components/charts/SparkLine';
import { dialog } from '../../../../services/dialog';
import { colors, spacing, radii, typography } from '../../../../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Raw weight readings from Health Connect, oldest → newest. */
  history: { time: Date; kg: number }[];
  /** Registration-time weight, used as a fallback when no scale is connected. */
  profileWeightKg: number | null;
}

/**
 * Weight drill-in modal. Reads body-weight readings from Health Connect
 * (any scale that syncs to HC: Renpho, Withings, Garmin, etc.). Falls back
 * to the registration-time profile weight when no scale data exists.
 */
export function WeightDetail({ visible, onClose, history, profileWeightKg }: Props) {
  const hasReadings = history.length > 0;
  const latestKg = hasReadings
    ? history[history.length - 1]!.kg
    : profileWeightKg;
  const oldestKg = hasReadings ? history[0]!.kg : null;
  const delta = latestKg != null && oldestKg != null ? latestKg - oldestKg : null;

  const onAdd = () => {
    dialog.alert(
      'Manual weight entry',
      'Use your scale or any companion app (Garmin Connect, Mi Fit, Renpho, Health Connect itself) — entries sync automatically. A first-party logger is on the roadmap.',
    );
  };

  return (
    <DetailModal visible={visible} onClose={onClose} eyebrow="Body" title="Weight">
      <View style={styles.hero}>
        <Text style={styles.value}>
          {latestKg != null ? latestKg.toFixed(1) : '--'}
        </Text>
        <Text style={styles.unit}>kg</Text>
      </View>
      {delta != null ? (
        <Text style={styles.delta}>
          {delta >= 0 ? '+' : ''}
          {delta.toFixed(1)} kg over {history.length} reading
          {history.length === 1 ? '' : 's'}
        </Text>
      ) : (
        <Text style={styles.delta}>
          {hasReadings ? '' : 'No scale data — showing profile weight'}
        </Text>
      )}

      <Text style={styles.sectionLabel}>Last 30 days</Text>
      <View style={styles.chartCard}>
        {hasReadings ? (
          <SparkLine
            values={history.map((p) => p.kg)}
            color={colors.accent}
            height={140}
          />
        ) : (
          <Text style={styles.emptyChart}>
            Connect a scale to Health Connect to see your trend.
          </Text>
        )}
      </View>

      <TouchableOpacity style={styles.addBtn} onPress={onAdd}>
        <Text style={styles.addBtnText}>+ Add weight entry</Text>
      </TouchableOpacity>

      <Text style={styles.note}>
        Weighing-in trends are noisier than they look — daily fluctuations
        of 1–2 kg from glycogen, sodium, and gut content are normal. Look
        at 7-day or 30-day moving averages, not the day-to-day.
      </Text>
    </DetailModal>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.xl,
    marginBottom: spacing.sm,
  },
  value: {
    fontSize: 48,
    fontWeight: typography.weight.bold,
    color: colors.text,
    lineHeight: 56,
  },
  unit: { fontSize: typography.size.md, color: colors.textSecondary },
  delta: {
    textAlign: 'center',
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
    minHeight: 18,
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
    minHeight: 140,
    justifyContent: 'center',
  },
  emptyChart: {
    textAlign: 'center',
    color: colors.textSecondary,
    fontSize: typography.size.sm,
  },
  addBtn: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  addBtnText: {
    color: colors.accent,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  note: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    lineHeight: 22,
  },
});
