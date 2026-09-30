// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import swagger from '@fastify/swagger';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import type { Config } from './config.js';
import { AppError } from './errors.js';
import { registerModelRoutes } from './routes/models.js';
import { registerPassportRoutes } from './routes/passports.js';
import { registerQrRoutes } from './routes/qr.js';
import { registerRegistryRoutes } from './routes/registry.js';
import { registerResolverRoutes } from './routes/resolver.js';

declare module 'fastify' {
  interface FastifyContextConfig {
    /** Reachable without the issuer key (resolver, health, docs, assets). */
    public?: boolean;
  }
}

/**
 * Builds the API: bearer-key auth for issuing routes, public resolver
 * routes, typed error responses, cache policy, OpenAPI, and the browser
 * verifier asset. Pure assembly — callers own the pool lifecycle and must
 * have run migrations.
 */
export async function buildApp(config: Config, pool: pg.Pool): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, bodyLimit: 8 * 1024 * 1024 });

  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Passant issuing API',
        description:
          'Create battery models, mint unit passports in bulk, append passport versions, track EU DPP registry registration, and resolve public passport pages with verifiable proofs.',
        version: '0.1.0',
      },
    },
  });

  app.addHook('onRequest', (request, reply, done) => {
    if (request.routeOptions.config.public === true) {
      done();
      return;
    }
    if (request.headers.authorization !== `Bearer ${config.issuerApiKey}`) {
      void reply.status(401).send({ code: 'UNAUTHORIZED', message: 'missing or wrong API key' });
      return;
    }
    done();
  });

  // Public responses carry only public-section data and may be cached
  // briefly; everything authenticated can carry restricted sections or
  // salts and must never be cached (M4 acceptance criterion 3).
  app.addHook('onSend', (request, reply, _payload, done) => {
    if (reply.getHeader('cache-control') === undefined) {
      reply.header(
        'cache-control',
        request.routeOptions.config.public === true ? 'public, max-age=60' : 'no-store',
      );
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
    { config: { public: true }, schema: { description: 'Liveness and database reachability.' } },
    async () => {
      await pool.query('select 1');
      return { status: 'ok' };
    },
  );

  app.get(
    '/openapi.json',
    { config: { public: true }, schema: { description: 'This API as an OpenAPI 3 document.' } },
    () => app.swagger(),
  );

  // The in-browser verifier, built by @openpassant/web and served from the
  // same origin as the passport pages. Loaded once, lazily, so issuing-only
  // deployments and tests do not require the asset to exist.
  let verifierJs: string | null = null;
  app.get(
    '/assets/verifier.js',
    { config: { public: true }, schema: { description: 'The in-browser passport verifier.' } },
    (request, reply) => {
      if (verifierJs === null) {
        try {
          const require = createRequire(import.meta.url);
          verifierJs = readFileSync(require.resolve('@openpassant/web/verifier.js'), 'utf8');
        } catch {
          throw new AppError('VERIFIER_UNAVAILABLE', 404, 'verifier asset is not built');
        }
      }
      return reply.type('text/javascript; charset=utf-8').send(verifierJs);
    },
  );

  registerModelRoutes(app, pool);
  registerPassportRoutes(app, pool, config);
  registerRegistryRoutes(app, pool);
  registerQrRoutes(app, pool);
  registerResolverRoutes(app, pool, config);

  await app.ready();
  return app;
}
