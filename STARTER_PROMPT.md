# GroundTruth starter prompt

Paste this into an AI coding agent (Cursor Agent mode) to reproduce the project from zero. It encodes the decisions and data findings from Day 1 so the agent does not have to rediscover them.

---

```text
You are building "GroundTruth" for LovHack Season 3 (deadline Oct 5, 2026, 11:45 GMT+8).
Judging: Execution & Functionality 35%, Problem & Impact 25%, Innovation & Creativity 20%, Presentation & UX 20%.
Read PRD.md first and treat it as the spec.

WHAT IT IS
A triage tool for the Philippine flood control scandal. It checks each published DPWH flood control contract
against geography and against the rest of the record, then outputs a ranked inspection queue with evidence
cards. It never says a project is fake or that anyone is corrupt. Every flag shows the measured value and a
benign explanation. Copy says "needs verification", never "ghost" or "corrupt".

DATA (all public, no keys)
- Records: git clone https://github.com/rukku/sumbongsapangulo.ph-datasets (flood_control_projects.geojson,
  9,855 features, fields incl. ProjectDescription, Municipality, Province, Region, Latitude, Longitude,
  ContractCost, ABC, ContractID, ProjectID, FundingYear, StartDate, CompletionDateActual, Contractor).
- Municipal boundaries: geoBoundaries PHL ADM3 + ADM2 via https://www.geoboundaries.org/api/current/gbOpen/PHL/ADM3/
- Waterways: https://download.geofabrik.de/asia/philippines-latest.osm.pbf, extract named waterway=* ways with pyosmium.

PIPELINE (Python in ./pipeline/scripts, outputs to ./web/public/data)
1. prepare_boundaries.py: simplify ADM3 to ~20 m, tag each with its ADM2 province, write parquet + a
   web-simplified GeoJSON.
2. extract_waterways.py: named river/stream/canal/drain ways -> parquet.
3. parse_titles.py: regex parser for waterway name, barangay, station-range length (Sta. 0+468 to 0+702),
   phase/package markers. Watch for: tokens matching inside words ("along" -> "ng"), "Sta." abbreviations,
   hyphenated barangays (Sico-Sico).
4. build.py:
   - Resolve TWO location claims per record: the municipality field and the place at the end of the title.
     Fuzzy-match within the stated province. Use the claim nearest the pin for the verdict.
     (Many 800 km "mismatches" are same-named towns in the wrong province while title and pin agree:
     label those record_fields_disagree, not outside_stated_municipality.)
   - Location signals: outside_stated_municipality (>3 km), record_fields_disagree, offshore_pin (>1 km),
     far_from_named_waterway (>3 km, only if OSM maps that river through the stated town), coarse_pin
     (<=2 decimals), pin_shared_across_municipalities.
   - Risk signals: shared_pin (exact pin, different titles; stronger same-year or identical amount),
     consecutive_contracts (3+ consecutive contract numbers, same site), barangay_concentration (8+),
     above_budget_ceiling (>0.5% over ABC), cost_per_metre_outlier (robust z >= 3), implausibly_short.
   - Do NOT flag "awarded at ABC" (63% of contracts) or round-number bunching; show them as context.
   - Labels: records (any location signal) > field (any risk signal) > low > insufficient.
   - Score = 100*(1-exp(-sum strengths))*(0.65+0.35*cost percentile).
   - Write projects.json, summary.json, municipalities.geojson, and a CSV.

WEB (./web: Vite + React + TypeScript + MapLibre GL, static, no backend)
- Editorial design, not a generic dashboard: warm paper background, ink text, serif headlines,
  monospace numerals, one colour per label, generous whitespace, no gradients, no emoji, no stock icons.
- Pages: Brief (landing with 3 real featured cases), Queue (filters + list + map + evidence drawer),
  Method (checks, thresholds, limits, credits).
- Evidence card: pin, claimed municipality outline, matched waterway connector line, satellite toggle,
  signals with named rule codes (OUTSIDE_CLAIMED_TOWN, SHARED_PIN, ...) + value + benign explanation,
  related contracts, raw record fields, disclaimer.
- Inspector-capacity slider: "if you can inspect only N, keep the top N."
- CSV export of the current filter. Deep links (#/queue/<index>) so a card can be shared.
- LovHack winner patterns: live public demo, deterministic scores with evidence first, honest
  insufficient-data state, Method page with limits, no AI required at runtime.

WORKING RULES
- Never invent data or numbers. Every number on screen must come from the pipeline output.
- Stop after each numbered step, print a short summary with real counts, then continue.
```
