# VeChain verification for M3: SDK, fee delegation, nodes, tooling, cost

Researched 2026-09-20 via npm registry queries, official VeChain docs/GitHub, and live
probes of the public testnet node `https://testnet.vechain.org` (items marked
live-verified). Checks the items `docs/hld.md` §6 flags as unverified, ahead of
`docs/milestones/M3-adapter-vechain.md`.

**Headline: every M3 assumption holds, with two mechanical corrections** — read the
anchored event back via the transaction **receipt** endpoint (not `/logs/event`, which
cannot filter by tx id), and use **dynamic-fee** transaction bodies rather than legacy
`gasPriceCoef` pricing. Nothing contradicts the planned contract shape or event signature.

## 1. Official SDK (high confidence)

`@vechain/sdk-core` + `@vechain/sdk-network` (monorepo `vechain/vechain-sdk-js`) is the
official JS/TS SDK. Latest **2.1.0, published 2026-08-24, MIT**, actively maintained
(2.1.0 already tracks the Sept 2026 "Interstellar" hard fork; no 3.x in sight).
`thor-devkit` and Connex are legacy — still maintained, not deprecated, but the docs
position the SDK as the official path; do not adopt them for new code.

Caveat for the dependency approval: `sdk-core` transitively pulls `viem` **and** `ethers`
(heavy). Acceptable because the adapter is server-side only; nothing from the SDK may
leak into `core` or `web` (existing repo rule).

**Proposed M3 runtime dependencies**: `@vechain/sdk-core` and `@vechain/sdk-network`,
pinned to 2.1.x. Dev: `@vechain/sdk-hardhat-plugin` 2.1.x.

## 2. VIP-191 fee delegation post-Galactica (high confidence)

Fully supported. Galactica (2025-07) introduced an EIP-1559-style fee market (VIP-251)
and typed transactions (VIP-252) but explicitly kept fee delegation; the dynamic-fee RLP
profile retains `reserved.features`, so delegation composes with the new fee fields.

Offline dual signing with both keys in one process works — no delegation service needed:
`Transaction.of(body).signAsSenderAndGasPayer(operatorKey, sponsorKey)` with
`reserved: { features: 1 }`. Prefer a dynamic-fee body (`maxFeePerGas` /
`maxPriorityFeePerGas`): legacy-priced transactions are converted with no refund of the
spread and can overpay badly. The docs lack a combined delegation+dynamic-fee example
(medium confidence on that combination), so M3 should start with a spike test on
thor-solo — already consistent with the brief's "verify before coding" step.

## 3. Hayabusa and sponsor funding (high confidence; faucet amounts medium)

Since Hayabusa (mainnet 2025-12-02), VTHO is minted per block as a function of staked
VET and distributed **only to stakers** — a wallet merely holding VET no longer
trickle-generates VTHO. Practical consequence: fund the testnet sponsor with VTHO
directly from the official faucet, **https://faucet.vecha.in** (owner action; requires
signing a wallet certificate, roughly one claim per address per day; legacy figure
500 VET + 5,000 VTHO per claim — verify at claim time). At ~0.26 VTHO per anchor, one
claim covers ~19,000 anchors: batching frequency is a non-issue on testnet.

## 4. Public testnet nodes and the logs API (live-verified)

- `https://testnet.vechain.org` healthy (thor/Thorest 2.5.0); further public nodes:
  `testnet.vecha.in`, `sync-testnet.vechain.org`, `testnet.veblocks.net`, and others in
  the docs' node list. Status page: https://testnet.status.vechain.org.
- **CORS is `*`** on GET and on the `POST /logs/event` preflight — the plain-`fetch`
  browser verifier works against the official node.
- **Correction to the read path**: `/logs/event` filters by address/topics/block-range
  and cannot filter by tx id. To read the event for a known tx id use
  `GET /transactions/{txid}/receipt` (`outputs[].events[]`, block meta; `null` until
  included — which doubles as the server's polling signal). `/logs/event` with
  `criteriaSet` = {contract, topic0 = event sig, topic1 = root} answers "find the anchor
  for root X without a tx id" — a robust secondary path for the verifier.
- Limits, live-confirmed: `options.limit` ≤ 1000; `options.offset` capped (~100,000) —
  page by advancing the block-range window, never by growing offset. No documented
  per-IP rate limits on official nodes.

## 5. Contract tooling (high confidence)

- Hardhat via `@vechain/sdk-hardhat-plugin` 2.1.x; set `evmVersion: "shanghai"` for
  Solidity ≥ 0.8.20 (VeChainThor EVM is Shanghai-aligned post-Galactica; don't rely on
  newer opcodes without re-checking Interstellar/VIP-255 details).
- thor-solo is maintained as a subcommand of the official Docker image: pin
  `vechain/thor:v2.5.0` (2026-09-03, amd64+arm64), run
  `solo --on-demand --api-cors '*' --api-addr 0.0.0.0:8669`; ships pre-funded dev
  accounts. Fits M3 CI and the M5 solo profile.

## 6. Anchor cost (price live-verified; gas figure formula-derived)

Testnet `baseFeePerGas` sits at the VIP-251 floor: 10^13 wei = 0.00001 VTHO/gas.
`anchor(bytes32)` emitting the `Anchored` event ≈ 25,000–27,000 gas (intrinsic 21,000 +
calldata + LOG3), so **≈ 0.26 VTHO per anchor** at the floor. Mainnet shares the same
floor parameters; congestion can raise the base fee. Measure with `estimateGas` on
thor-solo during the M3 spike to replace the estimate.

## Adjustments to fold into M3/M4 when they start

1. M3 dependency approval list: `@vechain/sdk-core`, `@vechain/sdk-network` @ 2.1.x
   (MIT); dev: `@vechain/sdk-hardhat-plugin`, image `vechain/thor:v2.5.0`.
2. Adapter: implement `getAnchoredEvent` on the **receipt** endpoint; dynamic-fee body;
   `signAsSenderAndGasPayer` with env keys; spike delegation+dynamic-fee on thor-solo
   first (the docs lack that combined example).
3. M4 verifier: default node `https://testnet.vechain.org` (configurable, docs node list
   as fallbacks); read by receipt when tx id known; optional root-search via
   `/logs/event` `criteriaSet`; respect limit/offset caps by paging block ranges.
4. Owner action list gains: faucet claim (wallet certificate signing) for the sponsor;
   verify dispensed amounts at claim time.

## Sources

npm registry (`npm view`, 2026-09-20) · https://github.com/vechain/vechain-sdk-js
(+releases) · https://docs.vechain.org — SDK, fee-delegation (VIP-191), transactions,
transaction-calculation, VTHO, nodes, testnet, thor-solo, Hardhat pages ·
https://github.com/vechain/VIPs/blob/master/vips/VIP-251.md ·
VeChain Medium "Galactica Goes Live on Mainnet" · Invezz on Hayabusa (2025-12-02) ·
https://github.com/vechain/thor/releases · https://github.com/vechain/faucet-app ·
live probes of https://testnet.vechain.org (best block, CORS preflight, /logs/event
limits, baseFeePerGas, Params contract).
