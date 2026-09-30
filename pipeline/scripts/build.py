"""GroundTruth triage build: records -> checks -> signals -> labels -> static JSON for the web app."""
import json
import math
import sys
from collections import defaultdict
from datetime import datetime, timezone

import geopandas as gpd
import numpy as np
import pandas as pd
from rapidfuzz import fuzz, process
from shapely.geometry import Point
from shapely.ops import nearest_points

from common import INTERIM, METRIC_CRS, RAW, ROOT, WEB_DATA, fold, place_key, province_key
from parse_titles import parse, tail_places

sys.stdout.reconfigure(encoding="utf-8")

# Thresholds (documented on the Method page; exported in summary.json).
T = {
    "muni_near_km": 1.0,        # boundary data is simplified to ~20 m; rivers often form municipal borders
    "muni_far_km": 3.0,         # beyond this the pin is treated as outside the stated municipality
    "offshore_km": 1.0,         # distance from the nearest land polygon
    "waterway_far_km": 3.0,     # pin distance from a named waterway mapped through the stated municipality
    "waterway_search_km": 30.0,
    "coarse_decimals": 2,       # <= 2 decimals is ~1 km precision
    "cost_z": 3.0,              # robust z-score of log(cost per metre) within work type
    "short_days": 30,
    "short_min_cost": 10_000_000,
    "above_abc_ratio": 1.005,   # 0.5% above ABC; smaller gaps are often rounding
    "dup_round": 5,             # ~1.1 m coordinate rounding for "same pin"
    "brgy_cluster_min": 8,      # separate contracts naming the same barangay
}

print("loading records ...")
raw = json.loads((RAW / "ssp" / "flood_control_projects.geojson").read_text(encoding="utf-8"))
rows = [f["properties"] for f in raw["features"]]
df = pd.DataFrame(rows)
df["lat_raw"] = [f["geometry"]["coordinates"][1] for f in raw["features"]]
df["lon_raw"] = [f["geometry"]["coordinates"][0] for f in raw["features"]]
df["i"] = np.arange(len(df))

munis = gpd.read_parquet(INTERIM / "municipalities.parquet")
munis["key"] = munis["name"].map(place_key)
munis["pkey"] = munis["province"].map(province_key)
munis_m = munis.to_crs(METRIC_CRS)
water = gpd.read_parquet(INTERIM / "waterways.parquet")
water_m = water.to_crs(METRIC_CRS)

pts = gpd.GeoDataFrame(df[["i"]], geometry=gpd.points_from_xy(df["Longitude"], df["Latitude"]), crs="EPSG:4326")
pts_m = pts.to_crs(METRIC_CRS)

# ---------- parsing ----------
parsed = df["ProjectDescription"].fillna("").map(parse)
for k in ("waterway", "barangay", "length_m", "phase"):
    df[k] = parsed.map(lambda p: p[k])

# ---------- actual location (where the pin falls) ----------
print("point in polygon ...")
inside = gpd.sjoin(pts_m, munis_m[["mid", "geometry"]], how="left", predicate="within")
inside = inside[~inside.index.duplicated()]
df["actual_mid"] = inside["mid"].astype("Int64")
missing = df["actual_mid"].isna()
if missing.any():
    near = gpd.sjoin_nearest(pts_m[missing], munis_m[["mid", "geometry"]], how="left", distance_col="d")
    near = near[~near.index.duplicated()]
    df.loc[missing, "land_dist_km"] = (near["d"] / 1000).round(2)
    df.loc[missing, "nearest_mid"] = near["mid"]
df["land_dist_km"] = df.get("land_dist_km", pd.Series(0.0, index=df.index)).fillna(0.0)

# ---------- stated location (what the record claims) ----------
print("resolving stated municipality ...")
by_pkey = {k: g for k, g in munis.groupby("pkey")}
known_pkeys = set(by_pkey)


def stated_pkey(r):
    if r["Region"] == "National Capital Region":
        return "ncr"
    return province_key(r["Province"])


