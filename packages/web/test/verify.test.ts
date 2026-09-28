// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { verifyPassport } from '../src/verify.js';
import type { FetchLike } from '../src/verify.js';

const ANCHORED_SIG = '0xfe2289542f7a0110ac112c3a4d712afdcaaf2900a1326f4e6f340b563a0e8734';
const NODE = 'https://node.example';
const PROOF = 'https://id.example/proof';

interface Bundle {
  merkle: { root: string };
  anchor: { chain: string; contract: string; txId: string };
  [k: string]: unknown;
}

function loadBundle(): Bundle {
  const url = new URL('../../../docs/test-vectors.json', import.meta.url);
  const vectors = JSON.parse(readFileSync(url, 'utf8')) as { bundle_public: Bundle };
  const bundle = structuredClone(vectors.bundle_public);
  bundle.anchor = {
    chain: 'vechain:testnet',
    contract: '0x' + '34'.repeat(20),
    txId: '0x' + '56'.repeat(32),
  };
  return bundle;
}

function receiptFor(bundle: Bundle, overrides: Record<string, unknown> = {}): unknown {
  return {
    reverted: false,
    outputs: [
      {
        events: [
          {
            address: bundle.anchor.contract,
            topics: [
              ANCHORED_SIG,
              '0x' + bundle.merkle.root,
              '0x' + '00'.repeat(12) + 'ab'.repeat(20),
            ],
            data: '0x0',
          },
        ],
      },
    ],
    meta: { blockTimestamp: 1758900000 },
    ...overrides,
  };
}

function fetchFor(
  bundle: unknown,
  receipt: unknown,
  statuses: { proof?: number; node?: number } = {},
): FetchLike {
  return (url) => {
    const isProof = url.startsWith(PROOF);
    const status = isProof ? (statuses.proof ?? 200) : (statuses.node ?? 200);
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(isProof ? bundle : receipt),
    });
  };
}

describe('verifyPassport runs crypto spec section 6 end to end', () => {
  it('verifies the vectors bundle against a matching on-chain event', async () => {
    const bundle = loadBundle();
    const result = await verifyPassport(PROOF, NODE, fetchFor(bundle, receiptFor(bundle)));
    expect(result).toMatchObject({
      status: 'verified',
      root: '0x' + bundle.merkle.root,
      sender: '0x' + 'ab'.repeat(20),
      blockTime: 1758900000,
      checkedSections: ['public'],
      trustedSections: ['restricted', 'compliance', 'usage'],
    });
  });

  it('reports not_anchored on the explicit 409', async () => {
    const bundle = loadBundle();
    const result = await verifyPassport(
      PROOF,
      NODE,
      fetchFor(bundle, receiptFor(bundle), { proof: 409 }),
    );
    expect(result).toEqual({ status: 'not_anchored' });
  });

  it('fails closed on proof and node HTTP errors', async () => {
    const bundle = loadBundle();
    expect(
      (await verifyPassport(PROOF, NODE, fetchFor(bundle, receiptFor(bundle), { proof: 500 })))
        .status,
    ).toBe('failed');
    expect(
      (await verifyPassport(PROOF, NODE, fetchFor(bundle, receiptFor(bundle), { node: 503 })))
        .status,
    ).toBe('failed');
  });

  it('fails closed on an invalid or tampered bundle', async () => {
    const bundle = loadBundle();
    (bundle['sections'] as Record<string, unknown>)['usage'] = {};
    const result = await verifyPassport(PROOF, NODE, fetchFor(bundle, receiptFor(bundle)));
    expect(result).toMatchObject({
      status: 'failed',
      reason: expect.stringContaining('invalid bundle'),
    });
  });

  it('fails closed on a malformed transaction id', async () => {
    const bundle = loadBundle();
    bundle.anchor.txId = '0xshort';
    const result = await verifyPassport(PROOF, NODE, fetchFor(bundle, receiptFor(bundle)));
    expect(result).toMatchObject({
      status: 'failed',
      reason: expect.stringContaining('transaction id'),
    });
  });

  it('fails closed on missing, reverted or foreign-contract events', async () => {
    const bundle = loadBundle();
    expect((await verifyPassport(PROOF, NODE, fetchFor(bundle, null))).status).toBe('failed');
    expect(
      (await verifyPassport(PROOF, NODE, fetchFor(bundle, receiptFor(bundle, { reverted: true }))))
        .status,
    ).toBe('failed');
    const foreign = receiptFor(bundle) as { outputs: { events: { address: string }[] }[] };
    foreign.outputs[0]!.events[0]!.address = '0x' + '99'.repeat(20);
    expect((await verifyPassport(PROOF, NODE, fetchFor(bundle, foreign))).status).toBe('failed');
  });

  it('fails closed when the on-chain root differs', async () => {
    const bundle = loadBundle();
    const receipt = receiptFor(bundle) as { outputs: { events: { topics: string[] }[] }[] };
    receipt.outputs[0]!.events[0]!.topics[1] = '0x' + 'ff'.repeat(32);
    const result = await verifyPassport(PROOF, NODE, fetchFor(bundle, receipt));
    expect(result).toMatchObject({
      status: 'failed',
      reason: expect.stringContaining('does not match'),
    });
  });

  it('turns thrown fetches into failures, never exceptions', async () => {
    const throwing: FetchLike = () => Promise.reject(new Error('offline'));
    const result = await verifyPassport(PROOF, NODE, throwing);
    expect(result).toMatchObject({ status: 'failed', reason: expect.stringContaining('offline') });
  });
});
