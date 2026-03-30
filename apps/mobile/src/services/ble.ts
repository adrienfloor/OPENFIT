/**
 * Terra RT real-time BLE streaming wrapper — scaffolded for Phase 2.
 */
export interface BLEHeartRateReading {
  bpm: number;
  timestamp: Date;
}

export type BLEListener = (reading: BLEHeartRateReading) => void;

let _listener: BLEListener | null = null;

export function startBLEStream(onReading: BLEListener): void {
  _listener = onReading;
}

export function stopBLEStream(): void {
  _listener = null;
}
