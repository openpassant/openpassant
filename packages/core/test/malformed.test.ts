// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { computeBundleRoot } from '../src/index.js';
import { loadVectors } from './helpers.js';

const vectors = loadVectors();

/* eslint-disable @typescript-eslint/no-explicit-any -- tests corrupt the bundle shape on purpose */
function corrupted(mutate: (bundle: any) => unknown): unknown {
  const bundle = structuredClone(vectors.bundle_public) as any;
  return mutate(bundle) ?? bundle;
}

function expectFailure(input: unknown, code: string): void {
  const result = computeBundleRoot(input); // must not throw
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.code).toBe(code);
    expect(result.message).toBeTruthy();
  }
}

describe('computeBundleRoot fails closed on malformed input', () => {
  it('null', () => {
    expectFailure(null, 'MALFORMED_BUNDLE');
  });

  it('a string', () => {
    expectFailure('not a bundle', 'MALFORMED_BUNDLE');
  });

  it('an unknown spec', () => {
    expectFailure(
      corrupted((b) => {
        b.spec = 'passant-proof/3';
      }),
      'UNKNOWN_SPEC',
    );
  });

  it('the withdrawn passant-proof/1 spec', () => {
    expectFailure(
      corrupted((b) => {
        b.spec = 'passant-proof/1';
      }),
      'UNKNOWN_SPEC',
    );
  });

  it('a missing section', () => {
    expectFailure(
      corrupted((b) => {
        delete b.sections.usage;
      }),
      'SECTION_MISSING',
    );
  });

  it('a section with both doc and hash', () => {
    expectFailure(
      corrupted((b) => {
        b.sections.public.hash = b.sections.restricted.hash;
      }),
      'SECTION_MALFORMED',
    );
  });

  it('a section with neither doc nor hash', () => {
    expectFailure(
      corrupted((b) => {
        b.sections.public = {};
      }),
      'SECTION_MALFORMED',
    );
  });

  it('uppercase hex', () => {
    expectFailure(
      corrupted((b) => {
        b.sections.restricted.hash = b.sections.restricted.hash.toUpperCase();
      }),
      'BAD_HEX',
    );
  });

  it('0x-prefixed hex', () => {
    expectFailure(
      corrupted((b) => {
        b.sections.restricted.hash = '0x' + b.sections.restricted.hash;
      }),
      'BAD_HEX',
    );
  });

  it('a hash of the wrong length', () => {
    expectFailure(
      corrupted((b) => {
        b.sections.restricted.hash = b.sections.restricted.hash.slice(0, 62);
      }),
      'BAD_LENGTH',
    );
  });

  it('a salt of the wrong length', () => {
    expectFailure(
      corrupted((b) => {
        b.sections.public.salt = b.sections.public.salt + '00';
      }),
      'BAD_LENGTH',
    );
  });
});

describe('computeBundleRoot fails closed on further shape faults', () => {
  it('an unknown top-level member', () => {
    expectFailure(
      corrupted((b) => {
        b.extra = true;
      }),
      'MALFORMED_BUNDLE',
    );
  });

  it('a non-integer bundle version', () => {
    expectFailure(
      corrupted((b) => {
        b.version = 1.5;
      }),
      'MALFORMED_BUNDLE',
    );
  });

  it('a non-string bundle id', () => {
    expectFailure(
      corrupted((b) => {
        b.id = 42;
      }),
      'MALFORMED_BUNDLE',
    );
  });

  it('sections that are not an object', () => {
    expectFailure(
      corrupted((b) => {
        b.sections = [];
      }),
      'MALFORMED_BUNDLE',
    );
  });

  it('a section entry that is not an object', () => {
    expectFailure(
      corrupted((b) => {
        b.sections.compliance = 'hash';
      }),
      'SECTION_MALFORMED',
    );
  });

  it('a doc whose section does not match its key', () => {
    expectFailure(
      corrupted((b) => {
        b.sections.public.doc.section = 'usage';
      }),
      'SECTION_MISMATCH',
    );
  });

  it('a doc with an extra member', () => {
    expectFailure(
      corrupted((b) => {
        b.sections.public.doc.extra = 1;
      }),
      'SECTION_MALFORMED',
    );
  });

  it('a doc whose data is not an object', () => {
    expectFailure(
      corrupted((b) => {
        b.sections.public.doc.data = [1, 2];
      }),
      'SECTION_MALFORMED',
    );
  });

  it('a doc with a non-canonicalisable data value', () => {
    expectFailure(
      corrupted((b) => {
        b.sections.public.doc.data.bad = Number.NaN;
      }),
      'CANON_NON_FINITE',
    );
  });

  it('a merkle member that is not an object', () => {
    expectFailure(
      corrupted((b) => {
        b.merkle = null;
      }),
      'MALFORMED_BUNDLE',
    );
  });

  it('a merkle root of the wrong length', () => {
    expectFailure(
      corrupted((b) => {
        b.merkle.root = b.merkle.root + '00';
      }),
      'BAD_LENGTH',
    );
  });

  it('a path that is not an array', () => {
    expectFailure(
      corrupted((b) => {
        b.merkle.path = {};
      }),
      'BAD_PATH',
    );
  });

  it('a path step with an unknown position', () => {
    expectFailure(
      corrupted((b) => {
        b.merkle.path[0].position = 'up';
      }),
      'BAD_PATH',
    );
  });

  it('a path step with an extra member', () => {
    expectFailure(
      corrupted((b) => {
        b.merkle.path[0].note = 'hi';
      }),
      'BAD_PATH',
    );
  });

  it('a path step hash that is not a string', () => {
    expectFailure(
      corrupted((b) => {
        b.merkle.path[0].hash = 7;
      }),
      'BAD_HEX',
    );
  });

  it('an anchor member of the wrong type', () => {
    expectFailure(
      corrupted((b) => {
        b.anchor.txId = 123;
      }),
      'MALFORMED_BUNDLE',
    );
  });

  it('an anchor with a missing member', () => {
    expectFailure(
      corrupted((b) => {
        delete b.anchor.chain;
      }),
      'MALFORMED_BUNDLE',
    );
  });

  it('a doc that is not an object', () => {
    expectFailure(
      corrupted((b) => {
        b.sections.public.doc = 'doc';
      }),
      'SECTION_MALFORMED',
    );
  });

  it('a path step that is not an object', () => {
    expectFailure(
      corrupted((b) => {
        b.merkle.path[0] = 5;
      }),
      'BAD_PATH',
    );
  });

  it('a hostile object that throws on property access', () => {
    const hostile = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error('trapped');
        },
      },
    );
    const result = computeBundleRoot(hostile); // must not throw
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('INTERNAL');
    }
  });
});
