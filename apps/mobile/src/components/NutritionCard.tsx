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
import { colors, spacing, radii, typography } from '../theme';

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
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm + 2 },
  title: {
    fontSize: typography.size.md + 1,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  targetsLink: {
    fontSize: typography.size.xs + 1,
    color: colors.accent,
    fontWeight: typography.weight.semibold,
  },
  logBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    backgroundColor: colors.accent,
    borderRadius: radii.md,
  },
  logBtnText: {
    color: colors.bg,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  placeholder: {
    fontSize: typography.size.sm,
    color: colors.textMuted,
    paddingVertical: spacing.lg,
    textAlign: 'center',
  },
  totalsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  kcalBlock: { alignItems: 'center', minWidth: 96 },
  kcalValue: {
    fontSize: typography.size.display,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  kcalLabel: { fontSize: typography.size.xs, color: colors.textSecondary, marginTop: 2 },
  macros: { flex: 1, gap: spacing.xs + 2 },
  macroRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  macroLabel: {
    fontSize: typography.size.xs,
    color: colors.text,
    width: 50,
    fontWeight: typography.weight.semibold,
  },
  macroBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 3,
    overflow: 'hidden',
  },
  macroBarFill: { height: '100%' },
  macroValue: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    minWidth: 60,
    textAlign: 'right',
  },
  thumbsRow: { flexDirection: 'row', gap: spacing.xs + 2, marginTop: spacing.md, flexWrap: 'wrap' },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
  },
  thumbFallback: {
    backgroundColor: colors.surfaceRaised,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: colors.accentSoft,
  },
  thumbFallbackText: {
    fontSize: 10,
    fontWeight: typography.weight.semibold,
    color: colors.accent,
    textAlign: 'center',
    lineHeight: 12,
  },
  balancePill: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    marginTop: spacing.md + 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.md,
  },
  balancePillSurplus: { backgroundColor: 'rgba(245, 158, 11, 0.12)' },
  balancePillDeficit: { backgroundColor: 'rgba(34, 197, 94, 0.12)' },
  balancePillLabel: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  balancePillLabelSurplus: { color: colors.warning },
  balancePillLabelDeficit: { color: colors.accent },
  balancePillValue: {
    fontSize: typography.size.sm + 1,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  balancePillMeta: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    marginLeft: 'auto',
  },
  historyLink: { marginTop: spacing.md + 2, alignItems: 'center', paddingVertical: 4 },
  historyLinkText: {
    fontSize: typography.size.xs + 1,
    color: colors.textSecondary,
    fontWeight: typography.weight.medium,
  },
});
