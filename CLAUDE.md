# Passant

Open-source toolkit for issuing, hosting and verifying EU Digital Product Passports, with tamper-evidence anchored on a public blockchain (VeChainThor first). The MVP target is the EU battery passport for e-bike and e-scooter (LMT) batteries, mandatory from 18 February 2027.

Read before working:

- `docs/hld.md`: what the system is and why. Context, not instructions.
- `docs/crypto-spec.md`: normative. Byte-exact hashing, Merkle and verification rules.
- `docs/test-vectors.json`: normative. The source of truth for every hash.
- `docs/milestones/`: one brief per milestone. Work on exactly one at a time.

## Hard rules

1. **Never put passport data on-chain.** Only 32-byte Merkle roots are anchored. No identifiers, no field values, no personal data, not even on testnet.
2. **The test vectors are law.** If code and vectors disagree, the code is wrong. Never edit `docs/test-vectors.json` or `docs/crypto-spec.md` to make a test pass. If you believe the spec or a vector is wrong, stop and report it.
3. **Never weaken, skip or delete a test to get green.** Fix the code or report the conflict.
4. **Testnet only.** No mainnet endpoints, keys or transactions anywhere in code, config or tests.
5. **No secrets in the repository.** Keys and credentials come from environment variables listed in `.env.example`. If a secret you need is missing, stop and ask; do not generate a substitute and carry on.
6. **Ask before adding a runtime dependency** that is not on the pre-approved list below. State what it is for, its licence and its maintenance status. Dev dependencies need no approval but keep them few.
7. **One milestone at a time.** Do not start the next brief, and do not build ahead "while you are here." Out-of-scope ideas go in the hand-back report.
8. **Versions are append-only.** Nothing in the data layer may update or delete a stored passport version.

## Decisions already made (do not reopen)

| Topic | Decision |
| --- | --- |
| Language | TypeScript, strict mode, end to end |
| Shared code | `core` runs unchanged in Node and in the browser; server and in-browser verifier share it |
| Hashing | Salted, one hash per access tier, combined into the leaf (see crypto spec) |
| Identifier domain | Operator's own dedicated subdomain, from a single `BASE_URL` setting |
| Database | PostgreSQL only |
| Licence | Apache 2.0; every source file carries the SPDX header `// SPDX-License-Identifier: Apache-2.0` |
| Chain coupling | Anchoring sits behind an adapter interface; nothing outside `adapter-vechain` imports a VeChain package |

## Repository layout

```
packages/
  schema/           JSON Schema for passports, generated types      (owner-written, M0)
  core/             canonicalisation, hashing, Merkle, bundle verify (M1)
  server/           issuing API, resolver, persistence               (M2, M4)
  adapter-vechain/  registry contract, anchoring, on-chain lookup    (M3)
  web/              public passport page, in-browser verifier        (M4)
docs/
```

Dependency direction: `core` and `schema` depend on nothing in this repo. `server` and `web` may depend on `core` and `schema`. Only `server` wires in an adapter. Create a package only when its milestone starts.

## Tooling defaults

These are defaults, not decisions. If you have a good reason to change one, propose it first.

- Node.js active LTS, pnpm workspaces
- TypeScript `strict: true`, ES modules
- Vitest for tests, ESLint + Prettier for lint and format
- Conventional Commits; small commits that each pass the checks

Commands, from the repo root, which every milestone must keep working:

```
pnpm install
pnpm build        # type-check and build all packages
pnpm test         # all tests
pnpm lint         # ESLint + Prettier check
```

Pre-approved runtime dependencies: `@noble/hashes` (SHA-256 that runs identically in Node and browsers) and `canonicalize` (RFC 8785). Check that each is still maintained before adopting it. Implementing either in-house is also acceptable if it passes the vectors.

## Code conventions

- Public functions in `core` are pure and synchronous, take and return `Uint8Array` for binary data, and expose hex only at the edges.
- No Node-only APIs (`Buffer`, `node:crypto`, `fs`) in `core` or `web` source. Tests may use them.
- Validate at the boundaries and fail closed: a verifier that hits anything unexpected returns a failure with a reason, never a pass.
- Errors are typed and carry a stable `code` string; no bare string throws.
- Every exported symbol has a TSDoc comment. No commented-out code.

## Things only the project owner can do

Do not attempt or work around these. Ask, then wait.

- Fund a VeChain testnet wallet or obtain faucet tokens
- Create or rotate any signing key
- Register domains, the GitHub organisation or package-registry names
- Publish a package or a release
- Change anything under "Hard rules" or "Decisions already made"

## Hand-back report

End each milestone with a short report: what was built, the exact commands run and their results, any deviation from the brief with the reason, open questions, and out-of-scope ideas noticed along the way. If any acceptance criterion is unmet, say so in the first line.
