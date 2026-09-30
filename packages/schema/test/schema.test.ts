// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import { batteryPassportSchema, SECTIONS, sectionTags } from '../src/index.js';
import type { BatteryPassport, Section } from '../src/index.js';

function loadSample(): BatteryPassport {
  const url = new URL('./sample-passport.json', import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as BatteryPassport;
}

function makeValidator() {
  const ajv = new Ajv2020.default({ strict: true, allErrors: true });
  addFormats.default(ajv);
  // x-section is this project's own annotation keyword (crypto spec section 2).
  ajv.addKeyword({
    keyword: 'x-section',
    schemaType: 'string',
    metaSchema: { enum: [...SECTIONS] },
  });
  return ajv.compile(batteryPassportSchema);
}

const validate = makeValidator();
const sample = loadSample();

describe('battery passport schema', () => {
  it('compiles under ajv 2020 strict mode', () => {
    expect(typeof validate).toBe('function');
  });

  it('validates the hand-written sample e-bike battery passport (M0 acceptance)', () => {
    const ok = validate(sample);
    expect(validate.errors ?? []).toEqual([]);
    expect(ok).toBe(true);
  });

  it('tags every top-level field with a valid section, and uses all four', () => {
    const tags = sectionTags();
    const properties = Object.keys(
      (batteryPassportSchema as { properties: Record<string, unknown> }).properties,
    );
    expect(Object.keys(tags).sort()).toEqual([...properties].sort());
    for (const tag of Object.values(tags)) {
      expect(SECTIONS).toContain(tag);
    }
    const used = new Set(Object.values(tags));
    expect([...SECTIONS].every((section) => used.has(section))).toBe(true);
  });

  it('keeps phase-in fields optional: the sample omits them and still validates', () => {
    expect(sample).not.toHaveProperty('carbonFootprint');
    expect(sample).not.toHaveProperty('dueDiligenceReport');
    expect(sample).not.toHaveProperty('recycledContent');
  });
});

describe('battery passport schema rejects', () => {
  function invalid(mutate: (p: Record<string, unknown>) => void): boolean {
    const copy = structuredClone(sample) as unknown as Record<string, unknown>;
    mutate(copy);
    return validate(copy) === false;
  }

  it('an unknown top-level field', () => {
    expect(
      invalid((p) => {
        p['instructionsForUse'] = 'not in force (no Annex XIII 1(t) yet)';
      }),
    ).toBe(true);
  });

  it('a missing required field', () => {
    expect(
      invalid((p) => {
        delete p['wasteManagement'];
      }),
    ).toBe(true);
  });

  it('a status outside the regulation enum (unhyphenated "reused")', () => {
    expect(
      invalid((p) => {
        p['status'] = 'reused';
      }),
    ).toBe(true);
  });

  it('a percentage given as a number instead of a decimal string', () => {
    expect(
      invalid((p) => {
        p['renewableContentSharePct'] = 4.5 as unknown as string;
      }),
    ).toBe(true);
  });

  it('an uppercase document sha256', () => {
    expect(
      invalid((p) => {
        const doc = p['euDeclarationOfConformity'] as { sha256: string };
        doc.sha256 = doc.sha256.toUpperCase();
      }),
    ).toBe(true);
  });

  it('a non-LMT battery category', () => {
    expect(
      invalid((p) => {
        (p['identification'] as { batteryCategory: string }).batteryCategory = 'ev';
      }),
    ).toBe(true);
  });

  it('a manufacture date that is not YYYY-MM', () => {
    expect(
      invalid((p) => {
        (p['manufacturing'] as { date: string }).date = '2027-3';
      }),
    ).toBe(true);
  });
});

describe('section split of the sample', () => {
  it('routes every sample field to its section', () => {
    const tags = sectionTags();
    const bySection: Record<Section, string[]> = {
      public: [],
      restricted: [],
      compliance: [],
      usage: [],
    };
    for (const field of Object.keys(sample)) {
      bySection[tags[field]!].push(field);
    }
    expect(bySection.public).toContain('identification');
    expect(bySection.restricted).toEqual(
      expect.arrayContaining([
        'detailedComposition',
        'spareParts',
        'dismantling',
        'safetyMeasures',
      ]),
    );
    expect(bySection.compliance).toEqual(['testReports']);
    expect(bySection.usage).toEqual(
      expect.arrayContaining(['performanceValues', 'stateOfHealth', 'status', 'usageData']),
    );
  });
});
