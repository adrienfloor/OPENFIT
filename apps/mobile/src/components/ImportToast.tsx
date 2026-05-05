import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useImportEventsStore } from '../stores/importEvents.store';
import { colors, spacing, radii, typography } from '../theme';

const VISIBLE_MS = 2_800;
const FADE_MS = 200;

/**
 * Tiny in-app toast for "Imported N workouts from X" notices fired by
 * the Health-Connect auto-importer. Mounted once at the root layout —
 * subscribes to `useImportEventsStore.toast` and animates fade-in /
 * out on every new payload.
 *
 * No queue: a second import while one's still on-screen replaces the
 * message and resets the timer. In practice imports cluster (same
 * AppState transition usually surfaces 0 or 1 new sessions), so a
 * queued list would be over-engineering.
 */
export function ImportToast() {
  const toast = useImportEventsStore((s) => s.toast);
  const dismiss = useImportEventsStore((s) => s.dismissToast);
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!toast) return;
    const fadeIn = Animated.timing(opacity, {
      toValue: 1,
      duration: FADE_MS,
      useNativeDriver: true,
    });
    const fadeOut = Animated.timing(opacity, {
      toValue: 0,
      duration: FADE_MS,
      useNativeDriver: true,
    });

    fadeIn.start();
    const timeout = setTimeout(() => {
      fadeOut.start(({ finished }) => {
        if (finished) dismiss();
      });
    }, VISIBLE_MS);

    return () => {
      clearTimeout(timeout);
      fadeIn.stop();
      fadeOut.stop();
    };
  }, [toast?.key, toast, opacity, dismiss]);

  if (!toast) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.container,
        { opacity, top: insets.top + spacing.md },
      ]}
    >
      <View style={styles.pill}>
        <Text style={styles.text}>{toast.message}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1000,
  },
  pill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: '90%',
  },
  text: {
    color: colors.text,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
});
