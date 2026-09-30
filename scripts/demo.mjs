// SPDX-License-Identifier: Apache-2.0
// Seeds the demo data set (M5): one battery model and a batch of 100
// passports with clearly fictitious data, waits for the anchor, verifies
// one passport the way a browser would, and saves a printable QR sheet.
// Idempotent: re-running against a seeded server changes nothing.
//
//   SERVER_URL=http://localhost:3000 ISSUER_API_KEY=... node scripts/demo.mjs
// or from the repo root, with .env in place:  pnpm demo
import { mkdirSync, writeFileSync } from 'node:fs';

const SERVER_URL = (process.env.SERVER_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const API_KEY = process.env.ISSUER_API_KEY;
if (!API_KEY) {
  console.error('ISSUER_API_KEY must be set (it is read from .env via pnpm demo)');
  process.exit(1);
}
const AUTH = { authorization: `Bearer ${API_KEY}`, 'content-type': 'application/json' };
const GTIN = '09506000134369'; // GS1 demo range, distinct from the tests
const SERIALS = Array.from({ length: 100 }, (_, i) => `DEMO-${String(i + 1).padStart(4, '0')}`);

async function api(method, path, body) {
  const response = await fetch(`${SERVER_URL}${path}`, {
    method,
    headers: AUTH,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => null), raw: response };
}

// --- model (fictitious; Volta Cycles is a made-up brand) -------------------
const model = {
  gtin: GTIN,
  name: 'Volta Cycles Urban 504 (demo)',
  content: {
    identification: {
      batteryCategory: 'lmt',
      modelId: 'URB-504-DEMO',
      responsibleOperator: { name: 'Volta Cycles GmbH (fictitious demo data)' },
    },
    manufacturer: {
      name: 'Volta Cycles GmbH',
      postalAddress: 'Beispielstrasse 12, 10115 Berlin, Germany',
    },
    manufacturing: { place: 'Poznan, Poland', date: '2027-03' },
    characteristics: {
      weightG: 2800,
      ratedCapacityMah: 14000,
      chemistry: 'Li-ion NMC 811',
      extinguishingAgent: 'Water mist; class D powder',
    },
    hazardousSubstances: [],
    criticalRawMaterials: ['cobalt', 'lithium', 'natural graphite', 'nickel'],
    renewableContentSharePct: '4.5',
    electrical: {
      voltageMinMv: 30000,
      voltageNominalMv: 36000,
      voltageMaxMv: 42000,
      powerCapabilityW: 500,
    },
    performance: {
      expectedLifetimeCycles: 800,
      lifetimeReferenceTest: 'IEC 61960-3:2017',
      initialRoundTripEfficiencyPct: '96',
      roundTripEfficiencyAtHalfCycleLifePct: '92.5',
      internalResistance: { cellMohm: 25, packMohm: 60 },
      cycleLifeTestCRate: '0.5',
      storageTemperatureRangeC: { minC: -20, maxC: 45 },
      storageTemperatureReferenceTest: 'IEC 62619:2022',
    },
    markings: { symbols: ['separate_collection'] },
    euDeclarationOfConformity: {
      title: 'EU declaration of conformity URB-504 (demo)',
      url: 'https://voltacycles.example/docs/doc-urb-504.pdf',
    },
    wasteManagement: {
      preventionRole: 'Charge between 20 and 80 percent and store cool to extend battery life.',
      separateCollectionRole: 'Never dispose of this battery in household waste.',
      collectionPoints: 'Any dealer and municipal collection point takes the battery back.',
      safetyInstructions: 'Do not open, crush or heat; hand damaged packs in promptly.',
      labelMeanings: 'The crossed-out wheeled bin means separate collection is required.',
      substanceImpacts: 'Nickel, cobalt and lithium compounds can harm health if released.',
    },
    detailedComposition: {
      cathodeMaterials: ['LiNi0.8Mn0.1Co0.1O2'],
      anodeMaterials: ['graphite'],
      electrolyteMaterials: ['LiPF6 in EC/DMC'],
    },
    spareParts: {
      components: [{ component: 'Battery management system', partNumber: 'BMS-504-A' }],
      suppliers: [{ name: 'Volta Cycles service', contact: 'parts@voltacycles.example' }],
    },
    dismantling: {
      explodedDiagrams: [
        { title: 'URB-504 exploded view', url: 'https://voltacycles.example/docs/exploded.pdf' },
      ],
      disassemblySequences: ['Remove casing screws (T20)', 'Disconnect BMS', 'Lift cell stack'],
      fasteners: [{ type: 'Torx T20 screw', count: 8 }],
      tools: ['Torx T20 driver'],
      warnings: ['Do not puncture the pouch cells.'],
      cellCount: 40,
      cellLayout: '10s4p',
    },
    safetyMeasures: { instructions: 'Discharge below 30 percent before dismantling.' },
    testReports: [
      {
        subject: 'Safety (Article 12, Annex V)',
        report: { title: 'Safety test (demo)', url: 'https://voltacycles.example/docs/safety.pdf' },
      },
    ],
    performanceValues: {
      capacityFadePct: '0',
      powerW: 500,
      powerFadePct: '0',
      internalResistanceMohm: 60,
      internalResistanceIncreasePct: '0',
      expectedLifetimeCycles: 800,
      expectedLifetimeCalendarYears: 8,
    },
    stateOfHealth: { remainingCapacityMah: 14000 },
    status: 'original',
  },
};

console.log(`seeding demo data against ${SERVER_URL} ...`);
let modelId;
const created = await api('POST', '/models', model);
if (created.status === 201) {
  modelId = created.body.id;
  console.log(`model created: ${modelId}`);
} else if (created.status === 409) {
  // Already seeded: recover the model id from the registry export.
  const exported = await api('GET', '/passports:registry-export');
  const known = exported.body?.pending?.find((p) => p.gtin === GTIN);
  if (known === undefined) {
    console.error('model exists but no demo passports found; delete the demo model or database');
    process.exit(1);
  }
  console.log('demo model already exists; reusing it');
} else {
  console.error('model creation failed:', created.status, JSON.stringify(created.body));
  process.exit(1);
}

if (modelId !== undefined) {
  const minted = await api('POST', '/passports:batch', {
    modelId,
    serials: SERIALS,
    reason: 'demo data set',
  });
  if (minted.status === 201) {
    console.log(`minted ${minted.body.count} passports`);
  } else if (minted.status === 409) {
    console.log('passports already minted; nothing to do');
  } else {
    console.error('minting failed:', minted.status, JSON.stringify(minted.body));
    process.exit(1);
  }
}

// --- wait for the anchor ----------------------------------------------------
const firstPath = `/01/${GTIN}/21/${SERIALS[0]}`;
console.log('waiting for the batch to be anchored (up to ~12 minutes on default settings) ...');
let bundle = null;
for (let i = 0; i < 300; i++) {
  const proof = await fetch(`${SERVER_URL}${firstPath}/proof`);
  if (proof.ok) {
    bundle = await proof.json();
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 3000));
}
if (bundle === null) {
  console.error('the batch was not anchored in time; check the server logs');
  process.exit(1);
}
console.log(`anchored on ${bundle.anchor.chain}`);
console.log(`  registry : ${bundle.anchor.contract}`);
console.log(`  tx       : ${bundle.anchor.txId}`);
if (bundle.anchor.chain === 'vechain:testnet') {
  console.log(
    `  explorer : https://explore-testnet.vechain.org/transactions/${bundle.anchor.txId}`,
  );
}

