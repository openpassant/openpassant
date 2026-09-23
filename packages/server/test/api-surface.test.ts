// SPDX-License-Identifier: Apache-2.0
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext } from './helpers.js';
import type { TestContext } from './helpers.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.teardown();
});

describe('OpenAPI document (acceptance criterion 7)', () => {
  it('serves an OpenAPI 3.x document covering every route, without auth', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/openapi.json' });
    expect(response.statusCode).toBe(200);
    const doc = response.json() as {
      openapi: string;
      info: { title: string };
      paths: Record<string, unknown>;
    };
    expect(doc.openapi.startsWith('3.')).toBe(true);
    expect(doc.info.title).toBe('Passant issuing API');

    const expectedPaths = [
      '/healthz',
      '/openapi.json',
      '/models',
      '/models/{id}',
      '/passports:batch',
      '/passports/{id}',
      '/passports/{id}/versions',
      '/passports/{id}/versions/{n}',
      '/passports:registry-export',
      '/passports:registry-confirm',
    ];
    for (const path of expectedPaths) {
      expect(Object.keys(doc.paths)).toContain(path);
    }
  });
});
