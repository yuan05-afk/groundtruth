"""Rule-based parser for DPWH project titles (mixed English/Filipino place names)."""
import re

from common import fold

WATER_WORDS = r"(?:River|Creek|Channel|Canal|Floodway|Estero|Stream|Spillway|Tributary|Riverbank|Waterway|Lake)"
NAME_TOKEN = r"(?<!\w)(?:[A-Z][\w\.'\u00f1\u00d1-]*|de|del|dela|de la|ng|sa)(?!\w)"

# "along Angat River", "Maricaban Creek", "Lake Mainit- Tubay River", "Lagasit River"
RE_NAMED_BEFORE = re.compile(rf"((?:{NAME_TOKEN}\s+){{0,4}}?{NAME_TOKEN})\s+{WATER_WORDS}\b")
# "Estero dela Reina", "Ilog Pasig", "River of X"
RE_NAMED_AFTER = re.compile(rf"\b(Estero|Ilog|Sapa|Lake)\s+((?:de|del|dela|de la|ng|sa)?\s*{NAME_TOKEN}(?:\s+{NAME_TOKEN}){{0,2}})")

RE_BRGY = re.compile(r"\b(?:Brgy\.?|Bgy\.?|Barangay|Barangays)\s+([^,;()]+)", re.IGNORECASE)
RE_STA = re.compile(r"Sta\.?\s*(\d{1,3})\s*\+\s*(\d{1,3}(?:\.\d+)?)\s*(?:-|to|–)\s*(?:Sta\.?\s*)?(\d{1,3})\s*\+\s*(\d{1,3}(?:\.\d+)?)", re.IGNORECASE)
RE_LEN = re.compile(r"(?:L\s*=\s*|length\s*(?:of\s*)?)(\d[\d,]*(?:\.\d+)?)\s*(?:l\.?m\.?|m\b|meters|lm)", re.IGNORECASE)
RE_PHASE = re.compile(r"\b(Phase|Package|Pkg|Section|Stage|Segment|Contract)\s*([IVXLC]+|\d+|[A-Z])\b", re.IGNORECASE)

GENERIC_NAMES = {
    "flood", "control", "the", "along", "of", "and", "construction", "rehabilitation", "structure",
    "mitigation", "drainage", "protection", "major", "repair", "improvement", "concrete", "reinforced",
    "flood control", "river", "creek", "upstream", "downstream", "left", "right", "bank", "national",
    "road", "bridge", "package", "phase", "section", "slope", "revetment", "dike", "system", "project",
    "riverbank", "embankment", "retaining", "wall", "seawall", "channel", "canal", "main",
}
LEADING_NOISE = re.compile(
    r"^(?:(?:Construction|Rehabilitation|Improvement|Repair|Structure|Structures|Control|Flood|Mitigation|"
    r"Drainage|Protection|Along|Of|At|In|The|And|With|Desilting|Bank|Riverbank|Revetment|Dike|Wall|Slope|"
    r"Reinforced|Concrete|Major|Upstream|Downstream|Left|Right|Proposed|Continuation|Completion|Rehab)\s+)+",
    re.IGNORECASE,
)


def _clean_water_name(raw: str) -> str | None:
    name = LEADING_NOISE.sub("", raw.strip(" ,.-"))
    name = re.sub(rf"\s*-?\s*{WATER_WORDS}$", "", name)
    name = re.sub(r"\s*-\s*", "-", name)
    name = re.sub(r"\s+", " ", name).strip(" ,.-")
    if not name or fold(name) in GENERIC_NAMES or len(name) < 3:
        return None
    if all(fold(w) in GENERIC_NAMES for w in name.split()):
        return None
    return name


def waterway_name(title: str) -> str | None:
    for m in RE_NAMED_AFTER.finditer(title):
        name = _clean_water_name(m.group(2))
        if name:
            return name
    for m in RE_NAMED_BEFORE.finditer(title):
        name = _clean_water_name(m.group(1))
        if name:
            return name
    return None


def barangay(title: str) -> str | None:
    m = RE_BRGY.search(title)
    if not m:
        return None
    name = re.split(r"\s+(?:and|to|&)\s+|\s+-\s+", m.group(1).strip())[0].strip(" .")
    return name or None


def length_m(title: str) -> float | None:
    total = 0.0
    for a, b, c, d in RE_STA.findall(title):
        start = int(a) * 1000 + float(b)
        end = int(c) * 1000 + float(d)
        span = abs(end - start)
        if 0 < span < 20000:
            total += span
    if total:
        return round(total, 1)
    m = RE_LEN.search(title)
    if m:
        value = float(m.group(1).replace(",", ""))
        if 0 < value < 20000:
            return value
    return None


def phase_marker(title: str) -> str | None:
    m = RE_PHASE.search(title)
    return f"{m.group(1).title()} {m.group(2).upper()}" if m else None


def tail_places(title: str) -> list[str]:
    """Last comma-separated segments, typically '..., Municipality, Province'."""
    parts = [p.strip(" .") for p in title.split(",") if p.strip(" .")]
    return parts[-3:]


def parse(title: str) -> dict:
    return {
        "waterway": waterway_name(title),
        "barangay": barangay(title),
        "length_m": length_m(title),
        "phase": phase_marker(title),
    }


if __name__ == "__main__":
    import random
    import sys
    from pathlib import Path

    import geopandas as gpd

    sys.stdout.reconfigure(encoding="utf-8")
    raw = Path(__file__).resolve().parents[1] / "data" / "raw" / "ssp" / "flood_control_projects.geojson"
    titles = gpd.read_file(raw)["ProjectDescription"].tolist()
    random.seed(int(sys.argv[1]) if len(sys.argv) > 1 else 7)
    sample = random.sample(titles, 40)
    for t in sample:
        print(t)
        print("   ->", parse(t))
    parsed = [parse(t) for t in titles]
    for key in ("waterway", "barangay", "length_m", "phase"):
        print(f"{key}: {sum(1 for p in parsed if p[key]) / len(parsed):.1%} filled")
