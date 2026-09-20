// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type * as core from '../src/index.js';

/** The public surface of `@openpassant/core`, however it was loaded. */
export type CoreApi = typeof core;

export interface CanonVector {
  input: core.JsonValue;
  canonical: string;
  sha256_of_utf8: string;
}

export interface SectionHashVector {
  section: core.Section;
  salt: string;
  doc: core.SectionDoc;
  canonical: string;
  hash: string;
}

export interface LeafVector {
  h_public: string;
  h_restricted: string;
  h_compliance: string;
  h_usage: string;
  leaf: string;
}

export interface MerkleVector {
  size: number;
  leaves: string[];
  root: string;
  proofs: { index: number; path: core.ProofStep[] }[];
}

export interface MerkleLargeVector {
  size: number;
  leaf_rule: string;
  root: string;
  proof_index_777_length: number;
}

export interface Vectors {
  spec: string;
  canonicalization: CanonVector[];
  section_hash: SectionHashVector[];
  leaf: LeafVector;
  merkle: MerkleVector[];
  merkle_large: MerkleLargeVector;
  bundle_public: core.ProofBundle;
}

/** Loads the normative vectors from docs/test-vectors.json, never literals. */
export function loadVectors(): Vectors {
  const url = new URL('../../../docs/test-vectors.json', import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as Vectors;
}

/** SHA-256 of a UTF-8 string, hex; test-side reference (tests may use Node). */
export function sha256HexOfUtf8(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Synthetic leaf per the vectors' rule: SHA256(utf8("leaf-" + i)). */
export function syntheticLeafHex(i: number): string {
  return sha256HexOfUtf8(`leaf-${i}`);
}

/**
 * Asserts every entry of docs/test-vectors.json against a core API.
 * Runs against the plain import (vectors.test.ts) and against the bundled
 * build inside a web sandbox (browser-env.test.ts). Binary inputs are
 * derived through `api.fromHex` so they originate in the API's own realm.
 */
export function runVectorSuite(api: CoreApi, vectors: Vectors): void {
  it('the vector file declares passant-crypto/2', () => {
    expect(vectors.spec).toBe('passant-crypto/2');
  });

  describe('canonicalization vectors', () => {
    vectors.canonicalization.forEach((vector, i) => {
      it(`case ${i} canonicalises byte-exactly`, () => {
        const canonical = api.canonicalize(vector.input);
        expect(canonical).toBe(vector.canonical);
        expect(sha256HexOfUtf8(canonical)).toBe(vector.sha256_of_utf8);
      });
    });
  });

  describe('section hash vectors', () => {
    it('covers all four sections in fixed order', () => {
      expect(vectors.section_hash.map((v) => v.section)).toEqual([...api.SECTIONS]);
    });
    vectors.section_hash.forEach((vector) => {
      it(`section ${vector.section}`, () => {
        expect(api.canonicalize(vector.doc as unknown as core.JsonValue)).toBe(vector.canonical);
        const hash = api.sectionHash(api.fromHex(vector.salt), vector.doc);
        expect(api.toHex(hash)).toBe(vector.hash);
      });
    });
  });

  it('leaf vector', () => {
    const leaf = api.leafHash(
      api.fromHex(vectors.leaf.h_public),
      api.fromHex(vectors.leaf.h_restricted),
      api.fromHex(vectors.leaf.h_compliance),
      api.fromHex(vectors.leaf.h_usage),
    );
    expect(api.toHex(leaf)).toBe(vectors.leaf.leaf);
  });

  describe('merkle vectors', () => {
    vectors.merkle.forEach((vector) => {
      it(`size ${vector.size}: root and listed proofs`, () => {
        const leaves = vector.leaves.map((hex) => api.fromHex(hex));
        const tree = api.buildTree(leaves);
        expect(tree.size).toBe(vector.size);
        expect(api.toHex(tree.root)).toBe(vector.root);
        for (const proof of vector.proofs) {
          expect(tree.proof(proof.index)).toEqual(proof.path);
          const folded = api.foldProof(leaves[proof.index]!, proof.path);
          expect(api.toHex(folded)).toBe(vector.root);
        }
      });
    });
  });

  it(`merkle_large: root of ${1000} synthetic leaves and proof length at 777`, () => {
    const large = vectors.merkle_large;
    const leaves: Uint8Array[] = [];
    for (let i = 0; i < large.size; i++) {
      leaves.push(api.fromHex(syntheticLeafHex(i)));
    }
    const tree = api.buildTree(leaves);
    expect(api.toHex(tree.root)).toBe(large.root);
    expect(tree.proof(777)).toHaveLength(large.proof_index_777_length);
  });

  it('bundle_public verifies to its stated root with checkedSections [public]', () => {
    const result = api.computeBundleRoot(vectors.bundle_public);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(api.toHex(result.root)).toBe(vectors.bundle_public.merkle.root);
      expect(result.checkedSections).toEqual(['public']);
    }
  });
}
