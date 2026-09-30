// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { AppError } from '../src/errors.js';
import { buildIdentifier, validateGtin, validateSerial } from '../src/identifiers.js';
import { splitIntoSections } from '../src/sections.js';
import { assertValidModelContent, assertValidPassportContent, deepMerge } from '../src/validate.js';
import { samplePassportContent } from './helpers.js';

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    return (error as AppError).code;
  }
  throw new Error('expected the call to throw');
}

const ENV = {
  BASE_URL: 'https://id.example.com',
  DATABASE_URL: 'postgres://localhost/x',
  ISSUER_API_KEY: 'k',
};

describe('loadConfig', () => {
  it('loads with defaults and normalises a trailing slash', () => {
    const config = loadConfig({ ...ENV, BASE_URL: 'https://id.example.com/' });
    expect(config.baseUrl).toBe('https://id.example.com');
    expect(config.anchorBatchWindowMs).toBe(600000);
    expect(config.anchorBatchMax).toBe(1000);
  });

  it('fails closed on missing and invalid variables', () => {
    expect(codeOf(() => loadConfig({}))).toBe('CONFIG_MISSING');
    expect(codeOf(() => loadConfig({ ...ENV, BASE_URL: 'id.example.com' }))).toBe('CONFIG_INVALID');
    expect(codeOf(() => loadConfig({ ...ENV, BASE_URL: 'https://x.com/path' }))).toBe(
      'CONFIG_INVALID',
    );
    expect(codeOf(() => loadConfig({ ...ENV, ANCHOR_BATCH_MAX: 'ten' }))).toBe('CONFIG_INVALID');
    expect(codeOf(() => loadConfig({ ...ENV, ANCHOR_BATCH_MAX: '0' }))).toBe('CONFIG_INVALID');
  });
});

describe('identifiers', () => {
  it('builds the GS1 Digital Link URL', () => {
    expect(buildIdentifier('https://id.example.com', '09506000134352', 'SN-1')).toBe(
      'https://id.example.com/01/09506000134352/21/SN-1',
    );
  });

  it('rejects bad gtins and serials', () => {
    expect(codeOf(() => validateGtin('123'))).toBe('BAD_IDENTIFIER');
    expect(codeOf(() => validateGtin('123456789012345'))).toBe('BAD_IDENTIFIER');
    expect(codeOf(() => validateGtin('95060001343ab'))).toBe('BAD_IDENTIFIER');
    expect(codeOf(() => validateSerial(''))).toBe('BAD_IDENTIFIER');
    expect(codeOf(() => validateSerial('has space'))).toBe('BAD_IDENTIFIER');
    expect(codeOf(() => validateSerial('x'.repeat(33)))).toBe('BAD_IDENTIFIER');
  });
});

describe('splitIntoSections', () => {
  it('routes every field of the sample to its tagged section, empty sections as {}', () => {
    const content = samplePassportContent();
    const sections = splitIntoSections(content);
    expect(Object.keys(sections)).toEqual(['public', 'restricted', 'compliance', 'usage']);
    expect(sections.public['identification']).toBeDefined();
    expect(sections.compliance['testReports']).toBeDefined();
    const total =
      Object.keys(sections.public).length +
      Object.keys(sections.restricted).length +
      Object.keys(sections.compliance).length +
      Object.keys(sections.usage).length;
    expect(total).toBe(Object.keys(content).length);
  });
});

describe('validation and merging', () => {
  it('accepts the sample and rejects a truncated passport', () => {
    expect(() => assertValidPassportContent(samplePassportContent())).not.toThrow();
    expect(codeOf(() => assertValidPassportContent({ status: 'original' }))).toBe(
      'VALIDATION_FAILED',
    );
    expect(codeOf(() => assertValidPassportContent('nope'))).toBe('VALIDATION_FAILED');
  });

  it('model content must be an object with only known top-level fields', () => {
    expect(() => assertValidModelContent({ characteristics: {} })).not.toThrow();
    expect(codeOf(() => assertValidModelContent({ nope: 1 }))).toBe('VALIDATION_FAILED');
    expect(codeOf(() => assertValidModelContent([]))).toBe('VALIDATION_FAILED');
  });

  it('deepMerge merges objects recursively and replaces arrays, mutating nothing', () => {
    const base = { a: { b: 1, c: [1, 2] }, d: 'x' };
    const overlay = { a: { c: [3] }, e: null };
    const merged = deepMerge(base, overlay);
    expect(merged).toEqual({ a: { b: 1, c: [3] }, d: 'x', e: null });
    expect(base).toEqual({ a: { b: 1, c: [1, 2] }, d: 'x' });
  });
});
