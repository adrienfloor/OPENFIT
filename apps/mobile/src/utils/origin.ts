/**
 * Health Connect dataOrigin (a writer's Android package name) → user-
 * facing label. Used by the import toast, the History source chip,
 * and the workout detail's "From X" footer so the same writer renders
 * consistently across surfaces.
 *
 * Falls back to the package's last segment with a capitalized first
 * letter, which is a far better default than the raw
 * `com.foo.bar.MobileApp` string.
 */
const ORIGIN_LABELS: Record<string, string> = {
  'com.garmin.android.apps.connectmobile': 'Garmin',
  'com.strava': 'Strava',
  'com.huami.watch.hmwatchmanager': 'Zepp',
  'com.xiaomi.hm.health': 'Zepp',
  'com.fitbit.FitbitMobile': 'Fitbit',
  'com.samsung.health': 'Samsung Health',
  'com.google.android.apps.fitness': 'Google Fit',
  'com.coros.coros': 'Coros',
  'fi.polar.polarflow': 'Polar',
  'com.suunto.movescountmobile': 'Suunto',
};

export function friendlyOrigin(packageName: string | null | undefined): string {
  if (!packageName) return 'Connected app';
  if (ORIGIN_LABELS[packageName]) return ORIGIN_LABELS[packageName]!;
  const last = packageName.split('.').pop() ?? packageName;
  return last.charAt(0).toUpperCase() + last.slice(1);
}
