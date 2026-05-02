import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { HomeOverview } from '../../screens/home/HomeOverview';
import { HomeBioCharge } from '../../screens/home/HomeBioCharge';
import { HomeSleep } from '../../screens/home/HomeSleep';
import { HomeEffort } from '../../screens/home/HomeEffort';

const SUB_TABS = ['Overview', 'BioCharge', 'Sleep', 'Effort'] as const;
type HomeSubTab = (typeof SUB_TABS)[number];

/**
 * Home tab shell. Renders the sub-tab pill bar and one of four sub-tab
 * screens (Overview / BioCharge / Sleep / Effort). Sub-tab selection
 * lives in component state — Slice 1 doesn't need URL persistence.
 */
export default function HomeScreen() {
  const [active, setActive] = useState<HomeSubTab>('Overview');

  return (
    <View style={styles.root}>
      <View style={styles.tabBarWrap}>
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
  root: { flex: 1, backgroundColor: '#f9fafb' },
  tabBarWrap: {
    paddingTop: 56,
    paddingBottom: 8,
    backgroundColor: '#f9fafb',
    borderBottomColor: '#e5e7eb',
    borderBottomWidth: 1,
  },
  tabBar: { paddingHorizontal: 12, gap: 8 },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#f3f4f6',
  },
  pillActive: { backgroundColor: '#111827' },
  pillText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  pillTextActive: { color: '#fff' },
  body: { flex: 1 },
});
