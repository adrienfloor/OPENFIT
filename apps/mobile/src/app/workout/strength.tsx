import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  RefreshControl,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { apiClient } from '../../services/api';
import {
  useWorkoutStore,
  type PlannedExerciseSpec,
} from '../../stores/workout.store';
import { useAuthStore } from '../../stores/auth.store';
import { useRealtimeHeartRate } from '../../hooks/useRealtimeHeartRate';
import { useRestTimer } from '../../hooks/useRestTimer';
import { formatDuration, calculateAge } from '../../utils';
import {
  calculateMaxHR,
  computeCaloriesFromHRSamples,
  ageYearsFromDob,
} from '@openfit/fitness-core';

interface Exercise {
  id: string;
  name: string;
  muscleGroups: string[];
  equipment: string;
}

interface PlannedSet {
  setIndex: number;
  reps: number;
  weight: number | null;
  rpe: number | null;
  restSeconds: number;
}

interface PlannedExercise {
  exercise: Exercise;
  orderIndex: number;
  sets: PlannedSet[];
}

interface Session {
  id: string;
  name: string;
  plannedExercises: PlannedExercise[];
}

interface Week {
  weekNumber: number;
  sessions: Session[];
}

interface Program {
  id: string;
  name: string;
  weeks: Week[];
}

