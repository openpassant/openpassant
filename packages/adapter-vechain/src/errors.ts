// SPDX-License-Identifier: Apache-2.0

/**
 * Stable machine-readable codes for adapter errors.
 *
 * - `BAD_ROOT`: root is not exactly 32 bytes.
 * - `BAD_CONFIG`: constructor options are malformed.
 * - `NETWORK_MISMATCH`: the node's genesis id is not the expected one.
 * - `SEND_FAILED`: the anchoring transaction could not be submitted.
 * - `TX_NOT_FOUND`: no receipt exists for the transaction id.
 * - `TX_REVERTED`: the transaction was included but reverted.
 * - `EVENT_NOT_FOUND`: the receipt carries no Anchored event from the
 *   configured contract — fail closed, never trust a foreign emitter.
 */
export type AdapterErrorCode =
  | 'BAD_ROOT'
  | 'BAD_CONFIG'
  | 'NETWORK_MISMATCH'
  | 'SEND_FAILED'
  | 'TX_NOT_FOUND'
  | 'TX_REVERTED'
  | 'EVENT_NOT_FOUND';

/**
 * Error thrown by the VeChain adapter. `code` is stable API; `message` is
 * human-readable detail and not part of the contract.
 */
export class AdapterError extends Error {
  /** Stable machine-readable error code. */
  readonly code: AdapterErrorCode;

  constructor(code: AdapterErrorCode, message: string) {
    super(message);
    this.name = 'AdapterError';
    this.code = code;
  }
}
