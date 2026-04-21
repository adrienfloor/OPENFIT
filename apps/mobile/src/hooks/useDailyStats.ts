import { useState, useEffect, useCallback, useRef } from 'react';
import type { DailyHealth } from '@openfit/types';

export function useDailyStats(): {
  today: DailyHealth | null;
  loading: boolean;
  error: Error | null;
  healthConnectAvailable: boolean | null;
  permissionsGranted: boolean;
  refetch: () => void;
  requestPermissions: () => Promise<void>;
} {
  const [today, setToday] = useState<DailyHealth | null>(null);
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
          const granted = await getGrantedPermissions();
          if (granted.length > 0) {
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
        console.log('[useDailyStats] fetching stats...');
        const { getDailyStats } = await import('../services/healthConnect');
        const date = new Date();
        const results = await getDailyStats(date, date);
        console.log('[useDailyStats] results:', JSON.stringify(results));
        setToday(results[0] ?? null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch daily stats'));
        setToday(null);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, [permissionsGranted, fetchTrigger]);

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
