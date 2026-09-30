// SPDX-License-Identifier: Apache-2.0

/**
 * `@openpassant/server` — the Passant issuing API: battery models, batch
 * minting, append-only passport versions hashed per section via `core`,
 * the anchor queue, and the EU DPP registry hook.
 */

export { buildApp } from './app.js';
export { loadConfig } from './config.js';
export type { Config } from './config.js';
export { createPool, withTransaction } from './db.js';
export { migrate } from './migrate.js';
export { AppError } from './errors.js';
export type { AppErrorCode } from './errors.js';
export { buildIdentifier, validateGtin, validateSerial } from './identifiers.js';
export { splitIntoSections } from './sections.js';
export { createVersion } from './versions.js';
export type { StoredVersion } from './versions.js';
export { NoopAnchorAdapter } from './anchoring/adapter.js';
export type {
  AnchorAdapter,
  AnchorReceipt,
  AnchorStatus,
  AnchoredEvent,
} from './anchoring/adapter.js';
export { AnchorScheduler } from './anchoring/scheduler.js';
export type { SchedulerOptions, TickSummary } from './anchoring/scheduler.js';
export { assertValidPassportContent, assertValidModelContent, deepMerge } from './validate.js';
