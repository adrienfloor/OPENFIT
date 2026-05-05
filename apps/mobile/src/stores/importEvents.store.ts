import { create } from 'zustand';
import type { ImportSummary } from '../services/healthConnectImport';
import { friendlyOrigin } from '../utils/origin';

/**
 * Lightweight pub/sub for Health-Connect-import side effects.
 *
 *   - `lastImportedAt` is bumped after every successful import (any
 *     imported>0). Screens that show server-backed lists (e.g. the
 *     Exercise tab's history) subscribe and refetch when it advances.
 *   - `toast` carries a transient string surfaced by ImportToast in
 *     the root layout. Auto-clears on dismiss; we don't queue —
 *     a second import while one's still visible just replaces the
 *     message (rare in practice and the latest is the one the user
 *     cares about).
 *
 * Single store rather than a context provider so non-React modules
 * (the AppState listener in useHCAutoImport) can publish without
 * needing a hook.
 */
interface ToastPayload {
  message: string;
  /** Monotonic key so the renderer can re-trigger fade-in on replace. */
  key: number;
}

interface ImportEventsState {
  lastImportedAt: number | null;
  toast: ToastPayload | null;
  recordImport: (summary: ImportSummary) => void;
  /**
   * Signal a non-import data mutation (e.g. user reclassified a workout's
   * type from the detail modal). Bumps `lastImportedAt` so subscribers
   * refetch, but does not surface a toast.
   */
  bumpDataStale: () => void;
  dismissToast: () => void;
}

let toastKey = 0;

function summarize(summary: ImportSummary): string {
  const { imported, byOrigin } = summary;
  const noun = imported === 1 ? 'workout' : 'workouts';
  const origins = Object.keys(byOrigin);
  if (origins.length === 1) {
    const label = friendlyOrigin(origins[0]!);
    return `Imported ${imported} ${noun} from ${label}`;
  }
  return `Imported ${imported} ${noun}`;
}

export const useImportEventsStore = create<ImportEventsState>((set) => ({
  lastImportedAt: null,
  toast: null,

  recordImport: (summary) => {
    if (summary.imported <= 0) return;
    toastKey += 1;
    set({
      lastImportedAt: Date.now(),
      toast: { message: summarize(summary), key: toastKey },
    });
  },

  bumpDataStale: () => set({ lastImportedAt: Date.now() }),

  dismissToast: () => set({ toast: null }),
}));
