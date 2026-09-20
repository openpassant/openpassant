// SPDX-License-Identifier: Apache-2.0
import { CoreError } from './errors.js';
import { leafHash, tierHash } from './hash.js';
import { fromHex } from './hex.js';
import { foldProof } from './merkle.js';
import type { ProofStep, Tier, TierDoc, VerifyResult } from './types.js';
import { TIERS } from './types.js';

/** Internal control-flow error; always caught inside computeBundleRoot. */
class BundleError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'BundleError';
  }
}

/** Realm-independent plain-object check; see canonicalize.ts for rationale. */
function isPlainObject(value: unknown): value is { [k: string]: unknown } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === null || Object.getPrototypeOf(proto) === null;
}

/** Enforces that `obj` has exactly `keys` as its own enumerable keys. */
function requireExactKeys(
  obj: { [k: string]: unknown },
  keys: readonly string[],
  code: string,
  what: string,
): void {
  const present = Object.keys(obj);
  const missing = keys.filter((k) => !present.includes(k));
  const unknown = present.filter((k) => !keys.includes(k));
  if (missing.length > 0 || unknown.length > 0) {
    throw new BundleError(code, `${what} must have exactly the members ${keys.join(', ')}`);
  }
}

/** Decodes a hex field, mapping hex and length faults to stable codes. */
function requireHexBytes(value: unknown, byteLength: number, what: string): Uint8Array {
  if (typeof value !== 'string') {
    throw new BundleError('BAD_HEX', `${what} must be a lowercase hex string`);
  }
  const bytes = fromHex(value); // throws CoreError BAD_HEX
  if (bytes.length !== byteLength) {
    throw new BundleError('BAD_LENGTH', `${what} must be exactly ${byteLength} bytes`);
  }
  return bytes;
}

function validateTierDoc(entryDoc: unknown, tier: Tier, id: string, version: number): TierDoc {
  if (!isPlainObject(entryDoc)) {
    throw new BundleError('TIER_MALFORMED', `tier "${tier}" doc must be an object`);
  }
  requireExactKeys(
    entryDoc,
    ['id', 'version', 'tier', 'data'],
    'TIER_MALFORMED',
    `tier "${tier}" doc`,
  );
  if (entryDoc['tier'] !== tier) {
    throw new BundleError('TIER_MISMATCH', `doc.tier must equal the tier key "${tier}"`);
  }
  if (entryDoc['id'] !== id) {
    throw new BundleError('ID_MISMATCH', `tier "${tier}" doc.id does not match bundle.id`);
  }
  if (entryDoc['version'] !== version) {
    throw new BundleError(
      'VERSION_MISMATCH',
      `tier "${tier}" doc.version does not match bundle.version`,
    );
  }
  if (!isPlainObject(entryDoc['data'])) {
    throw new BundleError('TIER_MALFORMED', `tier "${tier}" doc.data must be an object`);
  }
  return entryDoc as unknown as TierDoc;
}

function validatePath(merkle: { [k: string]: unknown }): ProofStep[] {
  const path = merkle['path'];
  if (!Array.isArray(path)) {
    throw new BundleError('BAD_PATH', 'merkle.path must be an array');
  }
  return path.map((step: unknown, i: number): ProofStep => {
    if (!isPlainObject(step)) {
      throw new BundleError('BAD_PATH', `merkle.path[${i}] must be an object`);
    }
    requireExactKeys(step, ['position', 'hash'], 'BAD_PATH', `merkle.path[${i}]`);
    const position = step['position'];
    if (position !== 'left' && position !== 'right') {
      throw new BundleError('BAD_PATH', `merkle.path[${i}].position must be "left" or "right"`);
    }
    requireHexBytes(step['hash'], 32, `merkle.path[${i}].hash`);
    return { position, hash: step['hash'] as string };
  });
}

/**
 * Validates an untrusted proof bundle and performs crypto spec section 6,
 * steps 1 to 5: recompute the tier hashes of every disclosed tier, combine
 * them into the leaf and fold the audit path into a root.
 *
 * The whole `passant-proof/1` shape of crypto spec section 5 is validated
 * and anything unexpected fails closed with a stable `code`; this function
 * never throws. The bundle's own `merkle.root` is informational and is NOT
 * compared here: checking the recomputed root against the on-chain root
 * (steps 6 and 7) belongs to the chain adapter and verifier layers.
 *
 * `checkedTiers` lists the tiers that were recomputed from a disclosed
 * document, in the fixed tier order; tiers supplied as a bare hash are
 * taken on trust and not listed.
 */
