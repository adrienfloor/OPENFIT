import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { HomeOverview } from '../../screens/home/HomeOverview';
import { HomeBioCharge } from '../../screens/home/HomeBioCharge';
import { HomeSleep } from '../../screens/home/HomeSleep';
import { HomeEffort } from '../../screens/home/HomeEffort';
import { colors, spacing, radii, typography } from '../../theme';
import { useScreenTopPadding } from '../../theme/useScreenPadding';

const SUB_TABS = ['Overview', 'BioCharge', 'Sleep', 'Effort'] as const;
type HomeSubTab = (typeof SUB_TABS)[number];

/**
 * Home tab shell. Renders the sub-tab pill bar and one of four sub-tab
 * screens (Overview / BioCharge / Sleep / Effort). Sub-tab selection
 * lives in component state — Slice 1 doesn't need URL persistence.
 */
export default function HomeScreen() {
  const [active, setActive] = useState<HomeSubTab>('Overview');
  const topPadding = useScreenTopPadding();

  return (
    <View style={styles.root}>
      <View style={[styles.tabBarWrap, { paddingTop: topPadding }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBar}
        >
          {SUB_TABS.map((tab) => {
            const selected = tab === active;
            return (
              <TouchableOpacity
                key={tab}
                onPress={() => setActive(tab)}
                style={[styles.pill, selected && styles.pillActive]}
              >
                <Text style={[styles.pillText, selected && styles.pillTextActive]}>
                  {tab}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.body}>
        {active === 'Overview' && <HomeOverview />}
        {active === 'BioCharge' && <HomeBioCharge />}
        {active === 'Sleep' && <HomeSleep />}
        {active === 'Effort' && <HomeEffort />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  tabBarWrap: {
    paddingBottom: spacing.sm,
    backgroundColor: colors.bg,
    borderBottomColor: colors.borderSubtle,
    borderBottomWidth: 1,
  },
  tabBar: { paddingHorizontal: spacing.md, gap: spacing.sm },
  pill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  pillActive: { backgroundColor: colors.text },
  pillText: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
  },
  pillTextActive: { color: colors.bg },
  body: { flex: 1 },
});
