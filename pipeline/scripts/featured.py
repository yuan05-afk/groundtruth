"""Pick the landing-page cases by explicit rules and export their outlines for the SVG locators."""
import json
import sys
from datetime import datetime, timezone

import geopandas as gpd
import numpy as np
from shapely.geometry import mapping

from common import INTERIM, RAW, WEB_DATA

sys.stdout.reconfigure(encoding="utf-8")

projects = json.loads((WEB_DATA / "projects.json").read_text(encoding="utf-8"))
munis = gpd.read_parquet(INTERIM / "municipalities.parquet").set_index("mid")


def sig(p, code):
    return next((s for s in p["sig"] if s["code"] == code), None)


def pick(code, extra=lambda p: True):
    cands = [p for p in projects if sig(p, code) and extra(p)]
    return max(cands, key=lambda p: (sig(p, code)["value"] or 0, p["c"]))


cases = [
    ("misplaced", "Misplaced, not missing", pick("record_fields_disagree")),
    ("outside", "The pin matches neither claim", pick("outside_stated_municipality", lambda p: not sig(p, "record_fields_disagree"))),
    ("shared", "One pin, many contracts", max(
        (p for p in projects if sig(p, "shared_pin")),
        key=lambda p: (len(p["dup"]), p["c"]),
    )),
]

out = []
for key, headline, p in cases:
    mids = {m for m in (p["fm"], p["tm"], p["am"], p["sm"]) if m is not None}
    shapes = {
        str(m): {
            "name": munis.loc[m, "name"],
            "province": munis.loc[m, "province"],
            "geometry": mapping(munis.loc[m, "geometry"].simplify(0.003, preserve_topology=True)),
        }
        for m in mids
    }
    out.append({"key": key, "headline": headline, "project": p, "shapes": shapes})
    print(key, "|", p["cid"], "|", p["t"][:80], "|", [s["code"] for s in p["sig"]])

(WEB_DATA / "featured.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
print("featured.json KB:", round((WEB_DATA / "featured.json").stat().st_size / 1e3))

# Faint national outline for the SVG locators.
adm2 = gpd.read_file(RAW / "adm2.geojson")
outline = adm2.geometry.union_all().simplify(0.01, preserve_topology=True)
parts = [g for g in getattr(outline, "geoms", [outline]) if g.area > 0.0004]
outline = gpd.GeoSeries(parts).union_all()
(WEB_DATA / "ph_outline.json").write_text(json.dumps(mapping(outline), separators=(",", ":")), encoding="utf-8")
print("ph_outline.json KB:", round((WEB_DATA / "ph_outline.json").stat().st_size / 1e3))

# Context numbers for the Brief and Method pages.
summary_path = WEB_DATA / "summary.json"
summary = json.loads(summary_path.read_text(encoding="utf-8"))
amounts = np.array([p["c"] for p in projects]) / 1e6
edges = list(range(0, 205, 5))
counts, _ = np.histogram(np.clip(amounts, 0, 199.99), bins=edges)
summary["amount_hist"] = {"edges": edges, "counts": counts.tolist()}
raw = json.loads((RAW / "ssp" / "flood_control_projects.geojson").read_text(encoding="utf-8"))
created = max(f["properties"]["CreationDate"] for f in raw["features"])
summary["source_date"] = datetime.fromtimestamp(created / 1000, tz=timezone.utc).date().isoformat()
summary["exact_amounts"] = {
    "49.0": int(np.sum(np.abs(amounts - 49.0) < 0.05)),
    "96.5": int(np.sum(np.abs(amounts - 96.5) < 0.05)),
}
summary["band_95_100"] = int(np.sum((amounts >= 95) & (amounts < 100)))
summary["band_100_105"] = int(np.sum((amounts >= 100) & (amounts < 105)))
summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=1), encoding="utf-8")
print({k: summary[k] for k in ("source_date", "exact_amounts", "band_95_100", "band_100_105")})
