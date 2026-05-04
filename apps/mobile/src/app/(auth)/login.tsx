import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { LoginInputSchema } from '@openfit/types';
import { colors, spacing, radii, typography } from '../../theme';
import { dialog } from '../../services/dialog';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    const parsed = LoginInputSchema.safeParse({ email, password });
    if (!parsed.success) {
      dialog.alert('Validation error', parsed.error.errors[0]?.message ?? 'Invalid input');
      return;
    }

    setLoading(true);
    try {
      await login(parsed.data);
      router.replace('/(tabs)');
    } catch {
      dialog.alert('Login failed', 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>OpenFit</Text>
      <Text style={styles.subtitle}>Sign in to your account</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        textContentType="emailAddress"
        importantForAutofill="no"
        autoComplete="off"
      />
      <View style={styles.passwordContainer}>
        <TextInput
          style={styles.passwordInput}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          textContentType="password"
          importantForAutofill="no"
          autoComplete="off"
        />
        <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
          <Text style={styles.eyeText}>{showPassword ? '🙈' : '👁'}</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={() => void handleLogin()} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Signing in...' : 'Sign in'}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
        <Text style={styles.link}>No account? Register</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, backgroundColor: colors.bg },
  title: { fontSize: 32, fontWeight: 'bold', color: colors.accent, marginBottom: 4, textAlign: 'center' },
  subtitle: { fontSize: 16, color: colors.textSecondary, marginBottom: 32, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, marginBottom: 12, backgroundColor: colors.surface, color: colors.text },
  passwordContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 10, marginBottom: 12, backgroundColor: colors.surface },
  passwordInput: { flex: 1, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: colors.text },
  eyeBtn: { paddingHorizontal: 14, paddingVertical: 12 },
  eyeText: { fontSize: 18 },
  button: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginBottom: 16 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { textAlign: 'center', color: colors.accent, fontSize: 14 },
});
