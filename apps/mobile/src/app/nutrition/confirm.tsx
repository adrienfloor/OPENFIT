import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Loader } from '../../components/Loader';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FoodItem, MealType } from '@openfit/types';
import { sumItems } from '@openfit/fitness-core';
import { confirmFoodLog } from '../../services/nutrition';
import { useNutritionStore } from '../../stores/nutrition.store';
import { AuthedImage } from '../../components/AuthedImage';
import {
  FoodItemEditor,
  MealTypePicker,
  blankFoodItem,
  suggestMealType,
} from '../../components/FoodItemEditor';
import { colors, spacing, radii, typography } from '../../theme';
import { dialog } from '../../services/dialog';

/**
 * Review the AI's analysis before logging it. The user can:
 *   - tweak portion grams or per-item macros
 *   - delete an item the AI hallucinated
 *   - add a missed item
 *   - pick a meal type
 *
 * Save → POST /nutrition/logs with the edited items, server recomputes
 * totals from the items so we never desync.
 */
export default function ConfirmScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { pendingAnalysis, setPendingAnalysis } = useNutritionStore();
  const [items, setItems] = useState<FoodItem[]>([]);
  const [mealType, setMealType] = useState<MealType | null>(suggestMealType());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (pendingAnalysis) setItems(pendingAnalysis.items);
  }, [pendingAnalysis]);

  const totals = useMemo(() => sumItems(items), [items]);

  if (!pendingAnalysis) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.placeholder}>
          No analysis in progress. Go back and try again.
        </Text>
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => router.back()}
        >
          <Text style={styles.cancelBtnText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const updateItem = (index: number, patch: Partial<FoodItem>) => {
    setItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, ...patch } : it)),
    );
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const addItem = () => {
    setItems((prev) => [...prev, blankFoodItem()]);
  };

  const handleSave = async () => {
    if (items.length === 0) {
      dialog.alert('No items', 'Add at least one item or cancel to discard.');
      return;
    }
    if (items.some((it) => !it.name.trim())) {
      dialog.alert('Missing names', 'Every item needs a name.');
      return;
    }
    setSaving(true);
    try {
      await confirmFoodLog({
        analysisId: pendingAnalysis.id,
        photoUrl: pendingAnalysis.photoUrl,
        items,
        mealType: mealType ?? null,
        loggedAt: new Date(),
      });
      setPendingAnalysis(null);
      router.replace('/');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save log.';
      dialog.alert('Save failed', msg);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    dialog.alert('Discard analysis?', 'The photo and macros will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          setPendingAnalysis(null);
          router.back();
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 32 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.titleRow}>
        <TouchableOpacity onPress={handleCancel}>
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Review</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          {saving ? (
            <Loader size={20} />
          ) : (
            <Text style={styles.save}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <AuthedImage path={pendingAnalysis.photoUrl} style={styles.photo} />

      {pendingAnalysis.notes && (
        <View style={styles.noteCard}>
          <Text style={styles.noteText}>{pendingAnalysis.notes}</Text>
        </View>
      )}

      {/* Totals card */}
      <View style={styles.totalsCard}>
        <Text style={styles.totalsKcal}>{totals.kcal} kcal</Text>
        <Text style={styles.totalsMacros}>
          P {totals.proteinG}g · C {totals.carbsG}g · F {totals.fatG}g
        </Text>
      </View>

      {/* Meal type chips */}
      <Text style={styles.sectionLabel}>Meal</Text>
      <MealTypePicker value={mealType} onChange={setMealType} />

      {/* Items */}
      <Text style={styles.sectionLabel}>Items ({items.length})</Text>
      {items.map((item, idx) => (
        <FoodItemEditor
          key={idx}
          item={item}
          onChange={(patch) => updateItem(idx, patch)}
          onRemove={() => removeItem(idx)}
        />
      ))}

      <TouchableOpacity style={styles.addBtn} onPress={addItem}>
        <Text style={styles.addBtnText}>+ Add item</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 20, fontWeight: '700' , color: colors.text },
  cancel: { fontSize: 15, color: colors.danger, fontWeight: '500', minWidth: 60 },
  save: {
    fontSize: 15,
    color: colors.accent,
    fontWeight: '700',
    minWidth: 60,
    textAlign: 'right',
  },
  placeholder: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 64,
    marginBottom: 16,
  },
  cancelBtn: {
    backgroundColor: colors.surfaceMuted,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginHorizontal: 24,
  },
  cancelBtnText: { color: colors.text, fontWeight: '600' },
  photo: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 12,
    backgroundColor: colors.border,
    marginBottom: 12,
  },
  noteCard: {
    backgroundColor: '#fffbeb',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
  },
  noteText: { fontSize: 12, color: colors.warning },
  totalsCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  totalsKcal: { fontSize: 28, fontWeight: '700', color: colors.text },
  totalsMacros: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  addBtn: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  addBtnText: { color: colors.accent, fontSize: 14, fontWeight: '600' },
});
