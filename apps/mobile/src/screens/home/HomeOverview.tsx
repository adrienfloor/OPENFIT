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
import { useFitnessAge } from '../../hooks/useFitnessAge';
import { TodayScoresHeader } from '../../components/TodayScoresHeader';
import { HomeLoadingOverlay } from '../../components/HomeLoadingOverlay';
import { NutritionCard } from '../../components/NutritionCard';
import { AIInsightCard } from '../../components/AIInsightCard';
import { MetricRow } from '../../components/MetricRow';
import { MetricCard } from '../../components/MetricCard';
import { useMockPAI, useMockWeight } from '../../mocks';
import { computeEffortLoad } from '../../utils/effortLoad';
import {
  computeTrainingStatus,
  type TrainingStatusView,
} from '../../utils/trainingStatus';
import { HeartHealthDetail } from './overview/details/HeartHealthDetail';
import { StepsDetail } from './overview/details/StepsDetail';
import { CaloriesDetail } from './overview/details/CaloriesDetail';
import { WeightDetail } from './overview/details/WeightDetail';
import { SimpleMetricDetail } from './overview/details/SimpleMetricDetail';
import { FitnessAgeDetail } from './overview/details/FitnessAgeDetail';
import { colors, spacing, radii, typography, themedRefresh } from '../../theme';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * Home → Overview sub-tab — Slice 3 rebuild.
 *
 * Layout (top-to-bottom):
 *   • Greeting + date
 *   • Tri-ring header (Sleep / BioCharge / Effort) — non-tappable; the
 *     deep dives live in the sibling sub-tabs.
 *   • AI insight card — taps to expand reasoning bottom sheet.
 *   • Base metrics: 5 compact rows (Effort load, Training status,
 *     VO₂ Max, Sleep duration, Heart rate variability). Each opens
 *     its own DetailModal.
 *   • Nutrition card — existing component, untouched.
 *   • Large MetricCards: Heart health, Steps, Calories, PAI, Weight.
 *     Each opens its own DetailModal.
 *
 * Mocks where data isn't live yet (VO₂ Max, training-status numbers,
 * PAI, weight). Real-data hooks fill in the rest.
 */
