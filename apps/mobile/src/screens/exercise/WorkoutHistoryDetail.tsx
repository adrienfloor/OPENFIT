import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Loader } from '../../components/Loader';
import MapLibreGL, { setConnected } from '@maplibre/maplibre-react-native';
import type { WorkoutSource, WorkoutType } from '@openfit/types';
import { DetailModal } from '../../components/DetailModal';
import { apiClient } from '../../services/api';
import { formatDuration } from '../../utils';
import { friendlyOrigin } from '../../utils/origin';
import { colors, spacing, radii, typography } from '../../theme';

setConnected(true);

interface GPSPoint {
  lat: number;
  lng: number;
  altitudeMeters: number;
}

interface HeartRateSample {
  bpm: number;
  zone: string;
}

interface WorkoutLogDetail {
  id: string;
  type: WorkoutType;
  source: WorkoutSource;
  dataOrigin: string | null;
  startedAt: string;
  completedAt: string | null;
  caloriesBurned: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  avgPaceSecondsPerKm: number | null;
  bestPaceSecondsPerKm: number | null;
  elevationGainMeters: number | null;
  session: { name: string } | null;
  exerciseLogs: {
    exercise: { name: string };
    completedSets: { reps: number; weight: number }[];
  }[];
  gpsPoints: GPSPoint[];
  heartRateSamples: HeartRateSample[];
}

interface Props {
  visible: boolean;
  onClose: () => void;
  workoutId: string | null;
}

const TYPE_COLOR: Record<WorkoutType, string> = {
  strength: colors.strength,
  run: colors.run,
  free: colors.free,
  bike: colors.bike,
  swim: colors.swim,
  hike: colors.hike,
  walk: colors.walk,
  other: colors.other,
};

const TYPE_LABEL: Record<WorkoutType, string> = {
  strength: 'Strength',
  run: 'Run',
  free: 'Free',
  bike: 'Bike',
  swim: 'Swim',
  hike: 'Hike',
  walk: 'Walk',
  other: 'Other',
};

