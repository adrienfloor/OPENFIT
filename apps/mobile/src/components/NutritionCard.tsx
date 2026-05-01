import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useTodayNutrition } from '../hooks/useTodayNutrition';
import { AuthedImage } from './AuthedImage';

/**
 * Today-tab nutrition card.
 *
 * Empty state: a "Log a meal" CTA that opens the capture screen.
 * Populated state: today's intake totals, macro target progress bars,
 * and a thumbnail strip of the meals logged so far.
 */
export function NutritionCard() {
  const router = useRouter();
  const { logs, totals, targets, loading } = useTodayNutrition();

  const handleLog = () => router.push('/nutrition/capture');

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Nutrition</Text>
        <TouchableOpacity onPress={handleLog} style={styles.logBtn}>
          <Text style={styles.logBtnText}>+ Log meal</Text>
        </TouchableOpacity>
      </View>

      {loading && logs.length === 0 ? (
        <Text style={styles.placeholder}>Loading…</Text>
      ) : logs.length === 0 ? (
        <Text style={styles.placeholder}>
          No meals logged yet today. Tap "Log meal" to snap a photo.
        </Text>
      ) : (
        <>
          <View style={styles.totalsRow}>
            <View style={styles.kcalBlock}>
              <Text style={styles.kcalValue}>{totals.kcal}</Text>
              <Text style={styles.kcalLabel}>
                {targets ? `/ ${targets.kcal} kcal` : 'kcal'}
              </Text>
            </View>
            <View style={styles.macros}>
              <MacroBar
                label="Protein"
                value={totals.proteinG}
                target={targets?.proteinG ?? null}
                color="#3b82f6"
              />
              <MacroBar
                label="Carbs"
                value={totals.carbsG}
                target={targets?.carbsG ?? null}
                color="#22c55e"
              />
              <MacroBar
                label="Fat"
                value={totals.fatG}
                target={targets?.fatG ?? null}
                color="#f59e0b"
              />
            </View>
          </View>

          {/* Thumbnail strip of today's meal photos. Static preview for v1 —
              a tap-to-edit detail screen is on the polish slice. */}
          {logs.some((l) => l.photoUrl) && (
            <View style={styles.thumbsRow}>
              {logs
                .filter((l) => l.photoUrl)
                .slice(0, 6)
                .map((l) => (
                  <AuthedImage key={l.id} path={l.photoUrl} style={styles.thumb} />
                ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}

interface MacroBarProps {
  label: string;
  value: number;
  target: number | null;
  color: string;
}

function MacroBar({ label, value, target, color }: MacroBarProps) {
  const pct = target && target > 0 ? Math.min(100, (value / target) * 100) : 0;
  return (
    <View style={styles.macroRow}>
      <Text style={styles.macroLabel}>{label}</Text>
      <View style={styles.macroBarTrack}>
        <View
          style={[styles.macroBarFill, { width: `${pct}%`, backgroundColor: color }]}
        />
      </View>
      <Text style={styles.macroValue}>
        {Math.round(value)}
        {target ? `/${target}` : ''}g
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: { fontSize: 16, fontWeight: '700', color: '#111827' },
  logBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#22c55e',
    borderRadius: 8,
  },
  logBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  placeholder: {
    fontSize: 13,
    color: '#9ca3af',
    paddingVertical: 16,
    textAlign: 'center',
  },
  totalsRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  kcalBlock: { alignItems: 'center', minWidth: 96 },
  kcalValue: { fontSize: 32, fontWeight: '700', color: '#111827' },
  kcalLabel: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  macros: { flex: 1, gap: 6 },
  macroRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  macroLabel: {
    fontSize: 11,
    color: '#374151',
    width: 50,
    fontWeight: '600',
  },
  macroBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: '#f3f4f6',
    borderRadius: 3,
    overflow: 'hidden',
  },
  macroBarFill: { height: '100%' },
  macroValue: {
    fontSize: 11,
    color: '#6b7280',
    minWidth: 60,
    textAlign: 'right',
  },
  thumbsRow: { flexDirection: 'row', gap: 6, marginTop: 12, flexWrap: 'wrap' },
  thumb: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#f3f4f6' },
});
