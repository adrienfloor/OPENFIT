import { View, Text, StyleSheet } from 'react-native';
import { DetailModal } from '../../../components/DetailModal';
import { Hypnogram } from '../../../components/charts/Hypnogram';
import type { SleepDashboard } from '../../../mocks';
import { colors, spacing, radii, typography } from '../../../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  sleep: SleepDashboard;
}

function formatHM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/**
 * Full-screen hypnogram. Bigger render of the same component used in the
 * Sleep sub-tab plus a stage-by-stage breakdown table — the user wanted
 * this drill-in tappable for "zoomable / per-stage tooltips".
 */
export function HypnogramDetail({ visible, onClose, sleep }: Props) {
  return (
    <DetailModal visible={visible} onClose={onClose} eyebrow="Sleep" title="Hypnogram">
      <View style={styles.chartCard}>
        <Hypnogram
          segments={sleep.stages}
          totalMinutes={sleep.totalMinutes}
          startTime={sleep.startTime}
          endTime={sleep.endTime}
          height={180}
        />
      </View>

      <Text style={styles.sectionLabel}>Stage breakdown</Text>
      <View style={styles.breakdownCard}>
        <Row label="Deep" minutes={sleep.deepMinutes} total={sleep.totalMinutes} color="#7c3aed" />
        <Divider />
        <Row label="REM" minutes={sleep.remMinutes} total={sleep.totalMinutes} color="#22c55e" />
        <Divider />
        <Row label="Light" minutes={sleep.lightMinutes} total={sleep.totalMinutes} color="#60a5fa" />
        <Divider />
        <Row label="Awake" minutes={sleep.awakeMinutes} total={sleep.totalMinutes} color="#ef4444" />
      </View>

      <Text style={styles.note}>
        A normal night cycles between light, deep, and REM ~4–5 times. Deep
        is concentrated in the first half (recovery), REM dominates later
        (memory consolidation, dreaming).
      </Text>
    </DetailModal>
  );
}

interface RowProps {
  label: string;
  minutes: number;
  total: number;
  color: string;
}

function Row({ label, minutes, total, color }: RowProps) {
  const pct = total > 0 ? Math.round((minutes / total) * 100) : 0;
  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowMinutes}>{formatHM(minutes)}</Text>
      <Text style={styles.rowPct}>{pct}%</Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  chartCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
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
  breakdownCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    gap: spacing.md,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowLabel: {
    flex: 1,
    fontSize: typography.size.sm + 1,
    color: colors.text,
    fontWeight: typography.weight.semibold,
  },
  rowMinutes: {
    fontSize: typography.size.md,
    color: colors.text,
    fontWeight: typography.weight.semibold,
  },
  rowPct: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    width: 40,
    textAlign: 'right',
  },
  divider: { height: 1, backgroundColor: colors.borderSubtle, marginHorizontal: -spacing.lg },
  note: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    lineHeight: 22,
  },
});
