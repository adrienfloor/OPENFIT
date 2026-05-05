import { describe, it, expect } from 'vitest';
import {
  HC_EXERCISE_TYPE_MAP,
  energyToKcal,
  haversineMeters,
  lengthToMeters,
  locationsToGPSPoints,
  mapExerciseTypeToWorkoutType,
} from '../health-connect-import.js';

describe('mapExerciseTypeToWorkoutType', () => {
  it('maps RUNNING (56) and RUNNING_TREADMILL (57) to run', () => {
    expect(mapExerciseTypeToWorkoutType(56)).toBe('run');
    expect(mapExerciseTypeToWorkoutType(57)).toBe('run');
  });

  it('maps BIKING (8) and BIKING_STATIONARY (9) to bike', () => {
    expect(mapExerciseTypeToWorkoutType(8)).toBe('bike');
    expect(mapExerciseTypeToWorkoutType(9)).toBe('bike');
  });

  it('maps SWIMMING_OPEN_WATER (73) and SWIMMING_POOL (74) to swim', () => {
    expect(mapExerciseTypeToWorkoutType(73)).toBe('swim');
    expect(mapExerciseTypeToWorkoutType(74)).toBe('swim');
  });

  it('maps HIKING (37) to hike, WALKING (79) to walk', () => {
    expect(mapExerciseTypeToWorkoutType(37)).toBe('hike');
    expect(mapExerciseTypeToWorkoutType(79)).toBe('walk');
  });

  it('maps STRENGTH_TRAINING (70) and WEIGHTLIFTING (81) to strength', () => {
    expect(mapExerciseTypeToWorkoutType(70)).toBe('strength');
    expect(mapExerciseTypeToWorkoutType(81)).toBe('strength');
  });

  it('maps HR-tracked timed sessions (HIIT, yoga, boxing, climbing, pilates, etc.) to free', () => {
    expect(mapExerciseTypeToWorkoutType(36)).toBe('free'); // HIGH_INTENSITY_INTERVAL_TRAINING
    expect(mapExerciseTypeToWorkoutType(83)).toBe('free'); // YOGA
    expect(mapExerciseTypeToWorkoutType(11)).toBe('free'); // BOXING
    expect(mapExerciseTypeToWorkoutType(51)).toBe('free'); // ROCK_CLIMBING
    expect(mapExerciseTypeToWorkoutType(48)).toBe('free'); // PILATES
    expect(mapExerciseTypeToWorkoutType(44)).toBe('free'); // MARTIAL_ARTS
    expect(mapExerciseTypeToWorkoutType(13)).toBe('free'); // CALISTHENICS
    expect(mapExerciseTypeToWorkoutType(10)).toBe('free'); // BOOT_CAMP
    expect(mapExerciseTypeToWorkoutType(26)).toBe('free'); // EXERCISE_CLASS
  });

  it('falls back to other for unknown / unmapped enums', () => {
    expect(mapExerciseTypeToWorkoutType(0)).toBe('other'); // OTHER_WORKOUT
    expect(mapExerciseTypeToWorkoutType(2)).toBe('other'); // BADMINTON
    expect(mapExerciseTypeToWorkoutType(76)).toBe('other'); // TENNIS
    expect(mapExerciseTypeToWorkoutType(99999)).toBe('other'); // out of range
  });

  it('every value in the map points at a known WorkoutType (no typos)', () => {
    const valid = new Set([
      'strength',
      'free',
      'run',
      'bike',
      'swim',
      'hike',
      'walk',
      'other',
    ] as const);
    for (const v of Object.values(HC_EXERCISE_TYPE_MAP)) {
      expect(valid.has(v)).toBe(true);
    }
  });
});

describe('lengthToMeters', () => {
  it('passes meters through', () => {
    expect(lengthToMeters({ value: 5000, unit: 'meters' })).toBe(5000);
  });

  it('converts kilometers, miles, feet, inches', () => {
    expect(lengthToMeters({ value: 5, unit: 'kilometers' })).toBe(5000);
    expect(lengthToMeters({ value: 1, unit: 'miles' })).toBeCloseTo(1609.344, 3);
    expect(lengthToMeters({ value: 100, unit: 'feet' })).toBeCloseTo(30.48, 2);
    expect(lengthToMeters({ value: 39.3701, unit: 'inches' })).toBeCloseTo(1.0, 2);
  });

  it('returns undefined when length is missing', () => {
    expect(lengthToMeters(undefined)).toBeUndefined();
  });

  it('falls back to the raw value on an unknown unit string', () => {
    expect(lengthToMeters({ value: 42, unit: 'parsec' })).toBe(42);
  });
});

describe('energyToKcal', () => {
  it('passes kilocalories through', () => {
    expect(energyToKcal({ value: 320, unit: 'kilocalories' })).toBe(320);
  });

  it('converts calories (cal → kcal /1000)', () => {
    expect(energyToKcal({ value: 320_000, unit: 'calories' })).toBe(320);
  });

  it('converts kilojoules and joules', () => {
    expect(energyToKcal({ value: 4.184, unit: 'kilojoules' })).toBeCloseTo(1, 3);
    expect(energyToKcal({ value: 4184, unit: 'joules' })).toBeCloseTo(1, 3);
  });
});

describe('haversineMeters', () => {
  it('returns 0 for identical points', () => {
    expect(haversineMeters(43.3, 5.4, 43.3, 5.4)).toBe(0);
  });

  it('matches a known short distance to ~1 m', () => {
    // ~1 km along Marseille latitude.
    const meters = haversineMeters(43.3, 5.4, 43.3, 5.412368);
    expect(meters).toBeGreaterThan(990);
    expect(meters).toBeLessThan(1010);
  });
});

describe('locationsToGPSPoints', () => {
  it('returns empty for missing or empty input', () => {
    expect(locationsToGPSPoints(undefined)).toEqual([]);
    expect(locationsToGPSPoints([])).toEqual([]);
  });

  it('sorts by timestamp and back-fills speed from successive points', () => {
    // Two locations 10 s apart, ~50 m of separation → ~5 m/s.
    const out = locationsToGPSPoints([
      {
        time: '2026-05-05T08:00:10Z',
        latitude: 43.3001,
        longitude: 5.4001,
        altitude: { value: 30, unit: 'meters' },
      },
      {
        time: '2026-05-05T08:00:00Z',
        latitude: 43.3,
        longitude: 5.4,
        altitude: { value: 25, unit: 'meters' },
      },
    ]);

    expect(out).toHaveLength(2);
    expect(out[0]!.timestamp.toISOString()).toBe('2026-05-05T08:00:00.000Z');
    expect(out[0]!.altitudeMeters).toBe(25);
    // First point keeps speed 0 (no predecessor); second point has speed
    // from the great-circle distance / 10 s.
    expect(out[0]!.speedMps).toBe(0);
    expect(out[1]!.speedMps).toBeGreaterThan(0);
    expect(out[1]!.speedMps).toBeLessThan(50); // sanity
  });

  it('treats missing altitude as 0', () => {
    const out = locationsToGPSPoints([
      { time: '2026-05-05T08:00:00Z', latitude: 43.3, longitude: 5.4 },
    ]);
    expect(out[0]!.altitudeMeters).toBe(0);
  });
});
