import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FoodLog } from '@openfit/types';
import { sumDayTotals } from '@openfit/fitness-core';
import { listFoodLogs } from '../../services/nutrition';
import { AuthedImage } from '../../components/AuthedImage';
import { colors, spacing, radii, typography } from '../../theme';

/**
 * Past-day browse — groups all FoodLogs by day, newest day first. Tap a
 * meal to open the detail/edit screen. The Today card already covers the
 * current day, so this view starts at "yesterday or earlier" feel.
 *
 * Backed by GET /nutrition/logs over the last 30 days.
 */
export default function HistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [logs, setLogs] = useState<FoodLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [trigger, setTrigger] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const from = new Date();
        from.setDate(from.getDate() - 30);
        from.setHours(0, 0, 0, 0);
        const fetched = await listFoodLogs({ from });
        if (!cancelled) setLogs(fetched);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [trigger]);

  // Refetch on focus so deletes/edits made on the log detail screen are
  // reflected when the user navigates back here.
  useFocusEffect(
    useCallback(() => {
      setTrigger((t) => t + 1);
    }, []),
  );

  const days = groupByDay(logs);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 32 }}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={() => setTrigger((t) => t + 1)}
        />
      }
    >
      <View style={styles.titleRow}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Meal history</Text>
        <View style={{ width: 60 }} />
      </View>

      {!loading && days.length === 0 && (
        <Text style={styles.empty}>
          No meals logged in the last 30 days.
        </Text>
      )}

      {days.map((day) => {
        const dayTotals = sumDayTotals(day.logs);
        return (
          <View key={day.key} style={styles.daySection}>
            <View style={styles.dayHeader}>
              <Text style={styles.dayLabel}>{day.label}</Text>
              <Text style={styles.dayMeta}>
                {dayTotals.kcal} kcal · {day.logs.length} meal
                {day.logs.length !== 1 ? 's' : ''}
              </Text>
            </View>
            {day.logs.map((log) => (
              <TouchableOpacity
                key={log.id}
                style={styles.mealRow}
                onPress={() => router.push(`/nutrition/log/${log.id}`)}
              >
                {log.photoUrl ? (
                  <AuthedImage path={log.photoUrl} style={styles.mealThumb} />
                ) : (
                  <View style={[styles.mealThumb, styles.mealThumbPlaceholder]}>
                    <Text style={styles.mealThumbEmoji}>🍽️</Text>
                  </View>
                )}
                <View style={styles.mealMeta}>
                  <Text style={styles.mealName} numberOfLines={1}>
                    {log.items[0]?.name ?? 'Meal'}
                    {log.items.length > 1 ? ` + ${log.items.length - 1} more` : ''}
                  </Text>
                  <Text style={styles.mealLine}>
                    {log.totals.kcal} kcal · P {Math.round(log.totals.proteinG)}g
                    {' · '}C {Math.round(log.totals.carbsG)}g · F{' '}
                    {Math.round(log.totals.fatG)}g
                  </Text>
                  <Text style={styles.mealTime}>
                    {log.mealType ? capitalize(log.mealType) + ' · ' : ''}
                    {formatTime(log.loggedAt)}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        );
      })}
    </ScrollView>
  );
}

interface DayBucket {
  key: string;
  label: string;
  logs: FoodLog[];
}

function groupByDay(logs: FoodLog[]): DayBucket[] {
  const buckets = new Map<string, FoodLog[]>();
  for (const l of logs) {
    const d = new Date(l.loggedAt);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const arr = buckets.get(key) ?? [];
    arr.push(l);
    buckets.set(key, arr);
  }
  // Already sorted newest-first by the API; group keys preserve that order.
  return [...buckets.entries()].map(([key, arr]) => ({
    key,
    label: dayLabel(new Date(arr[0]!.loggedAt)),
    logs: arr,
  }));
}

function dayLabel(d: Date): string {
  const today = startOfDay(new Date());
  const that = startOfDay(d);
  const diffDays = Math.round(
    (today.getTime() - that.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function formatTime(dt: Date): string {
  return new Date(dt).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: { fontSize: 20, fontWeight: '700' , color: colors.text },
  back: { fontSize: 15, color: colors.accent, fontWeight: '500', minWidth: 60 },
  empty: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 64,
  },
  daySection: { marginBottom: 24 },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  dayLabel: { fontSize: 13, fontWeight: '700', color: colors.text },
  dayMeta: { fontSize: 12, color: colors.textSecondary },
  mealRow: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 10,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mealThumb: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted,
  },
  mealThumbPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  mealThumbEmoji: { fontSize: 24 },
  mealMeta: { flex: 1, gap: 2 },
  mealName: { fontSize: 14, fontWeight: '600', color: colors.text },
  mealLine: { fontSize: 12, color: colors.textSecondary },
  mealTime: { fontSize: 11, color: colors.textMuted },
});
