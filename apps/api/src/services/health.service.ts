import type { PrismaClient } from '@prisma/client';

export class HealthService {
  constructor(private readonly prisma: PrismaClient) {}

  async getDailyHealthForUser(userId: string, limit = 90) {
    return this.prisma.dailyHealth.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      take: limit,
    });
  }

  async upsertDailyHealth(
    userId: string,
    date: Date,
    data: {
      steps?: number;
      caloriesActive?: number;
      caloriesTotal?: number;
      heartRateResting?: number;
      hrvRmssd?: number;
      sleepDurationMinutes?: number;
      sleepScore?: number;
      recoveryScore?: number;
      strainScore?: number;
    },
  ) {
    return this.prisma.dailyHealth.upsert({
      where: { userId_date: { userId, date } },
      create: { userId, date, ...data },
      update: data,
    });
  }
}
