// SPDX-License-Identifier: Apache-2.0
import { Address, Keccak256, Txt } from '@vechain/sdk-core';
import { ThorClient } from '@vechain/sdk-network';
import { beforeAll, describe, expect, it } from 'vitest';
import { VeChainAnchorAdapter } from '../src/adapter.js';
import { deployRegistry } from '../src/deploy.js';
import { AdapterError } from '../src/errors.js';
import { ANCHORED_EVENT_SIGNATURE, TESTNET_GENESIS_ID } from '../src/registry.js';
import {
  deployFreshRegistry,
  OPERATOR_KEY,
  OPERATOR_KEY_HEX,
  soloGenesisId,
  SOLO_URL,
  SPONSOR_KEY,
  SPONSOR_KEY_HEX,
} from './helpers.js';

function randomRoot(): Uint8Array {
  const root = new Uint8Array(32);
  crypto.getRandomValues(root);
  return root;
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AdapterError);
    return (error as AdapterError).code;
  }
  throw new Error('expected the call to reject');
}

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

async function waitConfirmed(txId: string): Promise<void> {
  for (let i = 0; i < 50; i++) {
    const status = await adapter.status(txId);
    if (status.state === 'confirmed') {
      return;
    }
    if (status.state === 'failed') {
      throw new Error('transaction failed');
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('transaction never confirmed');
}

describe('network verification (acceptance criterion 5 counterpart)', () => {
  it('accepts the connected chain by genesis id and rejects any other', async () => {
    await expect(adapter.verifyConnection(genesisId)).resolves.toBeUndefined();
    // solo is not the public testnet: the testnet genesis id must be refused.
    expect(await codeOf(adapter.verifyConnection(TESTNET_GENESIS_ID))).toBe('NETWORK_MISMATCH');
  });
});

describe('anchor / status / getAnchoredEvent round trip (acceptance criterion 3)', () => {
  it('anchors a root, confirms it and reads the event back', async () => {
    const root = randomRoot();
    const { txId } = await adapter.anchor(root);
    expect(txId).toMatch(/^0x[0-9a-f]{64}$/);
    await waitConfirmed(txId);

    const event = await adapter.getAnchoredEvent(txId);
    expect(Buffer.from(event.root).toString('hex')).toBe(Buffer.from(root).toString('hex'));
    expect(event.sender.toLowerCase()).toBe(
      Address.ofPrivateKey(OPERATOR_KEY).toString().toLowerCase(),
    );
    expect(event.timestamp).toBeGreaterThan(0);
  });

  it('the fee is paid by the sponsor via VIP-191, not the operator', async () => {
    const { txId } = await adapter.anchor(randomRoot());
    await waitConfirmed(txId);
    const receipt = await ThorClient.at(SOLO_URL).transactions.getTransactionReceipt(txId);
    expect(receipt).not.toBeNull();
    expect(receipt?.gasPayer.toLowerCase()).toBe(
      Address.ofPrivateKey(SPONSOR_KEY).toString().toLowerCase(),
    );
    expect(receipt?.meta?.txOrigin?.toLowerCase()).toBe(
      Address.ofPrivateKey(OPERATOR_KEY).toString().toLowerCase(),
    );
  });

  it('emits the exact event shape of crypto spec section 7', async () => {
    const root = randomRoot();
    const { txId } = await adapter.anchor(root);
    await waitConfirmed(txId);
    const receipt = await ThorClient.at(SOLO_URL).transactions.getTransactionReceipt(txId);
    const event = receipt?.outputs[0]?.events[0];
    expect(event).toBeDefined();
    if (event === undefined) {
      return;
    }
    expect(event.address.toLowerCase()).toBe(contractAddress.toLowerCase());
    expect(event.topics).toHaveLength(3);
    expect(event.topics[0]).toBe(ANCHORED_EVENT_SIGNATURE);
    expect(event.topics[0]).toBe(
      Keccak256.of(Txt.of('Anchored(bytes32,address,uint256)').bytes).toString(),
    );
    expect(event.topics[1]).toBe('0x' + Buffer.from(root).toString('hex'));
  });

  it('anchoring the same root twice does not revert (acceptance criterion 2)', async () => {
    const root = randomRoot();
    const first = await adapter.anchor(root);
    await waitConfirmed(first.txId);
    const second = await adapter.anchor(root);
    await waitConfirmed(second.txId);
    const event = await adapter.getAnchoredEvent(second.txId);
    expect(Buffer.from(event.root).toString('hex')).toBe(Buffer.from(root).toString('hex'));
  });
});

describe('fail-closed behaviour', () => {
  it('rejects an event emitted by a different contract', async () => {
    const { txId } = await adapter.anchor(randomRoot());
    await waitConfirmed(txId);
    const other = await deployFreshRegistry();
    const wrongAdapter = new VeChainAnchorAdapter({
      nodeUrl: SOLO_URL,
      contractAddress: other,
      operatorPrivateKey: OPERATOR_KEY_HEX,
      sponsorPrivateKey: SPONSOR_KEY_HEX,
    });
    expect(await codeOf(wrongAdapter.getAnchoredEvent(txId))).toBe('EVENT_NOT_FOUND');
  });

  it('rejects a malformed root and malformed configuration', async () => {
    expect(await codeOf(adapter.anchor(new Uint8Array(31)))).toBe('BAD_ROOT');
    expect(
      () =>
        new VeChainAnchorAdapter({
          nodeUrl: SOLO_URL,
          contractAddress: 'not-an-address',
          operatorPrivateKey: OPERATOR_KEY_HEX,
          sponsorPrivateKey: SPONSOR_KEY_HEX,
        }),
    ).toThrow(AdapterError);
    expect(
      () =>
        new VeChainAnchorAdapter({
          nodeUrl: SOLO_URL,
          contractAddress,
          operatorPrivateKey: '0x1234',
          sponsorPrivateKey: SPONSOR_KEY_HEX,
        }),
    ).toThrow(AdapterError);
  });

  it('reports pending for an unknown transaction and TX_NOT_FOUND on event lookup', async () => {
    const unknown = '0x' + '00'.repeat(32);
    expect(await adapter.status(unknown)).toEqual({ state: 'pending' });
    expect(await codeOf(adapter.getAnchoredEvent(unknown))).toBe('TX_NOT_FOUND');
  });

  it('maps an unreachable node to SEND_FAILED', async () => {
    const dead = new VeChainAnchorAdapter({
      nodeUrl: 'http://127.0.0.1:1',
      contractAddress,
      operatorPrivateKey: OPERATOR_KEY_HEX,
      sponsorPrivateKey: SPONSOR_KEY_HEX,
    });
    expect(await codeOf(dead.anchor(randomRoot()))).toBe('SEND_FAILED');
  });
});

describe('deployment (acceptance criterion 2)', () => {
  it('is safe to re-run: each run yields a fresh, working registry', async () => {
    const a = await deployFreshRegistry();
    const b = await deployFreshRegistry();
    expect(a).not.toBe(b);
  });

  it('refuses to deploy to a node on the wrong network', async () => {
    await expect(deployRegistry(SOLO_URL, TESTNET_GENESIS_ID, SPONSOR_KEY)).rejects.toMatchObject({
      code: 'NETWORK_MISMATCH',
    });
  });
});
