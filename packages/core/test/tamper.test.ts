// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { computeBundleRoot, toHex } from '../src/index.js';
import type { ProofBundle, VerifyResult } from '../src/index.js';
import { loadVectors } from './helpers.js';

const vectors = loadVectors();
const expectedRoot = vectors.bundle_public.merkle.root;

// A tampered bundle must never verify to the vector's root: either the
// validation rejects it, or the recomputed root differs.
function expectDetected(result: VerifyResult): void {
  if (result.ok) {
    expect(toHex(result.root)).not.toBe(expectedRoot);
  } else {
    expect(result.code).toBeTruthy();
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any -- tests reach into the bundle to corrupt it */
function tampered(mutate: (bundle: any) => void): VerifyResult {
  const bundle = structuredClone(vectors.bundle_public) as any;
  mutate(bundle);
  return computeBundleRoot(bundle as ProofBundle);
}

function flipHexChar(hex: string): string {
  const flipped = hex[0] === '0' ? '1' : '0';
  return flipped + hex.slice(1);
}

describe('tamper detection, starting from bundle_public', () => {
  it('is detected: one character of a data value', () => {
    expectDetected(
      tampered((b) => {
        b.tiers.public.doc.data.chemistry = 'Li-ion NMD';
      }),
    );
  });

  it('is detected: the salt', () => {
    expectDetected(
      tampered((b) => {
        b.tiers.public.salt = flipHexChar(b.tiers.public.salt);
      }),
    );
  });

  it('is detected: doc.version', () => {
    expectDetected(
      tampered((b) => {
        b.tiers.public.doc.version = 2;
      }),
    );
  });

  it('is detected: doc.id', () => {
    expectDetected(
      tampered((b) => {
        b.tiers.public.doc.id = b.tiers.public.doc.id + 'x';
      }),
    );
  });

  it('is detected: a bare tier hash', () => {
    expectDetected(
      tampered((b) => {
        b.tiers.legitimate_interest.hash = flipHexChar(b.tiers.legitimate_interest.hash);
      }),
    );
  });

  it("is detected: one proof step's hash", () => {
    expectDetected(
      tampered((b) => {
        b.merkle.path[0].hash = flipHexChar(b.merkle.path[0].hash);
      }),
    );
  });

  it("is detected: one proof step's position", () => {
    expectDetected(
      tampered((b) => {
        b.merkle.path[0].position = b.merkle.path[0].position === 'left' ? 'right' : 'left';
      }),
    );
  });

  it('is detected: swapping two proof steps', () => {
    expectDetected(
      tampered((b) => {
        [b.merkle.path[0], b.merkle.path[1]] = [b.merkle.path[1], b.merkle.path[0]];
      }),
    );
  });
});
