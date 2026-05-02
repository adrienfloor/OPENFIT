import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../../theme';

/**
 * Home → BioCharge sub-tab. Slice 2 dark conversion — Slice 4 fills it
 * with the BioCharge ring, intraday chart, and 7-day trend cards.
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
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
  },
  title: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  placeholder: { fontSize: typography.size.sm, color: colors.textSecondary },
});
