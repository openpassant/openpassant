// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  buildTree,
  CoreError,
  foldProof,
  fromHex,
  generateSalt,
  leafHash,
  sectionHash,
  SECTIONS,
  toHex,
} from '../src/index.js';
import type { ProofStep, SectionDoc } from '../src/index.js';
import { syntheticLeafHex } from './helpers.js';

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(CoreError);
    return (error as CoreError).code;
  }
  throw new Error('expected the call to throw');
}

const leafA = fromHex(syntheticLeafHex(0));
const leafB = fromHex(syntheticLeafHex(1));

describe('SECTIONS', () => {
  it('is the fixed order of crypto spec section 2', () => {
    expect(SECTIONS).toEqual(['public', 'restricted', 'compliance', 'usage']);
  });
});

describe('hex', () => {
  it('round-trips bytes through lowercase hex', () => {
    expect(toHex(Uint8Array.of(0, 15, 16, 255))).toBe('000f10ff');
    expect(Array.from(fromHex('000f10ff'))).toEqual([0, 15, 16, 255]);
    expect(toHex(fromHex(''))).toBe('');
  });

  it('rejects odd length, non-hex, uppercase and 0x-prefixed strings', () => {
    expect(codeOf(() => fromHex('abc'))).toBe('BAD_HEX');
    expect(codeOf(() => fromHex('zz'))).toBe('BAD_HEX');
    expect(codeOf(() => fromHex('AB'))).toBe('BAD_HEX');
    expect(codeOf(() => fromHex('0xab'))).toBe('BAD_HEX');
  });
});

describe('generateSalt', () => {
  it('returns 16 fresh CSPRNG bytes per call', () => {
    const salt = generateSalt();
    expect(salt).toBeInstanceOf(Uint8Array);
    expect(salt.length).toBe(16);
    expect(toHex(salt)).not.toBe(toHex(generateSalt()));
  });
});

describe('sectionHash and leafHash input validation', () => {
  const doc: SectionDoc = { id: 'https://id.example/1', version: 1, section: 'public', data: {} };

  it('rejects a salt that is not 16 bytes', () => {
    expect(codeOf(() => sectionHash(new Uint8Array(15), doc))).toBe('BAD_LENGTH');
    expect(codeOf(() => sectionHash(new Uint8Array(17), doc))).toBe('BAD_LENGTH');
  });

  it('does not mutate the salt', () => {
    const salt = new Uint8Array(16).fill(7);
    sectionHash(salt, doc);
    expect(toHex(salt)).toBe('07'.repeat(16));
  });

  it('rejects section hashes that are not 32 bytes', () => {
    expect(codeOf(() => leafHash(new Uint8Array(31), leafA, leafB, leafA))).toBe('BAD_LENGTH');
    expect(codeOf(() => leafHash(leafA, new Uint8Array(33), leafB, leafA))).toBe('BAD_LENGTH');
    expect(codeOf(() => leafHash(leafA, leafB, new Uint8Array(0), leafA))).toBe('BAD_LENGTH');
    expect(codeOf(() => leafHash(leafA, leafB, leafA, new Uint8Array(31)))).toBe('BAD_LENGTH');
  });
});

describe('buildTree input validation', () => {
  it('throws EMPTY_BATCH for zero leaves', () => {
    expect(codeOf(() => buildTree([]))).toBe('EMPTY_BATCH');
  });

  it('throws BAD_LENGTH for a leaf that is not 32 bytes', () => {
    expect(codeOf(() => buildTree([leafA, new Uint8Array(31)]))).toBe('BAD_LENGTH');
  });

  it('throws BAD_INDEX for an out-of-range or non-integer proof index', () => {
    const tree = buildTree([leafA, leafB]);
    expect(codeOf(() => tree.proof(-1))).toBe('BAD_INDEX');
    expect(codeOf(() => tree.proof(2))).toBe('BAD_INDEX');
    expect(codeOf(() => tree.proof(0.5))).toBe('BAD_INDEX');
  });

  it('copies its input and hands out root copies', () => {
    const mine = new Uint8Array(leafA);
    const tree = buildTree([mine, leafB]);
    const rootBefore = toHex(tree.root);

    mine.fill(0); // caller mutates their array after building
    expect(toHex(tree.root)).toBe(rootBefore);

    tree.root.fill(0); // caller mutates a returned root
    expect(toHex(tree.root)).toBe(rootBefore);
  });
});

describe('foldProof input validation', () => {
  it('throws BAD_LENGTH for a leaf that is not 32 bytes', () => {
    expect(codeOf(() => foldProof(new Uint8Array(31), []))).toBe('BAD_LENGTH');
  });

  it('throws BAD_LENGTH for a step hash that is not 32 bytes', () => {
    const path: ProofStep[] = [{ position: 'left', hash: 'abcd' }];
    expect(codeOf(() => foldProof(leafA, path))).toBe('BAD_LENGTH');
  });

  it('throws BAD_HEX for a step hash that is not lowercase hex', () => {
    const path: ProofStep[] = [{ position: 'left', hash: toHex(leafB).toUpperCase() }];
    expect(codeOf(() => foldProof(leafA, path))).toBe('BAD_HEX');
  });

  it('throws BAD_PATH for an unknown step position', () => {
    const path = [{ position: 'up', hash: toHex(leafB) }] as unknown as ProofStep[];
    expect(codeOf(() => foldProof(leafA, path))).toBe('BAD_PATH');
  });

  it('does not mutate the leaf', () => {
    const leaf = new Uint8Array(leafA);
    foldProof(leaf, [{ position: 'right', hash: toHex(leafB) }]);
    expect(toHex(leaf)).toBe(toHex(leafA));
  });
});

describe('CoreError', () => {
  it('carries a stable code and a name', () => {
    const error = new CoreError('BAD_HEX', 'detail');
    expect(error.name).toBe('CoreError');
    expect(error.code).toBe('BAD_HEX');
    expect(error.message).toBe('detail');
    expect(error).toBeInstanceOf(Error);
  });
});
