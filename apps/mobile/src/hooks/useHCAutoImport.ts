import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useAuthStore } from '../stores/auth.store';
import { useDailyStatsStore } from '../stores/dailyStats.store';
import { useImportEventsStore } from '../stores/importEvents.store';
import { importRecentWorkouts } from '../services/healthConnectImport';

/**
 * Foreground auto-import for Health-Connect-backed workouts.
 *
 * Mounts once at the root layout. On every AppState 'active' transition
 * (and once at boot, after auth + HC permissions are confirmed), we
 * pull anything new from HC's ExerciseSession table and POST it. The
 * watermark inside `importRecentWorkouts` keeps the call cheap when
 * nothing has changed.
 *
 * Why throttle: a Samsung gesture-bar back-tap or pulling down the
 * notification shade fires `'active'` again almost immediately. Without
 * the 60 s gate we'd hammer Health Connect on every glance at the app.
 */
const MIN_INTERVAL_MS = 60_000;

let lastRunAt = 0;
let inflight = false;

async function runOnce(): Promise<void> {
  if (inflight) return;
  const now = Date.now();
  if (now - lastRunAt < MIN_INTERVAL_MS) return;

  const { user, isAuthenticated } = useAuthStore.getState();
  if (!isAuthenticated || !user) return;

  const { healthConnectAvailable, permissionsGranted } = useDailyStatsStore.getState();
  if (!healthConnectAvailable || !permissionsGranted) return;

  inflight = true;
  lastRunAt = now;
  try {
    const summary = await importRecentWorkouts({ dateOfBirth: user.dateOfBirth });
    if (summary.imported > 0) {
      useImportEventsStore.getState().recordImport(summary);
      // Today's effort + BioCharge already absorb HC HR samples directly;
      // this nudges the cached dashboard so the workout-kcal-by-date map
      // picks up the freshly-imported rows.
      void useDailyStatsStore.getState().refetch();
    }
  } catch {
    // Swallow — next 'active' transition will retry. We don't want a
    // network blip to surface as a banner.
  } finally {
    inflight = false;
  }
}

export function useHCAutoImport(): void {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const permissionsGranted = useDailyStatsStore((s) => s.permissionsGranted);

  // Boot run: fire once when both gates flip true. Subsequent runs are
  // driven by the AppState listener below.
  useEffect(() => {
    if (!isAuthenticated || !permissionsGranted) return;
    void runOnce();
  }, [isAuthenticated, permissionsGranted]);

  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === 'active') void runOnce();
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, []);
}
