# Contributing to OpenPassant

Thank you for your interest. OpenPassant is pre-alpha and moving through a fixed sequence
of milestones; contributions are welcome, and the most useful ones right now are reviews
rather than features:

- **Review the crypto spec** (`docs/crypto-spec.md`, `passant-crypto/2`) — it is normative
  and byte-exact, and mistakes there become permanent once passports are anchored.
- **Re-implement the test vectors** (`docs/test-vectors.json`) in another language and
  report any value you cannot reproduce.
- **Check the schema against the regulation** — `packages/schema` encodes Annex XIII of
  Regulation (EU) 2023/1542; the extraction it was built from is in
  `docs/research/annex-xiii-field-list.md`.

## Ground rules

`CLAUDE.md` at the repository root is the engineering contract: hard rules, settled
decisions, layout and conventions. In particular:

- **The test vectors are law.** If code and vectors disagree, the code is wrong. Never
  change `docs/test-vectors.json` or `docs/crypto-spec.md` to make a test pass.
- **One milestone at a time** (`docs/milestones/`). PRs that build ahead of the current
  milestone will be parked, not reviewed.
- **Testnet only.** No mainnet endpoints, keys or transactions anywhere.
- Conventional Commits; small commits that each pass the checks.

## Developing

Node.js active LTS, pnpm, and Docker (for the server's PostgreSQL integration tests):

```
pnpm install
docker compose -f packages/server/dev/docker-compose.db.yml up -d
pnpm build     # type-check and build all packages
pnpm test      # all tests (coverage thresholds are enforced)
pnpm lint      # ESLint + Prettier
```

All four must pass before a PR; CI runs the same sequence.

## Licensing

OpenPassant is Apache-2.0, and every source file carries the SPDX header. A lightweight
contributor licence agreement is planned; its exact process is still to be defined by the
maintainers and will be documented here before it is enforced. Until then, by submitting a
contribution you agree that it is licensed under Apache-2.0.

## Security issues

Do not open public issues for suspected vulnerabilities — email hello@passant.io.

## Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
