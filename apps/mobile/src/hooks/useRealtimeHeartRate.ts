import { useState, useEffect, useRef, useCallback } from 'react';
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

  const handleSample = useCallback((sample: HeartRateSample) => {
    samplesRef.current.push(sample);
    setBpm(sample.bpm);
    setZone(sample.zone);
  }, []);

  useEffect(() => {
    const service = createBLEService();
    serviceRef.current = service;

    let unsubscribeHR: (() => void) | null = null;

    service
      .connect((newState) => {
        setConnectionState(newState);

        if (newState === 'connected' && !unsubscribeHR) {
          unsubscribeHR = service.subscribeToHeartRate(maxHR, handleSample);
        }
      })
      .catch(() => {
        setConnectionState('error');
      });

    return () => {
      unsubscribeHR?.();
      service.disconnect();
    };
  }, [maxHR, handleSample]);

  return {
    bpm,
    zone,
    connectionState,
    get samples() {
      return samplesRef.current;
    },
  };
}
