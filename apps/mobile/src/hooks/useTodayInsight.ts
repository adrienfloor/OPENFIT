import { useCallback, useEffect, useState } from 'react';
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
 * Module-level cache shared across all useTodayInsight instances. Each
 * Home sub-tab mounts its own AIInsightCard hook; without a shared
 * cache, switching tabs would briefly flash the card's loading spinner
 * at the top of the screen. We keep the latest payload per focus in
 * module scope and seed every new hook with it; subsequent refetches
 * silently swap in fresher data without ever clearing the visible
 * brief.
 */
const cachedInsights: Partial<Record<InsightFocus, InsightOutput>> = {};
const cacheSubscribers: Map<
  InsightFocus,
  Set<(t: InsightOutput | null) => void>
> = new Map();

function subscribe(
  focus: InsightFocus,
  fn: (t: InsightOutput | null) => void,
): () => void {
  let set = cacheSubscribers.get(focus);
  if (!set) {
    set = new Set();
    cacheSubscribers.set(focus, set);
  }
  set.add(fn);
  return () => {
    set?.delete(fn);
  };
}

function publish(focus: InsightFocus, value: InsightOutput): void {
  cachedInsights[focus] = value;
  cacheSubscribers.get(focus)?.forEach((fn) => fn(value));
}

/**
 * Pulls a Today-tab insight from `/insights/today?focus=…`. The endpoint
 * is server-side cached on (userId, focus, day, lastEventStamp) so
 * refresh-on-focus doesn't burn LLM tokens — a fresh call only generates
 * if a workout / health write has advanced the event stamp since.
 */
export function useTodayInsight(focus: InsightFocus = 'general'):
  State & { refetch: () => Promise<void> } {
  const [state, setState] = useState<State>(() => ({
    data: cachedInsights[focus] ?? null,
    // First mount with no cached value still wants to show a loading
    // signal; once cached, we skip the loading state entirely so the
    // card shows the cached headline immediately.
    loading: cachedInsights[focus] == null,
    error: null,
  }));

  // Subscribe to module-level cache updates so a fetch in one hook
  // instance lights up every other instance instantly.
  useEffect(() => {
    const unsub = subscribe(focus, (value) => {
      if (value != null) setState({ data: value, loading: false, error: null });
    });
    return unsub;
  }, [focus]);

  const refetch = useCallback(async () => {
    // Don't blow away cached data with a `loading: true` flash — keep
    // the previous value visible while we re-fetch in the background.
    setState((s) => ({ ...s, loading: s.data == null, error: null }));
    try {
      const data = await getTodayInsight(focus);
      publish(focus, data);
      setState({ data, loading: false, error: null });
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load insight',
      }));
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
