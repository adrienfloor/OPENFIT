import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useDailyStats } from '../../hooks/useDailyStats';
import { useAuth } from '../../hooks/useAuth';
import { TodayScoresHeader } from '../../components/TodayScoresHeader';
import { NutritionCard } from '../../components/NutritionCard';
import { AIInsightCard } from '../../components/AIInsightCard';
import { MetricRow } from '../../components/MetricRow';
import { MetricCard } from '../../components/MetricCard';
import {
  useMockFatigueLoad,
  useMockTrainingStatus,
  useMockVO2Max,
  useMockPAI,
  useMockWeight,
} from '../../mocks';
import { HeartHealthDetail } from './overview/details/HeartHealthDetail';
import { StepsDetail } from './overview/details/StepsDetail';
import { CaloriesDetail } from './overview/details/CaloriesDetail';
import { WeightDetail } from './overview/details/WeightDetail';
import { SimpleMetricDetail } from './overview/details/SimpleMetricDetail';
import { colors, spacing, radii, typography } from '../../theme';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * Home → Overview sub-tab — Slice 3 rebuild.
 *
 * Layout (top-to-bottom):
 *   • Greeting + date
 *   • Tri-ring header (Sleep / BioCharge / Effort) — non-tappable; the
 *     deep dives live in the sibling sub-tabs.
 *   • AI insight card — taps to expand reasoning bottom sheet.
 *   • Métriques de base: 5 compact rows (Charge d'effort, Statut de
 *     l'entraînement, VO₂ Max, Durée Sommeil, Variabilité de FC).
 *     Each opens its own DetailModal.
 *   • Nutrition card — existing component, untouched.
 *   • Large MetricCards: Santé cardiaque, Pas, Calories, PAI, Poids.
 *     Each opens its own DetailModal.
 *
 * Mocks where data isn't live yet (VO₂ Max, training-status numbers,
 * PAI, weight). Real-data hooks fill in the rest.
 */
type DetailKey =
  | 'fatigueLoad'
  | 'trainingStatus'
  | 'vo2max'
  | 'sleepDuration'
  | 'hrv'
  | 'heart'
  | 'steps'
  | 'calories'
  | 'pai'
  | 'weight'
  | null;

