// SPDX-License-Identifier: Apache-2.0
import pg from 'pg';

/** Creates a connection pool for the given PostgreSQL URL. */
export function createPool(databaseUrl: string): pg.Pool {
  return new pg.Pool({ connectionString: databaseUrl });
}

/**
 * Runs `fn` inside a transaction: COMMIT on success, ROLLBACK on any error.
 * The callback receives a dedicated client and must use it for every query.
 */
export async function withTransaction<T>(
  pool: pg.Pool,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
