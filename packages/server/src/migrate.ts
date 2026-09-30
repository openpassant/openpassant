// SPDX-License-Identifier: Apache-2.0
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { AppError } from './errors.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations/', import.meta.url));

/**
 * Applies every not-yet-applied `.sql` file from `migrations/` in name
 * order, each inside its own transaction, and records it in the
 * `migrations` table. Plain SQL files, no framework, by design (M2 brief).
 */
export async function migrate(pool: pg.Pool): Promise<string[]> {
  await pool.query(
    'create table if not exists migrations (name text primary key, applied_at timestamptz not null default now())',
  );
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  const applied = new Set(
    (await pool.query<{ name: string }>('select name from migrations')).rows.map((r) => r.name),
  );
  const ran: string[] = [];
  for (const name of files) {
    if (applied.has(name)) {
      continue;
    }
    const sql = readFileSync(`${MIGRATIONS_DIR}${name}`, 'utf8');
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into migrations (name) values ($1)', [name]);
      await client.query('commit');
      ran.push(name);
    } catch (error) {
      await client.query('rollback');
      throw new AppError(
        'MIGRATION_FAILED',
        500,
        `migration ${name} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      client.release();
    }
  }
  return ran;
}
