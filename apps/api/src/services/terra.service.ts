import type { PrismaClient } from '@prisma/client';

export class TerraService {
  constructor(private readonly prisma: PrismaClient) {}

  async getConnectionForUser(userId: string) {
    return this.prisma.terraConnection.findFirst({ where: { userId } });
  }

  async upsertConnectionForTerraUser(terraUserId: string, provider: string, userId: string) {
    return this.prisma.terraConnection.upsert({
      where: { terraUserId },
      create: { terraUserId, provider, userId },
      update: { provider },
    });
  }
}
