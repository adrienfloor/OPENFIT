import { describe, it, expect, vi } from 'vitest';
import { RunService, RunError } from '../services/run.service.js';

const mockRun = {
  id: 'run_01',
  userId: 'user_01',
  startedAt: new Date('2026-04-20T08:00:00Z'),
  completedAt: new Date('2026-04-20T08:35:00Z'),
  distanceMeters: 5000,
  durationSeconds: 2100,
  avgPaceSecondsPerKm: 420,
  bestPaceSecondsPerKm: 390,
  elevationGainMeters: 45,
  gpsPoints: [],
  heartRateSamples: [],
};

function createMockPrisma() {
  return {
    runSession: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
}

describe('RunService.getRunsForUser', () => {
  it('returns runs scoped to userId', async () => {
    const prisma = createMockPrisma();
    const service = new RunService(prisma as never);

    prisma.runSession.findMany.mockResolvedValue([mockRun]);

    const result = await service.getRunsForUser('user_01');

    expect(result).toEqual([mockRun]);
    expect(prisma.runSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user_01' } }),
    );
  });
});

describe('RunService.getRunById', () => {
  it('returns run when it belongs to user', async () => {
    const prisma = createMockPrisma();
    const service = new RunService(prisma as never);

    prisma.runSession.findFirst.mockResolvedValue(mockRun);

    const result = await service.getRunById('user_01', 'run_01');

    expect(result.id).toBe('run_01');
    expect(prisma.runSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'run_01', userId: 'user_01' } }),
    );
  });

  it('throws 404 when run not found', async () => {
    const prisma = createMockPrisma();
    const service = new RunService(prisma as never);

    prisma.runSession.findFirst.mockResolvedValue(null);

    await expect(service.getRunById('user_01', 'nonexistent')).rejects.toThrow(RunError);
    await expect(service.getRunById('user_01', 'nonexistent')).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe('RunService.createRun', () => {
  it('creates a run session with GPS points and HR samples', async () => {
    const prisma = createMockPrisma();
    const service = new RunService(prisma as never);

    const createdRun = {
      ...mockRun,
      gpsPoints: [
        { lat: 48.8566, lng: 2.3522, altitudeMeters: 35, timestamp: new Date(), speedMps: 3.5 },
      ],
      heartRateSamples: [
        { timestamp: new Date(), bpm: 155, zone: 'cardio' },
      ],
    };
    prisma.runSession.create.mockResolvedValue(createdRun);

    const result = await service.createRun('user_01', {
      startedAt: new Date('2026-04-20T08:00:00Z'),
      completedAt: new Date('2026-04-20T08:35:00Z'),
      distanceMeters: 5000,
      durationSeconds: 2100,
      avgPaceSecondsPerKm: 420,
      bestPaceSecondsPerKm: 390,
      elevationGainMeters: 45,
      gpsPoints: [
        { lat: 48.8566, lng: 2.3522, altitudeMeters: 35, timestamp: new Date(), speedMps: 3.5 },
      ],
      heartRateSamples: [
        { timestamp: new Date(), bpm: 155, zone: 'cardio' },
      ],
    });

    expect(result.distanceMeters).toBe(5000);
    expect((result as Record<string, unknown>)['gpsPoints']).toHaveLength(1);
    expect((result as Record<string, unknown>)['heartRateSamples']).toHaveLength(1);
    expect(prisma.runSession.create).toHaveBeenCalledOnce();
  });

  it('creates a run session without GPS or HR data', async () => {
    const prisma = createMockPrisma();
    const service = new RunService(prisma as never);

    prisma.runSession.create.mockResolvedValue(mockRun);

    const result = await service.createRun('user_01', {
      startedAt: new Date('2026-04-20T08:00:00Z'),
      distanceMeters: 5000,
      durationSeconds: 2100,
      elevationGainMeters: 45,
    });

    expect(result.distanceMeters).toBe(5000);
    expect(prisma.runSession.create).toHaveBeenCalledOnce();
  });
});

describe('RunService.updateRun', () => {
  it('updates run fields', async () => {
    const prisma = createMockPrisma();
    const service = new RunService(prisma as never);

    prisma.runSession.findFirst.mockResolvedValue(mockRun);
    prisma.runSession.update.mockResolvedValue({ ...mockRun, distanceMeters: 5500 });

    const result = await service.updateRun('user_01', 'run_01', { distanceMeters: 5500 });

    expect(result.distanceMeters).toBe(5500);
  });

  it('throws 404 for another user\'s run', async () => {
    const prisma = createMockPrisma();
    const service = new RunService(prisma as never);

    prisma.runSession.findFirst.mockResolvedValue(null);

    await expect(
      service.updateRun('user_02', 'run_01', { distanceMeters: 5500 }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('RunService.deleteRun', () => {
  it('deletes run belonging to user', async () => {
    const prisma = createMockPrisma();
    const service = new RunService(prisma as never);

    prisma.runSession.findFirst.mockResolvedValue(mockRun);
    prisma.runSession.delete.mockResolvedValue(mockRun);

    await expect(service.deleteRun('user_01', 'run_01')).resolves.toBeUndefined();
    expect(prisma.runSession.delete).toHaveBeenCalledWith({ where: { id: 'run_01' } });
  });

  it('throws 404 for non-existent run', async () => {
    const prisma = createMockPrisma();
    const service = new RunService(prisma as never);

    prisma.runSession.findFirst.mockResolvedValue(null);

    await expect(service.deleteRun('user_01', 'nonexistent')).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe('Multi-tenancy: run isolation', () => {
  it('getRunById enforces userId scope', async () => {
    const prisma = createMockPrisma();
    const service = new RunService(prisma as never);

    prisma.runSession.findFirst.mockResolvedValue(null);

    await expect(service.getRunById('user_02', 'run_01')).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(prisma.runSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'run_01', userId: 'user_02' } }),
    );
  });
});
