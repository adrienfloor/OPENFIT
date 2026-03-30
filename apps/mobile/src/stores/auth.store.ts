import { create } from 'zustand';
import type { UserProfile, AuthTokens } from '@openfit/types';
import { setAccessToken, saveRefreshToken, deleteRefreshToken } from '../services/api';

interface AuthState {
  accessToken: string | null;
  user: UserProfile | null;
  isAuthenticated: boolean;
  setAuth: (tokens: AuthTokens, user: UserProfile) => Promise<void>;
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

  clearAuth: async () => {
    setAccessToken(null);
    await deleteRefreshToken();
    set({ accessToken: null, user: null, isAuthenticated: false });
  },
}));
