import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import MapLibreGL, { setConnected } from '@maplibre/maplibre-react-native';
import type { WorkoutType } from '@openfit/types';
import { apiClient } from '../../services/api';
import { formatDuration } from '../../utils';
import { colors, spacing, radii, typography, themedRefresh } from '../../theme';
import { useScreenTopPadding } from '../../theme/useScreenPadding';

interface GPSPoint {
  lat: number;
  lng: number;
  altitudeMeters: number;
}

interface HeartRateSample {
  bpm: number;
  zone: string;
}

interface WorkoutLog {
  id: string;
  type: WorkoutType;
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

type Filter = 'all' | WorkoutType;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatPace(secondsPerKm: number): string {
  const mins = Math.floor(secondsPerKm / 60);
  const secs = Math.round(secondsPerKm % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function typeLabel(type: WorkoutType): string {
  if (type === 'strength') return 'Strength';
  if (type === 'free') return 'Free';
  return 'Run';
}

function typeColor(type: WorkoutType): string {
  if (type === 'strength') return colors.accent;
  if (type === 'free') return colors.free;
  return colors.run;
}

// OpenFreeMap — free OSM tiles, no API key.
const TILE_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

let mapInitialized = false;
function ensureMapInit() {
  if (!mapInitialized) {
    try { setConnected(true); } catch { /* ignore if already set */ }
    mapInitialized = true;
  }
}

function RunMap({ gpsPoints }: { gpsPoints: GPSPoint[] }) {
  ensureMapInit();
  if (gpsPoints.length < 2) {
    return (
      <View style={styles.mapPlaceholder}>
        <Text style={styles.mapPlaceholderText}>No GPS data</Text>
      </View>
    );
  }

  let minLat = gpsPoints[0]!.lat;
  let maxLat = gpsPoints[0]!.lat;
  let minLng = gpsPoints[0]!.lng;
  let maxLng = gpsPoints[0]!.lng;
  for (const p of gpsPoints) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }

  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;
  const maxSpan = Math.max(maxLat - minLat, maxLng - minLng, 0.005);
  const zoom = Math.max(10, Math.min(16, 14 - Math.log2(maxSpan / 0.005)));

  const routeGeoJSON: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: gpsPoints.map((p) => [p.lng, p.lat]),
        },
      },
    ],
  };

  return (
    <View style={styles.mapContainer}>
      <MapLibreGL.MapView
        style={styles.map}
        styleURL={TILE_STYLE}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        attributionEnabled={false}
        logoEnabled={false}
      >
        <MapLibreGL.Camera
          centerCoordinate={[centerLng, centerLat]}
          zoomLevel={zoom}
          animationDuration={0}
        />
        <MapLibreGL.ShapeSource id="route" shape={routeGeoJSON}>
          <MapLibreGL.LineLayer
            id="routeLineGlow"
            style={{ lineColor: colors.run, lineWidth: 8, lineOpacity: 0.3, lineCap: 'round', lineJoin: 'round' }}
          />
          <MapLibreGL.LineLayer
            id="routeLine"
            style={{ lineColor: colors.run, lineWidth: 4, lineCap: 'round', lineJoin: 'round' }}
          />
        </MapLibreGL.ShapeSource>
        <MapLibreGL.ShapeSource
          id="startPoint"
          shape={{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [gpsPoints[0]!.lng, gpsPoints[0]!.lat] } }}
        >
          <MapLibreGL.CircleLayer
            id="startCircle"
            style={{ circleRadius: 7, circleColor: colors.accent, circleStrokeWidth: 3, circleStrokeColor: '#ffffff' }}
          />
        </MapLibreGL.ShapeSource>
        <MapLibreGL.ShapeSource
          id="endPoint"
          shape={{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [gpsPoints[gpsPoints.length - 1]!.lng, gpsPoints[gpsPoints.length - 1]!.lat] } }}
        >
          <MapLibreGL.CircleLayer
            id="endCircle"
            style={{ circleRadius: 7, circleColor: colors.danger, circleStrokeWidth: 3, circleStrokeColor: '#ffffff' }}
          />
        </MapLibreGL.ShapeSource>
      </MapLibreGL.MapView>
    </View>
  );
}

