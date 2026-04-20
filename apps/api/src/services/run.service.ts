import type { PrismaClient } from '@prisma/client';
import type { CreateRunSessionInput, UpdateRunSessionInput } from '@openfit/types';

export class RunError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'RunError';
  }
}

export class RunService {
  constructor(private readonly prisma: PrismaClient) {}

  async getRunsForUser(userId: string, limit = 50) {
    return this.prisma.runSession.findMany({
      where: { userId },
      orderBy: { startedAt: 'desc' },
      take: limit,
      include: {
        gpsPoints: { orderBy: { timestamp: 'asc' } },
        heartRateSamples: { orderBy: { timestamp: 'asc' } },
      },
    });
  }

  async getRunById(userId: string, runId: string) {
    const run = await this.prisma.runSession.findFirst({
      where: { id: runId, userId },
      include: {
        gpsPoints: { orderBy: { timestamp: 'asc' } },
        heartRateSamples: { orderBy: { timestamp: 'asc' } },
      },
    });

    if (!run) {
      throw new RunError('Run session not found', 404);
    }

    return run;
  }

  async createRun(userId: string, input: CreateRunSessionInput) {
    const data: Parameters<typeof this.prisma.runSession.create>[0]['data'] = {
      userId,
      startedAt: input.startedAt,
      completedAt: input.completedAt ?? null,
      distanceMeters: input.distanceMeters,
      durationSeconds: input.durationSeconds,
      avgPaceSecondsPerKm: input.avgPaceSecondsPerKm ?? null,
      bestPaceSecondsPerKm: input.bestPaceSecondsPerKm ?? null,
      elevationGainMeters: input.elevationGainMeters,
    };

    if (input.gpsPoints) {
      data.gpsPoints = {
        create: input.gpsPoints.map((p) => ({
          lat: p.lat,
          lng: p.lng,
          altitudeMeters: p.altitudeMeters,
          timestamp: p.timestamp,
          speedMps: p.speedMps,
        })),
      };
    }

    if (input.heartRateSamples) {
      data.heartRateSamples = {
        create: input.heartRateSamples.map((s) => ({
          timestamp: s.timestamp,
          bpm: s.bpm,
          zone: s.zone,
        })),
      };
    }

    return this.prisma.runSession.create({
      data,
      include: {
        gpsPoints: { orderBy: { timestamp: 'asc' } },
        heartRateSamples: { orderBy: { timestamp: 'asc' } },
      },
    });
  }

  async updateRun(userId: string, runId: string, input: UpdateRunSessionInput) {
    const run = await this.prisma.runSession.findFirst({
      where: { id: runId, userId },
    });

    if (!run) {
      throw new RunError('Run session not found', 404);
    }

    const data: Parameters<typeof this.prisma.runSession.update>[0]['data'] = {};
    if (input.completedAt !== undefined) data.completedAt = input.completedAt;
    if (input.distanceMeters !== undefined) data.distanceMeters = input.distanceMeters;
    if (input.durationSeconds !== undefined) data.durationSeconds = input.durationSeconds;
    if (input.avgPaceSecondsPerKm !== undefined) data.avgPaceSecondsPerKm = input.avgPaceSecondsPerKm;
    if (input.bestPaceSecondsPerKm !== undefined) data.bestPaceSecondsPerKm = input.bestPaceSecondsPerKm;
    if (input.elevationGainMeters !== undefined) data.elevationGainMeters = input.elevationGainMeters;

    return this.prisma.runSession.update({
      where: { id: runId },
      data,
      include: {
        gpsPoints: { orderBy: { timestamp: 'asc' } },
        heartRateSamples: { orderBy: { timestamp: 'asc' } },
      },
    });
  }

  async deleteRun(userId: string, runId: string) {
    const run = await this.prisma.runSession.findFirst({
      where: { id: runId, userId },
    });

    if (!run) {
      throw new RunError('Run session not found', 404);
    }

    await this.prisma.runSession.delete({ where: { id: runId } });
  }
}
