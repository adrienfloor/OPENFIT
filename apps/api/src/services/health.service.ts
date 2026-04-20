import type { PrismaClient } from '@prisma/client';
import type { UpsertDailyHealthInput } from '@openfit/types';

export class HealthError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'HealthError';
  }
}

export class HealthService {
  constructor(private readonly prisma: PrismaClient) {}

  async getDailyHealthForUser(userId: string, limit = 90) {
    return this.prisma.dailyHealth.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      take: limit,
    });
  }

  async getDailyHealthByDate(userId: string, date: Date) {
    const record = await this.prisma.dailyHealth.findUnique({
      where: { userId_date: { userId, date } },
    });

    if (!record) {
      throw new HealthError('Daily health record not found', 404);
    }

    return record;
  }

  async upsertDailyHealth(userId: string, input: UpsertDailyHealthInput) {
    const { date, ...data } = input;

    // Strip undefined values so we only update fields that were sent
    const cleanData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        cleanData[key] = value;
      }
    }

    return this.prisma.dailyHealth.upsert({
      where: { userId_date: { userId, date } },
      create: { userId, date, ...cleanData },
      update: cleanData,
    });
  }

  async bulkUpsertDailyHealth(userId: string, entries: UpsertDailyHealthInput[]) {
    const results = await Promise.all(
      entries.map((entry) => this.upsertDailyHealth(userId, entry)),
    );
    return results;
  }
}
