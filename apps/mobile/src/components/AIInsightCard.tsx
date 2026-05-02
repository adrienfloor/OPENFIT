import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMockAIInsight } from '../mocks';
import { colors, spacing, radii, typography } from '../theme';

/**
 * AI insight card for Home → Overview.
 *
 * Collapsed: shows the headline + a "Why?" affordance.
 * Tapping opens a bottom-sheet modal with the full body and the model
 * inputs (transparency — same idea as Zepp's BioCharge insights, but
 * we expose the inputs so the user understands what drove it).
 *
 * Currently fed by a mock hook. Slice 9 swaps the source to
 * `/insights/today?focus=overview`.
 */
export function AIInsightCard() {
  const insight = useMockAIInsight();
  const [expanded, setExpanded] = useState(false);
  const insets = useSafeAreaInsets();

  const windowLabel = insight.window === 'morning'
    ? 'Morning brief'
    : insight.window === 'afternoon'
      ? 'Afternoon check-in'
      : 'Evening wind-down';

  return (
    <>
      <TouchableOpacity
        style={styles.card}
        onPress={() => setExpanded(true)}
        activeOpacity={0.85}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>{windowLabel}</Text>
          <Text style={styles.coach}>AI</Text>
        </View>
        <Text style={styles.headline}>{insight.headline}</Text>
        <View style={styles.footer}>
          <Text style={styles.cta}>Why? →</Text>
        </View>
      </TouchableOpacity>

      <Modal
        visible={expanded}
        animationType="slide"
        transparent
        onRequestClose={() => setExpanded(false)}
        statusBarTranslucent
      >
        <View style={styles.backdrop}>
          <TouchableOpacity
            style={styles.backdropClose}
            onPress={() => setExpanded(false)}
          />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.xxl }]}>
            <View style={styles.handle} />
            <Text style={styles.eyebrow}>{windowLabel}</Text>
            <Text style={styles.sheetTitle}>{insight.headline}</Text>
            <Text style={styles.body}>{insight.body}</Text>
            <Text style={styles.inputsLabel}>Based on</Text>
            {insight.inputs.map((input, i) => (
              <Text key={i} style={styles.inputItem}>
                · {input}
              </Text>
            ))}
            <TouchableOpacity
              style={styles.dismissBtn}
              onPress={() => setExpanded(false)}
            >
              <Text style={styles.dismissText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  eyebrow: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    fontWeight: typography.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  coach: {
    fontSize: typography.size.xs,
    color: colors.accent,
    fontWeight: typography.weight.bold,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  headline: {
    fontSize: typography.size.md + 1,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    lineHeight: 22,
  },
  footer: { marginTop: spacing.md },
  cta: {
    fontSize: typography.size.xs + 1,
    color: colors.accent,
    fontWeight: typography.weight.semibold,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  backdropClose: { flex: 1 },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.md,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  sheetTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.text,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  body: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  inputsLabel: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  inputItem: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    paddingVertical: 2,
  },
  dismissBtn: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  dismissText: {
    fontSize: typography.size.md,
    color: colors.text,
    fontWeight: typography.weight.semibold,
  },
});
