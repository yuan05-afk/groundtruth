import { useEffect, useState } from 'react'
import {
  type Label,
  type Project,
  LABELS,
  SIGNALS,
  fmtKm,
  fmtPeso,
  fmtPesoShort,
  loadMunicipalities,
  municipalityLabel,
  titleCase,
} from '../lib/data'

type Names = Map<number, { name: string; province: string }>
let namesCache: Promise<Names> | null = null
function loadNames() {
  namesCache ??= loadMunicipalities().then(
    (fc) => new Map(fc.features.map((f: { properties: { mid: number; name: string; province: string } }) => [f.properties.mid, { name: f.properties.name, province: f.properties.province }])),
  )
  return namesCache
}

const NEXT_STEP: Record<Label, (p: Project) => string> = {
  records: (p) =>
    `Desk check. Ask the ${p.deo} to confirm the coordinates and municipality for ${p.cid} before scheduling a visit. If the corrected pin still shows nothing on imagery, move it to the field list.`,
  field: (p) =>
    `Site visit. Confirm a structure exists at the pin and matches the described work${p.len ? `, about ${Math.round(p.len)} m long` : ''}. Check the related contracts listed below on the same trip.`,
  low: () => 'No action suggested by the records. Include in routine random sampling.',
  insufficient: () => 'Resolve the municipality first. The location fields in this record could not be matched to a boundary.',
}

function days(a: string | null, b: string | null) {
  if (!a || !b) return null
  const [m, d, y] = a.split('/').map(Number)
  const start = new Date(y, m - 1, d)
  const end = new Date(b)
  const n = Math.round((end.getTime() - start.getTime()) / 86400000)
  return Number.isFinite(n) ? n : null
}

type Props = {
  project: Project
  byIndex: Map<number, Project>
  labelTotal: number
  onClose: () => void
  onSelect: (i: number) => void
}

