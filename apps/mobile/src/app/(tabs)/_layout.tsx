import { Tabs } from 'expo-router';
import { colors } from '../../theme';

/**
 * Phase 2.5 tab structure: Home / Exercise / Coach / Preferences.
 * History is reachable from inside Exercise and is registered as a hidden
 * tab route so it doesn't appear in the bottom bar.
 */
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        sceneStyle: { backgroundColor: colors.bg },
        headerShown: false,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="exercise" options={{ title: 'Exercise' }} />
      <Tabs.Screen name="coach" options={{ title: 'Coach' }} />
      <Tabs.Screen name="preferences" options={{ title: 'Preferences' }} />
      <Tabs.Screen name="history" options={{ href: null }} />
    </Tabs>
  );
}
