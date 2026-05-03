import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { Loader } from '../../components/Loader';
import { useRouter } from 'expo-router';
import type { Sex, UpdateUserInput } from '@openfit/types';
import { useAuth } from '../../hooks/useAuth';
import { useAuthStore } from '../../stores/auth.store';
import { updateProfile } from '../../services/profile';
import { dialog } from '../../services/dialog';
import { colors, spacing, radii, typography } from '../../theme';
import { useScreenTopPadding } from '../../theme/useScreenPadding';

/**
 * Edit-profile screen — Slice 8. Lets the user update name, DOB, weight,
 * height, sex. Saves via PATCH /auth/me and updates the cached profile
 * in the auth store so the rest of the app sees the new values
 * immediately.
 */
export default function EditProfileScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const setUser = useAuthStore((s) => s.setUser);
  const topPadding = useScreenTopPadding();

  const [name, setName] = useState(user?.name ?? '');
  const [dob, setDob] = useState(
    user ? new Date(user.dateOfBirth).toISOString().slice(0, 10) : '',
  );
  const [weightKg, setWeightKg] = useState(user ? `${user.weightKg}` : '');
  const [heightCm, setHeightCm] = useState(user ? `${user.heightCm}` : '');
  const [sex, setSex] = useState<Sex>(user?.sex ?? 'male');
  const [saving, setSaving] = useState(false);

  const dirty =
    !!user &&
    (name.trim() !== user.name ||
      dob !== new Date(user.dateOfBirth).toISOString().slice(0, 10) ||
      Number(weightKg) !== user.weightKg ||
      Number(heightCm) !== user.heightCm ||
      sex !== user.sex);

  const onSave = async () => {
    const w = Number(weightKg);
    const h = Number(heightCm);
    if (!name.trim()) {
      dialog.alert('Missing name', 'Name cannot be empty.');
      return;
    }
    if (!dob || isNaN(new Date(dob).getTime())) {
      dialog.alert('Invalid date', 'Use YYYY-MM-DD for date of birth.');
      return;
    }
    if (!isFinite(w) || w <= 0 || w > 500) {
      dialog.alert('Invalid weight', 'Enter a weight between 0 and 500 kg.');
      return;
    }
    if (!isFinite(h) || h <= 0 || h > 300) {
      dialog.alert('Invalid height', 'Enter a height between 0 and 300 cm.');
      return;
    }
    const patch: UpdateUserInput = {
      name: name.trim(),
      dateOfBirth: new Date(dob),
      weightKg: w,
      heightCm: h,
      sex,
    };
    setSaving(true);
    try {
      const updated = await updateProfile(patch);
      setUser(updated);
      router.back();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed.';
      dialog.alert('Save failed', msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { paddingTop: topPadding }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.titleRow}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.cancel}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Profile</Text>
        <TouchableOpacity onPress={onSave} disabled={!dirty || saving}>
          {saving ? (
            <Loader size={20} />
          ) : (
            <Text style={[styles.save, !dirty && styles.saveDisabled]}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionLabel}>Identity</Text>
      <Field label="Full name">
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Bob Lifter"
          autoCapitalize="words"
        />
      </Field>

      <Text style={styles.sectionLabel}>Body</Text>
      <Field label="Date of birth (YYYY-MM-DD)">
        <TextInput
          style={styles.input}
          value={dob}
          onChangeText={setDob}
          placeholder="1990-02-22"
          keyboardType="numbers-and-punctuation"
          autoCapitalize="none"
        />
      </Field>
      <Field label="Weight (kg)">
        <TextInput
          style={styles.input}
          value={weightKg}
          onChangeText={setWeightKg}
          keyboardType="decimal-pad"
        />
      </Field>
      <Field label="Height (cm)">
        <TextInput
          style={styles.input}
          value={heightCm}
          onChangeText={setHeightCm}
          keyboardType="decimal-pad"
        />
      </Field>

      <Text style={styles.sectionLabel}>Sex</Text>
      <View style={styles.sexRow}>
        {(['male', 'female'] as Sex[]).map((s) => {
          const active = s === sex;
          return (
            <TouchableOpacity
              key={s}
              style={[styles.sexBtn, active && styles.sexBtnActive]}
              onPress={() => setSex(s)}
            >
              <Text style={[styles.sexBtnText, active && styles.sexBtnTextActive]}>
                {s === 'male' ? 'Male' : 'Female'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.note}>
        These values feed every calculation downstream — BMR, calorie burn,
        max-HR estimation. Keep them current for accurate scores.
      </Text>

      <View style={{ height: spacing.huge }} />
    </ScrollView>
  );
}

interface FieldProps {
  label: string;
  children: React.ReactNode;
}

function Field({ label, children }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  cancel: { fontSize: typography.size.md, color: colors.textSecondary, minWidth: 60 },
  save: {
    fontSize: typography.size.md,
    color: colors.accent,
    fontWeight: typography.weight.bold,
    minWidth: 60,
    textAlign: 'right',
  },
  saveDisabled: { color: colors.textMuted },
  sectionLabel: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    fontWeight: typography.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  field: { marginBottom: spacing.md },
  fieldLabel: {
    fontSize: typography.size.xs + 1,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 2,
    fontSize: typography.size.md,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sexRow: { flexDirection: 'row', gap: spacing.md },
  sexBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  sexBtnActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  sexBtnText: {
    fontSize: typography.size.md,
    color: colors.text,
    fontWeight: typography.weight.semibold,
  },
  sexBtnTextActive: { color: '#fff' },
  note: {
    fontSize: typography.size.xs + 1,
    color: colors.textMuted,
    lineHeight: 18,
    marginTop: spacing.lg,
  },
});