type DetailKey =
  | 'fatigueLoad'
  | 'trainingStatus'
  | 'vo2max'
  | 'fitnessAge'
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
    refetch,
    healthConnectAvailable,
    permissionsGranted,
    hasEverLoaded,
    requestPermissions,
  } = useDailyStats();
  const [pulling, setPulling] = useState(false);
  const onPullRefresh = async () => {
    setPulling(true);
    try { await refetch(); } finally { setPulling(false); }
  };

  const fatigue = computeEffortLoad(
    today?.effortLoad7Days ?? null,
    today?.effortTargetMinutes ?? null,
  );
  const trainingStatus: TrainingStatusView = computeTrainingStatus(today);
  const pai = useMockPAI();
  const weight = useMockWeight();
  const { data: fitnessAgeData } = useFitnessAge();

  const [detail, setDetail] = useState<DetailKey>(null);
  const close = () => setDetail(null);

  const sleepHours = today?.sleepDurationMinutes
    ? `${Math.floor(today.sleepDurationMinutes / 60)}h ${today.sleepDurationMinutes % 60}m`
    : '--';
  const hrv = today?.hrvRmssd != null ? `${Math.round(today.hrvRmssd)} ms` : '--';
  const restingHR = today?.heartRateResting != null ? `${today.heartRateResting} bpm` : '--';

  // Cold-start gate: render the centered loader until the very first
  // dashboard fetch resolves OR Health Connect is missing / not granted
  // (in which case we fall through to the onboarding banner). After
  // hasEverLoaded flips true, the rings render whatever's in `today` and
  // never go back to a loading state for the rest of the session.
  if (!hasEverLoaded && healthConnectAvailable !== false && permissionsGranted) {
    return <HomeLoadingOverlay />;
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={pulling} onRefresh={onPullRefresh} {...themedRefresh} />
      }
    >
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

      {/* Base metrics */}
      <Text style={styles.sectionLabel}>Base metrics</Text>
      <MetricRow
        label="Effort load"
        value={fatigue.current != null ? `${fatigue.current}` : '--'}
        status={{ text: fatigue.statusLabel, tone: fatigue.statusTone }}
        icon={<MetricGlyph color={colors.warning}>⌃</MetricGlyph>}
        onPress={() => setDetail('fatigueLoad')}
      />
      <MetricRow
        label="Training status"
        value={
          trainingStatus.tsb != null
            ? `${trainingStatus.tsb >= 0 ? '+' : ''}${trainingStatus.tsb}`
            : '--'
        }
        status={{ text: trainingStatus.label, tone: trainingStatus.tone }}
        icon={<MetricGlyph color={colors.sleep}>↻</MetricGlyph>}
        onPress={() => setDetail('trainingStatus')}
      />
      <MetricRow
        label="VO₂ Max"
        value={fitnessAgeData?.vo2max != null ? fitnessAgeData.vo2max.toFixed(1) : '--'}
        status={
          fitnessAgeData?.vo2max != null
            ? {
                text: fitnessAgeData.vo2max >= fitnessAgeData.popVo2max ? 'GOOD' : 'BUILDING',
                tone: fitnessAgeData.vo2max >= fitnessAgeData.popVo2max ? 'good' : 'neutral',
              }
            : { text: 'CALIBRATING', tone: 'neutral' }
        }
        icon={<MetricGlyph color={colors.accent}>♥</MetricGlyph>}
        onPress={() => setDetail('vo2max')}
      />
      <MetricRow
        label="Sleep duration"
        value={sleepHours}
        icon={<MetricGlyph color={colors.sleep}>☾</MetricGlyph>}
        onPress={() => setDetail('sleepDuration')}
      />
      <MetricRow
        label="Heart rate variability"
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
        title="Heart health"
        icon="♥"
        value={today?.heartRateResting != null ? `${today.heartRateResting}` : '--'}
        unit="bpm"
        subtitle={`Resting · HRV ${hrv}`}
        onPress={() => setDetail('heart')}
      />

      <MetricCard
        title="Steps"
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
        title="Weight"
        icon="⚖"
        value={weight.current.toFixed(1)}
        unit="kg"
        subtitle="30-day trend"
        onPress={() => setDetail('weight')}
      />

      <MetricCard
        title="Fitness Age"
        icon="⌛"
        value={fitnessAgeData ? `${fitnessAgeData.fitnessAge}` : '--'}
        unit="yr"
        subtitle={
          fitnessAgeData
            ? fitnessAgeData.calibrating
              ? `Calibrating · chrono ${fitnessAgeData.chronoAge}`
              : `${fitnessAgeData.fitnessAge - fitnessAgeData.chronoAge >= 0 ? '+' : ''}${
                  fitnessAgeData.fitnessAge - fitnessAgeData.chronoAge
                } yr vs chrono ${fitnessAgeData.chronoAge}`
            : 'Tap for breakdown'
        }
        onPress={() => setDetail('fitnessAge')}
      />

      <View style={{ height: spacing.huge }} />

      {/* Modals — render once, controlled by `detail` */}
      <SimpleMetricDetail
        visible={detail === 'fatigueLoad'}
        onClose={close}
        eyebrow="Effort"
        title="Effort load"
        value={fatigue.current != null ? `${fatigue.current}` : '--'}
        unit="TRIMP · 7d"
        status={fatigue.statusLabel}
        trend={fatigue.trend}
        trendLabels={fatigue.trendLabels}
        trendType="bar"
        trendColor={colors.warning}
        trendTitle="Last 7 days"
        trendEmpty="Log a workout or wear your strap to start your load trend."
        note={
          fatigue.weeklyTarget != null
            ? `Sum of Banister TRIMP over the last 7 days. Your weekly target is ~${fatigue.weeklyTarget} (≈ daily target × 7). Below 50% of target → recovered, 50–100% balanced, 100–130% productive, above that → overreaching.`
            : 'Sum of Banister TRIMP over the last 7 days. Track the trend, not the daily number — consistent yellow/green is the target.'
        }
      />
      <SimpleMetricDetail
        visible={detail === 'trainingStatus'}
        onClose={close}
        eyebrow="Effort"
        title="Training status"
        value={
          trainingStatus.tsb != null
            ? `${trainingStatus.tsb >= 0 ? '+' : ''}${trainingStatus.tsb}`
            : '--'
        }
        status={trainingStatus.label}
        trend={
          today?.effortLoad7Days?.map((d) => Math.round(d.trimp ?? 0)) ?? []
        }
        trendLabels={WEEKDAYS}
        trendType="bar"
        trendColor={colors.sleep}
        trendTitle="Last 7 days TRIMP"
        trendEmpty="Wear your strap and log workouts to start your training-status trend."
        note={
          trainingStatus.calibrating
            ? `Calibrating — needs ≥14 days of TRIMP data. Current fitness (CTL) ${trainingStatus.ctl ?? '--'}, fatigue (ATL) ${trainingStatus.atl ?? '--'}.`
            : `TSB = CTL − ATL. Negative means fatigue exceeds fitness (productive overload around −10 to −30); positive means freshness (rested/peaking). Fitness (CTL) ${trainingStatus.ctl ?? '--'}, fatigue (ATL) ${trainingStatus.atl ?? '--'}.`
        }
      />
      <SimpleMetricDetail
        visible={detail === 'vo2max'}
        onClose={close}
        eyebrow="Fitness"
        title="VO₂ Max"
        value={fitnessAgeData?.vo2max != null ? fitnessAgeData.vo2max.toFixed(1) : '--'}
        unit="ml/kg/min"
        status={
          fitnessAgeData?.vo2max != null
            ? `${(fitnessAgeData.vo2max - fitnessAgeData.popVo2max).toFixed(1)} VS PEER AVG ${fitnessAgeData.popVo2max.toFixed(0)}`
            : 'CALIBRATING'
        }
        trend={fitnessAgeData?.vo2maxHistory.map((p) => p.value) ?? []}
        trendLabels={vo2maxTrendLabels(fitnessAgeData?.vo2maxHistory ?? [])}
        trendType="line"
        trendColor={colors.accent}
        trendTitle="Last 90 days"
        trendEmpty="Run one more sustained ≥10-min effort to start your trend."
        note="Estimated peak aerobic capacity. Each point is one qualifying run, scored via the ACSM running equation scaled by your average HR fraction (avgHR / peakHR) — the same approach Garmin's Firstbeat engine uses, and within ~1 ml/kg/min of Garmin / Strava on the same effort. Run a sustained ≥10-minute hard effort to add a fresh point."
      />
      <SimpleMetricDetail
        visible={detail === 'sleepDuration'}
        onClose={close}
        eyebrow="Sleep"
        title="Sleep duration"
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
        title="Heart rate variability"
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
      <FitnessAgeDetail
        visible={detail === 'fitnessAge'}
        onClose={close}
        data={fitnessAgeData}
      />
    </ScrollView>
  );
}

/**
 * Label only the first and last sample on the VO₂max trend so the axis
 * stays readable when there are 2–10 sparse points spread across 90
 * days. SparkLine renders one tick per value; empty strings hide the
 * intermediate ones without breaking alignment.
 */
function vo2maxTrendLabels(history: Array<{ computedAt: string; value: number }>): string[] {
  if (history.length === 0) return [];
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };
  if (history.length === 1) return [fmt(history[0]!.computedAt)];
  return history.map((p, i) =>
    i === 0 || i === history.length - 1 ? fmt(p.computedAt) : '',
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
