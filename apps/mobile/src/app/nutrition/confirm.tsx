import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FoodItem, MealType } from '@openfit/types';
import { sumItems } from '@openfit/fitness-core';
import { confirmFoodLog } from '../../services/nutrition';
import { useNutritionStore } from '../../stores/nutrition.store';
import { AuthedImage } from '../../components/AuthedImage';

const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
];

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
    setItems((prev) => [
      ...prev,
      {
        name: '',
        portionGrams: 100,
        kcal: 0,
        proteinG: 0,
        carbsG: 0,
        fatG: 0,
      },
    ]);
  };

  const handleSave = async () => {
    if (items.length === 0) {
      Alert.alert('No items', 'Add at least one item or cancel to discard.');
      return;
    }
    if (items.some((it) => !it.name.trim())) {
      Alert.alert('Missing names', 'Every item needs a name.');
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
      Alert.alert('Save failed', msg);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    Alert.alert('Discard analysis?', 'The photo and macros will be lost.', [
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
            <ActivityIndicator color="#22c55e" />
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
      <View style={styles.mealRow}>
        {MEAL_TYPES.map((mt) => (
          <TouchableOpacity
            key={mt.value}
            style={[
              styles.mealChip,
              mealType === mt.value && styles.mealChipActive,
            ]}
            onPress={() => setMealType(mt.value)}
          >
            <Text
              style={[
                styles.mealChipText,
                mealType === mt.value && styles.mealChipTextActive,
              ]}
            >
              {mt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Items */}
      <Text style={styles.sectionLabel}>Items ({items.length})</Text>
      {items.map((item, idx) => (
        <ItemEditor
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

interface ItemEditorProps {
  item: FoodItem;
  onChange: (patch: Partial<FoodItem>) => void;
  onRemove: () => void;
}

function ItemEditor({ item, onChange, onRemove }: ItemEditorProps) {
  return (
    <View style={styles.itemCard}>
      <View style={styles.itemHeader}>
        <TextInput
          style={styles.itemName}
          value={item.name}
          onChangeText={(name) => onChange({ name })}
          placeholder="Food name"
        />
        <TouchableOpacity onPress={onRemove} hitSlop={8}>
          <Text style={styles.removeBtn}>✕</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.itemFieldsRow}>
        <NumberField
          label="grams"
          value={item.portionGrams}
          onChange={(v) => onChange({ portionGrams: v })}
        />
        <NumberField
          label="kcal"
          value={item.kcal}
          onChange={(v) => onChange({ kcal: v })}
        />
      </View>
      <View style={styles.itemFieldsRow}>
        <NumberField
          label="P g"
          value={item.proteinG}
          onChange={(v) => onChange({ proteinG: v })}
        />
        <NumberField
          label="C g"
          value={item.carbsG}
          onChange={(v) => onChange({ carbsG: v })}
        />
        <NumberField
          label="F g"
          value={item.fatG}
          onChange={(v) => onChange({ fatG: v })}
        />
      </View>
      {item.confidence !== undefined && item.confidence < 0.6 && (
        <Text style={styles.lowConfidence}>
          ⚠️ Low AI confidence — double-check this one
        </Text>
      )}
    </View>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
}

function NumberField({ label, value, onChange }: NumberFieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.fieldInput}
        keyboardType="decimal-pad"
        value={String(value)}
        onChangeText={(s) => {
          const n = parseFloat(s);
          if (!isNaN(n) && n >= 0) onChange(n);
          else if (s === '') onChange(0);
        }}
      />
    </View>
  );
}

function suggestMealType(): MealType {
  const h = new Date().getHours();
  if (h < 10) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snack';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
    paddingHorizontal: 16,
  },
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
  placeholder: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 64,
    marginBottom: 16,
  },
  cancelBtn: {
    backgroundColor: '#f3f4f6',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginHorizontal: 24,
  },
  cancelBtnText: { color: '#374151', fontWeight: '600' },
  photo: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 12,
    backgroundColor: '#e5e7eb',
    marginBottom: 12,
  },
  noteCard: {
    backgroundColor: '#fffbeb',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#f59e0b',
  },
  noteText: { fontSize: 12, color: '#92400e' },
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
  mealRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  mealChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  mealChipActive: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  mealChipText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  mealChipTextActive: { color: '#fff', fontWeight: '700' },
  itemCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  itemName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    paddingVertical: 4,
  },
  removeBtn: { fontSize: 16, color: '#ef4444', paddingHorizontal: 6 },
  itemFieldsRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  field: { flex: 1 },
  fieldLabel: { fontSize: 10, color: '#6b7280', marginBottom: 2 },
  fieldInput: {
    backgroundColor: '#f3f4f6',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  lowConfidence: { fontSize: 11, color: '#b45309', marginTop: 4 },
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
