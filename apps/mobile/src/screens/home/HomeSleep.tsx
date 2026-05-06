import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useDailyStats } from '../../hooks/useDailyStats';
import { HeroRing } from '../../components/HeroRing';
import { AIInsightCard } from '../../components/AIInsightCard';
import { HomeLoadingOverlay } from '../../components/HomeLoadingOverlay';
import { RingExplainerSheet } from '../../components/RingExplainerSheet';
import { Hypnogram } from '../../components/charts/Hypnogram';
import { StackedBars } from '../../components/charts/StackedBars';
import { RegularityBars } from '../../components/charts/RegularityBars';
import { SparkLine } from '../../components/charts/SparkLine';
import { HypnogramDetail } from './sleep/HypnogramDetail';
import type { SleepDashboard } from '../../types/sleep';
import { colors, spacing, radii, typography, themedRefresh } from '../../theme';

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const weekdayLetter = (d: Date): string => WEEKDAY_LETTERS[d.getDay()]!;

function scoreLabel(score: number): string {
  if (score >= 85) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 60) return 'Fair';
  return 'Poor';
}

function formatHM(minutes: number | null | undefined): string {
  if (minutes == null) return '--';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function pct(part: number, total: number): string {
  if (!total) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}

/**
 * Home → Sleep sub-tab — Slice 5.
 *
 * Layout per the locked spec:
 *   • Hero sleep score ring (taps → explainer sheet)
 *   • AI insight card (taps → reasoning sheet)
 *   • Hypnogram timeline (taps → full-screen drill-in)
 *   • Naps row (no-data placeholder for now)
 *   • Sleep metrics rows (Duration, Regularity, Deep, REM, Awake)
 *   • 7-day duration stacked bars / regularity range bars / sleep HR
 *     line / hypopnea / breathing rate
 *
 * Per the matrix only the ring, insight, and hypnogram are tappable.
 */
export function HomeSleep() {
  const { today, refetch, hasEverLoaded, healthConnectAvailable, permissionsGranted } = useDailyStats();
  const sleep: SleepDashboard = {
    score: today?.sleepScore ?? 0,
    scoreLabel: scoreLabel(today?.sleepScore ?? 0),
    totalMinutes: today?.sleepDurationMinutes ?? 0,
    deepMinutes: today?.sleepDeepMinutes ?? 0,
    remMinutes: today?.sleepRemMinutes ?? 0,
    lightMinutes: today?.sleepLightMinutes ?? 0,
    awakeMinutes: today?.sleepAwakeMinutes ?? 0,
    awakeningCount: today?.sleepAwakeningCount ?? 0,
    regularityPercent: today?.sleepRegularityPercent ?? 0,
    startTime: today?.sleepStartTime ?? new Date(),
    endTime: today?.sleepEndTime ?? new Date(),
    stages: today?.sleepStageTimeline ?? [],
    durationTrend: today?.sleepDashboardData.durationTrend ?? [],
    regularityTrend: today?.sleepDashboardData.regularityTrend ?? [],
    sleepHRTrend: today?.sleepDashboardData.sleepHRTrend ?? [],
    breathingTrend: today?.sleepDashboardData.breathingTrend ?? [],
  };
  const hasSleepData = today?.sleepStartTime != null;
  const [explainerOpen, setExplainerOpen] = useState(false);
  const [hypnogramOpen, setHypnogramOpen] = useState(false);
  const [pulling, setPulling] = useState(false);
  const onPullRefresh = async () => {
    setPulling(true);
    try { await refetch(); } finally { setPulling(false); }
  };

  if (!hasEverLoaded && healthConnectAvailable !== false && permissionsGranted) {
    return <HomeLoadingOverlay />;
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={pulling} onRefresh={onPullRefresh} {...themedRefresh} />
      }
    >
      {/* Hero ring */}
      <View style={styles.heroWrap}>
        <HeroRing
          score={sleep.score}
          color={colors.sleep}
          tier={sleep.scoreLabel.toUpperCase()}
          subtitle={`${formatHM(sleep.totalMinutes)} asleep`}
          caption="Sleep"
          onPress={() => setExplainerOpen(true)}
        />
      </View>

      {/* AI insight */}
      <AIInsightCard focus="sleep" />

      {/* Hypnogram */}
      <Text style={styles.sectionLabel}>Sleep stages</Text>
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => setHypnogramOpen(true)}
      >
        <View style={styles.hypnogramHeader}>
          <Text style={styles.hypnogramDuration}>{formatHM(sleep.totalMinutes)}</Text>
          <Text style={styles.hypnogramHint}>Tap to expand →</Text>
        </View>
        <Hypnogram
          segments={sleep.stages}
          totalMinutes={sleep.totalMinutes}
          startTime={sleep.startTime}
          endTime={sleep.endTime}
          height={120}
        />
      </TouchableOpacity>

      {/* Naps */}
      <Text style={styles.sectionLabel}>Naps</Text>
      <View style={styles.napRow}>
        <Text style={styles.napIcon}>☀</Text>
        <Text style={styles.napLabel}>No naps recorded today</Text>
      </View>

      {/* Sleep metrics */}
      <Text style={styles.sectionLabel}>Sleep metrics</Text>
      <View style={styles.metricsCard}>
        <MetricLine
          label="Duration"
          value={formatHM(sleep.totalMinutes)}
          status={evalDuration(sleep.totalMinutes)}
        />
        <Divider />
        <MetricLine
          label="Regularity"
          value={hasSleepData ? `${sleep.regularityPercent}%` : '--'}
          status={evalRegularity(sleep.regularityPercent)}
        />
        <Divider />
        <MetricLine
          label="Deep sleep"
          value={
            sleep.totalMinutes > 0
              ? `${formatHM(sleep.deepMinutes)} (${pct(sleep.deepMinutes, sleep.totalMinutes)})`
              : '--'
          }
          status={evalDeepRem(sleep.deepMinutes, sleep.totalMinutes, 0.13, 0.23)}
        />
        <Divider />
        <MetricLine
          label="REM sleep"
          value={
            sleep.totalMinutes > 0
              ? `${formatHM(sleep.remMinutes)} (${pct(sleep.remMinutes, sleep.totalMinutes)})`
              : '--'
          }
          status={evalDeepRem(sleep.remMinutes, sleep.totalMinutes, 0.2, 0.25)}
        />
        <Divider />
        <MetricLine
          label="Awake"
          value={
            hasSleepData
              ? `${formatHM(sleep.awakeMinutes)} (${sleep.awakeningCount}×)`
              : '--'
          }
          status={evalAwake(sleep.awakeMinutes, sleep.awakeningCount)}
        />
      </View>

      {/* 7-day duration */}
      <Text style={styles.sectionLabel}>Sleep duration — last 7 days</Text>
      <View style={styles.card}>
        {sleep.durationTrend.length > 0 ? (
          <StackedBars
            data={sleep.durationTrend.map((d) => ({
              label: weekdayLetter(d.date),
              segments: [
                { label: 'Awake', value: d.awakeMinutes / 60, color: '#ef4444' },
                { label: 'REM', value: d.remMinutes / 60, color: '#22c55e' },
                { label: 'Light', value: d.lightMinutes / 60, color: '#60a5fa' },
                { label: 'Deep', value: d.deepMinutes / 60, color: '#7c3aed' },
              ],
            }))}
            height={160}
            yMax={10}
            yTicks={2}
            formatTick={(v) => `${Math.round(v)}h`}
          />
        ) : (
          <Text style={styles.emptyChart}>
            No sleep sessions recorded in the last 7 days.
          </Text>
        )}
      </View>

      {/* 7-day regularity */}
      <Text style={styles.sectionLabel}>Regularity — last 7 days</Text>
      <View style={styles.card}>
        {sleep.regularityTrend.length > 0 ? (
          <RegularityBars
            data={sleep.regularityTrend}
            labels={sleep.regularityTrend.map((p) => weekdayLetter(p.date))}
            height={200}
          />
        ) : (
          <Text style={styles.emptyChart}>
            Need at least 3 nights of sleep data.
          </Text>
        )}
      </View>

      {/* 7-day sleep HR */}
      <Text style={styles.sectionLabel}>Sleep heart rate — last 7 days</Text>
      <View style={styles.card}>
        {sleep.sleepHRTrend.length > 0 ? (
          <SparkLine
            values={sleep.sleepHRTrend.map((p) => p.value)}
            labels={sleep.sleepHRTrend.map((p) => weekdayLetter(p.date))}
            color={colors.accent}
            yAxis
            yUnit="bpm"
            height={140}
          />
        ) : (
          <Text style={styles.emptyChart}>
            No sleep HR data — wear your HR device overnight to start a trend.
          </Text>
        )}
      </View>

      {/* Breathing */}
      <Text style={styles.sectionLabel}>Breathing rate — last 7 days</Text>
      <View style={styles.card}>
        {sleep.breathingTrend.length > 0 ? (
          <SparkLine
            values={sleep.breathingTrend.map((p) => p.value)}
            labels={sleep.breathingTrend.map((p) => weekdayLetter(p.date))}
            color={colors.sleep}
            yAxis
            yUnit="rpm"
            height={120}
          />
        ) : (
          <Text style={styles.emptyChart}>
            No breathing-rate data from your HR device yet.
          </Text>
        )}
      </View>

      <View style={{ height: spacing.huge }} />

      {/* Modals */}
      <RingExplainerSheet
        visible={explainerOpen}
        onClose={() => setExplainerOpen(false)}
        eyebrow="SLEEP"
        title="What's in the sleep score?"
        summary={
          'A 0–100 composite mixing how long you slept, how solid the sleep ' +
          'was, the stage breakdown, and how steady your schedule is.'
        }
        components={[
          {
            label: 'Duration (35%)',
            description: 'Time asleep vs your 8-hour target. Drops sharply below 6 h.',
          },
          {
            label: 'Efficiency (15%)',
            description:
              'Time asleep / time in bed minus a penalty for awakenings beyond the second.',
          },
          {
            label: 'Deep & REM (30%)',
            description:
              'Squared distance from the healthy ranges (13–23% deep, 20–25% REM).',
          },
          {
            label: 'Regularity (20%)',
            description:
              '7-day stddev of bedtime — consistent timing scores higher.',
          },
        ]}
        footer="Missing components renormalize. Targets follow public sleep-research consensus."
      />
      <HypnogramDetail
        visible={hypnogramOpen}
        onClose={() => setHypnogramOpen(false)}
        sleep={sleep}
      />
    </ScrollView>
  );
}

