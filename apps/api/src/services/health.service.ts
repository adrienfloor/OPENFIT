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

  /**
   * Returns the user's last N days of daily TRIMP, oldest → newest, with a
   * row for every day in the window (missing days carry `dailyTrimp: null`).
   * Ordered ascending so it feeds straight into `computePMC()`.
   */
  async getTrimpHistory(userId: string, days: number) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setUTCDate(start.getUTCDate() - (days - 1));

    const records = await this.prisma.dailyHealth.findMany({
      where: { userId, date: { gte: start, lte: today } },
      select: { date: true, dailyTrimp: true },
      orderBy: { date: 'asc' },
    });

    // Densify the series so EMA decay accumulates on rest days too.
    const byDate = new Map<string, number | null>();
    for (const r of records) {
      byDate.set(r.date.toISOString().slice(0, 10), r.dailyTrimp);
    }
    const series: { date: string; dailyTrimp: number | null }[] = [];
    const cursor = new Date(start);
    while (cursor <= today) {
      const key = cursor.toISOString().slice(0, 10);
      series.push({
        date: key,
        dailyTrimp: byDate.has(key) ? byDate.get(key)! : null,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return series;
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
