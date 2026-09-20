# Milestone M1: the `core` package

> **Historical note (2026-09-20).** This brief was written for `passant-crypto/1` (three
> access-tier documents per leaf). After M1 was delivered, the spec was revised to
> `passant-crypto/2` (four section documents, one per Annex XIII point — see
> `docs/research/regulation-2023-1542-verification.md`), and `core` plus the vectors were
> updated accordingly: `Tier`/`TIERS`/`TierDoc`/`tierHash` became
> `Section`/`SECTIONS`/`SectionDoc`/`sectionHash`, `leafHash` takes four hashes, and the
> bundle spec is `passant-proof/2`. Everything else below still describes the delivered
> package. Read `docs/crypto-spec.md` for the current normative layout.

## Goal

Deliver `packages/core`: a small, dependency-light TypeScript library that implements `docs/crypto-spec.md` sections 1 to 6 (steps 1 to 5 of verification) exactly, and passes every vector in `docs/test-vectors.json`. Because this is the first milestone, it also sets up the minimal monorepo scaffold.

`core` is the most compatibility-critical code in the project. Once passports are anchored, its output can never change. Correctness and clarity matter more than speed or cleverness.

## In scope

1. Monorepo scaffold: root `package.json`, pnpm workspace, shared `tsconfig`, ESLint, Prettier, Vitest, a CI workflow that runs build, test and lint, `LICENSE` (Apache 2.0), `.gitignore`, `.env.example` (empty for now).
2. `packages/core` with the API below, built as ES modules with type declarations.
3. Tests as listed under "Acceptance criteria".
4. A short `packages/core/README.md`: what it does, a usage example for building a batch and for verifying a bundle, and a pointer to the spec.

## Out of scope

Do not build any of these in M1: HTTP, database, the passport schema, tier assignment of fields, VeChain or any network call, QR codes, UI, CLI tools, or packages other than `core`. `core` treats tier `data` as opaque JSON.

## Public API

Names and shapes are part of the brief. Internal structure is yours to design.

```ts
export type Tier = 'public' | 'legitimate_interest' | 'authority';
export const TIERS: readonly Tier[];            // fixed order, per spec section 2

export type JsonValue =
  | null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };

export interface TierDoc { id: string; version: number; tier: Tier; data: { [k: string]: JsonValue }; }

export function canonicalize(value: JsonValue): string;                 // RFC 8785
export function generateSalt(): Uint8Array;                             // 16 bytes, CSPRNG
export function tierHash(salt: Uint8Array, doc: TierDoc): Uint8Array;   // spec section 3
export function leafHash(hPub: Uint8Array, hLi: Uint8Array, hAuth: Uint8Array): Uint8Array;

export interface ProofStep { position: 'left' | 'right'; hash: string /* hex */; }
export interface MerkleTree { readonly size: number; readonly root: Uint8Array; proof(index: number): ProofStep[]; }
export function buildTree(leaves: readonly Uint8Array[]): MerkleTree;   // spec section 4
export function foldProof(leaf: Uint8Array, path: readonly ProofStep[]): Uint8Array;

export type TierEntry = { doc: TierDoc; salt: string } | { hash: string };
export interface ProofBundle { /* exactly as spec section 5 */ }

export type VerifyResult =
  | { ok: true; root: Uint8Array; checkedTiers: Tier[] }
  | { ok: false; code: string; message: string };
export function computeBundleRoot(bundle: unknown): VerifyResult;       // spec section 6, steps 1 to 5

export function toHex(bytes: Uint8Array): string;                       // lowercase, no 0x
export function fromHex(hex: string): Uint8Array;                       // rejects odd length, non-hex, 0x prefix
```

Notes:

- `computeBundleRoot` takes `unknown` on purpose: bundles arrive from the network, so it must validate the whole shape itself and fail closed with a specific `code` (for example `UNKNOWN_SPEC`, `TIER_MISSING`, `TIER_MALFORMED`, `ID_MISMATCH`, `VERSION_MISMATCH`, `BAD_HEX`, `BAD_PATH`). It never throws on bad input.
- Comparing the computed root with the on-chain root (spec step 6 and 7) belongs to M3 and M4, not here.
- `buildTree([])` throws a typed error; an empty batch is never anchored.
- `canonicalize` rejects non-finite numbers and values that are not valid JSON (`undefined`, functions, `bigint`) with a typed error.

## Constraints

- Runs unchanged in Node (active LTS) and in current browsers. No `Buffer`, `node:crypto` or `fs` in `src/`. Random bytes come from `globalThis.crypto.getRandomValues`.
- Pure and synchronous, except `generateSalt`, which is impure by nature.
- Runtime dependencies: only from the pre-approved list in `CLAUDE.md`, or none.
- Inputs are never mutated.

## Acceptance criteria

All of these must hold on a fresh clone. They are the definition of done.

1. `pnpm install && pnpm build && pnpm test && pnpm lint` exits 0.
2. **Vectors.** Tests load `docs/test-vectors.json` from disk (no copied literals) and assert every entry: all `canonicalization` cases, all three `tier_hash` cases, the `leaf`, every `merkle` root and every listed proof, the `merkle_large` root and proof length for index 777, and `bundle_public` producing its stated root with `checkedTiers` equal to `['public']`.
3. **Round-trip property.** For every size from 1 to 64, and for 1,000, every index's proof folds to the tree root.
4. **Tamper tests.** Starting from `bundle_public`, each of these single changes makes `computeBundleRoot` return either `ok: false` or a root different from the vector's: one character of a `data` value, the salt, `doc.version`, `doc.id`, a bare tier hash, one proof step's hash, one proof step's position, and swapping two proof steps.
5. **Malformed input.** `computeBundleRoot` returns `ok: false` with the expected `code`, and does not throw, for: `null`, a string, an unknown `spec`, a missing tier, a tier with both `doc` and `hash`, a tier with neither, uppercase hex, `0x`-prefixed hex, a hash of the wrong length, and a salt of the wrong length.
6. **Canonicalisation edge cases** beyond the vectors: key ordering by UTF-16 code units, nested arrays and objects, string escaping of quotes, backslashes and control characters, `-0` serialising as `0`, large and small exponents, and rejection of `NaN` and `Infinity`.
7. **Browser proof.** One test run of the vector suite executes in a browser-like environment (for example Vitest browser mode or a bundled build run under a DOM-free web runtime) to prove no Node-only API leaked in.
8. Statement and branch coverage for `packages/core/src` is at least 95%.
9. CI runs criteria 1 on every push and is green.

## Deliverables

- The scaffold and `packages/core` on a branch named `m1-core`, as a pull request.
- The hand-back report described in `CLAUDE.md`, in the pull request description.

## If something does not add up

If the spec is ambiguous, a vector seems wrong, or a constraint here conflicts with the spec, stop and ask with the specifics. Do not pick an interpretation and continue: a wrong guess here becomes a permanent compatibility break.