type Tone = 'good' | 'warn' | 'bad';

function evalDuration(minutes: number): { text: string; tone: Tone } | undefined {
  if (minutes <= 0) return undefined;
  if (minutes >= 7 * 60) return { text: 'OPTIMAL', tone: 'good' };
  if (minutes >= 6 * 60) return { text: 'ADEQUATE', tone: 'good' };
  if (minutes >= 5 * 60) return { text: 'SHORT', tone: 'warn' };
  return { text: 'INSUFFICIENT', tone: 'bad' };
}

function evalRegularity(percent: number): { text: string; tone: Tone } | undefined {
  if (percent <= 0) return undefined;
  if (percent >= 80) return { text: 'CONSISTENT', tone: 'good' };
  if (percent >= 60) return { text: 'VARIABLE', tone: 'warn' };
  return { text: 'IRREGULAR', tone: 'bad' };
}

function evalDeepRem(
  stageMinutes: number,
  total: number,
  loFraction: number,
  hiFraction: number,
): { text: string; tone: Tone } | undefined {
  if (total <= 0) return undefined;
  const f = stageMinutes / total;
  if (f >= loFraction && f <= hiFraction) return { text: 'NORMAL', tone: 'good' };
  if (f < loFraction / 2 || f > hiFraction * 1.5) return { text: 'OUTSIDE', tone: 'bad' };
  return { text: f < loFraction ? 'LOW' : 'HIGH', tone: 'warn' };
}

