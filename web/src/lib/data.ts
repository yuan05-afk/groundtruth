export type Label = 'records' | 'field' | 'low' | 'insufficient'

export type Signal = {
  code: SignalCode
  group: 'location' | 'risk'
  strength: number
  value: number | null
  text: string
  benign: string
}

export type Project = {
  i: number
  cid: string
  pid: string
  t: string
  w: string
  rg: string
  pv: string
  mu: string | null
  deo: string
  co: string
  c: number
  abc: number
  fy: string
  sd: string | null
  cd: string | null
  lat: number
  lon: number
  sm: number | null
  fm: number | null
  tm: number | null
  am: number | null
  md: number | null
  ls: 'inside' | 'boundary' | 'adjacent' | 'outside' | 'unknown'
  ww: string | null
  wn: string | null
  wd: number | null
  wp: [number, number] | null
  wst: 'matched' | 'not_mapped' | 'none'
  br: string | null
  len: number | null
  ph: string | null
  dup: number[]
  run: number[]
  cl: number[]
  L: Label
  s: number
  rk: number
  sig: Signal[]
}

export type Summary = {
  generated: string
  source: string
  source_date?: string
  records: number
  total_cost: number
  funding_years: string[]
  labels: Record<Label, number>
  cost_by_label: Record<Label, number>
  signals: Record<string, number>
  stated_resolved: number
  waterway_named: number
  waterway_matched: number
  dup_pins: number
  dup_projects: number
  at_abc_share: number
  thresholds: Record<string, number>
  regions: string[]
  work_types: string[]
  amount_hist?: { edges: number[]; counts: number[] }
  exact_amounts?: Record<string, number>
  band_95_100?: number
  band_100_105?: number
  validation?: Validation
}

export type Validation = {
  parser_rows: number
  waterway_accuracy: number
  barangay_accuracy: number
  spot_checked: number
  spot_notes: string
}

export type Featured = {
  key: string
  headline: string
  project: Project
  shapes: Record<string, { name: string; province: string; geometry: GeoJSON.Geometry }>
}

export type MuniFeature = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, { mid: number; name: string; province: string }>

const cache = new Map<string, Promise<unknown>>()
function load<T>(path: string): Promise<T> {
  if (!cache.has(path)) {
    cache.set(
      path,
      fetch(`${import.meta.env.BASE_URL}data/${path}`).then((r) => {
        if (!r.ok) throw new Error(`Failed to load ${path}`)
        return r.json()
      }),
    )
  }
  return cache.get(path) as Promise<T>
}

export const loadSummary = () => load<Summary>('summary.json')
export const loadProjects = () => load<Project[]>('projects.json')
export const loadFeatured = () => load<Featured[]>('featured.json')
export const loadMunicipalities = () =>
  load<GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, { mid: number; name: string; province: string }>>(
    'municipalities.geojson',
  )

export const LABELS: Record<Label, { name: string; short: string; action: string; blurb: string }> = {
  records: {
    name: 'Records issue likely',
    short: 'Records issue',
    action: 'Desk check first',
    blurb: 'Where the pin sits does not match what the record says. Confirm the coordinates before sending anyone.',
  },
  field: {
    name: 'Field priority',
    short: 'Field priority',
    action: 'Site visit candidate',
    blurb: 'The location holds up, but the contract pattern is unusual. These are the best candidates for a site visit.',
  },
  low: {
    name: 'Low priority',
    short: 'Low priority',
    action: 'No signals',
    blurb: 'Location is consistent and no signal fired. Not proof of anything, just lower in the queue.',
  },
  insufficient: {
    name: 'Insufficient data',
    short: 'Insufficient',
    action: 'Cannot place',
    blurb: 'No municipality could be resolved from the record, so the location cannot be checked.',
  },
}

export const LABEL_ORDER: Label[] = ['records', 'field', 'low', 'insufficient']