def match_in_pool(names, pool, i):
    """Best fuzzy municipality match for the first usable name; ties broken by distance to the pin."""
    keys = pool["key"].tolist()
    for n in names:
        key = place_key(n)
        if len(key) < 3:
            continue
        hits = process.extract(key, keys, scorer=fuzz.ratio, limit=5, score_cutoff=86)
        if not hits:
            continue
        top = hits[0][1]
        cands = [pool.iloc[h[2]] for h in hits if h[1] >= top - 0.01]
        p = pts_m.geometry.iloc[i]
        chosen = min(cands, key=lambda c: munis_m.geometry.iloc[int(c["mid"])].distance(p))
        return int(chosen["mid"]), n
    return None, None


def resolve(r):
    """Two independent claims: the structured municipality field, and the place named at the end of the title."""
    field_mid = None
    if isinstance(r["Municipality"], str) and r["Municipality"].strip():
        pool = by_pkey.get(stated_pkey(r), munis)
        field_mid, _ = match_in_pool([r["Municipality"]], pool, r["i"])

    segs = tail_places(r["ProjectDescription"] or "")
    title_mid = None
    if segs:
        pk = province_key(segs[-1])
        if pk in known_pkeys and len(segs) > 1:
            title_mid, _ = match_in_pool(list(reversed(segs[:-1])), by_pkey[pk], r["i"])
        if title_mid is None:
            pool = by_pkey.get(stated_pkey(r), munis)
            title_mid, _ = match_in_pool(list(reversed(segs)), pool, r["i"])
    return pd.Series({"field_mid": field_mid, "title_mid": title_mid})


df = pd.concat([df, df.apply(resolve, axis=1)], axis=1)


def muni_distance(mid, i):
    if mid is None or pd.isna(mid):
        return np.nan
    return round(munis_m.geometry.iloc[int(mid)].distance(pts_m.geometry.iloc[i]) / 1000, 2)


print("distance to stated municipality ...")
df["field_dist_km"] = [muni_distance(m, i) for m, i in zip(df["field_mid"], df["i"])]
df["title_dist_km"] = [muni_distance(m, i) for m, i in zip(df["title_mid"], df["i"])]

# The claim closest to the pin is the "stated" municipality used for the location verdict.
stated, sdist, fields_disagree = [], [], []
for fm, tm, fd, td in zip(df["field_mid"], df["title_mid"], df["field_dist_km"], df["title_dist_km"]):
    claims = [(d, m) for d, m in ((fd, fm), (td, tm)) if m is not None and not pd.isna(m)]
    if not claims:
        stated.append(pd.NA)
        sdist.append(np.nan)
        fields_disagree.append(False)
        continue
    d, m = min(claims, key=lambda x: x[0])
    stated.append(int(m))
    sdist.append(d)
    fields_disagree.append(
        len(claims) == 2 and int(fm) != int(tm) and max(fd, td) > T["muni_far_km"] and min(fd, td) <= T["muni_far_km"]
    )
df["stated_mid"] = pd.array(stated, dtype="Int64")
df["muni_dist_km"] = sdist
df["fields_disagree"] = fields_disagree
df["stated_name"] = [None if pd.isna(m) else munis.loc[int(m), "name"] for m in df["stated_mid"]]

# ---------- named waterway check ----------
print("waterway matching ...")
WATER_GENERIC = {"river", "creek", "ilog", "sapa", "estero", "channel", "canal", "stream", "floodway",
                 "riverbank", "tributary", "basin", "lake", "of", "the", "old", "new", "main"}


def water_core(name: str) -> str:
    words = [w for w in fold(name).replace("-", " ").split() if w not in WATER_GENERIC]
    return "".join(ch for ch in "".join(words) if ch.isalnum())


water_m["core"] = water_m["name"].map(water_core)
core_to_idx = defaultdict(list)
for idx, c in zip(water_m.index, water_m["core"]):
    if len(c) >= 3:
        core_to_idx[c].append(idx)
cores = list(core_to_idx)
water_sindex = water_m.sindex

