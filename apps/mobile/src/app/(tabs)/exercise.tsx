import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { apiClient } from '../../services/api';
import { WorkoutTypePicker } from '../../screens/exercise/WorkoutTypePicker';
import { WeeklySummaryCard } from '../../screens/exercise/WeeklySummaryCard';
import {
  HistoryList,
  type HistoryWorkout,
} from '../../screens/exercise/HistoryList';
import { WorkoutHistoryDetail } from '../../screens/exercise/WorkoutHistoryDetail';
import { colors, spacing, typography } from '../../theme';
import { useScreenTopPadding } from '../../theme/useScreenPadding';

/**
 * Phase 2.5 Slice 7 — Exercise tab.
 *
 * Three sections, top to bottom:
 *   1. Workout-type picker (3 cards). Each card surfaces this week's
 *      session count and routes to the type's start flow.
 *   2. Weekly summary card (sessions / time / kcal / km).
 *   3. History list (filter chips + chronological cards). Tap a row →
 *      WorkoutHistoryDetail modal which lazy-loads the full log
 *      (map for runs, sets table for strength, HR summary).
 *
 * The standalone /(tabs)/history route remains href:null (hidden) since
 * Slice 1; the legacy file is unused but kept until we delete it in a
 * separate cleanup commit.
 */
export default function ExerciseScreen() {
  const [workouts, setWorkouts] = useState<HistoryWorkout[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const topPadding = useScreenTopPadding();

  const fetchData = useCallback(async () => {
    try {
      const res = await apiClient.get<HistoryWorkout[]>('/workouts/logs');
      setWorkouts(res.data);
    } catch {
      // empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Refresh whenever the user navigates back from a finished workout.
  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData]),
  );

  const summary = useMemo(() => computeWeeklySummary(workouts), [workouts]);

  return (
    <ScrollView
      style={[styles.container, { paddingTop: topPadding }]}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={fetchData} tintColor={colors.text} />
      }
    >
      <Text style={styles.title}>Exercise</Text>
      <Text style={styles.subtitle}>Pick a session, see your week, browse history.</Text>

      {/* 1. Workout-type picker */}
      <WorkoutTypePicker weeklyCounts={summary.byType} />

      {/* 2. Weekly summary */}
      <Text style={styles.sectionLabel}>Summary</Text>
      <WeeklySummaryCard
        totalSessions={summary.totalSessions}
        totalDurationSeconds={summary.totalDuration}
        totalCalories={summary.totalCalories}
        totalDistanceMeters={summary.totalDistance}
      />

      {/* 3. History */}
      <Text style={styles.sectionLabel}>History</Text>
      <HistoryList
        workouts={workouts}
        onSelect={(w) => setActiveId(w.id)}
      />

      <View style={{ height: spacing.huge }} />

      <WorkoutHistoryDetail
        visible={activeId !== null}
        onClose={() => setActiveId(null)}
        workoutId={activeId}
      />
    </ScrollView>
  );
}

interface WeeklySummary {
  totalSessions: number;
  totalDuration: number;
  totalCalories: number;
  totalDistance: number;
  byType: { strength: number; run: number; jiuJitsu: number };
}

function computeWeeklySummary(workouts: HistoryWorkout[]): WeeklySummary {
  // Local week — Monday 00:00 to next Monday.
  const start = new Date();
  const day = (start.getDay() + 6) % 7; // Mon=0
  start.setDate(start.getDate() - day);
  start.setHours(0, 0, 0, 0);

  let totalDuration = 0;
  let totalCalories = 0;
  let totalDistance = 0;
  let strength = 0;
  let run = 0;
  let jiuJitsu = 0;
  let totalSessions = 0;

  for (const w of workouts) {
    const startedAt = new Date(w.startedAt);
    if (startedAt < start) continue;
    totalSessions += 1;
    totalDuration += w.durationSeconds ?? 0;
    totalCalories += w.caloriesBurned ?? 0;
    totalDistance += w.distanceMeters ?? 0;
    if (w.type === 'strength') strength += 1;
    else if (w.type === 'run') run += 1;
    else if (w.type === 'jiu_jitsu') jiuJitsu += 1;
  }

  return {
    totalSessions,
    totalDuration,
    totalCalories,
    totalDistance,
    byType: { strength, run, jiuJitsu },
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.lg,
  },
  title: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  sectionLabel: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    fontWeight: typography.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
});
