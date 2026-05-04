import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  getTodayInsight,
  type InsightFocus,
  type InsightOutput,
} from '../services/insights';

interface State {
  data: InsightOutput | null;
  loading: boolean;
  error: string | null;
}

/**
 * Pulls a Today-tab insight from `/insights/today?focus=…`. The endpoint
 * is server-side cached on (userId, focus, day, lastEventStamp) so
 * refresh-on-focus doesn't burn LLM tokens — a fresh call only generates
 * if a workout / health write has advanced the event stamp since.
 */
export function useTodayInsight(focus: InsightFocus = 'general'):
  State & { refetch: () => Promise<void> } {
  const [state, setState] = useState<State>({
    data: null,
    loading: true,
    error: null,
  });

  const refetch = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await getTodayInsight(focus);
      setState({ data, loading: false, error: null });
    } catch (err) {
      setState({
        data: null,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load insight',
      });
    }
  }, [focus]);

  // useFocusEffect fires on initial mount AND every subsequent focus,
  // so a separate useEffect would just double-fire on mount and cause
  // two parallel /insights/today calls — the second one races against
  // the unique-key INSERT on the server. One trigger is enough.
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  return { ...state, refetch };
}
