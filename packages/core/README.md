# @openpassant/core

Canonicalisation, hashing, Merkle trees and proof-bundle verification for Passant digital
product passports. This package implements `docs/crypto-spec.md` (`passant-crypto/1`)
sections 1 to 6 — verification steps 1 to 5 — byte-exactly; `docs/test-vectors.json` is the
source of truth for every hash.

Everything is pure and synchronous except `generateSalt`, and runs unchanged in Node and in
browsers: no `Buffer`, `node:crypto` or `fs`, random bytes come from
`globalThis.crypto.getRandomValues`. Comparing a recomputed root against the on-chain root
(spec steps 6 and 7) is deliberately *not* here; that needs network access and lives in the
chain adapter and the verifier layers.

## Building a batch

```ts
import {
  buildTree,
  generateSalt,
  leafHash,
  tierHash,
  toHex,
  TIERS,
  type TierDoc,
} from '@openpassant/core';

const id = 'https://id.example.com/01/09506000134352/21/SN-0001';
const version = 1;

// One document and one fresh salt per access tier, in the fixed TIERS order.
const docs: TierDoc[] = TIERS.map((tier) => ({
  id,
  version,
  tier,
  data: tier === 'public' ? { chemistry: 'Li-ion NMC' } : {},
}));
const salts = docs.map(() => generateSalt()); // store these with the version
const [hPub, hLi, hAuth] = docs.map((doc, i) => tierHash(salts[i]!, doc));

const leaf = leafHash(hPub!, hLi!, hAuth!);

// A batch is an ordered list of leaves; the order determines the root.
const tree = buildTree([leaf]);
console.log(toHex(tree.root)); // the 32-byte root to anchor on-chain
const path = tree.proof(0); // audit path to serve alongside the passport
```

## Verifying a bundle

```ts
import { computeBundleRoot, toHex } from '@openpassant/core';

const bundle: unknown = await (await fetch(passportUrl + '/proof')).json();

const result = computeBundleRoot(bundle); // validates the whole shape, never throws
if (!result.ok) {
  console.error(`invalid bundle: ${result.code} ${result.message}`);
} else {
  // Compare toHex(result.root) against the root read from the chain —
  // never against the bundle's own merkle.root.
  console.log(toHex(result.root), result.checkedTiers);
}
```

`checkedTiers` lists the tiers that were recomputed from a disclosed document; tiers supplied
as a bare hash are taken on trust, and a verifier should say so.

## Spec

See `docs/crypto-spec.md` in the repository root. If this package and the spec or the test
vectors ever disagree, the package is wrong.
