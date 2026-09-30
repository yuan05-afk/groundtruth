"""Day 1 feasibility: is the public flood control dataset good enough for location triage?"""
import json
import random
from collections import Counter
from pathlib import Path

import geopandas as gpd
import pandas as pd

RAW = Path(__file__).resolve().parents[1] / "data" / "raw"

gdf = gpd.read_file(RAW / "ssp" / "flood_control_projects.geojson")
df = pd.DataFrame(gdf.drop(columns="geometry"))

print(f"rows: {len(df)}")
print("\nnull % per column:")
print((df.isna().mean() * 100).round(1).sort_values(ascending=False).to_string())

lat, lon = df["Latitude"], df["Longitude"]
valid = lat.between(4.5, 21.5) & lon.between(116, 127)
print(f"\nvalid PH coordinates: {valid.mean():.1%} ({valid.sum()})")

coords = df.loc[valid, ["Latitude", "Longitude"]].round(5).apply(tuple, axis=1)
counts = Counter(coords)
dupe_points = {c: n for c, n in counts.items() if n > 1}
print(f"coordinate pairs shared by >1 project: {len(dupe_points)} "
      f"covering {sum(dupe_points.values())} projects")

print(f"\nunique ProjectID: {df['ProjectID'].nunique()}  unique ContractID: {df['ContractID'].nunique()}")
print(f"ContractCost present: {df['ContractCost'].notna().mean():.1%}")
print(f"total ContractCost: PHP {df['ContractCost'].sum():,.0f}")
print("\nTypeofWork:")
print(df["TypeofWork"].value_counts().head(15).to_string())
print("\nFundingYear:")
print(df["FundingYear"].value_counts().sort_index().to_string())

adm3 = gpd.read_file(RAW / "adm3.geojson")
print(f"\nadm3 units: {len(adm3)}  columns: {list(adm3.columns)}")
print(adm3.head(3).drop(columns='geometry').to_string())

random.seed(7)
print("\n20 sample descriptions:")
for i in random.sample(range(len(df)), 20):
    r = df.iloc[i]
    print(f"- [{r['Municipality']}] {r['ProjectDescription']}")
