import type { ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { colors, spacing, radii, typography } from '../theme';

interface Props {
  label: string;
  value: string;
  /** Tinted status pill on the right side ("BALANCED" / "OPTIMAL"). */
  status?: { text: string; tone: 'good' | 'warn' | 'bad' | 'neutral' };
  /** Left-side icon glyph or emoji. */
  icon?: ReactNode;
  onPress?: () => void;
}

const TONE_BG: Record<NonNullable<Props['status']>['tone'], string> = {
  good: 'rgba(34, 197, 94, 0.18)',
  warn: 'rgba(245, 158, 11, 0.18)',
  bad: 'rgba(239, 68, 68, 0.18)',
  neutral: 'rgba(96, 165, 250, 0.18)',
};

const TONE_FG: Record<NonNullable<Props['status']>['tone'], string> = {
  good: colors.accent,
  warn: colors.warning,
  bad: colors.danger,
  neutral: colors.sleep,
};

/**
 * Compact row used in the "Base metrics" stack on Home → Overview.
 * Layout matches Zepp's compact stat rows: icon | label | value | tone
 * pill, with a chevron when tappable.
 */
export function MetricRow({ label, value, status, icon, onPress }: Props) {
  const Wrapper: React.ElementType = onPress ? TouchableOpacity : View;
  return (
    <Wrapper
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
      {status ? (
        <View style={[styles.pill, { backgroundColor: TONE_BG[status.tone] }]}>
          <Text style={[styles.pillText, { color: TONE_FG[status.tone] }]}>
            {status.text}
          </Text>
        </View>
      ) : null}
      {onPress ? <Text style={styles.chevron}>›</Text> : null}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  icon: { width: 28, alignItems: 'center' },
  label: {
    flex: 1,
    fontSize: typography.size.sm + 1,
    color: colors.text,
    fontWeight: typography.weight.semibold,
  },
  value: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  pill: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radii.sm,
  },
  pillText: {
    fontSize: typography.size.xs - 1,
    fontWeight: typography.weight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  chevron: { fontSize: typography.size.lg, color: colors.textMuted },
});
