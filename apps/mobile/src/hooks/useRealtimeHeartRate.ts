import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import type { HeartRateSample, HeartRateZone } from '@openfit/types';
import {
  createBLEService,
  type BLEConnectionState,
  type BLEService,
  type ScannedDevice,
} from '../services/ble';

/**
 * Window after first device detection during which we wait to see if a second
 * appears. If only one is in the list at the end of the window, we auto-pick
 * it (Helio-only case stays a single tap). If two or more are seen, we stop
 * the timer and surface them via `scannedDevices` so the UI can show a picker.
 */
const AUTOPICK_DELAY_MS = 2500;

export function useRealtimeHeartRate(maxHR: number): {
  bpm: number | null;
  zone: HeartRateZone | null;
  connectionState: BLEConnectionState;
  samples: HeartRateSample[];
  /** Devices currently discoverable via BLE-HR broadcast. */
  scannedDevices: ScannedDevice[];
  /**
   * Explicitly connect to a scanned device by id. Cancels the auto-pick timer
   * and stops the scan. Safe to call only while `connectionState === 'scanning'`
   * — calls after that are no-ops.
   */
  pickDevice: (deviceId: string) => void;
} {
  const [bpm, setBpm] = useState<number | null>(null);
  const [zone, setZone] = useState<HeartRateZone | null>(null);
  const [connectionState, setConnectionState] =
    useState<BLEConnectionState>('idle');
  const [scannedDevices, setScannedDevices] = useState<ScannedDevice[]>([]);

  const samplesRef = useRef<HeartRateSample[]>([]);
  const serviceRef = useRef<BLEService | null>(null);
  const unsubscribeHRRef = useRef<(() => void) | null>(null);
  const stopScanRef = useRef<(() => void) | null>(null);
  const autopickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards both auto-pick and manual-pick so a single workout only ever ends
  // up connecting to one device.
  const pickedRef = useRef(false);
  const mountedRef = useRef(true);

  const handleSample = useCallback((sample: HeartRateSample) => {
    samplesRef.current.push(sample);
    if (mountedRef.current) {
      setBpm(sample.bpm);
      setZone(sample.zone);
    }
  }, []);

  // Resubscribe to HR notifications after the app foregrounds. Android
  // suspends BLE notifications on background; without re-arming we'd see
  // a connected device but no fresh samples.
  const resubscribe = useCallback(() => {
    const service = serviceRef.current;
    if (!service || service.getState() !== 'connected') return;

    console.log('[BLE] Resubscribing to HR notifications...');
    unsubscribeHRRef.current?.();
    unsubscribeHRRef.current = service.subscribeToHeartRate(maxHR, handleSample);
  }, [maxHR, handleSample]);

  const connectTo = useCallback(
    (deviceId: string) => {
      const service = serviceRef.current;
      if (!service || pickedRef.current) return;
      pickedRef.current = true;

      if (autopickTimerRef.current) {
        clearTimeout(autopickTimerRef.current);
        autopickTimerRef.current = null;
      }
      stopScanRef.current?.();
      stopScanRef.current = null;

      service
        .connectToDevice(deviceId, (newState) => {
          if (!mountedRef.current) return;
          setConnectionState(newState);
          if (newState === 'connected') {
            unsubscribeHRRef.current?.();
            unsubscribeHRRef.current = service.subscribeToHeartRate(
              maxHR,
              handleSample,
            );
          }
        })
        .catch(() => {
          if (mountedRef.current) setConnectionState('error');
        });
    },
    [maxHR, handleSample],
  );

  const pickDevice = useCallback(
    (deviceId: string) => {
      connectTo(deviceId);
    },
    [connectTo],
  );

  useEffect(() => {
    mountedRef.current = true;
    const service = createBLEService();
    serviceRef.current = service;

    setConnectionState('scanning');

    service
      .scanForDevices((devices) => {
        if (!mountedRef.current) return;
        setScannedDevices(devices);

        // Two-or-more devices: surface the picker, cancel any auto-pick timer.
        if (devices.length >= 2 && autopickTimerRef.current) {
          clearTimeout(autopickTimerRef.current);
          autopickTimerRef.current = null;
        }
        // First device seen: arm the auto-pick timer (single-device users get
        // a seamless ~2.5s scan-then-connect, no UI prompt).
        if (devices.length === 1 && !autopickTimerRef.current && !pickedRef.current) {
          autopickTimerRef.current = setTimeout(() => {
            autopickTimerRef.current = null;
            if (pickedRef.current || !mountedRef.current) return;
            // Re-check the list — could have grown to 2+ since we armed.
            if (devices.length === 1 && devices[0]) {
              connectTo(devices[0].id);
            }
          }, AUTOPICK_DELAY_MS);
        }
      })
      .then((stopScan) => {
        stopScanRef.current = stopScan;
      })
      .catch(() => {
        if (mountedRef.current) setConnectionState('error');
      });

    const appStateSub = AppState.addEventListener('change', (s) => {
      if (s === 'active') resubscribe();
    });

    return () => {
      mountedRef.current = false;
      appStateSub.remove();
      if (autopickTimerRef.current) {
        clearTimeout(autopickTimerRef.current);
        autopickTimerRef.current = null;
      }
      stopScanRef.current?.();
      stopScanRef.current = null;
      unsubscribeHRRef.current?.();
      service.disconnect();
    };
  }, [connectTo, resubscribe]);

  return {
    bpm,
    zone,
    connectionState,
    scannedDevices,
    pickDevice,
    get samples() {
      return samplesRef.current;
    },
  };
}
