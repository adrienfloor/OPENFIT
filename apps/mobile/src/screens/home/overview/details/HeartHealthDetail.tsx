import { View, Text, StyleSheet } from 'react-native';
import { calculateMaxHR } from '@openfit/fitness-core';
import { DetailModal } from '../../../../components/DetailModal';
import { SparkLine } from '../../../../components/charts/SparkLine';
import { useAuth } from '../../../../hooks/useAuth';
import { useRealtimeHeartRate } from '../../../../hooks/useRealtimeHeartRate';
import type { TodayDailyStats } from '../../../../services/healthConnect';
import { colors, spacing, radii, typography } from '../../../../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  today: TodayDailyStats | null;
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function ageYearsFromDob(dob: Date): number {
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

/**
 * Heart-health drill-in modal: live BLE HR (when an HR device is in
 * range) + RHR/HRV from Health Connect + 7-day RHR trend. Detail
 * modals stay opt-in and tap-to-open per the user's design spec.
 *
 * The live-HR panel is only mounted while the modal is visible — the
 * BLE service connects on mount and disconnects on unmount, so we
 * deliberately return null when hidden to avoid keeping the HR device
 * link open across the entire app session.
 */
export function HeartHealthDetail({ visible, onClose, today }: Props) {
  if (!visible) return null;

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
      <LiveHRPanel />

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

function LiveHRPanel() {
  const { user } = useAuth();
  const maxHR = user?.dateOfBirth
    ? calculateMaxHR(ageYearsFromDob(new Date(user.dateOfBirth)))
    : 190;
  const { bpm, zone, connectionState } = useRealtimeHeartRate(maxHR);

  const stateLabel =
    connectionState === 'scanning' ? 'Scanning for HR device…'
      : connectionState === 'connecting' ? 'Connecting…'
      : connectionState === 'connected' ? 'Live'
      : connectionState === 'error' ? 'No HR device found'
      : connectionState === 'disconnected' ? 'Disconnected'
      : 'Waiting…';

  const dotColor =
    connectionState === 'connected' ? colors.danger
      : connectionState === 'error' ? colors.textMuted
      : colors.warning;

  const zoneLabel = zone ? zone.replace('_', ' ').toUpperCase() : null;

  return (
    <View style={styles.liveCard}>
      <View style={styles.liveHeader}>
        <View style={styles.liveTitleRow}>
          <View style={[styles.liveDot, { backgroundColor: dotColor }]} />
          <Text style={styles.liveLabel}>Live heart rate</Text>
        </View>
        <Text style={styles.liveState}>{stateLabel}</Text>
      </View>
      <View style={styles.liveValueRow}>
        <Text style={styles.liveValue}>{bpm ?? '--'}</Text>
        <Text style={styles.liveUnit}>bpm</Text>
        {zoneLabel ? (
          <Text style={styles.liveZone}>{zoneLabel}</Text>
        ) : null}
      </View>
    </View>
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
  liveCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderLeftWidth: 3,
    borderLeftColor: colors.danger,
  },
  liveHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  liveTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveLabel: {
    fontSize: typography.size.xs + 1,
    color: colors.text,
    fontWeight: typography.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  liveState: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  liveValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  liveValue: {
    fontSize: 48,
    lineHeight: 52,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  liveUnit: { fontSize: typography.size.md, color: colors.textSecondary },
  liveZone: {
    marginLeft: spacing.md,
    fontSize: typography.size.xs + 1,
    fontWeight: typography.weight.bold,
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
});
