import { useVirtualizer } from '@tanstack/react-virtual'
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { EvidenceCard } from '../components/EvidenceCard'
import { MapView } from '../components/MapView'
import {
  type Label,
  type Project,
  type SignalCode,
  type Summary,
  LABELS,
  LABEL_ORDER,
  SIGNALS,
  fmtInt,
  fmtPesoShort,
  loadProjects,
  loadSummary,
  municipalityLabel,
  titleCase,
} from '../lib/data'
import { navigate } from '../lib/router'

type SortKey = 'priority' | 'amount' | 'distance'
const LABEL_RANK: Record<Label, number> = { records: 0, field: 1, low: 2, insufficient: 3 }

function toCsv(rows: Project[]) {
  const cols: [string, (p: Project) => string | number | null][] = [
    ['label', (p) => LABELS[p.L].name],
    ['rank_in_label', (p) => p.rk],
    ['priority_score', (p) => p.s],
    ['contract_id', (p) => p.cid],
    ['project_id', (p) => p.pid],
    ['title', (p) => p.t],
    ['type_of_work', (p) => p.w],
    ['region', (p) => p.rg],
    ['province', (p) => p.pv],
    ['municipality_field', (p) => p.mu],
    ['latitude', (p) => p.lat],
    ['longitude', (p) => p.lon],
    ['km_outside_claimed_municipality', (p) => p.md],
    ['named_waterway', (p) => p.ww],
    ['km_from_named_waterway', (p) => p.wd],
    ['contract_cost_php', (p) => p.c],
    ['abc_php', (p) => p.abc],
    ['funding_year', (p) => p.fy],
    ['implementing_office', (p) => p.deo],
    ['signals', (p) => p.sig.map((s) => SIGNALS[s.code]?.name ?? s.code).join('; ')],
    ['evidence', (p) => p.sig.map((s) => s.text).join(' | ')],
    ['card_url', (p) => `${location.origin}${location.pathname}#/queue/${p.i}`],
  ]
  const esc = (v: string | number | null) => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.map((c) => c[0]).join(','), ...rows.map((p) => cols.map(([, f]) => esc(f(p))).join(','))].join('\n')
}

