/**
 * Pure helpers for the Health-Connect → OpenFit workout-import pipeline.
 *
 * These live in fitness-core (rather than the mobile app) so they can be
 * unit-tested in the existing Vitest suite without standing up an RN
 * test runner. The mobile import service composes them with the actual
 * `react-native-health-connect` calls.
 */
import type { GPSPoint, WorkoutType } from '@openfit/types';

/** Health Connect ExerciseType numeric ids → OpenFit WorkoutType. */
export const HC_EXERCISE_TYPE_MAP: Readonly<Record<number, WorkoutType>> = {
  // Running
  56: 'run', // RUNNING
  57: 'run', // RUNNING_TREADMILL
  // Cycling
  8: 'bike', // BIKING
  9: 'bike', // BIKING_STATIONARY
  // Swimming
  73: 'swim', // SWIMMING_OPEN_WATER
  74: 'swim', // SWIMMING_POOL
  // Hiking / walking
  37: 'hike', // HIKING
  79: 'walk', // WALKING
  // Strength
  70: 'strength', // STRENGTH_TRAINING
  81: 'strength', // WEIGHTLIFTING
  // HR-tracked timed sessions that aren't strength or run map to 'free'
  // — the existing OpenFit catch-all for jiu-jitsu / boxing / climbing /
  // HIIT / etc.
  10: 'free', // BOOT_CAMP
  11: 'free', // BOXING
  13: 'free', // CALISTHENICS
  26: 'free', // EXERCISE_CLASS
  36: 'free', // HIGH_INTENSITY_INTERVAL_TRAINING
  44: 'martial_arts', // MARTIAL_ARTS — covers BJJ / judo / boxing / kickboxing
  48: 'free', // PILATES
  51: 'free', // ROCK_CLIMBING
  83: 'free', // YOGA
};

export function mapExerciseTypeToWorkoutType(exerciseType: number): WorkoutType {
  return HC_EXERCISE_TYPE_MAP[exerciseType] ?? 'other';
}

/**
 * react-native-health-connect's runtime payload for a Length is the
 * Kotlin-side `LengthResult` shape — every unit pre-converted, not the
 * `{value, unit}` shape its outdated TypeScript types declare. We accept
 * either to stay forward-compatible if the lib ever fixes its types,
 * but in practice all reads come back as the multi-unit object.
 */
export interface HCLength {
  inMeters?: number;
  inKilometers?: number;
  inMiles?: number;
  inFeet?: number;
  inInches?: number;
  // Legacy / write-side shape — kept so old callers don't break.
  value?: number;
  unit?: string;
}

export function lengthToMeters(length: HCLength | undefined): number | undefined {
  if (!length) return undefined;
  if (typeof length.inMeters === 'number') return length.inMeters;
  if (typeof length.inKilometers === 'number') return length.inKilometers * 1000;
  if (typeof length.inMiles === 'number') return length.inMiles * 1609.344;
  if (typeof length.inFeet === 'number') return length.inFeet * 0.3048;
  if (typeof length.inInches === 'number') return length.inInches * 0.0254;
  if (typeof length.value === 'number') {
    switch (length.unit) {
      case 'meters':
        return length.value;
      case 'kilometers':
        return length.value * 1000;
      case 'miles':
        return length.value * 1609.344;
      case 'feet':
        return length.value * 0.3048;
      case 'inches':
        return length.value * 0.0254;
      default:
        return length.value;
    }
  }
  return undefined;
}

export interface HCEnergy {
  inKilocalories?: number;
  inCalories?: number;
  inKilojoules?: number;
  inJoules?: number;
  value?: number;
  unit?: string;
}

/** Normalize HC's Energy zoo to kcal — runtime returns LengthResult-style
 *  multi-unit objects from Kotlin, not `{value, unit}`. */
export function energyToKcal(energy: HCEnergy): number {
  if (typeof energy.inKilocalories === 'number') return energy.inKilocalories;
  if (typeof energy.inCalories === 'number') return energy.inCalories / 1000;
  if (typeof energy.inKilojoules === 'number') return energy.inKilojoules / 4.184;
  if (typeof energy.inJoules === 'number') return energy.inJoules / 4184;
  if (typeof energy.value === 'number') {
    switch (energy.unit) {
      case 'kilocalories':
        return energy.value;
      case 'calories':
        return energy.value / 1000;
      case 'kilojoules':
        return energy.value / 4.184;
      case 'joules':
        return energy.value / 4184;
      default:
        return energy.value;
    }
  }
  return 0;
}

export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export interface HCLocation {
  time: string;
  latitude: number;
  longitude: number;
  altitude?: HCLength;
}

/**
 * Convert a HC ExerciseRoute's Location[] into OpenFit GPSPoint[],
 * sorted by timestamp and back-filling speed from successive
 * great-circle distance / time deltas (the writer often doesn't
 * include speed samples even when GPS was active).
 */
export function locationsToGPSPoints(locs: HCLocation[] | undefined): GPSPoint[] {
  if (!locs || locs.length === 0) return [];
  const points = locs.map(
    (l): GPSPoint => ({
      lat: l.latitude,
      lng: l.longitude,
      altitudeMeters: lengthToMeters(l.altitude) ?? 0,
      timestamp: new Date(l.time),
      speedMps: 0,
    }),
  );
  points.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    const dt = (curr.timestamp.getTime() - prev.timestamp.getTime()) / 1000;
    if (dt <= 0) continue;
    const meters = haversineMeters(prev.lat, prev.lng, curr.lat, curr.lng);
    curr.speedMps = meters / dt;
  }
  return points;
}
