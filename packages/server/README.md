# @openpassant/server

The Passant issuing API (milestone M2): battery models, batch minting, append-only
passport versions hashed per section, the anchor queue, and the EU DPP registry hook.

## What it does

- `POST /models`, `GET /models/{id}` — battery models: a GTIN, a name, and model-level
  passport content (validated as a partial; full validation happens at mint).
- `POST /passports:batch` — mints one passport per serial (up to 1,000, transactional).
  The identifier is the GS1 Digital Link URL `${BASE_URL}/01/<gtin>/21/<serial>`; version 1
  is created from model content merged with per-unit data.
- `POST /passports/{id}/versions` — appends a version (full content + reason). Versions
  are append-only, enforced by a database trigger.
- Every version write splits the content into the four Annex XIII sections by the
  schema's tags, draws one fresh salt per section, computes section hashes and the leaf
  with `@openpassant/core`, stores the exact canonical bytes, and enqueues the leaf into
  the open anchor batch (`ANCHOR_BATCH_MAX` per batch; closing and anchoring arrive with
  M3 behind the `AnchorAdapter` interface).
- `GET /passports:registry-export`, `POST /passports:registry-confirm` — the
  Article 77(10) EU DPP registry hook: export identifiers awaiting registration, record
  confirmations. Registration itself is a project-owner action.
- `GET /openapi.json` (OpenAPI 3), `GET /healthz` — both without auth; everything else
  needs `Authorization: Bearer $ISSUER_API_KEY`.

Passport ids are URLs; URL-encode them in paths:
`GET /passports/https%3A%2F%2Fid.example.com%2F01%2F...%2F21%2FSN-1`.

## Running

Configuration comes from the environment (`.env.example` at the repo root). Migrations
are plain SQL in `migrations/`, applied on start.

```
docker compose -f packages/server/dev/docker-compose.db.yml up -d
BASE_URL=https://id.example.com DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres \
  ISSUER_API_KEY=dev pnpm --filter @openpassant/server start
```

## Tests

Integration tests need PostgreSQL and create one throwaway database per suite. They use
`TEST_DATABASE_ADMIN_URL` (default `postgres://postgres:postgres@localhost:5432/postgres`)
— the dev compose file above provides it. `pnpm test` from the repo root runs everything.
