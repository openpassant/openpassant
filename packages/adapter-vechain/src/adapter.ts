// SPDX-License-Identifier: Apache-2.0
import { Address, HexUInt, Secp256k1, Transaction } from '@vechain/sdk-core';
import { ThorClient } from '@vechain/sdk-network';
import { AdapterError } from './errors.js';
import { randomNonce } from './tx.js';
import { ANCHOR_SELECTOR, ANCHORED_EVENT_SIGNATURE } from './registry.js';

/** Receipt for a submitted anchoring transaction. */
export interface AnchorReceipt {
  /** Transaction id, 0x-prefixed. */
  txId: string;
}

/** Status of a submitted anchoring transaction. */
export type AnchorStatus =
  | { state: 'pending' }
  | { state: 'confirmed'; blockNumber: number; blockTime: number }
  | { state: 'failed'; reason: string };

/** The Anchored event as read back from the chain (crypto spec §7). */
export interface AnchoredEvent {
  root: Uint8Array;
  sender: string;
  timestamp: number;
}

/** Constructor options; keys are 0x-prefixed 32-byte hex from the environment. */
export interface VeChainAnchorAdapterOptions {
  nodeUrl: string;
  contractAddress: string;
  operatorPrivateKey: string;
  sponsorPrivateKey: string;
}

const KEY_RE = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
// anchor(bytes32) is a fixed-shape call: 21k intrinsic + calldata + one
// LOG3 comes to ~26k gas; 60k leaves comfortable headroom.
const ANCHOR_GAS = 60000;
// Tip per gas in wei; ~0.003 VTHO per anchor at 60k gas.
const PRIORITY_FEE_WEI = 10n ** 11n;

function parseKey(value: string, what: string): Uint8Array {
  if (!KEY_RE.test(value)) {
    throw new AdapterError('BAD_CONFIG', `${what} must be 0x-prefixed 32-byte hex`);
  }
  const bytes = HexUInt.of(value).bytes;
  if (!Secp256k1.isValidPrivateKey(bytes)) {
    throw new AdapterError('BAD_CONFIG', `${what} is not a valid secp256k1 private key`);
  }
  return bytes;
}

/**
 * Anchors 32-byte Merkle roots on VeChainThor by calling
 * `PassantRegistry.anchor(bytes32)` in a VIP-191 fee-delegated, dynamic-fee
 * transaction: the operator key signs as sender, the sponsor key signs as
 * gas payer, both offline in this process. The adapter knows nothing about
 * passports; it moves roots (M2's AnchorAdapter contract, matched
 * structurally — this package imports nothing from `server`).
 */
export class VeChainAnchorAdapter {
  private readonly thor: ThorClient;
  private readonly contractAddress: string;
  private readonly operatorKey: Uint8Array;
  private readonly sponsorKey: Uint8Array;

  constructor(options: VeChainAnchorAdapterOptions) {
    if (!ADDRESS_RE.test(options.contractAddress)) {
      throw new AdapterError('BAD_CONFIG', 'contractAddress must be a 0x-prefixed address');
    }
    this.thor = ThorClient.at(options.nodeUrl);
    this.contractAddress = options.contractAddress.toLowerCase();
    this.operatorKey = parseKey(options.operatorPrivateKey, 'operatorPrivateKey');
    this.sponsorKey = parseKey(options.sponsorPrivateKey, 'sponsorPrivateKey');
  }

  /** The operator (transaction sender) address, for display and diagnostics. */
  get operatorAddress(): string {
    return Address.ofPrivateKey(this.operatorKey).toString();
  }

  /** The sponsor (gas payer) address, for funding checks. */
  get sponsorAddress(): string {
    return Address.ofPrivateKey(this.sponsorKey).toString();
  }

