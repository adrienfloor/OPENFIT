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
  const mountedRef = useRef(true);

  const handleSample = useCallback((sample: HeartRateSample) => {
    samplesRef.current.push(sample);
    if (mountedRef.current) {
      setBpm(sample.bpm);
      setZone(sample.zone);
    }
  }, []);

  const connectAndSubscribe = useCallback(() => {
    const service = createBLEService();
    serviceRef.current = service;

    let unsubscribeHR: (() => void) | null = null;

    service
      .connect((newState) => {
        if (!mountedRef.current) return;
        setConnectionState(newState);

        if (newState === 'connected' && !unsubscribeHR) {
          unsubscribeHR = service.subscribeToHeartRate(maxHR, handleSample);
        }
      })
      .catch(() => {
        if (mountedRef.current) setConnectionState('error');
      });

    return () => {
      unsubscribeHR?.();
      service.disconnect();
    };
  }, [maxHR, handleSample]);

  useEffect(() => {
    mountedRef.current = true;
    const cleanup = connectAndSubscribe();

    // Reconnect when app comes back to foreground
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && serviceRef.current?.getState() !== 'connected') {
        console.log('[BLE] App foregrounded, reconnecting...');
        cleanup();
        connectAndSubscribe();
      }
    });

    return () => {
      mountedRef.current = false;
      subscription.remove();
      cleanup();
    };
  }, [connectAndSubscribe]);

  return {
    bpm,
    zone,
    connectionState,
    get samples() {
      return samplesRef.current;
    },
  };
}
