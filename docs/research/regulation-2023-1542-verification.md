# Regulatory verification: Regulation (EU) 2023/1542 vs the Passant design docs

Researched 2026-09-20 against the EUR-Lex **consolidated text of 13 August 2026**
(CELEX 02023R1542-20260813), read directly. This checks the claims in `docs/hld.md` §2
and the site copy, which were based on secondary sources read 2026-09-18.

**Headline findings**

1. **The three-tier model does not match the regulation's access matrix** — the most
   significant correction; see "Impact" point 1. This touches the frozen crypto spec
   ("exactly three tier documents") and is reported for the owner's decision, per hard
   rule 2. Nothing has been changed.
2. **18 February 2027 stands.** Three amendments to the regulation exist; none touches
   the passport date or scope.
3. **A new obligation is missing from the HLD**: Art. 77(10) (added by ESPR) requires
   uploading each unique identifier to the EU DPP registry — which is **live since
   20 July 2026**, with a web UI and API (IR (EU) 2026/1778, eIDAS-verified accounts).
4. The Art. 77(9) **implementing** act on legitimate-interest access (the HLD called it
   a delegated act) missed its 18 August 2026 deadline; no draft is public; Commission
   timeline now says **Q4 2026**. Authentication of that tier remains genuinely open.

## Claim-by-claim verdicts

| # | HLD claim | Verdict | Source |
| --- | --- | --- | --- |
| 1 | From 18 Feb 2027, LMT and EV batteries (any capacity) and industrial >2 kWh need a passport | **Confirmed**, plus: trigger is "placed on the market **or put into service**" | Art. 77(1) |
| 2 | One passport per individual battery, not per model | **Confirmed** (model + unit data; new passport on repurposing; ceases on recycling) | Art. 77(1)-(2), (7)-(8); Annex XIII pt 4 |
| 3 | QR code carrying a unique identifier; ISO/IEC 15459 or equivalent; GS1 Digital Link common practice | **Confirmed**; GS1 Digital Link appears in **no legal text** — industry practice only. QR must be printed/engraved **on the battery** (packaging only as fallback) | Art. 13(6)-(7), 77(3); Annex VI Part C |
| 4 | Content in Annex XIII; tiered public / legitimate-interest / authority access | **Partly confirmed** — content yes, but the split is four content buckets and the tiers are **not nested** (details below) | Art. 77(2); Annex XIII pts 1–4 |
| 5 | Responsibility with the operator placing on the market; importer for imports | **Confirmed** | Art. 77(4); Art. 3 definitions |
| 6 | Data stays with the operator or service provider; EU holds identifiers only | **Confirmed**; the EU side is the ESPR DPP registry, **live 20 July 2026**; upload obligation in Art. 77(10) | Art. 78(c)-(e), 77(10); IR (EU) 2026/1778 |
| 7 | Open standards, interoperable, machine-readable; JSON-LD | **Confirmed** for the requirement; **no serialization is mandated** — JSON/JSON-LD is practice, not law | Art. 77(5), 78(a) |
| 8 | Delegated act on access rights due 18 Aug 2026 | **Partly confirmed**: it is an **implementing** act under **Art. 77(9)**; deadline missed; not adopted, no draft; Commission says Q4 2026 | Art. 77(9), 78(b),(f) |
| 9 | (New check) Amendments to 2023/1542 | Amended 3× (ESPR 2024/1781; "stop the clock" 2025/1561 → due diligence to 18 Aug 2027; ELV 2026/1738). **Passport date/scope untouched** | Consolidated text markers |
| 10 | (New check) EU DPP registry | **Live** since 20 July 2026, applies to battery passports, UI + API published | IR (EU) 2026/1778; Commission news 2026-07-20 |

## The access-matrix correction (finding 1, in full)

Annex XIII has four points, and Article 77(2) maps them to audiences:

| Annex XIII point | Content | Audience |
| --- | --- | --- |
| 1 (model) | Label info, composition, carbon footprint, recycled content, performance ratings, declaration of conformity, end-of-life info | General public |
| 2 (model) | Detailed composition, part numbers, dismantling info, safety measures | Legitimate-interest persons **and** notified bodies / market-surveillance authorities / Commission |
| 3 (model) | Test reports proving compliance | **Only** notified bodies / MSAs / Commission |
| 4 (unit) | State of health, status, cycles, negative events, usage data | **Only** legitimate-interest persons |

The tiers are not nested: authorities do **not** see point-4 usage data; legitimate-interest
persons do **not** see point-3 test reports. The two restricted audiences overlap only on
point 2. A "one salted hash per access tier, three tiers" leaf cannot express this matrix
directly; the natural fix is one hash per Annex XIII **point** (four), with a role→points
mapping {public: 1; legitimate interest: 1+2+4; authority: 1+2+3}.

