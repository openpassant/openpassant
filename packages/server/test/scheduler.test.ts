// SPDX-License-Identifier: Apache-2.0
import { foldProof, fromHex, toHex } from '@openpassant/core';
import type { ProofStep } from '@openpassant/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NoopAnchorAdapter } from '../src/anchoring/adapter.js';
import type { AnchorAdapter, AnchorStatus } from '../src/anchoring/adapter.js';
import { AnchorScheduler } from '../src/anchoring/scheduler.js';
import { AUTH, createSampleModel, createTestContext } from './helpers.js';
import type { TestContext } from './helpers.js';

/** Adapter whose submission always fails — batches must stay retryable. */
class FailingAdapter extends NoopAnchorAdapter {
  override anchor(): Promise<never> {
    return Promise.reject(new Error('simulated submission failure'));
  }
}

/** Adapter that confirms but reports a wrong on-chain root. */
class WrongRootAdapter extends NoopAnchorAdapter {
  override async getAnchoredEvent(txId: string) {
    const event = await super.getAnchoredEvent(txId);
    const corrupted = new Uint8Array(event.root);
    corrupted[0]! ^= 0xff;
    return { ...event, root: corrupted };
  }
}

/** Adapter whose transactions always report failed on status polling. */
class RevertingAdapter extends NoopAnchorAdapter {
  override status(): Promise<AnchorStatus> {
    return Promise.resolve({ state: 'failed', reason: 'simulated revert' });
  }
}

let ctx: TestContext;
let modelId: string;
let serialCounter = 0;

beforeAll(async () => {
  ctx = await createTestContext({ ANCHOR_BATCH_MAX: '5', ANCHOR_BATCH_WINDOW_MS: '3600000' });
  modelId = await createSampleModel(ctx.app);
});
afterAll(async () => {
  await ctx.teardown();
});

function scheduler(adapter: AnchorAdapter): AnchorScheduler {
  return new AnchorScheduler(ctx.pool, adapter, { batchWindowMs: 3600000, batchMax: 5 });
}

async function mint(count: number): Promise<void> {
  const serials = Array.from({ length: count }, () => `S-${serialCounter++}`);
  const response = await ctx.app.inject({
    method: 'POST',
    url: '/passports:batch',
    headers: AUTH,
    payload: { modelId, serials },
  });
  expect(response.statusCode).toBe(201);
}

