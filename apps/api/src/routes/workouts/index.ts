import type { FastifyPluginAsync } from 'fastify';
import {
  CreateProgramInputSchema,
  UpdateProgramInputSchema,
  CreateWorkoutLogInputSchema,
} from '@openfit/types';
import { WorkoutService, WorkoutError } from '../../services/workout.service.js';

export const workoutRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate);

  const service = new WorkoutService(fastify.prisma);

  // --- Exercises ---

  fastify.get('/exercises', async (_request, reply) => {
    const exercises = await service.getExercises();
    return reply.send(exercises);
  });

  // --- Programs ---

  fastify.get('/programs', async (request, reply) => {
    const programs = await service.getProgramsForUser(request.user.sub);
    return reply.send(programs);
  });

  fastify.get<{ Params: { id: string } }>('/programs/:id', async (request, reply) => {
    try {
      const program = await service.getProgramById(request.user.sub, request.params.id);
      return reply.send(program);
    } catch (err) {
      if (err instanceof WorkoutError) {
        return reply.status(err.statusCode).send({ error: err.message });
      }
      throw err;
    }
  });

  fastify.post('/programs', async (request, reply) => {
    const parsed = CreateProgramInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', details: parsed.error.flatten() });
    }

    try {
      const program = await service.createProgram(request.user.sub, parsed.data);
      return reply.status(201).send(program);
    } catch (err) {
      if (err instanceof WorkoutError) {
        return reply.status(err.statusCode).send({ error: err.message });
      }
      throw err;
    }
  });

  fastify.patch<{ Params: { id: string } }>('/programs/:id', async (request, reply) => {
    const parsed = UpdateProgramInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', details: parsed.error.flatten() });
    }

    try {
      const program = await service.updateProgram(request.user.sub, request.params.id, parsed.data);
      return reply.send(program);
    } catch (err) {
      if (err instanceof WorkoutError) {
        return reply.status(err.statusCode).send({ error: err.message });
      }
      throw err;
    }
  });

  fastify.delete<{ Params: { id: string } }>('/programs/:id', async (request, reply) => {
    try {
      await service.deleteProgram(request.user.sub, request.params.id);
      return reply.status(204).send();
    } catch (err) {
      if (err instanceof WorkoutError) {
        return reply.status(err.statusCode).send({ error: err.message });
      }
      throw err;
    }
  });

  // --- Workout Logs ---

  fastify.get('/logs', async (request, reply) => {
    const logs = await service.getLogsForUser(request.user.sub);
    return reply.send(logs);
  });

  fastify.get<{ Params: { id: string } }>('/logs/:id', async (request, reply) => {
    try {
      const log = await service.getLogById(request.user.sub, request.params.id);
      return reply.send(log);
    } catch (err) {
      if (err instanceof WorkoutError) {
        return reply.status(err.statusCode).send({ error: err.message });
      }
      throw err;
    }
  });

  fastify.post('/logs', async (request, reply) => {
    const parsed = CreateWorkoutLogInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', details: parsed.error.flatten() });
    }

    try {
      const log = await service.createWorkoutLog(request.user.sub, parsed.data);
      return reply.status(201).send(log);
    } catch (err) {
      if (err instanceof WorkoutError) {
        return reply.status(err.statusCode).send({ error: err.message });
      }
      throw err;
    }
  });

  fastify.delete<{ Params: { id: string } }>('/logs/:id', async (request, reply) => {
    try {
      await service.deleteWorkoutLog(request.user.sub, request.params.id);
      return reply.status(204).send();
    } catch (err) {
      if (err instanceof WorkoutError) {
        return reply.status(err.statusCode).send({ error: err.message });
      }
      throw err;
    }
  });
};
