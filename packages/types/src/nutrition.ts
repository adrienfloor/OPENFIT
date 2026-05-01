import { z } from 'zod';

// ──────────────────────────────────────────────────────────────────────────
// Nutrition — AI food-photo logging.
//
// One photo → vision model → list of FoodItems with portion estimates →
// user-confirmed FoodLog. The same shape backs both the AI's analysis and
// the persisted log; the user just edits values before saving.
// ──────────────────────────────────────────────────────────────────────────

/**
 * A single identified food item on a plate. Portion is grams (universal across
 * dishes); per-item macros are absolute (already multiplied by portion). The
 * vision model returns these directly so the UI doesn't need a per-100g
 * lookup table.
 */
export const FoodItemSchema = z.object({
  /** Plain-English name, e.g. "grilled chicken breast", "white rice". */
  name: z.string().min(1).max(80),
  portionGrams: z.number().nonnegative().max(5000),
  kcal: z.number().nonnegative().max(5000),
  proteinG: z.number().nonnegative().max(500),
  carbsG: z.number().nonnegative().max(1000),
  fatG: z.number().nonnegative().max(500),
  /**
   * Model's self-reported confidence 0–1. Used by the UI to flag items that
   * deserve closer review. Not propagated into the persisted FoodLog.
   */
  confidence: z.number().min(0).max(1).optional(),
});

/** Aggregate macros for a meal or a day — same fields as a single item, no name. */
export const MacroTotalsSchema = z.object({
  kcal: z.number().nonnegative(),
  proteinG: z.number().nonnegative(),
  carbsG: z.number().nonnegative(),
  fatG: z.number().nonnegative(),
});

export const MealTypeSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);

// ──────────────────────────────────────────────────────────────────────────
// FoodAnalysis — raw vision-model output, persisted before user confirmation
// so we have a record even if the user abandons. One analysis can resolve to
// at most one FoodLog (or none if the user discards it).
// ──────────────────────────────────────────────────────────────────────────

export const FoodAnalysisSchema = z.object({
  id: z.string(),
  userId: z.string(),
  /** Server-relative path to the stored (compressed) photo. */
  photoUrl: z.string().min(1),
  items: z.array(FoodItemSchema).min(0).max(20),
  totals: MacroTotalsSchema,
  /** Model identifier — for traceability if accuracy regresses. */
  model: z.string().min(1),
  /** One-sentence note from the model, e.g. "lighting made portion estimation hard". */
  notes: z.string().max(300).optional(),
  createdAt: z.coerce.date(),
  /** ID of the FoodLog created from this analysis, if the user confirmed. */
  foodLogId: z.string().nullable(),
});

// ──────────────────────────────────────────────────────────────────────────
// FoodLog — the user's confirmed meal record.
// ──────────────────────────────────────────────────────────────────────────

export const FoodLogSchema = z.object({
  id: z.string(),
  userId: z.string(),
  /** Photo path. Null for manual entries (no photo). */
  photoUrl: z.string().nullable(),
  items: z.array(FoodItemSchema).min(1).max(20),
  totals: MacroTotalsSchema,
  mealType: MealTypeSchema.nullable(),
  /** When the user actually ate. Defaults to upload time, editable. */
  loggedAt: z.coerce.date(),
  /** FK to the source analysis, if any. Null for manual entries. */
  analysisId: z.string().nullable(),
  createdAt: z.coerce.date(),
});

// ──────────────────────────────────────────────────────────────────────────
// Macro targets — daily kcal + macro grams. Stored as a JSON column on User
// so they evolve without migrations.
// ──────────────────────────────────────────────────────────────────────────

export const MacroTargetsSchema = z.object({
  kcal: z.number().int().min(800).max(8000),
  proteinG: z.number().int().min(0).max(500),
  carbsG: z.number().int().min(0).max(1000),
  fatG: z.number().int().min(0).max(500),
});

// ──────────────────────────────────────────────────────────────────────────
// Input schemas for CRUD operations.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Confirmation payload — sent from the mobile review screen back to the API
 * to create a FoodLog from an analysis (or manually with `analysisId: null`).
 */
export const ConfirmFoodLogInputSchema = z.object({
  analysisId: z.string().nullable(),
  photoUrl: z.string().nullable(),
  items: z.array(FoodItemSchema).min(1).max(20),
  mealType: MealTypeSchema.nullable().optional(),
  loggedAt: z.coerce.date().optional(),
});

export const UpdateFoodLogInputSchema = z.object({
  items: z.array(FoodItemSchema).min(1).max(20).optional(),
  mealType: MealTypeSchema.nullable().optional(),
  loggedAt: z.coerce.date().optional(),
});

// ──────────────────────────────────────────────────────────────────────────
// Vision-model structured output — what the LLM tool-call returns.
// Tighter than FoodAnalysis: the model produces items only; the server adds
// id/userId/photoUrl/totals/createdAt around it.
// ──────────────────────────────────────────────────────────────────────────

export const VisionAnalysisOutputSchema = z.object({
  items: z.array(FoodItemSchema).min(0).max(20),
  notes: z.string().max(300).optional(),
});

// ──────────────────────────────────────────────────────────────────────────
// Type exports
// ──────────────────────────────────────────────────────────────────────────

export type FoodItem = z.infer<typeof FoodItemSchema>;
export type MacroTotals = z.infer<typeof MacroTotalsSchema>;
export type MealType = z.infer<typeof MealTypeSchema>;
export type FoodAnalysis = z.infer<typeof FoodAnalysisSchema>;
export type FoodLog = z.infer<typeof FoodLogSchema>;
export type MacroTargets = z.infer<typeof MacroTargetsSchema>;
export type ConfirmFoodLogInput = z.infer<typeof ConfirmFoodLogInputSchema>;
export type UpdateFoodLogInput = z.infer<typeof UpdateFoodLogInputSchema>;
export type VisionAnalysisOutput = z.infer<typeof VisionAnalysisOutputSchema>;
