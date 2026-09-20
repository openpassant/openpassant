# Milestone M2: the `server` package — issuing API and persistence

## Goal

Deliver `packages/server`: a Fastify service that lets an operator define battery models,
mint unit passports in bulk, and append passport versions — with every version canonicalised,
salted, hashed and queued for anchoring using `core`, and everything persisted append-only in
PostgreSQL. The HLD "done when": a batch of 100 passports created through the API.

## Prerequisites

- M0 delivered: `packages/schema` exists with the tier-tagged JSON Schema, generated
  TypeScript types, and a validating sample passport. If it is missing or the tier tags are
  incomplete, stop and hand back.
- A reachable PostgreSQL for integration tests (Docker is fine; add a compose file for the
  database only — full packaging is M5).

## In scope

1. `packages/server` (Fastify, TypeScript, ESM), configured entirely from environment
   variables listed in `.env.example`: `BASE_URL`, `DATABASE_URL`, `ISSUER_API_KEY`,
   `ANCHOR_BATCH_WINDOW_MS` (default 600000), `ANCHOR_BATCH_MAX` (default 1000).
2. PostgreSQL schema and a small SQL-file migration runner (plain `.sql` files applied in
   order, recorded in a `migrations` table — no migration framework). Entities per HLD §4:
   `battery_models`, `passports`, `passport_versions`, `anchor_batches`, `anchors`.
   Single-operator MVP: no `operators` table yet; the operator is the deployment.
3. Issuing API, authenticated with a single bearer key (`ISSUER_API_KEY`):
   - `POST /models` — create a battery model; body validated against the schema package.
   - `POST /passports:batch` — mint one passport per serial for a model (up to 1,000 per
     call); each passport's identifier is the GS1 Digital Link URL
     `${BASE_URL}/01/<gtin>/21/<serial>`; mints version 1 of each from model data.
   - `POST /passports/{id}/versions` — append a version (full new content + reason).
   - `GET /models/{id}`, `GET /passports/{id}`, `GET /passports/{id}/versions/{n}`,
     `GET /healthz` (no auth on healthz).
   - OpenAPI document generated from the route schemas, served at `/openapi.json`.
4. Version pipeline, on every version write, in one transaction: split the validated
   content into the three tier documents using the schema's tier tags (empty tiers get
   `data: {}`), draw one fresh salt per tier via `core.generateSalt`, compute tier hashes
   and the leaf via `core`, store canonical JSON, salts, hashes and leaf, and insert the
   leaf into the open `anchor_batches` row (status `pending`). Batch closing/anchoring is
   M3; M2 only accumulates.
5. Append-only enforcement in the database itself: a trigger (or revoked privileges)
   rejects `UPDATE` and `DELETE` on `passport_versions` and `anchors`, proven by a test.
6. `AnchorAdapter` TypeScript interface in `server` (`anchor(root)`, `status(txId)`,
   `getAnchoredEvent(txId)`), plus a no-op in-memory implementation used by tests. The
   VeChain implementation is M3; nothing in M2 imports a VeChain package.
7. Typed error responses (`{ code, message }`, stable codes) and fail-closed validation at
   every boundary; requests that fail schema validation never reach the database.

## Out of scope

Anchoring transactions, the resolver and public pages (M4), QR codes, JSON-LD, access
grants, admin UI, CSV intake, multi-operator support, rate limiting.

## Constraints

- `server` depends only on `core`, `schema` and approved runtime dependencies.
- Salts are generated inside the version transaction and never logged.
- Passport `data` reaching hashing is exactly what was validated — no enrichment between
  validation and canonicalisation.
- Bodies are limited to a sane size and `POST /passports:batch` is transactional: all
  passports mint or none do.

## Runtime dependencies proposed for approval

`fastify` (MIT), `@fastify/swagger` (MIT), `pg` (MIT), `ajv` + `ajv-formats` (MIT).
Check each is actively maintained before adopting. Everything else (migrations, templating,
config) is hand-rolled or dev-only.

## Acceptance criteria

1. `pnpm install && pnpm build && pnpm test && pnpm lint` exits 0 from a fresh clone; CI
   green (integration tests get Postgres via a service container).
2. An integration test creates a model and mints a batch of 100 passports through the HTTP
   API, then reads all 100 back with version 1 present.
3. For a created version, a test reconstructs the three tier documents from the database,
   recomputes tier hashes and leaf with `core`, and gets byte-identical values to the
   stored ones; the stored canonical JSON matches `core.canonicalize` output exactly.
4. A test proves `UPDATE` and `DELETE` on `passport_versions` fail at the database level.
5. Auth: requests without the bearer key get 401; malformed bodies get 400 with a stable
   error code and never touch the database (asserted by row counts).
6. Duplicate serials within a model are rejected; re-posting an identical batch does not
   create duplicate passports.
7. `/openapi.json` validates as OpenAPI 3.x and covers every route.
8. Statement and branch coverage for `packages/server/src` is at least 85%.

## Deliverables

The package on a branch named `m2-server` as a pull request, with the hand-back report in
the PR description.

## If something does not add up

If the schema package's tier tags conflict with the crypto spec's assumption of exactly
three tiers, if append-only cannot be enforced at the database level, or if the GS1 Digital
Link shape in the HLD conflicts with the schema's identifier field — stop and ask.
