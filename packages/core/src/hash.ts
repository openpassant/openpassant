// SPDX-License-Identifier: Apache-2.0
import { sha256 } from '@noble/hashes/sha2.js';
import { canonicalize } from './canonicalize.js';
import { CoreError } from './errors.js';
import type { JsonValue, SectionDoc } from './types.js';

/** Domain-separation prefixes, crypto spec section 1. */
export const PREFIX_SECTION = 0x10;
export const PREFIX_LEAF = 0x00;
export const PREFIX_NODE = 0x01;

const utf8 = new TextEncoder();

/** Concatenates byte strings with no separators or length prefixes. */
function concatBytes(...parts: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const part of parts) {
    total += part.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/**
 * Computes a section hash per crypto spec section 3:
 * `H( 0x10 || salt || JCS(sectionDoc) )`.
 *
 * The document is canonicalised as given; callers are responsible for it
 * having exactly the four members of crypto spec section 2.
 *
 * @param salt - Exactly 16 bytes. Not mutated.
 * @throws CoreError `BAD_LENGTH` if the salt is not 16 bytes;
 *   `CANON_*` if the document is not canonicalisable JSON.
 */
export function sectionHash(salt: Uint8Array, doc: SectionDoc): Uint8Array {
  if (!(salt instanceof Uint8Array) || salt.length !== 16) {
    throw new CoreError('BAD_LENGTH', 'salt must be exactly 16 bytes');
  }
  const json = utf8.encode(canonicalize(doc as unknown as JsonValue));
  return sha256(concatBytes(Uint8Array.of(PREFIX_SECTION), salt, json));
}

/**
 * Combines the four section hashes into a Merkle leaf per crypto spec
 * section 3: `H( 0x00 || h_public || h_restricted || h_compliance || h_usage )`.
 * The 129-byte preimage fixes the section order.
 *
 * @throws CoreError `BAD_LENGTH` if any section hash is not 32 bytes.
 */
export function leafHash(
  hPublic: Uint8Array,
  hRestricted: Uint8Array,
  hCompliance: Uint8Array,
  hUsage: Uint8Array,
): Uint8Array {
  for (const h of [hPublic, hRestricted, hCompliance, hUsage]) {
    if (!(h instanceof Uint8Array) || h.length !== 32) {
      throw new CoreError('BAD_LENGTH', 'section hashes must be exactly 32 bytes');
    }
  }
  return sha256(concatBytes(Uint8Array.of(PREFIX_LEAF), hPublic, hRestricted, hCompliance, hUsage));
}

/**
 * Hashes a Merkle interior node per crypto spec section 4:
 * `H( 0x01 || left || right )`. Internal to the tree and proof folding.
 */
export function nodeHash(left: Uint8Array, right: Uint8Array): Uint8Array {
  return sha256(concatBytes(Uint8Array.of(PREFIX_NODE), left, right));
}
