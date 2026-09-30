// SPDX-License-Identifier: Apache-2.0
import batteryPassportSchemaJson from '../schemas/battery-passport.schema.json' with { type: 'json' };

/**
 * `@openpassant/schema` — the EU battery passport as JSON Schema, every
 * top-level field tagged with its Annex XIII content section, plus
 * TypeScript types generated from it.
 *
 * The field list is encoded from the primary-source extraction in
 * `docs/research/annex-xiii-field-list.md` and was adopted by the project
 * owner on 2026-09-23 (M0 sign-off). Changing anything hash-relevant from
 * here on requires a schema version bump; anchored versions are permanent.
 */

/**
 * A content section of a passport version (crypto spec section 2), one per
 * Annex XIII point. Duplicated from `core` by design: `schema` depends on
 * nothing in this repository.
 */
export type Section = 'public' | 'restricted' | 'compliance' | 'usage';

/** The four content sections in the crypto spec's fixed order. */
export const SECTIONS: readonly Section[] = ['public', 'restricted', 'compliance', 'usage'];

/**
 * Error thrown by this package. `code` is stable API; `message` is
 * human-readable detail and not part of the contract.
 */
export class SchemaError extends Error {
  /** Stable machine-readable error code. */
  readonly code: 'BAD_SECTION_TAG';

  constructor(code: 'BAD_SECTION_TAG', message: string) {
    super(message);
    this.name = 'SchemaError';
    this.code = code;
  }
}

/**
 * The battery passport JSON Schema (draft 2020-12) as a plain object,
 * ready to hand to a validator. The canonical file is
 * `schemas/battery-passport.schema.json`.
 */
export const batteryPassportSchema: Record<string, unknown> = batteryPassportSchemaJson;

/**
 * Returns the content section of every top-level passport field, read from
 * the schema's `x-section` tags. The resolver uses this map to split a
 * passport into its four section documents.
 *
 * @throws SchemaError `BAD_SECTION_TAG` if any top-level field lacks a
 *   valid tag — a malformed schema must never split silently.
 */
export function sectionTags(): Readonly<Record<string, Section>> {
  const properties = (
    batteryPassportSchemaJson as unknown as {
      properties: Record<string, { 'x-section'?: unknown }>;
    }
  ).properties;
  const tags: Record<string, Section> = {};
  for (const [field, definition] of Object.entries(properties)) {
    const tag = definition['x-section'];
    if (tag !== 'public' && tag !== 'restricted' && tag !== 'compliance' && tag !== 'usage') {
      throw new SchemaError('BAD_SECTION_TAG', `field "${field}" has no valid x-section tag`);
    }
    tags[field] = tag;
  }
  return tags;
}

export type { BatteryPassport } from './types.js';
