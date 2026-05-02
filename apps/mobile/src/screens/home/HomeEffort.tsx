import { View, Text, StyleSheet } from 'react-native';

/**
 * Home → Effort sub-tab. Slice 1 placeholder — Slice 6 fills it with the
 * effort ring, today's activities list, and the 7-day fatigue/fitness/
 * training-status charts.
 */
export function HomeEffort() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Effort</Text>
      <Text style={styles.placeholder}>
        Effort ring, activity list, and 7-day fatigue/fitness charts land here in Slice 6.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', paddingHorizontal: 16, paddingTop: 24 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 12 },
  placeholder: { fontSize: 14, color: '#6b7280' },
});
