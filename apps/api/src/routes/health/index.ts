import type { FastifyPluginAsync } from 'fastify';
import {
  UpsertDailyHealthInputSchema,
  BulkUpsertDailyHealthInputSchema,
} from '@openfit/types';
import { HealthService, HealthError } from '../../services/health.service.js';

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate);

  const service = new HealthService(fastify.prisma);

  fastify.get('/', async (request, reply) => {
    const health = await service.getDailyHealthForUser(request.user.sub);
    return reply.send(health);
  });

  fastify.get<{ Querystring: { days?: string } }>('/trimp', async (request, reply) => {
    const raw = request.query.days;
    const parsed = raw == null ? 42 : Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 180) {
      return reply.status(400).send({ error: 'days must be an integer between 1 and 180' });
    }
    const series = await service.getTrimpHistory(request.user.sub, parsed);
    return reply.send(series);
  });

  fastify.get<{ Params: { date: string } }>('/:date', async (request, reply) => {
    try {
      const date = new Date(request.params.date);
      if (isNaN(date.getTime())) {
        return reply.status(400).send({ error: 'Invalid date format' });
      }
      const record = await service.getDailyHealthByDate(request.user.sub, date);
      return reply.send(record);
    } catch (err) {
      if (err instanceof HealthError) {
        return reply.status(err.statusCode).send({ error: err.message });
      }
      throw err;
    }
  });

  fastify.post('/', async (request, reply) => {
    const parsed = UpsertDailyHealthInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', details: parsed.error.flatten() });
    }

    const record = await service.upsertDailyHealth(request.user.sub, parsed.data);
    return reply.status(200).send(record);
  });

  fastify.post('/bulk', async (request, reply) => {
    const parsed = BulkUpsertDailyHealthInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', details: parsed.error.flatten() });
    }

    const records = await service.bulkUpsertDailyHealth(request.user.sub, parsed.data.entries);
    return reply.status(200).send(records);
  });
};
