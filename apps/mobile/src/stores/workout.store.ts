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
  /** Program this session was launched from. Null for free workouts. */
  programId: string | null;
  /**
   * Position of the session within the generated program — required by
   * `/coach/adjust-session`. Null for free workouts and for programs that
   * weren't created via the AI coach (no ProgramGeneration row exists).
   */
  weekNumber: number | null;
  sessionIndex: number | null;
  /** Display name of the session (e.g. "Day 1 — Push"). Null for free workouts. */
  sessionName: string | null;
  /** Prescribed plan for this session. Empty array for free workouts. */
  plannedExercises: PlannedExerciseSpec[];
  /**
   * Snapshot of the original prescription, captured at session start. Used
   * by the "Adjust for today" banner to revert an applied adjustment back
   * to the as-prescribed plan. Null when no plan was loaded.
   */
  originalPlannedExercises: PlannedExerciseSpec[] | null;
  activeExercises: ActiveExercise[];

  startWorkout: (
    sessionId: string | null,
    sessionName?: string | null,
    plannedExercises?: PlannedExerciseSpec[],
    programId?: string | null,
    weekNumber?: number | null,
    sessionIndex?: number | null,
  ) => void;
  addSet: (exerciseId: string, exerciseName: string, set: ActiveSet) => void;
  /**
   * Replace a planned exercise with a different one (same set scheme).
   * Only allowed before any set on this slot is completed — guarded in UI.
   */
  swapExercise: (index: number, newExerciseId: string, newExerciseName: string) => void;
  /**
   * Replace the entire prescription, e.g. after the daily-readiness adjuster
   * trims volume or adds a back-off set. The `originalPlannedExercises`
   * snapshot is preserved so the user can revert.
   */
  applyAdjustedPlan: (next: PlannedExerciseSpec[]) => void;
  /** Restore `plannedExercises` from the `originalPlannedExercises` snapshot. */
  revertAdjustedPlan: () => void;
  finishWorkout: () => void;
}

export const useWorkoutStore = create<WorkoutState>((set) => ({
  isActive: false,
  startedAt: null,
  sessionId: null,
  programId: null,
  weekNumber: null,
  sessionIndex: null,
  sessionName: null,
  plannedExercises: [],
  originalPlannedExercises: null,
  activeExercises: [],

  startWorkout: (
    sessionId,
    sessionName = null,
    plannedExercises = [],
    programId = null,
    weekNumber = null,
    sessionIndex = null,
  ) => {
    set({
      isActive: true,
      startedAt: new Date(),
      sessionId,
      programId,
      weekNumber,
      sessionIndex,
      sessionName,
      plannedExercises,
      originalPlannedExercises: plannedExercises.length > 0 ? plannedExercises : null,
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

  swapExercise: (index, newExerciseId, newExerciseName) => {
    set((state) => {
      if (index < 0 || index >= state.plannedExercises.length) return state;
      const next = [...state.plannedExercises];
      const original = next[index];
      if (!original) return state;
      next[index] = {
        ...original,
        exerciseId: newExerciseId,
        exerciseName: newExerciseName,
      };
      // Also re-snapshot so a subsequent "Revert" of the daily-readiness
      // adjustment lands the user back on the swapped slot, not the
      // as-prescribed exercise they had already replaced.
      const nextOriginal = state.originalPlannedExercises
        ? [...state.originalPlannedExercises]
        : null;
      if (nextOriginal && index < nextOriginal.length) {
        const orig = nextOriginal[index];
        if (orig) {
          nextOriginal[index] = {
            ...orig,
            exerciseId: newExerciseId,
            exerciseName: newExerciseName,
          };
        }
      }
      return { plannedExercises: next, originalPlannedExercises: nextOriginal };
    });
  },

  applyAdjustedPlan: (next) => {
    set({ plannedExercises: next });
  },

  revertAdjustedPlan: () => {
    set((state) =>
      state.originalPlannedExercises
        ? { plannedExercises: state.originalPlannedExercises }
        : state,
    );
  },

  finishWorkout: () => {
    set({
      isActive: false,
      startedAt: null,
      sessionId: null,
      programId: null,
      weekNumber: null,
      sessionIndex: null,
      sessionName: null,
      plannedExercises: [],
      originalPlannedExercises: null,
      activeExercises: [],
    });
  },
}));
