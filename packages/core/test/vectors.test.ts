// SPDX-License-Identifier: Apache-2.0
import { describe } from 'vitest';
import * as api from '../src/index.js';
import { loadVectors, runVectorSuite } from './helpers.js';

describe('test vectors (Node)', () => {
  runVectorSuite(api, loadVectors());
});