  /**
   * Verifies the connected node belongs to the expected network by genesis
   * block id, failing closed on any mismatch (hard rule 4: testnet only —
   * the caller passes `TESTNET_GENESIS_ID`).
   */
  async verifyConnection(expectedGenesisId: string): Promise<void> {
    const genesis = await this.thor.blocks.getGenesisBlock();
    if (genesis === null || genesis.id.toLowerCase() !== expectedGenesisId.toLowerCase()) {
      throw new AdapterError(
        'NETWORK_MISMATCH',
        `node genesis ${genesis?.id ?? '(none)'} does not match the expected network`,
      );
    }
  }

  /** Submits the root for anchoring; returns the transaction id. */
  async anchor(root: Uint8Array): Promise<AnchorReceipt> {
    if (!(root instanceof Uint8Array) || root.length !== 32) {
      throw new AdapterError('BAD_ROOT', 'root must be exactly 32 bytes');
    }
    try {
      const genesis = await this.thor.blocks.getGenesisBlock();
      const best = await this.thor.blocks.getBestBlockCompressed();
      if (genesis === null || best === null) {
        throw new Error('node returned no blocks');
      }
      const baseFee = BigInt(best.baseFeePerGas ?? '0x0');
      const body = {
        chainTag: Number.parseInt(genesis.id.slice(-2), 16),
        blockRef: best.id.slice(0, 18),
        expiration: 32,
        clauses: [
          {
            to: this.contractAddress,
            value: '0x0',
            data: ANCHOR_SELECTOR + HexUInt.of(root).digits,
          },
        ],
        gas: ANCHOR_GAS,
        maxFeePerGas: '0x' + (baseFee * 2n + PRIORITY_FEE_WEI).toString(16),
        maxPriorityFeePerGas: '0x' + PRIORITY_FEE_WEI.toString(16),
        dependsOn: null,
        nonce: randomNonce(),
        reserved: { features: 1 }, // VIP-191 fee delegation
      };
      const tx = Transaction.of(body).signAsSenderAndGasPayer(this.operatorKey, this.sponsorKey);
      const sent = await this.thor.transactions.sendTransaction(tx);
      return { txId: sent.id };
    } catch (error) {
      if (error instanceof AdapterError) {
        throw error;
      }
      throw new AdapterError(
        'SEND_FAILED',
        `could not submit anchor transaction: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Reports the transaction's status; a missing receipt means pending. */
  async status(txId: string): Promise<AnchorStatus> {
    const receipt = await this.thor.transactions.getTransactionReceipt(txId);
    if (receipt === null) {
      return { state: 'pending' };
    }
    if (receipt.reverted) {
      return { state: 'failed', reason: 'transaction reverted' };
    }
    return {
      state: 'confirmed',
      blockNumber: receipt.meta.blockNumber,
      blockTime: receipt.meta.blockTimestamp,
    };
  }

  /**
   * Reads the Anchored event back from the transaction receipt, accepting
   * only events emitted by the configured registry contract (crypto spec
   * §6 step 6). Fails closed on anything else.
   */
  async getAnchoredEvent(txId: string): Promise<AnchoredEvent> {
    const receipt = await this.thor.transactions.getTransactionReceipt(txId);
    if (receipt === null) {
      throw new AdapterError('TX_NOT_FOUND', `no receipt for transaction ${txId}`);
    }
    if (receipt.reverted) {
      throw new AdapterError('TX_REVERTED', `transaction ${txId} reverted`);
    }
    for (const output of receipt.outputs) {
      for (const event of output.events) {
        if (
          event.address.toLowerCase() === this.contractAddress &&
          event.topics[0] === ANCHORED_EVENT_SIGNATURE &&
          event.topics.length === 3
        ) {
          return {
            root: HexUInt.of(event.topics[1]!).bytes,
            sender: '0x' + event.topics[2]!.slice(26),
            timestamp: Number.parseInt(event.data, 16),
          };
        }
      }
    }
    throw new AdapterError(
      'EVENT_NOT_FOUND',
      `transaction ${txId} carries no Anchored event from ${this.contractAddress}`,
    );
  }
}
