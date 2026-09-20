// SPDX-License-Identifier: Apache-2.0
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    // Handover artefacts (design system, static sites, docs) are not linted.
    ignores: ['**/node_modules/', '**/dist/', '**/coverage/', 'design/', 'sites/', 'docs/'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
);