export function computeBundleRoot(bundle: unknown): VerifyResult {
  try {
    if (!isPlainObject(bundle)) {
      throw new BundleError('MALFORMED_BUNDLE', 'bundle must be a JSON object');
    }
    if (bundle['spec'] !== 'passant-proof/1') {
      throw new BundleError('UNKNOWN_SPEC', 'bundle.spec must be "passant-proof/1"');
    }
    requireExactKeys(
      bundle,
      ['spec', 'id', 'version', 'tiers', 'merkle', 'anchor'],
      'MALFORMED_BUNDLE',
      'bundle',
    );
    const id = bundle['id'];
    if (typeof id !== 'string') {
      throw new BundleError('MALFORMED_BUNDLE', 'bundle.id must be a string');
    }
    const version = bundle['version'];
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
      throw new BundleError('MALFORMED_BUNDLE', 'bundle.version must be a positive integer');
    }

    const tiers = bundle['tiers'];
    if (!isPlainObject(tiers)) {
      throw new BundleError('MALFORMED_BUNDLE', 'bundle.tiers must be an object');
    }
    requireExactKeys(tiers, TIERS, 'TIER_MISSING', 'bundle.tiers');

    const tierHashes: Uint8Array[] = [];
    const checkedTiers: Tier[] = [];
    for (const tier of TIERS) {
      const entry = tiers[tier];
      if (!isPlainObject(entry)) {
        throw new BundleError('TIER_MALFORMED', `tier "${tier}" must be an object`);
      }
      const disclosed = 'doc' in entry || 'salt' in entry;
      const bare = 'hash' in entry;
      if (disclosed && bare) {
        throw new BundleError(
          'TIER_MALFORMED',
          `tier "${tier}" must not have both a doc and a hash`,
        );
      }
      if (!disclosed && !bare) {
        throw new BundleError('TIER_MALFORMED', `tier "${tier}" must have either a doc or a hash`);
      }
      if (bare) {
        requireExactKeys(entry, ['hash'], 'TIER_MALFORMED', `tier "${tier}"`);
        tierHashes.push(requireHexBytes(entry['hash'], 32, `tier "${tier}" hash`));
      } else {
        requireExactKeys(entry, ['doc', 'salt'], 'TIER_MALFORMED', `tier "${tier}"`);
        const salt = requireHexBytes(entry['salt'], 16, `tier "${tier}" salt`);
        const doc = validateTierDoc(entry['doc'], tier, id, version);
        tierHashes.push(tierHash(salt, doc));
        checkedTiers.push(tier);
      }
    }

    const merkle = bundle['merkle'];
    if (!isPlainObject(merkle)) {
      throw new BundleError('MALFORMED_BUNDLE', 'bundle.merkle must be an object');
    }
    requireExactKeys(merkle, ['path', 'root'], 'MALFORMED_BUNDLE', 'bundle.merkle');
    requireHexBytes(merkle['root'], 32, 'merkle.root');
    const path = validatePath(merkle);

    const anchor = bundle['anchor'];
    if (!isPlainObject(anchor)) {
      throw new BundleError('MALFORMED_BUNDLE', 'bundle.anchor must be an object');
    }
    requireExactKeys(anchor, ['chain', 'contract', 'txId'], 'MALFORMED_BUNDLE', 'bundle.anchor');
    for (const member of ['chain', 'contract', 'txId'] as const) {
      if (typeof anchor[member] !== 'string') {
        throw new BundleError('MALFORMED_BUNDLE', `anchor.${member} must be a string`);
      }
    }

    const leaf = leafHash(tierHashes[0]!, tierHashes[1]!, tierHashes[2]!);
    const root = foldProof(leaf, path);
    return { ok: true, root, checkedTiers };
  } catch (error: unknown) {
    // Fail closed with a stable code; this function must never throw.
    if (error instanceof BundleError || error instanceof CoreError) {
      return { ok: false, code: error.code, message: error.message };
    }
    return { ok: false, code: 'INTERNAL', message: 'unexpected error while verifying the bundle' };
  }
}
