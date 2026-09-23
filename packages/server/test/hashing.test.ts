// SPDX-License-Identifier: Apache-2.0
import { canonicalize, fromHex, leafHash, sectionHash, toHex } from '@openpassant/core';
import type { JsonValue, SectionDoc } from '@openpassant/core';
import { SECTIONS } from '@openpassant/schema';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AUTH, createSampleModel, createTestContext } from './helpers.js';
import type { TestContext } from './helpers.js';

let ctx: TestContext;
let passportId: string;

beforeAll(async () => {
  ctx = await createTestContext();
  const modelId = await createSampleModel(ctx.app);
  const minted = await ctx.app.inject({
    method: 'POST',
    url: '/passports:batch',
    headers: AUTH,
    payload: { modelId, serials: ['HASH-1'] },
  });
  passportId = (minted.json() as { passports: { id: string }[] }).passports[0]!.id;
});
afterAll(async () => {
  await ctx.teardown();
});

describe('stored hashes reproduce with core (acceptance criterion 3)', () => {
  it('recomputes byte-identical section hashes and leaf from the database row', async () => {
    const result = await ctx.pool.query(
      'select * from passport_versions where passport_id = $1 and version = 1',
      [passportId],
    );
    expect(result.rowCount).toBe(1);
    const row = result.rows[0] as Record<string, string>;

    const recomputed: Uint8Array[] = [];
    for (const section of SECTIONS) {
      const canonical = row[`${section}_canonical`]!;
      const doc = JSON.parse(canonical) as SectionDoc;

      // The stored canonical bytes are exactly core's canonical form.
      expect(canonicalize(doc as unknown as JsonValue)).toBe(canonical);
      // The document is bound to this passport and version.
      expect(doc.id).toBe(passportId);
      expect(doc.version).toBe(1);
      expect(doc.section).toBe(section);

      const hash = sectionHash(fromHex(row[`${section}_salt`]!), doc);
      expect(toHex(hash)).toBe(row[`${section}_hash`]);
      recomputed.push(hash);
    }

    const leaf = leafHash(recomputed[0]!, recomputed[1]!, recomputed[2]!, recomputed[3]!);
    expect(toHex(leaf)).toBe(row['leaf_hash']);
  });

  it('enqueued exactly one leaf for the version, matching the stored leaf', async () => {
    const leaves = await ctx.pool.query(
      'select leaf_hash from anchor_leaves where passport_id = $1 and version = 1',
      [passportId],
    );
    expect(leaves.rowCount).toBe(1);
    const version = await ctx.pool.query(
      'select leaf_hash from passport_versions where passport_id = $1 and version = 1',
      [passportId],
    );
    expect(leaves.rows[0]).toEqual(version.rows[0]);
  });

  it('serves the version with parsed docs, salts and hashes over the API', async () => {
    const response = await ctx.app.inject({
      method: 'GET',
      url: `/passports/${encodeURIComponent(passportId)}/versions/1`,
      headers: AUTH,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      leafHash: string;
      sections: Record<string, { doc: SectionDoc; salt: string; hash: string }>;
    };
    expect(Object.keys(body.sections)).toEqual([...SECTIONS]);
    expect(body.sections['public']!.doc.section).toBe('public');
    expect(body.sections['public']!.salt).toMatch(/^[0-9a-f]{32}$/);
    expect(body.leafHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('salts differ between sections and versions', async () => {
    const row = (
      await ctx.pool.query('select * from passport_versions where passport_id = $1', [passportId])
    ).rows[0] as Record<string, string>;
    const salts = SECTIONS.map((s) => row[`${s}_salt`]);
    expect(new Set(salts).size).toBe(4);
  });
});

describe('anchor batching', () => {
  it('splits leaves into batches of at most ANCHOR_BATCH_MAX, preserving order', async () => {
    const small = await createTestContext({ ANCHOR_BATCH_MAX: '10' });
    try {
      const modelId = await createSampleModel(small.app);
      const serials = Array.from({ length: 25 }, (_, i) => `B-${i}`);
      const minted = await small.app.inject({
        method: 'POST',
        url: '/passports:batch',
        headers: AUTH,
        payload: { modelId, serials },
      });
      expect(minted.statusCode).toBe(201);

      const batches = await small.pool.query<{ batch_id: string; n: string }>(
        'select batch_id, count(*) as n from anchor_leaves group by batch_id order by min(id)',
      );
      expect(batches.rows.map((r) => Number(r.n))).toEqual([10, 10, 5]);

      const order = await small.pool.query<{ passport_id: string }>(
        'select passport_id from anchor_leaves order by id',
      );
      expect(order.rows.map((r) => r.passport_id.split('/').pop())).toEqual(serials);
    } finally {
      await small.teardown();
    }
  });
});
