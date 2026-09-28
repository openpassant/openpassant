// SPDX-License-Identifier: Apache-2.0
import { SECTIONS } from '@openpassant/schema';
import type { Section } from '@openpassant/schema';
import type pg from 'pg';
import type { JsonObject } from '../validate.js';

/** One stored section as served to the resolver. */
export interface SectionView {
  doc: { id: string; version: number; section: Section; data: JsonObject };
  salt: string;
  hash: string;
}

/** Anchoring state of a version, when its batch has been submitted. */
export interface AnchorView {
  path: { position: 'left' | 'right'; hash: string }[];
  root: string;
  status: string;
  chain: string | null;
  contract: string | null;
  txId: string | null;
  blockTime: string | null;
}

/** Everything the resolver needs about one passport version. */
export interface VersionView {
  passportId: string;
  serialNumber: string;
  modelName: string;
  version: number;
  latestVersion: number;
  reason: string;
  createdAt: string;
  leafHash: string;
  sections: Record<Section, SectionView>;
  anchor: AnchorView | null;
}

/**
 * Loads one passport version for the resolver: section documents parsed
 * from the exact canonical bytes that were hashed, plus the version's
 * audit path and batch state when it has one. Returns null when the
 * passport or version does not exist — the resolver answers a uniform 404
 * either way (enumeration resistance).
 */
export async function getVersionView(
  pool: pg.Pool,
  passportId: string,
  version?: number,
): Promise<VersionView | null> {
  const passport = await pool.query<{
    serial_number: string;
    model_name: string;
    latest: number | null;
  }>(
    `select p.serial_number, m.name as model_name,
            (select max(version) from passport_versions v where v.passport_id = p.id) as latest
       from passports p join battery_models m on m.id = p.model_id
      where p.id = $1`,
    [passportId],
  );
  if (passport.rowCount === 0 || passport.rows[0]!.latest === null) {
    return null;
  }
  const latestVersion = passport.rows[0]!.latest;
  const wanted = version ?? latestVersion;

  const row = await pool.query(
    'select * from passport_versions where passport_id = $1 and version = $2',
    [passportId, wanted],
  );
  if (row.rowCount === 0) {
    return null;
  }
  const record = row.rows[0] as Record<string, string>;
  const sections = Object.fromEntries(
    SECTIONS.map((section) => [
      section,
      {
        doc: JSON.parse(record[`${section}_canonical`]!) as SectionView['doc'],
        salt: record[`${section}_salt`]!,
        hash: record[`${section}_hash`]!,
      },
    ]),
  ) as Record<Section, SectionView>;

  const anchorRow = await pool.query(
    `select pr.path, pr.root, b.status, b.chain, b.contract, b.tx_id, b.block_time
       from anchor_proofs pr join anchor_batches b on b.id = pr.batch_id
      where pr.passport_id = $1 and pr.version = $2`,
    [passportId, wanted],
  );
  // pg returns timestamptz columns as Date objects; the view speaks strings.
  const rawAnchor = anchorRow.rows[0] as
    | {
        path: AnchorView['path'];
        root: string;
        status: string;
        chain: string | null;
        contract: string | null;
        tx_id: string | null;
        block_time: Date | null;
      }
    | undefined;
  const anchor =
    rawAnchor === undefined
      ? null
      : {
          path: rawAnchor.path,
          root: rawAnchor.root,
          status: rawAnchor.status,
          chain: rawAnchor.chain,
          contract: rawAnchor.contract,
          txId: rawAnchor.tx_id,
          blockTime: rawAnchor.block_time === null ? null : rawAnchor.block_time.toISOString(),
        };

  return {
    passportId,
    serialNumber: passport.rows[0]!.serial_number,
    modelName: passport.rows[0]!.model_name,
    version: wanted,
    latestVersion,
    reason: record['reason']!,
    createdAt: new Date(record['created_at'] as unknown as string | Date).toISOString(),
    leafHash: record['leaf_hash']!,
    sections,
    anchor,
  };
}

/**
 * Assembles the exact `passant-proof/2` bundle of crypto spec section 5
 * for a version whose batch is confirmed: the public section disclosed as
 * doc + salt, the other three as bare hashes. Returns null until the
 * batch is confirmed — a proof must never point at an anchor that is not
 * on the chain yet.
 */
export function assembleBundle(view: VersionView): JsonObject | null {
  const { anchor } = view;
  if (
    anchor === null ||
    anchor.status !== 'confirmed' ||
    anchor.chain === null ||
    anchor.contract === null ||
    anchor.txId === null
  ) {
    return null;
  }
  return {
    spec: 'passant-proof/2',
    id: view.passportId,
    version: view.version,
    sections: {
      public: {
        doc: view.sections.public.doc as unknown as JsonObject,
        salt: view.sections.public.salt,
      },
      restricted: { hash: view.sections.restricted.hash },
      compliance: { hash: view.sections.compliance.hash },
      usage: { hash: view.sections.usage.hash },
    },
    merkle: {
      path: anchor.path as unknown as JsonObject[],
      root: anchor.root,
    },
    anchor: {
      chain: anchor.chain,
      contract: anchor.contract,
      txId: anchor.txId,
    },
  } as unknown as JsonObject;
}
