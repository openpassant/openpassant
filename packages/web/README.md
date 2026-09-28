# @openpassant/web

The in-browser passport verifier (milestone M4). A passport page can check itself against
the public ledger **without trusting the server that served it**: all seven steps of
crypto spec §6 run in the visitor's browser.

- Steps 1–5 — bundle validation, section hashing, leaf, proof folding — via
  `@openpassant/core`, the same code the server used to issue the passport.
- Steps 6–7 — the `Anchored` event is read from a public VeChainThor node over plain
  `fetch` (the transaction-receipt endpoint; CORS is open on the public nodes), the
  emitting contract is checked, and the recomputed root is compared with the on-chain
  root. The bundle's own `merkle.root` is informational and deliberately ignored.

Any unexpected condition renders as a failure with a reason — never a pass. The result
shows the anchoring sender, block time, and which sections were actually checked versus
taken on trust as bare hashes.

No VeChain package is imported anywhere here (only `adapter-vechain` may import one),
and the bundle has no dependency besides `core`.

## Build output

`pnpm build` type-checks and produces `dist/verifier.js` — a single minified IIFE
(esbuild, browser platform) that the server serves at `/assets/verifier.js`. On a
passport page it wires a "Check against the public ledger" button into the
`#passant-verify` container, reading `data-proof-url` and `data-node-url` from it.

## Tests

`test/verify.test.ts` drives the verification logic with an injected fetch against the
normative test-vector bundle; `test/dom.test.ts` covers the DOM glue under happy-dom;
the real-browser end-to-end run (Playwright, including all eight tamper classes applied
to the live page) lives in `packages/server/test/e2e-browser.test.ts`, where the full
stack is available.
