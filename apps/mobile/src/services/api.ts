import axios from 'axios';

const API_URL = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:3001';

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

const REFRESH_TOKEN_KEY = 'openfit_refresh_token';

// Lazy-load expo-secure-store to avoid crashes in non-Expo environments (tests, etc.)
async function getSecureStore() {
  const mod = await import('expo-secure-store');
  return mod;
}

export async function saveRefreshToken(token: string): Promise<void> {
  const store = await getSecureStore();
  await store.setItemAsync(REFRESH_TOKEN_KEY, token);
}

export async function getRefreshToken(): Promise<string | null> {
  const store = await getSecureStore();
  return store.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function deleteRefreshToken(): Promise<void> {
  const store = await getSecureStore();
  await store.deleteItemAsync(REFRESH_TOKEN_KEY);
}

export function setAccessToken(token: string | null): void {
  if (token) {
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete apiClient.defaults.headers.common['Authorization'];
  }
}

// Token refresh interceptor — queues concurrent 401 retries behind a single refresh
let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

function onTokenRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) throw error;

    const originalRequest = error.config;
    if (!originalRequest || error.response?.status !== 401) throw error;

    if (originalRequest.url?.includes('/auth/refresh')) {
      await deleteRefreshToken();
      throw error;
    }

    if (isRefreshing) {
      return new Promise<unknown>((resolve) => {
        refreshSubscribers.push((token) => {
          if (originalRequest.headers) {
            originalRequest.headers['Authorization'] = `Bearer ${token}`;
          }
          resolve(apiClient(originalRequest));
        });
      });
    }

    isRefreshing = true;

    try {
      const storedRefreshToken = await getRefreshToken();
      if (!storedRefreshToken) throw new Error('No refresh token stored');

      const res = await apiClient.post<{ accessToken: string; refreshToken: string }>(
        '/auth/refresh',
        { refreshToken: storedRefreshToken },
      );

      const { accessToken, refreshToken: newRefreshToken } = res.data;
      setAccessToken(accessToken);
      await saveRefreshToken(newRefreshToken);
      onTokenRefreshed(accessToken);

      if (originalRequest.headers) {
        originalRequest.headers['Authorization'] = `Bearer ${accessToken}`;
      }
      return apiClient(originalRequest);
    } catch (refreshError) {
      await deleteRefreshToken();
      throw refreshError;
    } finally {
      isRefreshing = false;
    }
  },
);
