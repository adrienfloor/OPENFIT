import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { CoachingProfileSchema } from '@openfit/types';
import { CoachService, CoachError } from '../../services/coach.service.js';
import { WorkoutService } from '../../services/workout.service.js';

const GenerateProgramBodySchema = z.object({
  profile: CoachingProfileSchema,
});

const AdjustSessionBodySchema = z.object({
  programId: z.string().min(1),
  weekNumber: z.number().int().positive(),
  sessionIndex: z.number().int().nonnegative(),
  context: z.unknown(),
});

export const coachRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate);

  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey && process.env['NODE_ENV'] !== 'test') {
    fastify.log.warn(
      'ANTHROPIC_API_KEY not set — /coach/generate-program will fail until configured',
    );
  }

  const anthropic = new Anthropic({ apiKey: apiKey ?? 'placeholder' });
  const workouts = new WorkoutService(fastify.prisma);
  const service = new CoachService({ prisma: fastify.prisma, anthropic, workouts });

  // ── Profile ──────────────────────────────────────────────────────────

  fastify.get('/profile', async (request, reply) => {
    const profile = await service.getCoachingProfile(request.user.sub);
    return reply.send({ profile });
  });

  fastify.put('/profile', async (request, reply) => {
    const parsed = CoachingProfileSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', details: parsed.error.flatten() });
    }
    const saved = await service.saveCoachingProfile(request.user.sub, parsed.data);
    return reply.send({ profile: saved });
  });

  // ── Program generation ───────────────────────────────────────────────

  fastify.post('/generate-program', async (request, reply) => {
    const parsed = GenerateProgramBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', details: parsed.error.flatten() });
    }

    try {
      // Persist the profile alongside the generation so the user doesn't
      // have to send it twice.
      await service.saveCoachingProfile(request.user.sub, parsed.data.profile);
      const result = await service.generateProgram(request.user.sub, parsed.data.profile);
      return reply.status(201).send(result);
    } catch (err) {
      if (err instanceof CoachError) {
        return reply.status(err.statusCode).send({ error: err.message });
      }
      throw err;
    }
  });

  // ── Daily session adjustment ─────────────────────────────────────────

  fastify.post('/adjust-session', async (request, reply) => {
    const parsed = AdjustSessionBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', details: parsed.error.flatten() });
    }

    try {
      const result = await service.adjustSessionForToday(
        request.user.sub,
        parsed.data.programId,
        parsed.data.weekNumber,
        parsed.data.sessionIndex,
        parsed.data.context,
      );
      return reply.send(result);
    } catch (err) {
      if (err instanceof CoachError) {
        return reply.status(err.statusCode).send({ error: err.message });
      }
      throw err;
    }
  });
};
