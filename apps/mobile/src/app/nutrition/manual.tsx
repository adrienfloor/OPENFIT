import { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FoodItem, MealType } from '@openfit/types';
import { sumItems } from '@openfit/fitness-core';
import { confirmFoodLog } from '../../services/nutrition';
import {
  FoodItemEditor,
  MealTypePicker,
  blankFoodItem,
  suggestMealType,
} from '../../components/FoodItemEditor';

/**
 * Manual entry — no photo, no AI. The lightweight path for trivial things
 * like "1 banana, 105 kcal" where the camera flow is overkill.
 */
export default function ManualEntryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<FoodItem[]>([blankFoodItem()]);
  const [mealType, setMealType] = useState<MealType | null>(suggestMealType());
  const [saving, setSaving] = useState(false);

  const totals = useMemo(() => sumItems(items), [items]);

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
      Alert.alert('No items', 'Add at least one item.');
      return;
    }
    if (items.some((it) => !it.name.trim())) {
      Alert.alert('Missing names', 'Every item needs a name.');
      return;
    }
    setSaving(true);
    try {
      await confirmFoodLog({
        analysisId: null,
        photoUrl: null,
        items,
        mealType: mealType ?? null,
        loggedAt: new Date(),
      });
      router.replace('/');
    } catch (err) {
      Alert.alert(
        'Save failed',
        err instanceof Error ? err.message : 'Try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 32 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.titleRow}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Quick add</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator color="#22c55e" />
          ) : (
            <Text style={styles.save}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <Text style={styles.intro}>
        For meals where the photo flow is overkill — type the name and macros
        directly. Use copy from a food label or your favourite database.
      </Text>

      <View style={styles.totalsCard}>
        <Text style={styles.totalsKcal}>{totals.kcal} kcal</Text>
        <Text style={styles.totalsMacros}>
          P {totals.proteinG}g · C {totals.carbsG}g · F {totals.fatG}g
        </Text>
      </View>

      <Text style={styles.sectionLabel}>Meal</Text>
      <MealTypePicker value={mealType} onChange={setMealType} />

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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', paddingHorizontal: 16 },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 20, fontWeight: '700' },
  cancel: { fontSize: 15, color: '#ef4444', fontWeight: '500', minWidth: 60 },
  save: {
    fontSize: 15,
    color: '#22c55e',
    fontWeight: '700',
    minWidth: 60,
    textAlign: 'right',
  },
  intro: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 18,
    marginBottom: 16,
  },
  totalsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  totalsKcal: { fontSize: 28, fontWeight: '700', color: '#111827' },
  totalsMacros: { fontSize: 13, color: '#6b7280', marginTop: 4 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  addBtn: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
  },
  addBtnText: { color: '#22c55e', fontSize: 14, fontWeight: '600' },
});
