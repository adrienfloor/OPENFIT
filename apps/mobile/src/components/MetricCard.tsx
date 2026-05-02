import type { ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { colors, spacing, radii, typography } from '../theme';

interface Props {
  /** Section label / icon line. */
  title: string;
  /** Optional emoji or icon glyph in the header. */
  icon?: string;
  /** Big value rendered next to the title (e.g. "2086"). */
  value: string;
  /** Smaller label next to the value (e.g. "kcal"). */
  unit?: string;
  /** Sub-line under the value (distance, breakdown, etc.). */
  subtitle?: string;
  /** Optional progress bar (0–1). */
  progress?: number;
  progressColor?: string;
  /** Custom slot below the standard layout — for charts / breakdown cards. */
  children?: ReactNode;
  onPress?: () => void;
}

/**
 * Larger Overview block — used for Heart health / Steps / Calories /
 * PAI / Weight cards. The shape mirrors Zepp's stat cards: title row at
 * the top, big number, sub-line, optional progress bar, optional custom
 * footer for inline charts.
 */
export function MetricCard({
  title,
  icon,
  value,
  unit,
  subtitle,
  progress,
  progressColor = colors.accent,
  children,
  onPress,
}: Props) {
  const Wrapper: React.ElementType = onPress ? TouchableOpacity : View;
  return (
    <Wrapper style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.header}>
        {icon ? <Text style={styles.icon}>{icon}</Text> : null}
        <Text style={styles.title}>{title}</Text>
        {onPress ? <Text style={styles.chevron}>›</Text> : null}
      </View>

      <View style={styles.valueRow}>
        <Text style={styles.value}>{value}</Text>
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>

      {progress != null ? (
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${Math.min(100, Math.max(0, progress * 100))}%`,
                backgroundColor: progressColor,
              },
            ]}
          />
        </View>
      ) : null}

      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

      {children}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  icon: { fontSize: typography.size.md },
  title: {
    flex: 1,
    fontSize: typography.size.sm + 1,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chevron: { fontSize: typography.size.lg, color: colors.textMuted },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  value: {
    fontSize: typography.size.display,
    fontWeight: typography.weight.bold,
    color: colors.text,
    lineHeight: 38,
  },
  unit: { fontSize: typography.size.sm, color: colors.textSecondary },
  progressTrack: {
    height: 6,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 3,
    overflow: 'hidden',
    marginVertical: spacing.sm,
  },
  progressFill: { height: '100%' },
  subtitle: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
});
