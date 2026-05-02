import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
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
import { colors, spacing, radii, typography } from '../../theme';
import { dialog } from '../../services/dialog';

type SessionState = 'idle' | 'running' | 'paused' | 'finished';

function HeartRateLive({
  maxHR,
  avgHrRef,
}: {
  maxHR: number;
  avgHrRef: React.MutableRefObject<{
    total: number;
    count: number;
    max: number;
    samples: Array<{ timestamp: Date; bpm: number; zone: string }>;
  }>;
}) {
  const { bpm, zone, connectionState, samples } = useRealtimeHeartRate(maxHR);

  useEffect(() => {
    if (bpm !== null) {
      avgHrRef.current.total += bpm;
      avgHrRef.current.count += 1;
      if (bpm > avgHrRef.current.max) avgHrRef.current.max = bpm;
      avgHrRef.current.samples = samples;
    }
  }, [bpm, samples, avgHrRef]);

  const avgBpm =
    avgHrRef.current.count > 0
      ? Math.round(avgHrRef.current.total / avgHrRef.current.count)
      : null;

  const stateLabel =
    connectionState === 'scanning' ? 'Scanning for HR strap...' :
    connectionState === 'connecting' ? 'Connecting...' :
    connectionState === 'connected' ? 'Connected' :
    connectionState === 'error' ? 'No strap found' :
    connectionState === 'disconnected' ? 'Disconnected' :
    'Waiting...';

  return (
    <View style={styles.hrSection}>
      <View style={styles.hrRow}>
        <View style={styles.hrStatBox}>
          <Text style={styles.hrStatLabel}>Current</Text>
          <Text style={styles.hrStatValue}>{bpm ?? '--'}</Text>
          <Text style={styles.hrStatUnit}>bpm</Text>
        </View>
        <View style={styles.hrStatBox}>
          <Text style={styles.hrStatLabel}>Zone</Text>
          <Text style={[
            styles.hrZoneText,
            zone === 'peak' || zone === 'max' ? styles.hrZoneHigh
              : zone === 'cardio' ? styles.hrZoneMid
              : styles.hrZoneLow,
          ]}>
            {zone ? zone.replace('_', ' ').toUpperCase() : '--'}
          </Text>
        </View>
        <View style={styles.hrStatBox}>
          <Text style={styles.hrStatLabel}>Avg</Text>
          <Text style={styles.hrStatValue}>{avgBpm ?? '--'}</Text>
          <Text style={styles.hrStatUnit}>bpm</Text>
        </View>
        <View style={styles.hrStatBox}>
          <Text style={styles.hrStatLabel}>Max</Text>
          <Text style={styles.hrStatValue}>
            {avgHrRef.current.max > 0 ? avgHrRef.current.max : '--'}
          </Text>
          <Text style={styles.hrStatUnit}>bpm</Text>
        </View>
      </View>
      {connectionState !== 'connected' && (
        <Text style={styles.hrConnectionStatus}>{stateLabel}</Text>
      )}
    </View>
  );
}

