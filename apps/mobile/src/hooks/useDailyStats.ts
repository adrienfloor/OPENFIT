import { useState, useEffect, useCallback } from 'react';
import type { DailyHealth } from '@openfit/types';

const STALE_TIME_MS = 5 * 60 * 1000;

export function useDailyStats(): {
  today: DailyHealth | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const [today, setToday] = useState<DailyHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState(0);
  const [tick, setTick] = useState(0);

  const fetchStats = useCallback(async () => {
    const now = Date.now();
    if (now - lastFetchedAt < STALE_TIME_MS && today !== null) return;

    setLoading(true);
    setError(null);

    try {
      const { initializeHealthConnect, requestHealthPermissions, getDailyStats } =
        await import('../services/healthConnect');

      const available = await initializeHealthConnect();
      if (!available) {
        setToday(null);
        return;
      }

      await requestHealthPermissions();

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
  }, [lastFetchedAt, today]);

  useEffect(() => {
    fetchStats();
  }, [tick, fetchStats]);

  return {
    today,
    loading,
    error,
    refetch: () => {
      setLastFetchedAt(0);
      setTick((t) => t + 1);
    },
  };
}
