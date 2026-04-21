import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { useDailyStats } from '../../hooks/useDailyStats';
import { useAuth } from '../../hooks/useAuth';

export default function TodayScreen() {
  const { user, logout } = useAuth();
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
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hello, {user?.name ?? 'athlete'}</Text>
          <Text style={styles.date}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
        </View>
        <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>
      </View>
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  greeting: { fontSize: 24, fontWeight: 'bold', marginBottom: 4 },
  date: { fontSize: 14, color: '#6b7280' },
  logoutBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#f3f4f6' },
  logoutText: { fontSize: 13, color: '#6b7280', fontWeight: '500' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { width: '47%', backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  cardLabel: { fontSize: 12, color: '#6b7280', marginBottom: 6 },
  cardValue: { fontSize: 22, fontWeight: '600' },
});
