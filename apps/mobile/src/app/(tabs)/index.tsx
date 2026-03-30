import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useDailyStats } from '../../hooks/useDailyStats';
import { useAuthStore } from '../../stores/auth.store';

export default function TodayScreen() {
  const user = useAuthStore((s) => s.user);
  const { today, loading, refetch } = useDailyStats();

  const stats = [
    { label: 'Steps', value: today?.steps?.toLocaleString() ?? '--' },
    { label: 'Active cal', value: today?.caloriesActive ? `${Math.round(today.caloriesActive)} kcal` : '--' },
    { label: 'Resting HR', value: today?.heartRateResting ? `${today.heartRateResting} bpm` : '--' },
    { label: 'HRV', value: today?.hrvRmssd ? `${Math.round(today.hrvRmssd)} ms` : '--' },
    { label: 'Sleep', value: today?.sleepDurationMinutes ? `${Math.round(today.sleepDurationMinutes / 60)}h ${today.sleepDurationMinutes % 60}m` : '--' },
    { label: 'Recovery', value: today?.recoveryScore ? `${Math.round(today.recoveryScore)}%` : '--' },
  ];

  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} />}>
      <Text style={styles.greeting}>Hello, {user?.name ?? 'athlete'}</Text>
      <Text style={styles.date}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
      <View style={styles.grid}>
        {stats.map((stat) => (
          <View key={stat.label} style={styles.card}>
            <Text style={styles.cardLabel}>{stat.label}</Text>
            <Text style={styles.cardValue}>{stat.value}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', paddingHorizontal: 16, paddingTop: 56 },
  greeting: { fontSize: 24, fontWeight: 'bold', marginBottom: 4 },
  date: { fontSize: 14, color: '#6b7280', marginBottom: 24 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { width: '47%', backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  cardLabel: { fontSize: 12, color: '#6b7280', marginBottom: 6 },
  cardValue: { fontSize: 22, fontWeight: '600' },
});