function evalAwake(minutes: number, awakenings: number): { text: string; tone: Tone } | undefined {
  if (minutes <= 0 && awakenings === 0) return undefined;
  if (minutes <= 30 && awakenings <= 2) return { text: 'NORMAL', tone: 'good' };
  if (minutes <= 60 && awakenings <= 4) return { text: 'ELEVATED', tone: 'warn' };
  return { text: 'HIGH', tone: 'bad' };
}

interface MetricLineProps {
  label: string;
  value: string;
  status?: { text: string; tone: 'good' | 'warn' | 'bad' };
}

const TONE_BG = {
  good: 'rgba(34, 197, 94, 0.18)',
  warn: 'rgba(245, 158, 11, 0.18)',
  bad: 'rgba(239, 68, 68, 0.18)',
} as const;

const TONE_FG = {
  good: colors.accent,
  warn: colors.warning,
  bad: colors.danger,
} as const;

function MetricLine({ label, value, status }: MetricLineProps) {
  return (
    <View style={metricStyles.row}>
      <Text style={metricStyles.label}>{label}</Text>
      <Text style={metricStyles.value}>{value}</Text>
      {status ? (
        <View style={[metricStyles.pill, { backgroundColor: TONE_BG[status.tone] }]}>
          <Text style={[metricStyles.pillText, { color: TONE_FG[status.tone] }]}>
            {status.text}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function Divider() {
  return <View style={metricStyles.divider} />;
}

const metricStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  label: {
    flex: 1,
    fontSize: typography.size.sm + 1,
    color: colors.text,
    fontWeight: typography.weight.semibold,
  },
  value: {
    fontSize: typography.size.md,
    color: colors.text,
    fontWeight: typography.weight.semibold,
  },
  pill: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radii.sm,
  },
  pillText: {
    fontSize: typography.size.xs - 1,
    fontWeight: typography.weight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  divider: { height: 1, backgroundColor: colors.borderSubtle },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  heroWrap: { alignItems: 'center', marginBottom: spacing.xl },
  sectionLabel: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    fontWeight: typography.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  hypnogramHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  hypnogramDuration: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  hypnogramHint: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },
  napRow: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  napIcon: { fontSize: typography.size.lg, color: colors.warning },
  napLabel: { fontSize: typography.size.sm, color: colors.textSecondary },
  metricsCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
  },
  emptyChart: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
});
