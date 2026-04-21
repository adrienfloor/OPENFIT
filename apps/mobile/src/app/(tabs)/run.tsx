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
import {
  startRunTracking,
  stopRunTracking,
  getRunData,
  resetRunData,
  setOnUpdateCallback,
} from '../../services/runTracker';
import { formatDuration } from '../../utils';

type RunState = 'idle' | 'running' | 'paused' | 'finished';

export default function RunScreen() {
  const [runState, setRunState] = useState<RunState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [distance, setDistance] = useState(0);
  const [pointCount, setPointCount] = useState(0);

  const startTimeRef = useRef<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedBeforePauseRef = useRef(0);
  const segmentStartRef = useRef<number | null>(null);

  const pace = distance > 0 ? elapsed / (distance / 1000) : 0;
  const distanceKm = (distance / 1000).toFixed(2);

  // Sync UI with background GPS data
  const syncFromTracker = useCallback(() => {
    const data = getRunData();
    setDistance(data.distance);
    setPointCount(data.gpsPoints.length);
  }, []);

  // Register callback so background task can trigger UI updates
  useEffect(() => {
    if (runState === 'running') {
      setOnUpdateCallback(syncFromTracker);
    } else {
      setOnUpdateCallback(null);
    }
    return () => setOnUpdateCallback(null);
  }, [runState, syncFromTracker]);

  // Also poll every second when running (in case background callback is delayed)
  useEffect(() => {
    if (runState !== 'running') return;
    const interval = setInterval(syncFromTracker, 1000);
    return () => clearInterval(interval);
  }, [runState, syncFromTracker]);

  // Calculate elevation gain from current GPS data
  const getElevationGain = useCallback(() => {
    const { gpsPoints } = getRunData();
    return gpsPoints.reduce((gain, point, i) => {
      if (i === 0) return 0;
      const diff = point.altitudeMeters - gpsPoints[i - 1]!.altitudeMeters;
      return gain + (diff > 0 ? diff : 0);
    }, 0);
  }, []);

  const startTimer = useCallback(() => {
    segmentStartRef.current = Date.now();
    timerRef.current = setInterval(() => {
      if (segmentStartRef.current !== null) {
        const segmentElapsed = Math.floor((Date.now() - segmentStartRef.current) / 1000);
        setElapsed(elapsedBeforePauseRef.current + segmentElapsed);
      }
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      if (segmentStartRef.current !== null) {
        elapsedBeforePauseRef.current += Math.floor((Date.now() - segmentStartRef.current) / 1000);
        segmentStartRef.current = null;
      }
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleStart = async () => {
    const started = await startRunTracking();
    if (!started) {
      Alert.alert('Permission required', 'Location permission is needed for run tracking.');
      return;
    }

    startTimeRef.current = new Date();
    elapsedBeforePauseRef.current = 0;
    setRunState('running');
    setElapsed(0);
    setDistance(0);
    setPointCount(0);
    startTimer();
  };

  const handlePause = () => {
    setRunState('paused');
    stopTimer();
    // Keep GPS tracking running in background even when paused
  };

  const handleResume = () => {
    setRunState('running');
    startTimer();
  };

  const handleStop = async () => {
    stopTimer();
    await stopRunTracking();
    syncFromTracker();
    setRunState('finished');
  };

  const handleSave = async () => {
    if (!startTimeRef.current) return;

    const { gpsPoints } = getRunData();

    // Best pace from GPS speed data
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
      elevationGainMeters: Math.round(getElevationGain()),
      gpsPoints,
    };

    try {
      await apiClient.post('/runs', payload);
      Alert.alert('Run saved', `${distanceKm} km in ${formatDuration(elapsed)}`);
    } catch {
      Alert.alert('Saved locally', 'Will sync when back online.');
    }

    setRunState('idle');
    startTimeRef.current = null;
    elapsedBeforePauseRef.current = 0;
    resetRunData();
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
          setPointCount(0);
          resetRunData();
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
        <Text style={styles.subtitleSmall}>Works with screen locked</Text>
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
          <Text style={styles.statValue}>{Math.round(getElevationGain())} m</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>GPS Points</Text>
          <Text style={styles.statValue}>{pointCount}</Text>
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

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb' },
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { paddingHorizontal: 16, paddingTop: 56, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#6b7280', marginBottom: 4 },
  subtitleSmall: { fontSize: 12, color: '#9ca3af', marginBottom: 32 },
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
