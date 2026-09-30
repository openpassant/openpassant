// SPDX-License-Identifier: Apache-2.0
import { canonicalize, generateSalt, leafHash, sectionHash, toHex } from '@openpassant/core';
import type { JsonValue, SectionDoc } from '@openpassant/core';
import { SECTIONS } from '@openpassant/schema';
import type pg from 'pg';
import { splitIntoSections } from './sections.js';
import type { JsonObject } from './validate.js';

/** What the version pipeline stored, hex at the edges. */
export interface StoredVersion {
  passportId: string;
  version: number;
  leafHash: string;
}

// Serialises open-batch selection across concurrent version writes.
const BATCH_LOCK_KEY = 4242;

async function enqueueLeaf(
  client: pg.PoolClient,
  passportId: string,
  version: number,
  leafHex: string,
  batchMax: number,
): Promise<void> {
  await client.query('select pg_advisory_xact_lock($1)', [BATCH_LOCK_KEY]);
  // Newest open batch: earlier open batches that filled up are never
  // reused (M3's scheduler closes and anchors them).
  const open = await client.query<{ id: string; leaves: string }>(
    `select b.id, count(l.id) as leaves
       from anchor_batches b left join anchor_leaves l on l.batch_id = b.id
      where b.status = 'open'
      group by b.id
      order by b.seq desc
      limit 1`,
  );
  let batchId = open.rows[0]?.id;
  if (batchId === undefined || Number(open.rows[0]!.leaves) >= batchMax) {
    const created = await client.query<{ id: string }>(
      'insert into anchor_batches default values returning id',
    );
    batchId = created.rows[0]!.id;
  }
  await client.query(
    'insert into anchor_leaves (batch_id, passport_id, version, leaf_hash) values ($1, $2, $3, $4)',
    [batchId, passportId, version, leafHex],
  );
}

/**
 * The version pipeline (M2 brief, in-scope item 4), to be run inside the
 * caller's transaction: split validated content into the four section
 * documents, draw one fresh salt per section, compute section hashes and
 * the leaf via `core`, store the canonical bytes alongside salts and
 * hashes, and enqueue the leaf into the open anchor batch.
 */
export async function createVersion(
  client: pg.PoolClient,
  passportId: string,
  version: number,
  content: JsonObject,
  reason: string,
  batchMax: number,
): Promise<StoredVersion> {
  const sections = splitIntoSections(content);
  const columns: string[] = [];
  const values: unknown[] = [passportId, version, reason];
  const sectionHashes: Uint8Array[] = [];
  for (const section of SECTIONS) {
    const doc: SectionDoc = { id: passportId, version, section, data: sections[section] };
    const salt = generateSalt();
    const hash = sectionHash(salt, doc);
    sectionHashes.push(hash);
    columns.push(`${section}_canonical`, `${section}_salt`, `${section}_hash`);
    values.push(canonicalize(doc as unknown as JsonValue), toHex(salt), toHex(hash));
  }
  const leafHex = toHex(
    leafHash(sectionHashes[0]!, sectionHashes[1]!, sectionHashes[2]!, sectionHashes[3]!),
  );
  const placeholders = values.map((_, i) => `$${i + 1}`);
  await client.query(
    `insert into passport_versions (passport_id, version, reason, ${columns.join(', ')}, leaf_hash)
     values (${placeholders.join(', ')}, $${values.length + 1})`,
    [...values, leafHex],
  );
  await enqueueLeaf(client, passportId, version, leafHex, batchMax);
  return { passportId, version, leafHash: leafHex };
}
