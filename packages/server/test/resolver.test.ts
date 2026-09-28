// SPDX-License-Identifier: Apache-2.0
import { computeBundleRoot, toHex } from '@openpassant/core';
import jsonld from 'jsonld';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NoopAnchorAdapter } from '../src/anchoring/adapter.js';
import { AnchorScheduler } from '../src/anchoring/scheduler.js';
import { AUTH, createSampleModel, createTestContext, TEST_BASE_URL } from './helpers.js';
import type { TestContext } from './helpers.js';

const CONTRACT = '0x' + '34'.repeat(20);
let ctx: TestContext;
let passportPath: string;

beforeAll(async () => {
  ctx = await createTestContext({ ANCHOR_BATCH_MAX: '5' });
  const modelId = await createSampleModel(ctx.app);
  const minted = await ctx.app.inject({
    method: 'POST',
    url: '/passports:batch',
    headers: AUTH,
    payload: { modelId, serials: ['RES-1', 'RES-2'] },
  });
  expect(minted.statusCode).toBe(201);
  passportPath = '/01/09506000134352/21/RES-1';
});
afterAll(async () => {
  await ctx.teardown();
});

async function anchorEverything(): Promise<void> {
  await ctx.pool.query(
    "update anchor_batches set created_at = now() - interval '1 hour' where status = 'open'",
  );
  const scheduler = new AnchorScheduler(ctx.pool, new NoopAnchorAdapter(), {
    batchWindowMs: 60000,
    batchMax: 5,
    chain: 'vechain:testnet',
    contract: CONTRACT,
  });
  await scheduler.tick();
}

describe('public passport page', () => {
  it('serves the not-yet-anchored state first, without auth', async () => {
    const page = await ctx.app.inject({ method: 'GET', url: passportPath });
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-type']).toContain('text/html');
    expect(page.body).toContain('not anchored on the public ledger yet');
  });

  it('renders public data, restricted notices and the anchor after anchoring', async () => {
    await anchorEverything();
    const page = await ctx.app.inject({ method: 'GET', url: passportPath });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('Urban 504 battery pack');
    expect(page.body).toContain('RES-1');
    expect(page.body).toContain('Li-ion NMC 811');
    expect(page.body).toContain('vechain:testnet');
    expect(page.body).toContain('passant-verify');
    expect(page.body).toContain('available to repairers, recyclers and authorities');
  });

  it('leaks no restricted values and no salts (acceptance criterion 3)', async () => {
    const page = await ctx.app.inject({ method: 'GET', url: passportPath });
    // Restricted-section values from the sample passport:
    for (const secret of ['BMS-504-A', 'LiNi0.8Mn0.1Co0.1O2', 'urb-504-safety', 'Torx T20']) {
      expect(page.body).not.toContain(secret);
    }
    const salts = await ctx.pool.query<{ s: string }>(
      `select public_salt as s from passport_versions
       union select restricted_salt from passport_versions
       union select compliance_salt from passport_versions
       union select usage_salt from passport_versions`,
    );
    for (const { s } of salts.rows) {
      expect(page.body).not.toContain(s);
    }
  });

  it('sets cache headers: cacheable public page, no-store for authenticated data', async () => {
    const page = await ctx.app.inject({ method: 'GET', url: passportPath });
    expect(page.headers['cache-control']).toBe('public, max-age=60');
    const version = await ctx.app.inject({
      method: 'GET',
      url: `/passports/${encodeURIComponent(TEST_BASE_URL + passportPath)}/versions/1`,
      headers: AUTH,
    });
    expect(version.headers['cache-control']).toBe('no-store');
  });

  it('returns one uniform 404 for unknown serials, gtins and versions', async () => {
    for (const url of [
      '/01/09506000134352/21/NOPE',
      '/01/99999999/21/RES-1',
      `${passportPath}?version=9`,
    ]) {
      const response = await ctx.app.inject({ method: 'GET', url });
      expect(response.statusCode).toBe(404);
      expect((response.json() as { message: string }).message).toBe('no passport at this address');
    }
  });
});

