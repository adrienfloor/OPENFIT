import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

const BACKGROUND_LOCATION_TASK = 'openfit-run-tracking';

interface GPSPoint {
  lat: number;
  lng: number;
  altitudeMeters: number;
  timestamp: string;
  speedMps: number;
}

// Shared state accessible from both the task and the UI
let gpsPoints: GPSPoint[] = [];
let totalDistance = 0;
let onUpdateCallback: (() => void) | null = null;

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Register the background task — must be called at module level (outside components)
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, ({ data, error }) => {
  if (error) {
    console.log('[RunTracker] Background task error:', error.message);
    return;
  }

  const locations = (data as { locations: Location.LocationObject[] }).locations;
  if (!locations || locations.length === 0) return;

  console.log(`[RunTracker] Received ${locations.length} location(s), total points: ${gpsPoints.length + locations.length}`);

  for (const location of locations) {
    const point: GPSPoint = {
      lat: location.coords.latitude,
      lng: location.coords.longitude,
      altitudeMeters: location.coords.altitude ?? 0,
      timestamp: new Date(location.timestamp).toISOString(),
      speedMps: Math.max(0, location.coords.speed ?? 0),
    };

    if (gpsPoints.length > 0) {
      const last = gpsPoints[gpsPoints.length - 1]!;
      const d = haversine(last.lat, last.lng, point.lat, point.lng);
      // Filter out GPS noise — ignore jumps > 100m or < 1m
      if (d > 1 && d < 100) {
        totalDistance += d;
      }
    }

    gpsPoints.push(point);
  }

  // Notify UI to update
  onUpdateCallback?.();
});

export async function startRunTracking(): Promise<boolean> {
  // Request foreground permission first
  const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
  if (fgStatus !== 'granted') {
    return false;
  }

  // Request background permission
  const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
  if (bgStatus !== 'granted') {
    console.log('[RunTracker] Background location denied, using foreground only');
    // Fall through — startLocationUpdatesAsync may still work with foreground service
  }

  // Reset state
  gpsPoints = [];
  totalDistance = 0;

  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    distanceInterval: 3,
    timeInterval: 3000,
    deferredUpdatesDistance: 0,
    deferredUpdatesInterval: 0,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'OpenFit — Run in progress',
      notificationBody: 'GPS tracking is active',
      notificationColor: '#22c55e',
    },
  });

  console.log('[RunTracker] Background location tracking started');
  return true;
}

export async function stopRunTracking(): Promise<void> {
  const isTracking = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
  if (isTracking) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    console.log('[RunTracker] Background location tracking stopped');
  }
}

export function getRunData(): { gpsPoints: GPSPoint[]; distance: number } {
  return { gpsPoints: [...gpsPoints], distance: totalDistance };
}

export function resetRunData(): void {
  gpsPoints = [];
  totalDistance = 0;
}

export function setOnUpdateCallback(cb: (() => void) | null): void {
  onUpdateCallback = cb;
}
