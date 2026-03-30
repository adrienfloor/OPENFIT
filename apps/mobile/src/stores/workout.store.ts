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

interface WorkoutState {
  isActive: boolean;
  startedAt: Date | null;
  sessionId: string | null;
  activeExercises: ActiveExercise[];
  startWorkout: (sessionId: string | null) => void;
  addSet: (exerciseId: string, exerciseName: string, set: ActiveSet) => void;
  finishWorkout: () => void;
}

export const useWorkoutStore = create<WorkoutState>((set) => ({
  isActive: false,
  startedAt: null,
  sessionId: null,
  activeExercises: [],

  startWorkout: (sessionId) => {
    set({ isActive: true, startedAt: new Date(), sessionId, activeExercises: [] });
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
    set({ isActive: false, startedAt: null, sessionId: null, activeExercises: [] });
  },
}));
