import type { FastifyPluginAsync } from 'fastify';

export const runRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/', async (request, reply) => {
    const runs = await fastify.prisma.runSession.findMany({
      where: { userId: request.user.sub },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
    return reply.send(runs);
  });
};
