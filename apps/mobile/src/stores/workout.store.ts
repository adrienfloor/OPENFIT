import { create } from 'zustand';

interface ActiveSet {
  reps: number;
  weight: number;
  rpe: number | null;
  restTaken: number;
}

interface ActiveExercise {
  exerciseId: string;
  exerciseName: string;
  completedSets: ActiveSet[];
}

/** A single prescribed set from a planned program. */
export interface PlannedSetSpec {
  reps: number;
  weight: number | null;
  rpe: number | null;
  restSeconds: number;
}

/** A planned exercise within a session, including its target sets. */
export interface PlannedExerciseSpec {
  exerciseId: string;
  exerciseName: string;
  sets: PlannedSetSpec[];
}

interface WorkoutState {
  isActive: boolean;
  startedAt: Date | null;
  sessionId: string | null;
  /** Display name of the session (e.g. "Day 1 — Push"). Null for free workouts. */
  sessionName: string | null;
  /** Prescribed plan for this session. Empty array for free workouts. */
  plannedExercises: PlannedExerciseSpec[];
  activeExercises: ActiveExercise[];

  startWorkout: (
    sessionId: string | null,
    sessionName?: string | null,
    plannedExercises?: PlannedExerciseSpec[],
  ) => void;
  addSet: (exerciseId: string, exerciseName: string, set: ActiveSet) => void;
  finishWorkout: () => void;
}

export const useWorkoutStore = create<WorkoutState>((set) => ({
  isActive: false,
  startedAt: null,
  sessionId: null,
  sessionName: null,
  plannedExercises: [],
  activeExercises: [],

  startWorkout: (sessionId, sessionName = null, plannedExercises = []) => {
    set({
      isActive: true,
      startedAt: new Date(),
      sessionId,
      sessionName,
      plannedExercises,
      activeExercises: [],
    });
  },

  addSet: (exerciseId, exerciseName, newSet) => {
    set((state) => {
      const existing = state.activeExercises.find((e) => e.exerciseId === exerciseId);
      if (existing) {
        return {
          activeExercises: state.activeExercises.map((e) =>
            e.exerciseId === exerciseId
              ? { ...e, completedSets: [...e.completedSets, newSet] }
              : e,
          ),
        };
      }
      return {
        activeExercises: [
          ...state.activeExercises,
          { exerciseId, exerciseName, completedSets: [newSet] },
        ],
      };
    });
  },

  finishWorkout: () => {
    set({
      isActive: false,
      startedAt: null,
      sessionId: null,
      sessionName: null,
      plannedExercises: [],
      activeExercises: [],
    });
  },
}));
