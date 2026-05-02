import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useDialogStore, type DialogButton } from '../stores/dialog.store';
import { colors, spacing, radii, typography } from '../theme';

/**
 * Renders the in-app themed dialog driven by `useDialogStore`. Mounted
 * once at the app root so any screen can call `dialog.alert(...)` and
 * have a consistent dark popup, replacing Android's hardcoded-light
 * Alert.alert.
 */
export function DialogHost() {
  const { visible, title, message, buttons, dismiss } = useDialogStore();

  const handlePress = async (btn: DialogButton) => {
    if (btn.onPress) {
      await btn.onPress();
    }
    dismiss();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={dismiss}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.buttonRow}>
            {buttons.map((b, idx) => (
              <TouchableOpacity
                key={`${b.text}-${idx}`}
                onPress={() => handlePress(b)}
                style={styles.button}
              >
                <Text
                  style={[
                    styles.buttonText,
                    b.style === 'destructive' && styles.buttonTextDanger,
                    b.style === 'cancel' && styles.buttonTextMuted,
                  ]}
                >
                  {b.text}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
  },
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.xxl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  message: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.lg,
    marginTop: spacing.sm,
  },
  button: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  buttonText: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  buttonTextDanger: { color: colors.danger },
  buttonTextMuted: { color: colors.textSecondary },
});
