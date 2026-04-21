/**
 * Real-time BLE connection to the Helio Strap during active workout sessions.
 * Reads the standard GATT Heart Rate Service (UUID 0x180D).
 * Only active during workouts — not running in the background permanently.
 * Android only.
 */

import { BleManager, type Device, type Subscription } from 'react-native-ble-plx';
import { PermissionsAndroid, Platform } from 'react-native';
import { getHeartRateZone } from '@openfit/fitness-core';
import type { HeartRateSample, HeartRateZone } from '@openfit/types';
import { Buffer } from 'buffer';

const HEART_RATE_SERVICE_UUID = '0000180d-0000-1000-8000-00805f9b34fb';
const HEART_RATE_MEASUREMENT_UUID = '00002a37-0000-1000-8000-00805f9b34fb';

const MAX_RECONNECT_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 1000;

export type BLEConnectionState =
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

export interface BLEService {
  connect(onStateChange: (state: BLEConnectionState) => void): Promise<void>;
  subscribeToHeartRate(
    maxHR: number,
    onSample: (sample: HeartRateSample) => void,
  ): () => void;
  disconnect(): Promise<void>;
  getState(): BLEConnectionState;
}

// Singleton BleManager — one instance across the app lifetime
let managerInstance: BleManager | null = null;

function getManager(): BleManager {
  if (!managerInstance) {
    managerInstance = new BleManager();
  }
  return managerInstance;
}

/**
 * Parse the Heart Rate Measurement characteristic value per Bluetooth spec.
 * Bit 0 of flags byte: 0 = HR is UINT8, 1 = HR is UINT16.
 */
function parseHeartRate(base64Value: string): number {
  const bytes = Buffer.from(base64Value, 'base64');
  const flags = bytes[0] as number;
  const isUint16 = (flags & 0x01) === 1;

  if (isUint16) {
    return bytes.readUInt16LE(1);
  }
  return bytes[1] as number;
}

async function requestBLEPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  const apiLevel = Platform.Version;

  if (apiLevel >= 31) {
    // Android 12+: need BLUETOOTH_SCAN and BLUETOOTH_CONNECT
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);
    return (
      result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED &&
      result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED
    );
  }

  // Android < 12: need ACCESS_FINE_LOCATION for BLE scanning
  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  );
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export function createBLEService(): BLEService {
  const manager = getManager();
  let state: BLEConnectionState = 'idle';
  let connectedDevice: Device | null = null;
  let hrSubscription: Subscription | null = null;
  let disconnectSubscription: Subscription | null = null;
  let stateCallback: ((state: BLEConnectionState) => void) | null = null;
  let reconnectAttempts = 0;

  function setState(newState: BLEConnectionState): void {
    state = newState;
    stateCallback?.(newState);
  }

  async function connectToDevice(device: Device): Promise<void> {
    setState('connecting');
    const connected = await device.connect();
    await connected.discoverAllServicesAndCharacteristics();
    connectedDevice = connected;
    reconnectAttempts = 0;
    setState('connected');

    // Watch for disconnects to trigger reconnection
    disconnectSubscription = manager.onDeviceDisconnected(
      connected.id,
      async (_error, _device) => {
        if (state === 'idle') return; // intentional disconnect
        await attemptReconnect(device);
      },
    );
  }

  async function attemptReconnect(device: Device): Promise<void> {
    setState('disconnected');

    while (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      const delayMs = BACKOFF_BASE_MS * Math.pow(2, reconnectAttempts - 1);

      await new Promise((resolve) => setTimeout(resolve, delayMs));

      try {
        await connectToDevice(device);
        return;
      } catch {
        // retry
      }
    }

    setState('error');
  }

  return {
    async connect(onStateChange): Promise<void> {
      stateCallback = onStateChange;

      const granted = await requestBLEPermissions();
      if (!granted) {
        setState('error');
        throw new Error('Bluetooth permissions not granted');
      }

      setState('scanning');
      console.log('[BLE] Starting scan for Heart Rate Service...');

      return new Promise<void>((resolve, reject) => {
        let found = false;

        manager.startDeviceScan(
          [HEART_RATE_SERVICE_UUID],
          { allowDuplicates: false },
          async (error, device) => {
            if (error) {
              console.log('[BLE] Scan error:', error.message);
              setState('error');
              reject(error);
              return;
            }

            if (device && !found) {
              console.log('[BLE] Found device:', device.name ?? device.id);
              found = true;
              manager.stopDeviceScan();

              try {
                await connectToDevice(device);
                resolve();
              } catch (connectError) {
                setState('error');
                reject(connectError);
              }
            }
          },
        );
      });
    },

    subscribeToHeartRate(maxHR, onSample): () => void {
      if (!connectedDevice) {
        throw new Error('No device connected. Call connect() first.');
      }

      hrSubscription = connectedDevice.monitorCharacteristicForService(
        HEART_RATE_SERVICE_UUID,
        HEART_RATE_MEASUREMENT_UUID,
        (error, characteristic) => {
          if (error || !characteristic?.value) return;

          const bpm = parseHeartRate(characteristic.value);
          const zone: HeartRateZone = getHeartRateZone(bpm, maxHR);

          const sample: HeartRateSample = {
            timestamp: new Date(),
            bpm,
            zone,
          };

          onSample(sample);
        },
      );

      return () => {
        hrSubscription?.remove();
        hrSubscription = null;
      };
    },

    async disconnect(): Promise<void> {
      const currentState = state;
      setState('idle');

      disconnectSubscription?.remove();
      disconnectSubscription = null;

      hrSubscription?.remove();
      hrSubscription = null;

      if (
        connectedDevice &&
        currentState === 'connected'
      ) {
        try {
          await connectedDevice.cancelConnection();
        } catch {
          // Device may already be disconnected
        }
      }

      connectedDevice = null;
    },

    getState(): BLEConnectionState {
      return state;
    },
  };
}