function formatPace(secondsPerKm: number | null): string {
  if (secondsPerKm == null) return '—';
  const m = Math.floor(secondsPerKm / 60);
  const s = Math.round(secondsPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatTime(d: string | Date): string {
  return new Date(d).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Rich workout-history drill-in. Loads the full log on demand (so the
 * list endpoint can stay light) and renders type-specific content:
 *
 *   - Strength → exercise/sets table
 *   - Run     → MapLibre route + pace + elevation
 *   - All     → HR avg/max + duration + calories
 *
 * Drives both the Exercise tab's history list and the Effort tab's
 * workout-row drill-ins via shared route.
 */
export function WorkoutHistoryDetail({ visible, onClose, workoutId }: Props) {
  const [log, setLog] = useState<WorkoutLogDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !workoutId) {
      setLog(null);
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await apiClient.get<WorkoutLogDetail>(`/workouts/logs/${workoutId}`);
        if (!cancelled) setLog(res.data);
      } catch {
        // empty state — modal still renders headers
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [visible, workoutId]);

  if (!visible) return null;

  const distanceKm =
    log?.distanceMeters != null ? log.distanceMeters / 1000 : null;
  const setCount =
    log?.exerciseLogs?.reduce((n, el) => n + el.completedSets.length, 0) ?? 0;

  // HR summary.
  const hrSamples = log?.heartRateSamples ?? [];
  const avgHR =
    hrSamples.length > 0
      ? Math.round(hrSamples.reduce((s, h) => s + h.bpm, 0) / hrSamples.length)
      : null;
  const maxHR = hrSamples.length > 0 ? Math.max(...hrSamples.map((h) => h.bpm)) : null;

  return (
    <DetailModal
      visible={visible}
      onClose={onClose}
      eyebrow={log ? TYPE_LABEL[log.type].toUpperCase() : 'WORKOUT'}
      title={log?.session?.name ?? (log ? TYPE_LABEL[log.type] : 'Workout')}
    >
      {loading || !log ? (
        <View style={styles.loadingWrap}>
          <Loader size={32} />
        </View>
      ) : (
        <>
          {/* Hero stats */}
          <View
            style={[
              styles.heroCard,
              { borderLeftColor: TYPE_COLOR[log.type] },
            ]}
          >
            <View style={styles.heroRow}>
              <HeroStat
                value={log.durationSeconds != null ? formatDuration(log.durationSeconds) : '—'}
                label="duration"
              />
              {log.caloriesBurned != null ? (
                <HeroStat value={`${Math.round(log.caloriesBurned)}`} label="kcal" />
              ) : null}
              {distanceKm != null ? (
                <HeroStat value={distanceKm.toFixed(2)} label="km" />
              ) : null}
              {log.type === 'strength' && setCount > 0 ? (
                <HeroStat value={`${setCount}`} label="sets" />
              ) : null}
            </View>
            <Text style={styles.heroTime}>
              {formatTime(log.startedAt)}
              {log.completedAt ? ` – ${formatTime(log.completedAt)}` : ''}
            </Text>
          </View>

          {/* Run-specific: pace + elevation + map */}
          {log.type === 'run' ? (
            <>
              <View style={styles.metaCard}>
                <MetaRow
                  label="Avg pace"
                  value={`${formatPace(log.avgPaceSecondsPerKm)}/km`}
                />
                <Divider />
                <MetaRow
                  label="Best pace"
                  value={`${formatPace(log.bestPaceSecondsPerKm)}/km`}
                />
                <Divider />
                <MetaRow
                  label="Elevation gain"
                  value={
                    log.elevationGainMeters != null
                      ? `${Math.round(log.elevationGainMeters)} m`
                      : '—'
                  }
                />
              </View>

              {log.gpsPoints.length > 1 ? (
                <View style={styles.mapWrap}>
                  <RunMap points={log.gpsPoints} />
                </View>
              ) : null}
            </>
          ) : null}

          {/* HR summary */}
          {avgHR != null ? (
            <View style={styles.metaCard}>
              <MetaRow label="Avg HR" value={`${avgHR} bpm`} />
              <Divider />
              <MetaRow label="Max HR" value={`${maxHR} bpm`} />
            </View>
          ) : null}

          {/* Source footer for Health-Connect-imported workouts. The
              detail view has no edit affordances today, but this line
              tells the user the row is read-only and where it came
              from — paving the way for "Open in Garmin Connect"-style
              deeplinks later without surprising anyone now. */}
          {log.source === 'health_connect' ? (
            <Text style={styles.sourceFooter}>
              From {friendlyOrigin(log.dataOrigin)} — synced via Health Connect
            </Text>
          ) : null}

          {/* Strength-specific: exercise table */}
          {log.type === 'strength' && log.exerciseLogs.length > 0 ? (
            <>
              <Text style={styles.sectionLabel}>Exercises</Text>
              <View style={styles.exerciseCard}>
                {log.exerciseLogs.map((el, i) => (
                  <View key={i}>
                    {i > 0 ? <Divider /> : null}
                    <View style={styles.exerciseRow}>
                      <Text style={styles.exerciseName}>{el.exercise.name}</Text>
                      <Text style={styles.exerciseSets}>
                        {el.completedSets.length} sets ·{' '}
                        {el.completedSets
                          .map((s) => `${s.reps}×${s.weight}kg`)
                          .join(', ')}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </>
      )}
    </DetailModal>
  );
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.heroStat}>
      <Text style={styles.heroValue}>{value}</Text>
      <Text style={styles.heroLabel}>{label}</Text>
    </View>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

function RunMap({ points }: { points: GPSPoint[] }) {
  const coords = points.map((p) => [p.lng, p.lat] as [number, number]);
  const mid = coords[Math.floor(coords.length / 2)] ?? [0, 0];

  return (
    <MapLibreGL.MapView
      style={{ flex: 1 }}
      styleURL="https://tiles.openfreemap.org/styles/positron"
      logoEnabled={false}
      attributionEnabled={false}
      compassEnabled={false}
    >
      <MapLibreGL.Camera
        centerCoordinate={mid}
        zoomLevel={13}
        animationDuration={0}
      />
      <MapLibreGL.ShapeSource
        id="route"
        shape={{
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
          properties: {},
        }}
      >
        <MapLibreGL.LineLayer
          id="route-glow"
          style={{
            lineColor: colors.run,
            lineWidth: 8,
            lineOpacity: 0.3,
            lineCap: 'round',
            lineJoin: 'round',
          }}
        />
        <MapLibreGL.LineLayer
          id="route-line"
          style={{
            lineColor: colors.run,
            lineWidth: 4,
            lineCap: 'round',
            lineJoin: 'round',
          }}
        />
      </MapLibreGL.ShapeSource>

      {coords.length > 0 ? (
        <MapLibreGL.ShapeSource
          id="start"
          shape={{
            type: 'Feature',
            geometry: { type: 'Point', coordinates: coords[0]! },
            properties: {},
          }}
        >
          <MapLibreGL.CircleLayer
            id="start-pin"
            style={{
              circleRadius: 7,
              circleColor: colors.accent,
              circleStrokeWidth: 3,
              circleStrokeColor: '#ffffff',
            }}
          />
        </MapLibreGL.ShapeSource>
      ) : null}
      {coords.length > 1 ? (
        <MapLibreGL.ShapeSource
          id="end"
          shape={{
            type: 'Feature',
            geometry: { type: 'Point', coordinates: coords[coords.length - 1]! },
            properties: {},
          }}
        >
          <MapLibreGL.CircleLayer
            id="end-pin"
            style={{
              circleRadius: 7,
              circleColor: colors.danger,
              circleStrokeWidth: 3,
              circleStrokeColor: '#ffffff',
            }}
          />
        </MapLibreGL.ShapeSource>
      ) : null}
    </MapLibreGL.MapView>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { paddingVertical: spacing.huge, alignItems: 'center' },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
    borderLeftWidth: 4,
    alignItems: 'center',
  },
  heroRow: { flexDirection: 'row', justifyContent: 'space-around', width: '100%' },
  heroStat: { alignItems: 'center', flex: 1 },
  heroValue: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
    lineHeight: 32,
  },
  heroLabel: {
    fontSize: typography.size.xs - 1,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 4,
  },
  heroTime: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  metaCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm + 2 },
  metaLabel: {
    flex: 1,
    fontSize: typography.size.sm + 1,
    color: colors.textSecondary,
    fontWeight: typography.weight.semibold,
  },
  metaValue: {
    fontSize: typography.size.md,
    color: colors.text,
    fontWeight: typography.weight.bold,
  },
  divider: { height: 1, backgroundColor: colors.borderSubtle },
  mapWrap: {
    height: 240,
    borderRadius: radii.lg,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    fontWeight: typography.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  sourceFooter: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  exerciseCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  exerciseRow: { paddingVertical: spacing.md },
  exerciseName: {
    fontSize: typography.size.sm + 1,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginBottom: 4,
  },
  exerciseSets: {
    fontSize: typography.size.xs + 1,
    color: colors.textSecondary,
  },
});