describe('JSON-LD (acceptance criterion 4)', () => {
  it('negotiates content and expands with every public field under the vocabulary', async () => {
    const response = await ctx.app.inject({
      method: 'GET',
      url: passportPath,
      headers: { accept: 'application/ld+json' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/ld+json');
    const document = response.json() as Record<string, unknown>;
    expect(document['@id']).toBe(TEST_BASE_URL + passportPath);
    expect(document['@type']).toBe('BatteryPassport');
    expect(document['vocabularyNote']).toContain('Provisional');

    const expanded = (await jsonld.expand(document as never)) as Record<string, unknown>[];
    expect(expanded).toHaveLength(1);
    const iris = Object.keys(expanded[0]!);
    const publicRow = await ctx.pool.query<{ c: string }>(
      'select public_canonical as c from passport_versions limit 1',
    );
    const publicFields = Object.keys(
      (JSON.parse(publicRow.rows[0]!.c) as { data: Record<string, unknown> }).data,
    );
    for (const field of publicFields) {
      expect(iris).toContain(`https://openpassant.org/vocab/battery-passport/0.1#${field}`);
    }
  });
});

describe('proof bundle endpoint (acceptance criterion 2 shape)', () => {
  it('serves the exact passant-proof/2 shape and it verifies with core', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: `${passportPath}/proof` });
    expect(response.statusCode).toBe(200);
    const bundle = response.json() as Record<string, unknown>;

    // Field-for-field shape of crypto spec section 5.
    expect(Object.keys(bundle).sort()).toEqual(
      ['spec', 'id', 'version', 'sections', 'merkle', 'anchor'].sort(),
    );
    expect(bundle['spec']).toBe('passant-proof/2');
    const sections = bundle['sections'] as Record<string, Record<string, unknown>>;
    expect(Object.keys(sections)).toEqual(['public', 'restricted', 'compliance', 'usage']);
    expect(Object.keys(sections['public']!).sort()).toEqual(['doc', 'salt']);
    for (const bare of ['restricted', 'compliance', 'usage']) {
      expect(Object.keys(sections[bare]!)).toEqual(['hash']);
    }
    expect(Object.keys(bundle['merkle'] as object).sort()).toEqual(['path', 'root']);
    expect(Object.keys(bundle['anchor'] as object).sort()).toEqual(
      ['chain', 'contract', 'txId'].sort(),
    );
    expect((bundle['anchor'] as { chain: string }).chain).toBe('vechain:testnet');
    expect((bundle['anchor'] as { contract: string }).contract).toBe(CONTRACT.toLowerCase());

    const result = computeBundleRoot(bundle);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect('0x' + toHex(result.root)).toBe('0x' + (bundle['merkle'] as { root: string }).root);
      expect(result.checkedSections).toEqual(['public']);
    }
  });

  it('serves historical versions with their own proofs (acceptance criterion 6)', async () => {
    // Append version 2 and anchor it.
    const id = TEST_BASE_URL + passportPath;
    const v1 = await ctx.app.inject({
      method: 'GET',
      url: `/passports/${encodeURIComponent(id)}/versions/1`,
      headers: AUTH,
    });
    const content = Object.assign(
      {},
      ...Object.values(
        (v1.json() as { sections: Record<string, { doc: { data: object } }> }).sections,
      ).map((s) => s.doc.data),
    ) as Record<string, unknown>;
    content['status'] = 'repurposed';
    await ctx.app.inject({
      method: 'POST',
      url: `/passports/${encodeURIComponent(id)}/versions`,
      headers: AUTH,
      payload: { content, reason: 'second life' },
    });

    const before = await ctx.app.inject({ method: 'GET', url: `${passportPath}/proof?version=2` });
    expect(before.statusCode).toBe(409);
    expect((before.json() as { code: string }).code).toBe('NOT_YET_ANCHORED');

    await anchorEverything();
    for (const version of [1, 2]) {
      const proof = await ctx.app.inject({
        method: 'GET',
        url: `${passportPath}/proof?version=${version}`,
      });
      expect(proof.statusCode).toBe(200);
      const bundle = proof.json() as { version: number };
      expect(bundle.version).toBe(version);
      expect(computeBundleRoot(bundle).ok).toBe(true);
    }
    // The page shows both version links.
    const page = await ctx.app.inject({ method: 'GET', url: `${passportPath}?version=1` });
    expect(page.body).toContain('?version=2');
  });

  it('serves the verifier asset publicly', async () => {
    const asset = await ctx.app.inject({ method: 'GET', url: '/assets/verifier.js' });
    expect(asset.statusCode).toBe(200);
    expect(asset.headers['content-type']).toContain('javascript');
    expect(asset.body).toContain('passant-verify');
  });
});
