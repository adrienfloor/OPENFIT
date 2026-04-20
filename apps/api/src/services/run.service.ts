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
    return this.prisma.runSession.create({
      data: {
        userId,
        startedAt: input.startedAt,
        completedAt: input.completedAt ?? null,
        distanceMeters: input.distanceMeters,
        durationSeconds: input.durationSeconds,
        avgPaceSecondsPerKm: input.avgPaceSecondsPerKm ?? null,
        bestPaceSecondsPerKm: input.bestPaceSecondsPerKm ?? null,
        elevationGainMeters: input.elevationGainMeters,
        gpsPoints: input.gpsPoints
          ? {
              create: input.gpsPoints.map((p) => ({
                lat: p.lat,
                lng: p.lng,
                altitudeMeters: p.altitudeMeters,
                timestamp: p.timestamp,
                speedMps: p.speedMps,
              })),
            }
          : undefined,
        heartRateSamples: input.heartRateSamples
          ? {
              create: input.heartRateSamples.map((s) => ({
                timestamp: s.timestamp,
                bpm: s.bpm,
                zone: s.zone,
              })),
            }
          : undefined,
      },
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

    return this.prisma.runSession.update({
      where: { id: runId },
      data: {
        completedAt: input.completedAt !== undefined ? input.completedAt : undefined,
        distanceMeters: input.distanceMeters,
        durationSeconds: input.durationSeconds,
        avgPaceSecondsPerKm: input.avgPaceSecondsPerKm !== undefined ? input.avgPaceSecondsPerKm : undefined,
        bestPaceSecondsPerKm: input.bestPaceSecondsPerKm !== undefined ? input.bestPaceSecondsPerKm : undefined,
        elevationGainMeters: input.elevationGainMeters,
      },
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