wres = {}
for r in df.itertuples():
    if not isinstance(r.waterway, str):
        continue
    core = water_core(r.waterway)
    if len(core) < 3:
        continue
    hits = process.extract(core, cores, scorer=fuzz.ratio, limit=4, score_cutoff=88)
    if not hits:
        wres[r.i] = {"w_status": "not_mapped"}
        continue
    idxs = [j for h in hits for j in core_to_idx[h[0]]]
    p = pts_m.geometry.iloc[r.i]
    anchor = munis_m.geometry.iloc[int(r.stated_mid)] if not pd.isna(r.stated_mid) else p
    area = anchor.buffer(T["waterway_search_km"] * 1000)
    near_idx = [j for j in water_sindex.query(area) if j in set(idxs)]
    if not near_idx:
        wres[r.i] = {"w_status": "not_mapped"}
        continue
    segs = water_m.loc[near_idx]
    d = segs.geometry.distance(p)
    j = d.idxmin()
    seg = segs.geometry.loc[j]
    through_stated = (
        not pd.isna(r.stated_mid)
        and segs.geometry.distance(munis_m.geometry.iloc[int(r.stated_mid)]).min() <= 500
    )
    np_pt = gpd.GeoSeries([nearest_points(p, seg)[1]], crs=METRIC_CRS).to_crs("EPSG:4326").iloc[0]
    wres[r.i] = {
        "w_status": "matched",
        "w_name": segs.loc[j, "name"],
        "w_dist_km": round(float(d.min()) / 1000, 2),
        "w_through_stated": bool(through_stated),
        "w_near": [round(np_pt.y, 5), round(np_pt.x, 5)],
    }
wdf = pd.DataFrame.from_dict(wres, orient="index")
df = df.join(wdf, on="i")

# ---------- duplicates ----------
print("duplicate pins ...")
df["pin"] = list(zip(df["Latitude"].round(T["dup_round"]), df["Longitude"].round(T["dup_round"])))
groups = df.groupby("pin")["i"].apply(list)
groups = groups[groups.map(len) > 1]
dup_info = {}
for pin, members in groups.items():
    sub = df.loc[members]
    for r in sub.itertuples():
        others = sub[sub["i"] != r.i]
        others = others[others["ContractID"] != r.ContractID]
        if others.empty:
            continue
        same_year = others[others["FundingYear"] == r.FundingYear]
        diff_title = others[others["ProjectDescription"].str.lower() != (r.ProjectDescription or "").lower()]
        muni_set = set(sub["stated_mid"].dropna().astype(int))
        shared_project = (others["ProjectID"] == r.ProjectID).any()
        phased = bool(r.phase) or others["phase"].notna().any()
        dup_info[r.i] = {
            "dup_ids": others["i"].astype(int).tolist(),
            "dup_same_year": int(len(same_year)),
            "dup_diff_title": int(len(diff_title)),
            "dup_multi_muni": len(muni_set) > 1,
            "dup_phased": phased,
            "dup_same_project": bool(shared_project),
            "dup_total_cost": float(sub.drop_duplicates("ContractID")["ContractCost"].sum()),
            "dup_same_amount": bool((others["ContractCost"].round(0) == round(r.ContractCost)).any()),
        }

# ---------- barangay concentration and consecutive contract runs ----------
print("clusters ...")
df["brgy_key"] = [
    f"{int(m)}:{''.join(ch for ch in fold(b) if ch.isalnum())}" if isinstance(b, str) and not pd.isna(m) and len(b) > 2 and not b.strip().isdigit() else None
    for b, m in zip(df["barangay"], df["stated_mid"])
]
cluster_info = {}
for key, g in df[df["brgy_key"].notna()].groupby("brgy_key"):
    uniq = g.drop_duplicates("ContractID")
    if len(uniq) < T["brgy_cluster_min"]:
        continue
    years = sorted(uniq["FundingYear"].dropna().unique())
    for i in g["i"]:
        cluster_info[i] = {"n": len(uniq), "years": years, "total": float(uniq["ContractCost"].sum()),
                           "ids": uniq["i"].astype(int).tolist()}

