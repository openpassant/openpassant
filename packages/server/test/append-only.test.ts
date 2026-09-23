// SPDX-License-Identifier: Apache-2.0
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
    payload: { modelId, serials: ['AO-1'] },
  });
  passportId = (minted.json() as { passports: { id: string }[] }).passports[0]!.id;
});
afterAll(async () => {
  await ctx.teardown();
});

describe('append-only enforcement in the database (acceptance criterion 4)', () => {
  it('rejects UPDATE on passport_versions', async () => {
    await expect(
      ctx.pool.query("update passport_versions set reason = 'rewritten' where passport_id = $1", [
        passportId,
      ]),
    ).rejects.toThrow(/append-only/);
  });

  it('rejects DELETE on passport_versions', async () => {
    await expect(
      ctx.pool.query('delete from passport_versions where passport_id = $1', [passportId]),
    ).rejects.toThrow(/append-only/);
  });

  it('rejects UPDATE and DELETE on anchor_leaves', async () => {
    await expect(
      ctx.pool.query("update anchor_leaves set leaf_hash = repeat('0', 64)"),
    ).rejects.toThrow(/append-only/);
    await expect(ctx.pool.query('delete from anchor_leaves')).rejects.toThrow(/append-only/);
  });

  it('the row is still intact afterwards', async () => {
    const row = await ctx.pool.query(
      'select reason from passport_versions where passport_id = $1 and version = 1',
      [passportId],
    );
    expect(row.rows[0]).toEqual({ reason: 'initial issue' });
  });
});
