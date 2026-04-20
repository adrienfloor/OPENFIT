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
    setAccessToken(tokens.accessToken);
    // Set lightweight session indicator cookie so middleware can gate protected routes
    document.cookie = 'of_session=1; path=/; max-age=2592000; SameSite=Lax';
    set({ accessToken: tokens.accessToken, user, isAuthenticated: true });
  },

  clearAuth: () => {
    setAccessToken(null);
    // Clear session indicator cookie
    document.cookie = 'of_session=; path=/; max-age=0';
    set({ accessToken: null, user: null, isAuthenticated: false });
  },
}));
