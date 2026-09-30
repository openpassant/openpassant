// SPDX-License-Identifier: Apache-2.0
/* eslint-disable @typescript-eslint/no-explicit-any -- tamper mutations reach into the bundle */
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NoopAnchorAdapter } from '../src/anchoring/adapter.js';
import { AnchorScheduler } from '../src/anchoring/scheduler.js';
import { AUTH, createSampleModel, createTestContext } from './helpers.js';
import type { TestContext } from './helpers.js';

const ANCHORED_SIG = '0xfe2289542f7a0110ac112c3a4d712afdcaaf2900a1326f4e6f340b563a0e8734';
const CONTRACT = '0x' + '34'.repeat(20);
const FAKE_KEY = '0x' + 'ab'.repeat(32);
const PASSPORT_PATH = '/01/09506000134352/21/E2E-1';

let ctx: TestContext;
let node: Server;
let browser: Browser;
let page: Page;
let pageUrl: string;

beforeAll(async () => {
  // A Thor lookalike node: serves the receipt for whatever batch is
  // confirmed in the database, with CORS open like the real public nodes.
  let pool: (() => Promise<{ root: string } | undefined>) | null = null;
  node = createServer((request, response) => {
    response.setHeader('access-control-allow-origin', '*');
    response.setHeader('content-type', 'application/json');
    void (async () => {
      const batch = await pool?.();
      if (!request.url?.includes('/receipt') || batch === undefined) {
        response.statusCode = 404;
        response.end('null');
        return;
      }
      response.end(
        JSON.stringify({
          reverted: false,
          outputs: [
            {
              events: [
                {
                  address: CONTRACT,
                  topics: [
                    ANCHORED_SIG,
                    '0x' + batch.root,
                    '0x' + '00'.repeat(12) + 'cd'.repeat(20),
                  ],
                  data: '0x0',
                },
              ],
            },
          ],
          meta: { blockTimestamp: 1758900000 },
        }),
      );
    })();
  });
  await new Promise<void>((resolve) => node.listen(0, '127.0.0.1', resolve));
  const nodeAddress = node.address();
  const nodeUrl = `http://127.0.0.1:${typeof nodeAddress === 'object' && nodeAddress ? nodeAddress.port : 0}`;

  ctx = await createTestContext({
    VECHAIN_NODE_URL: nodeUrl,
    VECHAIN_NETWORK: 'testnet',
    VECHAIN_CONTRACT_ADDRESS: CONTRACT,
    OPERATOR_PRIVATE_KEY: FAKE_KEY,
    SPONSOR_PRIVATE_KEY: FAKE_KEY,
  });
  pool = async () => {
    const result = await ctx.pool.query<{ root: string }>(
      "select root from anchor_batches where status = 'confirmed' limit 1",
    );
    return result.rows[0];
  };

  const modelId = await createSampleModel(ctx.app);
  await ctx.app.inject({
    method: 'POST',
    url: '/passports:batch',
    headers: AUTH,
    payload: { modelId, serials: ['E2E-1', 'E2E-2', 'E2E-3'] },
  });
  await ctx.pool.query("update anchor_batches set created_at = now() - interval '1 hour'");
  await new AnchorScheduler(ctx.pool, new NoopAnchorAdapter(), {
    batchWindowMs: 60000,
    batchMax: 5,
    chain: 'vechain:testnet',
    contract: CONTRACT,
  }).tick();

  await ctx.app.listen({ port: 0, host: '127.0.0.1' });
  const address = ctx.app.server.address();
  pageUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}${PASSPORT_PATH}`;

  browser = await chromium.launch();
  page = await browser.newPage();
}, 60000);

afterAll(async () => {
  await browser?.close();
  node?.close();
  await ctx?.teardown();
}, 30000);

async function clickVerify(): Promise<string> {
  await page.goto(pageUrl);
  await page.click('#passant-verify button');
  const outcome = page.locator('.verify-ok, .verify-bad');
  await outcome.waitFor({ timeout: 10000 });
  return (await outcome.getAttribute('class')) ?? '';
}

describe('in-browser verification, real browser (acceptance criteria 1 and 2)', () => {
  it('shows green on the untampered page', async () => {
    expect(await clickVerify()).toBe('verify-ok');
    expect(await page.locator('.verify-ok').textContent()).toMatch(
      /Verified against the public ledger/,
    );
  }, 30000);

  /* The eight tamper classes from the M1 suite, applied end to end by
     intercepting the served bundle in the browser. Every one must go red. */
  const tampers: [string, (bundle: Record<string, never>) => void][] = [
    ['a data value', (b) => ((b as any).sections.public.doc.data.characteristics.chemistry = 'X')],
    [
      'the salt',
      (b) => ((b as any).sections.public.salt = '1' + (b as any).sections.public.salt.slice(1)),
    ],
    ['doc.version', (b) => ((b as any).sections.public.doc.version = 9)],
    ['doc.id', (b) => ((b as any).sections.public.doc.id += 'x')],
    [
      'a bare section hash',
      (b) => ((b as any).sections.usage.hash = 'f' + (b as any).sections.usage.hash.slice(1)),
    ],
    [
      "a proof step's hash",
      (b) => {
        const p = (b as any).merkle.path;
        if (p.length > 0) p[0].hash = 'f' + p[0].hash.slice(1);
        else (b as any).merkle.root = 'f' + (b as any).merkle.root.slice(1);
      },
    ],
    [
      "a proof step's position",
      (b) => {
        const p = (b as any).merkle.path;
        if (p.length > 0) p[0].position = p[0].position === 'left' ? 'right' : 'left';
        else
          (b as any).sections.compliance.hash = 'e' + (b as any).sections.compliance.hash.slice(1);
      },
    ],
    [
      'swapped proof steps',
      (b) => {
        const p = (b as any).merkle.path;
        if (p.length > 1) [p[0], p[1]] = [p[1], p[0]];
        else
          (b as any).sections.restricted.hash = 'd' + (b as any).sections.restricted.hash.slice(1);
      },
    ],
  ];

  for (const [name, mutate] of tampers) {
    it(`shows red when tampering with ${name}`, async () => {
      await page.route('**/proof**', async (route) => {
        const response = await route.fetch();
        const bundle = (await response.json()) as Record<string, never>;
        mutate(bundle);
        await route.fulfill({ json: bundle });
      });
      expect(await clickVerify()).toBe('verify-bad');
      await page.unroute('**/proof**');
    }, 30000);
  }

  it('stays green when only the informational merkle.root is altered (spec section 5)', async () => {
    // The bundle's own root is informational; verification compares the
    // recomputed root against the chain, never against this field.
    await page.route('**/proof**', async (route) => {
      const response = await route.fetch();
      const bundle = (await response.json()) as Record<string, never>;
      (bundle as any).merkle.root = 'f' + (bundle as any).merkle.root.slice(1);
      await route.fulfill({ json: bundle });
    });
    expect(await clickVerify()).toBe('verify-ok');
    await page.unroute('**/proof**');
  }, 30000);
});
