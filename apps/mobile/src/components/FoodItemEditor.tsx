import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import type { FoodItem, MealType } from '@openfit/types';
import { colors, spacing, radii, typography } from '../theme';

/**
 * Shared editor row used by Confirm, Log Detail, and Manual Entry screens.
 * Pure presentation — caller owns the items array.
 */

export const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
];

export function suggestMealType(): MealType {
  const h = new Date().getHours();
  if (h < 10) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snack';
}

interface MealTypePickerProps {
  value: MealType | null;
  onChange: (m: MealType) => void;
}

export function MealTypePicker({ value, onChange }: MealTypePickerProps) {
  return (
    <View style={styles.mealRow}>
      {MEAL_TYPES.map((mt) => (
        <TouchableOpacity
          key={mt.value}
          style={[styles.mealChip, value === mt.value && styles.mealChipActive]}
          onPress={() => onChange(mt.value)}
        >
          <Text
            style={[
              styles.mealChipText,
              value === mt.value && styles.mealChipTextActive,
            ]}
          >
            {mt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

interface FoodItemEditorProps {
  item: FoodItem;
  onChange: (patch: Partial<FoodItem>) => void;
  onRemove: () => void;
}

export function FoodItemEditor({ item, onChange, onRemove }: FoodItemEditorProps) {
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

export function blankFoodItem(): FoodItem {
  return {
    name: '',
    portionGrams: 100,
    kcal: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
  };
}

const styles = StyleSheet.create({
  mealRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  mealChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mealChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  mealChipText: { fontSize: 13, color: colors.text, fontWeight: '500' },
  mealChipTextActive: { color: '#fff', fontWeight: '700' },
  itemCard: {
    backgroundColor: colors.surface,
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
    color: colors.text,
    paddingVertical: 4,
  },
  removeBtn: { fontSize: 16, color: colors.danger, paddingHorizontal: 6 },
  itemFieldsRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  field: { flex: 1 },
  fieldLabel: { fontSize: 10, color: colors.textSecondary, marginBottom: 2 },
  fieldInput: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  lowConfidence: { fontSize: 11, color: colors.warning, marginTop: 4 },
});
