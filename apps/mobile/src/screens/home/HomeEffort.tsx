import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../../theme';

/**
 * Home → Effort sub-tab. Slice 2 dark conversion — Slice 6 fills it with
 * the effort ring, today's activities list, and the 7-day fatigue/
 * fitness/training-status charts.
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
