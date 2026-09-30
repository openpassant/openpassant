// SPDX-License-Identifier: Apache-2.0
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AUTH, createSampleModel, createTestContext, TEST_BASE_URL } from './helpers.js';
import type { TestContext } from './helpers.js';

let ctx: TestContext;
let modelId: string;

beforeAll(async () => {
  ctx = await createTestContext();
  modelId = await createSampleModel(ctx.app);
});
afterAll(async () => {
  await ctx.teardown();
});

const serials = Array.from({ length: 100 }, (_, i) => `SN-${String(i).padStart(4, '0')}`);

describe('batch minting (acceptance criterion 2)', () => {
  it('mints 100 passports through the API and reads all back with version 1', async () => {
    const minted = await ctx.app.inject({
      method: 'POST',
      url: '/passports:batch',
      headers: AUTH,
      payload: { modelId, serials },
    });
    expect(minted.statusCode).toBe(201);
    const body = minted.json() as { count: number; passports: { id: string }[] };
    expect(body.count).toBe(100);
    expect(body.passports[0]!.id).toBe(`${TEST_BASE_URL}/01/09506000134352/21/SN-0000`);

    for (const { id } of body.passports) {
      const read = await ctx.app.inject({
        method: 'GET',
        url: `/passports/${encodeURIComponent(id)}`,
        headers: AUTH,
      });
      expect(read.statusCode).toBe(200);
      expect((read.json() as { latestVersion: number }).latestVersion).toBe(1);
    }
  });

  it('re-posting the identical batch creates no duplicates (criterion 6)', async () => {
    const before = await ctx.pool.query('select count(*) as n from passports');
    const again = await ctx.app.inject({
      method: 'POST',
      url: '/passports:batch',
      headers: AUTH,
      payload: { modelId, serials },
    });
    expect(again.statusCode).toBe(409);
    expect((again.json() as { code: string }).code).toBe('DUPLICATE_SERIAL');
    const after = await ctx.pool.query('select count(*) as n from passports');
    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  it('rejects duplicate serials within one request', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/passports:batch',
      headers: AUTH,
      payload: { modelId, serials: ['A-1', 'A-1'] },
    });
    expect(response.statusCode).toBe(400);
    expect((response.json() as { code: string }).code).toBe('VALIDATION_FAILED');
  });

  it('is transactional: one bad serial mints nothing', async () => {
    const before = await ctx.pool.query('select count(*) as n from passports');
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/passports:batch',
      headers: AUTH,
      payload: { modelId, serials: ['GOOD-1', 'bad serial with spaces'] },
    });
    expect(response.statusCode).toBe(400);
    expect((response.json() as { code: string }).code).toBe('BAD_IDENTIFIER');
    const after = await ctx.pool.query('select count(*) as n from passports');
    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  it('returns MODEL_NOT_FOUND for an unknown model', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/passports:batch',
      headers: AUTH,
      payload: { modelId: '0f0e0d0c-0b0a-4908-8706-050403020100', serials: ['X-1'] },
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('auth and malformed bodies (criterion 5)', () => {
  it('rejects requests without the bearer key with 401', async () => {
    for (const [method, url] of [
      ['POST', '/models'],
      ['POST', '/passports:batch'],
      ['GET', '/passports:registry-export'],
    ] as const) {
      const response = await ctx.app.inject({ method, url, payload: {} });
      expect(response.statusCode).toBe(401);
      expect((response.json() as { code: string }).code).toBe('UNAUTHORIZED');
    }
  });

  it('rejects a malformed body with 400 and touches nothing', async () => {
    const before = await ctx.pool.query('select count(*) as n from passports');
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/passports:batch',
      headers: AUTH,
      payload: { serials: 'not-an-array' },
    });
    expect(response.statusCode).toBe(400);
    expect((response.json() as { code: string }).code).toBe('VALIDATION_FAILED');
    const after = await ctx.pool.query('select count(*) as n from passports');
    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  it('healthz needs no auth', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(200);
  });
});

describe('appending versions', () => {
  it('appends version 2 with new content and a reason', async () => {
    const id = `${TEST_BASE_URL}/01/09506000134352/21/SN-0000`;
    const content = JSON.parse(
      (
        await ctx.app.inject({
          method: 'GET',
          url: `/passports/${encodeURIComponent(id)}/versions/1`,
          headers: AUTH,
        })
      ).body,
    ) as {
      sections: Record<string, { doc: { data: Record<string, unknown> } }>;
    };
    // Rebuild full content from the stored section docs, then change status.
    const merged = Object.assign(
      {},
      ...Object.values(content.sections).map((section) => section.doc.data),
    ) as Record<string, unknown>;
    merged['status'] = 'repurposed';

    const response = await ctx.app.inject({
      method: 'POST',
      url: `/passports/${encodeURIComponent(id)}/versions`,
      headers: AUTH,
      payload: { content: merged, reason: 'repurposed after first life' },
    });
    expect(response.statusCode).toBe(201);
    expect((response.json() as { version: number }).version).toBe(2);

    const read = await ctx.app.inject({
      method: 'GET',
      url: `/passports/${encodeURIComponent(id)}`,
      headers: AUTH,
    });
    expect((read.json() as { latestVersion: number }).latestVersion).toBe(2);
  });

  it('rejects invalid content with 400 and stores no version', async () => {
    const id = `${TEST_BASE_URL}/01/09506000134352/21/SN-0001`;
    const response = await ctx.app.inject({
      method: 'POST',
      url: `/passports/${encodeURIComponent(id)}/versions`,
      headers: AUTH,
      payload: { content: { status: 'waste' }, reason: 'incomplete content' },
    });
    expect(response.statusCode).toBe(400);
    const versions = await ctx.pool.query(
      'select count(*) as n from passport_versions where passport_id = $1',
      [id],
    );
    expect(Number(versions.rows[0]!.n)).toBe(1);
  });
});
