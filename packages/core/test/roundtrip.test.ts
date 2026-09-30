// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { buildTree, foldProof, fromHex, toHex } from '../src/index.js';
import { syntheticLeafHex } from './helpers.js';

const pool: Uint8Array[] = [];
function leavesFor(n: number): Uint8Array[] {
  while (pool.length < n) {
    pool.push(fromHex(syntheticLeafHex(pool.length)));
  }
  return pool.slice(0, n);
}

function assertEveryProofFolds(n: number): void {
  const leaves = leavesFor(n);
  const tree = buildTree(leaves);
  const root = toHex(tree.root);
  for (let index = 0; index < n; index++) {
    expect(toHex(foldProof(leaves[index]!, tree.proof(index)))).toBe(root);
  }
}

describe('round-trip: every proof folds to the tree root', () => {
  for (let n = 1; n <= 64; n++) {
    it(`size ${n}`, () => {
      assertEveryProofFolds(n);
    });
  }

  it('size 1000', () => {
    assertEveryProofFolds(1000);
  });
});
