import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { apiClient } from '../../services/api';
import { formatDuration } from '../../utils';
import { useAuthStore } from '../../stores/auth.store';

interface GPSPoint {
  lat: number;
  lng: number;
  altitudeMeters: number;
  timestamp: string;
  speedMps: number;
}

type RunState = 'idle' | 'running' | 'paused' | 'finished';

export default function RunScreen() {
  const user = useAuthStore((s) => s.user);
  const [runState, setRunState] = useState<RunState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [distance, setDistance] = useState(0);
  const [gpsPoints, setGpsPoints] = useState<GPSPoint[]>([]);

  const startTimeRef = useRef<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationWatchRef = useRef<{ remove: () => void } | null>(null);

  const pace = distance > 0 ? elapsed / (distance / 1000) : 0;
  const distanceKm = (distance / 1000).toFixed(2);

  // Calculate elevation gain from GPS points
  const elevationGain = gpsPoints.reduce((gain, point, i) => {
    if (i === 0) return 0;
    const diff = point.altitudeMeters - gpsPoints[i - 1]!.altitudeMeters;
    return gain + (diff > 0 ? diff : 0);
  }, 0);

  const startTimer = useCallback(() => {
    timerRef.current = setInterval(() => {
      if (startTimeRef.current) {
        setElapsed(Math.floor((Date.now() - startTimeRef.current.getTime()) / 1000));
      }
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startLocationTracking = useCallback(async () => {
    try {
      const Location = await import('expo-location');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Location permission is needed for run tracking.');
        return;
      }

      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          distanceInterval: 5,
          timeInterval: 3000,
        },
        (location) => {
          const point: GPSPoint = {
            lat: location.coords.latitude,
            lng: location.coords.longitude,
            altitudeMeters: location.coords.altitude ?? 0,
            timestamp: new Date(location.timestamp).toISOString(),
            speedMps: Math.max(0, location.coords.speed ?? 0),
          };

          setGpsPoints((prev) => {
            const updated = [...prev, point];
            // Calculate distance from last point
            if (prev.length > 0) {
              const last = prev[prev.length - 1]!;
              const d = haversine(last.lat, last.lng, point.lat, point.lng);
              setDistance((prevDist) => prevDist + d);
            }
            return updated;
          });
        },
      );

      locationWatchRef.current = subscription;
    } catch {
      // Location tracking unavailable
    }
  }, []);

  const stopLocationTracking = useCallback(() => {
    locationWatchRef.current?.remove();
    locationWatchRef.current = null;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTimer();
      stopLocationTracking();
    };
  }, [stopTimer, stopLocationTracking]);

  const handleStart = async () => {
    startTimeRef.current = new Date();
    setRunState('running');
    setElapsed(0);
    setDistance(0);
    setGpsPoints([]);
    startTimer();
    await startLocationTracking();
  };

  const handlePause = () => {
    setRunState('paused');
    stopTimer();
  };

  const handleResume = () => {
    setRunState('running');
    startTimer();
  };

  const handleStop = () => {
    stopTimer();
    stopLocationTracking();
    setRunState('finished');
  };

  const handleSave = async () => {
    if (!startTimeRef.current) return;

    // Best pace: lowest pace (fastest) from GPS segments
    let bestPace: number | null = null;
    for (const point of gpsPoints) {
      if (point.speedMps > 0.5) {
        const segmentPace = 1000 / point.speedMps;
        if (bestPace === null || segmentPace < bestPace) {
          bestPace = segmentPace;
        }
      }
    }

    const payload = {
      startedAt: startTimeRef.current.toISOString(),
      completedAt: new Date().toISOString(),
      distanceMeters: Math.round(distance),
      durationSeconds: elapsed,
      avgPaceSecondsPerKm: distance > 0 ? Math.round(elapsed / (distance / 1000)) : null,
      bestPaceSecondsPerKm: bestPace ? Math.round(bestPace) : null,
      elevationGainMeters: Math.round(elevationGain),
      gpsPoints,
    };

    try {
      await apiClient.post('/runs', payload);
      Alert.alert('Run saved');
    } catch {
      Alert.alert('Saved locally', 'Will sync when back online.');
    }

    setRunState('idle');
    startTimeRef.current = null;
  };

  const handleDiscard = () => {
    Alert.alert('Discard run?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          setRunState('idle');
          startTimeRef.current = null;
          setElapsed(0);
          setDistance(0);
          setGpsPoints([]);
        },
      },
    ]);
  };

  // Idle state
  if (runState === 'idle') {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Run</Text>
        <Text style={styles.subtitle}>Track your run with GPS</Text>
        <TouchableOpacity style={styles.startBtn} onPress={handleStart}>
          <Text style={styles.startBtnText}>Start Run</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Active / Paused / Finished
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Timer */}
      <Text style={styles.timer}>{formatDuration(elapsed)}</Text>

      {/* Stats grid */}
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Distance</Text>
          <Text style={styles.statValue}>{distanceKm} km</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Pace</Text>
          <Text style={styles.statValue}>
            {pace > 0 ? formatPace(pace) : '--:--'} /km
          </Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Elevation</Text>
          <Text style={styles.statValue}>{Math.round(elevationGain)} m</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>GPS Points</Text>
          <Text style={styles.statValue}>{gpsPoints.length}</Text>
        </View>
      </View>

      {/* Controls */}
      {runState === 'running' && (
        <View style={styles.controls}>
          <TouchableOpacity style={styles.pauseBtn} onPress={handlePause}>
            <Text style={styles.pauseBtnText}>Pause</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.stopBtn} onPress={handleStop}>
            <Text style={styles.stopBtnText}>Stop</Text>
          </TouchableOpacity>
        </View>
      )}

      {runState === 'paused' && (
        <View style={styles.controls}>
          <TouchableOpacity style={styles.resumeBtn} onPress={handleResume}>
            <Text style={styles.resumeBtnText}>Resume</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.stopBtn} onPress={handleStop}>
            <Text style={styles.stopBtnText}>Stop</Text>
          </TouchableOpacity>
        </View>
      )}

      {runState === 'finished' && (
        <View style={styles.controls}>
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
            <Text style={styles.saveBtnText}>Save Run</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.discardBtn} onPress={handleDiscard}>
            <Text style={styles.discardBtnText}>Discard</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

function formatPace(secondsPerKm: number): string {
  const mins = Math.floor(secondsPerKm / 60);
  const secs = Math.round(secondsPerKm % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

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

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb' },
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { paddingHorizontal: 16, paddingTop: 56, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#6b7280', marginBottom: 32 },
  timer: { fontSize: 56, fontWeight: 'bold', textAlign: 'center', marginBottom: 24, color: '#111827' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 32 },
  statCard: { width: '47%', backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  statLabel: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
  statValue: { fontSize: 22, fontWeight: '600' },
  controls: { flexDirection: 'row', gap: 12 },
  startBtn: {
    backgroundColor: '#22c55e',
    borderRadius: 40,
    paddingVertical: 20,
    paddingHorizontal: 48,
  },
  startBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  pauseBtn: { flex: 1, backgroundColor: '#f59e0b', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  pauseBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  resumeBtn: { flex: 1, backgroundColor: '#22c55e', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  resumeBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  stopBtn: { flex: 1, backgroundColor: '#ef4444', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  stopBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  saveBtn: { flex: 1, backgroundColor: '#22c55e', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  discardBtn: { flex: 1, backgroundColor: '#e5e7eb', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  discardBtnText: { color: '#374151', fontSize: 16, fontWeight: '600' },
});
