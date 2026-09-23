-- SPDX-License-Identifier: Apache-2.0
-- Initial schema: models, passports, append-only versions, anchor queue.

create table battery_models (
  id uuid primary key default gen_random_uuid(),
  gtin text not null unique,
  name text not null,
  content jsonb not null,
  created_at timestamptz not null default now()
);

create table passports (
  id text primary key, -- the GS1 Digital Link identifier URL
  model_id uuid not null references battery_models (id),
  serial_number text not null,
  status text not null default 'active',
  registered_at timestamptz, -- EU DPP registry hook (Art. 77(10)); null = not yet registered
  created_at timestamptz not null default now(),
  unique (model_id, serial_number)
);

-- One row per immutable passport version. The canonical columns hold the
-- exact bytes that were hashed (crypto spec section 3); parsing them yields
-- the section documents. jsonb is deliberately NOT used here: it does not
-- preserve the canonical byte form.
create table passport_versions (
  passport_id text not null references passports (id),
  version integer not null check (version >= 1),
  reason text not null,
  author text not null default 'api',
  public_canonical text not null,
  public_salt text not null check (public_salt ~ '^[0-9a-f]{32}$'),
  public_hash text not null check (public_hash ~ '^[0-9a-f]{64}$'),
  restricted_canonical text not null,
  restricted_salt text not null check (restricted_salt ~ '^[0-9a-f]{32}$'),
  restricted_hash text not null check (restricted_hash ~ '^[0-9a-f]{64}$'),
  compliance_canonical text not null,
  compliance_salt text not null check (compliance_salt ~ '^[0-9a-f]{32}$'),
  compliance_hash text not null check (compliance_hash ~ '^[0-9a-f]{64}$'),
  usage_canonical text not null,
  usage_salt text not null check (usage_salt ~ '^[0-9a-f]{32}$'),
  usage_hash text not null check (usage_hash ~ '^[0-9a-f]{64}$'),
  leaf_hash text not null check (leaf_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  primary key (passport_id, version)
);

-- Batching accumulator. M2 only accumulates into 'open' batches; closing,
-- anchoring and further states arrive with M3.
create table anchor_batches (
  id uuid primary key default gen_random_uuid(),
  -- Monotonic creation order; created_at cannot serve, because now() is
  -- the transaction timestamp and ties within one transaction.
  seq bigint generated always as identity unique,
  status text not null default 'open' check (status in ('open')),
  created_at timestamptz not null default now()
);

-- Leaf order within a batch is insertion order (ascending id); the Merkle
-- root depends on it (crypto spec section 4).
create table anchor_leaves (
  id bigint generated always as identity primary key,
  batch_id uuid not null references anchor_batches (id),
  passport_id text not null,
  version integer not null,
  leaf_hash text not null check (leaf_hash ~ '^[0-9a-f]{64}$'),
  unique (passport_id, version),
  foreign key (passport_id, version) references passport_versions (passport_id, version)
);

-- Hard rule 8: versions are append-only, enforced in the database itself.
create function reject_mutation() returns trigger language plpgsql as $$
begin
  raise exception 'append-only: % is not allowed on %', tg_op, tg_table_name;
end;
$$;

create trigger passport_versions_append_only
  before update or delete on passport_versions
  for each row execute function reject_mutation();

create trigger anchor_leaves_append_only
  before update or delete on anchor_leaves
  for each row execute function reject_mutation();
