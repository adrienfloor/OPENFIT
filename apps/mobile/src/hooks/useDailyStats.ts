import { useState, useEffect, useCallback } from 'react';
import type { DailyHealth } from '@openfit/types';
import {
  getDailyStats,
  HealthConnectError,
} from '../services/healthConnect';

const STALE_TIME_MS = 5 * 60 * 1000;

export function useDailyStats(): {
  data: DailyHealth | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const [data, setData] = useState<DailyHealth | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState(0);
  const [tick, setTick] = useState(0);

  const fetchStats = useCallback(async () => {
    const now = Date.now();
    if (now - lastFetchedAt < STALE_TIME_MS && data !== null) return;

    setIsLoading(true);
    setError(null);

    try {
      const today = new Date();
      const results = await getDailyStats(today, today);
      setData(results[0] ?? null);
      setLastFetchedAt(Date.now());
    } catch (err) {
      if (err instanceof HealthConnectError) {
        setError(err);
      } else {
        setError(
          err instanceof Error ? err : new Error('Failed to fetch daily stats'),
        );
      }
    } finally {
      setIsLoading(false);
    }
  }, [lastFetchedAt, data]);

  useEffect(() => {
    fetchStats();
  }, [tick, fetchStats]);

  return {
    data,
    isLoading,
    error,
    refetch: () => setTick((t) => t + 1),
  };
}
