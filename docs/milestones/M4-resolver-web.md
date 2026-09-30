# Milestone M4: resolver and `web` — public page, proofs, QR, in-browser verification

## Goal

Close the read path: a QR scan resolves to a fast public passport page whose contents can
be verified against the chain in the visitor's own browser, plus JSON-LD for machines and
QR generation for printing. The HLD "done when": scanning a printed QR with a phone shows
the passport and a passing check.

## Prerequisites

M3 merged and at least one batch anchored on testnet. For the phone demo only: a reachable
deployment behind a real `BASE_URL` (owner provides the subdomain).

## In scope

1. **Resolver routes in `server`** (public, no auth, MVP serves the public section only):
   - `GET ${BASE_URL}/01/{gtin}/21/{serial}` — server-rendered HTML public page: public
     section fields, version selector (`?version=n`, latest by default), anchor status, and
     the verify control. Fast on a phone, meaningful without JavaScript (verification is
     the only JS-dependent feature). Restricted sections are shown as "restricted", never
     serialised into the page.
   - Same URL with `Accept: application/ld+json` — JSON-LD of the public section, vocabulary
     mapped to DIN DKE SPEC 99100 attribute names from the schema package's annotations.
   - `GET .../proof?version=n` — the exact `passant-proof/2` bundle of crypto spec §5:
     the public section as `doc` + `salt`, the other three as bare `hash`es, the stored Merkle
     path, root, and anchor (`vechain:testnet`, contract, txId). Served only after the
     version's batch is confirmed; before that, an explicit "not yet anchored" response.
   - Unknown identifiers return 404 with no hint whether the serial pattern exists
     (enumeration resistance); responses for restricted data are never cacheable.
2. **`packages/web`**: the in-browser verifier as a small dependency-free ES module built
   from `core` (crypto spec §6, all seven steps):
   - fetch the bundle → `core.computeBundleRoot` (steps 1–5);
   - fetch the `Anchored` event for `anchor.txId` from a configurable public testnet node
     over plain `fetch` (no VeChain package — hard rule; the event-decoding is ~30 lines
     against the Thor REST API), check the emitting contract, compare roots (steps 6–7);
   - render verified / failed / not-yet-anchored states, showing sender address, block
     time, and which sections were actually checked (`checkedSections`) versus taken on trust.
     Any unexpected condition renders as failure with a reason, never as a pass.
3. **QR generation**: `GET /passports/{id}/qr.svg` (issuer-authenticated) returning the
   identifier URL as a QR at error-correction level Q; plus a bulk endpoint or script
   producing a printable SVG/PDF sheet for a batch. QR payload is the URL and nothing else.
4. Playwright (dev dependency) end-to-end test: mint → anchor against a local/mocked
   node → load the page in a real browser → verifier shows green; tamper with the served
   bundle → verifier shows red.

## Out of scope

Access grants and authenticated roles (v0.2), admin UI, CSV intake, EU registry, any
mainnet configuration, styling beyond a clean minimal page (the marketing sites' design
system may be borrowed for tokens but pixel work is not the milestone).

## Constraints

- `web` and everything served to browsers: no Node-only APIs, no VeChain package imports.
- The page and verifier must not trust the server they came from: the root always comes
  from the chain, never from `merkle.root` in the bundle (crypto spec §5 rule).
- Salts for restricted sections never leave the server; the bundle contains exactly what
  crypto spec §5 allows for a public caller.
- JSON-LD and HTML render from the stored canonical section documents, not from a re-query
  of mutable state, so what is shown is what was hashed.

## Runtime dependencies proposed for approval

`qrcode` (MIT, generates SVG, no native deps — verify maintenance). Everything else
(templating via typed template literals, JSON-LD construction, Thor event decoding) is
hand-rolled. Playwright as a dev dependency.

## Acceptance criteria

1. `pnpm install && pnpm build && pnpm test && pnpm lint` exits 0; CI green, including the
   Playwright test against a local stack.
2. A served proof bundle for a real version passes `core.computeBundleRoot` and matches
   the crypto spec §5 shape field-for-field (asserted against the spec's own example
   structure); tampering any byte of the served page's data makes the verifier fail red
   (Playwright, at least the eight tamper classes from M1's suite applied end-to-end).
3. The public page contains zero restricted-section values and zero salts for restricted
   sections, asserted by response scanning in tests; `Cache-Control` forbids caching on any
   response that could ever carry restricted data.
4. JSON-LD parses, round-trips through a JSON-LD expansion library in tests, and every
   public schema field appears under its DIN DKE SPEC 99100 name.
5. The QR SVG decodes (dev-dependency decoder in tests) back to exactly the identifier
   URL at EC level Q.
6. `?version=n` serves historical versions with their own proofs; a version from an
   unconfirmed batch reports "not yet anchored" rather than a proof.
7. Manual, owner-verified: printed QR scanned with a phone against the deployed instance
   shows the passport and a green on-chain check. Photo or recording in the hand-back.
8. Statement and branch coverage for `packages/web/src` and the new resolver code at
   least 85%.

## Deliverables

Branch `m4-resolver-web` as a pull request with the hand-back report.

## If something does not add up

If DIN DKE SPEC 99100 attribute names are not available to map (paywalled or ambiguous),
ship the JSON-LD with a clearly marked provisional vocabulary and flag it — do not invent
authoritative-looking names. If public testnet nodes rate-limit event queries so hard the
verifier is unreliable, stop and present options rather than silently degrading to
trusting the server.
