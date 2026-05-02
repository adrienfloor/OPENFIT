import { useEffect, useState } from 'react';
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
import type { MacroTargets } from '@openfit/types';
import {
  computeBMR,
  ageYearsFromDob,
  defaultMacroTargets,
} from '@openfit/fitness-core';
import { getMacroTargets, setMacroTargets } from '../../services/nutrition';
import { useAuth } from '../../hooks/useAuth';
import { colors, spacing, radii, typography } from '../../theme';

/**
 * Daily macro targets editor. Reachable from the Today nutrition card via a
 * "Set targets" CTA when none are stored yet, or from a small gear icon
 * once they are.
 *
 * Suggestion: BMR × 1.5 (light-active multiplier — typical office worker who
 * lifts a few times a week) split 30/40/30 P/C/F. Caller can override
 * before saving.
 */
export default function TargetsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [kcal, setKcal] = useState('');
  const [proteinG, setProteinG] = useState('');
  const [carbsG, setCarbsG] = useState('');
  const [fatG, setFatG] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const stored = await getMacroTargets();
        if (cancelled) return;
        if (stored) {
          setKcal(String(stored.kcal));
          setProteinG(String(stored.proteinG));
          setCarbsG(String(stored.carbsG));
          setFatG(String(stored.fatG));
        } else if (user) {
          // First-time path: prefill with BMR-derived suggestion.
          const bmr = computeBMR({
            weightKg: user.weightKg,
            heightCm: user.heightCm,
            ageYears: ageYearsFromDob(new Date(user.dateOfBirth)),
            sex: user.sex,
          });
          const suggested = defaultMacroTargets(Math.round(bmr * 1.5));
          setKcal(String(suggested.kcal));
          setProteinG(String(suggested.proteinG));
          setCarbsG(String(suggested.carbsG));
          setFatG(String(suggested.fatG));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleSuggestFromBMR = () => {
    if (!user) return;
    const bmr = computeBMR({
      weightKg: user.weightKg,
      heightCm: user.heightCm,
      ageYears: ageYearsFromDob(new Date(user.dateOfBirth)),
      sex: user.sex,
    });
    const suggested = defaultMacroTargets(Math.round(bmr * 1.5));
    setKcal(String(suggested.kcal));
    setProteinG(String(suggested.proteinG));
    setCarbsG(String(suggested.carbsG));
    setFatG(String(suggested.fatG));
  };

  const handleSave = async () => {
    const parsed: Partial<MacroTargets> = {
      kcal: parseInt(kcal, 10),
      proteinG: parseInt(proteinG, 10),
      carbsG: parseInt(carbsG, 10),
      fatG: parseInt(fatG, 10),
    };
    if (
      Number.isNaN(parsed.kcal) ||
      Number.isNaN(parsed.proteinG) ||
      Number.isNaN(parsed.carbsG) ||
      Number.isNaN(parsed.fatG)
    ) {
      Alert.alert('Invalid input', 'All four targets are required as numbers.');
      return;
    }
    setSaving(true);
    try {
      await setMacroTargets(parsed as MacroTargets);
      router.back();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save.';
      Alert.alert('Save failed', msg);
    } finally {
      setSaving(false);
    }
  };

  // Live macro-kcal sanity check (4/4/9 rule). Differs from kcal when the
  // user manually tweaks one without rebalancing the others.
  const macroKcal =
    (parseInt(proteinG, 10) || 0) * 4 +
    (parseInt(carbsG, 10) || 0) * 4 +
    (parseInt(fatG, 10) || 0) * 9;
  const kcalNum = parseInt(kcal, 10) || 0;
  const drift = Math.abs(macroKcal - kcalNum);
  const showDrift = drift > 50 && kcalNum > 0;

  if (loading) {
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
        <Text style={styles.title}>Macro targets</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator color="#22c55e" />
          ) : (
            <Text style={styles.save}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <Text style={styles.intro}>
        Set the daily intake you'll measure today's meals against. Use the
        suggestion as a starting point — adjust based on your goal (cut /
        maintain / bulk).
      </Text>

      <TouchableOpacity style={styles.suggestBtn} onPress={handleSuggestFromBMR}>
        <Text style={styles.suggestBtnText}>↻ Suggest from BMR × 1.5</Text>
      </TouchableOpacity>

      <Field
        label="Daily calories"
        unit="kcal"
        value={kcal}
        onChange={setKcal}
        bigNumber
      />

      <Text style={styles.sectionLabel}>Macros</Text>
      <Field label="Protein" unit="g" value={proteinG} onChange={setProteinG} />
      <Field label="Carbs" unit="g" value={carbsG} onChange={setCarbsG} />
      <Field label="Fat" unit="g" value={fatG} onChange={setFatG} />

      {showDrift && (
        <View style={styles.driftCard}>
          <Text style={styles.driftText}>
            Your macros add up to {macroKcal} kcal but the calorie target is
            {' '}{kcalNum} kcal. They don't have to match — just an FYI.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

interface FieldProps {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  bigNumber?: boolean;
}

function Field({ label, unit, value, onChange, bigNumber }: FieldProps) {
  return (
    <View style={styles.fieldCard}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldInputRow}>
        <TextInput
          style={[styles.fieldInput, bigNumber && styles.fieldInputBig]}
          keyboardType="number-pad"
          value={value}
          onChangeText={onChange}
        />
        <Text style={styles.fieldUnit}>{unit}</Text>
      </View>
    </View>
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
  title: { fontSize: 20, fontWeight: '700' },
  back: { fontSize: 15, color: colors.accent, fontWeight: '500', minWidth: 60 },
  save: {
    fontSize: 15,
    color: colors.accent,
    fontWeight: '700',
    minWidth: 60,
    textAlign: 'right',
  },
  intro: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: 16,
  },
  suggestBtn: {
    backgroundColor: '#eff6ff',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 24,
  },
  suggestBtnText: { color: '#2563eb', fontWeight: '600' },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 8,
  },
  fieldCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldLabel: { fontSize: 14, color: colors.text, fontWeight: '500' },
  fieldInputRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  fieldInput: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    minWidth: 70,
    textAlign: 'right',
  },
  fieldInputBig: { fontSize: 24 },
  fieldUnit: { fontSize: 13, color: colors.textMuted },
  driftCard: {
    backgroundColor: '#fffbeb',
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
  },
  driftText: { fontSize: 12, color: colors.warning, lineHeight: 16 },
});
