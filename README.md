# GroundTruth

Triage tool for published Philippine flood control contracts. Checks each DPWH record against geography and against the rest of the dataset, then ranks an inspection queue with explainable evidence cards.

**Not a verdict engine.** A flag means "needs verification." Every flag shows the measured value and a possible innocent explanation.

Built for [LovHack Season 3](https://lovhack-season-3.devpost.com/) (Sep 26 - Oct 4, 2026).

## Live demo

**https://groundtruth-ph.vercel.app**

Demo video: regenerate later (`demo/capture.mjs` + `demo/compose_video.py`).

## What it does

1. Reads **9,855** published flood control contracts (~₱547.6B, funding years 2018-2025).
2. Resolves **two location claims** per record (municipality field + place named in the title) against municipal boundaries.
3. Runs deterministic checks with named rule codes (`OUTSIDE_CLAIMED_TOWN`, `SHARED_PIN`, ...).
4. Labels each record: **Records issue likely** , **Field priority** , **Low priority** , **Insufficient data**.
5. Ranks within each label with a 0-100 priority score. Money raises rank; it never creates a flag alone.

## Stack

| Layer | Tech |
|---|---|
| Pipeline | Python, pandas, geopandas, shapely, rapidfuzz, pyosmium |
| Web | Vite, React, TypeScript, MapLibre GL |
| Data | Sumbong sa Pangulo / DPWH mirror, geoBoundaries, OpenStreetMap |

No backend. The UI reads static JSON from `web/public/data/`.

## Quick start

```bash
# Web app
cd web
npm install
npm run dev
```

Pipeline (optional rebuild):

```bash
cd pipeline
# place raw data under data/raw/ (see PRD.md)
python scripts/build.py
```

## Docs

- [PRD.md](./PRD.md) - product requirements
- [STARTER_PROMPT.md](./STARTER_PROMPT.md) - agent prompt to reproduce from zero
- Method page in the app - full rule table, limits, credits

## Ethics

- Neutral copy only ("needs verification", never "ghost" / "corrupt")
- No contractor rankings
- Disclaimer on every evidence card
- Credits BetterGov.ph and Data Dictionary for prior public work on this data

## Licence notes

Use of OpenStreetMap data requires ODbL attribution. geoBoundaries is CC BY 3.0 IGO. Contract records are government-published data via Sumbong sa Pangulo.
