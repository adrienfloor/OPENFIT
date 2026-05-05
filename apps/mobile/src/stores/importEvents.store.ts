import { create } from 'zustand';
import type { ImportSummary } from '../services/healthConnectImport';

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

const ORIGIN_LABELS: Record<string, string> = {
  'com.garmin.android.apps.connectmobile': 'Garmin',
  'com.strava': 'Strava',
  'com.huami.watch.hmwatchmanager': 'Zepp',
  'com.xiaomi.hm.health': 'Zepp',
  'com.fitbit.FitbitMobile': 'Fitbit',
  'com.samsung.health': 'Samsung Health',
  'com.google.android.apps.fitness': 'Google Fit',
  'com.coros.coros': 'Coros',
  'fi.polar.polarflow': 'Polar',
  'com.suunto.movescountmobile': 'Suunto',
};

function friendlyOrigin(packageName: string): string {
  if (ORIGIN_LABELS[packageName]) return ORIGIN_LABELS[packageName]!;
  // Fall back to the writer's last segment with a capitalized first letter
  // — better than the raw package name in the toast.
  const last = packageName.split('.').pop() ?? packageName;
  return last.charAt(0).toUpperCase() + last.slice(1);
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

  dismissToast: () => set({ toast: null }),
}));
