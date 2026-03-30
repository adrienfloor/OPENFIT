import type { PrismaClient } from '@prisma/client';

export class WorkoutService {
  constructor(private readonly prisma: PrismaClient) {}

  async getProgramsForUser(userId: string) {
    return this.prisma.program.findMany({ where: { userId } });
  }

  async getLogsForUser(userId: string, limit = 50) {
    return this.prisma.workoutLog.findMany({
      where: { userId },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
  }
}
