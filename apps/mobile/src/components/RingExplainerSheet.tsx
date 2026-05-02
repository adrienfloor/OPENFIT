import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, radii, typography } from '../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Section eyebrow (e.g. "BIOCHARGE"). */
  eyebrow: string;
  title: string;
  /** One-line summary at the top. */
  summary: string;
  /** Bulleted "what it's based on" list. */
  components: { label: string; description: string }[];
  /** Optional final paragraph. */
  footer?: string;
}

/**
 * Reusable bottom-sheet explainer for the big rings on the BioCharge /
 * Sleep / Effort sub-tabs. Opens when the user taps the hero ring.
 *
 * Per the locked spec ring taps are explainers (informational), so this
 * is a sheet — not a full-screen DetailModal.
 */
export function RingExplainerSheet({
  visible,
  onClose,
  eyebrow,
  title,
  summary,
  components,
  footer,
}: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropClose} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.xxl }]}>
          <View style={styles.handle} />
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.summary}>{summary}</Text>

          <Text style={styles.componentsLabel}>What it's based on</Text>
          <ScrollView style={{ maxHeight: 320 }}>
            {components.map((c, i) => (
              <View key={i} style={styles.componentRow}>
                <Text style={styles.componentLabel}>{c.label}</Text>
                <Text style={styles.componentDescription}>{c.description}</Text>
              </View>
            ))}
          </ScrollView>

          {footer ? <Text style={styles.footer}>{footer}</Text> : null}

          <TouchableOpacity style={styles.dismissBtn} onPress={onClose}>
            <Text style={styles.dismissText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  eyebrow: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    fontWeight: typography.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.text,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  summary: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  componentsLabel: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    fontWeight: typography.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  componentRow: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  componentLabel: {
    fontSize: typography.size.sm,
    color: colors.text,
    fontWeight: typography.weight.semibold,
    marginBottom: 2,
  },
  componentDescription: {
    fontSize: typography.size.xs + 1,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  footer: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    lineHeight: 22,
    marginTop: spacing.md,
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
