// SPDX-License-Identifier: Apache-2.0
import { computeBundleRoot, toHex } from '@openpassant/core';
import type { Section } from '@openpassant/core';

/** Outcome of the full seven-step verification (crypto spec section 6). */
export type VerificationResult =
  | {
      status: 'verified';
      root: string;
      sender: string;
      blockTime: number;
      checkedSections: Section[];
      trustedSections: Section[];
    }
  | { status: 'not_anchored' }
  | { status: 'failed'; reason: string };

/** The subset of fetch this module needs; injectable for tests. */
export type FetchLike = (url: string) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

const ANCHORED_EVENT_SIGNATURE =
  '0xfe2289542f7a0110ac112c3a4d712afdcaaf2900a1326f4e6f340b563a0e8734';
const ALL_SECTIONS: Section[] = ['public', 'restricted', 'compliance', 'usage'];
const TX_ID_RE = /^0x[0-9a-f]{64}$/;

interface ReceiptEvent {
  address: string;
  topics: string[];
  data: string;
}

/**
 * Runs crypto spec section 6 end to end in the visitor's browser:
 * steps 1–5 via `core.computeBundleRoot` on the fetched bundle, then
 * steps 6–7 by reading the Anchored event from a public node over plain
 * `fetch` (the transaction-receipt endpoint) and comparing roots. Any
 * unexpected condition is a failure with a reason — never a pass.
 */
export async function verifyPassport(
  proofUrl: string,
  nodeUrl: string,
  fetchImpl: FetchLike = fetch,
): Promise<VerificationResult> {
  let bundle: unknown;
  try {
    const response = await fetchImpl(proofUrl);
    if (response.status === 409) {
      return { status: 'not_anchored' };
    }
    if (!response.ok) {
      return { status: 'failed', reason: `proof request failed (HTTP ${response.status})` };
    }
    bundle = await response.json();
  } catch (error) {
    return { status: 'failed', reason: `could not fetch the proof: ${describe(error)}` };
  }

  // Steps 1–5: pure, local, shared with the server via core.
  const computed = computeBundleRoot(bundle);
  if (!computed.ok) {
    return { status: 'failed', reason: `invalid bundle: ${computed.code}` };
  }
  const anchor = (bundle as { anchor: { chain: string; contract: string; txId: string } }).anchor;
  if (!TX_ID_RE.test(anchor.txId)) {
    return { status: 'failed', reason: 'invalid bundle: malformed transaction id' };
  }

  // Step 6: read the event from the chain, never from the server.
  let events: ReceiptEvent[];
  let blockTime: number;
  try {
    const response = await fetchImpl(`${nodeUrl}/transactions/${anchor.txId}/receipt`);
    if (!response.ok) {
      return { status: 'failed', reason: `node request failed (HTTP ${response.status})` };
    }
    const receipt = (await response.json()) as {
      reverted?: boolean;
      outputs?: { events?: ReceiptEvent[] }[];
      meta?: { blockTimestamp?: number };
    } | null;
    if (receipt === null || receipt.reverted === true) {
      return { status: 'failed', reason: 'the anchoring transaction is missing or reverted' };
    }
    events = (receipt.outputs ?? []).flatMap((output) => output.events ?? []);
    blockTime = receipt.meta?.blockTimestamp ?? 0;
  } catch (error) {
    return { status: 'failed', reason: `could not reach the ledger node: ${describe(error)}` };
  }

  const anchored = events.find(
    (event) =>
      event.address.toLowerCase() === anchor.contract.toLowerCase() &&
      event.topics[0] === ANCHORED_EVENT_SIGNATURE &&
      event.topics.length === 3,
  );
  if (anchored === undefined) {
    return {
      status: 'failed',
      reason: 'no Anchored event from the named registry contract in that transaction',
    };
  }

  // Step 7: the computed root must equal the on-chain root.
  const onChainRoot = anchored.topics[1]!;
  const computedRoot = '0x' + toHex(computed.root);
  if (onChainRoot !== computedRoot) {
    return { status: 'failed', reason: 'the recomputed root does not match the anchored root' };
  }

  return {
    status: 'verified',
    root: computedRoot,
    sender: '0x' + anchored.topics[2]!.slice(26),
    blockTime,
    checkedSections: computed.checkedSections,
    trustedSections: ALL_SECTIONS.filter((s) => !computed.checkedSections.includes(s)),
  };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
