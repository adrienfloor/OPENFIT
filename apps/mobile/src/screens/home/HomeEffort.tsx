import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import type { WorkoutType } from '@openfit/types';
import {
  ageYearsFromDob,
  calculateMaxHR,
  effortScore,
} from '@openfit/fitness-core';
import { apiClient } from '../../services/api';
import { useDailyStats } from '../../hooks/useDailyStats';
import { useAuth } from '../../hooks/useAuth';
import { HeroRing } from '../../components/HeroRing';
import { AIInsightCard } from '../../components/AIInsightCard';
import { HomeLoadingOverlay } from '../../components/HomeLoadingOverlay';
import { RingExplainerSheet } from '../../components/RingExplainerSheet';
import { SparkLine } from '../../components/charts/SparkLine';
import { SparkBars } from '../../components/charts/SparkBars';
import { SimpleMetricDetail } from './overview/details/SimpleMetricDetail';
import { DailyActivityDetail } from './effort/DailyActivityDetail';
import { WorkoutDetail, type TodayWorkout } from './effort/WorkoutDetail';
import { colors, spacing, radii, typography, themedRefresh } from '../../theme';

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const weekdayLetter = (d: Date): string => WEEKDAY_LETTERS[d.getDay()]!;

interface ActivityEntry {
  kind: 'daily' | 'workout';
  label: string;
  earnedMinutes: number;
  startTime?: Date;
  endTime?: Date;
  workoutLogId?: string;
}

const TRAINING_STATUS_LABEL: Record<string, string> = {
  detrained: 'Detrained',
  energetic: 'Energetic',
  balanced: 'Balanced',
  optimal: 'Optimal',
  overreaching: 'Overreaching',
};

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

type DetailKey = 'fatigue' | 'fitness' | 'trainingStatus' | 'daily' | 'workout' | null;

/**
 * Home → Effort sub-tab — Slice 6.
 *
 * Tappable per the locked matrix:
 *   • Hero ring → explainer sheet
 *   • AI insight → reasoning sheet
 *   • Daily activity row → DailyActivityDetail modal
 *   • Each workout row → WorkoutDetail modal
 *   • 7-day fatigue / fitness / training-status charts → SimpleMetricDetail
 *
 * Effort score, earned minutes, and target are real
 * (today.effortScore / effortEarnedMinutes / effortTargetMinutes); the
 * 7-day series and today's per-activity breakdown are mocked.
 */
