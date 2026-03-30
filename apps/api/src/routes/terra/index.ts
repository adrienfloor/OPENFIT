import type { FastifyPluginAsync } from 'fastify';

export const terraRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /terra/auth-token — protected, generates a Terra auth token
  fastify.post(
    '/auth-token',
    { preHandler: [fastify.authenticate] },
    async (_request, reply) => {
      // Terra API integration — to be implemented when Terra credentials are available
      return reply.status(501).send({ error: 'Terra integration not yet configured' });
    },
  );

  // POST /terra/webhook — public but validated with TERRA_WEBHOOK_SECRET
  fastify.post<{ Body: unknown }>(
    '/webhook',
    {},
    async (request, reply) => {
      const secret = process.env['TERRA_WEBHOOK_SECRET'];
      const signature = request.headers['terra-signature'] as string | undefined;

      if (secret && !signature) {
        return reply.status(401).send({ error: 'Missing webhook signature' });
      }

      // Signature validation would go here using HMAC-SHA256
      // Acknowledged receipt — processing is async
      return reply.status(200).send({ status: 'received' });
    },
  );
};
