// SPDX-License-Identifier: Apache-2.0
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { batteryPassportSchema, SECTIONS } from '@openpassant/schema';
import type { JsonValue } from '@openpassant/core';
import { AppError } from './errors.js';

const ajv = new Ajv2020.default({ strict: true, allErrors: true });
addFormats.default(ajv);
ajv.addKeyword({
  keyword: 'x-section',
  schemaType: 'string',
  metaSchema: { enum: [...SECTIONS] },
});
const validateContent = ajv.compile(batteryPassportSchema);

/** A JSON object, as passport contents are at every level. */
export type JsonObject = { [k: string]: JsonValue };

/** Realm-safe plain-object check (mirrors core's; see its rationale). */
export function isPlainObject(value: unknown): value is JsonObject {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === null || Object.getPrototypeOf(proto) === null;
}

/**
 * Validates full passport content against the battery passport schema.
 * @throws AppError `VALIDATION_FAILED` carrying the first schema error.
 */
export function assertValidPassportContent(content: unknown): asserts content is JsonObject {
  if (!validateContent(content)) {
    const first = validateContent.errors?.[0];
    const where = first?.instancePath || '(root)';
    throw new AppError(
      'VALIDATION_FAILED',
      400,
      `passport content invalid at ${where}: ${first?.message ?? 'schema violation'}`,
    );
  }
}

const SCHEMA_FIELDS = new Set(
  Object.keys((batteryPassportSchema as { properties: Record<string, unknown> }).properties),
);

/**
 * Validates battery-model content: a plain object whose top-level fields
 * are a subset of the passport schema's fields. Full validation happens at
 * mint time, after merging with the per-unit data — a model alone is
 * legitimately incomplete (it has no serial number or unit values).
 * @throws AppError `VALIDATION_FAILED`
 */
export function assertValidModelContent(content: unknown): asserts content is JsonObject {
  if (!isPlainObject(content)) {
    throw new AppError('VALIDATION_FAILED', 400, 'model content must be a JSON object');
  }
  for (const key of Object.keys(content)) {
    if (!SCHEMA_FIELDS.has(key)) {
      throw new AppError('VALIDATION_FAILED', 400, `model content has unknown field "${key}"`);
    }
  }
}

/**
 * Deep-merges JSON objects: objects merge recursively, everything else
 * (arrays included) is replaced by the later value. Inputs are not mutated.
 */
export function deepMerge(base: JsonObject, overlay: JsonObject): JsonObject {
  const out: JsonObject = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    const existing = out[key];
    if (isPlainObject(existing) && isPlainObject(value)) {
      out[key] = deepMerge(existing, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}
