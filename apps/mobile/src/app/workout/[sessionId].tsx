import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useRealtimeHeartRate } from '../../hooks/useRealtimeHeartRate';

export default function ActiveWorkoutScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { sample } = useRealtimeHeartRate();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Active Workout</Text>
      <Text style={styles.sessionId}>Session: {sessionId}</Text>
      {sample && <Text style={styles.hr}>{sample.bpm} bpm - {sample.zone}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb', padding: 24 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
  sessionId: { fontSize: 14, color: '#6b7280', marginBottom: 16 },
  hr: { fontSize: 18, color: '#16a34a', fontWeight: '600' },
});
