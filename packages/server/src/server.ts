// SPDX-License-Identifier: Apache-2.0
import { TESTNET_GENESIS_ID, VeChainAnchorAdapter } from '@openpassant/adapter-vechain';
import { buildApp } from './app.js';
import type { AnchorAdapter } from './anchoring/adapter.js';
import { AnchorScheduler } from './anchoring/scheduler.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { migrate } from './migrate.js';

/**
 * Entry point: load configuration, run migrations, wire the anchoring
 * adapter when configured, start listening. PORT defaults to 3000; every
 * other setting comes from `.env.example`.
 */
const config = loadConfig();
const pool = createPool(config.databaseUrl);
await migrate(pool);
const app = await buildApp(config, pool);

if (config.vechain !== undefined) {
  const vechainAdapter = new VeChainAnchorAdapter(config.vechain);
  // Fail closed before anything runs: the node must be the testnet.
  await vechainAdapter.verifyConnection(TESTNET_GENESIS_ID);
  // Structural conformance to the server's adapter contract is asserted here.
  const adapter: AnchorAdapter = vechainAdapter;
  const scheduler = new AnchorScheduler(
    pool,
    adapter,
    { batchWindowMs: config.anchorBatchWindowMs, batchMax: config.anchorBatchMax },
    (error) => app.log.error(error),
  );
  scheduler.start(Math.min(config.anchorBatchWindowMs, 30000));
}

const port = Number(process.env['PORT'] ?? 3000);
await app.listen({ port, host: '0.0.0.0' });
