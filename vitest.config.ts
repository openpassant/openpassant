// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'packages/core/src/**',
        'packages/server/src/**',
        'packages/adapter-vechain/src/**',
        'packages/web/src/**',
      ],
      // The listen entry point is not exercised by tests.
      exclude: ['packages/server/src/server.ts'],
      thresholds: {
        'packages/core/src/**': {
          statements: 95,
          branches: 95,
        },
        'packages/server/src/**': {
          statements: 85,
          branches: 85,
        },
        'packages/adapter-vechain/src/**': {
          statements: 85,
          branches: 85,
        },
        'packages/web/src/**': {
          statements: 85,
          branches: 85,
        },
      },
    },
  },
});
