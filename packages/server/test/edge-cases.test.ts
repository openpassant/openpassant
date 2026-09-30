// SPDX-License-Identifier: Apache-2.0
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { decodeId } from '../src/routes/passports.js';
import { AUTH, createSampleModel, createTestContext, TEST_BASE_URL } from './helpers.js';
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
    payload: {
      modelId,
      serials: ['E-1'],
      unitDefaults: { usageData: { chargeDischargeCycles: 5 } },
    },
  });
  passportId = (minted.json() as { passports: { id: string }[] }).passports[0]!.id;
});
afterAll(async () => {
  await ctx.teardown();
});

describe('edge cases', () => {
  it('unitDefaults merge into the minted version', async () => {
    const version = await ctx.app.inject({
      method: 'GET',
      url: `/passports/${encodeURIComponent(passportId)}/versions/1`,
      headers: AUTH,
    });
    const body = version.json() as {
      sections: { usage: { doc: { data: { usageData: { chargeDischargeCycles: number } } } } };
    };
    expect(body.sections.usage.doc.data.usageData.chargeDischargeCycles).toBe(5);
  });

  it('decodeId handles both already-decoded and encoded identifiers', () => {
    expect(decodeId('https://id.example.com/01/1/21/A')).toBe('https://id.example.com/01/1/21/A');
    expect(decodeId(encodeURIComponent('https://id.example.com/01/1/21/A'))).toBe(
      'https://id.example.com/01/1/21/A',
    );
  });

  it('unknown passport and version return typed 404s', async () => {
    const missing = `${TEST_BASE_URL}/01/09506000134352/21/NOPE`;
    const readPassport = await ctx.app.inject({
      method: 'GET',
      url: `/passports/${encodeURIComponent(missing)}`,
      headers: AUTH,
    });
    expect(readPassport.statusCode).toBe(404);
    expect((readPassport.json() as { code: string }).code).toBe('PASSPORT_NOT_FOUND');

    const readVersion = await ctx.app.inject({
      method: 'GET',
      url: `/passports/${encodeURIComponent(passportId)}/versions/9`,
      headers: AUTH,
    });
    expect(readVersion.statusCode).toBe(404);
    expect((readVersion.json() as { code: string }).code).toBe('VERSION_NOT_FOUND');

    const appendMissing = await ctx.app.inject({
      method: 'POST',
      url: `/passports/${encodeURIComponent(missing)}/versions`,
      headers: AUTH,
      payload: { content: {}, reason: 'x' },
    });
    expect(appendMissing.statusCode).toBe(400); // content invalid comes first, fail closed
  });

  it('a malformed model uuid in a batch mint maps to MODEL_NOT_FOUND', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/passports:batch',
      headers: AUTH,
      payload: { modelId: 'not-a-uuid', serials: ['X-1'] },
    });
    expect(response.statusCode).toBe(404);
    expect((response.json() as { code: string }).code).toBe('MODEL_NOT_FOUND');
  });

  it('unknown routes still require auth, then 404 with it', async () => {
    const unauthenticated = await ctx.app.inject({ method: 'GET', url: '/nope' });
    expect(unauthenticated.statusCode).toBe(401);
    const authenticated = await ctx.app.inject({ method: 'GET', url: '/nope', headers: AUTH });
    expect(authenticated.statusCode).toBe(404);
  });

  it('registry-confirm tolerates duplicate ids within one request', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/passports:registry-confirm',
      headers: AUTH,
      payload: { ids: [passportId, passportId] },
    });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { confirmed: number }).confirmed).toBe(1);
  });

  it('an unexpected backend failure maps to a 500 INTERNAL, never a leak', async () => {
    // A second app over a pool pointing at a dropped database.
    const broken = new pg.Pool({
      connectionString: 'postgres://postgres:postgres@localhost:5432/passant_gone',
      connectionTimeoutMillis: 2000,
    });
    const app = await buildApp(ctx.config, broken);
    const response = await app.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(500);
    expect((response.json() as { code: string }).code).toBe('INTERNAL');
    await app.close();
    await broken.end();
  });
});