// --- verify one passport exactly like the browser does ----------------------
const { verifyPassport } = await import(
  new URL('../packages/web/dist/types/verify.js', import.meta.url).href
);
const nodeUrl =
  process.env.VECHAIN_PUBLIC_NODE_URL ||
  process.env.VECHAIN_NODE_URL ||
  'https://testnet.vechain.org';
const result = await verifyPassport(`${SERVER_URL}${firstPath}/proof`, nodeUrl);
if (result.status !== 'verified') {
  console.error('verification FAILED:', JSON.stringify(result));
  process.exit(1);
}
console.log(`VERIFIED against the ledger (sender ${result.sender})`);

// --- QR sheet ----------------------------------------------------------------
const exportList = await api('GET', '/passports:registry-export');
const anyDemo = exportList.body?.pending?.find((p) => p.gtin === GTIN);
if (modelId === undefined && anyDemo !== undefined) {
  // Recover the model id via the passport read (it carries modelId).
  const read = await api('GET', `/passports/${encodeURIComponent(anyDemo.uniqueIdentifier)}`);
  modelId = read.body?.modelId;
}
if (modelId !== undefined) {
  const sheet = await fetch(`${SERVER_URL}/models/${modelId}/qr-sheet.svg`, { headers: AUTH });
  if (sheet.ok) {
    mkdirSync('demo-out', { recursive: true });
    writeFileSync('demo-out/qr-sheet.svg', await sheet.text());
    console.log('QR sheet saved to demo-out/qr-sheet.svg');
  }
}

console.log('\ndemo passports live at:');
for (const serial of SERIALS.slice(0, 3)) {
  console.log(`  ${SERVER_URL}/01/${GTIN}/21/${serial}`);
}
console.log(`  ... and 97 more (DEMO-0004 .. DEMO-0100)`);
