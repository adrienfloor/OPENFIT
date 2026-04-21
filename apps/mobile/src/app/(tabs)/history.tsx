import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import { apiClient } from '../../services/api';
import { formatDuration } from '../../utils';

interface WorkoutLog {
  id: string;
  startedAt: string;
  completedAt: string | null;
  session: { name: string } | null;
  exerciseLogs: {
    exercise: { name: string };
    completedSets: { reps: number; weight: number }[];
  }[];
}

interface GPSPoint {
  lat: number;
  lng: number;
  altitudeMeters: number;
}

interface RunSession {
  id: string;
  startedAt: string;
  distanceMeters: number;
  durationSeconds: number;
  avgPaceSecondsPerKm: number | null;
  bestPaceSecondsPerKm: number | null;
  elevationGainMeters: number;
  gpsPoints: GPSPoint[];
}

type Tab = 'workouts' | 'runs';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatPace(secondsPerKm: number): string {
  const mins = Math.floor(secondsPerKm / 60);
  const secs = Math.round(secondsPerKm % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const TILE_STYLE = 'https://demotiles.maplibre.org/style.json';

function RunMap({ gpsPoints }: { gpsPoints: GPSPoint[] }) {
  if (gpsPoints.length < 2) {
    return (
      <View style={styles.mapPlaceholder}>
        <Text style={styles.mapPlaceholderText}>No GPS data</Text>
      </View>
    );
  }

  // Calculate bounds
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
  const latSpan = maxLat - minLat;
  const lngSpan = maxLng - minLng;
  const maxSpan = Math.max(latSpan, lngSpan, 0.005);
  // Approximate zoom: smaller span = higher zoom
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
            id="routeLine"
            style={{
              lineColor: '#22c55e',
              lineWidth: 4,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        </MapLibreGL.ShapeSource>
      </MapLibreGL.MapView>
    </View>
  );
}

export default function HistoryScreen() {
  const [tab, setTab] = useState<Tab>('workouts');
  const [workouts, setWorkouts] = useState<WorkoutLog[]>([]);
  const [runs, setRuns] = useState<RunSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [wRes, rRes] = await Promise.all([
        apiClient.get<WorkoutLog[]>('/workouts/logs'),
        apiClient.get<RunSession[]>('/runs'),
      ]);
      setWorkouts(wRes.data);
      setRuns(rRes.data);
    } catch {
      // empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} />}
    >
      <Text style={styles.title}>History</Text>

      {/* Tab switcher */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'workouts' && styles.tabActive]}
          onPress={() => setTab('workouts')}
        >
          <Text style={[styles.tabText, tab === 'workouts' && styles.tabTextActive]}>
            Workouts ({workouts.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'runs' && styles.tabActive]}
          onPress={() => setTab('runs')}
        >
          <Text style={[styles.tabText, tab === 'runs' && styles.tabTextActive]}>
            Runs ({runs.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Workout list */}
      {tab === 'workouts' && (
        <View>
          {workouts.length === 0 && !loading && (
            <Text style={styles.emptyText}>No workouts logged yet.</Text>
          )}
          {workouts.map((w) => {
            const totalSets = w.exerciseLogs.reduce((sum, el) => sum + el.completedSets.length, 0);
            const totalVolume = w.exerciseLogs.reduce(
              (sum, el) => sum + el.completedSets.reduce((s, set) => s + set.reps * set.weight, 0),
              0,
            );
            const isExpanded = expandedId === w.id;

            return (
              <TouchableOpacity
                key={w.id}
                style={styles.card}
                onPress={() => setExpandedId(isExpanded ? null : w.id)}
                activeOpacity={0.7}
              >
                <View style={styles.cardHeader}>
                  <View>
                    <Text style={styles.cardTitle}>{w.session?.name ?? 'Free workout'}</Text>
                    <Text style={styles.cardDate}>{formatDate(w.startedAt)}</Text>
                  </View>
                  <View style={styles.cardRight}>
                    <Text style={styles.cardStat}>{totalSets} sets</Text>
                    <Text style={styles.cardStatSub}>{totalVolume.toLocaleString()} kg</Text>
                  </View>
                </View>

                {isExpanded && (
                  <View style={styles.expandedContent}>
                    {w.exerciseLogs.map((el, idx) => (
                      <View key={idx} style={styles.exerciseRow}>
                        <Text style={styles.exerciseName}>{el.exercise.name}</Text>
                        {el.completedSets.map((s, si) => (
                          <Text key={si} style={styles.setText}>
                            Set {si + 1}: {s.reps} x {s.weight}kg
                          </Text>
                        ))}
                      </View>
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Run list */}
      {tab === 'runs' && (
        <View>
          {runs.length === 0 && !loading && (
            <Text style={styles.emptyText}>No runs logged yet.</Text>
          )}
          {runs.map((r) => {
            const isExpanded = expandedId === r.id;
            return (
              <TouchableOpacity
                key={r.id}
                style={styles.card}
                onPress={() => setExpandedId(isExpanded ? null : r.id)}
                activeOpacity={0.7}
              >
                <View style={styles.cardHeader}>
                  <View>
                    <Text style={styles.cardTitle}>{(r.distanceMeters / 1000).toFixed(1)} km</Text>
                    <Text style={styles.cardDate}>{formatDate(r.startedAt)}</Text>
                  </View>
                  <View style={styles.cardRight}>
                    <Text style={styles.cardStat}>{formatDuration(r.durationSeconds)}</Text>
                    <Text style={styles.cardStatSub}>
                      {r.avgPaceSecondsPerKm != null ? `${formatPace(r.avgPaceSecondsPerKm)} /km` : '--'}
                    </Text>
                  </View>
                </View>

                {isExpanded && (
                  <View style={styles.expandedContent}>
                    <RunMap gpsPoints={r.gpsPoints} />
                    <View style={styles.runDetailRow}>
                      <View style={styles.runDetailItem}>
                        <Text style={styles.runDetailLabel}>Avg pace</Text>
                        <Text style={styles.runDetailValue}>
                          {r.avgPaceSecondsPerKm != null ? `${formatPace(r.avgPaceSecondsPerKm)} /km` : '--'}
                        </Text>
                      </View>
                      <View style={styles.runDetailItem}>
                        <Text style={styles.runDetailLabel}>Best pace</Text>
                        <Text style={styles.runDetailValue}>
                          {r.bestPaceSecondsPerKm != null ? `${formatPace(r.bestPaceSecondsPerKm)} /km` : '--'}
                        </Text>
                      </View>
                      <View style={styles.runDetailItem}>
                        <Text style={styles.runDetailLabel}>Elevation</Text>
                        <Text style={styles.runDetailValue}>{r.elevationGainMeters ?? 0} m</Text>
                      </View>
                    </View>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', paddingHorizontal: 16, paddingTop: 56 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 16 },
  tabs: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 10, padding: 4, marginBottom: 16 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: '#22c55e' },
  tabText: { fontSize: 14, fontWeight: '500', color: '#6b7280' },
  tabTextActive: { color: '#fff' },
  emptyText: { fontSize: 14, color: '#9ca3af', textAlign: 'center', marginTop: 40 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 10 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardDate: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  cardRight: { alignItems: 'flex-end' },
  cardStat: { fontSize: 14, fontWeight: '500', color: '#374151' },
  cardStatSub: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  expandedContent: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingTop: 12 },
  exerciseRow: { marginBottom: 8 },
  exerciseName: { fontSize: 14, fontWeight: '500', marginBottom: 2 },
  setText: { fontSize: 13, color: '#6b7280', marginLeft: 8 },
  mapContainer: { height: 200, borderRadius: 10, overflow: 'hidden', marginBottom: 12 },
  map: { flex: 1 },
  mapPlaceholder: { height: 100, borderRadius: 10, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  mapPlaceholderText: { fontSize: 13, color: '#9ca3af' },
  runDetailRow: { flexDirection: 'row', justifyContent: 'space-between' },
  runDetailItem: { flex: 1, alignItems: 'center' },
  runDetailLabel: { fontSize: 11, color: '#9ca3af', marginBottom: 2 },
  runDetailValue: { fontSize: 14, fontWeight: '500' },
});