export type SignalCode =
  | 'outside_stated_municipality'
  | 'record_fields_disagree'
  | 'offshore_pin'
  | 'far_from_named_waterway'
  | 'coarse_pin'
  | 'pin_shared_across_municipalities'
  | 'shared_pin'
  | 'consecutive_contracts'
  | 'barangay_concentration'
  | 'above_budget_ceiling'
  | 'cost_per_metre_outlier'
  | 'implausibly_short'

export const SIGNALS: Record<SignalCode, { name: string; rule: string; code: string }> = {
  outside_stated_municipality: {
    name: 'Pin outside the claimed town',
    code: 'OUTSIDE_CLAIMED_TOWN',
    rule: 'Pin is more than 3 km outside every municipality the record names.',
  },
  record_fields_disagree: {
    name: 'Record contradicts itself',
    code: 'FIELDS_DISAGREE',
    rule: 'The municipality field and the title name different towns, and the pin matches only one.',
  },
  offshore_pin: {
    name: 'Pin at sea',
    code: 'OFFSHORE_PIN',
    rule: 'Pin is more than 1 km from the nearest land.',
  },
  far_from_named_waterway: {
    name: 'Pin away from the named river',
    code: 'FAR_FROM_NAMED_RIVER',
    rule: 'The title names a river that OpenStreetMap maps through the claimed town, but the pin is more than 3 km from it.',
  },
  coarse_pin: {
    name: 'Placeholder-precision pin',
    code: 'COARSE_PIN',
    rule: 'Coordinates have two decimals or fewer (about 1 km).',
  },
  pin_shared_across_municipalities: {
    name: 'Same pin, different towns',
    code: 'PIN_CROSS_TOWN',
    rule: 'The exact pin is reused by contracts that name different municipalities.',
  },
  shared_pin: {
    name: 'Same pin, several contracts',
    code: 'SHARED_PIN',
    rule: 'Other contracts with different titles use the exact same coordinates.',
  },
  consecutive_contracts: {
    name: 'Consecutive contract numbers',
    code: 'CONSECUTIVE_IDS',
    rule: 'Three or more consecutive contract numbers from one office cover the same site.',
  },
  barangay_concentration: {
    name: 'Many contracts in one barangay',
    code: 'BARANGAY_CLUSTER',
    rule: 'Eight or more separate contracts name the same barangay.',
  },
  above_budget_ceiling: {
    name: 'Above the budget ceiling',
    code: 'ABOVE_ABC',
    rule: 'Contract cost is more than 0.5% above the approved budget for the contract (ABC).',
  },
  cost_per_metre_outlier: {
    name: 'Unusual cost per metre',
    code: 'COST_PER_M_OUTLIER',
    rule: 'Cost per metre is a robust outlier (z of 3 or more) for its type of work.',
  },
  implausibly_short: {
    name: 'Very short build time',
    code: 'SHORT_BUILD',
    rule: 'A contract of PHP 10M or more recorded as completed in under 30 days.',
  },
}

const peso0 = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 0 })
export const fmtInt = (n: number) => peso0.format(n)
export const fmtPeso = (n: number) => `₱${peso0.format(n)}`
export function fmtPesoShort(n: number) {
  if (n >= 1e9) return `₱${(n / 1e9).toFixed(n >= 1e11 ? 0 : 1)}B`
  if (n >= 1e6) return `₱${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `₱${(n / 1e3).toFixed(0)}K`
  return `₱${n.toFixed(0)}`
}
export const fmtKm = (n: number) => (n >= 100 ? `${fmtInt(n)} km` : `${n.toFixed(1)} km`)

export function titleCase(s: string | null | undefined) {
  if (!s) return ''
  return s
    .toLowerCase()
    .replace(/\b([a-zñ])/g, (m) => m.toUpperCase())
    .replace(/\b(Of|De|Del|Dela|And)\b/g, (m) => m.toLowerCase())
}

export function municipalityLabel(p: Project) {
  const m = p.mu ? p.mu.replace(/\s*\((?:CAPITAL)\)/g, '') : ''
  const clean = m.replace(/\s*\([^)]*\)\s*$/, '')
  return titleCase(clean || '')
}

export function projectHash(i: number) {
  return `#/queue/${i}`
}
