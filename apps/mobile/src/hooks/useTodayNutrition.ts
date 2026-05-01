import { useCallback, useEffect, useState } from 'react';
import type { FoodLog, MacroTargets, MacroTotals } from '@openfit/types';
import { sumDayTotals } from '@openfit/fitness-core';
import { listFoodLogs, getMacroTargets } from '../services/nutrition';

export interface TodayNutrition {
  logs: FoodLog[];
  totals: MacroTotals;
  targets: MacroTargets | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

function todayBounds(): { from: Date; to: Date } {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

export function useTodayNutrition(): TodayNutrition {
  const [logs, setLogs] = useState<FoodLog[]>([]);
  const [targets, setTargets] = useState<MacroTargets | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [trigger, setTrigger] = useState(0);

  const refetch = useCallback(() => setTrigger((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    async function fetchAll() {
      setLoading(true);
      setError(null);
      try {
        const [todaysLogs, t] = await Promise.all([
          listFoodLogs(todayBounds()),
          getMacroTargets(),
        ]);
        if (cancelled) return;
        setLogs(todaysLogs);
        setTargets(t);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err : new Error('Failed to load nutrition'),
        );
        setLogs([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchAll();
    return () => {
      cancelled = true;
    };
  }, [trigger]);

  const totals = sumDayTotals(logs);

  return { logs, totals, targets, loading, error, refetch };
}
