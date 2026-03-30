import type { FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/', async (request, reply) => {
    const health = await fastify.prisma.dailyHealth.findMany({
      where: { userId: request.user.sub },
      orderBy: { date: 'desc' },
      take: 90,
    });
    return reply.send(health);
  });
};
