-- SPDX-License-Identifier: Apache-2.0
-- M3: batch lifecycle states, anchoring metadata, and per-version proofs.

alter table anchor_batches drop constraint anchor_batches_status_check;
alter table anchor_batches
  add constraint anchor_batches_status_check
  check (status in ('open', 'closed', 'submitted', 'confirmed', 'failed'));

alter table anchor_batches
  add column root text check (root ~ '^[0-9a-f]{64}$'),
  add column tx_id text,
  add column error text,
  add column attempts integer not null default 0,
  add column closed_at timestamptz,
  add column submitted_at timestamptz,
  add column confirmed_at timestamptz,
  add column block_number bigint,
  add column block_time timestamptz;

-- One row per anchored version: its audit path to the batch root
-- (crypto spec section 4.1). Append-only, like the versions themselves.
create table anchor_proofs (
  passport_id text not null,
  version integer not null,
  batch_id uuid not null references anchor_batches (id),
  leaf_index integer not null,
  path jsonb not null,
  root text not null check (root ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  primary key (passport_id, version),
  foreign key (passport_id, version) references passport_versions (passport_id, version)
);

create trigger anchor_proofs_append_only
  before update or delete on anchor_proofs
  for each row execute function reject_mutation();
