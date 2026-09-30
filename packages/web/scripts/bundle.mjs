// SPDX-License-Identifier: Apache-2.0
// Bundles the verifier (src/main.ts + core) into a single browser IIFE.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
await build({
  entryPoints: [`${root}src/main.ts`],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  outfile: `${root}dist/verifier.js`,
  banner: { js: '/* SPDX-License-Identifier: Apache-2.0 — OpenPassant in-browser verifier */' },
});
console.log('bundled dist/verifier.js');