interface RecentLog {
  id: string;
  startedAt: string;
  session: { name: string } | null;
  exerciseLogs: { completedSets: unknown[] }[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function HeartRateCard({ maxHR, onSamplesRef }: { maxHR: number; onSamplesRef: React.MutableRefObject<() => Array<{ timestamp: Date; bpm: number; zone: string }>> }) {
  const { bpm, zone, connectionState, samples } = useRealtimeHeartRate(maxHR);

  // Expose samples getter to parent
  onSamplesRef.current = () => samples;

  const stateLabel =
    connectionState === 'scanning' ? 'Scanning for HR strap...' :
    connectionState === 'connecting' ? 'Connecting...' :
    connectionState === 'connected' ? 'Connected' :
    connectionState === 'error' ? 'Connection failed' :
    connectionState === 'disconnected' ? 'Disconnected' :
    'Waiting...';

  return (
    <View style={styles.hrCard}>
      <View style={styles.hrCardLeft}>
        <Text style={styles.hrBpm}>{bpm ?? '--'}</Text>
        <Text style={styles.hrUnit}>bpm</Text>
      </View>
      <View style={styles.hrCardRight}>
        {zone && <Text style={styles.hrZone}>{zone.replace('_', ' ').toUpperCase()}</Text>}
        <Text style={styles.hrState}>{stateLabel}</Text>
      </View>
    </View>
  );
}

export default function WorkoutScreen() {
  const router = useRouter();
  const {
    isActive,
    startedAt,
    activeExercises,
    plannedExercises,
    sessionName,
    startWorkout,
    addSet,
    swapExercise,
    finishWorkout,
    sessionId,
  } = useWorkoutStore();
  const [swapTarget, setSwapTarget] = useState<{ index: number; exercise: PlannedExerciseSpec } | null>(null);
  const user = useAuthStore((s) => s.user);
  const hrSamplesRef = useRef<() => Array<{ timestamp: Date; bpm: number; zone: string }>>(() => []);
  const restTimer = useRestTimer();

  const [programs, setPrograms] = useState<Program[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [recentLogs, setRecentLogs] = useState<RecentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);

  // Free-workout exercise picker (only used when no plan).
  const [currentExercise, setCurrentExercise] = useState<Exercise | null>(null);
  // Free-workout set inputs (separate from the per-set planned inputs).
  const [reps, setReps] = useState('');
  const [weight, setWeight] = useState('');
  const [rpe, setRpe] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [progRes, exRes, logsRes] = await Promise.all([
        apiClient.get<Program[]>('/workouts/programs'),
        apiClient.get<Exercise[]>('/workouts/exercises'),
        apiClient.get<RecentLog[]>('/workouts/logs'),
      ]);
      setPrograms(progRes.data);
      setExercises(exRes.data);
      setRecentLogs(logsRes.data.slice(0, 5));
    } catch {
      // empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleStartFreeWorkout = () => {
    startWorkout(null, null, []);
  };

  const handleStartSession = (session: Session) => {
    const planned: PlannedExerciseSpec[] = session.plannedExercises.map((pe) => ({
      exerciseId: pe.exercise.id,
      exerciseName: pe.exercise.name,
      sets: pe.sets.map((s) => ({
        reps: s.reps,
        weight: s.weight,
        rpe: s.rpe,
        restSeconds: s.restSeconds,
      })),
    }));
    startWorkout(session.id, session.name, planned);
    if (session.plannedExercises.length > 0) {
      setCurrentExercise(session.plannedExercises[0]!.exercise);
    }
  };

  const handleLogSet = () => {
    if (!currentExercise) return;
    const r = parseInt(reps, 10);
    const w = parseFloat(weight);
    if (isNaN(r) || r <= 0 || isNaN(w) || w < 0) {
      Alert.alert('Invalid input', 'Enter valid reps and weight.');
      return;
    }

    const rpeVal = rpe ? parseFloat(rpe) : null;
    addSet(currentExercise.id, currentExercise.name, {
      reps: r,
      weight: w,
      rpe: rpeVal,
      restTaken: 0,
    });

    setReps('');
    setWeight('');
    setRpe('');
  };

  const handleFinish = async () => {
    if (activeExercises.length === 0) {
      Alert.alert('No sets logged', 'Log at least one set before finishing.');
      return;
    }

    const hrSamples = hrSamplesRef.current();
    const now = new Date();
    const durationSeconds = Math.round((now.getTime() - startedAt!.getTime()) / 1000);
    const caloriesBurned =
      user && hrSamples.length > 0
        ? computeCaloriesFromHRSamples({
            samples: hrSamples.map((s) => ({ timestamp: s.timestamp, bpm: s.bpm })),
            weightKg: user.weightKg,
            ageYears: ageYearsFromDob(new Date(user.dateOfBirth)),
            sex: user.sex,
          })
        : null;

    const payload = {
      type: 'strength' as const,
      sessionId: sessionId ?? undefined,
      startedAt: startedAt!.toISOString(),
      completedAt: now.toISOString(),
      durationSeconds,
      caloriesBurned,
      exerciseLogs: activeExercises.map((ae) => ({
        exerciseId: ae.exerciseId,
        sets: ae.completedSets.map((s, idx) => ({
          setIndex: idx,
          reps: s.reps,
          weight: s.weight,
          rpe: s.rpe,
          restTaken: s.restTaken,
        })),
      })),
      heartRateSamples: hrSamples.length > 0
        ? hrSamples.map((s) => ({
            timestamp: s.timestamp.toISOString(),
            bpm: s.bpm,
            zone: s.zone,
          }))
        : undefined,
    };

    try {
      await apiClient.post('/workouts/logs', payload);
      const totalSets = activeExercises.reduce((sum, e) => sum + e.completedSets.length, 0);
      const calText = caloriesBurned ? ` · ${Math.round(caloriesBurned)} kcal` : '';
      Alert.alert('Workout saved', `${activeExercises.length} exercises, ${totalSets} sets${calText}`);
    } catch {
      Alert.alert('Saved locally', 'Will sync when back online.');
    }

    finishWorkout();
    setCurrentExercise(null);
    setSelectedProgram(null);
    router.back();
  };

  // Live timer that ticks every second
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!isActive || !startedAt) {
      setElapsed(0);
      return;
    }
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt.getTime()) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [isActive, startedAt]);

  const handleCancel = () => {
    Alert.alert('Cancel workout?', 'Your logged sets will be lost.', [
      { text: 'Keep going', style: 'cancel' },
      {
        text: 'Cancel',
        style: 'destructive',
        onPress: () => {
          finishWorkout();
          setCurrentExercise(null);
          setSelectedProgram(null);
        },
      },
    ]);
  };

  const maxHR = user?.dateOfBirth ? calculateMaxHR(calculateAge(new Date(user.dateOfBirth))) : 190;

  // Active workout view
  if (isActive) {
    const totalSetsLogged = activeExercises.reduce((sum, e) => sum + e.completedSets.length, 0);
    const totalSetsPlanned = plannedExercises.reduce((sum, e) => sum + e.sets.length, 0);
    const hasPlan = plannedExercises.length > 0;

    return (
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <TouchableOpacity onPress={handleCancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <View style={{ alignItems: 'center', flex: 1 }}>
            {sessionName && (
              <Text style={styles.sessionTitle} numberOfLines={1}>
                {sessionName}
              </Text>
            )}
            <Text style={styles.elapsed}>{formatDuration(elapsed)}</Text>
          </View>
          {hasPlan ? (
            <View style={styles.progressPill}>
              <Text style={styles.progressPillText}>
                {totalSetsLogged}/{totalSetsPlanned}
              </Text>
            </View>
          ) : (
            <View style={{ width: 50 }} />
          )}
        </View>

        {/* Live heart rate */}
        <HeartRateCard maxHR={maxHR} onSamplesRef={hrSamplesRef} />

        {/* Rest timer — only visible while a rest is in flight or just-finished */}
        {restTimer.isRunning || (restTimer.totalSeconds > 0 && restTimer.remainingSeconds === 0) ? (
          <RestTimerCard timer={restTimer} />
        ) : null}

        {hasPlan ? (
          <PlannedExercisesList
            plannedExercises={plannedExercises}
            activeExercises={activeExercises}
            allExercises={exercises}
            onLogSet={(exerciseId, exerciseName, set, restSeconds) => {
              addSet(exerciseId, exerciseName, set);
              if (restSeconds > 0) restTimer.start(restSeconds);
            }}
            onRequestSwap={(index, exercise) => setSwapTarget({ index, exercise })}
          />
        ) : (
          <FreeWorkoutInput
            exercises={exercises}
            currentExercise={currentExercise}
            setCurrentExercise={setCurrentExercise}
            reps={reps}
            setReps={setReps}
            weight={weight}
            setWeight={setWeight}
            rpe={rpe}
            setRpe={setRpe}
            onLogSet={handleLogSet}
            activeExercises={activeExercises}
            totalSets={totalSetsLogged}
          />
        )}

        <TouchableOpacity style={styles.finishBtn} onPress={handleFinish}>
          <Text style={styles.finishBtnText}>Finish Workout</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />

        <SwapExerciseModal
          target={swapTarget}
          allExercises={exercises}
          onClose={() => setSwapTarget(null)}
          onPick={(newEx) => {
            if (swapTarget) swapExercise(swapTarget.index, newEx.id, newEx.name);
            setSwapTarget(null);
          }}
        />
      </ScrollView>
    );
  }

  // Program selection / start view
  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} />}
    >
      <View style={styles.titleRow}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Strength</Text>
        <View style={{ width: 50 }} />
      </View>

      <TouchableOpacity style={styles.startFreeBtn} onPress={handleStartFreeWorkout}>
        <Text style={styles.startFreeBtnText}>Start Free Workout</Text>
      </TouchableOpacity>

      {programs.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Programs</Text>
          {programs.map((prog) => (
            <View key={prog.id}>
              <TouchableOpacity
                style={styles.programCard}
                onPress={() => setSelectedProgram(selectedProgram?.id === prog.id ? null : prog)}
              >
                <Text style={styles.programName}>{prog.name}</Text>
                <Text style={styles.programMeta}>
                  {prog.weeks.length} week{prog.weeks.length !== 1 ? 's' : ''}
                </Text>
              </TouchableOpacity>

              {selectedProgram?.id === prog.id &&
                prog.weeks.map((week) => (
                  <View key={week.weekNumber} style={styles.weekSection}>
                    <Text style={styles.weekLabel}>Week {week.weekNumber}</Text>
                    {week.sessions.map((session) => (
                      <TouchableOpacity
                        key={session.id}
                        style={styles.sessionCard}
                        onPress={() => handleStartSession(session)}
                      >
                        <Text style={styles.sessionName}>{session.name}</Text>
                        <Text style={styles.sessionMeta}>
                          {session.plannedExercises.length} exercise
                          {session.plannedExercises.length !== 1 ? 's' : ''} &rarr;
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ))}
            </View>
          ))}
        </View>
      )}

      {programs.length === 0 && !loading && (
        <Text style={styles.emptyText}>No programs yet. Start a free workout or create a program on the web dashboard.</Text>
      )}

      {/* Recent workouts */}
      {recentLogs.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent workouts</Text>
          {recentLogs.map((log) => {
            const sets = log.exerciseLogs.reduce((sum, el) => sum + el.completedSets.length, 0);
            return (
              <View key={log.id} style={styles.recentCard}>
                <View>
                  <Text style={styles.recentName}>{log.session?.name ?? 'Free workout'}</Text>
                  <Text style={styles.recentDate}>{formatDate(log.startedAt)}</Text>
                </View>
                <Text style={styles.recentSets}>{sets} sets</Text>
              </View>
            );
          })}
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Rest timer card — shown only while resting. Editable: ±15s, ±30s, and a
// long-press shortcut. Tap "Skip" to dismiss.
// ──────────────────────────────────────────────────────────────────────────

function RestTimerCard({ timer }: { timer: ReturnType<typeof useRestTimer> }) {
  const remaining = timer.remainingSeconds;
  const total = Math.max(1, timer.totalSeconds);
  const pct = Math.min(100, Math.round(((total - remaining) / total) * 100));
  const finished = remaining === 0 && total > 0;
  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;

  return (
    <View style={[styles.restCard, finished && styles.restCardFinished]}>
      <View style={styles.restHeader}>
        <Text style={styles.restLabel}>{finished ? 'Rest complete' : 'Rest'}</Text>
        <TouchableOpacity onPress={timer.skip}>
          <Text style={styles.restSkip}>{finished ? 'Dismiss' : 'Skip'}</Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.restTime, finished && styles.restTimeFinished]}>
        {mm}:{ss.toString().padStart(2, '0')}
      </Text>
      <View style={styles.restProgress}>
        <View style={[styles.restProgressFill, { width: `${pct}%` }]} />
      </View>
      <View style={styles.restAdjustRow}>
        <TouchableOpacity style={styles.restAdjustBtn} onPress={() => timer.adjust(-30)}>
          <Text style={styles.restAdjustText}>−30s</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.restAdjustBtn} onPress={() => timer.adjust(-15)}>
          <Text style={styles.restAdjustText}>−15s</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.restAdjustBtn} onPress={() => timer.adjust(15)}>
          <Text style={styles.restAdjustText}>+15s</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.restAdjustBtn} onPress={() => timer.adjust(30)}>
          <Text style={styles.restAdjustText}>+30s</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Planned exercises list — vertical scroll of exercise cards. Each card
