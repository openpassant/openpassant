// SPDX-License-Identifier: Apache-2.0

/**
 * A content section of a passport version, per crypto spec section 2 —
 * one per Annex XIII point of Regulation (EU) 2023/1542.
 */
export type Section = 'public' | 'restricted' | 'compliance' | 'usage';

/**
 * The four content sections in the fixed order defined by crypto spec
 * section 2. Section hashes MUST be combined into a leaf in exactly this
 * order.
 */
export const SECTIONS: readonly Section[] = ['public', 'restricted', 'compliance', 'usage'];

/**
 * Any value representable in JSON. `canonicalize` accepts exactly this set;
 * everything else (undefined, functions, bigint, non-finite numbers) is rejected.
 */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };

/**
 * One section document of a passport version, per crypto spec section 2:
 * a JSON object with exactly these four members.
 */
export interface SectionDoc {
  /** Passport identifier URL, identical across all four section documents. */
  id: string;
  /** Passport version, a positive integer starting at 1. */
  version: number;
  /** The section this document belongs to. */
  section: Section;
  /** Schema fields tagged with this section. Opaque JSON to this package. */
  data: { [k: string]: JsonValue };
}

/**
 * One step of a Merkle audit path, per crypto spec section 4.1: the sibling
 * hash (lowercase hex, 32 bytes) and the side the sibling is on.
 */
export interface ProofStep {
  position: 'left' | 'right';
  /** Sibling hash as 64 lowercase hex characters, no 0x prefix. */
  hash: string;
}

/**
 * A Merkle tree built over a fixed, ordered list of leaves,
 * per crypto spec section 4 (RFC 6962 structure).
 */
export interface MerkleTree {
  /** Number of leaves the tree was built from. */
  readonly size: number;
  /** The 32-byte Merkle root. A fresh copy is returned on each access. */
  readonly root: Uint8Array;
  /** Audit path for the leaf at `index`, per crypto spec section 4.1. */
  proof(index: number): ProofStep[];
}

/**
 * One section's entry in a proof bundle, per crypto spec section 5: either
 * the disclosed document with its salt (lowercase hex, 16 bytes), or the
 * bare section hash (lowercase hex, 32 bytes) — never both, never neither.
 */
export type SectionEntry = { doc: SectionDoc; salt: string } | { hash: string };

/**
 * A `passant-proof/2` proof bundle, exactly as crypto spec section 5.
 * Bundles arrive from the network; use {@link computeBundleRoot} to
 * validate and evaluate one rather than trusting this shape.
 */
export interface ProofBundle {
  spec: 'passant-proof/2';
  /** Passport identifier URL. */
  id: string;
  /** Passport version, a positive integer starting at 1. */
  version: number;
  /** All four sections, each disclosed or bare. */
  sections: Record<Section, SectionEntry>;
  merkle: {
    /** Audit path from the leaf to the root. */
    path: ProofStep[];
    /** Informational root; verifiers compare against the on-chain root instead. */
    root: string;
  };
  anchor: {
    /** Chain identifier of the form `<network>:<environment>`, e.g. `vechain:testnet`. */
    chain: string;
    /** Registry contract address, 0x-prefixed. */
    contract: string;
    /** Anchoring transaction id, 0x-prefixed. */
    txId: string;
  };
}

/**
 * Result of {@link computeBundleRoot}: the recomputed root and which
 * sections were actually checked (sections given as a bare hash are taken
 * on trust), or a typed failure. It never throws.
 */
export type VerifyResult =
  | { ok: true; root: Uint8Array; checkedSections: Section[] }
  | { ok: false; code: string; message: string };
