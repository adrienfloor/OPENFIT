import fp from 'fastify-plugin';
import cors from '@fastify/cors';
import type { FastifyPluginAsync } from 'fastify';

const corsPlugin: FastifyPluginAsync = fp(async (fastify) => {
  const origin = process.env['CORS_ORIGIN'] ?? 'http://localhost:3000';

  await fastify.register(cors, {
    // Allow comma-separated origins for multi-client support (web + mobile dev)
    origin: origin.includes(',') ? origin.split(',').map((o) => o.trim()) : origin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
});

export { corsPlugin };
