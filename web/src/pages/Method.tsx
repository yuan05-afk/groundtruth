import { useEffect, useState } from 'react'
import { type SignalCode, type Summary, LABELS, LABEL_ORDER, SIGNALS, fmtInt, fmtPesoShort, loadSummary } from '../lib/data'

const LOCATION: SignalCode[] = [
  'outside_stated_municipality',
  'record_fields_disagree',
  'far_from_named_waterway',
  'pin_shared_across_municipalities',
  'coarse_pin',
  'offshore_pin',
]
const RISK: SignalCode[] = [
  'shared_pin',
  'consecutive_contracts',
  'barangay_concentration',
  'above_budget_ceiling',
  'cost_per_metre_outlier',
  'implausibly_short',
]

function SignalTable({ codes, summary }: { codes: SignalCode[]; summary: Summary }) {
  return (
    <table className="method-table">
      <thead>
        <tr>
          <th>Check</th>
          <th>Rule code</th>
          <th>Fires when</th>
          <th className="num">Records</th>
        </tr>
      </thead>
      <tbody>
        {codes.map((c) => (
          <tr key={c}>
            <td>{SIGNALS[c].name}</td>
            <td className="mono">{SIGNALS[c].code}</td>
            <td>{SIGNALS[c].rule}</td>
            <td className="num mono">{fmtInt(summary.signals[c] ?? 0)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function Method() {
  const [summary, setSummary] = useState<Summary | null>(null)
  useEffect(() => {
    loadSummary().then(setSummary)
  }, [])
  if (!summary) return <main className="method" />

  const pct = (n: number) => `${((n / summary.records) * 100).toFixed(1)}%`
  const v = summary.validation

  return (
    <main className="method">
      <header className="method-head">
        <p className="eyebrow">Method</p>
        <h1>How GroundTruth decides, and where it can be wrong</h1>
        <p className="lede">
          Every rule is deterministic and every threshold is listed here. Nothing is scored by a black box, so any flag can
          be traced back to the record fields and map layers that produced it.
        </p>
      </header>

      <section className="method-section">
        <h2>1. Data</h2>
        <div className="stat-row">
          <div>
            <span className="stat-num mono">{fmtInt(summary.records)}</span>
            <span className="stat-label">published contracts</span>
          </div>
          <div>
            <span className="stat-num mono">{fmtPesoShort(summary.total_cost)}</span>
            <span className="stat-label">total contract cost</span>
          </div>
          <div>
            <span className="stat-num mono">{pct(summary.stated_resolved)}</span>
            <span className="stat-label">resolved to a claimed municipality</span>
          </div>
          <div>
            <span className="stat-num mono">{fmtInt(summary.waterway_matched)}</span>
            <span className="stat-label">named rivers matched on OpenStreetMap</span>
          </div>
        </div>
        <p>
          Records are the DPWH flood control list published through Sumbong sa Pangulo (snapshot{' '}
          {summary.source_date ?? 'August 2025'}), funding years {summary.funding_years[0]} to{' '}
          {summary.funding_years[summary.funding_years.length - 1]}. Every record has coordinates. Municipal boundaries come
          from geoBoundaries (1,647 municipalities and cities), and waterways from the OpenStreetMap Philippines extract.
        </p>
      </section>

      <section className="method-section">
        <h2>2. Two claims per record</h2>
        <p>
          A record names its location twice: in the structured municipality field, and at the end of its title ("...,
          Quezon, Palawan"). Both are resolved to boundaries with fuzzy matching inside the stated province, and the claim
          nearest the pin is used for the verdict.
        </p>
        <p>
          This matters more than any threshold. Most of the largest raw mismatches, some over 800 km, turned out to be
          same-named towns in the wrong province while the title and the pin agree. Those records need a correction, not an
          inspection, and GroundTruth labels them that way.
        </p>
      </section>

      <section className="method-section">
        <h2>3. Checks</h2>
        <h3>Location checks: does the pin agree with the record?</h3>
        <SignalTable codes={LOCATION} summary={summary} />
        <h3>Pattern checks: is the contract pattern unusual?</h3>
        <SignalTable codes={RISK} summary={summary} />
        <p className="muted">
          Deliberately not flagged: being awarded at the approved budget ({Math.round(summary.at_abc_share * 100)}% of
          contracts) and amounts that bunch under round numbers. Those describe the budget system, not a single project.
        </p>
      </section>

      <section className="method-section">
        <h2>4. Labels and rank</h2>
        <table className="method-table">
          <thead>
            <tr>
              <th>Label</th>
              <th>Rule</th>
              <th className="num">Records</th>
            </tr>
          </thead>
          <tbody>
            {LABEL_ORDER.map((l) => (
              <tr key={l}>
                <td>
                  <i className={`dot dot-${l}`} aria-hidden="true" /> {LABELS[l].name}
                </td>
                <td>{LABELS[l].blurb}</td>
                <td className="num mono">{fmtInt(summary.labels[l] ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          Within a label, records are ranked by a priority score from 0 to 100:
        </p>
        <pre className="formula">score = 100 x (1 - e^(-Sum signal strengths)) x (0.65 + 0.35 x cost percentile)</pre>
        <p>
          Several independent signals push a record up faster than one strong one. Money at stake raises the rank, but a
          contract is never flagged for being large.
        </p>
      </section>

      <section className="method-section">
        <h2>5. Validation</h2>
        {v ? (
          <ul className="plain">
            <li>
              Title parser, hand-checked on {v.parser_rows} random titles: river name correct in{' '}
              {Math.round(v.waterway_accuracy * 100)}%, barangay correct in {Math.round(v.barangay_accuracy * 100)}%.
            </li>
            <li>{v.spot_notes}</li>
          </ul>
        ) : (
          <p className="muted">Validation numbers are generated by the pipeline.</p>
        )}
        <p>
          <strong>Case replay, Davao City.</strong> The NBI reported this month that one Davao coordinate was funded several
          times under different titles. Without being told where to look, GroundTruth flags same-year contract pairs in Davao
          City that share one exact pin and one identical amount along Catalunan Pequeño Creek. This is a case study, not an
          accuracy claim.
        </p>
        <p>
          <strong>Case replay, Barangay Piel, Baliwag.</strong> The riverwall the President found missing in August 2025 was
          reportedly not in the published list, so no records-based tool could have flagged it. The 11 published contracts
          that name Barangay Piel do surface as field priorities, including three consecutive contract numbers covering
          adjacent stretches.
        </p>
      </section>

      <section className="method-section">
        <h2>6. Limits</h2>
        <ul className="plain">
          <li>It cannot prove a structure exists or does not. Only a site visit can.</li>
          <li>It only sees what was published. Unlisted contracts are invisible to it.</li>
          <li>Municipal boundaries are from 2020 and simplified to about 20 m, so pins within 1 km of a border count as consistent.</li>
          <li>OpenStreetMap maps some rivers partially. The river check only fires when the named river is mapped through the claimed town.</li>
          <li>Station ranges give a length for about one in ten titles, so the cost-per-metre check covers few records.</li>
        </ul>
      </section>

      <section className="method-section">
        <h2>7. Credits and licences</h2>
        <ul className="plain">
          <li>DPWH flood control records, published via sumbongsapangulo.ph; mirror by github.com/rukku.</li>
          <li>geoBoundaries, William &amp; Mary geoLab (CC BY 3.0 IGO).</li>
          <li>OpenStreetMap contributors (ODbL), via Geofabrik. Basemap and imagery by Esri.</li>
          <li>
            Earlier public work on this data that informed the approach: BetterGov.ph visualisations and Data Dictionary's
            analysis of duplicated projects.
          </li>
        </ul>
      </section>
    </main>
  )
}