cid = df["ContractID"].str.extract(r"^(\d{2}[A-Z]{2})(\d{4})$")
df["cid_prefix"], df["cid_num"] = cid[0], pd.to_numeric(cid[1], errors="coerce")
run_info = {}
site = df["brgy_key"].fillna(df["waterway"].map(lambda w: f"w:{fold(w)}" if isinstance(w, str) else None))
df["site_key"] = site
for (prefix, sk), g in df[df["cid_num"].notna() & df["site_key"].notna()].groupby(["cid_prefix", "site_key"]):
    g = g.drop_duplicates("ContractID").sort_values("cid_num")
    if len(g) < 3:
        continue
    nums = g["cid_num"].tolist()
    run = [0]
    runs = []
    for k in range(1, len(nums)):
        if nums[k] - nums[k - 1] <= 2:
            run.append(k)
        else:
            runs.append(run)
            run = [k]
    runs.append(run)
    for rr in runs:
        if len(rr) >= 3:
            members = g.iloc[rr]
            info = {"ids": members["i"].astype(int).tolist(), "cids": members["ContractID"].tolist(),
                    "total": float(members["ContractCost"].sum())}
            for i in members["i"]:
                run_info[i] = info

# ---------- cost per metre ----------
print("cost outliers ...")


def family(t: str) -> str:
    t = (t or "").lower()
    for k in ("drainage", "revetment", "slope", "dike", "rehabilitation"):
        if k in t:
            return k
    return "flood mitigation"


df["family"] = df["TypeofWork"].map(family)
df["cpm"] = df["ContractCost"] / df["length_m"]
df["cpm_z"] = np.nan
for fam, g in df[df["cpm"].notna() & (df["length_m"] >= 20)].groupby("family"):
    if len(g) < 25:
        continue
    lx = np.log(g["cpm"])
    med = lx.median()
    mad = (lx - med).abs().median() * 1.4826
    if mad > 0:
        df.loc[g.index, "cpm_z"] = ((lx - med) / mad).round(2)
        df.loc[g.index, "cpm_median"] = float(np.exp(med))

# ---------- dates, precision, budget ----------
start = pd.to_datetime(df["StartDate"], format="%m/%d/%Y", errors="coerce")
done = pd.to_datetime(df["CompletionDateActual"], errors="coerce")
df["duration_days"] = (done - start).dt.days
df["abc_ratio"] = (df["ContractCost"] / df["ABC"]).round(5)


def decimals(x) -> int:
    s = repr(float(x))
    return len(s.split(".")[1].rstrip("0")) if "." in s else 0


df["pin_decimals"] = df["lat_raw"].map(decimals).combine(df["lon_raw"].map(decimals), min)

# ---------- signals ----------
print("scoring ...")
peso = lambda v: f"PHP {v:,.0f}"


