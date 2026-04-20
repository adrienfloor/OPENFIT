import type { FastifyPluginAsync } from 'fastify';
import {
  CreateRunSessionInputSchema,
  UpdateRunSessionInputSchema,
} from '@openfit/types';
import { RunService, RunError } from '../../services/run.service.js';

export const runRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate);

  const service = new RunService(fastify.prisma);

  fastify.get('/', async (request, reply) => {
    const runs = await service.getRunsForUser(request.user.sub);
    return reply.send(runs);
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const run = await service.getRunById(request.user.sub, request.params.id);
      return reply.send(run);
    } catch (err) {
      if (err instanceof RunError) {
        return reply.status(err.statusCode).send({ error: err.message });
      }
      throw err;
    }
  });

  fastify.post('/', async (request, reply) => {
    const parsed = CreateRunSessionInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', details: parsed.error.flatten() });
    }

    const run = await service.createRun(request.user.sub, parsed.data);
    return reply.status(201).send(run);
  });

  fastify.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const parsed = UpdateRunSessionInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', details: parsed.error.flatten() });
    }

    try {
      const run = await service.updateRun(request.user.sub, request.params.id, parsed.data);
      return reply.send(run);
    } catch (err) {
      if (err instanceof RunError) {
        return reply.status(err.statusCode).send({ error: err.message });
      }
      throw err;
    }
  });

  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      await service.deleteRun(request.user.sub, request.params.id);
      return reply.status(204).send();
    } catch (err) {
      if (err instanceof RunError) {
        return reply.status(err.statusCode).send({ error: err.message });
      }
      throw err;
    }
  });
};
