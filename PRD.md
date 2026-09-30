# GroundTruth: Product Requirements Document

**Version** 1.1 (updated with Day 1 data findings)
**Event** LovHack Season 3 (build period Sep 26 to Oct 4, 2026; deadline Oct 5, 2026, 11:45 GMT+8)
**Judging** Execution & Functionality 35%, Problem & Impact 25%, Innovation & Creativity 20%, Presentation & UX 20%

---

## 1. One-line summary

GroundTruth checks every published Philippine flood control contract against real geography and against the rest of the record, then hands investigators a ranked inspection queue where every flag explains itself and lists the innocent explanation next to it.

## 2. Problem

- The Philippines published 9,855 flood control contracts worth about PHP 547.6 billion (funding years 2018 to 2025) through the Sumbong sa Pangulo portal after the 2025 flood control scandal.
- Verification is the bottleneck. As of Sept 28, 2026, DPWH reports 10 conclusively confirmed ghost projects and nearly 200 ongoing investigations. The NBI alone red-flagged 51 of 100 Davao projects it examined.
- A project missing at its recorded pin is not automatically a ghost. It may be misplaced on the map. Today that distinction is made by hand, one project at a time.
- The two patterns investigators have publicly described this month are both detectable in the published data:
  - A Taguig project whose geotagged coordinates were reportedly about 600 km away in Leyte (Senator Lacson, Sept 26, 2026).
  - One coordinate funded five times under different titles in one budget year (NBI, Davao, Sept 25, 2026).

## 3. Users

| User | Job to be done |
|---|---|
| Investigative journalists, watchdog researchers | Find defensible leads fast, with the reasoning attached |
| Government validators (DPWH, COA, NBI) | Decide which records need a desk correction and which need a site visit |
| Citizens | Check the contracts in their own town |

## 4. Goals and non-goals

**Goals**
1. Label all 9,855 records with one of four outcomes and a rank within each label.
2. Every flag shows: the check that fired, the measured value, and a plausible benign explanation.
3. A judge understands the product in under 30 seconds and can open any record in two clicks.
4. Runs as a static web app with no backend to fail during judging.

**Non-goals**
- Proving a project does not exist. Only a site visit does.
- Naming or ranking contractors or officials. Contractor names appear only as they are recorded on each contract.
- Live data sync. The app states the snapshot date.

## 5. Data (verified Day 1)

| Source | Use | Status |
|---|---|---|
| DPWH flood control records via sumbongsapangulo.ph, mirrored at github.com/rukku/sumbongsapangulo.ph-datasets | 9,855 records, 100% with coordinates, 93.2% with a municipality field | Verified |
| geoBoundaries PHL ADM3 (1,647 municipalities and cities) and ADM2, CC BY 3.0 IGO | Point in polygon, distance to stated municipality | Verified |
| OpenStreetMap Philippines extract (Geofabrik), ODbL | 15,652 named waterway segments, 3,492 names | Verified |
| OpenFreeMap basemap, Esri World Imagery | Map display and satellite context | Verified |

Day 1 go/no-go result: **GO**. Coordinates are complete; titles are parseable (waterway named in 57%, barangay in 50%).

## 6. Triage logic

### 6.1 Two location claims per record
Each record makes two independent claims about where it is: the structured municipality field and the place named at the end of the title. Both are resolved to municipal polygons (fuzzy name match within the stated province). The claim closest to the pin is used for the verdict.

This matters. The largest raw mismatches (for example, 800+ km) are almost all records whose municipality field names a same-named town in another province while the title and the pin agree. Those are encoding errors, not missing structures, and GroundTruth labels them that way.

### 6.2 Signals

**Location signals (records issue)**
| Code | Fires when | Benign explanation shown |
|---|---|---|
| outside_stated_municipality | Pin is more than 3 km outside every municipality the record claims | Office coordinates, neighbouring town, one-digit typo |
| record_fields_disagree | Field and title name different towns; the pin matches only one | Same-named towns; encoding error |
| offshore_pin | Pin more than 1 km from land | Coastal works plus small coordinate error |
| far_from_named_waterway | Title names a river that OSM maps through the stated town, but the pin is more than 3 km from it | Partial OSM mapping, similarly named tributary |
| coarse_pin | Coordinates with 2 or fewer decimals (about 1 km) | Coarse geotagging |
| pin_shared_across_municipalities | Same exact pin used by contracts naming different towns | Copied default coordinate |

