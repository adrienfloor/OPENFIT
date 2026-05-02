import { View, Text, StyleSheet } from 'react-native';

/**
 * Home → Sleep sub-tab. Slice 1 placeholder — Slice 5 fills it with the
 * sleep score ring, hypnogram, and 7-day sleep trends.
 */
export function HomeSleep() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sleep</Text>
      <Text style={styles.placeholder}>
        Sleep score ring, hypnogram, and 7-day sleep trends land here in Slice 5.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', paddingHorizontal: 16, paddingTop: 24 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 12 },
  placeholder: { fontSize: 14, color: '#6b7280' },
});