function hrStats(samples: HeartRateSample[]): { avg: number; max: number } | null {
  if (samples.length === 0) return null;
  let total = 0;
  let max = 0;
  for (const s of samples) {
    total += s.bpm;
    if (s.bpm > max) max = s.bpm;
  }
  return { avg: Math.round(total / samples.length), max };
}

export default function HistoryScreen() {
  const [filter, setFilter] = useState<Filter>('all');
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const topPadding = useScreenTopPadding();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<WorkoutLog[]>('/workouts/logs');
      setLogs(res.data);
    } catch {
      // empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = filter === 'all' ? logs : logs.filter((l) => l.type === filter);
  const counts = {
    all: logs.length,
    strength: logs.filter((l) => l.type === 'strength').length,
    run: logs.filter((l) => l.type === 'run').length,
    free: logs.filter((l) => l.type === 'free').length,
  };

  return (
    <ScrollView
      style={[styles.container, { paddingTop: topPadding }]}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} {...themedRefresh} />}
    >
      <Text style={styles.title}>History</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
        {(['all', 'strength', 'run', 'free'] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>
              {f === 'all' ? 'All' : typeLabel(f)} ({counts[f]})
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {filtered.length === 0 && !loading && (
        <Text style={styles.emptyText}>No activities yet.</Text>
      )}

      {filtered.map((log) => {
        const isExpanded = expandedId === log.id;
        const color = typeColor(log.type);
        const hr = hrStats(log.heartRateSamples);

        const headerRight = (() => {
          if (log.type === 'strength') {
            const sets = log.exerciseLogs.reduce((s, el) => s + el.completedSets.length, 0);
            const volume = log.exerciseLogs.reduce(
              (s, el) => s + el.completedSets.reduce((ss, set) => ss + set.reps * set.weight, 0),
              0,
            );
            return (
              <View style={styles.cardRight}>
                <Text style={styles.cardStat}>{sets} sets</Text>
                <Text style={styles.cardStatSub}>{volume.toLocaleString()} kg</Text>
              </View>
            );
          }
          if (log.type === 'run') {
            return (
              <View style={styles.cardRight}>
                <Text style={styles.cardStat}>
                  {log.distanceMeters ? `${(log.distanceMeters / 1000).toFixed(2)} km` : '—'}
                </Text>
                <Text style={styles.cardStatSub}>
                  {log.avgPaceSecondsPerKm != null ? `${formatPace(log.avgPaceSecondsPerKm)} /km` : '--'}
                </Text>
              </View>
            );
          }
          // free
          return (
            <View style={styles.cardRight}>
              <Text style={styles.cardStat}>
                {log.durationSeconds != null ? formatDuration(log.durationSeconds) : '—'}
              </Text>
              <Text style={styles.cardStatSub}>
                {hr ? `${hr.avg} avg · ${hr.max} max` : '--'}
              </Text>
            </View>
          );
        })();

        return (
          <TouchableOpacity
            key={log.id}
            style={styles.card}
            onPress={() => setExpandedId(isExpanded ? null : log.id)}
            activeOpacity={0.7}
          >
            <View style={styles.cardHeader}>
              <View style={styles.cardLeft}>
                <View style={[styles.typeBadge, { backgroundColor: color }]}>
                  <Text style={styles.typeBadgeText}>{typeLabel(log.type)}</Text>
                </View>
                <View>
                  <Text style={styles.cardTitle}>
                    {log.session?.name ?? typeLabel(log.type)}
                  </Text>
                  <Text style={styles.cardDate}>{formatDate(log.startedAt)}</Text>
                </View>
              </View>
              {headerRight}
            </View>

            {log.caloriesBurned != null && (
              <Text style={styles.calBar}>🔥 {Math.round(log.caloriesBurned)} kcal</Text>
            )}

            {isExpanded && (
              <View style={styles.expandedContent}>
                {log.type === 'strength' && log.exerciseLogs.map((el, idx) => (
                  <View key={idx} style={styles.exerciseRow}>
                    <Text style={styles.exerciseName}>{el.exercise.name}</Text>
                    {el.completedSets.map((s, si) => (
                      <Text key={si} style={styles.setText}>
                        Set {si + 1}: {s.reps} x {s.weight}kg
                      </Text>
                    ))}
                  </View>
                ))}

                {log.type === 'run' && (
                  <>
                    <RunMap gpsPoints={log.gpsPoints} />
                    <View style={styles.detailRow}>
                      <View style={styles.detailItem}>
                        <Text style={styles.detailLabel}>Avg pace</Text>
                        <Text style={styles.detailValue}>
                          {log.avgPaceSecondsPerKm != null ? `${formatPace(log.avgPaceSecondsPerKm)} /km` : '--'}
                        </Text>
                      </View>
                      <View style={styles.detailItem}>
                        <Text style={styles.detailLabel}>Best pace</Text>
                        <Text style={styles.detailValue}>
                          {log.bestPaceSecondsPerKm != null ? `${formatPace(log.bestPaceSecondsPerKm)} /km` : '--'}
                        </Text>
                      </View>
                      <View style={styles.detailItem}>
                        <Text style={styles.detailLabel}>Elevation</Text>
                        <Text style={styles.detailValue}>{log.elevationGainMeters ?? 0} m</Text>
                      </View>
                    </View>
                  </>
                )}

                {log.type === 'free' && hr && (
                  <View style={styles.detailRow}>
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Duration</Text>
                      <Text style={styles.detailValue}>
                        {log.durationSeconds != null ? formatDuration(log.durationSeconds) : '--'}
                      </Text>
                    </View>
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Avg HR</Text>
                      <Text style={styles.detailValue}>{hr.avg} bpm</Text>
                    </View>
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Max HR</Text>
                      <Text style={styles.detailValue}>{hr.max} bpm</Text>
                    </View>
                  </View>
                )}
              </View>
            )}
          </TouchableOpacity>
        );
      })}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 16, color: colors.text },
  filterRow: { flexDirection: 'row', marginBottom: 16, maxHeight: 44 },
  filterChip: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  filterChipText: { fontSize: 13, color: colors.text, fontWeight: '500' },
  filterChipTextActive: { color: '#fff' },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 40 },
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginBottom: 10 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  typeBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  cardTitle: { fontSize: 15, fontWeight: '600' , color: colors.text },
  cardDate: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  cardRight: { alignItems: 'flex-end' },
  cardStat: { fontSize: 14, fontWeight: '500', color: colors.text },
  cardStatSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  calBar: { fontSize: 12, color: colors.textSecondary, marginTop: 8, fontWeight: '500' },
  expandedContent: { marginTop: 12, borderTopWidth: 1, borderTopColor: colors.surfaceMuted, paddingTop: 12 },
  exerciseRow: { marginBottom: 8 },
  exerciseName: { fontSize: 14, fontWeight: '500', marginBottom: 2, color: colors.text },
  setText: { fontSize: 13, color: colors.textSecondary, marginLeft: 8 },
  mapContainer: { height: 250, borderRadius: 12, overflow: 'hidden', marginBottom: 12 },
  map: { flex: 1 },
  mapPlaceholder: { height: 100, borderRadius: 10, backgroundColor: colors.surfaceMuted, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  mapPlaceholderText: { fontSize: 13, color: colors.textMuted },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between' },
  detailItem: { flex: 1, alignItems: 'center' },
  detailLabel: { fontSize: 11, color: colors.textMuted, marginBottom: 2 },
  detailValue: { fontSize: 14, fontWeight: '500' , color: colors.text },
});
