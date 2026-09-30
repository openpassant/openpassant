// SPDX-License-Identifier: Apache-2.0
import { CoreError } from './errors.js';
import type { JsonValue } from './types.js';

/**
 * Returns true for objects that carry only their own enumerable data, i.e.
 * plain objects. The check is realm-independent: a plain object's prototype
 * is either null or an object whose own prototype is null (Object.prototype
 * of some realm). Class instances, Dates, Maps etc. are rejected because
 * serialising them as `{}` or via their enumerable keys would silently hash
 * something other than what the caller meant.
 */
function isPlainObject(value: unknown): value is { [k: string]: unknown } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === null || Object.getPrototypeOf(proto) === null;
}

/**
 * Serialises a JSON value per RFC 8785 (JSON Canonicalization Scheme):
 * object members sorted by the UTF-16 code units of their names, numbers in
 * ECMAScript number-to-string form, strings escaped as JSON.stringify does.
 *
 * Fails closed instead of guessing: non-finite numbers throw
 * `CANON_NON_FINITE`; undefined, functions, bigints, symbols and non-plain
 * objects throw `CANON_INVALID_TYPE`.
 *
 * @throws CoreError `CANON_NON_FINITE`, `CANON_INVALID_TYPE`
 */
export function canonicalize(value: JsonValue): string {
  if (value === null) {
    return 'null';
  }
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) {
        throw new CoreError('CANON_NON_FINITE', 'cannot canonicalize a non-finite number');
      }
      // For finite numbers JSON.stringify is the ECMAScript number-to-string
      // algorithm RFC 8785 requires; -0 serialises as "0".
      return JSON.stringify(value);
    case 'string':
      // JSON.stringify escapes exactly as RFC 8785 section 3.2.2.2 requires.
      return JSON.stringify(value);
    case 'object':
      break;
    default:
      throw new CoreError('CANON_INVALID_TYPE', `cannot canonicalize a ${typeof value}`);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  }
  if (!isPlainObject(value)) {
    throw new CoreError('CANON_INVALID_TYPE', 'cannot canonicalize a non-plain object');
  }
  // Array.prototype.sort without a comparator orders by UTF-16 code units,
  // which is the member ordering RFC 8785 section 3.2.3 requires.
  const keys = Object.keys(value).sort();
  const members = keys.map(
    (key) => `${JSON.stringify(key)}:${canonicalize(value[key] as JsonValue)}`,
  );
  return `{${members.join(',')}}`;
}
