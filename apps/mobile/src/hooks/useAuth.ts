import { useAuthStore } from '../stores/auth.store';
import { apiClient } from '../services/api';
import type { AuthTokens, UserProfile, LoginInput, RegisterInput } from '@openfit/types';

export function useAuth() {
  const { isAuthenticated, user, setAuth, clearAuth } = useAuthStore();

  async function login(input: LoginInput): Promise<void> {
    const res = await apiClient.post<AuthTokens & { user: UserProfile }>('/auth/login', input);
    await setAuth(res.data, res.data.user);
  }

  async function register(input: RegisterInput): Promise<void> {
    const res = await apiClient.post<AuthTokens & { user: UserProfile }>('/auth/register', input);
    await setAuth(res.data, res.data.user);
  }

  async function logout(): Promise<void> {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // Best-effort — clear local state regardless
    }
    await clearAuth();
  }

  return { isAuthenticated, user, login, register, logout };
}