export function HomeEffort() {
  const { today, refetch, hasEverLoaded, healthConnectAvailable, permissionsGranted } = useDailyStats();
  const { user } = useAuth();
  const [pulling, setPulling] = useState(false);

  const [explainerOpen, setExplainerOpen] = useState(false);
  const [detail, setDetail] = useState<DetailKey>(null);
  const [activeWorkout, setActiveWorkout] = useState<TodayWorkout | null>(null);
  const [todaysWorkouts, setTodaysWorkouts] = useState<TodayWorkout[]>([]);

  const fetchTodayWorkouts = useCallback(async () => {
    try {
      const res = await apiClient.get<TodayWorkout[]>('/workouts/logs');
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      setTodaysWorkouts(
        res.data.filter((l) => {
          const completed = l.completedAt
            ? new Date(l.completedAt)
            : new Date(l.startedAt);
          return completed >= startOfToday;
        }),
      );
    } catch {
      // empty state
    }
  }, []);

  useEffect(() => {
    fetchTodayWorkouts();
  }, [fetchTodayWorkouts]);

  const onPullRefresh = async () => {
    setPulling(true);
    try {
      await refetch();
      await fetchTodayWorkouts();
    } finally {
      setPulling(false);
    }
  };

  const earned = today?.effortEarnedMinutes ?? null;
  const target = today?.effortTargetMinutes ?? null;
  const score = today?.effortScore ?? null;

  // Per-workout earned minutes via the same effortScore() used for today's
  // total. The result mirrors what fed today.effortEarnedMinutes — workouts
  // that ran for an hour at moderate intensity will carry most of the budget.
  const restingHR = today?.heartRateResting ?? null;
  const maxHR = user?.dateOfBirth
    ? calculateMaxHR(ageYearsFromDob(new Date(user.dateOfBirth)))
    : null;
  const workoutEarned = todaysWorkouts.map((w) => {
    if (!restingHR || !maxHR || !w.heartRateData?.length) return 0;
    return effortScore({
      samples: w.heartRateData.map((s) => ({
        time: new Date(s.timestamp),
        bpm: s.bpm,
      })),
      restingHR,
      maxHR,
    }).earnedMinutes;
  });
  const totalWorkoutEarned = workoutEarned.reduce((a, b) => a + b, 0);
  const dailyEarned = Math.max(0, (earned ?? 0) - totalWorkoutEarned);

  const activities: ActivityEntry[] = [
    { kind: 'daily', label: 'Daily activity', earnedMinutes: dailyEarned },
    ...todaysWorkouts.map<ActivityEntry>((w, i) => ({
      kind: 'workout',
      label: w.session?.name ?? typeNameFor(w.type),
      earnedMinutes: workoutEarned[i] ?? 0,
      startTime: new Date(w.startedAt),
      endTime: w.completedAt ? new Date(w.completedAt) : undefined,
      workoutLogId: w.id,
    })),
  ];

  // 7-day PMC values: ATL = fatigue, CTL = fitness, TSB = training status.
  const pmcSeries = today?.pmcSeries7Days ?? [];
  const fatigueValues = pmcSeries.map((p) => Math.round(p.atl));
  const fitnessValues = pmcSeries.map((p) => Math.round(p.ctl));
  const tsbValues = pmcSeries.map((p) => Math.round(p.tsb));
  const seriesLabels = pmcSeries.map((p) => weekdayLetter(p.date));

  const fatigueNow = today?.atl != null ? Math.round(today.atl) : null;
  const fitnessNow = today?.ctl != null ? Math.round(today.ctl) : null;
  const tsbNow = today?.tsb != null ? Math.round(today.tsb) : null;
  const tsbTier = today?.trainingStatusTier
    ? TRAINING_STATUS_LABEL[today.trainingStatusTier]
    : null;
  const calibrating = today?.trainingStatusCalibrating ?? true;
  const tier =
    score == null
      ? 'WAITING'
      : score >= 90
        ? 'PEAK'
        : score >= 75
          ? 'PRODUCTIVE'
          : score >= 50
            ? 'BALANCED'
            : 'LIGHT';

  const ringSubtitle =
    earned != null && target != null ? `${earned}/${target} min` : '';

  if (!hasEverLoaded && healthConnectAvailable !== false && permissionsGranted) {
    return <HomeLoadingOverlay />;
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={pulling}
          onRefresh={onPullRefresh}
          {...themedRefresh}
        />
      }
    >
      {/* Hero ring */}
      <View style={styles.heroWrap}>
        <HeroRing
          score={score}
          color={colors.effort}
          tier={tier}
          subtitle={ringSubtitle}
          caption="Effort"
          onPress={() => setExplainerOpen(true)}
        />
      </View>

      {/* AI insight */}
      <AIInsightCard focus="effort" />

      {/* Today's activities */}
      <Text style={styles.sectionLabel}>Today's activities</Text>
      {activities.map((a, i) => {
        const isDaily = a.kind === 'daily';
        const matchedLog = isDaily
          ? null
          : todaysWorkouts.find((l) => l.id === a.workoutLogId) ?? null;
        return (
          <TouchableOpacity
            key={i}
            style={[styles.activityRow, !isDaily && styles.activityRowWorkout]}
            activeOpacity={0.85}
            onPress={() => {
              if (isDaily) {
                setDetail('daily');
              } else {
                setActiveWorkout(matchedLog);
                setDetail('workout');
              }
            }}
          >
            <View style={styles.activityIconWrap}>
              <Text style={styles.activityIcon}>{isDaily ? '◴' : '⤬'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.activityLabel}>{a.label}</Text>
              {a.startTime && a.endTime ? (
                <Text style={styles.activityTime}>
                  {formatTime(a.startTime)} – {formatTime(a.endTime)}
                </Text>
              ) : (
                <Text style={styles.activityTime}>Steps · all day</Text>
              )}
            </View>
            <Text style={styles.activityDelta}>+{a.earnedMinutes}</Text>
          </TouchableOpacity>
        );
      })}

      {/* 7-day series */}
      <Text style={styles.sectionLabel}>Fatigue (ATL) — last 7 days</Text>
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => setDetail('fatigue')}
      >
        {fatigueValues.length > 0 ? (
          <SparkLine
            values={fatigueValues}
            color={colors.danger}
            labels={seriesLabels}
            yAxis
            height={140}
          />
        ) : (
          <Text style={styles.empty}>Calibrating — no PMC history yet.</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.sectionLabel}>Fitness (CTL) — last 7 days</Text>
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => setDetail('fitness')}
      >
        {fitnessValues.length > 0 ? (
          <SparkLine
            values={fitnessValues}
            color={colors.info}
            labels={seriesLabels}
            yAxis
            height={140}
          />
        ) : (
          <Text style={styles.empty}>Calibrating — no PMC history yet.</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.sectionLabel}>Training status (TSB) — last 7 days</Text>
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => setDetail('trainingStatus')}
      >
        {tsbValues.length > 0 ? (
          <SparkBars
            values={tsbValues}
            color={colors.sleep}
            labels={seriesLabels}
            showValues
            height={140}
          />
        ) : (
          <Text style={styles.empty}>Calibrating — no PMC history yet.</Text>
        )}
      </TouchableOpacity>

      <View style={{ height: spacing.huge }} />

      {/* Modals */}
      <RingExplainerSheet
        visible={explainerOpen}
        onClose={() => setExplainerOpen(false)}
        eyebrow="EFFORT"
        title="What is the Effort score?"
        summary={
          'A 0–100 % score that tracks how much intensity-time you’ve ' +
          'banked today against your personalised target.'
        }
        components={[
          {
            label: 'Earned minutes',
            description:
              'Time-weighted by HR zone — minute in zone 4 = 3 points, zone 5 = 4. ' +
              'Steps count too, scaled by zone equivalence.',
          },
          {
            label: 'Personalised target',
            description:
              'Derived from your RHR + HRV + age. A fitter user gets a higher target ' +
              'so 100% always means a meaningful day.',
          },
          {
            label: 'Tier labels',
            description:
              'Light < 50%. Balanced 50–75%. Productive 75–90%. Peak 90–100%.',
          },
        ]}
        footer="The ring caps at 100% but earned minutes can exceed that — useful on big days."
      />

      <SimpleMetricDetail
        visible={detail === 'fatigue'}
        onClose={() => setDetail(null)}
        eyebrow="Effort"
        title="Fatigue (ATL)"
        value={fatigueNow != null ? `${fatigueNow}` : '--'}
        unit="TRIMP · 7d EMA"
        status={
          calibrating ? 'CALIBRATING' : fatigueNow == null ? 'NO DATA' : 'ACTIVE'
        }
        trend={fatigueValues}
        trendLabels={seriesLabels}
        trendType="line"
        trendColor={colors.danger}
        trendEmpty="Wear your HR device and log workouts to start your fatigue trend."
        note="Acute Training Load — 7-day exponentially-weighted average of daily Banister TRIMP. Climbs fast during hard weeks, decays fast during rest. Same metric Zepp surfaces as 'Niveau de fatigue' and TrainingPeaks calls 'fatigue'."
      />
      <SimpleMetricDetail
        visible={detail === 'fitness'}
        onClose={() => setDetail(null)}
        eyebrow="Effort"
        title="Fitness (CTL)"
        value={fitnessNow != null ? `${fitnessNow}` : '--'}
        unit="TRIMP · 42d EMA"
        status={calibrating ? 'CALIBRATING' : fitnessNow == null ? 'NO DATA' : 'ACTIVE'}
        trend={fitnessValues}
        trendLabels={seriesLabels}
        trendType="line"
        trendColor={colors.info}
        trendEmpty="Wear your HR device and log workouts to start your fitness trend."
        note="Chronic Training Load — 42-day exponentially-weighted average of daily Banister TRIMP. Moves slowly. The gap vs fatigue (CTL − ATL = TSB) tells you whether you're peaking or burning out. Same metric Zepp surfaces as 'Niveau de forme'."
      />
      <SimpleMetricDetail
        visible={detail === 'trainingStatus'}
        onClose={() => setDetail(null)}
        eyebrow="Effort"
        title="Training status (TSB)"
        value={tsbNow != null ? `${tsbNow >= 0 ? '+' : ''}${tsbNow}` : '--'}
        status={
          calibrating
            ? 'CALIBRATING'
            : tsbTier
              ? tsbTier.toUpperCase()
              : 'NO DATA'
        }
        trend={tsbValues}
        trendLabels={seriesLabels}
        trendType="bar"
        trendColor={colors.sleep}
        trendEmpty="Wear your HR device and log workouts to start your training-status trend."
        note="Training Stress Balance = CTL − ATL. Positive = freshness (rested / peaking); negative = productive overload (build phase). Tiers map to Zepp's Détendu / Énergique / Équilibré / Optimal / Surchargé."
      />
      <DailyActivityDetail
        visible={detail === 'daily'}
        onClose={() => setDetail(null)}
        today={today}
        earnedMinutes={dailyEarned}
      />
      <WorkoutDetail
        visible={detail === 'workout'}
        onClose={() => {
          setDetail(null);
          setActiveWorkout(null);
        }}
        log={activeWorkout}
        earnedMinutes={
          activeWorkout
            ? activities.find(
                (a) => a.kind === 'workout' && a.workoutLogId === activeWorkout.id,
              )?.earnedMinutes
            : undefined
        }
      />
    </ScrollView>
  );
}

function typeNameFor(t: WorkoutType): string {
  if (t === 'strength') return 'Strength';
  if (t === 'free') return 'Free';
  if (t === 'martial_arts') return 'Martial Arts';
  if (t === 'run') return 'Run';
  if (t === 'bike') return 'Bike';
  if (t === 'swim') return 'Swim';
  if (t === 'hike') return 'Hike';
  if (t === 'walk') return 'Walk';
  return 'Other';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  heroWrap: { alignItems: 'center', marginBottom: spacing.xl },
  sectionLabel: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    fontWeight: typography.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  activityRow: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  activityRowWorkout: {
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
  activityIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityIcon: { fontSize: typography.size.md, color: colors.text },
  activityLabel: {
    fontSize: typography.size.sm + 1,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  activityTime: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  activityDelta: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.accent,
  },
  empty: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
});
