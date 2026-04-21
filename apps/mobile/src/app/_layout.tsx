import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useAuthStore } from '../stores/auth.store';
import { getRefreshToken, setAccessToken } from '../services/api';
import { apiClient } from '../services/api';

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
          const res = await apiClient.post<{
            accessToken: string;
            refreshToken: string;
            user?: { id: string; email: string; name: string; dateOfBirth: string; weightKg: number; role: 'user' | 'admin'; createdAt: string; updatedAt: string };
          }>('/auth/refresh', { refreshToken });

          if (res.data.user) {
            await setAuth(
              { accessToken: res.data.accessToken, refreshToken: res.data.refreshToken },
              { ...res.data.user, dateOfBirth: new Date(res.data.user.dateOfBirth), createdAt: new Date(res.data.user.createdAt), updatedAt: new Date(res.data.user.updatedAt) },
            );
          } else {
            setAccessToken(res.data.accessToken);
          }
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

  if (!isReady) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
