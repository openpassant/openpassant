// SPDX-License-Identifier: Apache-2.0
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { Transaction } from '@vechain/sdk-core';
import { ThorClient } from '@vechain/sdk-network';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { VeChainAnchorAdapter } from '../src/adapter.js';
import { deployRegistry } from '../src/deploy.js';
import { AdapterError } from '../src/errors.js';
import { ANCHOR_SELECTOR } from '../src/registry.js';
import { randomNonce } from '../src/tx.js';
import {
  deployFreshRegistry,
  OPERATOR_KEY_HEX,
  soloGenesisId,
  SOLO_URL,
  SPONSOR_KEY,
  SPONSOR_KEY_HEX,
} from './helpers.js';

let contractAddress: string;
let adapter: VeChainAnchorAdapter;
let genesisId: string;

beforeAll(async () => {
  genesisId = await soloGenesisId();
  contractAddress = await deployFreshRegistry();
  adapter = new VeChainAnchorAdapter({
    nodeUrl: SOLO_URL,
    contractAddress,
    operatorPrivateKey: OPERATOR_KEY_HEX,
    sponsorPrivateKey: SPONSOR_KEY_HEX,
  });
}, 30000);

describe('reverted transactions fail closed', () => {
  it('reports failed status and TX_REVERTED on event lookup', async () => {
    // anchor(bytes32) with truncated calldata reverts in the ABI decoder.
    const thor = ThorClient.at(SOLO_URL);
    const genesis = await thor.blocks.getGenesisBlock();
    const best = await thor.blocks.getBestBlockCompressed();
    const body = {
      chainTag: Number.parseInt(genesis!.id.slice(-2), 16),
      blockRef: best!.id.slice(0, 18),
      expiration: 32,
      clauses: [{ to: contractAddress, value: '0x0', data: ANCHOR_SELECTOR + 'ab'.repeat(16) }],
      gas: 60000,
      maxFeePerGas: '0x' + (BigInt(best!.baseFeePerGas ?? '0x0') * 2n).toString(16),
      maxPriorityFeePerGas: '0x' + (10n ** 11n).toString(16),
      dependsOn: null,
      nonce: randomNonce(),
    };
    const tx = Transaction.of(body).sign(SPONSOR_KEY);
    const sent = await thor.transactions.sendTransaction(tx);
    await thor.transactions.waitForTransaction(sent.id);

    const status = await adapter.status(sent.id);
    expect(status).toEqual({ state: 'failed', reason: 'transaction reverted' });
    await expect(adapter.getAnchoredEvent(sent.id)).rejects.toMatchObject({
      code: 'TX_REVERTED',
    });
  });

  it('rejects a root that is not a Uint8Array', async () => {
    await expect(adapter.anchor([1, 2, 3] as unknown as Uint8Array)).rejects.toMatchObject({
      code: 'BAD_ROOT',
    });
  });
});

describe('degraded node responses (mocked HTTP)', () => {
  let server: Server;
  let url: string;
  let bestBlock: Record<string, unknown> | null;

  beforeAll(async () => {
    // A minimal Thor lookalike: genesis is real-shaped, the best block is
    // whatever the test sets (e.g. missing baseFeePerGas), and submitted
    // transactions are acknowledged.
    server = createServer((request, response) => {
      response.setHeader('content-type', 'application/json');
      if (request.url?.startsWith('/blocks/0')) {
        response.end(JSON.stringify({ id: genesisId, number: 0 }));
      } else if (request.url?.startsWith('/blocks/best')) {
        response.end(JSON.stringify(bestBlock));
      } else if (request.url?.startsWith('/transactions') && request.method === 'POST') {
        response.end(JSON.stringify({ id: '0x' + 'ab'.repeat(32) }));
      } else {
        response.statusCode = 404;
        response.end('{}');
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    url = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  });
  afterAll(() => {
    server.close();
  });

  it('anchors with a legacy node that reports no baseFeePerGas', async () => {
    bestBlock = { id: '0x' + '11'.repeat(32), number: 1 };
    const mocked = new VeChainAnchorAdapter({
      nodeUrl: url,
      contractAddress,
      operatorPrivateKey: OPERATOR_KEY_HEX,
      sponsorPrivateKey: SPONSOR_KEY_HEX,
    });
    const receipt = await mocked.anchor(new Uint8Array(32));
    expect(receipt.txId).toBe('0x' + 'ab'.repeat(32));
  });

  it('fails closed when the node returns no best block', async () => {
    bestBlock = null;
    const mocked = new VeChainAnchorAdapter({
      nodeUrl: url,
      contractAddress,
      operatorPrivateKey: OPERATOR_KEY_HEX,
      sponsorPrivateKey: SPONSOR_KEY_HEX,
    });
    await expect(mocked.anchor(new Uint8Array(32))).rejects.toBeInstanceOf(AdapterError);
    await expect(deployRegistry(url, genesisId, SPONSOR_KEY)).rejects.toMatchObject({
      code: 'SEND_FAILED',
    });
  });
});
