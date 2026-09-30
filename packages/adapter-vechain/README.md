# @openpassant/adapter-vechain

Anchors 32-byte Merkle roots on VeChainThor (milestone M3). The adapter knows nothing
about passports — it moves roots — and matches the server's `AnchorAdapter` contract
structurally: this package imports nothing from `server`, and nothing outside this
package imports a VeChain package.

## What it does

- **Registry contract** (`contracts/PassantRegistry.sol`, crypto spec §7): one function,
  `anchor(bytes32 root)`, emitting `Anchored(root, sender, timestamp)` and storing
  nothing. Anchoring the same root twice does not revert. Compiled by the package build
  (`solc`, Shanghai EVM) into `artifacts/` (generated, not committed).
- **`VeChainAnchorAdapter`**: submits `anchor(root)` as a VIP-191 fee-delegated,
  dynamic-fee transaction — the operator key signs as sender, the sponsor key signs as
  gas payer, both offline in-process; the operator address never needs funds. `status`
  polls the receipt; `getAnchoredEvent` reads the event back, accepting only the
  configured contract as emitter (fail closed).
- **`verifyConnection(expectedGenesisId)`**: refuses any node whose genesis id is not
  the expected network's — the server passes `TESTNET_GENESIS_ID` (hard rule 4).
- **`deployRegistry`** plus `pnpm --filter @openpassant/adapter-vechain deploy:testnet`,
  which reads the repo `.env` (sponsor pays), refuses non-testnet, and prints the
  contract address to put into `VECHAIN_CONTRACT_ADDRESS`.

## Tests

Run against a local thor-solo node (no network, no secrets — solo's built-in dev
accounts are public fixtures):

```
docker run -d -p 127.0.0.1:8669:8669 vechain/thor:v2.5.0 solo --on-demand --api-addr 0.0.0.0:8669 --api-cors '*'
pnpm test
```

`THOR_SOLO_URL` overrides the default `http://localhost:8669`. CI starts the same
container. Degraded-node paths are covered by a mocked Thor HTTP lookalike.

Runtime dependencies: `@vechain/sdk-core`, `@vechain/sdk-network` (2.1.x, MIT, official —
approved with the M3 brief). Dev: `solc`.
