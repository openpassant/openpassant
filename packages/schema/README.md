# @openpassant/schema

The EU battery passport as JSON Schema, with generated TypeScript types. **Owner-written
(milestone M0); this package is currently an empty scaffold.**

What belongs here when M0 is done:

- `schemas/battery-passport.schema.json` — the field list from Annex XIII of Regulation
  (EU) 2023/1542, every field tagged with its content section (`public`, `restricted`,
  `compliance`, `usage` — one per Annex XIII point, see `docs/crypto-spec.md` section 2).
  Fields whose obligations phase in later (due-diligence report info, carbon footprint per
  the Article 7 timetable) are optional.
- `src/` — generated TypeScript types and any tag-lookup helpers. No Node-only APIs; this
  package, like `core`, must run unchanged in the browser.
- `test/` — at least: one hand-written sample e-bike battery passport that validates
  against the schema (the M0 acceptance criterion), and a check that every field carries
  a valid section tag.

Constraints from the crypto spec (section 2): measured quantities are integers in a small
unit (watt-hours, not kilowatt-hours) or decimal strings, never floats that risk number
canonicalisation edge cases.

Sources to draft from: the EUR-Lex consolidated text of 13 August 2026 (CELEX
02023R1542-20260813), the Commission's battery-passport guidance of 21 August 2026, and
DIN DKE SPEC 99100 v1.3 — see `docs/research/regulation-2023-1542-verification.md`.

This package depends on nothing in the repository; `core`, `server` and `web` may depend
on it.