// shows the prescribed sets with state pending / current / completed. The
// next pending set in the first incomplete exercise is the "current" one;
// tapping a different card focuses it instead.
// ──────────────────────────────────────────────────────────────────────────

interface PlannedListProps {
  plannedExercises: PlannedExerciseSpec[];
  activeExercises: { exerciseId: string; exerciseName: string; completedSets: { reps: number; weight: number; rpe: number | null; restTaken: number }[] }[];
  allExercises: Exercise[];
  onLogSet: (
    exerciseId: string,
    exerciseName: string,
    set: { reps: number; weight: number; rpe: number | null; restTaken: number },
    restSeconds: number,
  ) => void;
  onRequestSwap: (index: number, exercise: PlannedExerciseSpec) => void;
}

function PlannedExercisesList({
  plannedExercises,
  activeExercises,
  allExercises,
  onLogSet,
  onRequestSwap,
}: PlannedListProps) {
  // Index of the auto-focused exercise: the first one that still has pending sets.
  const autoFocusIndex = useMemo(() => {
    for (let i = 0; i < plannedExercises.length; i++) {
      const planned = plannedExercises[i] as PlannedExerciseSpec;
      const done = activeExercises.find((a) => a.exerciseId === planned.exerciseId)?.completedSets.length ?? 0;
      if (done < planned.sets.length) return i;
    }
    return plannedExercises.length - 1;
  }, [plannedExercises, activeExercises]);

  // Manual focus override — null means follow auto-focus.
  const [manualFocus, setManualFocus] = useState<number | null>(null);
  const focusIndex = manualFocus ?? autoFocusIndex;

  return (
    <View>
      {plannedExercises.map((ex, idx) => {
        const completed =
          activeExercises.find((a) => a.exerciseId === ex.exerciseId)?.completedSets ?? [];
        const isFocused = idx === focusIndex;

        const canSwap = completed.length === 0;
        return (
          <PlannedExerciseCard
            key={`${ex.exerciseId}-${idx}`}
            planned={ex}
            completed={completed}
            isFocused={isFocused}
            onFocus={() => setManualFocus(idx === manualFocus ? null : idx)}
            canSwap={canSwap}
            onSwapPress={() => onRequestSwap(idx, ex)}
            onLogSet={(set, restSeconds) => {
              onLogSet(ex.exerciseId, ex.exerciseName, set, restSeconds);
              // Once this exercise's sets are all done, auto-focus advances.
              if (completed.length + 1 >= ex.sets.length) setManualFocus(null);
            }}
          />
        );
      })}
    </View>
  );
}

