import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import { flushSyncQueue, getSyncQueueSize, loadSyncQueue } from '../services/sync';

export function useOfflineSync(): {
  pendingCount: number;
  isSyncing: boolean;
  syncNow: () => Promise<void>;
} {
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshCount = useCallback(async () => {
    const count = await getSyncQueueSize();
    setPendingCount(count);
  }, []);

  const syncNow = useCallback(async () => {
    setIsSyncing(true);
    try {
      await loadSyncQueue();
      await flushSyncQueue();
      await refreshCount();
    } finally {
      setIsSyncing(false);
    }
  }, [refreshCount]);

  // Auto-sync when app comes to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        syncNow();
      }
    });

    return () => subscription.remove();
  }, [syncNow]);

  // Periodic sync every 60 seconds
  useEffect(() => {
    refreshCount();
    intervalRef.current = setInterval(() => {
      syncNow();
    }, 60_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [syncNow, refreshCount]);

  return { pendingCount, isSyncing, syncNow };
}