describe('anchor scheduler (acceptance criterion 4)', () => {
  it('closes full batches, computes roots and proofs that fold with core', async () => {
    await mint(12); // 3 batches: 5, 5, 2
    const summary = await scheduler(new NoopAnchorAdapter()).tick();
    // One tick runs close, submit and confirm; the 2-leaf batch is recent
    // and below max, so it stays open.
    expect(summary.closed).toBe(2);
    expect(summary.submitted).toBe(2);
    expect(summary.confirmed).toBe(2);

    const proofs = await ctx.pool.query<{
      passport_id: string;
      version: number;
      leaf_index: number;
      path: ProofStep[];
      root: string;
    }>('select passport_id, version, leaf_index, path, root from anchor_proofs');
    expect(proofs.rowCount).toBe(10);
    for (const proof of proofs.rows) {
      const leaf = await ctx.pool.query<{ leaf_hash: string }>(
        'select leaf_hash from passport_versions where passport_id = $1 and version = $2',
        [proof.passport_id, proof.version],
      );
      const folded = foldProof(fromHex(leaf.rows[0]!.leaf_hash), proof.path);
      expect(toHex(folded)).toBe(proof.root);
    }
  });

  it('confirmed batches carry a transaction id and block time', async () => {
    const batches = await ctx.pool.query(
      "select tx_id, block_time from anchor_batches where status = 'confirmed'",
    );
    expect(batches.rowCount).toBeGreaterThanOrEqual(2);
    for (const row of batches.rows as { tx_id: string; block_time: string }[]) {
      expect(row.tx_id).toMatch(/^0x[0-9a-f]{64}$/);
      expect(row.block_time).toBeTruthy();
    }
  });

  it('closes a below-max batch once its window has elapsed', async () => {
    // The 2-leaf batch from the first test is still open; age it.
    await ctx.pool.query(
      "update anchor_batches set created_at = now() - interval '2 hours' where status = 'open'",
    );
    const summary = await scheduler(new NoopAnchorAdapter()).tick();
    expect(summary.closed).toBe(1);
    expect(summary.confirmed).toBeGreaterThanOrEqual(1);
  });

  it('never closes or anchors an empty batch', async () => {
    await ctx.pool.query(
      "insert into anchor_batches (created_at) values (now() - interval '2 hours')",
    );
    const summary = await scheduler(new NoopAnchorAdapter()).tick();
    expect(summary.closed).toBe(0);
    const empty = await ctx.pool.query('select status from anchor_batches where root is null');
    expect((empty.rows as { status: string }[]).every((r) => r.status === 'open')).toBe(true);
  });

  it('a failed submission leaves the batch retryable and loses no leaves (criterion 4)', async () => {
    await mint(5); // exactly one full batch
    const failing = await scheduler(new FailingAdapter()).tick();
    expect(failing.closed).toBe(1);
    expect(failing.submitted).toBe(0);

    const stuck = await ctx.pool.query<{ id: string; attempts: number; error: string }>(
      "select id, attempts, error from anchor_batches where status = 'closed'",
    );
    expect(stuck.rowCount).toBe(1);
    expect(stuck.rows[0]!.attempts).toBe(1);
    expect(stuck.rows[0]!.error).toMatch(/simulated submission failure/);
    const leaves = await ctx.pool.query(
      'select count(*) as n from anchor_leaves where batch_id = $1',
      [stuck.rows[0]!.id],
    );
    expect(Number((leaves.rows[0] as { n: string }).n)).toBe(5);

    // The next tick with a working adapter drains it.
    const retry = await scheduler(new NoopAnchorAdapter()).tick();
    expect(retry.submitted).toBe(1);
    expect(retry.confirmed).toBe(1);
  });

  it('a wrong on-chain root marks the batch failed, never confirmed', async () => {
    await mint(5);
    const summary = await scheduler(new WrongRootAdapter()).tick();
    expect(summary.failed).toBe(1);
    const failed = await ctx.pool.query("select error from anchor_batches where status = 'failed'");
    expect((failed.rows[0] as { error: string }).error).toMatch(/root does not match/);
  });

  it('a reverted transaction sends the batch back to closed for resubmission', async () => {
    await mint(5);
    const reverting = scheduler(new RevertingAdapter());
    const first = await reverting.tick();
    expect(first.submitted).toBe(1);
    const second = await reverting.tick();
    expect(second.failed).toBe(1);
    const closed = await ctx.pool.query(
      "select tx_id, error from anchor_batches where status = 'closed'",
    );
    expect(closed.rowCount).toBe(1);
    expect((closed.rows[0] as { tx_id: string | null }).tx_id).toBeNull();
    // Drain for the next test.
    await scheduler(new NoopAnchorAdapter()).tick();
  });

  it('start/stop tick periodically and report errors instead of throwing', async () => {
    await mint(5);
    const errors: unknown[] = [];
    class ThrowingStatusAdapter extends NoopAnchorAdapter {
      override status(): Promise<AnchorStatus> {
        return Promise.reject(new Error('status probe crashed'));
      }
    }
    const throwing = new AnchorScheduler(
      ctx.pool,
      new ThrowingStatusAdapter(),
      { batchWindowMs: 3600000, batchMax: 5 },
      (error) => errors.push(error),
    );
    throwing.start(25);
    await new Promise((resolve) => setTimeout(resolve, 120));
    throwing.stop();
    // The batch was closed and submitted, and the crashing confirm phase
    // was reported without killing the loop; the batch stays submitted.
    expect(errors.length).toBeGreaterThan(0);
    const submitted = await ctx.pool.query(
      "select count(*) as n from anchor_batches where status = 'submitted'",
    );
    expect(Number((submitted.rows[0] as { n: string }).n)).toBe(1);
    // Drain with a working adapter (the Noop that anchored it is gone, so
    // its event lookup fails; the fresh Noop resubmits after a reset).
    await ctx.pool.query(
      "update anchor_batches set status = 'closed', tx_id = null where status = 'submitted'",
    );
    await scheduler(new NoopAnchorAdapter()).tick();
  });

  it('the noop adapter reports unknown transactions as failed', async () => {
    const noop = new NoopAnchorAdapter();
    expect(await noop.status('0xdead')).toMatchObject({ state: 'failed' });
    await expect(noop.getAnchoredEvent('0xdead')).rejects.toThrow(/unknown transaction/);
  });

  it('concurrent version writes during batch close lose nothing (criterion 4)', async () => {
    const noop = scheduler(new NoopAnchorAdapter());
    await Promise.all([mint(5), mint(5), noop.tick(), mint(5), noop.tick(), mint(3)]);
    await ctx.pool.query(
      "update anchor_batches set created_at = now() - interval '2 hours' where status = 'open'",
    );
    await noop.tick();

    // Conservation: every version has exactly one leaf, every leaf sits in
    // exactly one batch, and every closed batch's proofs cover its leaves.
    const counts = await ctx.pool.query<{ versions: string; leaves: string; proofs: string }>(
      `select (select count(*) from passport_versions) as versions,
              (select count(*) from anchor_leaves) as leaves,
              (select count(*) from anchor_proofs) as proofs`,
    );
    expect(counts.rows[0]!.leaves).toBe(counts.rows[0]!.versions);
    expect(counts.rows[0]!.proofs).toBe(counts.rows[0]!.leaves);
    const oversized = await ctx.pool.query(
      'select batch_id from anchor_leaves group by batch_id having count(*) > 5',
    );
    expect(oversized.rowCount).toBe(0);
  });
});
