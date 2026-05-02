import { useState, useEffect, useCallback, useRef } from 'react';
import type { WorkoutLog } from '@openfit/types';
import type { TodayDailyStats } from '../services/healthConnect';
import { apiClient } from '../services/api';
import { useAuth } from './useAuth';

/**
 * Fetch the last 7 days of workout logs and bucket them by completion date
 * (`YYYY-MM-DD`), summing `caloriesBurned` per bucket. Logs without a
 * `completedAt` or `caloriesBurned` are skipped. The map is consumed by
 * `getDailyStats` to add HR-derived workout kcal to each day's active total.
 */
async function fetchWorkoutKcalByDate(): Promise<Record<string, number>> {
  const res = await apiClient.get<WorkoutLog[]>('/workouts/logs');
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);

  const map: Record<string, number> = {};
  for (const log of res.data) {
    if (log.completedAt == null || log.caloriesBurned == null) continue;
    const completed = new Date(log.completedAt);
    if (completed < cutoff) continue;
    const key = completed.toISOString().slice(0, 10);
    map[key] = (map[key] ?? 0) + log.caloriesBurned;
  }
  return map;
}

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

        // Fetch the same 7-day window of WorkoutLogs so HR-derived workout
        // calories (Keytel) get added on top of the step-based casual
        // estimate inside getDailyStats. Failing this call shouldn't block
        // the dashboard — fall back to a step-only estimate.
        const workoutKcalByDate = await fetchWorkoutKcalByDate().catch(
          () => ({}),
        );
        const result = await getTodayDashboard(profile, workoutKcalByDate);
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
