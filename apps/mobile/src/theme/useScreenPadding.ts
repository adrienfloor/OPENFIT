import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from './index';

/**
 * Standard top padding for full-screen views: status-bar inset + a small
 * gap so headers aren't kissed by the gesture pill / notch. Replaces the
 * hardcoded `paddingTop: 56` scattered across screens. Use as
 * `paddingTop: useScreenTopPadding()` in a screen root container.
 */
export function useScreenTopPadding(extra = spacing.sm): number {
  const insets = useSafeAreaInsets();
  return insets.top + extra;
}

/**
 * Bottom padding to clear the home indicator / gesture pill on devices
 * where the system bar overlaps content (Samsung gesture-bar pill).
 */
export function useScreenBottomPadding(extra = 0): number {
  const insets = useSafeAreaInsets();
  return insets.bottom + extra;
}
