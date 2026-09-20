// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { canonicalize, CoreError } from '../src/index.js';
import type { JsonValue } from '../src/index.js';

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(CoreError);
    return (error as CoreError).code;
  }
  throw new Error('expected the call to throw');
}

describe('canonicalize edge cases beyond the vectors', () => {
  it('orders keys by UTF-16 code units, not code points or locale', () => {
    // "A" (0x41) < "a" (0x61) < "€" (0x20AC) < "😀" (surrogates 0xD83D 0xDE00)
    const value: JsonValue = { '😀': 2, '€': 1, a: 3, A: 4 };
    expect(canonicalize(value)).toBe('{"A":4,"a":3,"€":1,"😀":2}');
  });

  it('canonicalises nested arrays and objects recursively', () => {
    const value: JsonValue = {
      b: [{ y: 2, x: 1 }, [null, true], []],
      a: { n: { m: [], k: 'v' } },
    };
    expect(canonicalize(value)).toBe(
      '{"a":{"n":{"k":"v","m":[]}},"b":[{"x":1,"y":2},[null,true],[]]}',
    );
  });

  it('escapes quotes, backslashes and control characters as JSON.stringify', () => {
    expect(canonicalize('quote " backslash \\')).toBe('"quote \\" backslash \\\\"');
    expect(canonicalize('\b\t\n\f\r')).toBe('"\\b\\t\\n\\f\\r"');
    expect(canonicalize('\u0000\u001f')).toBe('"\\u0000\\u001f"');
  });

  it('serialises -0 as 0', () => {
    expect(canonicalize(-0)).toBe('0');
    expect(canonicalize({ n: -0 })).toBe('{"n":0}');
  });

  it('serialises numbers with the ECMAScript number-to-string algorithm', () => {
    expect(canonicalize(1e21)).toBe('1e+21');
    expect(canonicalize(1e20)).toBe('100000000000000000000');
    expect(canonicalize(1e-7)).toBe('1e-7');
    expect(canonicalize(0.000001)).toBe('0.000001');
    expect(canonicalize(0.1)).toBe('0.1');
    expect(canonicalize(9007199254740992)).toBe('9007199254740992');
  });

  it('canonicalises the JSON scalars and empty containers', () => {
    expect(canonicalize(null)).toBe('null');
    expect(canonicalize(true)).toBe('true');
    expect(canonicalize(false)).toBe('false');
    expect(canonicalize({})).toBe('{}');
    expect(canonicalize([])).toBe('[]');
  });

  it('rejects NaN and the infinities', () => {
    expect(codeOf(() => canonicalize(Number.NaN))).toBe('CANON_NON_FINITE');
    expect(codeOf(() => canonicalize(Number.POSITIVE_INFINITY))).toBe('CANON_NON_FINITE');
    expect(codeOf(() => canonicalize(Number.NEGATIVE_INFINITY))).toBe('CANON_NON_FINITE');
    expect(codeOf(() => canonicalize({ n: Number.NaN }))).toBe('CANON_NON_FINITE');
  });

  it('rejects values that are not valid JSON', () => {
    expect(codeOf(() => canonicalize(undefined as unknown as JsonValue))).toBe(
      'CANON_INVALID_TYPE',
    );
    expect(codeOf(() => canonicalize((() => 1) as unknown as JsonValue))).toBe(
      'CANON_INVALID_TYPE',
    );
    expect(codeOf(() => canonicalize(10n as unknown as JsonValue))).toBe('CANON_INVALID_TYPE');
    expect(codeOf(() => canonicalize(Symbol('s') as unknown as JsonValue))).toBe(
      'CANON_INVALID_TYPE',
    );
    expect(codeOf(() => canonicalize({ a: undefined } as unknown as JsonValue))).toBe(
      'CANON_INVALID_TYPE',
    );
  });

  it('rejects non-plain objects instead of mis-hashing them', () => {
    expect(codeOf(() => canonicalize(new Date(0) as unknown as JsonValue))).toBe(
      'CANON_INVALID_TYPE',
    );
    expect(codeOf(() => canonicalize(new Map() as unknown as JsonValue))).toBe(
      'CANON_INVALID_TYPE',
    );
  });

  it('accepts objects with a null prototype', () => {
    const value = Object.create(null) as { [k: string]: JsonValue };
    value['b'] = 1;
    value['a'] = 2;
    expect(canonicalize(value)).toBe('{"a":2,"b":1}');
  });
});
