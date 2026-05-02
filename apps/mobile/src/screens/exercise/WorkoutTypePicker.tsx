import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, radii, typography } from '../../theme';

interface Props {
  /** Number of sessions logged for each type — surfaced as a small badge. */
  weeklyCounts: { strength: number; run: number; jiuJitsu: number };
}

interface CardConfig {
  emoji: string;
  label: string;
  sub: string;
  tone: string;
  borderTone: string;
  href: '/workout/strength' | '/workout/run' | '/workout/jiujitsu';
  count: number;
}

/**
 * Polished version of the 3-card workout-type picker. Each card has a
 * tinted dark surface, a coloured left bar, an emoji glyph, the label,
 * a one-line description, and a "X this week" badge so the user gets
 * immediate feedback on what they've already done.
 */
export function WorkoutTypePicker({ weeklyCounts }: Props) {
  const router = useRouter();

  const cards: CardConfig[] = [
    {
      emoji: '🏋️',
      label: 'Strength',
      sub: 'Programs · sets · live HR',
      tone: 'rgba(34, 197, 94, 0.12)',
      borderTone: colors.strength,
      href: '/workout/strength',
      count: weeklyCounts.strength,
    },
    {
      emoji: '🏃',
      label: 'Run',
      sub: 'GPS · pace · elevation',
      tone: 'rgba(59, 130, 246, 0.12)',
      borderTone: colors.run,
      href: '/workout/run',
      count: weeklyCounts.run,
    },
    {
      emoji: '🥋',
      label: 'Jiu-Jitsu',
      sub: 'Timer · live HR · zones',
      tone: 'rgba(168, 85, 247, 0.12)',
      borderTone: colors.jiuJitsu,
      href: '/workout/jiujitsu',
      count: weeklyCounts.jiuJitsu,
    },
  ];

  return (
    <View style={styles.list}>
      {cards.map((c) => (
        <TouchableOpacity
          key={c.label}
          activeOpacity={0.85}
          onPress={() => router.push(c.href)}
          style={[styles.card, { backgroundColor: c.tone, borderLeftColor: c.borderTone }]}
        >
          <Text style={styles.emoji}>{c.emoji}</Text>
          <View style={styles.body}>
            <Text style={styles.label}>{c.label}</Text>
            <Text style={styles.sub}>{c.sub}</Text>
          </View>
          <View style={styles.right}>
            {c.count > 0 ? (
              <View style={[styles.countPill, { backgroundColor: c.borderTone }]}>
                <Text style={styles.countText}>
                  {c.count} this wk
                </Text>
              </View>
            ) : null}
            <Text style={styles.chevron}>›</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  card: {
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    borderLeftWidth: 4,
  },
  emoji: { fontSize: 36 },
  body: { flex: 1 },
  label: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.text,
    marginBottom: 2,
  },
  sub: {
    fontSize: typography.size.xs + 1,
    color: colors.textSecondary,
  },
  right: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  countPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.sm,
  },
  countText: {
    fontSize: typography.size.xs - 1,
    fontWeight: typography.weight.bold,
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  chevron: { fontSize: typography.size.xl, color: colors.textMuted },
});
