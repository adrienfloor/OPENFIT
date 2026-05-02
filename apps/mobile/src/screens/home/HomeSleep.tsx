import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../../theme';

/**
 * Home → Sleep sub-tab. Slice 2 dark conversion — Slice 5 fills it with
 * the sleep score ring, hypnogram, and 7-day sleep trends.
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
