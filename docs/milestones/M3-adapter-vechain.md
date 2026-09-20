# Milestone M3: the `adapter-vechain` package — registry contract and anchoring

## Goal

Deliver `packages/adapter-vechain` and wire it into the server's batching loop, so that
versions accumulated by M2 are combined into Merkle trees and their roots anchored on the
VeChainThor **testnet**, paid through fee delegation. The HLD "done when": an anchor
transaction visible on the testnet explorer, paid by the sponsor wallet.

## Owner prerequisites (stop and ask if missing — never work around)

- A funded testnet deployment wallet, an operator signing key, and a sponsor (VIP-191) key,
  provided via the environment variables below. Do not generate keys or use faucets.

## In scope

1. **Registry contract** (`packages/adapter-vechain/contracts/`): minimal Solidity per
   crypto spec §7 — `function anchor(bytes32 root) external` emitting
   `Anchored(bytes32 indexed root, address indexed sender, uint256 timestamp)`, storing
   nothing; anchoring the same root twice must not revert. Compiled and unit-tested
   locally (thor-solo or an EVM test harness), deployed to testnet with a small script;
   the deployed address is recorded in `.env.example` documentation, never hard-coded.
2. **Adapter package** implementing the server's `AnchorAdapter` contract without
   importing anything from `server` (structural conformance is asserted where the server
   wires it):
   - `anchor(root: Uint8Array)` → signs with the operator key, delegates gas to the
     sponsor per VIP-191, submits, returns `txId`.
   - `status(txId)` → pending / confirmed / failed, with block number and time.
   - `getAnchoredEvent(txId)` → `{ root, sender, timestamp }` read from the event, checked
     to have been emitted by the configured contract (crypto spec §6 step 6).
   - Nothing outside this package imports a VeChain package; roots cross the boundary as
     32-byte `Uint8Array`s, hex only at the edges.
3. **Batching engine in `server`**: a scheduler closes the open anchor batch when
   `ANCHOR_BATCH_WINDOW_MS` elapses with pending leaves or `ANCHOR_BATCH_MAX` is reached;
   builds the tree with `core.buildTree` in leaf-insertion order, stores the root, each
   version's Merkle proof and the `txId`, and tracks status (`pending` → `submitted` →
   `confirmed` / `failed`, with retry on failure). Empty batches are never anchored.
4. **Configuration** (added to `.env.example`): `VECHAIN_NODE_URL`, `VECHAIN_NETWORK`
   (must be `testnet` — startup fails closed on anything else, including by checking the
   node's genesis id), `VECHAIN_CONTRACT_ADDRESS`, `OPERATOR_PRIVATE_KEY`,
   `SPONSOR_PRIVATE_KEY`.
5. Before writing adapter code: verify current official VeChain SDK package names,
   versions, licence and maintenance status (the HLD flags these as unverified), and
   propose them for approval in the hand-back if they differ from the list below.

## Out of scope

Mainnet anything, the resolver and browser verification (M4), key rotation flows, RFC 3161
or second-chain adapters, cost optimisation beyond batching.

## Constraints

- **Hard rule 1 applies with no exceptions**: only 32-byte roots are ever sent on-chain —
  in code, tests, scripts and logs. No identifiers, no field values, not even on testnet.
- Keys never appear in code, fixtures, logs or error messages.
- CI runs contract and adapter tests against a local node or mocked HTTP only; testnet
  runs are executed manually and their results pasted into the hand-back report.

## Runtime dependencies proposed for approval

The current official VeChain SDK packages (verify names/maintenance first, expected MIT);
`solc`/Hardhat toolchain as dev dependencies only.

## Acceptance criteria

1. `pnpm install && pnpm build && pnpm test && pnpm lint` exits 0; CI green without any
   network access or secrets.
2. Contract tests: event shape matches crypto spec §7 exactly; double-anchoring the same
   root succeeds; the deployment script is idempotent-safe to re-run.
3. Adapter integration test (local node or recorded HTTP): `anchor` → `status` →
   `getAnchoredEvent` round-trips a random 32-byte root, and `getAnchoredEvent` fails
   closed when the event was emitted by a different contract address.
4. Batching tests: a burst of versions larger than `ANCHOR_BATCH_MAX` produces multiple
   batches; each stored proof folds to its batch root via `core.foldProof`; a simulated
   submission failure leaves the batch retryable and never loses leaves; concurrent
   version writes during batch close lose nothing (leaf either in this batch or the next).
5. Startup refuses non-testnet configuration, proven by a test.
6. Manual, owner-verified: one real testnet anchor whose transaction is visible on the
   explorer, fee paid by the sponsor wallet, and whose event root equals the stored batch
   root. Explorer link goes in the hand-back report.
7. Statement and branch coverage for both packages' `src` at least 85%.

## Deliverables

Branch `m3-adapter-vechain` as a pull request with the hand-back report, including the
explorer link for criterion 6 and the SDK verification notes.

## If something does not add up

If VIP-191 behaves differently under the post-Galactica fee market than the HLD assumes,
if the SDK cannot sign-with-delegation offline, or if event queries on public nodes are
too limited for `getAnchoredEvent` — stop, document what was observed, and ask.
