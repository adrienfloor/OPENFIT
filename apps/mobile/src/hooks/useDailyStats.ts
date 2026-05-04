import { useEffect } from 'react';
import { useDailyStatsStore } from '../stores/dailyStats.store';
import type { TodayDailyStats } from '../services/healthConnect';

/**
 * Thin selector hook over the singleton daily-stats store. The store
 * owns one fetch loop, one cached snapshot — every Home sub-tab reads
 * from the same source so switching tabs no longer flashes the rings
 * back to mock fallbacks.
 *
 * - First mount triggers `init()` (HC initialise + permissions check +
 *   a single fetch). Subsequent mounts are no-ops; `init()` is
 *   idempotent.
 * - `today` is only ever cleared if no fetch has resolved yet. After
 *   the first success, refetches don't reset it; errors don't reset
 *   it; tab switches don't even fire fetches. So the rings render
 *   once and stay rendered.
 */
export function useDailyStats(): {
  today: TodayDailyStats | null;
  loading: boolean;
  error: Error | null;
  healthConnectAvailable: boolean | null;
  permissionsGranted: boolean;
  hasEverLoaded: boolean;
  refetch: () => Promise<void>;
  requestPermissions: () => Promise<void>;
} {
  const today = useDailyStatsStore((s) => s.today);
  const loading = useDailyStatsStore((s) => s.loading);
  const error = useDailyStatsStore((s) => s.error);
  const healthConnectAvailable = useDailyStatsStore((s) => s.healthConnectAvailable);
  const permissionsGranted = useDailyStatsStore((s) => s.permissionsGranted);
  const hasEverLoaded = useDailyStatsStore((s) => s.hasEverLoaded);
  const init = useDailyStatsStore((s) => s.init);
  const refetch = useDailyStatsStore((s) => s.refetch);
  const requestPermissions = useDailyStatsStore((s) => s.requestPermissions);

  // Kick the store on first subscriber mount. Subsequent calls are no-ops
  // because `init` guards itself with a once-promise inside the store.
  useEffect(() => {
    void init();
  }, [init]);

  return {
    today,
    loading,
    error,
    healthConnectAvailable,
    permissionsGranted,
    hasEverLoaded,
    refetch,
    requestPermissions,
  };
}
