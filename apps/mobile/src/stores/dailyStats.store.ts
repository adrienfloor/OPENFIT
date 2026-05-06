import { create } from 'zustand';
import type { WorkoutLog } from '@openfit/types';
import type { TodayDailyStats } from '../services/healthConnect';
import { apiClient } from '../services/api';
import { useAuthStore } from './auth.store';

/**
 * Single source of truth for today's Health-Connect-backed dashboard.
 *
 * Why a store and not a per-tab hook: the four Home sub-tabs each used to
 * spawn their own useDailyStats instance. Every tab visit re-mounted the
 * hook with `today === null` and started a fresh fetch — the rings flashed
 * back to "—" / mock fallbacks (BioCharge mocked at 58, Sleep at 70) until
 * the fetch resolved. Switching tabs visibly bounced.
 *
 * Now: one fetch loop owned by this store, one cached snapshot, every
 * sub-tab subscribes. After the very first cold-start fetch, `today` only
 * ever moves forward — refetches don't clear it, errors don't clear it,
 * tab switches don't trigger fetches at all.
 */

interface DailyStatsState {
  today: TodayDailyStats | null;
  loading: boolean;
  error: Error | null;
  healthConnectAvailable: boolean | null;
  permissionsGranted: boolean;
  /** True until the first fetch resolves (success or failure). */
  hasEverLoaded: boolean;

  /** Bootstraps HC + checks granted permissions. Idempotent. */
  init: () => Promise<void>;
  /** Manual permission request flow (only call from the connect button). */
  requestPermissions: () => Promise<void>;
  /** Refetches today's dashboard. Does NOT clear `today` while in-flight. */
  refetch: () => Promise<void>;
}

let initOncePromise: Promise<void> | null = null;
let inFlightFetch: Promise<void> | null = null;

