import { View, Text, StyleSheet } from 'react-native';
import { DetailModal } from '../../../../components/DetailModal';
import { colors, spacing, radii, typography } from '../../../../theme';
import type { FitnessAgeResponse } from '../../../../services/metrics';

interface Props {
  visible: boolean;
  onClose: () => void;
  data: FitnessAgeResponse | null;
}

interface ComponentRow {
  key: keyof FitnessAgeResponse['components'];
  label: string;
  hint: string;
}

/**
 * Drill-in for Fitness Age. Big age + delta vs chrono, pure-cardio
 * comparison line, then a per-component breakdown so the user can see
 * exactly what's pulling their age up or down — same transparency
 * pattern as the Sleep / BioCharge / Effort score breakdowns.
 */
export function FitnessAgeDetail({ visible, onClose, data }: Props) {
  if (!visible) return null;

  if (!data) {
    return (
      <DetailModal visible={visible} onClose={onClose} eyebrow="Fitness" title="Fitness Age">
        <Text style={styles.note}>Loading…</Text>
      </DetailModal>
    );
  }

  const delta = data.fitnessAge - data.chronoAge;
  const deltaText = delta === 0 ? 'same as chrono age' : `${delta > 0 ? '+' : ''}${delta} yr`;

  const rows: ComponentRow[] = [
    {
      key: 'vo2max',
      label: 'VO₂max',
      hint:
        data.vo2max != null
          ? `${data.vo2max.toFixed(1)} vs peer avg ${data.popVo2max.toFixed(0)} (${data.vo2maxSampleCount} samples, 28d)`
          : 'No qualifying run/free session in last 28 days',
    },
    { key: 'restingHR', label: 'Resting HR', hint: 'Lower than peers = younger' },
    { key: 'hrv', label: 'HRV (RMSSD)', hint: 'Higher than peers = younger' },
    { key: 'activity', label: 'Activity volume', hint: 'Weekly earned effort minutes (all workout types)' },
    { key: 'consistency', label: 'Consistency', hint: 'Days with any logged workout, last 28d' },
    { key: 'sleep', label: 'Sleep quality', hint: '14-day Sleep score average vs 75 anchor' },
    { key: 'lifting', label: 'Strength habit', hint: '≥2 strength sessions/wk over 4 wk → −1y' },
  ];

  return (
    <DetailModal visible={visible} onClose={onClose} eyebrow="Fitness" title="Fitness Age">
      {/* Hero */}
      <View style={styles.heroCard}>
        <Text style={styles.bigValue}>{data.fitnessAge}</Text>
        <Text style={styles.deltaText}>{deltaText} ({data.chronoAge} chrono)</Text>
        <Text style={styles.cardioLine}>
          Cardio-only: {data.fitnessAgeCardio} yr (Garmin-style)
        </Text>
        {data.calibrating ? (
          <View style={styles.calibratingPill}>
            <Text style={styles.calibratingText}>
              Calibrating — log a hard run or free session to lock VO₂max
            </Text>
          </View>
        ) : null}
      </View>

      {/* Component breakdown */}
      <Text style={styles.sectionLabel}>What's pulling it</Text>
      <View style={styles.breakdownCard}>
        {rows.map((row, idx) => {
          const value = data.components[row.key];
          const sign = value === 0 ? 'neutral' : value < 0 ? 'good' : 'bad';
          return (
            <View key={row.key}>
              {idx > 0 ? <View style={styles.divider} /> : null}
              <View style={styles.row}>
                <View style={styles.rowMain}>
                  <Text style={styles.rowLabel}>{row.label}</Text>
                  <Text style={styles.rowHint}>{row.hint}</Text>
                </View>
                <Text
                  style={[
                    styles.rowValue,
                    sign === 'good' && styles.rowValueGood,
                    sign === 'bad' && styles.rowValueBad,
                  ]}
                >
                  {value === 0 ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(1)} yr`}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      <Text style={styles.note}>
        Composite of cardio fitness (VO₂max + RHR + HRV vs age- and sex-matched
        norms from peer-reviewed cohorts) plus your training volume,
        consistency, sleep, and strength habit. Each term is a transparent
        fixed-coefficient adjustment — no ML black box.
      </Text>
    </DetailModal>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  bigValue: {
    fontSize: 56,
    fontWeight: typography.weight.bold,
    color: colors.accent,
    lineHeight: 60,
  },
  deltaText: {
    fontSize: typography.size.md,
    color: colors.text,
    marginTop: spacing.sm,
  },
  cardioLine: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  calibratingPill: {
    marginTop: spacing.md,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  calibratingText: {
    color: colors.warning,
    fontSize: typography.size.xs + 1,
    fontWeight: typography.weight.semibold,
  },
  sectionLabel: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    fontWeight: typography.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  breakdownCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  rowMain: { flex: 1, paddingRight: spacing.md },
  rowLabel: {
    fontSize: typography.size.sm + 1,
    color: colors.text,
    fontWeight: typography.weight.semibold,
  },
  rowHint: {
    fontSize: typography.size.xs + 1,
    color: colors.textSecondary,
    marginTop: 2,
  },
  rowValue: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    color: colors.textSecondary,
  },
  rowValueGood: { color: colors.accent },
  rowValueBad: { color: colors.danger },
  divider: { height: 1, backgroundColor: colors.borderSubtle },
  note: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    lineHeight: 20,
  },
});