**Risk signals (field priority)**
| Code | Fires when | Benign explanation shown |
|---|---|---|
| shared_pin | Other contracts with different titles use the exact pin (stronger if same funding year or identical amount) | Phased or multi-package works |
| consecutive_contracts | 3 or more consecutive contract numbers cover the same site | Lots split for contractor capacity |
| barangay_concentration | 8 or more separate contracts name the same barangay | Barangays on major rivers need phased works |
| above_budget_ceiling | Contract cost more than 0.5% above the ABC | Approved variation orders |
| cost_per_metre_outlier | Robust z-score of log cost per metre of 3 or more within work type | Sheet piling, pumps, terrain |
| implausibly_short | PHP 10M+ contract completed in under 30 days | Dates reflect a later phase |

**Context, not a signal:** 63% of contracts are awarded within 0.1% of their ABC, and amounts bunch just under round numbers (1,328 contracts between PHP 95M and 100M, only 30 between PHP 100M and 105M). This is shown as context because it describes the budget system, not an individual project.

### 6.3 Labels
1. **Records issue likely**: any location signal. Fix or confirm the coordinates before sending anyone.
2. **Field priority**: location consistent, at least one risk signal. Best candidates for a site visit.
3. **Low priority**: location consistent, no signals.
4. **Insufficient data**: no municipality could be resolved.

**Priority score** (0 to 100) = `100 x (1 - e^-sum(strengths)) x (0.65 + 0.35 x cost percentile)`. Money at stake raises priority but never creates a flag on its own.

## 7. Product surface

1. **Landing / brief**: the problem in one sentence, three real featured cases, live counts, a single "Open the queue" action.
2. **Queue and map (main app)**: filter by label, region, year, work type, signal, search; sortable list; MapLibre map with points by label; CSV export of the current filter.
3. **Evidence card**: recorded pin, claimed municipality outline, nearest matched waterway with a connector line, satellite toggle, every signal with value and benign explanation, related contracts (same pin, consecutive run, barangay cluster), source record fields, link out to the source.
4. **Method page**: all checks and thresholds, the amount-bunching context chart, validation notes, limits, credits and licences.

## 8. Design principles
- Editorial, not dashboard-generic: paper background, ink text, a serif for headlines, a mono face for numbers, one signal colour per label.
- Neutral language everywhere: "needs verification", never "ghost" or "corrupt".
- Every number traceable to a record.

## 9. Validation
- Parser accuracy measured on hand-labelled rows (reported on the Method page).
- Satellite spot check of top-ranked records.
- Case replays against public reporting (Davao Catalunan Pequeno Creek pairs; Barangay Piel, Baliuag). Reported as case studies, never as accuracy.
- Stated limit: the Piel riverwall President Marcos found missing (PHP 55.73M, Aug 2025) was reportedly not among the 9,855 published records. Triage can only see what is published.

## 10. Architecture
- `pipeline/` (Python: pandas, geopandas, shapely, rapidfuzz, pyosmium) writes static JSON and CSV.
- `web/` (Vite, React, TypeScript, MapLibre GL) reads the static files. Deployable to any static host.

## 11. Success metrics (real numbers from the current build)
- 9,855 records processed; 636 records-issue, 1,137 field-priority, 7,909 low, 173 insufficient.
- 9,605 records (97.5%) resolved to a stated municipality; 3,667 named waterways matched to OSM.
- 236 exact pins shared by 550 contracts.

## 12. Timeline
| Day | Deliverable |
|---|---|
| Sep 29 | Feasibility, pipeline, PRD |
| Sep 30 | Web app: queue, map, evidence cards |
| Oct 1 | Method page, CSV export, polish |
| Oct 2 | Validation, spot checks, deploy |
| Oct 3 | Demo video |
| Oct 4 | Devpost submission, link check |

## 13. Risks
| Risk | Mitigation |
|---|---|
| Name matching errors inflate flags | Two-claim resolution, province-scoped matching, benign explanations |
| OSM rivers partially mapped | Waterway signal only fires if OSM maps the river through the stated town |
| Legal exposure | No contractor rankings; neutral copy; disclaimer on every card |
| Demo fragility | Fully static build, no API keys required |
