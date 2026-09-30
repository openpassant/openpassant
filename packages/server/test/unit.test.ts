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

  describe('VeChain block (acceptance criterion 5: refuses non-testnet)', () => {
    const KEY = '0x' + 'ab'.repeat(32);
    const VECHAIN = {
      VECHAIN_NODE_URL: 'https://testnet.vechain.org',
      VECHAIN_NETWORK: 'testnet',
      VECHAIN_CONTRACT_ADDRESS: '0x' + '12'.repeat(20),
      OPERATOR_PRIVATE_KEY: KEY,
      SPONSOR_PRIVATE_KEY: KEY,
    };

    it('is absent when no VECHAIN_* variable is set', () => {
      expect(loadConfig(ENV).vechain).toBeUndefined();
    });

    it('loads a complete testnet block', () => {
      const config = loadConfig({ ...ENV, ...VECHAIN });
      expect(config.vechain?.nodeUrl).toBe('https://testnet.vechain.org');
      expect(config.vechain?.contractAddress).toBe('0x' + '12'.repeat(20));
    });

    it('refuses mainnet and anything that is not testnet or solo', () => {
      for (const network of ['mainnet', 'main', 'MAINNET', 'TESTNET', 'devnet']) {
        expect(codeOf(() => loadConfig({ ...ENV, ...VECHAIN, VECHAIN_NETWORK: network }))).toBe(
          'CONFIG_INVALID',
        );
      }
    });

    it('accepts solo (local development chain) with an optional contract', () => {
      const solo = loadConfig({ ...ENV, ...VECHAIN, VECHAIN_NETWORK: 'solo' });
      expect(solo.vechain?.network).toBe('solo');
      const withoutContract: Record<string, string> = { ...VECHAIN };
      delete withoutContract['VECHAIN_CONTRACT_ADDRESS'];
      const auto = loadConfig({ ...ENV, ...withoutContract, VECHAIN_NETWORK: 'solo' });
      expect(auto.vechain?.contractAddress).toBeNull();
      // On testnet the contract stays required.
      expect(
        codeOf(() => loadConfig({ ...ENV, ...withoutContract, VECHAIN_NETWORK: 'testnet' })),
      ).toBe('CONFIG_MISSING');
    });

    it('separates the browser-facing node URL from the server-facing one', () => {
      const config = loadConfig({
        ...ENV,
        ...VECHAIN,
        VECHAIN_NODE_URL: 'http://thor-solo:8669',
        VECHAIN_NETWORK: 'solo',
        VECHAIN_PUBLIC_NODE_URL: 'http://localhost:8669',
      });
      expect(config.vechain?.nodeUrl).toBe('http://thor-solo:8669');
      expect(config.vechain?.publicNodeUrl).toBe('http://localhost:8669');
      expect(loadConfig({ ...ENV, ...VECHAIN }).vechain?.publicNodeUrl).toBe(
        'https://testnet.vechain.org',
      );
      expect(
        codeOf(() => loadConfig({ ...ENV, ...VECHAIN, VECHAIN_PUBLIC_NODE_URL: 'nope' })),
      ).toBe('CONFIG_INVALID');
    });

    it('is all-or-nothing: a partial block fails closed', () => {
      expect(
        codeOf(() => loadConfig({ ...ENV, VECHAIN_NODE_URL: 'https://testnet.vechain.org' })),
      ).toBe('CONFIG_MISSING');
    });

    it('rejects malformed keys and addresses without echoing values', () => {
      const badKey = codeOfWithMessage(() =>
        loadConfig({ ...ENV, ...VECHAIN, OPERATOR_PRIVATE_KEY: '0xnope' }),
      );
      expect(badKey.code).toBe('CONFIG_INVALID');
      expect(badKey.message).not.toContain('nope');
      expect(
        codeOf(() => loadConfig({ ...ENV, ...VECHAIN, VECHAIN_CONTRACT_ADDRESS: '0x123' })),
      ).toBe('CONFIG_INVALID');
      expect(codeOf(() => loadConfig({ ...ENV, ...VECHAIN, VECHAIN_NODE_URL: 'ftp://x' }))).toBe(
        'CONFIG_INVALID',
      );
    });
  });
});

function codeOfWithMessage(fn: () => unknown): { code: string; message: string } {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    return { code: (error as AppError).code, message: (error as AppError).message };
  }
  throw new Error('expected the call to throw');
}

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
