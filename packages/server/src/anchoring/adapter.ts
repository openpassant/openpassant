// SPDX-License-Identifier: Apache-2.0

/** Receipt for a submitted anchoring transaction. */
export interface AnchorReceipt {
  /** Transaction id, 0x-prefixed (on-chain value convention, crypto spec §1). */
  txId: string;
}

/** Status of a submitted anchoring transaction. */
export type AnchorStatus =
  | { state: 'pending' }
  | { state: 'confirmed'; blockNumber: number; blockTime: number }
  | { state: 'failed'; reason: string };

/** The Anchored event as read back from the chain (crypto spec §7). */
export interface AnchoredEvent {
  /** The anchored 32-byte Merkle root. */
  root: Uint8Array;
  /** Sender address, 0x-prefixed. */
  sender: string;
  /** Block timestamp, seconds since epoch. */
  timestamp: number;
}

/**
 * The boundary between the server and any chain (M2 brief, in-scope
 * item 6). The adapter knows nothing about passports: it moves 32-byte
 * roots. `adapter-vechain` (M3) implements this contract structurally,
 * without importing this package; the server asserts conformance where it
 * wires the adapter in. Nothing outside `adapter-vechain` may import a
 * VeChain package.
 */
export interface AnchorAdapter {
  /** Submits the root for anchoring and returns the transaction id. */
  anchor(root: Uint8Array): Promise<AnchorReceipt>;
  /** Reports the transaction's current status. */
  status(txId: string): Promise<AnchorStatus>;
  /** Reads back the Anchored event, verifying the emitting contract. */
  getAnchoredEvent(txId: string): Promise<AnchoredEvent>;
}

/**
 * In-memory adapter for tests and local development: anchors succeed
 * instantly and can be read back. Never used against a real chain.
 */
export class NoopAnchorAdapter implements AnchorAdapter {
  private readonly anchored = new Map<string, AnchoredEvent>();
  private counter = 0;

  anchor(root: Uint8Array): Promise<AnchorReceipt> {
    this.counter += 1;
    const txId = `0x${this.counter.toString(16).padStart(64, '0')}`;
    this.anchored.set(txId, {
      root: new Uint8Array(root),
      sender: '0x0000000000000000000000000000000000000000',
      timestamp: Math.floor(Date.now() / 1000),
    });
    return Promise.resolve({ txId });
  }

  status(txId: string): Promise<AnchorStatus> {
    return Promise.resolve(
      this.anchored.has(txId)
        ? { state: 'confirmed', blockNumber: 1, blockTime: Math.floor(Date.now() / 1000) }
        : { state: 'failed', reason: 'unknown transaction' },
    );
  }

  getAnchoredEvent(txId: string): Promise<AnchoredEvent> {
    const event = this.anchored.get(txId);
    if (event === undefined) {
      return Promise.reject(new Error('unknown transaction'));
    }
    return Promise.resolve(event);
  }
}
