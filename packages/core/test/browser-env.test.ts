// SPDX-License-Identifier: Apache-2.0
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { buildSync } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { loadVectors, runVectorSuite } from './helpers.js';
import type { CoreApi } from './helpers.js';

// Bundle src/ for the browser. esbuild with platform "browser" fails the
// build outright if src imports node: modules, and the bare V8 context
// below has no Buffer, process or require, so any Node-only API that
// leaked into src/ fails this suite.
const bundled = buildSync({
  entryPoints: [fileURLToPath(new URL('../src/index.ts', import.meta.url))],
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'PassantCore',
  platform: 'browser',
  target: 'es2022',
});
const code = bundled.outputFiles[0]!.text;

// Only the two web globals the library is allowed to touch.
const sandbox = vm.createContext({ TextEncoder, crypto: globalThis.crypto });
vm.runInContext(code, sandbox);
const api = vm.runInContext('PassantCore', sandbox) as CoreApi;

describe('test vectors (DOM-free web sandbox)', () => {
  it('sandbox exposes no Node globals', () => {
    expect(vm.runInContext('typeof Buffer', sandbox)).toBe('undefined');
    expect(vm.runInContext('typeof process', sandbox)).toBe('undefined');
    expect(vm.runInContext('typeof require', sandbox)).toBe('undefined');
  });

  it('generateSalt draws 16 fresh bytes from the web CSPRNG', () => {
    const salt = api.generateSalt();
    expect(salt.length).toBe(16);
    expect(api.toHex(salt)).not.toBe(api.toHex(api.generateSalt()));
  });

  runVectorSuite(api, loadVectors());
});
