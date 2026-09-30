# Devpost submission draft: GroundTruth

**Live demo:** https://groundtruth-ph.vercel.app  
**Demo video:** TBD (regenerate before submission)  
**Repo:** this folder (`groundtruth/`)

## Project name
GroundTruth

## Tagline
A triage queue that checks public flood control contracts against the map, and never pretends a flag is a verdict.

## Description (paste into Devpost)

### The problem
The Philippines published 9,855 flood control contracts worth about ₱547.6B. Verification is the bottleneck: as of late September 2026, DPWH reports 10 confirmed ghost projects and nearly 200 open investigations. A pin that shows nothing is not automatically a ghost; it may be misplaced. Existing dashboards flag data; they do not sort "fix the record" from "send someone to the site."

### What we built
GroundTruth is a static web app that:

1. Checks every published contract against municipal boundaries, named rivers (OpenStreetMap), and the rest of the record.
2. Labels each row: **Records issue likely**, **Field priority**, **Low priority**, or **Insufficient data**.
3. Ranks within each label with a 0-100 priority score and named rule codes (`OUTSIDE_CLAIMED_TOWN`, `SHARED_PIN`, and others).
4. Shows an evidence card with measured values, benign explanations, related contracts, and a next step.
5. Lets you keep only the top N if inspectors are limited, then export CSV or share a deep link.

Inspired by patterns that won prior LovHack seasons: live public demos, scores backed by evidence, honest "insufficient data," and a Method page that states limits.

### Who it is for
Investigative journalists, watchdog researchers, and government validators who need a defensible queue, not a guilt machine.

### What we built during LovHack Season 3
Pipeline (Python) + editorial React/MapLibre web app + ranked queue + evidence cards + Method page + capacity slider + CSV export. All product code for this submission was created for LovHack Season 3. Public datasets and open-source libraries are credited on the Method page.

### Technologies
Python, pandas, geopandas, shapely, rapidfuzz, pyosmium, Vite, React, TypeScript, MapLibre GL, Motion, OpenFreeMap, geoBoundaries, OpenStreetMap, Vercel.

### Brand
Museum white + ink black. Syne wordmark with survey-crosshair mark; Source Serif 4 headlines; DM Sans UI; IBM Plex Mono for IDs and scores. Greyscale MapLibre. No cream paper, terracotta accents, or stock flood photography. The hero is a working evidence Locator diagram.

### Ethics
Neutral language only. No contractor rankings. Every flag shows an innocent explanation. The tool cannot prove a structure exists or does not; only a site visit can.

## Judging notes (self-check)
- Execution 35%: live demo, 9,855 records, no backend to fail
- Problem & Impact 25%: current national story, real bottleneck
- Innovation 20%: two-claim location resolution + inspection-capacity slider + triage labels (not another dashboard)
- Presentation 20%: B&W brand system, Method page, demo video (to regenerate)
