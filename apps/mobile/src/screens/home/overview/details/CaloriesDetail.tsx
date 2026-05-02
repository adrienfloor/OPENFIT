import { View, Text, StyleSheet } from 'react-native';
import { DetailModal } from '../../../../components/DetailModal';
import {
  ageYearsFromDob,
  bmrCaloriesElapsed,
  computeBMR,
} from '@openfit/fitness-core';
import type { TodayDailyStats } from '../../../../services/healthConnect';
import type { UserProfile } from '@openfit/types';
import { colors, spacing, radii, typography } from '../../../../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  today: TodayDailyStats | null;
  user: Pick<UserProfile, 'weightKg' | 'heightCm' | 'sex' | 'dateOfBirth'> | null;
}

/**
 * Calories drill-in modal. Breaks the day's burn into resting (Mifflin
 * BMR prorated) + active (steps + workouts) and shows the total. The
 * goal is to make the formula visible — Phase 2 lessons taught us that
 * Zepp's number isn't reachable, so transparency beats matching it.
 */
export function CaloriesDetail({ visible, onClose, today, user }: Props) {
  const total = today?.caloriesTotal ?? 0;
  const active = today?.caloriesActive ?? 0;
  const resting = Math.max(0, total - active);

  let bmrPerDay: number | null = null;
  if (user) {
    bmrPerDay = computeBMR({
      weightKg: user.weightKg,
      heightCm: user.heightCm,
      ageYears: ageYearsFromDob(new Date(user.dateOfBirth)),
      sex: user.sex,
    });
  }

  const now = new Date();
  const elapsedRest = bmrPerDay != null ? bmrCaloriesElapsed(bmrPerDay, now) : null;

  return (
    <DetailModal
      visible={visible}
      onClose={onClose}
      eyebrow="Energy"
      title="Calories"
    >
      <View style={styles.hero}>
        <Text style={styles.value}>{Math.round(total)}</Text>
        <Text style={styles.unit}>kcal total today</Text>
      </View>

      <View style={styles.breakdownCard}>
        <BreakdownRow
          label="Resting"
          value={Math.round(resting)}
          tone={colors.warning}
          note={
            elapsedRest != null
              ? `Mifflin BMR prorated to now (${Math.round(elapsedRest)} kcal of full ${Math.round(bmrPerDay!)}/day)`
              : 'Mifflin BMR prorated to now'
          }
        />
        <View style={styles.divider} />
        <BreakdownRow
          label="Active"
          value={Math.round(active)}
          tone={colors.accent}
          note="Steps × 0.04 × weight/68 + Σ HR-derived workout kcal"
        />
      </View>

      <Text style={styles.note}>
        Total = resting + active. Resting is your basal metabolic rate
        scaled to the elapsed fraction of the day; active comes from your
        step count and any workouts you logged with HR data.
      </Text>
    </DetailModal>
  );
}

interface BreakdownRowProps {
  label: string;
  value: number;
  tone: string;
  note: string;
}

function BreakdownRow({ label, value, tone, note }: BreakdownRowProps) {
  return (
    <View>
      <View style={styles.rowLine}>
        <View style={[styles.dot, { backgroundColor: tone }]} />
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value} kcal</Text>
      </View>
      <Text style={styles.rowNote}>{note}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  value: {
    fontSize: 48,
    fontWeight: typography.weight.bold,
    color: colors.text,
    lineHeight: 56,
  },
  unit: { fontSize: typography.size.sm, color: colors.textSecondary, marginTop: spacing.xs },
  breakdownCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  rowLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowLabel: {
    flex: 1,
    fontSize: typography.size.md,
    color: colors.text,
    fontWeight: typography.weight.semibold,
  },
  rowValue: {
    fontSize: typography.size.lg,
    color: colors.text,
    fontWeight: typography.weight.bold,
  },
  rowNote: {
    fontSize: typography.size.xs + 1,
    color: colors.textMuted,
    lineHeight: 18,
    marginLeft: 18,
  },
  divider: { height: 1, backgroundColor: colors.borderSubtle, marginVertical: spacing.md },
  note: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    lineHeight: 22,
  },
});
