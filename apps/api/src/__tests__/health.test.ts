import { describe, it, expect, vi } from 'vitest';
import { HealthService, HealthError } from '../services/health.service.js';

const mockDailyHealth = {
  id: 'dh_01',
  userId: 'user_01',
  date: new Date('2026-04-20'),
  steps: 8500,
  caloriesActive: 420,
  caloriesTotal: 2200,
  heartRateResting: 58,
  hrvRmssd: 45.2,
  sleepDurationMinutes: 480,
  sleepScore: 82,
  recoveryScore: 75,
  effortScore: 62.5,
};

function createMockPrisma() {
  return {
    dailyHealth: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  };
}

describe('HealthService.getDailyHealthForUser', () => {
  it('returns health records scoped to userId', async () => {
    const prisma = createMockPrisma();
    const service = new HealthService(prisma as never);

    prisma.dailyHealth.findMany.mockResolvedValue([mockDailyHealth]);

    const result = await service.getDailyHealthForUser('user_01');

    expect(result).toEqual([mockDailyHealth]);
    expect(prisma.dailyHealth.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user_01' } }),
    );
  });
});

describe('HealthService.getDailyHealthByDate', () => {
  it('returns record for specific date', async () => {
    const prisma = createMockPrisma();
    const service = new HealthService(prisma as never);

    prisma.dailyHealth.findUnique.mockResolvedValue(mockDailyHealth);

    const result = await service.getDailyHealthByDate('user_01', new Date('2026-04-20'));

    expect(result.steps).toBe(8500);
  });

  it('throws 404 when no record exists for date', async () => {
    const prisma = createMockPrisma();
    const service = new HealthService(prisma as never);

    prisma.dailyHealth.findUnique.mockResolvedValue(null);

    await expect(
      service.getDailyHealthByDate('user_01', new Date('2026-01-01')),
    ).rejects.toThrow(HealthError);
    await expect(
      service.getDailyHealthByDate('user_01', new Date('2026-01-01')),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('HealthService.upsertDailyHealth', () => {
  it('creates or updates a daily health record', async () => {
    const prisma = createMockPrisma();
    const service = new HealthService(prisma as never);

    prisma.dailyHealth.upsert.mockResolvedValue(mockDailyHealth);

    const result = await service.upsertDailyHealth('user_01', {
      date: new Date('2026-04-20'),
      steps: 8500,
      heartRateResting: 58,
      sleepDurationMinutes: 480,
    });

    expect(result.steps).toBe(8500);
    expect(prisma.dailyHealth.upsert).toHaveBeenCalledOnce();
  });

  it('only passes defined fields to update', async () => {
    const prisma = createMockPrisma();
    const service = new HealthService(prisma as never);

    prisma.dailyHealth.upsert.mockResolvedValue({ ...mockDailyHealth, steps: 10000 });

    await service.upsertDailyHealth('user_01', {
      date: new Date('2026-04-20'),
      steps: 10000,
    });

    const call = prisma.dailyHealth.upsert.mock.calls[0]![0];
    expect(call.update).toEqual({ steps: 10000 });
    expect(call.update).not.toHaveProperty('caloriesActive');
  });
});

describe('HealthService.bulkUpsertDailyHealth', () => {
  it('upserts multiple entries', async () => {
    const prisma = createMockPrisma();
    const service = new HealthService(prisma as never);

    prisma.dailyHealth.upsert.mockResolvedValue(mockDailyHealth);

    const result = await service.bulkUpsertDailyHealth('user_01', [
      { date: new Date('2026-04-19'), steps: 7000 },
      { date: new Date('2026-04-20'), steps: 8500 },
    ]);

    expect(result).toHaveLength(2);
    expect(prisma.dailyHealth.upsert).toHaveBeenCalledTimes(2);
  });
});

describe('Multi-tenancy: health isolation', () => {
  it('getDailyHealthByDate uses composite userId+date key', async () => {
    const prisma = createMockPrisma();
    const service = new HealthService(prisma as never);

    prisma.dailyHealth.findUnique.mockResolvedValue(null);

    await expect(
      service.getDailyHealthByDate('user_02', new Date('2026-04-20')),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(prisma.dailyHealth.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_date: { userId: 'user_02', date: new Date('2026-04-20') } },
      }),
    );
  });
});
