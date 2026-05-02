import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import type { CoachSession } from '@openfit/types';
import { adjustSession } from '../services/coach';
import { useDailyStats } from '../hooks/useDailyStats';
import {
  useWorkoutStore,
  type PlannedExerciseSpec,
} from '../stores/workout.store';
import { colors, spacing, radii, typography } from '../theme';

/**
 * Banner shown above the planned-exercise list when:
 *   - the active session was launched from a generated program
 *     (`programId`, `weekNumber`, `sessionIndex` all known)
 *   - no set has been logged yet (we don't trim a list mid-execution)
 *
 * Tapping "Adjust for today" hits `/coach/adjust-session` with today's
 * BioCharge, then swaps the displayed prescription with the rule-engine
 * output. The original prescription is preserved in the store so the user
 * can revert.
 */
export function AdjustForTodayBanner() {
  const {
    programId,
    weekNumber,
    sessionIndex,
    plannedExercises,
    originalPlannedExercises,
    activeExercises,
    applyAdjustedPlan,
    revertAdjustedPlan,
  } = useWorkoutStore();
  const { today } = useDailyStats();

  const [loading, setLoading] = useState(false);
  const [appliedReason, setAppliedReason] = useState<string | null>(null);
  const [appliedMultiplier, setAppliedMultiplier] = useState<number | null>(null);

  const hasSetsLogged = activeExercises.some((a) => a.completedSets.length > 0);
  const fromGeneratedProgram =
    programId !== null && weekNumber !== null && sessionIndex !== null;
  const readiness = today?.recoveryScore ?? null;
  const calibrating = today?.readinessCalibrating ?? false;

  // Don't show on free workouts, unsupported programs, or once the user
  // started lifting — adjusting then is destructive (sets/exercises shift).
  if (!fromGeneratedProgram || hasSetsLogged) return null;

  const handleAdjust = async () => {
    if (programId === null || weekNumber === null || sessionIndex === null) return;
    if (readiness === null) {
      Alert.alert(
        'No readiness yet',
        "We don't have today's BioCharge yet. Open the Today tab to refresh and try again.",
      );
      return;
    }

    setLoading(true);
    try {
      const result = await adjustSession({
        programId,
        weekNumber,
        sessionIndex,
        context: {
          readiness,
          // Backend overrides phase from the stored generation. Sending a
          // valid placeholder satisfies the schema; never trust this client value.
          phase: 'accumulation',
          recentLoad: today?.recentLoad ?? 0,
        },
      });

      const next = mergeAdjustedPlan(plannedExercises, result.session);
      applyAdjustedPlan(next);
      setAppliedReason(result.reason);
      setAppliedMultiplier(result.volumeMultiplier);
    } catch (err) {
      Alert.alert(
        'Could not adjust',
        err instanceof Error ? err.message : 'Try again in a moment.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRevert = () => {
    revertAdjustedPlan();
    setAppliedReason(null);
    setAppliedMultiplier(null);
  };

  if (appliedReason !== null) {
    return (
      <View style={[styles.card, styles.cardApplied]}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.appliedLabel}>Adjusted for today</Text>
            <Text style={styles.appliedReason}>{appliedReason}</Text>
            {appliedMultiplier !== null && appliedMultiplier !== 1 && (
              <Text style={styles.appliedMeta}>
                Volume × {appliedMultiplier.toFixed(2)}
              </Text>
            )}
          </View>
          {originalPlannedExercises !== null && (
            <TouchableOpacity onPress={handleRevert} style={styles.revertBtn}>
              <Text style={styles.revertBtnText}>Revert</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Adjust for today</Text>
          <Text style={styles.caption}>
            {readiness === null
              ? 'BioCharge unavailable — open Today tab to refresh.'
              : calibrating
                ? `BioCharge ${readiness} (calibrating) — proceed at your own discretion.`
                : `BioCharge ${readiness} — modulate volume based on recovery.`}
          </Text>
        </View>
        <TouchableOpacity
          onPress={handleAdjust}
          disabled={loading || readiness === null}
          style={[
            styles.adjustBtn,
            (loading || readiness === null) && styles.adjustBtnDisabled,
          ]}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.adjustBtnText}>Adjust</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

/**
 * Map an adjusted CoachSession (which carries `loadPctOf1RM`, no kg) back
 * onto our PlannedExerciseSpec[] by inheriting kg from the matching original
 * exercise/set. The rule engine only truncates set arrays from the back or
 * appends a duplicate of the last set, so reusing the original kg at
 * `min(j, len-1)` reproduces what the resolver would have computed.
 */
function mergeAdjustedPlan(
  original: PlannedExerciseSpec[],
  adjusted: CoachSession,
): PlannedExerciseSpec[] {
  return adjusted.exercises.map((adj) => {
    const orig = original.find((p) => p.exerciseId === adj.exerciseId);
    const origSets = orig?.sets ?? [];
    return {
      exerciseId: adj.exerciseId,
      exerciseName: orig?.exerciseName ?? adj.exerciseId,
      sets: adj.sets.map((adjSet, j) => {
        const inheritIdx = Math.min(j, Math.max(0, origSets.length - 1));
        const inherited = origSets[inheritIdx];
        return {
          reps: adjSet.reps,
          weight: inherited?.weight ?? null,
          rpe: adjSet.rpe,
          restSeconds: adjSet.restSeconds,
        };
      }),
    };
  });
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: colors.run,
  },
  cardApplied: {
    borderLeftColor: colors.accent,
    backgroundColor: '#f0fdf4',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1d4ed8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  caption: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  adjustBtn: {
    backgroundColor: colors.run,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 72,
    alignItems: 'center',
  },
  adjustBtnDisabled: { backgroundColor: colors.textMuted },
  adjustBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  appliedLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  appliedReason: { fontSize: 13, color: '#166534', lineHeight: 18 },
  appliedMeta: { fontSize: 11, color: colors.accent, marginTop: 4, fontWeight: '600' },
  revertBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
  },
  revertBtnText: { color: colors.accent, fontSize: 12, fontWeight: '700' },
});
