// SPDX-License-Identifier: Apache-2.0
// Regenerates src/types.ts from schemas/battery-passport.schema.json.
import { writeFileSync } from 'node:fs';
import { compileFromFile } from 'json-schema-to-typescript';

const banner =
  '// SPDX-License-Identifier: Apache-2.0\n' +
  '// Generated from schemas/battery-passport.schema.json by json-schema-to-typescript.\n' +
  '// Do not edit by hand; run: pnpm --filter @openpassant/schema generate\n';

const ts = await compileFromFile('schemas/battery-passport.schema.json', {
  bannerComment: banner,
  additionalProperties: false,
});
writeFileSync('src/types.ts', ts);
console.log('generated src/types.ts');
