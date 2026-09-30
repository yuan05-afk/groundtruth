"""Extract named OpenStreetMap waterways (rivers, creeks, canals, esteros) for the Philippines."""
import geopandas as gpd
import osmium
from shapely import wkb

from common import RAW, INTERIM

KINDS = {"river", "stream", "canal", "drain", "ditch", "tidal_channel", "brook", "canal;drain"}

wkbfab = osmium.geom.WKBFactory()
rows = []

fp = (
    osmium.FileProcessor(str(RAW / "philippines-latest.osm.pbf"))
    .with_locations()
    .with_filter(osmium.filter.EntityFilter(osmium.osm.WAY))
    .with_filter(osmium.filter.KeyFilter("waterway"))
)

for way in fp:
    kind = way.tags.get("waterway")
    name = way.tags.get("name") or way.tags.get("name:en") or way.tags.get("alt_name")
    if kind not in KINDS or not name:
        continue
    try:
        geom = wkb.loads(wkbfab.create_linestring(way), hex=True)
    except Exception:
        continue
    rows.append({"osm_id": way.id, "name": name, "kind": kind, "geometry": geom})

gdf = gpd.GeoDataFrame(rows, geometry="geometry", crs="EPSG:4326")
gdf.to_parquet(INTERIM / "waterways.parquet")
print(f"saved {len(gdf)} named waterway segments, {gdf.name.nunique()} unique names")
print(gdf.kind.value_counts().to_string())
