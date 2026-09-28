// SPDX-License-Identifier: Apache-2.0
import { buildTree, fromHex, toHex } from '@openpassant/core';
import type pg from 'pg';
import { withTransaction } from '../db.js';
import type { AnchorAdapter } from './adapter.js';

/** What one scheduler pass did. */
export interface TickSummary {
  closed: number;
  submitted: number;
  confirmed: number;
  failed: number;
}

/** Scheduler settings, taken from the server config. */
export interface SchedulerOptions {
  /** Close an open batch after this many milliseconds with pending leaves. */
  batchWindowMs: number;
  /** Close an open batch once it holds this many leaves. */
  batchMax: number;
  /** Anchor target recorded on each batch, e.g. `vechain:testnet`. */
  chain: string;
  /** Registry contract address the adapter anchors to, 0x-prefixed. */
  contract: string;
}

// Must match the enqueue lock in versions.ts: closing and enqueueing
// serialise on the same advisory lock, so a leaf lands either in the batch
// being closed or in the next open one — never lost, never split.
const BATCH_LOCK_KEY = 4242;

/**
 * The anchoring engine (M3 brief, in-scope item 3). Each `tick` runs three
 * idempotent phases: close due batches (build the Merkle tree with `core`,
 * store the root and every leaf's audit path), submit closed batches
 * through the adapter, and confirm submitted ones against the chain —
 * verifying that the on-chain event root equals the stored root. A failed
 * submission leaves the batch `closed` with the error recorded, to be
 * retried on the next tick; leaves are never lost.
 */
export class AnchorScheduler {
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(
    private readonly pool: pg.Pool,
    private readonly adapter: AnchorAdapter,
    private readonly options: SchedulerOptions,
    private readonly onError: (error: unknown) => void = () => {},
  ) {}

  /** Runs one pass over all three phases. Safe to call concurrently with writes. */
  async tick(): Promise<TickSummary> {
    const summary: TickSummary = { closed: 0, submitted: 0, confirmed: 0, failed: 0 };
    summary.closed = await this.closeDueBatches();
    await this.submitClosedBatches(summary);
    await this.confirmSubmittedBatches(summary);
    return summary;
  }

  /** Starts periodic ticking; errors are reported, never thrown. */
  start(intervalMs: number): void {
    this.timer = setInterval(() => {
      if (this.ticking) {
        return;
      }
      this.ticking = true;
      this.tick()
        .catch(this.onError)
        .finally(() => {
          this.ticking = false;
        });
    }, intervalMs);
    this.timer.unref();
  }

  /** Stops periodic ticking. */
  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async closeDueBatches(): Promise<number> {
    return withTransaction(this.pool, async (client) => {
      await client.query('select pg_advisory_xact_lock($1)', [BATCH_LOCK_KEY]);
      const due = await client.query<{ id: string }>(
        `select b.id
           from anchor_batches b
          where b.status = 'open'
            and exists (select 1 from anchor_leaves l where l.batch_id = b.id)
            and ( (select count(*) from anchor_leaves l where l.batch_id = b.id) >= $1
                  or b.created_at <= now() - make_interval(secs => $2::double precision / 1000) )
          order by b.seq`,
        [this.options.batchMax, this.options.batchWindowMs],
      );
      for (const { id } of due.rows) {
        const leaves = await client.query<{
          passport_id: string;
          version: number;
          leaf_hash: string;
        }>(
          'select passport_id, version, leaf_hash from anchor_leaves where batch_id = $1 order by id',
          [id],
        );
        const tree = buildTree(leaves.rows.map((row) => fromHex(row.leaf_hash)));
        const root = toHex(tree.root);
        for (let index = 0; index < leaves.rows.length; index++) {
          const leaf = leaves.rows[index]!;
          await client.query(
            `insert into anchor_proofs (passport_id, version, batch_id, leaf_index, path, root)
             values ($1, $2, $3, $4, $5, $6)`,
            [leaf.passport_id, leaf.version, id, index, JSON.stringify(tree.proof(index)), root],
          );
        }
        await client.query(
          "update anchor_batches set status = 'closed', root = $2, closed_at = now() where id = $1",
          [id, root],
        );
      }
      return due.rowCount ?? 0;
    });
  }

  private async submitClosedBatches(summary: TickSummary): Promise<void> {
    const closed = await this.pool.query<{ id: string; root: string }>(
      "select id, root from anchor_batches where status = 'closed' order by seq",
    );
    for (const batch of closed.rows) {
      try {
        const receipt = await this.adapter.anchor(fromHex(batch.root));
        await this.pool.query(
          `update anchor_batches
              set status = 'submitted', tx_id = $2, submitted_at = now(),
                  attempts = attempts + 1, error = null, chain = $3, contract = $4
            where id = $1`,
          [batch.id, receipt.txId, this.options.chain, this.options.contract.toLowerCase()],
        );
        summary.submitted += 1;
      } catch (error) {
        await this.pool.query(
          'update anchor_batches set attempts = attempts + 1, error = $2 where id = $1',
          [batch.id, error instanceof Error ? error.message : String(error)],
        );
        this.onError(error);
      }
    }
  }

  private async confirmSubmittedBatches(summary: TickSummary): Promise<void> {
    const submitted = await this.pool.query<{ id: string; root: string; tx_id: string }>(
      "select id, root, tx_id from anchor_batches where status = 'submitted' order by seq",
    );
    for (const batch of submitted.rows) {
      try {
        const status = await this.adapter.status(batch.tx_id);
        if (status.state === 'pending') {
          continue;
        }
        if (status.state === 'failed') {
          // Resubmit with a fresh transaction on the next tick.
          await this.pool.query(
            "update anchor_batches set status = 'closed', tx_id = null, error = $2 where id = $1",
            [batch.id, status.reason],
          );
          summary.failed += 1;
          continue;
        }
        const event = await this.adapter.getAnchoredEvent(batch.tx_id);
        if (toHex(event.root) !== batch.root) {
          await this.pool.query(
            "update anchor_batches set status = 'failed', error = $2 where id = $1",
            [batch.id, 'on-chain root does not match the stored root'],
          );
          summary.failed += 1;
          continue;
        }
        await this.pool.query(
          `update anchor_batches
              set status = 'confirmed', confirmed_at = now(),
                  block_number = $2, block_time = to_timestamp($3)
            where id = $1`,
          [batch.id, status.blockNumber, status.blockTime],
        );
        summary.confirmed += 1;
      } catch (error) {
        this.onError(error);
      }
    }
  }
}
