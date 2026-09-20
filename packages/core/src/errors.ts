// SPDX-License-Identifier: Apache-2.0

/**
 * Stable machine-readable codes for errors thrown by this package.
 *
 * - `CANON_INVALID_TYPE`: value is not representable in JSON (undefined, function, bigint, symbol, or a non-plain object).
 * - `CANON_NON_FINITE`: number is NaN, Infinity or -Infinity.
 * - `BAD_HEX`: string is not even-length lowercase hex without 0x prefix.
 * - `BAD_LENGTH`: binary value has the wrong byte length for its role.
 * - `EMPTY_BATCH`: attempt to build a Merkle tree over zero leaves.
 * - `BAD_INDEX`: Merkle proof requested for an index outside the tree.
 * - `BAD_PATH`: a proof step is malformed.
 */
export type CoreErrorCode =
  | 'CANON_INVALID_TYPE'
  | 'CANON_NON_FINITE'
  | 'BAD_HEX'
  | 'BAD_LENGTH'
  | 'EMPTY_BATCH'
  | 'BAD_INDEX'
  | 'BAD_PATH';

/**
 * Error thrown by core functions. `code` is stable API; `message` is
 * human-readable detail and not part of the contract.
 */
export class CoreError extends Error {
  /** Stable machine-readable error code. */
  readonly code: CoreErrorCode;

  constructor(code: CoreErrorCode, message: string) {
    super(message);
    this.name = 'CoreError';
    this.code = code;
  }
}
