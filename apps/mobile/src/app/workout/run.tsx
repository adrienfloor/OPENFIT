import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { apiClient } from '../../services/api';
import { useAuthStore } from '../../stores/auth.store';
import { useRealtimeHeartRate } from '../../hooks/useRealtimeHeartRate';
import {
  calculateMaxHR,
  computeCaloriesFromHRSamples,
  ageYearsFromDob,
} from '@openfit/fitness-core';
import { calculateAge, formatDuration } from '../../utils';
import {
  startRunTracking,
  stopRunTracking,
  getRunData,
  resetRunData,
  setOnUpdateCallback,
} from '../../services/runTracker';

type RunState = 'idle' | 'running' | 'paused' | 'finished';

function formatPace(secondsPerKm: number): string {
  if (!isFinite(secondsPerKm) || secondsPerKm <= 0) return '--:--';
  const mins = Math.floor(secondsPerKm / 60);
  const secs = Math.round(secondsPerKm % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function HeartRateDisplay({ maxHR, avgHrRef }: { maxHR: number; avgHrRef: React.MutableRefObject<{ total: number; count: number; samples: Array<{ timestamp: Date; bpm: number; zone: string }> }> }) {
  const { bpm, zone, connectionState, samples } = useRealtimeHeartRate(maxHR);

  // Track average HR
  useEffect(() => {
    if (bpm !== null) {
      avgHrRef.current.total += bpm;
      avgHrRef.current.count += 1;
      avgHrRef.current.samples = samples;
    }
  }, [bpm, samples, avgHrRef]);

  const avgBpm = avgHrRef.current.count > 0
    ? Math.round(avgHrRef.current.total / avgHrRef.current.count)
    : null;

  const stateLabel =
    connectionState === 'scanning' ? 'Scanning...' :
    connectionState === 'connecting' ? 'Connecting...' :
    connectionState === 'connected' ? 'Connected' :
    connectionState === 'error' ? 'No strap found' :
    connectionState === 'disconnected' ? 'Disconnected' :
    '';

  return (
    <View style={styles.hrSection}>
      <View style={styles.hrRow}>
        <View style={styles.hrStatBox}>
          <Text style={styles.hrStatLabel}>Current HR</Text>
          <Text style={styles.hrStatValue}>{bpm ?? '--'}</Text>
          <Text style={styles.hrStatUnit}>bpm</Text>
        </View>
        <View style={styles.hrStatBox}>
          <Text style={styles.hrStatLabel}>Zone</Text>
          <Text style={[styles.hrZoneText, zone === 'peak' || zone === 'max' ? styles.hrZoneHigh : zone === 'cardio' ? styles.hrZoneMid : styles.hrZoneLow]}>
            {zone ? zone.replace('_', ' ').toUpperCase() : '--'}
          </Text>
        </View>
        <View style={styles.hrStatBox}>
          <Text style={styles.hrStatLabel}>Avg HR</Text>
          <Text style={styles.hrStatValue}>{avgBpm ?? '--'}</Text>
          <Text style={styles.hrStatUnit}>bpm</Text>
        </View>
      </View>
      {connectionState !== 'connected' && (
        <Text style={styles.hrConnectionStatus}>{stateLabel}</Text>
      )}
    </View>
  );
}

export default function RunScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [runState, setRunState] = useState<RunState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [distance, setDistance] = useState(0);
  const [pointCount, setPointCount] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState(0);

  const startTimeRef = useRef<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedBeforePauseRef = useRef(0);
  const segmentStartRef = useRef<number | null>(null);
  const avgHrRef = useRef({ total: 0, count: 0, samples: [] as Array<{ timestamp: Date; bpm: number; zone: string }> });

  const maxHR = user?.dateOfBirth ? calculateMaxHR(calculateAge(new Date(user.dateOfBirth))) : 190;

  const distanceKm = (distance / 1000).toFixed(2);
  const avgPace = distance > 0 ? elapsed / (distance / 1000) : 0;
  const currentPace = currentSpeed > 0.3 ? 1000 / currentSpeed : 0;

  // Sync UI with background GPS data
  const syncFromTracker = useCallback(() => {
    const data = getRunData();
    setDistance(data.distance);
    setPointCount(data.gpsPoints.length);
    if (data.gpsPoints.length > 0) {
      const latest = data.gpsPoints[data.gpsPoints.length - 1]!;
      setCurrentSpeed(latest.speedMps);
    }
  }, []);

  useEffect(() => {
    if (runState === 'running') {
      setOnUpdateCallback(syncFromTracker);
    } else {
      setOnUpdateCallback(null);
    }
    return () => setOnUpdateCallback(null);
  }, [runState, syncFromTracker]);

  useEffect(() => {
    if (runState !== 'running') return;
    const interval = setInterval(syncFromTracker, 1000);
    return () => clearInterval(interval);
  }, [runState, syncFromTracker]);

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
    avgHrRef.current = { total: 0, count: 0, samples: [] };
    setRunState('running');
    setElapsed(0);
    setDistance(0);
    setPointCount(0);
    setCurrentSpeed(0);
    startTimer();
  };

  const handlePause = () => {
    setRunState('paused');
    stopTimer();
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
    const hrSamples = avgHrRef.current.samples;

    let bestPace: number | null = null;
    for (const point of gpsPoints) {
      if (point.speedMps > 0.5) {
        const segmentPace = 1000 / point.speedMps;
        if (bestPace === null || segmentPace < bestPace) {
          bestPace = segmentPace;
        }
      }
    }

    const caloriesBurned =
      user && hrSamples.length > 0
        ? computeCaloriesFromHRSamples({
            samples: hrSamples.map((s) => ({ timestamp: s.timestamp, bpm: s.bpm })),
            weightKg: user.weightKg,
            ageYears: ageYearsFromDob(new Date(user.dateOfBirth)),
            sex: user.sex,
          })
        : null;

    const payload = {
      type: 'run' as const,
      startedAt: startTimeRef.current.toISOString(),
      completedAt: new Date().toISOString(),
      distanceMeters: Math.round(distance),
      durationSeconds: elapsed,
      caloriesBurned,
      avgPaceSecondsPerKm: distance > 0 ? Math.round(elapsed / (distance / 1000)) : null,
      bestPaceSecondsPerKm: bestPace ? Math.round(bestPace) : null,
      elevationGainMeters: Math.round(getElevationGain()),
      gpsPoints,
      heartRateSamples: hrSamples.length > 0
        ? hrSamples.map((s) => ({
            timestamp: s.timestamp.toISOString(),
            bpm: s.bpm,
            zone: s.zone,
          }))
        : undefined,
    };

    try {
      await apiClient.post('/workouts/logs', payload);
      const calText = caloriesBurned ? ` · ${Math.round(caloriesBurned)} kcal` : '';
      Alert.alert('Run saved', `${distanceKm} km in ${formatDuration(elapsed)}${calText}`);
    } catch {
      Alert.alert('Saved locally', 'Will sync when back online.');
    }

    setRunState('idle');
    startTimeRef.current = null;
    elapsedBeforePauseRef.current = 0;
    resetRunData();
    router.back();
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
          setCurrentSpeed(0);
          resetRunData();
        },
      },
    ]);
  };

  // Idle state
  if (runState === 'idle') {
    return (
      <View style={styles.centered}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
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

      {/* Distance */}
      <Text style={styles.distanceBig}>{distanceKm} km</Text>

      {/* Pace stats */}
      <View style={styles.paceRow}>
        <View style={styles.paceBox}>
          <Text style={styles.paceLabel}>Avg Pace</Text>
          <Text style={styles.paceValue}>{formatPace(avgPace)}</Text>
          <Text style={styles.paceUnit}>/km</Text>
        </View>
        <View style={styles.paceDivider} />
        <View style={styles.paceBox}>
          <Text style={styles.paceLabel}>Current Pace</Text>
          <Text style={styles.paceValue}>{formatPace(currentPace)}</Text>
          <Text style={styles.paceUnit}>/km</Text>
        </View>
      </View>

      {/* Heart rate — only render when running (mounts BLE hook) */}
      {(runState === 'running' || runState === 'paused') && (
        <HeartRateDisplay maxHR={maxHR} avgHrRef={avgHrRef} />
      )}

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
        <View>
          {/* Summary before save */}
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Elevation</Text>
              <Text style={styles.summaryValue}>{Math.round(getElevationGain())} m</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>GPS Points</Text>
              <Text style={styles.summaryValue}>{pointCount}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Avg HR</Text>
              <Text style={styles.summaryValue}>
                {avgHrRef.current.count > 0 ? Math.round(avgHrRef.current.total / avgHrRef.current.count) : '--'} bpm
              </Text>
            </View>
          </View>
          <View style={styles.controls}>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>Save Run</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.discardBtn} onPress={handleDiscard}>
              <Text style={styles.discardBtnText}>Discard</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb' },
  backBtn: { position: 'absolute', top: 56, left: 16 },
  backText: { fontSize: 16, color: '#22c55e', fontWeight: '500' },
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { paddingHorizontal: 16, paddingTop: 56, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#6b7280', marginBottom: 4 },
  subtitleSmall: { fontSize: 12, color: '#9ca3af', marginBottom: 32 },
  timer: { fontSize: 52, fontWeight: 'bold', textAlign: 'center', color: '#111827' },
  distanceBig: { fontSize: 36, fontWeight: '700', textAlign: 'center', color: '#22c55e', marginBottom: 24 },
  paceRow: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, alignItems: 'center' },
  paceBox: { flex: 1, alignItems: 'center' },
  paceDivider: { width: 1, height: 40, backgroundColor: '#e5e7eb' },
  paceLabel: { fontSize: 11, color: '#9ca3af', marginBottom: 4 },
  paceValue: { fontSize: 28, fontWeight: '700', color: '#111827' },
  paceUnit: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  hrSection: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, borderLeftWidth: 4, borderLeftColor: '#ef4444' },
  hrRow: { flexDirection: 'row', justifyContent: 'space-between' },
  hrStatBox: { flex: 1, alignItems: 'center' },
  hrStatLabel: { fontSize: 11, color: '#9ca3af', marginBottom: 4 },
  hrStatValue: { fontSize: 28, fontWeight: '700', color: '#ef4444' },
  hrStatUnit: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  hrZoneText: { fontSize: 18, fontWeight: '700', marginTop: 8 },
  hrZoneHigh: { color: '#ef4444' },
  hrZoneMid: { color: '#f59e0b' },
  hrZoneLow: { color: '#22c55e' },
  hrConnectionStatus: { textAlign: 'center', fontSize: 11, color: '#9ca3af', marginTop: 8 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16 },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryLabel: { fontSize: 11, color: '#9ca3af', marginBottom: 4 },
  summaryValue: { fontSize: 16, fontWeight: '600' },
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