export function HomeOverview() {
  const { user } = useAuth();
  const {
    today,
    loading,
    refetch,
    healthConnectAvailable,
    permissionsGranted,
    requestPermissions,
  } = useDailyStats();

  const fatigue = useMockFatigueLoad();
  const trainingStatus = useMockTrainingStatus();
  const vo2max = useMockVO2Max();
  const pai = useMockPAI();
  const weight = useMockWeight();

  const [detail, setDetail] = useState<DetailKey>(null);
  const close = () => setDetail(null);

  const sleepHours = today?.sleepDurationMinutes
    ? `${Math.floor(today.sleepDurationMinutes / 60)}h ${today.sleepDurationMinutes % 60}m`
    : '--';
  const hrv = today?.hrvRmssd != null ? `${Math.round(today.hrvRmssd)} ms` : '--';
  const restingHR = today?.heartRateResting != null ? `${today.heartRateResting} bpm` : '--';

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.text} />
      }
    >
      {/* Greeting */}
      <View style={styles.header}>
        <Text style={styles.greeting}>Hello, {user?.name ?? 'athlete'}</Text>
        <Text style={styles.date}>
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
        </Text>
      </View>

      {/* Health Connect onboarding */}
      {healthConnectAvailable === false ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            Health Connect isn’t installed. Install it from the Play Store to see your daily stats.
          </Text>
        </View>
      ) : null}
      {healthConnectAvailable === true && !permissionsGranted ? (
        <TouchableOpacity style={styles.connectBtn} onPress={requestPermissions}>
          <Text style={styles.connectBtnText}>Connect Health Data</Text>
          <Text style={styles.connectBtnSub}>
            Tap to grant Health Connect permissions
          </Text>
        </TouchableOpacity>
      ) : null}

      {/* Tri-ring */}
      <TodayScoresHeader
        sleepScore={today?.sleepScore ?? null}
        effortScore={today?.effortScore ?? null}
        effortEarnedMinutes={today?.effortEarnedMinutes ?? null}
        effortTargetMinutes={today?.effortTargetMinutes ?? null}
        readinessScore={today?.recoveryScore ?? null}
        readinessCalibrating={today?.readinessCalibrating ?? false}
        readinessBaselineDays={today?.readinessBaselineDays ?? 0}
      />

      {/* AI insight */}
      <AIInsightCard />

      {/* Métriques de base */}
      <Text style={styles.sectionLabel}>Métriques de base</Text>
      <MetricRow
        label="Charge d'effort"
        value={`${fatigue.current}`}
        status={{ text: 'BALANCED', tone: 'good' }}
        icon={<MetricGlyph color={colors.warning}>⌃</MetricGlyph>}
        onPress={() => setDetail('fatigueLoad')}
      />
      <MetricRow
        label="Statut de l'entraînement"
        value={`${trainingStatus.current}`}
        status={{ text: trainingStatus.label.toUpperCase(), tone: 'neutral' }}
        icon={<MetricGlyph color={colors.sleep}>↻</MetricGlyph>}
        onPress={() => setDetail('trainingStatus')}
      />
      <MetricRow
        label="VO₂ Max"
        value={`${vo2max.current}`}
        status={{ text: vo2max.label.toUpperCase(), tone: 'good' }}
        icon={<MetricGlyph color={colors.accent}>♥</MetricGlyph>}
        onPress={() => setDetail('vo2max')}
      />
      <MetricRow
        label="Durée Sommeil"
        value={sleepHours}
        icon={<MetricGlyph color={colors.sleep}>☾</MetricGlyph>}
        onPress={() => setDetail('sleepDuration')}
      />
      <MetricRow
        label="Variabilité de FC"
        value={hrv}
        status={{ text: 'OPTIMAL', tone: 'good' }}
        icon={<MetricGlyph color={colors.danger}>~</MetricGlyph>}
        onPress={() => setDetail('hrv')}
      />

      {/* Nutrition (existing card) */}
      <NutritionCard />

      {/* Large stat cards */}
      <View style={styles.spacer} />
      <Text style={styles.sectionLabel}>Today</Text>

      <MetricCard
        title="Santé cardiaque"
        icon="♥"
        value={today?.heartRateResting != null ? `${today.heartRateResting}` : '--'}
        unit="bpm"
        subtitle={`Resting · HRV ${hrv}`}
        onPress={() => setDetail('heart')}
      />

      <MetricCard
        title="Pas"
        icon="👟"
        value={today?.steps?.toLocaleString() ?? '--'}
        subtitle={
          today?.steps != null
            ? `${((today.steps * 0.76) / 1000).toFixed(2)} km · ${
                today?.caloriesActive ? Math.round(today.caloriesActive) : 0
              } kcal`
            : '--'
        }
        progress={today?.steps != null ? Math.min(1, today.steps / 10000) : 0}
        progressColor={colors.run}
        onPress={() => setDetail('steps')}
      />

      <MetricCard
        title="Calories"
        icon="🔥"
        value={today?.caloriesTotal != null ? `${Math.round(today.caloriesTotal)}` : '--'}
        unit="kcal total"
        subtitle={
          today?.caloriesActive != null && today?.caloriesTotal != null
            ? `Resting ${Math.round(today.caloriesTotal - today.caloriesActive)} · Active ${Math.round(today.caloriesActive)}`
            : 'Resting + active'
        }
        onPress={() => setDetail('calories')}
      />

      <MetricCard
        title="PAI"
        icon="●"
        value={`${pai.current}`}
        subtitle={`+${pai.todayDelta} PAI today`}
        progress={Math.min(1, pai.current / 200)}
        progressColor={colors.accent}
        onPress={() => setDetail('pai')}
      />

      <MetricCard
        title="Poids"
        icon="⚖"
        value={weight.current.toFixed(1)}
        unit="kg"
        subtitle="30-day trend"
        onPress={() => setDetail('weight')}
      />

      <View style={{ height: spacing.huge }} />

      {/* Modals — render once, controlled by `detail` */}
      <SimpleMetricDetail
        visible={detail === 'fatigueLoad'}
        onClose={close}
        eyebrow="Effort"
        title="Charge d'effort"
        value={`${fatigue.current}`}
        status={fatigue.status.toUpperCase()}
        trend={fatigue.trend7Days.map((p) => p.value)}
        trendLabels={WEEKDAYS}
        trendType="line"
        trendColor={colors.warning}
        note="Aggregate intensity-minutes from training plus background activity. Higher values indicate more cumulative load — track the trend, not the daily number."
      />
      <SimpleMetricDetail
        visible={detail === 'trainingStatus'}
        onClose={close}
        eyebrow="Effort"
        title="Statut de l'entraînement"
        value={`${trainingStatus.current >= 0 ? '+' : ''}${trainingStatus.current}`}
        status={trainingStatus.label.toUpperCase()}
        trend={trainingStatus.trend7Days.map((p) => p.value)}
        trendLabels={WEEKDAYS}
        trendType="bar"
        trendColor={colors.sleep}
        note="Acute load minus 28-day chronic baseline. Negative means you're recovering, positive means you're loading. Stay between −20 and +30 to keep ramping safely."
      />
      <SimpleMetricDetail
        visible={detail === 'vo2max'}
        onClose={close}
        eyebrow="Fitness"
        title="VO₂ Max"
        value={`${vo2max.current}`}
        unit="ml/kg/min"
        status={vo2max.label.toUpperCase()}
        trend={vo2max.trend7Days.map((p) => p.value)}
        trendLabels={WEEKDAYS}
        trendType="line"
        trendColor={colors.accent}
        note="Estimated peak aerobic capacity. Currently a placeholder — proper estimation needs a sustained run or a max-effort lab test. We'll wire it once we collect enough heart-rate-vs-pace data from your runs."
      />
      <SimpleMetricDetail
        visible={detail === 'sleepDuration'}
        onClose={close}
        eyebrow="Sleep"
        title="Durée Sommeil"
        value={sleepHours}
        trend={[440, 510, 480, 520, 460, 530, today?.sleepDurationMinutes ?? 480].map(
          (m) => Math.round(m / 6) / 10,
        )}
        trendLabels={WEEKDAYS}
        trendType="bar"
        trendColor={colors.sleep}
        note="Total time asleep last night, excluding wake periods. The sleep tab breaks this down by stage (deep / REM / light) and tracks regularity."
      />
      <SimpleMetricDetail
        visible={detail === 'hrv'}
        onClose={close}
        eyebrow="Recovery"
        title="Variabilité de FC"
        value={today?.hrvRmssd != null ? `${Math.round(today.hrvRmssd)}` : '--'}
        unit="ms"
        status="OPTIMAL"
        trend={[67, 67, 69, 67, 71, 65, today?.hrvRmssd ?? 71]}
        trendLabels={WEEKDAYS}
        trendType="line"
        trendColor={colors.danger}
        note="RMSSD averaged over the night — autonomic balance and recovery indicator. Compare against your own 7-day baseline; absolute values vary widely between people."
      />
      <HeartHealthDetail visible={detail === 'heart'} onClose={close} today={today} />
      <StepsDetail visible={detail === 'steps'} onClose={close} today={today} />
      <CaloriesDetail
        visible={detail === 'calories'}
        onClose={close}
        today={today}
        user={
          user
            ? {
                weightKg: user.weightKg,
                heightCm: user.heightCm,
                sex: user.sex,
                dateOfBirth: new Date(user.dateOfBirth),
              }
            : null
        }
      />
      <SimpleMetricDetail
        visible={detail === 'pai'}
        onClose={close}
        eyebrow="Activity"
        title="PAI"
        value={`${pai.current}`}
        status={`+${pai.todayDelta} TODAY`}
        trend={pai.trend7Days.map((p) => p.value)}
        trendLabels={WEEKDAYS}
        trendType="line"
        trendColor={colors.accent}
        note="Personal Activity Intelligence — a 7-day rolling score weighting time spent in each HR zone. 100+ is the all-cause-mortality sweet spot."
      />
      <WeightDetail visible={detail === 'weight'} onClose={close} />
    </ScrollView>
  );
}

/** Tiny circular glyph used in MetricRow icons. */
function MetricGlyph({ color, children }: { color: string; children: string }) {
  return (
    <View style={[glyphStyles.wrap, { borderColor: color }]}>
      <Text style={[glyphStyles.text, { color }]}>{children}</Text>
    </View>
  );
}

const glyphStyles = StyleSheet.create({
  wrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { fontSize: 14, fontWeight: '700' },
});

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
    marginBottom: spacing.xl,
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
  connectBtnText: {
    color: colors.bg,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
  },
  connectBtnSub: {
    color: colors.bg,
    opacity: 0.7,
    fontSize: typography.size.xs,
    marginTop: spacing.xs,
  },
  sectionLabel: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    fontWeight: typography.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  spacer: { height: spacing.sm },
});
