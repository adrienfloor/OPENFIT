import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getFitnessAge, type FitnessAgeResponse } from '../services/metrics';

interface State {
  data: FitnessAgeResponse | null;
  loading: boolean;
  error: string | null;
}

/**
 * Pulls the user's Fitness Age + VO₂max from `/metrics/fitness-age`.
 * Refetches whenever the screen owning this hook is focused, so logging
 * a hard run on the workout tab and bouncing back to Today shows the
 * updated number.
 */
export function useFitnessAge(): State & { refetch: () => Promise<void> } {
  const [state, setState] = useState<State>({ data: null, loading: true, error: null });

  const refetch = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await getFitnessAge();
      setState({ data, loading: false, error: null });
    } catch (err) {
      setState({
        data: null,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load Fitness Age',
      });
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  return { ...state, refetch };
}
