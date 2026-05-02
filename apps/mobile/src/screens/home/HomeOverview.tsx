import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { useDailyStats } from '../../hooks/useDailyStats';
import { useAuth } from '../../hooks/useAuth';
import { TodayScoresHeader } from '../../components/TodayScoresHeader';
import { NutritionCard } from '../../components/NutritionCard';
import { colors, spacing, radii, typography } from '../../theme';

/**
 * Home → Overview sub-tab.
 *
 * Slice 1: lifted from the old standalone Today screen.
 * Slice 2: switched to the dark token palette.
 * Slice 3 will rebuild the cards into the final design.
 */
export function HomeOverview() {
  const { user } = useAuth();
  const { today, loading, refetch, healthConnectAvailable, permissionsGranted, requestPermissions } = useDailyStats();

  const stats = [
    { label: 'Steps', value: today?.steps?.toLocaleString() ?? '--' },
    { label: 'Active cal', value: today?.caloriesActive ? `${Math.round(today.caloriesActive)} kcal` : '--' },
    { label: 'Resting HR', value: today?.heartRateResting ? `${today.heartRateResting} bpm` : '--' },
    { label: 'HRV', value: today?.hrvRmssd ? `${Math.round(today.hrvRmssd)} ms` : '--' },
    { label: 'Sleep', value: today?.sleepDurationMinutes ? `${Math.floor(today.sleepDurationMinutes / 60)}h ${today.sleepDurationMinutes % 60}m` : '--' },
  ];

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.text} />
      }
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hello, {user?.name ?? 'athlete'}</Text>
          <Text style={styles.date}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
        </View>
      </View>

      {healthConnectAvailable === false && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>Health Connect is not installed. Install it from the Play Store to see your daily stats.</Text>
        </View>
      )}

      {healthConnectAvailable === true && !permissionsGranted && (
        <TouchableOpacity style={styles.connectBtn} onPress={requestPermissions}>
          <Text style={styles.connectBtnText}>Connect Health Data</Text>
          <Text style={styles.connectBtnSub}>Tap to grant Health Connect permissions</Text>
        </TouchableOpacity>
      )}

      <TodayScoresHeader
        sleepScore={today?.sleepScore ?? null}
        effortScore={today?.effortScore ?? null}
        effortEarnedMinutes={today?.effortEarnedMinutes ?? null}
        effortTargetMinutes={today?.effortTargetMinutes ?? null}
        readinessScore={today?.recoveryScore ?? null}
        readinessCalibrating={today?.readinessCalibrating ?? false}
        readinessBaselineDays={today?.readinessBaselineDays ?? 0}
      />

      <View style={styles.grid}>
        {stats.map((stat) => (
          <View key={stat.label} style={styles.card}>
            <Text style={styles.cardLabel}>{stat.label}</Text>
            <Text style={styles.cardValue}>{stat.value}</Text>
          </View>
        ))}
      </View>

      <NutritionCard />

      <View style={{ height: spacing.xxxl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xxl,
  },
  greeting: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  date: { fontSize: typography.size.sm, color: colors.textSecondary },
  banner: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.lg,
    padding: spacing.md + 2,
    marginBottom: spacing.lg,
    borderColor: colors.warning,
    borderWidth: 1,
  },
  bannerText: { fontSize: typography.size.sm, color: colors.warning },
  connectBtn: {
    backgroundColor: colors.accent,
    borderRadius: radii.lg,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  connectBtnText: { color: colors.bg, fontSize: typography.size.md, fontWeight: typography.weight.semibold },
  connectBtnSub: { color: colors.bg, opacity: 0.7, fontSize: typography.size.xs, marginTop: spacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  card: {
    width: '47%',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  cardLabel: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    marginBottom: spacing.xs + 2,
  },
  cardValue: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
});
