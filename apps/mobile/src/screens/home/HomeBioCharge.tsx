import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useDailyStats } from '../../hooks/useDailyStats';
import { HeroRing } from '../../components/HeroRing';
import { AIInsightCard } from '../../components/AIInsightCard';
import { RingExplainerSheet } from '../../components/RingExplainerSheet';
import {
  IntradayLineChart,
  type IntradayWindow,
} from '../../components/charts/IntradayLineChart';
import { SparkBars } from '../../components/charts/SparkBars';
import { SparkLine } from '../../components/charts/SparkLine';
import { useMockBioCharge, useMockBioChargeInsight } from '../../mocks';
import { colors, spacing, radii, typography, themedRefresh } from '../../theme';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function bioChargeTier(score: number): string {
  if (score >= 80) return 'FULL';
  if (score >= 60) return 'CHARGED';
  if (score >= 40) return 'HALF';
  if (score >= 20) return 'LOW';
  return 'DEPLETED';
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

/**
 * Home → BioCharge sub-tab — Slice 4.
 *
 * Layout:
 *   • Hero BioCharge ring (taps → explainer sheet)
 *   • AI insight card (taps → reasoning sheet)
 *   • Intraday BioCharge line chart with sleep + workout shading
 *   • Wake BioCharge score + sleep contribution
 *   • Today's events list
 *   • 7-day Wake BioCharge bars / HRV line / RHR line
 *
 * Per the locked drill-in matrix only the ring and insight are
 * tappable. Everything else is read-only.
 */
export function HomeBioCharge() {
  const { today, loading, refetch } = useDailyStats();
  const dashboard = useMockBioCharge(today?.recoveryScore ?? null);
  const insight = useMockBioChargeInsight();
  const [explainerOpen, setExplainerOpen] = useState(false);

  const tier = bioChargeTier(dashboard.current);
  const lastUpdated = `Updated ${formatTime(dashboard.lastUpdated)}`;

  // Sleep + workout shading bands for the intraday chart.
  const intradayWindows: IntradayWindow[] = dashboard.events.map((e) => ({
    startMinute: e.startTime.getHours() * 60 + e.startTime.getMinutes(),
    endMinute: e.endTime.getHours() * 60 + e.endTime.getMinutes(),
    tone: e.kind === 'sleep' ? 'sleep' : 'workout',
  }));

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={refetch} {...themedRefresh} />
      }
    >
      {/* Hero ring */}
      <View style={styles.heroWrap}>
        <HeroRing
          score={dashboard.current}
          color={colors.bioCharge}
          tier={tier}
          subtitle={lastUpdated}
          caption="BioCharge"
          onPress={() => setExplainerOpen(true)}
        />
      </View>

      {/* AI insight */}
      <AIInsightCard insight={insight} />

      {/* Intraday */}
      <Text style={styles.sectionLabel}>BioCharge through the day</Text>
      <View style={styles.card}>
        <IntradayLineChart
          data={dashboard.intraday}
          windows={intradayWindows}
          color={colors.bioCharge}
          yMin={0}
          yMax={100}
        />
        <View style={styles.legendRow}>
          <Legend tone={colors.sleep} label="Sleep" />
          <Legend tone={colors.bioCharge} label="Workout" />
        </View>
      </View>

      {/* Wake score */}
      <Text style={styles.sectionLabel}>Wake</Text>
      <View style={styles.wakeCard}>
        <View style={styles.wakeMain}>
          <Text style={styles.wakeValue}>{dashboard.wakeScore}</Text>
          <Text style={styles.wakeUnit}>OPTIMAL</Text>
        </View>
        <View style={styles.wakeContribution}>
          <View style={styles.contribDot} />
          <Text style={styles.contribLabel}>Sleep</Text>
          <Text style={styles.contribDelta}>
            +{dashboard.sleepContribution}
          </Text>
        </View>
      </View>

      {/* Daily events */}
      <Text style={styles.sectionLabel}>Daily events</Text>
      {dashboard.events.map((e, i) => {
        const positive = e.delta >= 0;
        return (
          <View key={i} style={[styles.eventRow, positive && styles.eventRowPositive]}>
            <View style={styles.eventIconWrap}>
              <Text style={styles.eventIcon}>{e.kind === 'sleep' ? '☾' : '⤬'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.eventLabel}>{e.label}</Text>
              <Text style={styles.eventTime}>
                {formatTime(e.startTime)} – {formatTime(e.endTime)}
              </Text>
            </View>
            <Text
              style={[
                styles.eventDelta,
                { color: positive ? colors.accent : colors.danger },
              ]}
            >
              {positive ? '+' : ''}
              {e.delta}
            </Text>
          </View>
        );
      })}

      {/* 7-day series */}
      <Text style={styles.sectionLabel}>Wake BioCharge — last 7 days</Text>
      <View style={styles.card}>
        <SparkBars
          values={dashboard.wakeTrend7Days.map((p) => p.value)}
          color={colors.bioCharge}
          labels={WEEKDAYS}
          showValues
          height={120}
        />
      </View>

      <Text style={styles.sectionLabel}>Heart rate variability — last 7 days</Text>
      <View style={styles.card}>
        <SparkLine
          values={dashboard.hrvTrend7Days.map((p) => p.value)}
          color={colors.danger}
          labels={WEEKDAYS}
          showValues
          height={140}
        />
      </View>

      <Text style={styles.sectionLabel}>Resting heart rate — last 7 days</Text>
      <View style={styles.card}>
        <SparkLine
          values={dashboard.rhrTrend7Days.map((p) => p.value)}
          color={colors.accent}
          labels={WEEKDAYS}
          showValues
          height={140}
        />
      </View>

      <View style={{ height: spacing.huge }} />

      {/* Ring explainer sheet */}
      <RingExplainerSheet
        visible={explainerOpen}
        onClose={() => setExplainerOpen(false)}
        eyebrow="BIOCHARGE"
        title="What is BioCharge?"
        summary={
          'A 0–100 readiness score that drains as you train and recovers ' +
          'with sleep. Think of it as a battery: full when you wake, lower ' +
          'after hard sessions, refilled overnight.'
        }
        components={[
          {
            label: 'HRV (30%)',
            description:
              'Heart-rate variability vs your 7-day baseline. Higher = better autonomic recovery.',
          },
          {
            label: 'Resting HR (20%)',
            description:
              'Lower-than-baseline RHR generally means recovered; elevated RHR drains the battery.',
          },
          {
            label: 'Sleep score (30%)',
            description:
              'Last night\'s composite duration / efficiency / regularity / deep / REM score.',
          },
          {
            label: 'Recent load (20%)',
            description:
              'Last 3 days of earned effort minutes, exponentially decayed. Recent training drains BioCharge for tomorrow.',
          },
        ]}
        footer={
          'Intraday: BioCharge depletes as you accumulate effort minutes. ' +
          'A workout that earns 30 minutes typically costs ~10 BioCharge points.'
        }
      />
    </ScrollView>
  );
}

