# Passant

Passant is an open-source toolkit for issuing, hosting and verifying **EU Digital Product
Passports**, with tamper-evidence anchored on a public blockchain (VeChainThor testnet
first). It targets the EU battery passport that becomes mandatory on 18 February 2027,
built for small e-bike and e-scooter brands and importers. Every passport version is
salted, hashed per access section and anchored as a Merkle root — so anyone who scans a
battery's QR code can check, in their own browser, that the record was never quietly
changed. Apache-2.0.

## Quickstart (offline, ~10 minutes)

Needs Docker and Node.js 24 with pnpm. This runs the whole stack — server, PostgreSQL and
a throwaway local VeChain chain — with nothing to configure and no keys of your own:

```sh
git clone https://github.com/openpassant/openpassant && cd openpassant
docker compose -f compose.yaml -f compose.solo.yaml up -d --build
pnpm install && pnpm --filter @openpassant/web... build     # builds the verifier the demo uses
ISSUER_API_KEY=passant-demo-key pnpm demo
```

The demo seeds one battery model and 100 passports, waits for the anchor, verifies one
passport exactly like a browser would, and saves a printable QR sheet to
`demo-out/qr-sheet.svg`. Open one of the printed URLs, press **“Check against the public
ledger”**, and watch it verify — then see `docs/demo.md` for the tamper-shows-red half of
the demo.

## Anchoring on the VeChain testnet

The offline profile anchors to a throwaway chain. For real tamper evidence, anchor to the
VeChain **testnet** (mainnet is deliberately refused everywhere):

1. Copy `.env.example` to `.env` and fill it in — every variable is documented there.
   You need an operator key (never funded) and a sponsor key holding faucet VTHO
   (https://faucet.vecha.in); anchors cost ~0.26 VTHO each.
2. Deploy the registry contract once: `pnpm --filter @openpassant/adapter-vechain
   deploy:testnet`, and put the printed address into `VECHAIN_CONTRACT_ADDRESS`.
3. `docker compose up -d --build`, then `pnpm demo`. The demo prints the testnet
   explorer link for the anchoring transaction.

## Repository map

```
docs/crypto-spec.md        NORMATIVE: byte-exact hashing, Merkle and verification rules
docs/test-vectors.json     NORMATIVE: the source of truth for every hash
docs/hld.md                High-level design (context)
docs/milestones/           One brief per milestone, plus the plan
docs/demo.md               The live-demo walkthrough script
packages/schema            Battery passport as JSON Schema, section-tagged (Annex XIII)
packages/core              Canonicalisation, hashing, Merkle, bundle verification
packages/server            Issuing API, resolver, persistence, anchor queue
packages/adapter-vechain   Registry contract and VeChainThor anchoring (testnet only)
packages/web               In-browser verifier
```

## Developing

```sh
pnpm install
docker compose -f packages/server/dev/docker-compose.db.yml up -d   # test database
docker run -d -p 127.0.0.1:8669:8669 vechain/thor:v2.5.0 solo --on-demand --api-addr 0.0.0.0:8669 --api-cors '*'
pnpm exec playwright install chromium                                # for the browser e2e test
pnpm build && pnpm test && pnpm lint
```

See `CONTRIBUTING.md` for ground rules — in short: the crypto spec and test vectors are
law, one milestone at a time, testnet only. The engineering contract lives in `CLAUDE.md`;
the original project handover pack is preserved unchanged in `docs/handover.md`.

## Licence

Apache-2.0. Every source file carries the SPDX header. Passant provides software, not
legal advice; regulatory statements were verified against the EUR-Lex consolidated text
(see `docs/research/`), but compliance remains the operator's responsibility.
