import { describe, it, expect, vi } from 'vitest';
import { MetricsService } from '../services/metrics.service.js';

function makePrismaMock() {
  return {
    user: { findUnique: vi.fn() },
    workoutLog: { findMany: vi.fn() },
    dailyHealth: { findMany: vi.fn() },
  };
}

describe('MetricsService.getFitnessAge', () => {
  it('assembles a Fitness Age response from DB state', async () => {
    const prisma = makePrismaMock();
    prisma.user.findUnique.mockResolvedValue({
      dateOfBirth: new Date('1990-02-22'),
      sex: 'male',
    });

    const now = new Date();

    // Two qualifying VO₂max samples in the last 28 days; service picks max.
    prisma.workoutLog.findMany
      .mockResolvedValueOnce([
        { vo2maxEstimate: 47, vo2maxComputedAt: new Date(now.getTime() - 5 * 86_400_000) },
        { vo2maxEstimate: 49, vo2maxComputedAt: new Date(now.getTime() - 12 * 86_400_000) },
      ])
      // Activity snapshot: 4 distinct days, 1 strength.
      .mockResolvedValueOnce([
        { type: 'strength', startedAt: new Date(now.getTime() - 1 * 86_400_000) },
        { type: 'strength', startedAt: new Date(now.getTime() - 2 * 86_400_000) },
        { type: 'run', startedAt: new Date(now.getTime() - 3 * 86_400_000) },
        { type: 'free', startedAt: new Date(now.getTime() - 6 * 86_400_000) },
      ]);

    prisma.dailyHealth.findMany.mockResolvedValue([
      { date: new Date(now.getTime() - 1 * 86_400_000), effortEarnedMinutes: 30, sleepScore: 80, heartRateResting: 47, hrvRmssd: 64 },
      { date: new Date(now.getTime() - 2 * 86_400_000), effortEarnedMinutes: 25, sleepScore: 78, heartRateResting: 48, hrvRmssd: 60 },
    ]);

    const service = new MetricsService(prisma as never);
    const result = await service.getFitnessAge('user_01');

    expect(result.chronoAge).toBeGreaterThan(30);
    expect(result.vo2max).toBe(49); // max of recent
    expect(result.vo2maxSampleCount).toBe(2);
    expect(result.calibrating).toBe(false);
    // History is returned oldest → newest, rounded to 1 dp, with ISO dates.
    expect(result.vo2maxHistory).toHaveLength(2);
    expect(result.vo2maxHistory.map((p) => p.value)).toEqual([47, 49]);
    expect(result.vo2maxHistory[0]!.computedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // Fit profile → fitness age clearly below chrono.
    expect(result.fitnessAge).toBeLessThan(result.chronoAge);
    // Components are populated.
    expect(result.components.vo2max).toBeLessThan(0);
  });

  it('separates the 28-day VO2max sample count from the 90-day trend window', async () => {
    const prisma = makePrismaMock();
    prisma.user.findUnique.mockResolvedValue({
      dateOfBirth: new Date('1990-02-22'),
      sex: 'male',
    });

    const now = new Date();
    // Three samples in the broader window: one from 60d ago (out of 28d
    // count) and two from inside.
    prisma.workoutLog.findMany
      .mockResolvedValueOnce([
        { vo2maxEstimate: 45, vo2maxComputedAt: new Date(now.getTime() - 60 * 86_400_000) },
        { vo2maxEstimate: 47, vo2maxComputedAt: new Date(now.getTime() - 5 * 86_400_000) },
        { vo2maxEstimate: 49, vo2maxComputedAt: new Date(now.getTime() - 12 * 86_400_000) },
      ])
      .mockResolvedValueOnce([]);

    prisma.dailyHealth.findMany.mockResolvedValue([]);

    const service = new MetricsService(prisma as never);
    const result = await service.getFitnessAge('user_01');

    expect(result.vo2maxHistory).toHaveLength(3);
    expect(result.vo2max).toBe(49); // max of 28d window
    expect(result.vo2maxSampleCount).toBe(2); // only the two within 28d
  });

  it('returns calibrating=true when no qualifying VO2max samples exist', async () => {
    const prisma = makePrismaMock();
    prisma.user.findUnique.mockResolvedValue({
      dateOfBirth: new Date('1990-02-22'),
      sex: 'male',
    });
    prisma.workoutLog.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    prisma.dailyHealth.findMany.mockResolvedValue([]);

    const service = new MetricsService(prisma as never);
    const result = await service.getFitnessAge('user_01');

    expect(result.vo2max).toBeNull();
    expect(result.vo2maxSampleCount).toBe(0);
    expect(result.calibrating).toBe(true);
  });
});
