import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { DetailModal } from '../../../../components/DetailModal';
import { SparkLine } from '../../../../components/charts/SparkLine';
import { useMockWeight } from '../../../../mocks';
import { dialog } from '../../../../services/dialog';
import { colors, spacing, radii, typography } from '../../../../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
}

/**
 * Weight drill-in modal. 30-day mock trend until we ship a real
 * weight write API + WeightLog table; the chart and the manual-add
 * affordance are wired so the UI ships unchanged when data is real.
 */
export function WeightDetail({ visible, onClose }: Props) {
  const data = useMockWeight();
  const values = data.trend30Days.map((p) => p.value);
  const oldest = data.trend30Days[0]!.value;
  const delta = data.current - oldest;

  const onAdd = () => {
    dialog.alert(
      'Manual weight entry',
      'Coming with the profile editor in Slice 8 — for now the trend uses placeholder data.',
    );
  };

  return (
    <DetailModal visible={visible} onClose={onClose} eyebrow="Body" title="Weight">
      <View style={styles.hero}>
        <Text style={styles.value}>{data.current.toFixed(1)}</Text>
        <Text style={styles.unit}>kg</Text>
      </View>
      <Text style={styles.delta}>
        {delta >= 0 ? '+' : ''}
        {delta.toFixed(1)} kg over 30 days
      </Text>

      <Text style={styles.sectionLabel}>Last 30 days</Text>
      <View style={styles.chartCard}>
        <SparkLine values={values} color={colors.accent} height={140} />
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
