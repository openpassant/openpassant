// SPDX-License-Identifier: Apache-2.0
import swagger from '@fastify/swagger';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import type { Config } from './config.js';
import { AppError } from './errors.js';
import { registerModelRoutes } from './routes/models.js';
import { registerPassportRoutes } from './routes/passports.js';
import { registerRegistryRoutes } from './routes/registry.js';

/** Routes reachable without the issuer key. */
const OPEN_ROUTES = new Set(['/healthz', '/openapi.json']);

/**
 * Builds the issuing API: bearer-key auth, typed error responses, OpenAPI,
 * and the model / passport / registry routes. Pure assembly — callers own
 * the pool lifecycle and must have run migrations.
 */
export async function buildApp(config: Config, pool: pg.Pool): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, bodyLimit: 8 * 1024 * 1024 });

  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Passant issuing API',
        description:
          'Create battery models, mint unit passports in bulk, append passport versions, and track EU DPP registry registration.',
        version: '0.1.0',
      },
    },
  });

  app.addHook('onRequest', (request, reply, done) => {
    if (OPEN_ROUTES.has(request.routeOptions.url ?? '')) {
      done();
      return;
    }
    if (request.headers.authorization !== `Bearer ${config.issuerApiKey}`) {
      void reply.status(401).send({ code: 'UNAUTHORIZED', message: 'missing or wrong API key' });
      return;
    }
    done();
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      void reply.status(error.statusCode).send({ code: error.code, message: error.message });
      return;
    }
    const maybeValidation = error as { validation?: unknown; message?: string };
    if (maybeValidation.validation !== undefined) {
      void reply
        .status(400)
        .send({ code: 'VALIDATION_FAILED', message: maybeValidation.message ?? 'invalid request' });
      return;
    }
    app.log.error(error);
    void reply.status(500).send({ code: 'INTERNAL', message: 'unexpected server error' });
  });

  app.get(
    '/healthz',
    { schema: { description: 'Liveness and database reachability.' } },
    async () => {
      await pool.query('select 1');
      return { status: 'ok' };
    },
  );

  app.get('/openapi.json', { schema: { description: 'This API as an OpenAPI 3 document.' } }, () =>
    app.swagger(),
  );

  registerModelRoutes(app, pool);
  registerPassportRoutes(app, pool, config);
  registerRegistryRoutes(app, pool);

  await app.ready();
  return app;
}
