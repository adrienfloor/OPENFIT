import type { FastifyPluginAsync } from 'fastify';
import { MetricsService, MetricsError } from '../../services/metrics.service.js';

export const metricsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate);

  const service = new MetricsService(fastify.prisma);

  fastify.get('/fitness-age', async (request, reply) => {
    try {
      const result = await service.getFitnessAge(request.user.sub);
      return reply.send(result);
    } catch (err) {
      if (err instanceof MetricsError) {
        return reply.status(err.statusCode).send({ error: err.message });
      }
      throw err;
    }
  });
};
