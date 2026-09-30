-- SPDX-License-Identifier: Apache-2.0
-- M4: record where a batch was anchored. Stored per batch at submission
-- time, because a proof bundle must name the chain and contract its root
-- actually went to - a config-only value would silently misdescribe old
-- batches after a contract rotation.

alter table anchor_batches
  add column chain text,
  add column contract text check (contract ~ '^0x[0-9a-f]{40}$');
