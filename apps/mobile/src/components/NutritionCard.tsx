import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import {
  ageYearsFromDob,
  calorieBalance,
  computeBMR,
} from '@openfit/fitness-core';
import { useTodayNutrition } from '../hooks/useTodayNutrition';
import { useDailyStats } from '../hooks/useDailyStats';
import { useAuth } from '../hooks/useAuth';
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
  const { today } = useDailyStats();
  const { user } = useAuth();

  const handleLog = () => router.push('/nutrition/capture');
  const handleEditTargets = () => router.push('/nutrition/targets');
  const handleHistory = () => router.push('/nutrition/history');

  // Calorie balance — intake (sum of today's logs) vs expenditure
  // (BMR prorated to "now" + active calories from the dashboard). Only
  // shown when we have BMR inputs AND at least one logged meal — we want
  // to encourage logging before showing a balance.
  const balance =
    user && logs.length > 0
      ? (() => {
          const bmr = computeBMR({
            weightKg: user.weightKg,
            heightCm: user.heightCm,
            ageYears: ageYearsFromDob(new Date(user.dateOfBirth)),
            sex: user.sex,
          });
          const now = new Date();
          const startOfDay = new Date(now);
          startOfDay.setHours(0, 0, 0, 0);
          const dayFraction =
            (now.getTime() - startOfDay.getTime()) / (24 * 60 * 60 * 1000);
          return calorieBalance({
            intakeKcal: totals.kcal,
            bmrKcal: bmr,
            activeKcal: today?.caloriesActive ?? 0,
            dayFraction,
          });
        })()
      : null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>Nutrition</Text>
          <TouchableOpacity onPress={handleEditTargets} hitSlop={8}>
            <Text style={styles.targetsLink}>
              {targets ? 'Edit targets' : 'Set targets'}
            </Text>
          </TouchableOpacity>
        </View>
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

          {/* Calorie balance pill: intake vs (BMR-prorated + active). */}
          {balance && (
            <View
              style={[
                styles.balancePill,
                balance.balanceKcal >= 0
                  ? styles.balancePillSurplus
                  : styles.balancePillDeficit,
              ]}
            >
              <Text
                style={[
                  styles.balancePillLabel,
                  balance.balanceKcal >= 0
                    ? styles.balancePillLabelSurplus
                    : styles.balancePillLabelDeficit,
                ]}
              >
                {balance.balanceKcal >= 0 ? 'Surplus' : 'Deficit'}
              </Text>
              <Text style={styles.balancePillValue}>
                {balance.balanceKcal >= 0 ? '+' : ''}
                {balance.balanceKcal} kcal
              </Text>
              <Text style={styles.balancePillMeta}>
                in {balance.intakeKcal} · out {balance.expenditureKcal}
              </Text>
            </View>
          )}

          {/* Thumbnail strip of today's meals — photo if present,
              otherwise a labelled placeholder using the first item name. */}
          <View style={styles.thumbsRow}>
            {logs.slice(0, 6).map((l) => (
              <TouchableOpacity
                key={l.id}
                onPress={() => router.push(`/nutrition/log/${l.id}`)}
              >
                {l.photoUrl ? (
                  <AuthedImage path={l.photoUrl} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.thumbFallback]}>
                    <Text style={styles.thumbFallbackText} numberOfLines={2}>
                      {fallbackLabel(l.items[0]?.name)}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      <TouchableOpacity onPress={handleHistory} style={styles.historyLink}>
        <Text style={styles.historyLinkText}>
          View history →
        </Text>
      </TouchableOpacity>
    </View>
  );
}

interface MacroBarProps {
  label: string;
  value: number;
  target: number | null;
  color: string;
}

function fallbackLabel(name: string | undefined): string {
  if (!name || !name.trim()) return 'Meal';
  const trimmed = name.trim();
  return trimmed.length > 16 ? trimmed.slice(0, 15).trimEnd() + '…' : trimmed;
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
  headerLeft: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  title: { fontSize: 16, fontWeight: '700', color: '#111827' },
  targetsLink: { fontSize: 12, color: '#22c55e', fontWeight: '600' },
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
  thumbFallback: {
    backgroundColor: '#ecfdf5',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  thumbFallbackText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#15803d',
    textAlign: 'center',
    lineHeight: 12,
  },
  balancePill: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  balancePillSurplus: { backgroundColor: '#fff7ed' },
  balancePillDeficit: { backgroundColor: '#ecfdf5' },
  balancePillLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  balancePillLabelSurplus: { color: '#c2410c' },
  balancePillLabelDeficit: { color: '#15803d' },
  balancePillValue: { fontSize: 14, fontWeight: '700', color: '#111827' },
  balancePillMeta: { fontSize: 11, color: '#6b7280', marginLeft: 'auto' },
  historyLink: { marginTop: 14, alignItems: 'center', paddingVertical: 4 },
  historyLinkText: { fontSize: 12, color: '#6b7280', fontWeight: '500' },
});
