import { useState, useEffect, useCallback, useRef } from 'react';
import type { TodayDailyStats } from '../services/healthConnect';
import { useAuth } from './useAuth';

export function useDailyStats(): {
  today: TodayDailyStats | null;
  loading: boolean;
  error: Error | null;
  healthConnectAvailable: boolean | null;
  permissionsGranted: boolean;
  refetch: () => void;
  requestPermissions: () => Promise<void>;
} {
  const { user } = useAuth();
  const [today, setToday] = useState<TodayDailyStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [healthConnectAvailable, setHealthConnectAvailable] = useState<boolean | null>(null);
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [fetchTrigger, setFetchTrigger] = useState(0);
  const initializedRef = useRef(false);

  // Check availability and existing permissions on mount
  useEffect(() => {
    async function checkAvailability() {
      try {
        const { initializeHealthConnect } = await import('../services/healthConnect');
        const available = await initializeHealthConnect();
        setHealthConnectAvailable(available);
        initializedRef.current = available;

        if (available) {
          const { getGrantedPermissions } = await import('react-native-health-connect');
          const { REQUIRED_PERMISSION_COUNT } = await import('../services/healthConnect');
          const granted = await getGrantedPermissions();
          // Treat as connected only when every required read permission is
          // granted — this way a new permission added in an app update will
          // re-show the Connect Health Data button so the user can grant it.
          if (granted.length >= REQUIRED_PERMISSION_COUNT) {
            setPermissionsGranted(true);
            setFetchTrigger((t) => t + 1);
          }
        }
      } catch {
        setHealthConnectAvailable(false);
      }
    }
    checkAvailability();
  }, []);

  // Manual permission request
  const requestPermissions = useCallback(async () => {
    try {
      console.log('[useDailyStats] requesting permissions...');
      const { requestHealthPermissions } = await import('../services/healthConnect');
      const granted = await requestHealthPermissions();
      console.log('[useDailyStats] permissions granted:', granted);
      setPermissionsGranted(granted);
      if (granted) {
        setFetchTrigger((t) => t + 1);
      }
    } catch (err) {
      console.log('[useDailyStats] permission request failed:', err);
    }
  }, []);

  // Fetch data when permissions are granted
  useEffect(() => {
    if (!permissionsGranted || !initializedRef.current) return;

    async function fetchStats() {
      setLoading(true);
      setError(null);
      try {
        console.log('[useDailyStats] fetching dashboard (7d window)...');
        const { getTodayDashboard } = await import('../services/healthConnect');
        const profile = user
          ? {
              weightKg: user.weightKg,
              heightCm: user.heightCm,
              sex: user.sex,
              dateOfBirth: new Date(user.dateOfBirth),
            }
          : undefined;
        const result = await getTodayDashboard(profile);
        console.log('[useDailyStats] dashboard result:', JSON.stringify(result));
        setToday(result);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch daily stats'));
        setToday(null);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, [permissionsGranted, fetchTrigger, user]);

  return {
    today,
    loading,
    error,
    healthConnectAvailable,
    permissionsGranted,
    refetch: () => setFetchTrigger((t) => t + 1),
    requestPermissions,
  };
}
