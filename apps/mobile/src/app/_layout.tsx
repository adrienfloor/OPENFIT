import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { useAuthStore } from '../stores/auth.store';
import { getRefreshToken, setAccessToken } from '../services/api';
import { apiClient } from '../services/api';
import { colors } from '../theme';
import '../theme/applyDefaults';
import { DialogHost } from '../components/DialogHost';

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const { isAuthenticated, setAuth } = useAuthStore();
  const [isReady, setIsReady] = useState(false);

  // Try to restore session from stored refresh token on app launch
  useEffect(() => {
    async function restoreSession() {
      try {
        const refreshToken = await getRefreshToken();
        if (refreshToken) {
          // Exchange refresh token for new token pair
          const res = await apiClient.post<{ accessToken: string; refreshToken: string }>(
            '/auth/refresh',
            { refreshToken },
          );

          // Set access token so the profile request is authenticated
          setAccessToken(res.data.accessToken);

          // Fetch user profile
          const profileRes = await apiClient.get<{
            id: string; email: string; name: string; dateOfBirth: string;
            weightKg: number; heightCm: number; sex: 'male' | 'female';
            role: 'user' | 'admin'; createdAt: string; updatedAt: string;
          }>('/auth/me');

          await setAuth(
            { accessToken: res.data.accessToken, refreshToken: res.data.refreshToken },
            {
              ...profileRes.data,
              dateOfBirth: new Date(profileRes.data.dateOfBirth),
              createdAt: new Date(profileRes.data.createdAt),
              updatedAt: new Date(profileRes.data.updatedAt),
            },
          );
        }
      } catch {
        // No valid session — user will see login
      } finally {
        setIsReady(true);
      }
    }
    restoreSession();
  }, [setAuth]);

  // Redirect based on auth state
  useEffect(() => {
    if (!isReady) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, segments, isReady, router]);

  if (!isReady) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor={colors.bg} translucent={false} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
      <DialogHost />
    </SafeAreaProvider>
  );
}
