import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { AmountHistogram } from '../components/AmountHistogram'
import { Locator } from '../components/Locator'
import {
  type Featured,
  type Summary,
  LABELS,
  LABEL_ORDER,
  fmtInt,
  fmtKm,
  fmtPesoShort,
  loadFeatured,
  loadProjects,
  loadSummary,
  projectHash,
} from '../lib/data'

function caseShapes(f: Featured) {
  const p = f.project
  const shapes: { geometry: GeoJSON.Geometry; role: 'claimed' | 'actual'; name: string; province?: string }[] = []
  const claimedId = f.key === 'misplaced' ? pickFar(f) : p.sm
  if (p.am !== null && f.shapes[p.am] && p.am !== claimedId) {
    const s = f.shapes[p.am]
    shapes.push({ geometry: s.geometry, role: 'actual', name: s.name, province: s.province })
  }
  if (claimedId !== null && f.shapes[claimedId]) {
    const s = f.shapes[claimedId]
    shapes.push({ geometry: s.geometry, role: 'claimed', name: s.name, province: s.province })
  }
  return shapes
}

function pickFar(f: Featured) {
  const p = f.project
  return p.fm !== null && p.fm !== p.am ? p.fm : p.tm
}

const CASE_COPY: Record<string, (f: Featured) => { fig: string; body: string }> = {
  misplaced: (f) => {
    const p = f.project
    const far = pickFar(f)
    const farShape = far !== null ? f.shapes[far] : null
    const actual = p.am !== null ? f.shapes[p.am] : null
    const d = p.sig.find((s) => s.code === 'record_fields_disagree')?.value ?? 0
    return {
      fig: `Contract ${p.cid}. The municipality field says ${farShape?.name}, ${farShape?.province}. The title and the pin both say ${actual?.name}, ${actual?.province}, ${fmtKm(d)} away.`,
      body: 'A same-named town in another province. The structure is probably where the pin says. The record needs a correction, not a raid.',
    }
  },
  outside: (f) => {
    const p = f.project
    const claimed = p.sm !== null ? f.shapes[p.sm] : null
    const actual = p.am !== null ? f.shapes[p.am] : null
    return {
      fig: `Contract ${p.cid}. The record claims ${claimed?.name}, ${claimed?.province}. The pin falls in ${actual?.name}, ${actual?.province}, ${fmtKm(p.md ?? 0)} away.`,
      body: 'Neither the title nor the municipality field agrees with the coordinates. Confirm the location before anyone drives out.',
    }
  },
  shared: (f) => {
    const p = f.project
    const s = p.sig.find((x) => x.code === 'shared_pin')
    return {
      fig: `Contract ${p.cid}, ${f.shapes[p.am ?? -1]?.name ?? ''}. ${s?.text ?? ''}`,
      body: 'The location is plausible, but many separately titled contracts sit on one exact coordinate. That is worth a site visit.',
    }
  },
}

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
}