def signals_for(r) -> list[dict]:
    s = []
    i = r["i"]
    md = r["muni_dist_km"]
    muni_label = lambda m: f"{munis.loc[int(m), 'name']}, {munis.loc[int(m), 'province']}"
    if md is not None and md > T["muni_far_km"]:
        s.append({
            "code": "outside_stated_municipality", "group": "location",
            "strength": round(min(1.0, 0.5 + math.log10(md) / 3), 2),
            "value": md,
            "text": f"The pin is {md:,.1f} km outside {muni_label(r['stated_mid'])}, the nearest municipality the record claims. It falls in {muni_label(r['actual_mid']) if r['actual_mid'] is not None else 'no municipality (at sea)'}.",
            "benign": "The coordinates may have been encoded from an office location, a neighbouring town, or with a one-digit typo.",
        })
    if r["fields_disagree"]:
        f_ok = r["field_dist_km"] <= T["muni_far_km"]
        good, bad = (r["field_mid"], r["title_mid"]) if f_ok else (r["title_mid"], r["field_mid"])
        far = r["title_dist_km"] if f_ok else r["field_dist_km"]
        s.append({
            "code": "record_fields_disagree", "group": "location",
            "strength": 0.35,
            "value": far,
            "text": (f"The record contradicts itself: the {'municipality field' if f_ok else 'title'} and the pin point to "
                     f"{muni_label(good)}, but the {'title' if f_ok else 'municipality field'} names {muni_label(bad)}, {far:,.0f} km away."),
            "benign": "Same-named towns exist in many provinces; this is most likely an encoding error in the record, not a missing structure.",
        })
    if r["land_dist_km"] > T["offshore_km"]:
        s.append({
            "code": "offshore_pin", "group": "location",
            "strength": round(min(1.0, 0.5 + r["land_dist_km"] / 20), 2),
            "value": r["land_dist_km"],
            "text": f"The pin is {r['land_dist_km']:,.1f} km from the nearest shoreline, at sea.",
            "benign": "Coastal works such as seawalls sit at the shore; a small coordinate error can push them offshore.",
        })
    if r.get("w_status") == "matched" and r.get("w_through_stated") and r["w_dist_km"] > T["waterway_far_km"]:
        s.append({
            "code": "far_from_named_waterway", "group": "location",
            "strength": round(min(0.9, 0.35 + math.log10(r["w_dist_km"]) / 3), 2),
            "value": r["w_dist_km"],
            "text": f"The title names {r['waterway']}, which OpenStreetMap maps through the stated municipality, but the pin is {r['w_dist_km']:,.1f} km from it.",
            "benign": "OpenStreetMap may only map part of the river, or the structure may protect a tributary with a similar name.",
        })
    if r["pin_decimals"] <= T["coarse_decimals"]:
        s.append({
            "code": "coarse_pin", "group": "location",
            "strength": 0.4,
            "value": int(r["pin_decimals"]),
            "text": f"Coordinates are recorded with only {int(r['pin_decimals'])} decimal places (about 1 km precision), which looks like a placeholder.",
            "benign": "The site may simply have been geotagged coarsely.",
        })
    d = dup_info.get(i)
    if d and d["dup_multi_muni"]:
        s.append({
            "code": "pin_shared_across_municipalities", "group": "location",
            "strength": 0.7,
            "value": len(d["dup_ids"]),
            "text": f"This exact pin is shared with {len(d['dup_ids'])} other contract(s) that name a different municipality.",
            "benign": "A default or copied coordinate may have been reused during encoding.",
        })
    if d and d["dup_diff_title"] > 0:
        same_year = d["dup_same_year"]
        benign = "Multi-phase or multi-package works on one site can legitimately share a pin."
        if d["dup_same_project"]:
            benign = "Components of the same project ID share a site by design."
        strength = 0.45 + 0.1 * min(same_year, 4) + (0.1 if d["dup_same_amount"] else 0)
        if d["dup_phased"] or d["dup_same_project"]:
            strength -= 0.2
        s.append({
            "code": "shared_pin", "group": "risk",
            "strength": round(max(0.2, min(0.95, strength)), 2),
            "value": len(d["dup_ids"]),
            "text": (f"{len(d['dup_ids'])} other contract(s) with different titles use this exact pin"
                     + (f", {same_year} of them funded in the same year" if same_year else "")
                     + (", one with an identical contract amount" if d["dup_same_amount"] else "")
                     + f". Combined value at this pin: {peso(d['dup_total_cost'])}."),
            "benign": benign,
        })
    run = run_info.get(i)
    if run:
        s.append({
            "code": "consecutive_contracts", "group": "risk",
            "strength": 0.55,
            "value": len(run["ids"]),
            "text": (f"{len(run['ids'])} contracts with consecutive numbers ({run['cids'][0]} to {run['cids'][-1]}) "
                     f"cover the same site, together worth {peso(run['total'])}."),
            "benign": "Long river walls are sometimes tendered as separate lots when one contractor lacks capacity for the whole length.",
        })
    cl = cluster_info.get(i)
    if cl:
        yr = cl["years"][0] if len(cl["years"]) == 1 else f"{cl['years'][0]} to {cl['years'][-1]}"
        s.append({
            "code": "barangay_concentration", "group": "risk",
            "strength": round(min(0.6, 0.25 + 0.02 * (cl["n"] - T["brgy_cluster_min"])), 2),
            "value": cl["n"],
            "text": f"{cl['n']} separate contracts name Barangay {r['barangay']} ({yr}), totalling {peso(cl['total'])}.",
            "benign": "Barangays on major rivers can need many phased works over several years.",
        })
    if not pd.isna(r["cpm_z"]) and r["cpm_z"] >= T["cost_z"]:
        s.append({
            "code": "cost_per_metre_outlier", "group": "risk",
            "strength": round(min(0.9, 0.3 + r["cpm_z"] / 15), 2),
            "value": round(float(r["cpm"])),
            "text": f"About {peso(r['cpm'])} per metre over {r['length_m']:,.0f} m, versus a median of {peso(r['cpm_median'])} for {r['family']} works.",
            "benign": "Deep foundations, sheet piling, pumps or difficult terrain raise cost per metre; the title may list only part of the length.",
        })
    if r["abc_ratio"] > T["above_abc_ratio"]:
        s.append({
            "code": "above_budget_ceiling", "group": "risk",
            "strength": round(min(0.8, 0.35 + (r["abc_ratio"] - 1) * 5), 2),
            "value": float(r["abc_ratio"]),
            "text": f"Contract cost is {(r['abc_ratio'] - 1) * 100:.2f}% above the approved budget for the contract (ABC), which is normally the bidding ceiling.",
            "benign": "Approved variation orders after award can raise the final contract cost.",
        })
    dd = r["duration_days"]
    if not pd.isna(dd) and dd < T["short_days"] and r["ContractCost"] >= T["short_min_cost"]:
        s.append({
            "code": "implausibly_short", "group": "risk",
            "strength": 0.5,
            "value": int(dd),
            "text": f"A {peso(r['ContractCost'])} contract recorded as completed {int(dd)} days after it started.",
            "benign": "The start date may reflect a later phase or a re-encoded record.",
        })
    return s


