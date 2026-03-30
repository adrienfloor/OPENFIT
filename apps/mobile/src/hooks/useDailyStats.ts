import { useState, useEffect } from 'react';
import { apiClient } from '../services/api';
import { useAuthStore } from '../stores/auth.store';
import type { DailyHealth } from '@openfit/types';

export function useDailyStats(): {
  today: DailyHealth | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [today, setToday] = useState<DailyHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    apiClient
      .get<DailyHealth[]>('/health?limit=1')
      .then((res) => {
        if (!cancelled) setToday(res.data[0] ?? null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error('Failed to fetch daily stats'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [isAuthenticated, tick]);

  return { today, loading, error, refetch: () => setTick((t) => t + 1) };
}
