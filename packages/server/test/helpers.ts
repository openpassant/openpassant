// SPDX-License-Identifier: Apache-2.0
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { Config } from '../src/config.js';
import { createPool } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import type { JsonObject } from '../src/validate.js';

const ADMIN_URL =
  process.env['TEST_DATABASE_ADMIN_URL'] ?? 'postgres://postgres:postgres@localhost:5432/postgres';

export const TEST_BASE_URL = 'https://id.voltacycles.example';
export const TEST_API_KEY = 'test-key';
export const AUTH = { authorization: `Bearer ${TEST_API_KEY}` };

export interface TestContext {
  app: FastifyInstance;
  pool: pg.Pool;
  config: Config;
  teardown(): Promise<void>;
}

/**
 * Creates a fresh database for this suite (isolated, parallel-safe), runs
 * the migrations, and builds the app. `teardown` closes everything and
 * drops the database.
 */
export async function createTestContext(env: Record<string, string> = {}): Promise<TestContext> {
  const dbName = `passant_test_${randomBytes(6).toString('hex')}`;
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`create database ${dbName}`);
  await admin.end();

  const dbUrl = new URL(ADMIN_URL);
  dbUrl.pathname = `/${dbName}`;
  const config = loadConfig({
    BASE_URL: TEST_BASE_URL,
    DATABASE_URL: dbUrl.toString(),
    ISSUER_API_KEY: TEST_API_KEY,
    ...env,
  });
  const pool = createPool(config.databaseUrl);
  await migrate(pool);
  const app = await buildApp(config, pool);

  return {
    app,
    pool,
    config,
    async teardown() {
      await app.close();
      await pool.end();
      const cleaner = new pg.Client({ connectionString: ADMIN_URL });
      await cleaner.connect();
      await cleaner.query(`drop database ${dbName} with (force)`);
      await cleaner.end();
    },
  };
}

/** The schema package's sample passport — the canonical test content. */
export function samplePassportContent(): JsonObject {
  const url = new URL('../../schema/test/sample-passport.json', import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as JsonObject;
}

/**
 * Model-level content: the sample passport without its unit serial number.
 * Minting merges the serial back in per unit.
 */
export function sampleModelContent(): JsonObject {
  const content = samplePassportContent();
  delete (content['identification'] as JsonObject)['serialNumber'];
  return content;
}

/** Creates a model via the API and returns its id. */
export async function createSampleModel(
  app: FastifyInstance,
  gtin = '09506000134352',
): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/models',
    headers: AUTH,
    payload: { gtin, name: 'Urban 504 battery pack', content: sampleModelContent() },
  });
  if (response.statusCode !== 201) {
    throw new Error(`test model creation failed: ${response.body}`);
  }
  return (response.json() as { id: string }).id;
}
