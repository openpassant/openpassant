// SPDX-License-Identifier: Apache-2.0
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { AppError } from '../errors.js';
import { validateGtin } from '../identifiers.js';
import { assertValidModelContent } from '../validate.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface CreateModelBody {
  gtin: string;
  name: string;
  content: Record<string, unknown>;
}

/** Battery model routes: create and read (M2 brief, in-scope item 3). */
export function registerModelRoutes(app: FastifyInstance, pool: pg.Pool): void {
  app.post<{ Body: CreateModelBody }>(
    '/models',
    {
      schema: {
        description:
          'Create a battery model. Content is a partial passport: model-level fields only, fully validated at mint time.',
        body: {
          type: 'object',
          required: ['gtin', 'name', 'content'],
          additionalProperties: false,
          properties: {
            gtin: { type: 'string' },
            name: { type: 'string', minLength: 1 },
            content: { type: 'object' },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              gtin: { type: 'string' },
              name: { type: 'string' },
              createdAt: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { gtin, name, content } = request.body;
      validateGtin(gtin);
      assertValidModelContent(content);
      try {
        const result = await pool.query<{ id: string; created_at: string }>(
          'insert into battery_models (gtin, name, content) values ($1, $2, $3) returning id, created_at',
          [gtin, name, JSON.stringify(content)],
        );
        return await reply
          .status(201)
          .send({ id: result.rows[0]!.id, gtin, name, createdAt: result.rows[0]!.created_at });
      } catch (error) {
        if ((error as { code?: string }).code === '23505') {
          throw new AppError('DUPLICATE_GTIN', 409, `a model with gtin ${gtin} already exists`);
        }
        throw error;
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    '/models/:id',
    {
      schema: {
        description: 'Read a battery model.',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
    },
    async (request) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) {
        throw new AppError('MODEL_NOT_FOUND', 404, `no model with id ${id}`);
      }
      const result = await pool.query(
        'select id, gtin, name, content, created_at as "createdAt" from battery_models where id = $1',
        [id],
      );
      if (result.rowCount === 0) {
        throw new AppError('MODEL_NOT_FOUND', 404, `no model with id ${id}`);
      }
      return result.rows[0];
    },
  );
}
