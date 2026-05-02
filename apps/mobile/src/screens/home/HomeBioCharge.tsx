import { View, Text, StyleSheet } from 'react-native';

/**
 * Home → BioCharge sub-tab. Slice 1 placeholder — Slice 4 fills it with
 * the BioCharge ring, intraday chart, and the 7-day trend cards.
 */
export function HomeBioCharge() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>BioCharge</Text>
      <Text style={styles.placeholder}>
        BioCharge ring, intraday chart, and 7-day trends land here in Slice 4.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', paddingHorizontal: 16, paddingTop: 24 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 12 },
  placeholder: { fontSize: 14, color: '#6b7280' },
});
