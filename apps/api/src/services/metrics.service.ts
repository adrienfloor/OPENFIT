import type { PrismaClient } from '@prisma/client';
import {
  ageYearsFromDob,
  currentVo2maxFromHistory,
  fitnessAge,
  popVo2max,
  type FitnessAgeResult,
} from '@openfit/fitness-core';

export class MetricsError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'MetricsError';
  }
}

export interface FitnessAgeResponse extends FitnessAgeResult {
  chronoAge: number;
  /** Best VO₂max in the rolling window, or null while uncalibrated. */
  vo2max: number | null;
  /** Population VO₂max for the user's age + sex — drives "compared to peers". */
  popVo2max: number;
  /** How many qualifying VO₂max samples back the current value. */
  vo2maxSampleCount: number;
}

export class MetricsService {
  constructor(private readonly prisma: PrismaClient) {}

  async getFitnessAge(userId: string): Promise<FitnessAgeResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { dateOfBirth: true, sex: true },
    });
    if (!user) {
      throw new MetricsError('User not found', 404);
    }

    const chronoAge = ageYearsFromDob(user.dateOfBirth);
    const now = new Date();
    const since28 = new Date(now.getTime() - 28 * 86_400_000);
    const since14 = new Date(now.getTime() - 14 * 86_400_000);

    // VO₂max history — only logs with a stored estimate count.
    const vo2Logs = await this.prisma.workoutLog.findMany({
      where: {
        userId,
        vo2maxEstimate: { not: null },
        vo2maxComputedAt: { gte: since28 },
      },
      select: { vo2maxEstimate: true, vo2maxComputedAt: true },
    });
    const vo2Estimates = vo2Logs
      .filter((l): l is { vo2maxEstimate: number; vo2maxComputedAt: Date } =>
        l.vo2maxEstimate != null && l.vo2maxComputedAt != null,
      )
      .map((l) => ({ value: l.vo2maxEstimate, computedAt: l.vo2maxComputedAt }));
    const vo2max = currentVo2maxFromHistory(vo2Estimates, { now, windowDays: 28 });

    // Activity snapshot over the last 28 days.
    const recentLogs = await this.prisma.workoutLog.findMany({
      where: { userId, startedAt: { gte: since28 } },
      select: { type: true, startedAt: true },
    });

    const distinctDays = new Set(
      recentLogs.map((l) => l.startedAt.toISOString().slice(0, 10)),
    );
    const workoutDaysLast28 = distinctDays.size;

    const strengthCount = recentLogs.filter((l) => l.type === 'strength').length;
    const strengthSessionsPerWeek = strengthCount / 4; // 28d / 7

    // Effort & sleep from DailyHealth — sleep score over 14d, weekly
    // earned effort minutes averaged over the same recent window we use
    // for activity counts.
    const recentHealth = await this.prisma.dailyHealth.findMany({
      where: { userId, date: { gte: since28 } },
      select: { date: true, effortEarnedMinutes: true, sleepScore: true, heartRateResting: true, hrvRmssd: true },
      orderBy: { date: 'desc' },
    });

    const efforts = recentHealth
      .map((h) => h.effortEarnedMinutes)
      .filter((v): v is number => v != null);
    const dailyAvgEffort = efforts.length > 0 ? efforts.reduce((s, v) => s + v, 0) / efforts.length : null;
    const weeklyEffortMinutes = dailyAvgEffort != null ? dailyAvgEffort * 7 : null;

    const sleep14 = recentHealth
      .filter((h) => h.date >= since14)
      .map((h) => h.sleepScore)
      .filter((v): v is number => v != null);
    const avgSleepScoreLast14 = sleep14.length > 0
      ? sleep14.reduce((s, v) => s + v, 0) / sleep14.length
      : null;

    // RHR + HRV — most recent non-null sample. We don't average; the
    // latest reading is the right "now" snapshot, and anomalies wash out
    // through the per-bpm/per-ms weighting in the formula.
    const restingHRBpm = recentHealth.find((h) => h.heartRateResting != null)?.heartRateResting ?? null;
    const hrvRmssdMs = recentHealth.find((h) => h.hrvRmssd != null)?.hrvRmssd ?? null;

    const result = fitnessAge({
      chronoAgeYears: chronoAge,
      sex: user.sex,
      restingHRBpm,
      hrvRmssdMs,
      vo2max,
      weeklyEffortMinutes,
      workoutDaysLast28,
      avgSleepScoreLast14,
      strengthSessionsPerWeek,
    });

    return {
      ...result,
      chronoAge,
      vo2max,
      popVo2max: popVo2max(chronoAge, user.sex),
      vo2maxSampleCount: vo2Estimates.length,
    };
  }
}
