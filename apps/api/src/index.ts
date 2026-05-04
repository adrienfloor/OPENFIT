import Fastify from 'fastify';
import { prismaPlugin } from './plugins/prisma.js';
import { corsPlugin } from './plugins/cors.js';
import { jwtPlugin } from './plugins/jwt.js';
import { authRoutes } from './routes/auth/index.js';
import { workoutRoutes } from './routes/workouts/index.js';
import { healthRoutes } from './routes/health/index.js';
import { coachRoutes } from './routes/coach/index.js';
import { nutritionRoutes } from './routes/nutrition/index.js';
import { metricsRoutes } from './routes/metrics/index.js';
import { insightsRoutes } from './routes/insights/index.js';

const server = Fastify({
  logger: {
    level: process.env['NODE_ENV'] === 'test' ? 'silent' : 'info',
  },
});

async function bootstrap(): Promise<void> {
  await server.register(prismaPlugin);
  await server.register(corsPlugin);
  await server.register(jwtPlugin);

  await server.register(authRoutes, { prefix: '/auth' });
  await server.register(workoutRoutes, { prefix: '/workouts' });
  await server.register(healthRoutes, { prefix: '/health' });
  await server.register(coachRoutes, { prefix: '/coach' });
  await server.register(nutritionRoutes, { prefix: '/nutrition' });
  await server.register(metricsRoutes, { prefix: '/metrics' });
  await server.register(insightsRoutes, { prefix: '/insights' });

  server.get('/healthz', async () => ({ status: 'ok' }));

  const port = Number(process.env['PORT'] ?? 3001);
  const host = '0.0.0.0';

  await server.listen({ port, host });
  server.log.info(`OpenFit API running on http://${host}:${port}`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
