import { useState, useEffect, useCallback } from 'react';
import type { DailyHealth } from '@openfit/types';

const STALE_TIME_MS = 5 * 60 * 1000;

export function useDailyStats(): {
  today: DailyHealth | null;
  loading: boolean;
  error: Error | null;
  healthConnectAvailable: boolean | null;
  refetch: () => void;
  requestPermissions: () => Promise<void>;
} {
  const [today, setToday] = useState<DailyHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState(0);
  const [healthConnectAvailable, setHealthConnectAvailable] = useState<boolean | null>(null);
  const [permissionsGranted, setPermissionsGranted] = useState(false);

  // Check availability on mount (no permission request)
  useEffect(() => {
    async function checkAvailability() {
      try {
        const { initializeHealthConnect } = await import('../services/healthConnect');
        const available = await initializeHealthConnect();
        setHealthConnectAvailable(available);
      } catch {
        setHealthConnectAvailable(false);
      }
    }
    checkAvailability();
  }, []);

  // Manual permission request — called by user action only
  const requestPermissions = useCallback(async () => {
    try {
      const { requestHealthPermissions } = await import('../services/healthConnect');
      const granted = await requestHealthPermissions();
      setPermissionsGranted(granted);
    } catch {
      // Permission request failed — Health Connect may not be ready
    }
  }, []);

  const fetchStats = useCallback(async () => {
    if (healthConnectAvailable !== true || !permissionsGranted) return;

    const now = Date.now();
    if (now - lastFetchedAt < STALE_TIME_MS && today !== null) return;

    setLoading(true);
    setError(null);

    try {
      const { getDailyStats } = await import('../services/healthConnect');
      const date = new Date();
      const results = await getDailyStats(date, date);
      setToday(results[0] ?? null);
      setLastFetchedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch daily stats'));
      setToday(null);
    } finally {
      setLoading(false);
    }
  }, [healthConnectAvailable, permissionsGranted, lastFetchedAt, today]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return {
    today,
    loading,
    error,
    healthConnectAvailable,
    refetch: () => {
      setLastFetchedAt(0);
      fetchStats();
    },
    requestPermissions,
  };
}
