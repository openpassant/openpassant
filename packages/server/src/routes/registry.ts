// SPDX-License-Identifier: Apache-2.0
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { withTransaction } from '../db.js';
import { AppError } from '../errors.js';

interface ConfirmBody {
  ids: string[];
}

/**
 * EU DPP registry hook (Article 77(10); M2 brief, in-scope item 8): export
 * the identifiers awaiting registration, and record confirmations. No
 * network call to the registry is made — actual registration needs an
 * eIDAS-verified operator account and is a project-owner action.
 */
export function registerRegistryRoutes(app: FastifyInstance, pool: pg.Pool): void {
  app.get(
    '/passports::registry-export',
    {
      schema: {
        description:
          'Identifiers and registration metadata of passports not yet uploaded to the EU DPP registry, ready to hand to the registry UI or API.',
      },
    },
    async () => {
      const result = await pool.query(
        `select p.id as "uniqueIdentifier", m.gtin, p.serial_number as "serialNumber",
                m.name as "modelName", p.created_at as "createdAt"
           from passports p join battery_models m on m.id = p.model_id
          where p.registered_at is null
          order by p.created_at, p.id`,
      );
      return {
        batteryCategory: 'lmt',
        pending: result.rows,
      };
    },
  );

  app.post<{ Body: ConfirmBody }>(
    '/passports::registry-confirm',
    {
      schema: {
        description:
          'Record that the listed identifiers were registered in the EU DPP registry. Fails closed on any unknown identifier; already-confirmed identifiers keep their original timestamp.',
        body: {
          type: 'object',
          required: ['ids'],
          additionalProperties: false,
          properties: {
            ids: { type: 'array', minItems: 1, maxItems: 1000, items: { type: 'string' } },
          },
        },
      },
    },
    async (request) => {
      const { ids } = request.body;
      return withTransaction(pool, async (client) => {
        const known = await client.query<{ id: string }>(
          'select id from passports where id = any($1)',
          [ids],
        );
        if (known.rowCount !== new Set(ids).size) {
          const found = new Set(known.rows.map((r) => r.id));
          const missing = ids.find((id) => !found.has(id));
          throw new AppError('PASSPORT_NOT_FOUND', 404, `no passport with id ${missing}`);
        }
        const updated = await client.query(
          'update passports set registered_at = now() where id = any($1) and registered_at is null',
          [ids],
        );
        return { confirmed: updated.rowCount ?? 0 };
      });
    },
  );
}
