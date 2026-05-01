import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { MacroTargetsSchema } from '@openfit/types';
import {
  NutritionService,
  NutritionError,
} from '../../services/nutrition.service.js';

const AnalyzeBodySchema = z.object({
  imageBase64: z.string().min(1),
  mimeType: z.string().min(1),
});

export const nutritionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate);

  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey && process.env['NODE_ENV'] !== 'test') {
    fastify.log.warn(
      'ANTHROPIC_API_KEY not set — /nutrition/analyze will fail until configured',
    );
  }
  const anthropic = new Anthropic({ apiKey: apiKey ?? 'placeholder' });
  const service = new NutritionService({
    prisma: fastify.prisma,
    anthropic,
    logger: fastify.log,
  });

  // ── Photo analysis ──────────────────────────────────────────────────

  fastify.post(
    '/analyze',
    // 8 MB body limit — comfortably above a phone's 6 MB compressed JPEG.
    { bodyLimit: 8 * 1024 * 1024 },
    async (request, reply) => {
      const parsed = AnalyzeBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: 'Validation error', details: parsed.error.flatten() });
      }
      try {
        const analysis = await service.analyzePhoto(request.user.sub, parsed.data);
        return reply.status(201).send(analysis);
      } catch (err) {
        if (err instanceof NutritionError) {
          return reply.status(err.statusCode).send({ error: err.message });
        }
        throw err;
      }
    },
  );

  // ── Photo retrieval (authenticated) ─────────────────────────────────

  fastify.get<{ Params: { userId: string; filename: string } }>(
    '/photos/:userId/:filename',
    async (request, reply) => {
      try {
        const { buffer, mimeType } = await service.readPhoto(
          request.user.sub,
          request.params.userId,
          request.params.filename,
        );
        return reply
          .header('Content-Type', mimeType)
          .header('Cache-Control', 'private, max-age=3600')
          .send(buffer);
      } catch (err) {
        if (err instanceof NutritionError) {
          return reply.status(err.statusCode).send({ error: err.message });
        }
        throw err;
      }
    },
  );

  // ── Logs CRUD ───────────────────────────────────────────────────────

  fastify.get<{ Querystring: { from?: string; to?: string } }>(
    '/logs',
    async (request, reply) => {
      const range: { from?: Date; to?: Date } = {};
      if (request.query.from) {
        const d = new Date(request.query.from);
        if (!isNaN(d.getTime())) range.from = d;
      }
      if (request.query.to) {
        const d = new Date(request.query.to);
        if (!isNaN(d.getTime())) range.to = d;
      }
      const logs = await service.listLogs(request.user.sub, range);
      return reply.send(logs);
    },
  );

  fastify.get<{ Params: { id: string } }>('/logs/:id', async (request, reply) => {
    try {
      const log = await service.getLog(request.user.sub, request.params.id);
      return reply.send(log);
    } catch (err) {
      if (err instanceof NutritionError) {
        return reply.status(err.statusCode).send({ error: err.message });
      }
      throw err;
    }
  });

  fastify.post('/logs', async (request, reply) => {
    try {
      const log = await service.confirmAnalysis(request.user.sub, request.body);
      return reply.status(201).send(log);
    } catch (err) {
      if (err instanceof NutritionError) {
        return reply.status(err.statusCode).send({ error: err.message });
      }
      throw err;
    }
  });

  fastify.patch<{ Params: { id: string } }>('/logs/:id', async (request, reply) => {
    try {
      const log = await service.updateLog(
        request.user.sub,
        request.params.id,
        request.body,
      );
      return reply.send(log);
    } catch (err) {
      if (err instanceof NutritionError) {
        return reply.status(err.statusCode).send({ error: err.message });
      }
      throw err;
    }
  });

  fastify.delete<{ Params: { id: string } }>('/logs/:id', async (request, reply) => {
    try {
      await service.deleteLog(request.user.sub, request.params.id);
      return reply.status(204).send();
    } catch (err) {
      if (err instanceof NutritionError) {
        return reply.status(err.statusCode).send({ error: err.message });
      }
      throw err;
    }
  });

  // ── Macro targets ───────────────────────────────────────────────────

  fastify.get('/targets', async (request, reply) => {
    const targets = await service.getMacroTargets(request.user.sub);
    return reply.send({ targets });
  });

  fastify.put('/targets', async (request, reply) => {
    const parsed = MacroTargetsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: 'Validation error', details: parsed.error.flatten() });
    }
    const targets = await service.setMacroTargets(request.user.sub, parsed.data);
    return reply.send({ targets });
  });
};
