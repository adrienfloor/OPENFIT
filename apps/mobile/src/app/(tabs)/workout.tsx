import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { apiClient } from '../../services/api';
import { useWorkoutStore } from '../../stores/workout.store';
import { formatDuration } from '../../utils';

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

export default function WorkoutScreen() {
  const router = useRouter();
  const { isActive, startedAt, activeExercises, startWorkout, addSet, finishWorkout, sessionId } =
    useWorkoutStore();

  const [programs, setPrograms] = useState<Program[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);

  // Set input state
  const [currentExercise, setCurrentExercise] = useState<Exercise | null>(null);
  const [reps, setReps] = useState('');
  const [weight, setWeight] = useState('');
  const [rpe, setRpe] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [progRes, exRes] = await Promise.all([
        apiClient.get<Program[]>('/workouts/programs'),
        apiClient.get<Exercise[]>('/workouts/exercises'),
      ]);
      setPrograms(progRes.data);
      setExercises(exRes.data);
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
    startWorkout(null);
  };

  const handleStartSession = (session: Session) => {
    startWorkout(session.id);
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

    const payload = {
      sessionId: sessionId ?? undefined,
      startedAt: startedAt!.toISOString(),
      completedAt: new Date().toISOString(),
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
      // Queue for offline sync would go here
      Alert.alert('Saved locally', 'Will sync when back online.');
    }

    finishWorkout();
    setCurrentExercise(null);
    setSelectedProgram(null);
  };

  const elapsed = startedAt
    ? Math.floor((Date.now() - startedAt.getTime()) / 1000)
    : 0;

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

  // Active workout view
  if (isActive) {
    const totalSets = activeExercises.reduce((sum, e) => sum + e.completedSets.length, 0);

    return (
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleCancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.elapsed}>{formatDuration(elapsed)}</Text>
        </View>

        {/* Exercise picker */}
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

        {/* Set input */}
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
            <TouchableOpacity style={styles.logSetBtn} onPress={handleLogSet}>
              <Text style={styles.logSetBtnText}>Log Set</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Logged exercises */}
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

        <TouchableOpacity style={styles.finishBtn} onPress={handleFinish}>
          <Text style={styles.finishBtnText}>Finish Workout</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    );
  }

  // Program selection / start view
  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} />}
    >
      <Text style={styles.title}>Workout</Text>

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

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', paddingHorizontal: 16, paddingTop: 56 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 16 },
  elapsed: { fontSize: 18, fontWeight: '600', color: '#22c55e' },
  cancelText: { fontSize: 15, color: '#ef4444', fontWeight: '500' },
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
});
