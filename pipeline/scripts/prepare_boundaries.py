"""Simplify geoBoundaries ADM3 (municipalities/cities) and tag each with its ADM2 province."""
from pathlib import Path

import geopandas as gpd

from common import RAW, INTERIM, WEB_DATA

INTERIM.mkdir(parents=True, exist_ok=True)
WEB_DATA.mkdir(parents=True, exist_ok=True)

print("reading full ADM3 ...")
adm3 = gpd.read_file(RAW / "adm3_full.geojson", columns=["shapeName"], engine="pyogrio")
adm3 = adm3.rename(columns={"shapeName": "name"}).reset_index(drop=True)
adm3["mid"] = adm3.index.astype(int)

print("simplifying ...")
adm3["geometry"] = adm3.geometry.simplify(0.0002, preserve_topology=True).make_valid()

adm2 = gpd.read_file(RAW / "adm2.geojson")[["shapeName", "geometry"]].rename(columns={"shapeName": "province"})
reps = adm3.copy()
reps["geometry"] = adm3.geometry.representative_point()
joined = gpd.sjoin(reps, adm2, how="left", predicate="within")
joined = joined[~joined.index.duplicated()]
adm3["province"] = joined["province"].fillna("")

adm3.to_parquet(INTERIM / "municipalities.parquet")
print(f"saved {len(adm3)} municipalities, {adm3.province.eq('').sum()} without province")

web = adm3[["mid", "name", "province", "geometry"]].copy()
web["geometry"] = web.geometry.simplify(0.0015, preserve_topology=True)
web.to_file(WEB_DATA / "municipalities.geojson", driver="GeoJSON", COORDINATE_PRECISION=4)
print("web boundaries:", round((WEB_DATA / "municipalities.geojson").stat().st_size / 1e6, 2), "MB")