export function EvidenceCard({ project: p, byIndex, labelTotal, onClose, onSelect }: Props) {
  const [names, setNames] = useState<Names | null>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    loadNames().then(setNames)
  }, [])
  useEffect(() => setCopied(false), [p.i])

  const nm = (m: number | null) => {
    if (m === null) return null
    const n = names?.get(m)
    return n ? `${n.name}, ${n.province}` : '...'
  }
  const duration = days(p.sd, p.cd)
  const ratio = p.abc ? p.c / p.abc : null
  const related: { title: string; ids: number[] }[] = [
    { title: 'Same exact pin', ids: p.dup },
    { title: 'Consecutive contract numbers', ids: p.run },
    { title: `Same barangay${p.br ? ` (${p.br})` : ''}`, ids: p.cl.filter((i) => !p.dup.includes(i) && !p.run.includes(i)) },
  ].filter((g) => g.ids.length)

  const copyLink = async () => {
    const url = `${location.origin}${location.pathname}#/queue/${p.i}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const statusText: Record<Project['ls'], string> = {
    inside: 'Inside the claimed municipality',
    boundary: 'On the boundary of the claimed municipality (within 1 km)',
    adjacent: 'Just outside the claimed municipality (1 to 3 km)',
    outside: `Outside every claimed municipality, ${p.md !== null ? fmtKm(p.md) : ''}`,
    unknown: 'Claimed municipality could not be resolved',
  }

  return (
    <aside className="card" aria-label="Evidence card">
      <div className="card-head">
        <div className="card-head-row">
          <span className={`chip chip-${p.L}`}>{LABELS[p.L].name}</span>
          <span className="card-rank">
            {p.L === 'low' || p.L === 'insufficient' ? '' : `Rank ${p.rk} of ${labelTotal}`}
          </span>
          <button className="icon-btn" onClick={onClose} aria-label="Close evidence card">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>
        <h2 className="card-title">{p.t}</h2>
        <div className="card-sub">
          <span className="mono">{p.cid}</span>
          <span>{municipalityLabel(p) || titleCase(p.pv)}</span>
          <span>{p.fy}</span>
        </div>
        {p.s > 0 && (
          <div className="score" title="Priority score, 0 to 100">
            <div className="score-bar">
              <div className={`score-fill fill-${p.L}`} style={{ width: `${p.s}%` }} />
            </div>
            <span className="mono">{p.s}</span>
          </div>
        )}
      </div>

      <div className="card-body">
        <section className="card-section">
          <h3>Next step</h3>
          <p className="next-step">{NEXT_STEP[p.L](p)}</p>
        </section>

        <section className="card-section">
          <h3>Where the record says it is, and where the pin is</h3>
          <dl className="claims">
            <div>
              <dt>Municipality field</dt>
              <dd>
                {p.mu ? titleCase(p.mu) : <span className="muted">blank</span>}
                {p.fm !== null && <span className="claims-resolved">resolved to {nm(p.fm)}</span>}
              </dd>
            </div>
            <div>
              <dt>Named in the title</dt>
              <dd>{p.tm !== null ? nm(p.tm) : <span className="muted">no place matched</span>}</dd>
            </div>
            <div>
              <dt>Pin falls in</dt>
              <dd>
                {p.am !== null ? nm(p.am) : <span className="muted">no municipality</span>}
                <span className={`claims-status status-${p.ls}`}>{statusText[p.ls]}</span>
              </dd>
            </div>
            {p.ww && (
              <div>
                <dt>River in the title</dt>
                <dd>
                  {p.ww}
                  <span className="claims-resolved">
                    {p.wst === 'matched' && p.wd !== null
                      ? `${p.wn} on OpenStreetMap, ${fmtKm(p.wd)} from the pin`
                      : 'not found on OpenStreetMap near the claimed town'}
                  </span>
                </dd>
              </div>
            )}
            <div>
              <dt>Coordinates</dt>
              <dd className="mono">
                {p.lat.toFixed(5)}, {p.lon.toFixed(5)}
              </dd>
            </div>
          </dl>
        </section>

        <section className="card-section">
          <h3>{p.sig.length ? `Signals (${p.sig.length})` : 'Signals'}</h3>
          {p.sig.length === 0 && <p className="muted">No check fired for this record.</p>}
          <ol className="signals">
            {[...p.sig]
              .sort((a, b) => b.strength - a.strength)
              .map((s) => (
                <li key={s.code} className={`signal signal-${s.group}`}>
                  <div className="signal-head">
                    <span className="signal-name">{SIGNALS[s.code]?.name ?? s.code}</span>
                    <span className="signal-kind">{s.group === 'location' ? 'Location' : 'Pattern'}</span>
                  </div>
                  <span className="signal-code">{SIGNALS[s.code]?.code ?? s.code.toUpperCase()}</span>
                  <p>{s.text}</p>
                  <p className="benign">
                    <span>Possible innocent explanation.</span> {s.benign}
                  </p>
                </li>
              ))}
          </ol>
        </section>

        {related.map((g) => (
          <section className="card-section" key={g.title}>
            <h3>
              {g.title} <span className="count">{g.ids.length}</span>
            </h3>
            <ul className="related">
              {g.ids.slice(0, 12).map((i) => {
                const r = byIndex.get(i)
                if (!r) return null
                return (
                  <li key={i}>
                    <button onClick={() => onSelect(i)} className="related-row">
                      <i className={`dot dot-${r.L}`} aria-hidden="true" />
                      <span className="mono">{r.cid}</span>
                      <span className="related-title">{r.t}</span>
                      <span className="mono related-amt">{fmtPesoShort(r.c)}</span>
                    </button>
                  </li>
                )
              })}
              {g.ids.length > 12 && <li className="muted related-more">and {g.ids.length - 12} more</li>}
            </ul>
          </section>
        ))}

        <section className="card-section">
          <h3>The record</h3>
          <dl className="facts">
            <div>
              <dt>Contract cost</dt>
              <dd className="mono">{fmtPeso(p.c)}</dd>
            </div>
            <div>
              <dt>Approved budget (ABC)</dt>
              <dd className="mono">
                {fmtPeso(p.abc)}
                {ratio !== null && <span className="muted"> ({(ratio * 100).toFixed(2)}%)</span>}
              </dd>
            </div>
            <div>
              <dt>Type of work</dt>
              <dd>{p.w}</dd>
            </div>
            <div>
              <dt>Funding year</dt>
              <dd className="mono">{p.fy}</dd>
            </div>
            <div>
              <dt>Started, completed</dt>
              <dd className="mono">
                {p.sd ?? '?'} to {p.cd ?? '?'}
                {duration !== null && <span className="muted"> ({duration} days)</span>}
              </dd>
            </div>
            <div>
              <dt>Project ID</dt>
              <dd className="mono">{p.pid}</dd>
            </div>
            <div>
              <dt>Implementing office</dt>
              <dd>{p.deo}</dd>
            </div>
            <div>
              <dt>Contractor, as recorded</dt>
              <dd>{p.co}</dd>
            </div>
            <div>
              <dt>Region, province</dt>
              <dd>
                {p.rg}, {titleCase(p.pv)}
              </dd>
            </div>
          </dl>
        </section>

        <div className="card-actions">
          <button className="btn btn-small" onClick={copyLink}>
            {copied ? 'Link copied' : 'Copy link to this card'}
          </button>
          <a
            className="btn btn-small btn-quiet"
            href={`https://www.google.com/maps/@${p.lat},${p.lon},600m/data=!3m1!1e3`}
            target="_blank"
            rel="noreferrer"
          >
            Open pin in Google Maps
          </a>
        </div>
        <p className="card-disclaimer">
          A flag means this record needs verification. It is not a finding that the project is missing, overpriced or
          improper, and it says nothing about any person or company. Source: DPWH record published via Sumbong sa Pangulo.
        </p>
      </div>
    </aside>
  )
}
