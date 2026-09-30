// SPDX-License-Identifier: Apache-2.0
import {
  deployRegistry,
  getGenesisId,
  MAINNET_GENESIS_ID,
  TESTNET_GENESIS_ID,
  VeChainAnchorAdapter,
} from '@openpassant/adapter-vechain';
import { buildApp } from './app.js';
import type { AnchorAdapter } from './anchoring/adapter.js';
import { AnchorScheduler } from './anchoring/scheduler.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { AppError } from './errors.js';
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
  const vechain = config.vechain;
  const genesisId = await getGenesisId(vechain.nodeUrl);

  // Fail closed before anything runs (hard rule 4): a testnet deployment
  // must be talking to the testnet; a solo deployment must be talking to
  // anything BUT the public networks — mainnet above all.
  if (vechain.network === 'solo') {
    if ([MAINNET_GENESIS_ID, TESTNET_GENESIS_ID].includes(genesisId.toLowerCase())) {
      throw new AppError(
        'CONFIG_INVALID',
        500,
        'VECHAIN_NETWORK=solo but the node is a public network; refusing to start',
      );
    }
  }

  let contractAddress = vechain.contractAddress;
  if (contractAddress === null) {
    // Solo only (the config guarantees it): deploy a fresh registry so the
    // offline profile works with zero manual steps.
    const sponsorKey = new Uint8Array(Buffer.from(vechain.sponsorPrivateKey.slice(2), 'hex'));
    const deployed = await deployRegistry(vechain.nodeUrl, genesisId, sponsorKey);
    contractAddress = deployed.contractAddress;
    console.log(`solo registry deployed at ${contractAddress}`);
  }

  const vechainAdapter = new VeChainAnchorAdapter({
    nodeUrl: vechain.nodeUrl,
    contractAddress,
    operatorPrivateKey: vechain.operatorPrivateKey,
    sponsorPrivateKey: vechain.sponsorPrivateKey,
  });
  await vechainAdapter.verifyConnection(
    vechain.network === 'testnet' ? TESTNET_GENESIS_ID : genesisId,
  );
  // Structural conformance to the server's adapter contract is asserted here.
  const adapter: AnchorAdapter = vechainAdapter;
  const scheduler = new AnchorScheduler(
    pool,
    adapter,
    {
      batchWindowMs: config.anchorBatchWindowMs,
      batchMax: config.anchorBatchMax,
      chain: `vechain:${vechain.network}`,
      contract: contractAddress,
    },
    (error) => app.log.error(error),
  );
  scheduler.start(Math.min(config.anchorBatchWindowMs, 30000));
  console.log(`anchoring to vechain:${vechain.network}, registry ${contractAddress}`);
}

const port = Number(process.env['PORT'] ?? 3000);
await app.listen({ port, host: '0.0.0.0' });
console.log(`passant server listening on :${port} for ${config.baseUrl}`);
