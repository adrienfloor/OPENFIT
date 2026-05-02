import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FoodItem, FoodLog, MealType } from '@openfit/types';
import { sumItems } from '@openfit/fitness-core';
import {
  getFoodLog,
  updateFoodLog,
  deleteFoodLog,
} from '../../../services/nutrition';
import { AuthedImage } from '../../../components/AuthedImage';
import {
  FoodItemEditor,
  MealTypePicker,
  blankFoodItem,
} from '../../../components/FoodItemEditor';
import { colors, spacing, radii, typography } from '../../../theme';

/**
 * Log detail / edit screen. Reachable from a NutritionCard thumbnail tap or
 * from the past-day history screen.
 *
 * Mirrors the Confirm flow but operates on an existing FoodLog: items
 * editable, meal type editable, save → PATCH, plus a Delete action.
 */
export default function LogDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [log, setLog] = useState<FoodLog | null>(null);
  const [items, setItems] = useState<FoodItem[]>([]);
  const [mealType, setMealType] = useState<MealType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const fetched = await getFoodLog(id);
        if (cancelled) return;
        setLog(fetched);
        setItems(fetched.items);
        setMealType(fetched.mealType);
      } catch (err) {
        if (cancelled) return;
        Alert.alert(
          'Could not load',
          err instanceof Error ? err.message : 'Try again later.',
        );
        router.back();
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  const totals = useMemo(() => sumItems(items), [items]);

  const updateItem = (index: number, patch: Partial<FoodItem>) => {
    setItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, ...patch } : it)),
    );
    setDirty(true);
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
  };

  const addItem = () => {
    setItems((prev) => [...prev, blankFoodItem()]);
    setDirty(true);
  };

  const handleSave = async () => {
    if (items.length === 0) {
      Alert.alert('No items', 'A log needs at least one item. Delete it instead?');
      return;
    }
    if (items.some((it) => !it.name.trim())) {
      Alert.alert('Missing names', 'Every item needs a name.');
      return;
    }
    setSaving(true);
    try {
      await updateFoodLog(id, { items, mealType: mealType ?? null });
      router.back();
    } catch (err) {
      Alert.alert(
        'Save failed',
        err instanceof Error ? err.message : 'Try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete this log?',
      'The photo and macros will be permanently removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteFoodLog(id);
              router.back();
            } catch (err) {
              Alert.alert(
                'Delete failed',
                err instanceof Error ? err.message : 'Try again.',
              );
            }
          },
        },
      ],
    );
  };

  if (loading || !log) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
        <ActivityIndicator size="large" color="#22c55e" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 32 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.titleRow}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Meal</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving || !dirty}>
          {saving ? (
            <ActivityIndicator color="#22c55e" />
          ) : (
            <Text style={[styles.save, !dirty && styles.saveDisabled]}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      {log.photoUrl && (
        <AuthedImage path={log.photoUrl} style={styles.photo} />
      )}

      <View style={styles.totalsCard}>
        <Text style={styles.totalsKcal}>{totals.kcal} kcal</Text>
        <Text style={styles.totalsMacros}>
          P {totals.proteinG}g · C {totals.carbsG}g · F {totals.fatG}g
        </Text>
        <Text style={styles.loggedAt}>{formatLoggedAt(log.loggedAt)}</Text>
      </View>

      <Text style={styles.sectionLabel}>Meal</Text>
      <MealTypePicker
        value={mealType}
        onChange={(m) => {
          setMealType(m);
          setDirty(true);
        }}
      />

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

      <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
        <Text style={styles.deleteBtnText}>Delete log</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function formatLoggedAt(dt: Date): string {
  const d = new Date(dt);
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16 },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 20, fontWeight: '700' },
  back: { fontSize: 15, color: colors.accent, fontWeight: '500', minWidth: 60 },
  save: {
    fontSize: 15,
    color: colors.accent,
    fontWeight: '700',
    minWidth: 60,
    textAlign: 'right',
  },
  saveDisabled: { color: colors.textMuted },
  photo: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 12,
    backgroundColor: colors.border,
    marginBottom: 12,
  },
  totalsCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  totalsKcal: { fontSize: 28, fontWeight: '700', color: colors.text },
  totalsMacros: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  loggedAt: { fontSize: 12, color: colors.textMuted, marginTop: 6 },
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
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  addBtnText: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  deleteBtn: {
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  deleteBtnText: { color: '#dc2626', fontSize: 14, fontWeight: '700' },
});