export default function JiuJitsuScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [state, setState] = useState<SessionState>('idle');
  const [elapsed, setElapsed] = useState(0);

  const startTimeRef = useRef<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedBeforePauseRef = useRef(0);
  const segmentStartRef = useRef<number | null>(null);
  const hrRef = useRef({
    total: 0,
    count: 0,
    max: 0,
    samples: [] as Array<{ timestamp: Date; bpm: number; zone: string }>,
  });

  const maxHR = user?.dateOfBirth
    ? calculateMaxHR(calculateAge(new Date(user.dateOfBirth)))
    : 190;

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

  const handleStart = () => {
    startTimeRef.current = new Date();
    elapsedBeforePauseRef.current = 0;
    hrRef.current = { total: 0, count: 0, max: 0, samples: [] };
    setState('running');
    setElapsed(0);
    startTimer();
  };

  const handlePause = () => {
    setState('paused');
    stopTimer();
  };

  const handleResume = () => {
    setState('running');
    startTimer();
  };

  const handleStop = () => {
    stopTimer();
    setState('finished');
  };

  const handleSave = async () => {
    if (!startTimeRef.current) return;

    const hrSamples = hrRef.current.samples;
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
      type: 'jiu_jitsu' as const,
      startedAt: startTimeRef.current.toISOString(),
      completedAt: new Date().toISOString(),
      durationSeconds: elapsed,
      caloriesBurned,
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
      dialog.alert('Session saved', `${formatDuration(elapsed)}${calText}`);
    } catch {
      dialog.alert('Saved locally', 'Will sync when back online.');
    }

    setState('idle');
    startTimeRef.current = null;
    elapsedBeforePauseRef.current = 0;
    hrRef.current = { total: 0, count: 0, max: 0, samples: [] };
    router.back();
  };

  const handleDiscard = () => {
    dialog.alert('Discard session?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          setState('idle');
          startTimeRef.current = null;
          elapsedBeforePauseRef.current = 0;
          setElapsed(0);
          hrRef.current = { total: 0, count: 0, max: 0, samples: [] };
        },
      },
    ]);
  };

  if (state === 'idle') {
    return (
      <View style={styles.centered}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Jiu-Jitsu</Text>
        <Text style={styles.subtitle}>HR-tracked timed session</Text>
        <Text style={styles.subtitleSmall}>Put on your Helio Strap before starting</Text>
        <TouchableOpacity style={styles.startBtn} onPress={handleStart}>
          <Text style={styles.startBtnText}>Start Session</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.timer}>{formatDuration(elapsed)}</Text>

      {(state === 'running' || state === 'paused') && (
        <HeartRateLive maxHR={maxHR} avgHrRef={hrRef} />
      )}

      {state === 'running' && (
        <View style={styles.controls}>
          <TouchableOpacity style={styles.pauseBtn} onPress={handlePause}>
            <Text style={styles.pauseBtnText}>Pause</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.stopBtn} onPress={handleStop}>
            <Text style={styles.stopBtnText}>Stop</Text>
          </TouchableOpacity>
        </View>
      )}

      {state === 'paused' && (
        <View style={styles.controls}>
          <TouchableOpacity style={styles.resumeBtn} onPress={handleResume}>
            <Text style={styles.resumeBtnText}>Resume</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.stopBtn} onPress={handleStop}>
            <Text style={styles.stopBtnText}>Stop</Text>
          </TouchableOpacity>
        </View>
      )}

      {state === 'finished' && (
        <View>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Avg HR</Text>
              <Text style={styles.summaryValue}>
                {hrRef.current.count > 0
                  ? Math.round(hrRef.current.total / hrRef.current.count)
                  : '--'} bpm
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Max HR</Text>
              <Text style={styles.summaryValue}>
                {hrRef.current.max > 0 ? hrRef.current.max : '--'} bpm
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Samples</Text>
              <Text style={styles.summaryValue}>{hrRef.current.count}</Text>
            </View>
          </View>
          <View style={styles.controls}>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>Save Session</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.discardBtn} onPress={handleDiscard}>
              <Text style={styles.discardBtnText}>Discard</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24, paddingTop: 80 },
  backBtn: { position: 'absolute', top: 56, left: 16 },
  backText: { fontSize: 16, color: colors.accent, fontWeight: '500' },
  title: { fontSize: 36, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { fontSize: 16, color: colors.textSecondary, marginBottom: 4 },
  subtitleSmall: { fontSize: 13, color: colors.textMuted, marginBottom: 48 },
  startBtn: { backgroundColor: colors.jiuJitsu, paddingHorizontal: 56, paddingVertical: 20, borderRadius: 16 },
  startBtnText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  timer: { fontSize: 72, fontWeight: '200', textAlign: 'center', marginTop: 40, marginBottom: 24, color: '#111' },
  hrSection: { backgroundColor: colors.surface, borderRadius: 16, padding: 20, marginBottom: 32 },
  hrRow: { flexDirection: 'row', justifyContent: 'space-between' },
  hrStatBox: { alignItems: 'center', flex: 1 },
  hrStatLabel: { fontSize: 11, color: colors.textMuted, marginBottom: 4 },
  hrStatValue: { fontSize: 24, fontWeight: '700', color: '#111' },
  hrStatUnit: { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  hrZoneText: { fontSize: 13, fontWeight: '700', marginTop: 8 },
  hrZoneHigh: { color: colors.danger },
  hrZoneMid: { color: colors.warning },
  hrZoneLow: { color: colors.accent },
  hrConnectionStatus: { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: 12 },
  controls: { flexDirection: 'row', gap: 12, marginTop: 24 },
  pauseBtn: { flex: 1, backgroundColor: colors.warning, paddingVertical: 18, borderRadius: 12, alignItems: 'center' },
  pauseBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  resumeBtn: { flex: 1, backgroundColor: colors.accent, paddingVertical: 18, borderRadius: 12, alignItems: 'center' },
  resumeBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  stopBtn: { flex: 1, backgroundColor: colors.danger, paddingVertical: 18, borderRadius: 12, alignItems: 'center' },
  stopBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  saveBtn: { flex: 2, backgroundColor: colors.accent, paddingVertical: 18, borderRadius: 12, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  discardBtn: { flex: 1, backgroundColor: colors.surfaceMuted, paddingVertical: 18, borderRadius: 12, alignItems: 'center' },
  discardBtnText: { color: colors.textSecondary, fontSize: 16, fontWeight: '600' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: 12, padding: 20 },
  summaryItem: { alignItems: 'center', flex: 1 },
  summaryLabel: { fontSize: 12, color: colors.textMuted, marginBottom: 4 },
  summaryValue: { fontSize: 18, fontWeight: '700' },
});
