'use client';

import { create } from 'zustand';
import type { UserProfile, AuthTokens } from '@openfit/types';
import { setAccessToken } from '../lib/api';

interface AuthState {
  // Access token lives only in memory — never persisted to localStorage
  accessToken: string | null;
  user: UserProfile | null;
  isAuthenticated: boolean;
  setTokens: (tokens: AuthTokens, user: UserProfile) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  isAuthenticated: false,

  setTokens: (tokens, user) => {
    // Access token stored in memory only; refresh token is in HttpOnly cookie (set by API)
    setAccessToken(tokens.accessToken);
    set({ accessToken: tokens.accessToken, user, isAuthenticated: true });
  },

  clearAuth: () => {
    setAccessToken(null);
    set({ accessToken: null, user: null, isAuthenticated: false });
  },
}));
