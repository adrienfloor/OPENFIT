import { create } from 'zustand';
import type { FoodAnalysis } from '@openfit/types';

/**
 * Transient store for the in-flight food-analysis flow.
 *
 * The Capture screen calls /nutrition/analyze, stores the result here, and
 * navigates to Confirm — which reads the analysis and submits a FoodLog.
 * Surviving the navigation in memory avoids a redundant GET roundtrip and
 * keeps the response intact even if the user backs out and re-enters.
 *
 * Cleared on submit/cancel; not persisted to disk.
 */
interface NutritionState {
  pendingAnalysis: FoodAnalysis | null;
  setPendingAnalysis: (a: FoodAnalysis | null) => void;
}

export const useNutritionStore = create<NutritionState>((set) => ({
  pendingAnalysis: null,
  setPendingAnalysis: (a) => set({ pendingAnalysis: a }),
}));
