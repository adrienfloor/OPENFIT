import { View, StyleSheet } from 'react-native';
import { Loader } from './Loader';
import { colors } from '../theme';

/**
 * Full-screen centered loader used by the four Home sub-tabs on the
 * very first render of the app, before any TodayDailyStats payload has
 * landed in the module-level cache. Once data arrives, the cache is
 * populated and this overlay is never shown again — subsequent
 * refetches keep the previous values visible (no spinner flash on the
 * three rings).
 */
export function HomeLoadingOverlay(): React.JSX.Element {
  return (
    <View style={styles.wrap}>
      <Loader size={48} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
});