export const useDailyStatsStore = create<DailyStatsState>((set, get) => ({
  today: null,
  loading: false,
  error: null,
  healthConnectAvailable: null,
  permissionsGranted: false,
  hasEverLoaded: false,

  init: async () => {
    // Hoisting check so concurrent subscribers all share the same boot.
    if (initOncePromise) return initOncePromise;
    initOncePromise = (async () => {
      try {
        const { initializeHealthConnect, REQUIRED_PERMISSION_COUNT } =
          await import('../services/healthConnect');
        const available = await initializeHealthConnect();
        set({ healthConnectAvailable: available });
        if (!available) {
          set({ hasEverLoaded: true });
          return;
        }

        const { getGrantedPermissions } = await import('react-native-health-connect');
        const granted = await getGrantedPermissions();
        const hasAll = granted.length >= REQUIRED_PERMISSION_COUNT;
        set({ permissionsGranted: hasAll });
        if (hasAll) {
          await get().refetch();
        } else {
          // No permissions = nothing to load, but mark as "loaded" so the
          // UI can render the connect-health prompt instead of a spinner.
          set({ hasEverLoaded: true });
        }
      } catch {
        set({ healthConnectAvailable: false, hasEverLoaded: true });
      }
    })();
    return initOncePromise;
  },

  requestPermissions: async () => {
    try {
      const { requestHealthPermissions } = await import('../services/healthConnect');
      const granted = await requestHealthPermissions();
      set({ permissionsGranted: granted });
      if (granted) {
        await get().refetch();
      }
    } catch (err) {
      set({ error: err instanceof Error ? err : new Error('permission request failed') });
    }
  },

  refetch: async () => {
    // Coalesce concurrent refetches — if two tabs both pull-to-refresh at
    // once, we run a single network call.
    if (inFlightFetch) return inFlightFetch;
    inFlightFetch = (async () => {
      const { permissionsGranted, healthConnectAvailable } = get();
      if (!permissionsGranted || !healthConnectAvailable) {
        set({ hasEverLoaded: true });
        return;
      }
      set({ loading: true, error: null });
      try {
        const { getTodayDashboard } = await import('../services/healthConnect');
        const user = useAuthStore.getState().user;
        const profile = user
          ? {
              weightKg: user.weightKg,
              heightCm: user.heightCm,
              sex: user.sex,
              dateOfBirth: new Date(user.dateOfBirth),
            }
          : undefined;
        const { workoutKcalByDate, todaysWorkouts } = await fetchWorkoutKcalByDate().catch(
          () => ({ workoutKcalByDate: {} as Record<string, number>, todaysWorkouts: [] }),
        );
        // VO₂max feeds the cold-start fallback for dailyEffortTarget when CTL
        // hasn't matured yet. Best-effort — null if /metrics/fitness-age fails
        // or the user hasn't logged a qualifying run.
        const { getFitnessAge } = await import('../services/metrics');
        // Pull 42 days of persisted daily TRIMP up-front so the PMC layer
        // sees real history (not just the local 7-day HC slice). Best-effort
        // — null on failure means we fall back to the 7-day series and the
        // calibrating flag stays on, which is the correct UX in that case.
        const [fitnessAge, trimpHistory] = await Promise.all([
          getFitnessAge().catch(() => null),
          apiClient
            .get<{ date: string; dailyTrimp: number | null }[]>(
              '/health/trimp?days=42',
            )
            .then((res) => res.data)
            .catch(() => null),
        ]);
        const result = await getTodayDashboard(
          profile,
          workoutKcalByDate,
          fitnessAge?.vo2max ?? null,
          trimpHistory,
          todaysWorkouts,
        );

        // Persist the 7 freshly computed daily TRIMP values so the next
        // refresh sees them in the 42-day history. Fire-and-forget — we
        // don't block the UI on this. The bulk endpoint upserts by
        // (userId, date), so re-sending the same window is idempotent.
        if (result?.effortLoad7Days?.length) {
          const entries = result.effortLoad7Days
            .filter((d) => d.trimp != null)
            .map((d) => ({
              date: d.date.toISOString().slice(0, 10),
              dailyTrimp: d.trimp,
            }));
          if (entries.length > 0) {
            void apiClient
              .post('/health/bulk', { entries })
              .catch(() => {
                // Swallow — next refresh will retry.
              });
          }
        }
        // Critical: only overwrite `today` with a non-null result. A
        // transient HC blip that returns null shouldn't wipe the rings.
        if (result != null) {
          set({ today: result });
        }
      } catch (err) {
        set({
          error: err instanceof Error ? err : new Error('Failed to fetch daily stats'),
        });
      } finally {
        set({ loading: false, hasEverLoaded: true });
      }
    })();
    try {
      await inFlightFetch;
    } finally {
      inFlightFetch = null;
    }
  },
}));

interface WorkoutFetchResult {
  workoutKcalByDate: Record<string, number>;
  todaysWorkouts: {
    type: string;
    startedAt: Date;
    completedAt: Date | null;
    durationSeconds: number | null;
    caloriesBurned: number | null;
  }[];
}

async function fetchWorkoutKcalByDate(): Promise<WorkoutFetchResult> {
  const res = await apiClient.get<WorkoutLog[]>('/workouts/logs');
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const todayKey = new Date().toISOString().slice(0, 10);

  const map: Record<string, number> = {};
  const todays: WorkoutFetchResult['todaysWorkouts'] = [];
  for (const log of res.data) {
    if (log.completedAt == null) continue;
    const completed = new Date(log.completedAt);
    if (completed < cutoff) continue;
    const key = completed.toISOString().slice(0, 10);
    if (log.caloriesBurned != null) {
      map[key] = (map[key] ?? 0) + log.caloriesBurned;
    }
    if (key === todayKey) {
      todays.push({
        type: log.type,
        startedAt: new Date(log.startedAt),
        completedAt: completed,
        durationSeconds: log.durationSeconds,
        caloriesBurned: log.caloriesBurned,
      });
    }
  }
  return { workoutKcalByDate: map, todaysWorkouts: todays };
}
