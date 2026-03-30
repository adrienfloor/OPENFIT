import type { FastifyPluginAsync } from 'fastify';
import { AuthService } from '../../services/auth.service.js';
import { RegisterInputSchema, LoginInputSchema, RefreshInputSchema } from '@openfit/types';
import type { RegisterInput, LoginInput, RefreshInput } from '@openfit/types';

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  const authService = new AuthService(fastify.prisma, (payload) =>
    fastify.jwt.sign(payload),
  );

  // POST /auth/register
  fastify.post<{ Body: RegisterInput }>(
    '/register',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password', 'name', 'dateOfBirth', 'weightKg'],
        },
      },
    },
    async (request, reply) => {
      const parsed = RegisterInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Validation error', details: parsed.error.flatten() });
      }

      try {
        const result = await authService.register(parsed.data);
        return reply.status(201).send(result);
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          const authErr = err as { statusCode: number; message: string };
          return reply.status(authErr.statusCode).send({ error: authErr.message });
        }
        throw err;
      }
    },
  );

  // POST /auth/login
  fastify.post<{ Body: LoginInput }>(
    '/login',
    {},
    async (request, reply) => {
      const parsed = LoginInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Validation error', details: parsed.error.flatten() });
      }

      try {
        const result = await authService.login(parsed.data);
        return reply.status(200).send(result);
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          const authErr = err as { statusCode: number; message: string };
          return reply.status(authErr.statusCode).send({ error: authErr.message });
        }
        throw err;
      }
    },
  );

  // POST /auth/refresh
  fastify.post<{ Body: RefreshInput }>(
    '/refresh',
    {},
    async (request, reply) => {
      // Support both JSON body (mobile) and HttpOnly cookie (web)
      const bodyToken = (request.body as Partial<RefreshInput>).refreshToken;
      const cookieToken = request.cookies?.['refreshToken'];
      const rawToken = bodyToken ?? cookieToken;

      if (!rawToken) {
        return reply.status(400).send({ error: 'Refresh token is required' });
      }

      const parsed = RefreshInputSchema.safeParse({ refreshToken: rawToken });
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Validation error', details: parsed.error.flatten() });
      }

      try {
        const tokens = await authService.refresh(parsed.data.refreshToken);

        // Set new refresh token as HttpOnly cookie for web clients
        void reply.setCookie('refreshToken', tokens.refreshToken, {
          httpOnly: true,
          secure: process.env['NODE_ENV'] === 'production',
          sameSite: 'strict',
          path: '/auth/refresh',
          maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
        });

        return reply.status(200).send(tokens);
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          const authErr = err as { statusCode: number; message: string };
          return reply.status(authErr.statusCode).send({ error: authErr.message });
        }
        throw err;
      }
    },
  );

  // POST /auth/logout
  fastify.post(
    '/logout',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const bodyToken = (request.body as Partial<RefreshInput> | null)?.refreshToken;
      const cookieToken = request.cookies?.['refreshToken'];
      const rawToken = bodyToken ?? cookieToken;

      if (rawToken) {
        await authService.logout(rawToken);
      }

      // Clear the cookie regardless
      void reply.clearCookie('refreshToken', { path: '/auth/refresh' });

      return reply.status(204).send();
    },
  );

  // GET /auth/me
  fastify.get(
    '/me',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const profile = await authService.getProfile(request.user.sub);
        return reply.status(200).send(profile);
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          const authErr = err as { statusCode: number; message: string };
          return reply.status(authErr.statusCode).send({ error: authErr.message });
        }
        throw err;
      }
    },
  );
};