function Legend({ tone, label }: { tone: string; label: string }) {
  return (
    <View style={legendStyles.row}>
      <View style={[legendStyles.dot, { backgroundColor: tone }]} />
      <Text style={legendStyles.label}>{label}</Text>
    </View>
  );
}

const legendStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  label: { fontSize: typography.size.xs, color: colors.textSecondary },
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
  legendRow: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm + 4 },
  wakeCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  wakeMain: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  wakeValue: {
    fontSize: typography.size.display,
    fontWeight: typography.weight.bold,
    color: colors.text,
    lineHeight: 38,
  },
  wakeUnit: {
    fontSize: typography.size.xs,
    color: colors.accent,
    fontWeight: typography.weight.bold,
    letterSpacing: 0.5,
  },
  wakeContribution: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  contribDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.sleep },
  contribLabel: { fontSize: typography.size.xs + 1, color: colors.textSecondary },
  contribDelta: {
    fontSize: typography.size.sm,
    color: colors.accent,
    fontWeight: typography.weight.bold,
  },
  eventRow: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.danger,
  },
  eventRowPositive: { borderLeftColor: colors.accent },
  eventIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventIcon: { fontSize: typography.size.md, color: colors.text },
  eventLabel: {
    fontSize: typography.size.sm + 1,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  eventTime: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  eventDelta: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
  },
});
