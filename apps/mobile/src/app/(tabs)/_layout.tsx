import { Tabs } from 'expo-router';
import { colors } from '../../theme';
import {
  HomeIcon,
  ExerciseIcon,
  CoachIcon,
  PreferencesIcon,
} from '../../components/TabIcons';

/**
 * Phase 2.5 tab structure: Home / Exercise / Coach / Preferences.
 * History is reachable from inside Exercise and is registered as a hidden
 * tab route so it doesn't appear in the bottom bar.
 *
 * Icons are inline SVGs (`react-native-svg`) — keeps the look identical
 * across Android versions and avoids a font/native rebuild.
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
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        sceneStyle: { backgroundColor: colors.bg },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <HomeIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="exercise"
        options={{
          title: 'Exercise',
          tabBarIcon: ({ color }) => <ExerciseIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="coach"
        options={{
          title: 'Coach',
          tabBarIcon: ({ color }) => <CoachIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="preferences"
        options={{
          title: 'Preferences',
          tabBarIcon: ({ color }) => <PreferencesIcon color={color} />,
        }}
      />
      <Tabs.Screen name="history" options={{ href: null }} />
    </Tabs>
  );
}
