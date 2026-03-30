import { useState, useEffect, useRef } from 'react';
import type { HeartRateSample } from '@openfit/types';

export function useRealtimeHeartRate(): {
  sample: HeartRateSample | null;
  isConnected: boolean;
  error: Error | null;
} {
  const [sample, setSample] = useState<HeartRateSample | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error] = useState<Error | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Simulate BLE data for development without a physical device
    setIsConnected(true);
    intervalRef.current = setInterval(() => {
      const bpm = Math.floor(60 + Math.random() * 80);
      setSample({
        timestamp: new Date(),
        bpm,
        zone: bpm < 95 ? 'rest' : bpm < 123 ? 'fat_burn' : bpm < 152 ? 'cardio' : bpm < 171 ? 'peak' : 'max',
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return { sample, isConnected, error };
}
