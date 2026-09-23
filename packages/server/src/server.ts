// SPDX-License-Identifier: Apache-2.0
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { migrate } from './migrate.js';

/**
 * Entry point: load configuration, run migrations, start listening.
 * PORT defaults to 3000; every other setting comes from `.env.example`.
 */
const config = loadConfig();
const pool = createPool(config.databaseUrl);
await migrate(pool);
const app = await buildApp(config, pool);
const port = Number(process.env['PORT'] ?? 3000);
await app.listen({ port, host: '0.0.0.0' });
