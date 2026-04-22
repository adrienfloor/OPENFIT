import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { RegisterInputSchema } from '@openfit/types';

export default function RegisterScreen() {
  const { register } = useAuth();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    dateOfBirth: '',
    weightKg: '',
    heightCm: '',
    sex: '' as '' | 'male' | 'female',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleRegister() {
    const parsed = RegisterInputSchema.safeParse({
      ...form,
      weightKg: Number(form.weightKg),
      heightCm: Number(form.heightCm),
      dateOfBirth: new Date(form.dateOfBirth),
    });

    if (!parsed.success) {
      Alert.alert('Validation error', parsed.error.errors[0]?.message ?? 'Invalid input');
      return;
    }

    setLoading(true);
    try {
      await register(parsed.data);
      router.replace('/(tabs)');
    } catch {
      Alert.alert('Registration failed', 'Email may already be in use');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Create account</Text>
      <TextInput style={styles.input} placeholder="Full name" value={form.name} onChangeText={(v) => update('name', v)} />
      <TextInput style={styles.input} placeholder="Email" value={form.email} onChangeText={(v) => update('email', v)} autoCapitalize="none" keyboardType="email-address" />
      <View style={styles.passwordContainer}>
        <TextInput
          style={styles.passwordInput}
          placeholder="Password (min 8, 1 uppercase, 1 number)"
          value={form.password}
          onChangeText={(v) => update('password', v)}
          secureTextEntry={!showPassword}
        />
        <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
          <Text style={styles.eyeText}>{showPassword ? '🙈' : '👁'}</Text>
        </TouchableOpacity>
      </View>
      <TextInput style={styles.input} placeholder="Date of birth (YYYY-MM-DD)" value={form.dateOfBirth} onChangeText={(v) => update('dateOfBirth', v)} />
      <TextInput style={styles.input} placeholder="Weight (kg)" value={form.weightKg} onChangeText={(v) => update('weightKg', v)} keyboardType="numeric" />
      <TextInput style={styles.input} placeholder="Height (cm)" value={form.heightCm} onChangeText={(v) => update('heightCm', v)} keyboardType="numeric" />
      <View style={styles.sexRow}>
        <TouchableOpacity
          style={[styles.sexBtn, form.sex === 'male' && styles.sexBtnActive]}
          onPress={() => update('sex', 'male')}
        >
          <Text style={[styles.sexBtnText, form.sex === 'male' && styles.sexBtnTextActive]}>Male</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sexBtn, form.sex === 'female' && styles.sexBtnActive]}
          onPress={() => update('sex', 'female')}
        >
          <Text style={[styles.sexBtnText, form.sex === 'female' && styles.sexBtnTextActive]}>Female</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={() => void handleRegister()} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Creating...' : 'Create account'}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
        <Text style={styles.link}>Already have an account? Sign in</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 24, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, marginBottom: 12 },
  passwordContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, marginBottom: 12 },
  passwordInput: { flex: 1, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16 },
  eyeBtn: { paddingHorizontal: 14, paddingVertical: 12 },
  eyeText: { fontSize: 18 },
  button: { backgroundColor: '#22c55e', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginBottom: 16, marginTop: 8 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { textAlign: 'center', color: '#16a34a', fontSize: 14 },
  sexRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  sexBtn: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  sexBtnActive: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  sexBtnText: { fontSize: 16, color: '#374151', fontWeight: '500' },
  sexBtnTextActive: { color: '#fff' },
});
