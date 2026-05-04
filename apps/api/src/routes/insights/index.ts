import type { FastifyPluginAsync } from 'fastify';
import Anthropic from '@anthropic-ai/sdk';
import { InsightsService, InsightsError } from '../../services/insights.service.js';

export const insightsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate);

  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey && process.env['NODE_ENV'] !== 'test') {
    fastify.log.warn(
      'ANTHROPIC_API_KEY not set — /insights/today will fail until configured',
    );
  }

  const anthropic = new Anthropic({ apiKey: apiKey ?? 'placeholder' });
  const service = new InsightsService({
    prisma: fastify.prisma,
    anthropic,
    logger: fastify.log,
  });

  fastify.get('/today', async (request, reply) => {
    const focus = (request.query as { focus?: string })?.focus ?? 'general';
    try {
      const insight = await service.getOrCreate(request.user.sub, focus);
      return reply.send(insight);
    } catch (err) {
      if (err instanceof InsightsError) {
        return reply.status(err.statusCode).send({ error: err.message });
      }
      throw err;
    }
  });
};
