import { View, Text, StyleSheet } from 'react-native';
import { useRealtimeHeartRate } from '../../hooks/useRealtimeHeartRate';

export default function RunScreen() {
  const { sample, isConnected } = useRealtimeHeartRate();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Run</Text>
      <Text style={styles.subtitle}>GPS tracking and heart rate monitoring will appear here.</Text>
      <View style={styles.hrCard}>
        <Text style={styles.hrLabel}>{isConnected ? 'Live HR' : 'No device'}</Text>
        <Text style={styles.hrValue}>{sample ? `${sample.bpm} bpm` : '--'}</Text>
        {sample && <Text style={styles.hrZone}>{sample.zone.replace('_', ' ').toUpperCase()}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#6b7280', textAlign: 'center', paddingHorizontal: 32, marginBottom: 32 },
  hrCard: { backgroundColor: '#fff', borderRadius: 16, padding: 24, alignItems: 'center', width: 180 },
  hrLabel: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
  hrValue: { fontSize: 40, fontWeight: 'bold', color: '#16a34a' },
  hrZone: { fontSize: 11, color: '#9ca3af', marginTop: 4 },
});
