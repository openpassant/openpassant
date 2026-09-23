# Annex XIII field list: extraction for the M0 schema draft

Researched 2026-09-20 from primary sources, as the basis for `packages/schema`. The
schema draft encodes this material; **owner verification against these sources is the M0
gate** before the schema is frozen.

Sources:

- **[S1]** EUR-Lex consolidated Regulation (EU) 2023/1542, CELEX 02023R1542-20260813
  (13 Aug 2026): https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:02023R1542-20260813
- **[S2]** European Commission, DG GROW, *Guidance Document: Digital Batteries Passport –
  data points by category*, v2.0, 15 Aug 2026 (published 21 Aug 2026; 71 data points;
  the guidance itself is non-authoritative):
  https://single-market-economy.ec.europa.eu/news/guidance-support-preparations-digital-batteries-passport-2026-08-21_en

## Annex XIII structure (near-verbatim from [S1])

### Point 1 — publicly accessible, battery model level → section `public`

(a) the information specified in Part A of Annex VI (see below); (b) material
composition: chemistry, hazardous substances other than Hg/Cd/Pb, critical raw
materials; (c) carbon footprint information per Art. 7(1)–(2); (d) responsible-sourcing
information from the Art. 52(3) due-diligence report; (e) recycled content per Art. 8(1)
documentation (% recovered Co, Li, Ni in active materials; recovered Pb in the battery);
(f) share of renewable content; (g) rated capacity (Ah); (h) minimal, nominal and
maximum voltage, with temperature ranges when relevant; (i) original power capability
(W) and limits, with temperature range when relevant; (j) expected battery lifetime in
cycles, and reference test used; (k) capacity threshold for exhaustion **(only for EV
batteries)**; (l) temperature range the battery can withstand when not in use (reference
test); (m) period of the commercial warranty for the calendar life; (n) initial round
trip energy efficiency and at 50 % of cycle-life; (o) internal battery cell and pack
resistance; (p) c-rate of relevant cycle-life test; (q) marking requirements of
Art. 13(4) (separate collection) and 13(5) (Cd/Pb symbols); (r) the EU declaration of
conformity (Art. 18); (s) waste prevention and management information per
Art. 74(1)(a)–(f).

**No point 1(t) exists in the in-force text.** The guidance's DP 44 ("printable
instructions for use", cited as "1(t)") anticipates the pending Environmental Omnibus
amendment and is explicitly on hold. The schema draft excludes it.

Annex VI Part A (via 1(a)): 1. manufacturer identity per Art. 38(7) (name, trade
name/mark, postal address, single contact point, web/email if available); 2. battery
category and identification per Art. 38(6) (model identification and batch or serial
number, or product number or other identifier); 3. place of manufacture; 4. date of
manufacture (month and year); 5. weight; 6. capacity; 7. chemistry; 8. hazardous
substances other than Hg/Cd/Pb; 9. usable extinguishing agent; 10. critical raw
materials in concentration above 0,1 % w/w.

### Point 2 — legitimate interest + Commission, model level → section `restricted`

(a) detailed composition, including materials used in the cathode, anode and
electrolyte; (b) part numbers for components and contact details of sources for
replacement spares; (c) dismantling information, at least: exploded diagrams showing
cell locations, disassembly sequences, type and number of fastening techniques, tools
required, warnings where damage risk exists, amount of cells and layout; (d) safety
measures.

### Point 3 — notified bodies + market surveillance authorities + Commission → section `compliance`

Results of test reports proving compliance with this Regulation or acts adopted under it.

### Point 4 — legitimate interest, individual battery, dynamic → section `usage`

(a) values for the Art. 10(1) performance/durability parameters (Annex IV Part A: rated
capacity and capacity fade; power and power fade; internal resistance and its increase;
round trip efficiency and its fade where applicable; expected lifetime in cycles and
calendar years) at placing on the market and on status changes; (b) state of health per
Art. 14 — **for LMT batteries** (Annex VII Part A): remaining capacity; remaining power
capability (where possible); remaining round trip efficiency (where possible); evolution
of self-discharging rates; ohmic resistance (where possible). SOCE is EV-only; (c)
battery status: `original`, `repurposed`, `re-used`, `remanufactured`, `waste`
(regulation's exact spellings); (d) data from use: charge/discharge cycles, negative
events such as accidents, periodically recorded operating environmental conditions
including temperature, and state of charge.

## LMT applicability and phase-in ([S1], [S2])

Not applicable to LMT: 1(k) capacity threshold for exhaustion (EV-only, per the Annex
text); SOCE (EV-only, Annex VII Part A). Everything else applies to LMT "to the extent
applicable" (Art. 77(2) final sentence).

Time-deferred for LMT at passport start (18 Feb 2027), therefore **optional** in the
schema:

| Field | Applies to LMT from | Basis |
| --- | --- | --- |
| Carbon footprint declaration | 18 Aug 2028 (or acts + 18 months, latest) | Art. 7(1) 2nd subpara (c) |
| Carbon footprint class label | 18 Feb 2030 (or acts + 18 months) | Art. 7(2) 3rd subpara (c) |
| Recycled content documentation | 18 Aug 2033 | Art. 8(1) 2nd subpara |
| Due-diligence report info | 18 Aug 2027 (all categories; Art. 47 exempts operators < EUR 40m turnover) | Art. 48(1) as amended by Reg. 2025/1561 |
| Instructions for use ("1(t)") | not in force; pending Omnibus | [S2] DP 44 |

Also optional as "if applicable" per [S2]: commercial warranty (DP 35), usage-data
items (DP 68–71), round-trip-efficiency values in point 4(a) (DP 57–58).

## Guidance mapping notes ([S2])

The guidance splits Annex XIII lines into 71 data points (three voltages from 1(h), four
element shares from 1(e), six SOH parameters from 4(b), ten Annex IV Part A values). The
schema follows that finer granularity. DP 16 (material composition) and DP 25 (rated
capacity) are declared duplicates by the guidance and are modelled once. DP 1–2 (unique
identifier, responsible identity) sit at the passport envelope/identification level.

## Encoding decisions taken in the draft (owner to confirm)

1. Units: integers in small units — mAh, mV, W, mΩ, grams, °C, months; percentages,
   C-rate and kg CO₂e/kWh as decimal strings (crypto spec §2 number rule).
2. Documents (declaration of conformity, test reports, diagrams) as a uniform
   `documentRef` object: title, URL, optional mimeType and sha256.
3. Section tags via a custom `x-section` keyword on every top-level property; each
   top-level property belongs wholly to one section.
4. `status` enum uses the regulation's exact strings, including hyphenated `re-used`.
5. Battery category fixed to `lmt` for the MVP schema.
6. Omitted optional field = "not applicable"; no separate not-applicable-reason
   mechanism in v0.1 (revisit if the Art. 77(9) act or EN 18222 demands one).
7. Open format ambiguities the guidance defers to future updates: chemistry vocabulary,
   CAS/EC identification of substances, renewable-share methodology, temperature-range
   representation, time-series shape for 4(d). The draft chooses pragmatic forms and
   flags them in field descriptions.