def nz(v):
    """pandas NaN/NA -> None so the JSON stays valid."""
    if v is None or v is pd.NA:
        return None
    if isinstance(v, float) and math.isnan(v):
        return None
    return v


records = [{k: nz(v) for k, v in rec.items()} for rec in df.to_dict("records")]
all_signals = [signals_for(r) for r in records]

cost_pct = df["ContractCost"].rank(pct=True).to_numpy()


def label_for(r, sig):
    loc = [x for x in sig if x["group"] == "location"]
    risk = [x for x in sig if x["group"] == "risk"]
    if loc:
        return "records"
    if risk:
        return "field"
    if pd.isna(r["stated_mid"]):
        return "insufficient"
    return "low"


def location_status(r):
    if pd.isna(r["stated_mid"]):
        return "unknown"
    md = r["muni_dist_km"]
    if md <= 0:
        return "inside"
    if md <= T["muni_near_km"]:
        return "boundary"
    if md <= T["muni_far_km"]:
        return "adjacent"
    return "outside"


out = []
for r, sig in zip(records, all_signals):
    lab = label_for(r, sig)
    base = sum(x["strength"] for x in sig)
    score = round(100 * (1 - math.exp(-base)) * (0.65 + 0.35 * cost_pct[r["i"]])) if sig else 0
    am = r["actual_mid"]
    if pd.isna(am) and not pd.isna(r.get("nearest_mid")):
        am = r["nearest_mid"]
    out.append({
        "i": int(r["i"]),
        "cid": r["ContractID"],
        "pid": r["ProjectID"],
        "t": r["ProjectDescription"],
        "w": r["TypeofWork"],
        "rg": r["Region"],
        "pv": r["Province"],
        "mu": r["Municipality"] or r["stated_name"] or None,
        "deo": r["DistrictEngineeringOffice"],
        "co": r["Contractor"],
        "c": round(float(r["ContractCost"]), 2),
        "abc": round(float(r["ABC"]), 2),
        "fy": r["FundingYear"],
        "sd": r["StartDate"],
        "cd": r["CompletionDateActual"],
        "lat": round(float(r["Latitude"]), 6),
        "lon": round(float(r["Longitude"]), 6),
        "sm": None if pd.isna(r["stated_mid"]) else int(r["stated_mid"]),
        "fm": None if r["field_mid"] is None else int(r["field_mid"]),
        "tm": None if r["title_mid"] is None else int(r["title_mid"]),
        "am": None if pd.isna(am) else int(am),
        "md": None if pd.isna(r["muni_dist_km"]) else float(r["muni_dist_km"]),
        "ls": location_status(r),
        "ww": r["waterway"],
        "wn": r.get("w_name") if isinstance(r.get("w_name"), str) else None,
        "wd": None if pd.isna(r.get("w_dist_km")) else float(r["w_dist_km"]),
        "wp": r.get("w_near") if isinstance(r.get("w_near"), list) else None,
        "wst": r.get("w_status") if isinstance(r.get("w_status"), str) else "none",
        "br": r["barangay"],
        "len": None if pd.isna(r["length_m"]) else float(r["length_m"]),
        "ph": r["phase"],
        "dup": dup_info.get(r["i"], {}).get("dup_ids", []),
        "run": [j for j in run_info.get(r["i"], {}).get("ids", []) if j != r["i"]],
        "cl": [j for j in cluster_info.get(r["i"], {}).get("ids", []) if j != r["i"]],
        "L": lab,
        "s": score,
        "sig": sig,
    })