interface PlannedCardProps {
  planned: PlannedExerciseSpec;
  completed: { reps: number; weight: number; rpe: number | null; restTaken: number }[];
  isFocused: boolean;
  onFocus: () => void;
  canSwap: boolean;
  onSwapPress: () => void;
  onLogSet: (
    set: { reps: number; weight: number; rpe: number | null; restTaken: number },
    restSeconds: number,
  ) => void;
}

function PlannedExerciseCard({
  planned,
  completed,
  isFocused,
  onFocus,
  canSwap,
  onSwapPress,
  onLogSet,
}: PlannedCardProps) {
  const currentSetIndex = completed.length;
  const isDone = currentSetIndex >= planned.sets.length;
  const currentSpec = !isDone ? planned.sets[currentSetIndex] : null;

  // Inputs are pre-filled from the prescription when the current set is shown.
  // We re-key the inputs by setIndex so values reset between sets.
  const [reps, setReps] = useState('');
  const [weight, setWeight] = useState('');
  const [rpe, setRpe] = useState('');
  useEffect(() => {
    if (currentSpec) {
      setReps(String(currentSpec.reps));
      setWeight(currentSpec.weight != null ? String(currentSpec.weight) : '');
      setRpe(currentSpec.rpe != null ? String(currentSpec.rpe) : '');
    }
  }, [currentSpec, currentSetIndex]);

  const handleLog = () => {
    if (!currentSpec) return;
    const r = parseInt(reps, 10);
    const w = parseFloat(weight);
    if (isNaN(r) || r <= 0 || isNaN(w) || w < 0) {
      Alert.alert('Invalid input', 'Enter valid reps and weight.');
      return;
    }
    const rpeVal = rpe ? parseFloat(rpe) : null;
    onLogSet(
      { reps: r, weight: w, rpe: rpeVal, restTaken: 0 },
      currentSpec.restSeconds,
    );
  };

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onFocus}
      style={[styles.exCard, isFocused && styles.exCardFocused, isDone && styles.exCardDone]}
    >
      <View style={styles.exHeader}>
        <Text style={[styles.exName, isDone && styles.exNameDone]}>{planned.exerciseName}</Text>
        {canSwap && (
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              onSwapPress();
            }}
            style={styles.swapBtn}
            hitSlop={8}
          >
            <Text style={styles.swapBtnText}>Swap</Text>
          </TouchableOpacity>
        )}
        <View style={[styles.exProgress, isDone && styles.exProgressDone]}>
          <Text style={[styles.exProgressText, isDone && styles.exProgressTextDone]}>
            {completed.length}/{planned.sets.length}
          </Text>
        </View>
      </View>

      {/* Set rows */}
      {planned.sets.map((spec, idx) => {
        const state =
          idx < completed.length ? 'completed' : idx === currentSetIndex && isFocused ? 'current' : 'pending';
        const done = state === 'completed' ? completed[idx] : null;

        if (state === 'current') {
          return (
            <View key={idx} style={styles.setRowCurrent}>
              <Text style={styles.setRowLabel}>Set {idx + 1}</Text>
              <View style={styles.setInputRow}>
                <View style={styles.setInputGroup}>
                  <Text style={styles.setInputLabel}>reps</Text>
                  <TextInput
                    style={styles.setInputField}
                    keyboardType="number-pad"
                    value={reps}
                    onChangeText={setReps}
                  />
                </View>
                <View style={styles.setInputGroup}>
                  <Text style={styles.setInputLabel}>kg</Text>
                  <TextInput
                    style={styles.setInputField}
                    keyboardType="decimal-pad"
                    value={weight}
                    onChangeText={setWeight}
                  />
                </View>
                <View style={styles.setInputGroup}>
                  <Text style={styles.setInputLabel}>rpe</Text>
                  <TextInput
                    style={styles.setInputField}
                    keyboardType="decimal-pad"
                    value={rpe}
                    onChangeText={setRpe}
                  />
                </View>
              </View>
              <Text style={styles.setHint}>
                Plan: {spec.reps} reps
                {spec.weight != null ? ` · ${spec.weight}kg` : ''}
                {spec.rpe != null ? ` · RPE ${spec.rpe}` : ''}
                {' · rest '}{Math.round(spec.restSeconds / 60)}:{(spec.restSeconds % 60).toString().padStart(2, '0')}
              </Text>
              <TouchableOpacity style={styles.logSetBtn} onPress={handleLog}>
                <Text style={styles.logSetBtnText}>Log Set</Text>
              </TouchableOpacity>
            </View>
          );
        }

        if (state === 'completed' && done) {
          return (
            <View key={idx} style={styles.setRowDone}>
              <Text style={styles.setRowDoneCheck}>✓</Text>
              <Text style={styles.setRowDoneText}>
                Set {idx + 1}: {done.reps} × {done.weight}kg
                {done.rpe != null ? ` @RPE ${done.rpe}` : ''}
              </Text>
            </View>
          );
        }

        // pending
        return (
          <View key={idx} style={styles.setRowPending}>
            <Text style={styles.setRowPendingText}>
              Set {idx + 1}: {spec.reps} reps
              {spec.weight != null ? ` × ${spec.weight}kg` : ''}
              {spec.rpe != null ? ` @RPE ${spec.rpe}` : ''}
              {' · '}{Math.round(spec.restSeconds / 60)}:{(spec.restSeconds % 60).toString().padStart(2, '0')} rest
            </Text>
          </View>
        );
      })}
    </TouchableOpacity>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Swap exercise modal — shows alternatives with at least one shared muscle
