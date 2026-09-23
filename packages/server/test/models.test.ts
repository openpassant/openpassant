// SPDX-License-Identifier: Apache-2.0
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AUTH, createTestContext, sampleModelContent } from './helpers.js';
import type { TestContext } from './helpers.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.teardown();
});

describe('models', () => {
  it('creates and reads a model', async () => {
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/models',
      headers: AUTH,
      payload: { gtin: '09506000134352', name: 'Urban 504', content: sampleModelContent() },
    });
    expect(created.statusCode).toBe(201);
    const { id } = created.json() as { id: string };

    const read = await ctx.app.inject({ method: 'GET', url: `/models/${id}`, headers: AUTH });
    expect(read.statusCode).toBe(200);
    const model = read.json() as { gtin: string; content: Record<string, unknown> };
    expect(model.gtin).toBe('09506000134352');
    expect(model.content['characteristics']).toBeDefined();
  });

  it('rejects a duplicate gtin with DUPLICATE_GTIN', async () => {
    const again = await ctx.app.inject({
      method: 'POST',
      url: '/models',
      headers: AUTH,
      payload: { gtin: '09506000134352', name: 'Same again', content: sampleModelContent() },
    });
    expect(again.statusCode).toBe(409);
    expect((again.json() as { code: string }).code).toBe('DUPLICATE_GTIN');
  });

  it('rejects a bad gtin and unknown content fields, touching nothing', async () => {
    const before = await ctx.pool.query('select count(*) from battery_models');
    const badGtin = await ctx.app.inject({
      method: 'POST',
      url: '/models',
      headers: AUTH,
      payload: { gtin: 'not-a-gtin', name: 'x', content: sampleModelContent() },
    });
    expect(badGtin.statusCode).toBe(400);
    expect((badGtin.json() as { code: string }).code).toBe('BAD_IDENTIFIER');

    const badContent = await ctx.app.inject({
      method: 'POST',
      url: '/models',
      headers: AUTH,
      payload: { gtin: '19506000134359', name: 'x', content: { madeUpField: 1 } },
    });
    expect(badContent.statusCode).toBe(400);
    expect((badContent.json() as { code: string }).code).toBe('VALIDATION_FAILED');

    const after = await ctx.pool.query('select count(*) from battery_models');
    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  it('returns MODEL_NOT_FOUND for missing and malformed ids', async () => {
    for (const id of ['0f0e0d0c-0b0a-4908-8706-050403020100', 'not-a-uuid']) {
      const read = await ctx.app.inject({ method: 'GET', url: `/models/${id}`, headers: AUTH });
      expect(read.statusCode).toBe(404);
      expect((read.json() as { code: string }).code).toBe('MODEL_NOT_FOUND');
    }
  });
});
