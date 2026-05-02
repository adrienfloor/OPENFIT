import { create } from 'zustand';
import type { UserProfile, AuthTokens } from '@openfit/types';
import { setAccessToken, saveRefreshToken, deleteRefreshToken } from '../services/api';

interface AuthState {
  accessToken: string | null;
  user: UserProfile | null;
  isAuthenticated: boolean;
  setAuth: (tokens: AuthTokens, user: UserProfile) => Promise<void>;
  /** Replace just the cached user profile (e.g. after a PATCH /auth/me). */
  setUser: (user: UserProfile) => void;
  clearAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  isAuthenticated: false,

  setAuth: async (tokens, user) => {
    setAccessToken(tokens.accessToken);
    await saveRefreshToken(tokens.refreshToken);
    set({ accessToken: tokens.accessToken, user, isAuthenticated: true });
  },

  setUser: (user) => set({ user }),

  clearAuth: async () => {
    setAccessToken(null);
    await deleteRefreshToken();
    set({ accessToken: null, user: null, isAuthenticated: false });
  },
}));
