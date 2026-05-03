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
import { apiClient } from '../../services/api';
import { useDailyStats } from '../../hooks/useDailyStats';
import { HeroRing } from '../../components/HeroRing';
import { AIInsightCard } from '../../components/AIInsightCard';
import { RingExplainerSheet } from '../../components/RingExplainerSheet';
import { SparkLine } from '../../components/charts/SparkLine';
import { SparkBars } from '../../components/charts/SparkBars';
import {
  useMockEffortInsight,
  useMockFatigueLoad,
  useMockFitnessLevel,
  useMockTodayActivities,
  useMockTrainingStatus,
} from '../../mocks';
import { SimpleMetricDetail } from './overview/details/SimpleMetricDetail';
import { DailyActivityDetail } from './effort/DailyActivityDetail';
import { WorkoutDetail, type TodayWorkout } from './effort/WorkoutDetail';
import { colors, spacing, radii, typography } from '../../theme';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

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
  const { today, loading, refetch } = useDailyStats();
  const fatigue = useMockFatigueLoad();
  const fitness = useMockFitnessLevel();
  const trainingStatus = useMockTrainingStatus();
  const insight = useMockEffortInsight();
  const activities = useMockTodayActivities({
    earnedMinutes: today?.effortEarnedMinutes ?? null,
  });

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

  const earned = today?.effortEarnedMinutes ?? null;
  const target = today?.effortTargetMinutes ?? null;
  const score = today?.effortScore ?? null;
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

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={() => {
            refetch();
            fetchTodayWorkouts();
          }}
          tintColor={colors.text}
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
      <AIInsightCard insight={insight} />

      {/* Today's activities */}
      <Text style={styles.sectionLabel}>Today's activities</Text>
      {activities.map((a, i) => {
        const isDaily = a.kind === 'daily';
        const matchedLog =
          !isDaily && a.label
            ? todaysWorkouts.find(
                (l) => (l.session?.name ?? typeNameFor(l.type)) === a.label,
              ) ?? todaysWorkouts[0]
            : null;
        return (
          <TouchableOpacity
            key={i}
            style={[styles.activityRow, !isDaily && styles.activityRowWorkout]}
            activeOpacity={0.85}
            onPress={() => {
              if (isDaily) {
                setDetail('daily');
              } else {
                setActiveWorkout(matchedLog ?? null);
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

      {/* If real workout logs exist beyond the mock activity, surface them. */}
      {todaysWorkouts.length > 1
        ? todaysWorkouts.slice(1).map((l) => (
            <TouchableOpacity
              key={l.id}
              style={[styles.activityRow, styles.activityRowWorkout]}
              activeOpacity={0.85}
              onPress={() => {
                setActiveWorkout(l);
                setDetail('workout');
              }}
            >
              <View style={styles.activityIconWrap}>
                <Text style={styles.activityIcon}>⤬</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.activityLabel}>
                  {l.session?.name ?? typeNameFor(l.type)}
                </Text>
                <Text style={styles.activityTime}>
                  {formatTime(new Date(l.startedAt))}
                </Text>
              </View>
              <Text style={styles.activityDelta}>
                {l.caloriesBurned != null
                  ? `${Math.round(l.caloriesBurned)} kcal`
                  : '—'}
              </Text>
            </TouchableOpacity>
          ))
        : null}

      {/* 7-day series */}
      <Text style={styles.sectionLabel}>Fatigue level — last 7 days</Text>
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => setDetail('fatigue')}
      >
        <SparkLine
          values={fatigue.trend7Days.map((p) => p.value)}
          color={colors.danger}
          labels={WEEKDAYS}
          showValues
          height={140}
        />
      </TouchableOpacity>

      <Text style={styles.sectionLabel}>Fitness level — last 7 days</Text>
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => setDetail('fitness')}
      >
        <SparkLine
          values={fitness.trend7Days.map((p) => p.value)}
          color={colors.info}
          labels={WEEKDAYS}
          showValues
          height={140}
        />
      </TouchableOpacity>

      <Text style={styles.sectionLabel}>Training status — last 7 days</Text>
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => setDetail('trainingStatus')}
      >
        <SparkBars
          values={trainingStatus.trend7Days.map((p) => p.value)}
          color={colors.sleep}
          labels={WEEKDAYS}
          showValues
          height={140}
        />
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
        title="Fatigue level"
        value={`${fatigue.current}`}
        status={fatigue.status.toUpperCase()}
        trend={fatigue.trend7Days.map((p) => p.value)}
        trendLabels={WEEKDAYS}
        trendType="line"
        trendColor={colors.danger}
        note="Acute fatigue index — a rolling sum of recent training stress that decays as you rest. Stays high during heavy weeks, drops fast on rest days."
      />
      <SimpleMetricDetail
        visible={detail === 'fitness'}
        onClose={() => setDetail(null)}
        eyebrow="Effort"
        title="Fitness level"
        value={`${fitness.current}`}
        trend={fitness.trend7Days.map((p) => p.value)}
        trendLabels={WEEKDAYS}
        trendType="line"
        trendColor={colors.info}
        note="Chronic training adaptation — moves slowly, climbs with consistent training, decays slowly when you stop. The diff vs fatigue tells you whether you're peaking or burning out."
      />
      <SimpleMetricDetail
        visible={detail === 'trainingStatus'}
        onClose={() => setDetail(null)}
        eyebrow="Effort"
        title="Training status"
        value={`${trainingStatus.current >= 0 ? '+' : ''}${trainingStatus.current}`}
        status={trainingStatus.label.toUpperCase()}
        trend={trainingStatus.trend7Days.map((p) => p.value)}
        trendLabels={WEEKDAYS}
        trendType="bar"
        trendColor={colors.sleep}
        note="Acute load minus 28-day chronic baseline. Negative = recovering, positive = loading. Aim to stay between −20 and +30 for sustainable progression."
      />
      <DailyActivityDetail
        visible={detail === 'daily'}
        onClose={() => setDetail(null)}
        today={today}
        earnedMinutes={activities[0]?.earnedMinutes ?? 0}
      />
      <WorkoutDetail
        visible={detail === 'workout'}
        onClose={() => {
          setDetail(null);
          setActiveWorkout(null);
        }}
        log={activeWorkout}
        earnedMinutes={activities.find((a) => a.kind === 'workout')?.earnedMinutes}
      />
    </ScrollView>
  );
}

function typeNameFor(t: WorkoutType): string {
  if (t === 'strength') return 'Strength';
  if (t === 'free') return 'Free';
  return 'Run';
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
});