// group with the original. User taps one to replace the planned exercise
// in the active session (set scheme is preserved). Disabled by the parent
// once any set on the slot is logged.
// ──────────────────────────────────────────────────────────────────────────

interface SwapModalProps {
  target: { index: number; exercise: PlannedExerciseSpec } | null;
  allExercises: Exercise[];
  onClose: () => void;
  onPick: (newExercise: Exercise) => void;
}

function SwapExerciseModal({ target, allExercises, onClose, onPick }: SwapModalProps) {
  const visible = target !== null;

  const alternatives = useMemo(() => {
    if (!target) return [];
    const original = allExercises.find((e) => e.id === target.exercise.exerciseId);
    if (!original) return [];
    const targetMuscles = new Set(original.muscleGroups);
    return allExercises
      .filter(
        (e) =>
          e.id !== original.id &&
          e.muscleGroups.some((m) => targetMuscles.has(m)),
      )
      .sort((a, b) => {
        // Sort: most muscle-group overlap first, then alpha.
        const overlap = (ex: Exercise) =>
          ex.muscleGroups.filter((m) => targetMuscles.has(m)).length;
        const diff = overlap(b) - overlap(a);
        return diff !== 0 ? diff : a.name.localeCompare(b.name);
      });
  }, [target, allExercises]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.modalSheet} onPress={() => {}}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Swap exercise</Text>
          {target && (
            <Text style={styles.modalSubtitle}>
              Replacing {target.exercise.exerciseName} (set scheme will be kept)
            </Text>
          )}
          <ScrollView style={styles.modalList}>
            {alternatives.length === 0 ? (
              <Text style={styles.modalEmpty}>No similar exercises in your library.</Text>
            ) : (
              alternatives.map((ex) => (
                <TouchableOpacity
                  key={ex.id}
                  style={styles.modalRow}
                  onPress={() => onPick(ex)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalRowName}>{ex.name}</Text>
                    <Text style={styles.modalRowMeta}>
                      {ex.muscleGroups.join(', ')} · {ex.equipment}
                    </Text>
                  </View>
                  <Text style={styles.modalRowChevron}>›</Text>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
          <TouchableOpacity style={styles.modalCancel} onPress={onClose}>
            <Text style={styles.modalCancelText}>Cancel</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Free workout input — original chip-strip + single-form flow, kept intact
// for sessions started with no plan ("Start Free Workout" button).
// ──────────────────────────────────────────────────────────────────────────

interface FreeWorkoutProps {
  exercises: Exercise[];
  currentExercise: Exercise | null;
  setCurrentExercise: (e: Exercise) => void;
  reps: string;
  setReps: (s: string) => void;
  weight: string;
  setWeight: (s: string) => void;
  rpe: string;
  setRpe: (s: string) => void;
  onLogSet: () => void;
  activeExercises: { exerciseId: string; exerciseName: string; completedSets: { reps: number; weight: number; rpe: number | null; restTaken: number }[] }[];
  totalSets: number;
}

function FreeWorkoutInput({
  exercises,
  currentExercise,
  setCurrentExercise,
  reps,
  setReps,
  weight,
  setWeight,
  rpe,
  setRpe,
  onLogSet,
  activeExercises,
  totalSets,
}: FreeWorkoutProps) {
  return (
    <>
      <Text style={styles.sectionTitle}>Select exercise</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.exercisePicker}>
        {exercises.map((ex) => (
          <TouchableOpacity
            key={ex.id}
            style={[styles.exerciseChip, currentExercise?.id === ex.id && styles.exerciseChipActive]}
            onPress={() => setCurrentExercise(ex)}
          >
            <Text
              style={[styles.exerciseChipText, currentExercise?.id === ex.id && styles.exerciseChipTextActive]}
              numberOfLines={1}
            >
              {ex.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {currentExercise && (
        <View style={styles.setInput}>
          <Text style={styles.currentExName}>{currentExercise.name}</Text>
          <View style={styles.inputRow}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Reps</Text>
              <TextInput
                style={styles.input}
                keyboardType="number-pad"
                value={reps}
                onChangeText={setReps}
                placeholder="8"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Weight (kg)</Text>
              <TextInput
                style={styles.input}
                keyboardType="decimal-pad"
                value={weight}
                onChangeText={setWeight}
                placeholder="60"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>RPE</Text>
              <TextInput
                style={styles.input}
                keyboardType="decimal-pad"
                value={rpe}
                onChangeText={setRpe}
                placeholder="7"
              />
            </View>
          </View>
          <TouchableOpacity style={styles.logSetBtn} onPress={onLogSet}>
            <Text style={styles.logSetBtnText}>Log Set</Text>
          </TouchableOpacity>
        </View>
      )}

      {activeExercises.length > 0 && (
        <View style={styles.loggedSection}>
          <Text style={styles.sectionTitle}>Logged ({totalSets} sets)</Text>
          {activeExercises.map((ae) => (
            <View key={ae.exerciseId} style={styles.loggedExercise}>
              <Text style={styles.loggedExName}>{ae.exerciseName}</Text>
              {ae.completedSets.map((s, idx) => (
                <Text key={idx} style={styles.loggedSet}>
                  Set {idx + 1}: {s.reps} x {s.weight}kg{s.rpe != null ? ` @RPE ${s.rpe}` : ''}
                </Text>
              ))}
            </View>
          ))}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', paddingHorizontal: 16, paddingTop: 56 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  backText: { fontSize: 16, color: '#22c55e', fontWeight: '500', width: 50 },
  title: { fontSize: 24, fontWeight: 'bold' },
  elapsed: { fontSize: 18, fontWeight: '600', color: '#22c55e' },
  cancelText: { fontSize: 15, color: '#ef4444', fontWeight: '500' },
  hrCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: '#ef4444',
  },
  hrCardLeft: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  hrBpm: { fontSize: 36, fontWeight: 'bold', color: '#ef4444' },
  hrUnit: { fontSize: 14, color: '#9ca3af' },
  hrCardRight: { alignItems: 'flex-end' },
  hrZone: { fontSize: 13, fontWeight: '600', color: '#ef4444', marginBottom: 2 },
  hrState: { fontSize: 11, color: '#9ca3af' },
  section: { marginTop: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12, color: '#374151' },
  startFreeBtn: {
    backgroundColor: '#22c55e',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 8,
  },
  startFreeBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  programCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  programName: { fontSize: 16, fontWeight: '600' },
  programMeta: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  weekSection: { marginLeft: 12, marginBottom: 8 },
  weekLabel: { fontSize: 13, fontWeight: '600', color: '#6b7280', marginBottom: 6 },
  sessionCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderLeftWidth: 3,
    borderLeftColor: '#22c55e',
  },
  sessionName: { fontSize: 14, fontWeight: '500' },
  sessionMeta: { fontSize: 12, color: '#22c55e' },
  emptyText: { fontSize: 14, color: '#9ca3af', textAlign: 'center', marginTop: 40, paddingHorizontal: 24 },
  exercisePicker: { marginBottom: 16 },
  exerciseChip: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  exerciseChipActive: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  exerciseChipText: { fontSize: 13, color: '#374151' },
  exerciseChipTextActive: { color: '#fff' },
  setInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  currentExName: { fontSize: 15, fontWeight: '600', marginBottom: 12 },
  inputRow: { flexDirection: 'row', gap: 10 },
  inputGroup: { flex: 1 },
  inputLabel: { fontSize: 11, color: '#6b7280', marginBottom: 4 },
  input: {
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: '500',
  },
  logSetBtn: {
    backgroundColor: '#22c55e',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  logSetBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  loggedSection: { marginBottom: 16 },
  loggedExercise: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  loggedExName: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  loggedSet: { fontSize: 13, color: '#6b7280', marginBottom: 2 },
  finishBtn: {
    backgroundColor: '#ef4444',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  finishBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  recentCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recentName: { fontSize: 14, fontWeight: '500' },
  recentDate: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  recentSets: { fontSize: 13, color: '#6b7280' },

  // ── Active session header additions ─────────────────────────────────────
  sessionTitle: { fontSize: 14, fontWeight: '600', color: '#374151' },
  progressPill: {
    backgroundColor: '#22c55e',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  progressPillText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // ── Rest timer ──────────────────────────────────────────────────────────
  restCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#f97316',
  },
  restCardFinished: { borderLeftColor: '#22c55e' },
  restHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  restLabel: { fontSize: 13, fontWeight: '600', color: '#f97316', textTransform: 'uppercase' },
  restSkip: { fontSize: 13, color: '#6b7280', fontWeight: '500' },
  restTime: { fontSize: 44, fontWeight: '700', color: '#f97316', marginVertical: 8 },
  restTimeFinished: { color: '#22c55e' },
  restProgress: {
    height: 4,
    backgroundColor: '#f3f4f6',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 12,
  },
  restProgressFill: { height: '100%', backgroundColor: '#f97316' },
  restAdjustRow: { flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  restAdjustBtn: {
    flex: 1,
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  restAdjustText: { fontSize: 13, fontWeight: '600', color: '#b45309' },

  // ── Planned exercise card ───────────────────────────────────────────────
  exCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#e5e7eb',
  },
  exCardFocused: { borderLeftColor: '#22c55e' },
  exCardDone: { opacity: 0.55, borderLeftColor: '#22c55e' },
  exHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  exName: { fontSize: 15, fontWeight: '600', flex: 1, paddingRight: 8 },
  exNameDone: { textDecorationLine: 'line-through', color: '#6b7280' },
  exProgress: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  exProgressDone: { backgroundColor: '#dcfce7' },
  exProgressText: { fontSize: 11, fontWeight: '700', color: '#6b7280' },
  exProgressTextDone: { color: '#15803d' },

  // ── Set rows ────────────────────────────────────────────────────────────
  setRowPending: { paddingVertical: 6, paddingLeft: 4 },
  setRowPendingText: { fontSize: 13, color: '#9ca3af' },
  setRowDone: { paddingVertical: 6, paddingLeft: 4, flexDirection: 'row', alignItems: 'center', gap: 8 },
  setRowDoneCheck: { color: '#22c55e', fontSize: 14, fontWeight: '700' },
  setRowDoneText: { fontSize: 13, color: '#374151' },
  setRowCurrent: {
    backgroundColor: '#f0fdf4',
    borderRadius: 8,
    padding: 10,
    marginVertical: 4,
  },
  setRowLabel: { fontSize: 12, fontWeight: '700', color: '#15803d', marginBottom: 6, textTransform: 'uppercase' },
  setInputRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  setInputGroup: { flex: 1 },
  setInputLabel: { fontSize: 10, color: '#6b7280', marginBottom: 2 },
  setInputField: {
    backgroundColor: '#fff',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
    fontWeight: '600',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  setHint: { fontSize: 11, color: '#6b7280', marginTop: 4, marginBottom: 8 },

  // ── Swap button + modal ─────────────────────────────────────────────────
  swapBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#eff6ff',
    marginRight: 8,
  },
  swapBtnText: { fontSize: 11, fontWeight: '700', color: '#2563eb', textTransform: 'uppercase' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
    maxHeight: '80%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#e5e7eb',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 14,
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalSubtitle: { fontSize: 13, color: '#6b7280', marginTop: 4, marginBottom: 12 },
  modalList: { maxHeight: 480 },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  modalRowName: { fontSize: 15, fontWeight: '500' },
  modalRowMeta: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  modalRowChevron: { fontSize: 22, color: '#9ca3af' },
  modalEmpty: { fontSize: 14, color: '#9ca3af', textAlign: 'center', paddingVertical: 24 },
  modalCancel: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
  },
  modalCancelText: { fontSize: 15, fontWeight: '600', color: '#374151' },
});
