import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import type { JWTPayload } from '@openfit/types';

// Augment @fastify/jwt so that request.user is typed as JWTPayload
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JWTPayload;
    user: JWTPayload;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (role: 'user' | 'admin') => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const jwtPlugin: FastifyPluginAsync = fp(async (fastify) => {
  const accessSecret = process.env['JWT_ACCESS_SECRET'];
  if (!accessSecret) throw new Error('JWT_ACCESS_SECRET is required');

  await fastify.register(fastifyCookie);

  await fastify.register(fastifyJwt, {
    secret: accessSecret,
    sign: {
      expiresIn: process.env['JWT_ACCESS_EXPIRES_IN'] ?? '15m',
    },
  });

  fastify.decorate(
    'authenticate',
    async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      try {
        await request.jwtVerify();
      } catch {
        await reply.status(401).send({ error: 'Unauthorized', message: 'Invalid or expired token' });
      }
    },
  );

  fastify.decorate(
    'requireRole',
    (role: 'user' | 'admin') =>
      async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
        try {
          await request.jwtVerify();
        } catch {
          await reply.status(401).send({ error: 'Unauthorized', message: 'Invalid or expired token' });
          return;
        }

        if (request.user.role !== role && request.user.role !== 'admin') {
          await reply.status(403).send({ error: 'Forbidden', message: 'Insufficient permissions' });
        }
      },
  );
});

export { jwtPlugin };