export function Queue({ selectedId }: { selectedId: number | null }) {
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [label, setLabel] = useState<Label | 'flagged' | 'all'>('flagged')
  const [region, setRegion] = useState('')
  const [year, setYear] = useState('')
  const [signal, setSignal] = useState<SignalCode | ''>('')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('priority')
  const [basemap, setBasemap] = useState<'map' | 'satellite'>('map')
  const [capacity, setCapacity] = useState(0)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const deferredQuery = useDeferredValue(query)

  useEffect(() => {
    loadProjects().then(setProjects)
    loadSummary().then(setSummary)
  }, [])

  const byIndex = useMemo(() => new Map((projects ?? []).map((p) => [p.i, p])), [projects])
  const selected = selectedId !== null ? (byIndex.get(selectedId) ?? null) : null

  const filtered = useMemo(() => {
    if (!projects) return []
    const q = deferredQuery.trim().toLowerCase()
    const rows = projects.filter((p) => {
      if (label === 'flagged' && p.L !== 'records' && p.L !== 'field') return false
      if (label !== 'flagged' && label !== 'all' && p.L !== label) return false
      if (region && p.rg !== region) return false
      if (year && p.fy !== year) return false
      if (signal && !p.sig.some((s) => s.code === signal)) return false
      if (q) {
        const hay = `${p.t} ${p.cid} ${p.pid} ${p.mu ?? ''} ${p.pv} ${p.deo}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    const sorters: Record<SortKey, (a: Project, b: Project) => number> = {
      priority: (a, b) => LABEL_RANK[a.L] - LABEL_RANK[b.L] || b.s - a.s || b.c - a.c,
      amount: (a, b) => b.c - a.c,
      distance: (a, b) => (b.md ?? -1) - (a.md ?? -1),
    }
    const sorted = rows.sort(sorters[sort])
    if (capacity > 0) return sorted.slice(0, capacity)
    return sorted
  }, [projects, label, region, year, signal, deferredQuery, sort, capacity])

  const related = useMemo(() => {
    if (!selected) return []
    const ids = new Set([...selected.dup, ...selected.run])
    return [...ids].map((i) => byIndex.get(i)).filter((x): x is Project => !!x)
  }, [selected, byIndex])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, flagged: 0, records: 0, field: 0, low: 0, insufficient: 0 }
    for (const p of projects ?? []) {
      c.all++
      c[p.L]++
      if (p.L === 'records' || p.L === 'field') c.flagged++
    }
    return c
  }, [projects])

  const listRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 104,
    overscan: 8,
  })

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 })
  }, [label, region, year, signal, deferredQuery, sort, capacity])

  const select = (i: number) => navigate(`#/queue/${i}`)
  const close = () => navigate('#/queue')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedId !== null) close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId])

  const exportCsv = () => {
    const blob = new Blob(['\ufeff' + toCsv(filtered)], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `groundtruth-${label}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const tabs: { key: Label | 'flagged' | 'all'; text: string }[] = [
    { key: 'flagged', text: 'Flagged' },
    { key: 'records', text: LABELS.records.short },
    { key: 'field', text: LABELS.field.short },
    { key: 'all', text: 'All' },
  ]

  const signalOptions = summary
    ? (Object.keys(SIGNALS) as SignalCode[]).filter((c) => summary.signals[c]).sort((a, b) => summary.signals[b] - summary.signals[a])
    : []

  const totalCost = filtered.reduce((acc, p) => acc + p.c, 0)

  return (
    <main className="queue">
      <section className="panel">
        <div className="panel-head">
          <div className="queue-framing">
            <p className="queue-kicker">Inspection queue</p>
            <p className="queue-promise">
              Pins that disagree with the claim, sorted so desk checks and site visits start with the strongest cases.
            </p>
          </div>
          <div className="tabs" role="tablist" aria-label="Label">
            {tabs.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={label === t.key}
                className={label === t.key ? 'tab active' : 'tab'}
                onClick={() => setLabel(t.key)}
              >
                {t.key !== 'flagged' && t.key !== 'all' && <i className={`dot dot-${t.key}`} aria-hidden="true" />}
                {t.text}
                <span className="tab-count">{fmtInt(counts[t.key] ?? 0)}</span>
              </button>
            ))}
          </div>
          <div className="filters">
            <input
              className="search"
              type="search"
              placeholder="Search title, contract ID, town, office"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search"
            />
            <button
              type="button"
              className="filter-toggle"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((v) => !v)}
            >
              {filtersOpen ? 'Hide filters' : 'More filters'}
              {(region || year || signal) && <span className="mono"> (on)</span>}
            </button>
            <div className={filtersOpen ? 'filter-drawer open' : 'filter-drawer'}>
              <div className="filter-row">
                <select value={region} onChange={(e) => setRegion(e.target.value)} aria-label="Region">
                  <option value="">All regions</option>
                  {summary?.regions.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <select value={year} onChange={(e) => setYear(e.target.value)} aria-label="Funding year">
                  <option value="">All years</option>
                  {summary?.funding_years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                <select value={signal} onChange={(e) => setSignal(e.target.value as SignalCode | '')} aria-label="Signal">
                  <option value="">Any signal</option>
                  {signalOptions.map((c) => (
                    <option key={c} value={c}>
                      {SIGNALS[c].name} ({fmtInt(summary!.signals[c])})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="list-meta">
            <span>
              <strong className="mono">{fmtInt(filtered.length)}</strong> contracts,{' '}
              <span className="mono">{fmtPesoShort(totalCost)}</span>
            </span>
            <span className="list-meta-actions">
              <label className="sort">
                Sort
                <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                  <option value="priority">Priority</option>
                  <option value="amount">Amount</option>
                  <option value="distance">Distance from claim</option>
                </select>
              </label>
              <button className="btn btn-small btn-quiet" onClick={exportCsv} disabled={!filtered.length}>
                Export CSV
              </button>
            </span>
          </div>
        </div>

        <div className="list" ref={listRef}>
          {!projects && <div className="list-empty">Loading 9,855 records...</div>}
          {projects && !filtered.length && <div className="list-empty">No contracts match these filters.</div>}
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((v) => {
              const p = filtered[v.index]
              const top = [...p.sig].sort((a, b) => b.strength - a.strength).slice(0, 1)
              return (
                <button
                  key={p.i}
                  className={selectedId === p.i ? 'row active' : 'row'}
                  style={{ transform: `translateY(${v.start}px)`, height: v.size }}
                  onClick={() => select(p.i)}
                >
                  <span className={`row-rail rail-${p.L}`} aria-hidden="true" />
                  <span className="row-main">
                    <span className="row-title">{p.t}</span>
                    <span className="row-meta">
                      <span>{municipalityLabel(p) || titleCase(p.pv)}</span>
                      <span className="mono">{fmtPesoShort(p.c)}</span>
                      <span className="mono">{p.fy}</span>
                    </span>
                    {top.length > 0 && (
                      <span className="row-signals">
                        <span className={`tag tag-${top[0].group}`}>
                          {SIGNALS[top[0].code]?.name ?? top[0].code}
                        </span>
                        {p.sig.length > 1 && <span className="tag tag-more">+{p.sig.length - 1}</span>}
                      </span>
                    )}
                  </span>
                  <span className="row-score mono" title="Priority score">
                    {p.s > 0 ? p.s : ''}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
        <div className="capacity-inline">
          <span>Inspect only</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
            aria-label="Inspector capacity"
          />
          <strong>{capacity === 0 ? 'all' : capacity}</strong>
        </div>
      </section>

      <section className="stage">
        <MapView
          points={filtered}
          selected={selected}
          related={related}
          basemap={basemap}
          onSelect={select}
          drawerOpen={!!selected}
        />
        <div className="map-controls">
          <div className="segmented" role="group" aria-label="Basemap">
            <button className={basemap === 'map' ? 'active' : ''} onClick={() => setBasemap('map')}>
              Map
            </button>
            <button className={basemap === 'satellite' ? 'active' : ''} onClick={() => setBasemap('satellite')}>
              Satellite
            </button>
          </div>
          <div className="legend" aria-label="Legend">
            {LABEL_ORDER.map((l) => (
              <span key={l}>
                <i className={`dot dot-${l}`} aria-hidden="true" />
                {LABELS[l].short}
              </span>
            ))}
            {selected && (
              <>
                <span>
                  <i className="legend-dash claimed" aria-hidden="true" />
                  Claimed town
                </span>
                <span>
                  <i className="legend-dash water" aria-hidden="true" />
                  Named river
                </span>
              </>
            )}
          </div>
        </div>
        {selected && (
          <EvidenceCard
            project={selected}
            byIndex={byIndex}
            labelTotal={summary?.labels[selected.L] ?? 0}
            onClose={close}
            onSelect={select}
          />
        )}
      </section>
    </main>
  )
}