**This conflicts with `docs/crypto-spec.md` §2 ("exactly three tier documents") and the
test vectors. Per the hard rules, neither has been touched; this is an owner decision.**
Options are laid out at the end of this report.

## Other project impacts

- **Timeline**: unchanged; plan holds. Due diligence delayed to Aug 2027 makes Annex XIII
  1(d) (due-diligence report info) effectively optional for now — model it as optional.
- **Identifier**: the operator-subdomain design must be defensible as "equivalent" under
  ISO/IEC 15459-1..6 (Art. 77(3)); EN 18219:2026 / EN 18220:2026 are the harmonised
  technical layer (paywalled). Keep passport URLs short — the QR is engraved on the pack.
- **Registry upload (new)**: M2/M4 should reserve an integration point (an export or a
  "registry registration" step) for uploading identifiers to the EU registry; the actual
  registration needs an eIDAS-verified operator account and is a project-owner action.
- **Format**: JSON + documented schema is compliant. Pragmatic alignment targets: the
  Commission's "71 data points" guidance (2026-08-21) and DIN DKE SPEC 99100 v1.3
  (March 2026); EN 18222 (APIs) / EN 18216 (data exchange) for interoperability claims.
- **Standards status**: CEN/CLC JTC 24 published EN 18216/18219–18223 in May 2026; six
  harmonised for ESPR by Implementing Decision (EU) 2026/1736 (15 July 2026). They bind
  battery passports via Art. 78(a) interoperability, not (yet) a battery-specific citation.

## Genuinely open as of 2026-09-20

- Content of the Art. 77(9) implementing act (who qualifies as legitimate-interest, how
  it is authenticated, download/re-use limits) — expected Q4 2026. Keep the
  legitimate-interest **authorisation policy** configurable; hard-code only the Annex
  XIII content partition.
- Whether battery passports will be formally required to cite the EN 1821x series.
- Hands-on details of the registry API for the battery flow (test environment exists).
- Phase-in of data points tied to other articles (carbon footprint per Art. 7 timetable).

## Decision needed from the owner (crypto spec vs access matrix)

The MVP anchors only the public view's verifiability, so the slice itself is not blocked,
but leaves are permanent: whatever structure M2 first anchors is frozen forever. Options:

1. **Adopt four salted hashes per leaf** (one per Annex XIII point) before any real
   anchoring: requires `passant-crypto/2`-style revision of the spec and vectors — owner
   edits, since spec and vectors are owner-controlled. Cleanest match to the regulation.
2. **Keep three tiers** and place point-2 content in `legitimate_interest` while serving
   authorities point 2 via a separate grant: the *authority tier hash* then covers only
   point 3, and point-4 data lives in `legitimate_interest`. Workable but the tier named
   "authority" would not contain everything authorities may see, and per-audience
   verifiability of exactly-their-view is lost for the overlap.
3. **Defer**: MVP passports carry public data only (points 2–4 empty `data: {}` as the
   spec allows); decide the partition when the Art. 77(9) act lands (Q4 2026). Lowest
   immediate cost, but batches anchored in the interim would embed the three-tier leaf
   shape permanently.

## Sources

- EUR-Lex consolidated Reg. (EU) 2023/1542 (02023R1542-20260813):
  https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02023R1542-20260813
- Amending/related acts: ESPR Reg. (EU) 2024/1781; Reg. (EU) 2025/1561 ("stop the
  clock"); Reg. (EU) 2026/1738 (ELV); IR (EU) 2026/1778 (DPP registry):
  https://eur-lex.europa.eu/eli/reg_impl/2026/1778/oj/eng; ID (EU) 2026/1736 (harmonised
  DPP standards): https://eur-lex.europa.eu/eli/dec_impl/2026/1736/oj/eng
- Commission: DPP registry live (2026-07-20):
  https://single-market-economy.ec.europa.eu/news/digital-product-passport-registry-now-live-2026-07-20_en;
  battery passport guidance (2026-08-21):
  https://single-market-economy.ec.europa.eu/news/guidance-support-preparations-digital-batteries-passport-2026-08-21_en;
  DPP timeline page (Q4 2026 access-rights act):
  https://single-market-economy.ec.europa.eu/single-market/digital-product-passport_en
- Council press release on the due-diligence delay (2025-07-18):
  https://www.consilium.europa.eu/en/press/press-releases/2025/07/18/simplification-council-adopts-law-to-stop-the-clock-on-due-diligence-rules-for-batteries/
- CEN/CENELEC DPP standards news (2026-07-15):
  https://www.cencenelec.eu/news-events/news/2026/en-in-the-spotlight/2026-07-15-dpp/
- DIN DKE SPEC 99100 / BatteryPass materials: https://thebatterypass.eu/battery-pass/materials/
- Secondary status notes on the missed Art. 77(9) deadline: Taylor Wessing (2026-08),
  eudigitalproductpassport.org.
