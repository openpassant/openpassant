// SPDX-License-Identifier: Apache-2.0
import { CoreError } from './errors.js';
import { nodeHash } from './hash.js';
import { fromHex, toHex } from './hex.js';
import type { MerkleTree, ProofStep } from './types.js';

/** A subtree: its hash, how many leaves it spans, and its children. */
interface TreeNode {
  hash: Uint8Array;
  size: number;
  left: TreeNode | null;
  right: TreeNode | null;
}

/** Largest power of two strictly less than n, for n > 1 (RFC 6962). */
function splitPoint(n: number): number {
  let k = 1;
  while (k * 2 < n) {
    k *= 2;
  }
  return k;
}

function buildNode(leaves: readonly Uint8Array[], start: number, end: number): TreeNode {
  const size = end - start;
  if (size === 1) {
    return { hash: leaves[start]!, size: 1, left: null, right: null };
  }
  const k = splitPoint(size);
  const left = buildNode(leaves, start, start + k);
  const right = buildNode(leaves, start + k, end);
  return { hash: nodeHash(left.hash, right.hash), size, left, right };
}

/**
 * Builds a Merkle tree per crypto spec section 4: RFC 6962 structure, no
 * padding and no duplication of the last leaf. Leaves are already hashed
 * (crypto spec section 3) and enter the tree as they are; leaf order is the
 * batch order and determines the root.
 *
 * The input is copied; later mutation of the caller's arrays does not
 * affect the tree.
 *
 * @param leaves - One or more 32-byte leaf hashes, in batch order.
 * @throws CoreError `EMPTY_BATCH` for zero leaves (an empty batch is never
 *   anchored); `BAD_LENGTH` if any leaf is not 32 bytes.
 */
export function buildTree(leaves: readonly Uint8Array[]): MerkleTree {
  if (leaves.length === 0) {
    throw new CoreError('EMPTY_BATCH', 'cannot build a Merkle tree over zero leaves');
  }
  const copies = leaves.map((leaf) => {
    if (!(leaf instanceof Uint8Array) || leaf.length !== 32) {
      throw new CoreError('BAD_LENGTH', 'every leaf must be exactly 32 bytes');
    }
    return new Uint8Array(leaf);
  });
  const rootNode = buildNode(copies, 0, copies.length);

  return {
    size: copies.length,
    get root(): Uint8Array {
      return new Uint8Array(rootNode.hash);
    },
    proof(index: number): ProofStep[] {
      if (!Number.isInteger(index) || index < 0 || index >= copies.length) {
        throw new CoreError('BAD_INDEX', `index must be an integer in [0, ${copies.length})`);
      }
      // Walk down to the leaf collecting siblings, then reverse so the
      // path reads leaf-to-root as crypto spec section 4.1 defines it.
      const steps: ProofStep[] = [];
      let node = rootNode;
      let offset = index;
      while (node.left !== null && node.right !== null) {
        if (offset < node.left.size) {
          steps.push({ position: 'right', hash: toHex(node.right.hash) });
          node = node.left;
        } else {
          steps.push({ position: 'left', hash: toHex(node.left.hash) });
          offset -= node.left.size;
          node = node.right;
        }
      }
      return steps.reverse();
    },
  };
}

/**
 * Folds an audit path per crypto spec section 4.2: starting from the leaf,
 * each step hashes the sibling on the side it declares. Returns the
 * recomputed root; comparing it against the anchored root is the caller's
 * job. Inputs are not mutated.
 *
 * @throws CoreError `BAD_LENGTH` if the leaf or a step hash is not 32 bytes;
 *   `BAD_PATH` if a step's position is not "left" or "right";
 *   `BAD_HEX` if a step hash is not lowercase hex.
 */
export function foldProof(leaf: Uint8Array, path: readonly ProofStep[]): Uint8Array {
  if (!(leaf instanceof Uint8Array) || leaf.length !== 32) {
    throw new CoreError('BAD_LENGTH', 'leaf must be exactly 32 bytes');
  }
  let hash: Uint8Array = new Uint8Array(leaf);
  for (const step of path) {
    const sibling = fromHex(step.hash);
    if (sibling.length !== 32) {
      throw new CoreError('BAD_LENGTH', 'every step hash must be exactly 32 bytes');
    }
    if (step.position === 'right') {
      hash = nodeHash(hash, sibling);
    } else if (step.position === 'left') {
      hash = nodeHash(sibling, hash);
    } else {
      throw new CoreError('BAD_PATH', 'step position must be "left" or "right"');
    }
  }
  return hash;
}
