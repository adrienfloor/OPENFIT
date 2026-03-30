import type { PrismaClient } from '@prisma/client';

export class RunService {
  constructor(private readonly prisma: PrismaClient) {}

  async getRunsForUser(userId: string, limit = 50) {
    return this.prisma.runSession.findMany({
      where: { userId },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
  }
}
