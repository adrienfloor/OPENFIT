import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import type { WorkoutType } from '@openfit/types';
import { apiClient } from '../../services/api';
import { colors, spacing, radii, typography } from '../../theme';
import { useScreenTopPadding } from '../../theme/useScreenPadding';

interface RecentLog {
  id: string;
  type: WorkoutType;
  startedAt: string;
  completedAt: string | null;
  durationSeconds: number | null;
  caloriesBurned: number | null;
  distanceMeters: number | null;
  session: { name: string } | null;
  exerciseLogs: { completedSets: unknown[] }[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function typeLabel(type: WorkoutType): string {
  if (type === 'strength') return 'Strength';
  if (type === 'jiu_jitsu') return 'Jiu-Jitsu';
  return 'Run';
}

function typeColor(type: WorkoutType): string {
  if (type === 'strength') return colors.strength;
  if (type === 'jiu_jitsu') return colors.jiuJitsu;
  return colors.run;
}

export default function ExerciseScreen() {
  const router = useRouter();
  const [recent, setRecent] = useState<RecentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const topPadding = useScreenTopPadding();

  const fetchRecent = useCallback(async () => {
    try {
      const res = await apiClient.get<RecentLog[]>('/workouts/logs');
      setRecent(res.data.slice(0, 5));
    } catch {
      // empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecent();
  }, [fetchRecent]);

  // Refresh when user navigates back from a child screen.
  useFocusEffect(
    useCallback(() => {
      fetchRecent();
    }, [fetchRecent]),
  );

  return (
    <ScrollView
      style={[styles.container, { paddingTop: topPadding }]}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={fetchRecent} tintColor={colors.text} />
      }
    >
      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Exercise</Text>
          <Text style={styles.subtitle}>Pick a session type to start</Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/history')}
          style={styles.historyBtn}
        >
          <Text style={styles.historyBtnText}>History →</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.pickerGrid}>
        <TouchableOpacity
          style={[styles.pickerCard, { backgroundColor: colors.strength }]}
          onPress={() => router.push('/workout/strength')}
        >
          <Text style={styles.pickerEmoji}>🏋️</Text>
          <Text style={styles.pickerLabel}>Strength</Text>
          <Text style={styles.pickerSub}>Programs & sets</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.pickerCard, { backgroundColor: colors.run }]}
          onPress={() => router.push('/workout/run')}
        >
          <Text style={styles.pickerEmoji}>🏃</Text>
          <Text style={styles.pickerLabel}>Run</Text>
          <Text style={styles.pickerSub}>GPS tracked</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.pickerCard, { backgroundColor: colors.jiuJitsu }]}
          onPress={() => router.push('/workout/jiujitsu')}
        >
          <Text style={styles.pickerEmoji}>🥋</Text>
          <Text style={styles.pickerLabel}>Jiu-Jitsu</Text>
          <Text style={styles.pickerSub}>Timer + HR</Text>
        </TouchableOpacity>
      </View>

      {recent.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent</Text>
          {recent.map((log) => {
            const label = typeLabel(log.type);
            const color = typeColor(log.type);
            const meta =
              log.type === 'strength'
                ? `${log.exerciseLogs.reduce((n, el) => n + el.completedSets.length, 0)} sets`
                : log.type === 'run' && log.distanceMeters
                  ? `${(log.distanceMeters / 1000).toFixed(2)} km`
                  : log.durationSeconds
                    ? formatDuration(log.durationSeconds)
                    : '—';
            return (
              <View key={log.id} style={styles.recentCard}>
                <View style={[styles.recentDot, { backgroundColor: color }]} />
                <View style={styles.recentMain}>
                  <Text style={styles.recentName}>
                    {log.session?.name ?? label}
                  </Text>
                  <Text style={styles.recentDate}>{formatDate(log.startedAt)} · {meta}</Text>
                </View>
                {log.caloriesBurned != null && (
                  <Text style={styles.recentCal}>{Math.round(log.caloriesBurned)} kcal</Text>
                )}
              </View>
            );
          })}
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
  titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xl },
  title: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: { fontSize: typography.size.sm, color: colors.textSecondary },
  historyBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  historyBtnText: {
    fontSize: typography.size.sm,
    color: colors.text,
    fontWeight: typography.weight.semibold,
  },
  pickerGrid: { gap: spacing.md },
  pickerCard: {
    borderRadius: radii.xl,
    padding: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  pickerEmoji: { fontSize: 40 },
  pickerLabel: {
    color: '#fff',
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    flex: 1,
  },
  pickerSub: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: typography.size.xs,
    fontWeight: typography.weight.medium,
  },
  section: { marginTop: spacing.xxxl },
  sectionTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    marginBottom: spacing.md,
    color: colors.textSecondary,
  },
  recentCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md + 2,
    marginBottom: spacing.xs + 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  recentDot: { width: 10, height: 10, borderRadius: 5 },
  recentMain: { flex: 1 },
  recentName: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.text,
  },
  recentDate: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  recentCal: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    fontWeight: typography.weight.medium,
  },
});
