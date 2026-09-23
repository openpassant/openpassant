// SPDX-License-Identifier: Apache-2.0
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AUTH, createSampleModel, createTestContext } from './helpers.js';
import type { TestContext } from './helpers.js';

let ctx: TestContext;
let ids: string[];

beforeAll(async () => {
  ctx = await createTestContext();
  const modelId = await createSampleModel(ctx.app);
  const minted = await ctx.app.inject({
    method: 'POST',
    url: '/passports:batch',
    headers: AUTH,
    payload: { modelId, serials: ['R-1', 'R-2', 'R-3', 'R-4'] },
  });
  ids = (minted.json() as { passports: { id: string }[] }).passports.map((p) => p.id);
});
afterAll(async () => {
  await ctx.teardown();
});

async function exportedIds(): Promise<string[]> {
  const response = await ctx.app.inject({
    method: 'GET',
    url: '/passports:registry-export',
    headers: AUTH,
  });
  expect(response.statusCode).toBe(200);
  const body = response.json() as { pending: { uniqueIdentifier: string }[] };
  return body.pending.map((p) => p.uniqueIdentifier);
}

describe('EU DPP registry hook (acceptance criterion 9)', () => {
  it('exports all minted passports as pending, with registration metadata', async () => {
    const pending = await exportedIds();
    expect(pending.sort()).toEqual([...ids].sort());

    const response = await ctx.app.inject({
      method: 'GET',
      url: '/passports:registry-export',
      headers: AUTH,
    });
    const body = response.json() as {
      batteryCategory: string;
      pending: { gtin: string; serialNumber: string; modelName: string }[];
    };
    expect(body.batteryCategory).toBe('lmt');
    expect(body.pending[0]!.gtin).toBe('09506000134352');
    expect(body.pending[0]!.modelName).toBe('Urban 504 battery pack');
  });

  it('confirming a subset removes exactly those from the export', async () => {
    const subset = ids.slice(0, 2);
    const confirm = await ctx.app.inject({
      method: 'POST',
      url: '/passports:registry-confirm',
      headers: AUTH,
      payload: { ids: subset },
    });
    expect(confirm.statusCode).toBe(200);
    expect((confirm.json() as { confirmed: number }).confirmed).toBe(2);

    const pending = await exportedIds();
    expect(pending.sort()).toEqual(ids.slice(2).sort());
  });

  it('confirming an unknown identifier fails closed and records nothing', async () => {
    const before = await exportedIds();
    const confirm = await ctx.app.inject({
      method: 'POST',
      url: '/passports:registry-confirm',
      headers: AUTH,
      payload: { ids: [ids[2]!, 'https://id.voltacycles.example/01/09506000134352/21/NOPE'] },
    });
    expect(confirm.statusCode).toBe(404);
    expect((confirm.json() as { code: string }).code).toBe('PASSPORT_NOT_FOUND');
    expect(await exportedIds()).toEqual(before);
  });

  it('re-confirming is idempotent and keeps the original timestamp', async () => {
    const first = await ctx.pool.query('select registered_at from passports where id = $1', [
      ids[0],
    ]);
    const again = await ctx.app.inject({
      method: 'POST',
      url: '/passports:registry-confirm',
      headers: AUTH,
      payload: { ids: [ids[0]!] },
    });
    expect(again.statusCode).toBe(200);
    expect((again.json() as { confirmed: number }).confirmed).toBe(0);
    const second = await ctx.pool.query('select registered_at from passports where id = $1', [
      ids[0],
    ]);
    expect(second.rows[0]).toEqual(first.rows[0]);
  });
});