export function Brief() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [featured, setFeatured] = useState<Featured[]>([])

  useEffect(() => {
    loadSummary().then(setSummary)
    loadFeatured().then(setFeatured)
    const t = setTimeout(() => loadProjects(), 1200)
    return () => clearTimeout(t)
  }, [])

  const hero = featured.find((f) => f.key === 'outside')
  const flagged = summary ? summary.labels.records + summary.labels.field : 0

  return (
    <main className="brief">
      <section className="hero" aria-label="Brief">
        <motion.div
          className="hero-text"
          initial="initial"
          animate="animate"
          transition={{ staggerChildren: 0.08, delayChildren: 0.05 }}
        >
          <motion.div className="hero-masthead" variants={fadeUp} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
            <p className="hero-brand">GroundTruth</p>
            <p className="eyebrow hero-eyebrow">
              Flood-control verification, Philippines, {summary ? fmtInt(summary.records) : '9,855'} contracts
            </p>
          </motion.div>
          <motion.h1 variants={fadeUp} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}>
            Public flood projects claim a town.
            <em> Many pins are somewhere else.</em>
          </motion.h1>
          <motion.p className="lede" variants={fadeUp} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
            GroundTruth is an inspection queue for the ₱547B flood-control record: it measures whether each contract's
            pin matches the town it claims, then sorts what to fix on paper, what to visit, and what to leave alone.
          </motion.p>
          <motion.div className="hero-actions" variants={fadeUp} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
            <a className="btn btn-primary" href="#/queue">
              Open the inspection queue
            </a>
            <a className="btn btn-quiet" href="#/method">
              How it decides
            </a>
          </motion.div>
          <motion.p className="hero-note" variants={fadeUp} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
            Triage, not a verdict. Every flag shows the innocent explanation.
          </motion.p>
        </motion.div>

        <motion.figure
          className="hero-figure"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          {hero ? (
            <>
              <Locator
                shapes={caseShapes(hero)}
                pin={[hero.project.lat, hero.project.lon]}
                width={520}
                height={360}
                distanceLabel={fmtKm(hero.project.md ?? 0)}
                pinLabel="Recorded pin"
              />
              <figcaption>
                <span className="fig-no">Fig. 1</span> {CASE_COPY.outside(hero).fig}
              </figcaption>
            </>
          ) : (
            <div className="figure-placeholder">Loading figure...</div>
          )}
        </motion.figure>
      </section>

      <motion.ol
        className="hero-beats"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        <li>
          <span className="hero-beat-n" aria-hidden="true">
            01
          </span>
          <div className="hero-beat-body">
            <strong>Problem</strong>
            <p>A missing structure at the pin may be a ghost, or a wrong coordinate.</p>
          </div>
        </li>
        <li>
          <span className="hero-beat-n" aria-hidden="true">
            02
          </span>
          <div className="hero-beat-body">
            <strong>Check</strong>
            <p>Boundaries, rivers, and duplicate pins across all published contracts.</p>
          </div>
        </li>
        <li>
          <span className="hero-beat-n" aria-hidden="true">
            03
          </span>
          <div className="hero-beat-body">
            <strong>Output</strong>
            <p>A ranked queue with evidence, not a guilt ranking.</p>
          </div>
        </li>
      </motion.ol>

      {summary && (
        <motion.section
          className="ledger"
          aria-label="Queue totals"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.5 }}
        >
          {LABEL_ORDER.map((l) => (
            <a key={l} className={`ledger-cell label-${l}`} href="#/queue">
              <span className="ledger-key">
                <i className={`dot dot-${l}`} aria-hidden="true" />
                {LABELS[l].name}
              </span>
              <span className="ledger-num">{fmtInt(summary.labels[l] ?? 0)}</span>
              <span className="ledger-sub">{fmtPesoShort(summary.cost_by_label[l] ?? 0)} in contracts</span>
              <span className="ledger-blurb">{LABELS[l].blurb}</span>
            </a>
          ))}
        </motion.section>
      )}

      <section className="why">
        <motion.div
          className="why-col"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.45 }}
        >
          <h2>The bottleneck</h2>
          <p>
            Verification is slower than publication. A blank pin is not automatically a ghost; it may be misplaced. Hand
            checks cannot keep up while DPWH reports{' '}
            <a
              href="https://www.rappler.com/philippines/taguig-city-ghost-flood-control-projects-ping-lacson-vince-dizon-claims/"
              target="_blank"
              rel="noreferrer"
            >
              10 confirmed ghost projects and nearly 200 open investigations
            </a>
            .
          </p>
        </motion.div>
        <motion.div
          className="why-col"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.45, delay: 0.06 }}
        >
          <h2>What the data already shows</h2>
          <p>
            Coordinates for a Taguig project that point hundreds of kilometres away, and a single Davao pin{' '}
            <a
              href="https://www.gmanetwork.com/news/topstories/nation/1003653/nbi-sees-6-potential-ghost-flood-control-projects-in-davao-city/story/"
              target="_blank"
              rel="noreferrer"
            >
              funded five times under different titles
            </a>
            . Both patterns are measurable in the published record.
          </p>
        </motion.div>
        <motion.div
          className="why-col"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.45, delay: 0.12 }}
        >
          <h2>What GroundTruth gives you</h2>
          <p>
            {summary ? fmtInt(flagged) : '...'} contracts with at least one signal, ranked for desk check or site visit.
            Each evidence card shows the measurement, the benign explanation, related contracts, and a next step.
          </p>
        </motion.div>
      </section>

      <section className="cases">
        <header className="section-head">
          <h2>Three records, three different problems</h2>
          <p>Picked by the pipeline: the largest self-contradiction, the largest unexplained mismatch, and the busiest shared pin.</p>
        </header>
        <div className="case-grid">
          {featured.map((f) => {
            const copy = CASE_COPY[f.key]?.(f)
            const p = f.project
            return (
              <article key={f.key} className="case">
                <Locator
                  shapes={caseShapes(f)}
                  pin={[p.lat, p.lon]}
                  width={400}
                  height={280}
                  distanceLabel={f.key === 'shared' ? undefined : fmtKm(f.key === 'misplaced' ? (p.sig[0]?.value ?? 0) : (p.md ?? 0))}
                  stackCount={f.key === 'shared' ? (p.sig.find((s) => s.code === 'shared_pin')?.value ?? p.dup.length) : 0}
                  pinLabel={
                    f.key === 'shared'
                      ? `${1 + (p.sig.find((s) => s.code === 'shared_pin')?.value ?? p.dup.length)} contracts`
                      : undefined
                  }
                />
                <div className="case-body">
                  <span className={`chip chip-${p.L}`}>{LABELS[p.L].name}</span>
                  <h3>{f.headline}</h3>
                  <p className="case-fig">{copy?.fig}</p>
                  <p>{copy?.body}</p>
                  <a className="text-link" href={projectHash(p.i)}>
                    Open the evidence card
                  </a>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <section className="steps">
        <header className="section-head">
          <h2>How it decides</h2>
        </header>
        <ol className="step-list">
          <li>
            <span className="step-no">01</span>
            <h3>Read both claims</h3>
            <p>
              Every record names its location twice: in the municipality field and at the end of the title. Both are
              resolved to municipal boundaries; the river named in the title is matched against OpenStreetMap.
            </p>
          </li>
          <li>
            <span className="step-no">02</span>
            <h3>Check the ground</h3>
            <p>
              Is the pin inside the claimed town? On land? Near the named river? Shared with other contracts? Are amounts
              and dates consistent?
            </p>
          </li>
          <li>
            <span className="step-no">03</span>
            <h3>Rank the queue</h3>
            <p>
              Location problems go to a desk check. Consistent locations with unusual patterns become site-visit
              candidates. Money raises the rank but never creates a flag alone.
            </p>
          </li>
        </ol>
      </section>

      {summary?.amount_hist && (
        <section className="context">
          <div className="context-text">
            <h2>Context the queue does not flag</h2>
            <p>
              Contract amounts bunch just under round numbers.{' '}
              <strong>{fmtInt(summary.band_95_100 ?? 0)}</strong> contracts sit between ₱95M and ₱100M; only{' '}
              <strong>{fmtInt(summary.band_100_105 ?? 0)}</strong> sit between ₱100M and ₱105M.{' '}
              {Math.round(summary.at_abc_share * 100)}% were awarded within 0.1% of their approved budget.
            </p>
            <p className="muted">
              This describes how the budget is sliced into line items, not any single project, so GroundTruth shows it as
              context instead of flagging thousands of contracts for it.
            </p>
          </div>
          <figure className="context-figure">
            <AmountHistogram edges={summary.amount_hist.edges} counts={summary.amount_hist.counts} />
            <figcaption>
              <span className="fig-no">Fig. 2</span> Contracts by amount, ₱5M bins. Highlighted: ₱95M to ₱100M.
            </figcaption>
          </figure>
        </section>
      )}

      <section className="limits">
        <h2>What it cannot do</h2>
        <p>
          It cannot prove a structure exists or does not. Only a site visit can. And it only sees what was published: the
          ₱55.7M Piel riverwall in Baliwag that{' '}
          <a
            href="https://newsinfo.inquirer.net/2098529/its-strike-2-in-bulacan-as-marcos-flags-p56-m-ghost-flood-project"
            target="_blank"
            rel="noreferrer"
          >
            the President found missing in August 2025
          </a>{' '}
          was reportedly not among the 9,855 published records at all.
        </p>
      </section>

      <footer className="footer">
        <p>
          Data: DPWH flood control records published via Sumbong sa Pangulo
          {summary?.source_date ? ` (snapshot ${summary.source_date})` : ''}, geoBoundaries (CC BY 3.0 IGO), OpenStreetMap
          contributors (ODbL). Built for LovHack Season 3.
        </p>
        <p className="muted">
          GroundTruth does not allege wrongdoing by any person or company. Contractor names appear only as recorded on each
          public contract.
        </p>
      </footer>
    </main>
  )
}
