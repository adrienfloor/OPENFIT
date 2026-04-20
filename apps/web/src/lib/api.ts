import axios from 'axios';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

export const apiClient = axios.create({
  baseURL: API_URL,
  withCredentials: true, // sends HttpOnly cookies automatically
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Attaches a bearer token to every request if one is provided.
 * Called from the auth store after login/refresh.
 */
export function setAccessToken(token: string | null): void {
  if (token) {
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    apiClient.defaults.headers.common['Authorization'] = '';
  }
}
