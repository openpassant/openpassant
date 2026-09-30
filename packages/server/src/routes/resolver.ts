// SPDX-License-Identifier: Apache-2.0
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import type { Config } from '../config.js';
import { AppError } from '../errors.js';
import { toJsonLd } from '../resolver/jsonld.js';
import { renderPassportPage } from '../resolver/render.js';
import { assembleBundle, getVersionView } from '../resolver/views.js';

interface ResolverParams {
  gtin: string;
  serial: string;
}

interface VersionQuery {
  version?: string;
}

const PARAMS_SCHEMA = {
  type: 'object',
  required: ['gtin', 'serial'],
  properties: { gtin: { type: 'string' }, serial: { type: 'string' } },
};
const QUERY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { version: { type: 'string', pattern: '^[0-9]+$' } },
};

// One uniform 404 for anything that does not resolve: no hint whether the
// GTIN exists, the serial pattern matched, or the version is out of range.
const NOT_FOUND = new AppError('PASSPORT_NOT_FOUND', 404, 'no passport at this address');

/**
 * The resolver (M4 brief, in-scope item 1): turns a scanned identifier
 * into the right representation. Public routes, no authentication, and
 * only ever the public section — the other sections appear solely as
 * hashes in the proof bundle.
 */
export function registerResolverRoutes(app: FastifyInstance, pool: pg.Pool, config: Config): void {
  const verifierNodeUrl = config.vechain?.nodeUrl ?? 'https://testnet.vechain.org';

  app.get<{ Params: ResolverParams; Querystring: VersionQuery }>(
    '/01/:gtin/21/:serial',
    {
      config: { public: true },
      schema: {
        description:
          'The public passport page (HTML), or the machine-readable JSON-LD form on Accept: application/ld+json. ?version=n selects a historical version.',
        params: PARAMS_SCHEMA,
        querystring: QUERY_SCHEMA,
      },
    },
    async (request, reply) => {
      const id = `${config.baseUrl}/01/${request.params.gtin}/21/${request.params.serial}`;
      const version =
        request.query.version === undefined ? undefined : Number(request.query.version);
      const view = await getVersionView(pool, id, version);
      if (view === null) {
        throw NOT_FOUND;
      }
      if ((request.headers.accept ?? '').includes('application/ld+json')) {
        return reply.type('application/ld+json').send(toJsonLd(view));
      }
      return reply.type('text/html; charset=utf-8').send(renderPassportPage(view, verifierNodeUrl));
    },
  );

  app.get<{ Params: ResolverParams; Querystring: VersionQuery }>(
    '/01/:gtin/21/:serial/proof',
    {
      config: { public: true },
      schema: {
        description:
          'The passant-proof/2 bundle for a version (crypto spec section 5): public section disclosed with its salt, the other sections as bare hashes, the audit path and the anchor. Served only once the batch is confirmed on-chain.',
        params: PARAMS_SCHEMA,
        querystring: QUERY_SCHEMA,
      },
    },
    async (request, reply) => {
      const id = `${config.baseUrl}/01/${request.params.gtin}/21/${request.params.serial}`;
      const version =
        request.query.version === undefined ? undefined : Number(request.query.version);
      const view = await getVersionView(pool, id, version);
      if (view === null) {
        throw NOT_FOUND;
      }
      const bundle = assembleBundle(view);
      if (bundle === null) {
        return reply
          .status(409)
          .send({ code: 'NOT_YET_ANCHORED', message: 'this version is not anchored on-chain yet' });
      }
      return reply.type('application/json').send(bundle);
    },
  );
}
