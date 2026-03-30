/**
 * Calculates average pace in seconds per kilometer.
 * Returns null if distance is zero (pace is undefined at rest).
 */
export function calculatePace(
  distanceMeters: number,
  durationSeconds: number,
): number | null {
  if (distanceMeters < 0) throw new RangeError(`Distance must be non-negative`);
  if (durationSeconds < 0) throw new RangeError(`Duration must be non-negative`);
  if (distanceMeters === 0) return null;

  const distanceKm = distanceMeters / 1000;
  return durationSeconds / distanceKm;
}

/**
 * Formats a pace value (seconds per km) into a human-readable string.
 * e.g. 272 → "4:32 /km"
 */
export function formatPace(secondsPerKm: number): string {
  if (secondsPerKm <= 0) throw new RangeError(`Pace must be positive, got ${secondsPerKm}`);

  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.round(secondsPerKm % 60);
  const paddedSeconds = seconds.toString().padStart(2, '0');
  return `${minutes}:${paddedSeconds} /km`;
}

/**
 * Calculates total elevation gain from a series of altitude readings in meters.
 * Only uphill segments are accumulated (downhill sections are ignored).
 * Uses a 1-meter noise threshold to filter GPS altitude jitter.
 */
export function calculateElevationGain(altitudes: number[]): number {
  if (altitudes.length < 2) return 0;

  const NOISE_THRESHOLD = 1; // meters — filters GPS altitude jitter
  let gain = 0;

  for (let i = 1; i < altitudes.length; i++) {
    const delta = (altitudes[i] as number) - (altitudes[i - 1] as number);
    if (delta > NOISE_THRESHOLD) {
      gain += delta;
    }
  }

  return gain;
}
