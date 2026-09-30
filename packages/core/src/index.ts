// SPDX-License-Identifier: Apache-2.0

/**
 * `@openpassant/core` — canonicalisation, hashing, Merkle trees and
 * proof-bundle verification for Passant digital product passports,
 * implementing `docs/crypto-spec.md` (`passant-crypto/2`) sections 1 to 6,
 * verification steps 1 to 5.
 *
 * Everything here is pure and synchronous except {@link generateSalt},
 * and runs unchanged in Node and in browsers.
 */

export type {
  Section,
  JsonValue,
  SectionDoc,
  ProofStep,
  MerkleTree,
  SectionEntry,
  ProofBundle,
  VerifyResult,
} from './types.js';
export { SECTIONS } from './types.js';
export { CoreError } from './errors.js';
export type { CoreErrorCode } from './errors.js';
export { canonicalize } from './canonicalize.js';
export { generateSalt } from './salt.js';
export { sectionHash, leafHash } from './hash.js';
export { buildTree, foldProof } from './merkle.js';
export { computeBundleRoot } from './bundle.js';
export { toHex, fromHex } from './hex.js';
