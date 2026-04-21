import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import type { HeartRateSample, HeartRateZone } from '@openfit/types';
import {
  createBLEService,
  type BLEConnectionState,
  type BLEService,
} from '../services/ble';

export function useRealtimeHeartRate(maxHR: number): {
  bpm: number | null;
  zone: HeartRateZone | null;
  connectionState: BLEConnectionState;
  samples: HeartRateSample[];
} {
  const [bpm, setBpm] = useState<number | null>(null);
  const [zone, setZone] = useState<HeartRateZone | null>(null);
  const [connectionState, setConnectionState] =
    useState<BLEConnectionState>('idle');

  const samplesRef = useRef<HeartRateSample[]>([]);
  const serviceRef = useRef<BLEService | null>(null);
  const unsubscribeHRRef = useRef<(() => void) | null>(null);
  const mountedRef = useRef(true);

  const handleSample = useCallback((sample: HeartRateSample) => {
    samplesRef.current.push(sample);
    if (mountedRef.current) {
      setBpm(sample.bpm);
      setZone(sample.zone);
    }
  }, []);

  // Resubscribe to HR notifications (used after foregrounding)
  const resubscribe = useCallback(() => {
    const service = serviceRef.current;
    if (!service || service.getState() !== 'connected') return;

    console.log('[BLE] Resubscribing to HR notifications...');
    // Remove old subscription
    unsubscribeHRRef.current?.();
    // Create new subscription
    unsubscribeHRRef.current = service.subscribeToHeartRate(maxHR, handleSample);
  }, [maxHR, handleSample]);

  useEffect(() => {
    mountedRef.current = true;
    const service = createBLEService();
    serviceRef.current = service;

    service
      .connect((newState) => {
        if (!mountedRef.current) return;
        setConnectionState(newState);

        if (newState === 'connected') {
          unsubscribeHRRef.current?.();
          unsubscribeHRRef.current = service.subscribeToHeartRate(maxHR, handleSample);
        }
      })
      .catch(() => {
        if (mountedRef.current) setConnectionState('error');
      });

    // Resubscribe when app returns to foreground
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        resubscribe();
      }
    });

    return () => {
      mountedRef.current = false;
      subscription.remove();
      unsubscribeHRRef.current?.();
      service.disconnect();
    };
  }, [maxHR, handleSample, resubscribe]);

  return {
    bpm,
    zone,
    connectionState,
    get samples() {
      return samplesRef.current;
    },
  };
}
