# @openpassant/schema

The EU battery passport (LMT scope) as JSON Schema, with generated TypeScript types.

**Status: adopted.** The field list was encoded on 20 September 2026 from primary
sources — the EUR-Lex consolidated text of Regulation (EU) 2023/1542 (13 Aug 2026) and
the Commission's *Digital Batteries Passport — data points by category* guidance v2.0 —
via the extraction in `docs/research/annex-xiii-field-list.md`, and adopted by the
project owner on 23 September 2026 (M0 sign-off). From here on, any hash-relevant change
requires a schema version bump: passport versions anchored under this schema stay
verifiable as issued, forever.

## Contents

- `schemas/battery-passport.schema.json` — JSON Schema draft 2020-12; every top-level
  field carries an `x-section` tag (`public`, `restricted`, `compliance`, `usage` — one
  per Annex XIII point, crypto spec §2). Field descriptions cite their Annex/Article and
  guidance data-point numbers.
- `src/index.ts` — the schema as an importable object, the `Section` type (duplicated
  from `core` by design: this package depends on nothing in the repository), and
  `sectionTags()`, the map the resolver uses to split a passport into section documents.
- `src/types.ts` — **generated**; regenerate with `pnpm --filter @openpassant/schema generate`.
- `test/sample-passport.json` — the hand-written sample e-bike battery passport (the M0
  acceptance criterion); `test/schema.test.ts` validates it, checks tag completeness and
  the section split, and asserts a set of must-reject cases.

## Encoding decisions (adopted with the M0 sign-off; details in the research doc)

- Integers in small units (mAh, mV, W, mΩ, g, °C, months); percentages, C-rate and
  kg CO₂e/kWh as decimal strings (crypto spec §2 number rule).
- Documents are a uniform `documentRef` (title, URL, optional mimeType/sha256).
- An omitted optional field means "not applicable"; there is no separate
  not-applicable-reason mechanism in this version.
- The guidance's declared duplicates (DP 16 material composition, DP 25 rated capacity)
  are modelled once.
- Phase-in fields are optional for LMT: carbon footprint (2028/2030), recycled content
  (2033), due-diligence report (Aug 2027 + the Art. 47 turnover exemption).
- Deliberately excluded: capacity threshold for exhaustion (EV-only), SOCE (EV-only),
  and instructions-for-use — the guidance's "Annex XIII 1(t)" is not in the in-force
  text (pending the Environmental Omnibus).

## Known future revision triggers

The Commission guidance defers unit/format details (chemistry vocabulary, CAS/EC
substance identification, renewable-share methodology) to future updates, and the
Art. 77(9) implementing act (expected Q4 2026) will define legitimate-interest access.
Either may motivate a new schema version; neither changes already-anchored versions.
