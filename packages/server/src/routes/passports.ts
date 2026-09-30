// SPDX-License-Identifier: Apache-2.0
import { SECTIONS } from '@openpassant/schema';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import type { Config } from '../config.js';
import { withTransaction } from '../db.js';
import { AppError } from '../errors.js';
import { buildIdentifier, validateSerial } from '../identifiers.js';
import { createVersion } from '../versions.js';
import { assertValidPassportContent, deepMerge } from '../validate.js';
import type { JsonObject } from '../validate.js';

/**
 * Passport identifiers are URLs and arrive URL-encoded as one path
 * segment. Depending on the router's decoding, the param may already be
 * decoded; a decoded identifier always contains "://", so this never
 * double-decodes one that is.
 */
export function decodeId(raw: string): string {
  return raw.includes('://') ? raw : decodeURIComponent(raw);
}

interface BatchBody {
  modelId: string;
  serials: string[];
  reason?: string;
  unitDefaults?: Record<string, unknown>;
}

interface VersionBody {
  content: Record<string, unknown>;
  reason: string;
}

/** Passport routes: batch mint, read, append version (M2 brief, item 3). */
export function registerPassportRoutes(app: FastifyInstance, pool: pg.Pool, config: Config): void {
  app.post<{ Body: BatchBody }>(
    '/passports::batch',
    {
      schema: {
        description:
          'Mint one passport (version 1) per serial for a model. Transactional: all passports mint or none do.',
        body: {
          type: 'object',
          required: ['modelId', 'serials'],
          additionalProperties: false,
          properties: {
            modelId: { type: 'string' },
            serials: { type: 'array', minItems: 1, maxItems: 1000, items: { type: 'string' } },
            reason: { type: 'string', minLength: 1 },
            unitDefaults: { type: 'object' },
          },
        },
      },
    },
    async (request, reply) => {
      const { modelId, serials, reason, unitDefaults } = request.body;
      if (new Set(serials).size !== serials.length) {
        throw new AppError('VALIDATION_FAILED', 400, 'serials contain duplicates');
      }
      const minted = await withTransaction(pool, async (client) => {
        const model = await client
          .query<{ gtin: string; content: JsonObject }>(
            'select gtin, content from battery_models where id = $1::uuid',
            [modelId],
          )
          .catch(() => {
            throw new AppError('MODEL_NOT_FOUND', 404, `no model with id ${modelId}`);
          });
        if (model.rowCount === 0) {
          throw new AppError('MODEL_NOT_FOUND', 404, `no model with id ${modelId}`);
        }
        const { gtin, content: modelContent } = model.rows[0]!;
        const results: { id: string; serialNumber: string }[] = [];
        for (const serial of serials) {
          validateSerial(serial);
          const id = buildIdentifier(config.baseUrl, gtin, serial);
          let content = deepMerge(modelContent, (unitDefaults as JsonObject) ?? {});
          content = deepMerge(content, { identification: { serialNumber: serial } });
          assertValidPassportContent(content);
          try {
            await client.query(
              'insert into passports (id, model_id, serial_number) values ($1, $2, $3)',
              [id, modelId, serial],
            );
          } catch (error) {
            if ((error as { code?: string }).code === '23505') {
              throw new AppError(
                'DUPLICATE_SERIAL',
                409,
                `a passport for serial ${serial} already exists on this model`,
              );
            }
            throw error;
          }
          await createVersion(
            client,
            id,
            1,
            content,
            reason ?? 'initial issue',
            config.anchorBatchMax,
          );
          results.push({ id, serialNumber: serial });
        }
        return results;
      });
      return reply.status(201).send({ count: minted.length, passports: minted });
    },
  );

  app.get<{ Params: { id: string } }>(
    '/passports/:id',
    {
      schema: {
        description:
          'Read a passport and its latest version number. The id is the URL-encoded identifier.',
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      },
    },
    async (request) => {
      const id = decodeId(request.params.id);
      const result = await pool.query(
        `select p.id, p.model_id as "modelId", p.serial_number as "serialNumber",
                p.status, p.registered_at as "registeredAt", p.created_at as "createdAt",
                (select max(version) from passport_versions v where v.passport_id = p.id) as "latestVersion"
           from passports p where p.id = $1`,
        [id],
      );
      if (result.rowCount === 0) {
        throw new AppError('PASSPORT_NOT_FOUND', 404, `no passport with id ${id}`);
      }
      return result.rows[0];
    },
  );

  app.post<{ Params: { id: string }; Body: VersionBody }>(
    '/passports/:id/versions',
    {
      schema: {
        description:
          'Append a new version with full content and a reason. Versions are append-only.',
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
        body: {
          type: 'object',
          required: ['content', 'reason'],
          additionalProperties: false,
          properties: {
            content: { type: 'object' },
            reason: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const id = decodeId(request.params.id);
      const { content, reason } = request.body;
      assertValidPassportContent(content);
      const stored = await withTransaction(pool, async (client) => {
        const passport = await client.query('select id from passports where id = $1 for update', [
          id,
        ]);
        if (passport.rowCount === 0) {
          throw new AppError('PASSPORT_NOT_FOUND', 404, `no passport with id ${id}`);
        }
        const next = await client.query<{ next: number }>(
          'select coalesce(max(version), 0) + 1 as next from passport_versions where passport_id = $1',
          [id],
        );
        return createVersion(
          client,
          id,
          next.rows[0]!.next,
          content,
          reason,
          config.anchorBatchMax,
        );
      });
      return reply.status(201).send(stored);
    },
  );

  app.get<{ Params: { id: string; n: string } }>(
    '/passports/:id/versions/:n',
    {
      schema: {
        description:
          'Read one stored version: section documents (parsed from the exact canonical bytes that were hashed), salts, section hashes and the leaf.',
        params: {
          type: 'object',
          required: ['id', 'n'],
          properties: { id: { type: 'string' }, n: { type: 'string', pattern: '^[0-9]+$' } },
        },
      },
    },
    async (request) => {
      const id = decodeId(request.params.id);
      const version = Number(request.params.n);
      const result = await pool.query(
        'select * from passport_versions where passport_id = $1 and version = $2',
        [id, version],
      );
      if (result.rowCount === 0) {
        throw new AppError('VERSION_NOT_FOUND', 404, `no version ${version} for ${id}`);
      }
      const row = result.rows[0] as Record<string, string>;
      const sections = Object.fromEntries(
        SECTIONS.map((section) => [
          section,
          {
            doc: JSON.parse(row[`${section}_canonical`]!) as unknown,
            salt: row[`${section}_salt`],
            hash: row[`${section}_hash`],
          },
        ]),
      );
      return {
        passportId: id,
        version,
        reason: row['reason'],
        author: row['author'],
        createdAt: row['created_at'],
        leafHash: row['leaf_hash'],
        sections,
      };
    },
  );
}