out.sort(key=lambda x: -x["s"])
rank = {"records": 0, "field": 0, "low": 0, "insufficient": 0}
for o in out:
    rank[o["L"]] += 1
    o["rk"] = rank[o["L"]]
out.sort(key=lambda x: x["i"])

# ---------- summary ----------
lab_counts = pd.Series([o["L"] for o in out]).value_counts().to_dict()
sig_counts = pd.Series([x["code"] for o in out for x in o["sig"]]).value_counts().to_dict()
cost_by_label = defaultdict(float)
for o in out:
    cost_by_label[o["L"]] += o["c"]
summary = {
    "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    "source": "DPWH flood control projects published via sumbongsapangulo.ph (mirror: github.com/rukku/sumbongsapangulo.ph-datasets)",
    "records": len(out),
    "total_cost": round(float(df["ContractCost"].sum())),
    "funding_years": sorted(df["FundingYear"].dropna().unique().tolist()),
    "labels": lab_counts,
    "cost_by_label": {k: round(v) for k, v in cost_by_label.items()},
    "signals": sig_counts,
    "stated_resolved": int(df["stated_mid"].notna().sum()),
    "waterway_named": int(df["waterway"].notna().sum()),
    "waterway_matched": int((df.get("w_status") == "matched").sum()),
    "dup_pins": int(len(groups)),
    "dup_projects": int(sum(len(v) for v in groups)),
    "at_abc_share": round(float((df["abc_ratio"] >= 0.999).mean()), 4),
    "thresholds": T,
    "regions": sorted(df["Region"].dropna().unique().tolist()),
    "work_types": df["TypeofWork"].value_counts().index.tolist(),
}

WEB_DATA.mkdir(parents=True, exist_ok=True)
native = lambda o: o.item() if hasattr(o, "item") else str(o)
(WEB_DATA / "projects.json").write_text(
    json.dumps(out, ensure_ascii=False, separators=(",", ":"), default=native, allow_nan=False), encoding="utf-8")
(WEB_DATA / "summary.json").write_text(
    json.dumps(summary, ensure_ascii=False, indent=1, default=native, allow_nan=False), encoding="utf-8")

flat = pd.DataFrame([{
    "rank_in_label": o["rk"], "label": o["L"], "priority_score": o["s"], "contract_id": o["cid"], "project_id": o["pid"],
    "title": o["t"], "type_of_work": o["w"], "region": o["rg"], "province": o["pv"], "municipality": o["mu"],
    "latitude": o["lat"], "longitude": o["lon"], "km_outside_stated_municipality": o["md"], "location_status": o["ls"],
    "named_waterway": o["ww"], "km_from_named_waterway": o["wd"], "contract_cost_php": o["c"], "abc_php": o["abc"],
    "funding_year": o["fy"], "signals": "; ".join(x["code"] for x in o["sig"]),
} for o in out])
(ROOT / "data" / "out").mkdir(parents=True, exist_ok=True)
flat.sort_values(["label", "rank_in_label"]).to_csv(ROOT / "data" / "out" / "groundtruth_triage.csv", index=False)

print(json.dumps({k: summary[k] for k in ("records", "labels", "signals", "stated_resolved", "waterway_named",
                                          "waterway_matched", "dup_pins", "dup_projects", "at_abc_share")}, indent=1))
print("projects.json MB:", round((WEB_DATA / "projects.json").stat().st_size / 1e6, 2))
