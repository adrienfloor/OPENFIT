import { useCallback, useEffect, useRef, useState } from 'react';
import { Vibration } from 'react-native';

export interface RestTimerState {
  /** Whether a rest is currently being timed. */
  isRunning: boolean;
  /** Seconds remaining; 0 when not running or finished. */
  remainingSeconds: number;
  /** Total duration of the current rest, used for the progress bar. */
  totalSeconds: number;

  /** Start (or restart) a rest timer with the given duration. */
  start: (seconds: number) => void;
  /** Cancel the current rest immediately. */
  skip: () => void;
  /** Add (or subtract, when negative) seconds to the remaining time. */
  adjust: (deltaSeconds: number) => void;
  /** Replace the remaining duration outright (used by the inline editor). */
  setRemaining: (seconds: number) => void;
}

/**
 * Foreground rest timer between strength sets. Vibrates once when the
 * countdown reaches zero. Pure JS interval — does not survive the app being
 * backgrounded; that requires a native foreground service which is out of
 * scope for v1 (the run tracker has one, but lifting rests are short enough
 * that staying in the foreground is acceptable).
 */
export function useRestTimer(): RestTimerState {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const vibratedRef = useRef(false);

  // Tick once a second while a rest is in flight. We compute remaining from
  // `endsAt - now` rather than decrementing a counter so it stays accurate
  // across re-renders and slow ticks.
  useEffect(() => {
    if (endsAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [endsAt]);

  const remainingSeconds = endsAt === null ? 0 : Math.max(0, Math.ceil((endsAt - now) / 1000));
  const isRunning = endsAt !== null && remainingSeconds > 0;

  // Vibrate exactly once per rest when it hits zero.
  useEffect(() => {
    if (endsAt !== null && remainingSeconds === 0 && !vibratedRef.current) {
      Vibration.vibrate(400);
      vibratedRef.current = true;
    }
  }, [endsAt, remainingSeconds]);

  const start = useCallback((seconds: number) => {
    const safe = Math.max(0, Math.round(seconds));
    vibratedRef.current = false;
    setTotalSeconds(safe);
    setEndsAt(Date.now() + safe * 1000);
    setNow(Date.now());
  }, []);

  const skip = useCallback(() => {
    setEndsAt(null);
    setTotalSeconds(0);
  }, []);

  const adjust = useCallback((delta: number) => {
    setEndsAt((prev) => {
      if (prev === null) return prev;
      const next = prev + delta * 1000;
      return Math.max(Date.now(), next);
    });
    setTotalSeconds((prev) => Math.max(0, prev + delta));
  }, []);

  const setRemaining = useCallback((seconds: number) => {
    const safe = Math.max(0, Math.round(seconds));
    vibratedRef.current = safe === 0;
    setTotalSeconds(safe);
    setEndsAt(safe > 0 ? Date.now() + safe * 1000 : null);
    setNow(Date.now());
  }, []);

  return {
    isRunning,
    remainingSeconds,
    totalSeconds,
    start,
    skip,
    adjust,
    setRemaining,
  };
}
