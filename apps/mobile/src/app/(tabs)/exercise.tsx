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
  if (type === 'strength') return '#22c55e';
  if (type === 'jiu_jitsu') return '#a855f7';
  return '#3b82f6';
}

export default function ExerciseScreen() {
  const router = useRouter();
  const [recent, setRecent] = useState<RecentLog[]>([]);
  const [loading, setLoading] = useState(true);

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
      style={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchRecent} />}
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
          style={[styles.pickerCard, { backgroundColor: '#22c55e' }]}
          onPress={() => router.push('/workout/strength')}
        >
          <Text style={styles.pickerEmoji}>🏋️</Text>
          <Text style={styles.pickerLabel}>Strength</Text>
          <Text style={styles.pickerSub}>Programs & sets</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.pickerCard, { backgroundColor: '#3b82f6' }]}
          onPress={() => router.push('/workout/run')}
        >
          <Text style={styles.pickerEmoji}>🏃</Text>
          <Text style={styles.pickerLabel}>Run</Text>
          <Text style={styles.pickerSub}>GPS tracked</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.pickerCard, { backgroundColor: '#a855f7' }]}
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
  container: { flex: 1, backgroundColor: '#f9fafb', paddingHorizontal: 16, paddingTop: 56 },
  titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#6b7280' },
  historyBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  historyBtnText: { fontSize: 13, color: '#374151', fontWeight: '600' },
  pickerGrid: { gap: 12 },
  pickerCard: { borderRadius: 16, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16 },
  pickerEmoji: { fontSize: 40 },
  pickerLabel: { color: '#fff', fontSize: 20, fontWeight: '700', flex: 1 },
  pickerSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '500' },
  section: { marginTop: 32 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12, color: '#374151' },
  recentCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  recentDot: { width: 10, height: 10, borderRadius: 5 },
  recentMain: { flex: 1 },
  recentName: { fontSize: 14, fontWeight: '500' },
  recentDate: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  recentCal: { fontSize: 13, color: '#6b7280', fontWeight: '500' },
});
