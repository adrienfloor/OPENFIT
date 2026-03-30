import type { FastifyPluginAsync } from 'fastify';

export const workoutRoutes: FastifyPluginAsync = async (fastify) => {
  // All workout routes are protected
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/programs', async (request, reply) => {
    const programs = await fastify.prisma.program.findMany({
      where: { userId: request.user.sub },
      include: {
        weeks: {
          orderBy: { weekNumber: 'asc' },
          include: {
            sessions: {
              include: {
                plannedExercises: {
                  orderBy: { orderIndex: 'asc' },
                  include: {
                    exercise: true,
                    sets: { orderBy: { setIndex: 'asc' } },
                  },
                },
              },
            },
          },
        },
      },
    });
    return reply.send(programs);
  });

  fastify.get('/logs', async (request, reply) => {
    const logs = await fastify.prisma.workoutLog.findMany({
      where: { userId: request.user.sub },
      orderBy: { startedAt: 'desc' },
      include: {
        exerciseLogs: {
          include: {
            completedSets: { orderBy: { setIndex: 'asc' } },
          },
        },
      },
      take: 50,
    });
    return reply.send(logs);
  });
};
