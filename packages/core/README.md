# @openpassant/core

Canonicalisation, hashing, Merkle trees and proof-bundle verification for Passant digital
product passports. This package implements `docs/crypto-spec.md` (`passant-crypto/2`)
sections 1 to 6 — verification steps 1 to 5 — byte-exactly; `docs/test-vectors.json` is the
source of truth for every hash.

Each passport version is split into four section documents (one per Annex XIII content
point of Regulation (EU) 2023/1542: `public`, `restricted`, `compliance`, `usage`), each
salted and hashed separately, and the four section hashes combine into one Merkle leaf.

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
  sectionHash,
  toHex,
  SECTIONS,
  type SectionDoc,
} from '@openpassant/core';

const id = 'https://id.example.com/01/09506000134352/21/SN-0001';
const version = 1;

// One document and one fresh salt per content section, in the fixed SECTIONS order.
const docs: SectionDoc[] = SECTIONS.map((section) => ({
  id,
  version,
  section,
  data: section === 'public' ? { chemistry: 'Li-ion NMC' } : {},
}));
const salts = docs.map(() => generateSalt()); // store these with the version
const [hPublic, hRestricted, hCompliance, hUsage] = docs.map((doc, i) =>
  sectionHash(salts[i]!, doc),
);

const leaf = leafHash(hPublic!, hRestricted!, hCompliance!, hUsage!);

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
  console.log(toHex(result.root), result.checkedSections);
}
```

`checkedSections` lists the sections that were recomputed from a disclosed document;
sections supplied as a bare hash are taken on trust, and a verifier should say so.

## Spec

See `docs/crypto-spec.md` in the repository root. If this package and the spec or the test
vectors ever disagree, the package is wrong.
