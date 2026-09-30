import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
INTERIM = ROOT / "data" / "interim"
WEB_DATA = ROOT.parent / "web" / "public" / "data"

# Philippine UTM zone 51N keeps distance error small across the archipelago.
METRIC_CRS = "EPSG:32651"

_PARENS = re.compile(r"\([^)]*\)")
_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def fold(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "")
    return "".join(c for c in text if not unicodedata.combining(c)).lower()


def place_key(name: str) -> str:
    """Canonical key for a municipality/city name, e.g. 'CITY OF BALIUAG (BULACAN)' -> 'baliuag'."""
    s = fold(_PARENS.sub(" ", name or ""))
    s = re.sub(r"\bsta\.?\s", "santa ", s)
    s = re.sub(r"\bsto\.?\s", "santo ", s)
    s = re.sub(r"\bstz\.?\s", "santa ", s)
    s = re.sub(r"\bgen\.?\s", "general ", s)
    s = re.sub(r"\bpres\.?\s", "president ", s)
    s = re.sub(r"\b(city of|municipality of|city|capital)\b", " ", s)
    return _NON_ALNUM.sub("", s)


PROVINCE_ALIASES = {
    "davaodeoro": "compostelavalley",
    "maguindanaodelnorte": "maguindanao",
    "maguindanaodelsur": "maguindanao",
    "cotabatonorthcotabato": "cotabato",
    "samarwesternsamar": "samar",
    "northcotabato": "cotabato",
    "westernsamar": "samar",
}


def province_key(name: str) -> str:
    raw = _NON_ALNUM.sub("", fold(name or ""))
    if raw in PROVINCE_ALIASES:
        return PROVINCE_ALIASES[raw]
    s = _NON_ALNUM.sub("", fold(_PARENS.sub(" ", name or "")))
    if s.startswith("ncr") or s == "metropolitanmanila":
        return "ncr"
    return PROVINCE_ALIASES.get(s, s)
