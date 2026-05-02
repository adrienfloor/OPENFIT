import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { apiClient } from '../../services/api';
import { useWorkoutStore } from '../../stores/workout.store';
import { formatDuration } from '../../utils';
import { colors, spacing, radii, typography } from '../../theme';
import { useScreenTopPadding } from '../../theme/useScreenPadding';

interface PlannedSet {
  setIndex: number;
  reps: number;
  weight: number | null;
  rpe: number | null;
  restSeconds: number;
}

interface PlannedExercise {
  exercise: { id: string; name: string; muscleGroups: string[]; equipment: string };
  orderIndex: number;
  sets: PlannedSet[];
}

interface SessionDetail {
  id: string;
  name: string;
  plannedExercises: PlannedExercise[];
}

export default function ActiveWorkoutScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const router = useRouter();
  const { isActive, startedAt, activeExercises, addSet, finishWorkout } = useWorkoutStore();
  const topPadding = useScreenTopPadding();

  const [session, setSession] = useState<SessionDetail | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [reps, setReps] = useState('');
  const [weight, setWeight] = useState('');
  const [rpe, setRpe] = useState('');

  useEffect(() => {
    async function fetchSession() {
      try {
        const res = await apiClient.get<{ weeks: { sessions: SessionDetail[] }[] }>(
          `/workouts/programs`,
        );
        for (const prog of res.data) {
          for (const week of prog.weeks) {
            const found = week.sessions.find((s: SessionDetail) => s.id === sessionId);
            if (found) {
              setSession(found);
              return;
            }
          }
        }
      } catch {
        // use as free workout
      }
    }
    fetchSession();
  }, [sessionId]);

  const currentPlannedExercise = session?.plannedExercises[currentIndex];
  const currentExercise = currentPlannedExercise?.exercise;
  const elapsed = startedAt ? Math.floor((Date.now() - startedAt.getTime()) / 1000) : 0;

  const handleLogSet = () => {
    if (!currentExercise) return;
    const r = parseInt(reps, 10);
    const w = parseFloat(weight);
    if (isNaN(r) || r <= 0 || isNaN(w) || w < 0) {
      Alert.alert('Invalid input', 'Enter valid reps and weight.');
      return;
    }

    addSet(currentExercise.id, currentExercise.name, {
      reps: r,
      weight: w,
      rpe: rpe ? parseFloat(rpe) : null,
      restTaken: 0,
    });

    setReps('');
    setWeight('');
    setRpe('');
  };

  const handleNextExercise = () => {
    if (session && currentIndex < session.plannedExercises.length - 1) {
      setCurrentIndex(currentIndex + 1);
      // Pre-fill from plan
      const next = session.plannedExercises[currentIndex + 1];
      if (next && next.sets.length > 0) {
        setWeight(next.sets[0]!.weight?.toString() ?? '');
        setReps(next.sets[0]!.reps.toString());
      }
    }
  };

  const handleFinish = async () => {
    if (activeExercises.length === 0) {
      Alert.alert('No sets logged', 'Log at least one set before finishing.');
      return;
    }

    const now = new Date();
    const durationSeconds = Math.round((now.getTime() - startedAt!.getTime()) / 1000);

    const payload = {
      type: 'strength' as const,
      sessionId,
      startedAt: startedAt!.toISOString(),
      completedAt: now.toISOString(),
      durationSeconds,
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
    };

    try {
      await apiClient.post('/workouts/logs', payload);
    } catch {
      Alert.alert('Saved locally', 'Will sync when back online.');
    }

    finishWorkout();
    router.back();
  };

  if (!isActive) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>No active workout</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.link}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { paddingTop: topPadding }]}>
      <View style={styles.header}>
        <Text style={styles.title}>{session?.name ?? 'Workout'}</Text>
        <Text style={styles.elapsed}>{formatDuration(elapsed)}</Text>
      </View>

      {/* Current exercise */}
      {currentExercise && (
        <View style={styles.card}>
          <View style={styles.exerciseHeader}>
            <Text style={styles.exerciseName}>{currentExercise.name}</Text>
            <Text style={styles.exerciseMeta}>
              {currentExercise.muscleGroups.join(', ')} - {currentExercise.equipment}
            </Text>
          </View>

          {/* Planned sets reference */}
          {currentPlannedExercise && currentPlannedExercise.sets.length > 0 && (
            <View style={styles.plannedRef}>
              <Text style={styles.plannedLabel}>Plan:</Text>
              {currentPlannedExercise.sets.map((ps) => (
                <Text key={ps.setIndex} style={styles.plannedSet}>
                  {ps.reps} reps{ps.weight != null ? ` x ${ps.weight}kg` : ''}{ps.rpe != null ? ` @${ps.rpe}` : ''}
                </Text>
              ))}
            </View>
          )}

          <View style={styles.inputRow}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Reps</Text>
              <TextInput style={styles.input} keyboardType="number-pad" value={reps} onChangeText={setReps} placeholder="8" />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Weight</Text>
              <TextInput style={styles.input} keyboardType="decimal-pad" value={weight} onChangeText={setWeight} placeholder="60" />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>RPE</Text>
              <TextInput style={styles.input} keyboardType="decimal-pad" value={rpe} onChangeText={setRpe} placeholder="7" />
            </View>
          </View>

          <TouchableOpacity style={styles.logBtn} onPress={handleLogSet}>
            <Text style={styles.logBtnText}>Log Set</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Exercise navigation */}
      {session && session.plannedExercises.length > 1 && (
        <View style={styles.navRow}>
          <TouchableOpacity
            style={[styles.navBtn, currentIndex === 0 && styles.navBtnDisabled]}
            disabled={currentIndex === 0}
            onPress={() => setCurrentIndex(currentIndex - 1)}
          >
            <Text style={styles.navBtnText}>Prev</Text>
          </TouchableOpacity>
          <Text style={styles.navLabel}>
            {currentIndex + 1} / {session.plannedExercises.length}
          </Text>
          <TouchableOpacity
            style={[styles.navBtn, currentIndex >= session.plannedExercises.length - 1 && styles.navBtnDisabled]}
            disabled={currentIndex >= session.plannedExercises.length - 1}
            onPress={handleNextExercise}
          >
            <Text style={styles.navBtnText}>Next</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Logged summary */}
      {activeExercises.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Logged</Text>
          {activeExercises.map((ae) => (
            <View key={ae.exerciseId} style={styles.loggedCard}>
              <Text style={styles.loggedName}>{ae.exerciseName}</Text>
              {ae.completedSets.map((s, idx) => (
                <Text key={idx} style={styles.loggedSet}>
                  Set {idx + 1}: {s.reps} x {s.weight}kg{s.rpe != null ? ` @${s.rpe}` : ''}
                </Text>
              ))}
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity style={styles.finishBtn} onPress={handleFinish}>
        <Text style={styles.finishBtnText}>Finish Workout</Text>
      </TouchableOpacity>

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 22, fontWeight: 'bold' },
  elapsed: { fontSize: 18, fontWeight: '600', color: colors.accent },
  link: { color: colors.accent, fontSize: 14, marginTop: 12 },
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginBottom: 16 },
  exerciseHeader: { marginBottom: 12 },
  exerciseName: { fontSize: 17, fontWeight: '600' },
  exerciseMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  plannedRef: { backgroundColor: colors.surfaceMuted, borderRadius: 8, padding: 10, marginBottom: 12 },
  plannedLabel: { fontSize: 11, fontWeight: '600', color: colors.textSecondary, marginBottom: 4 },
  plannedSet: { fontSize: 13, color: colors.text },
  inputRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  inputGroup: { flex: 1 },
  inputLabel: { fontSize: 11, color: colors.textSecondary, marginBottom: 4 },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: '500',
  },
  logBtn: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  logBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  navRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  navBtn: { backgroundColor: colors.border, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  navBtnDisabled: { opacity: 0.4 },
  navBtnText: { fontSize: 13, fontWeight: '500', color: colors.text },
  navLabel: { fontSize: 13, color: colors.textSecondary },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 10 },
  loggedCard: { backgroundColor: colors.surface, borderRadius: 10, padding: 12, marginBottom: 6 },
  loggedName: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  loggedSet: { fontSize: 13, color: colors.textSecondary },
  finishBtn: { backgroundColor: colors.danger, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  finishBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
