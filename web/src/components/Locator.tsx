import { useEffect, useMemo, useState } from 'react'

type Geom = GeoJSON.Geometry
type Shape = {
  geometry: Geom
  role: 'claimed' | 'actual'
  name: string
  province?: string
}

let outlineCache: Promise<Geom> | null = null
function loadOutline() {
  outlineCache ??= fetch(`${import.meta.env.BASE_URL}data/ph_outline.json`).then((r) => r.json())
  return outlineCache
}

function rings(g: Geom): number[][][] {
  if (g.type === 'Polygon') return g.coordinates as number[][][]
  if (g.type === 'MultiPolygon') return (g.coordinates as number[][][][]).flat()
  return []
}

function centroid(g: Geom): [number, number] {
  let x = 0
  let y = 0
  let n = 0
  for (const ring of rings(g)) {
    for (const [lx, ly] of ring) {
      x += lx
      y += ly
      n++
    }
  }
  return n ? [x / n, y / n] : [0, 0]
}

function bbox(g: Geom): [number, number, number, number] {
  let [a, b, c, d] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const ring of rings(g))
    for (const [x, y] of ring) {
      a = Math.min(a, x)
      b = Math.min(b, y)
      c = Math.max(c, x)
      d = Math.max(d, y)
    }
  return [a, b, c, d]
}

function shortName(name: string, max = 22) {
  if (name.length <= max) return name
  return name.slice(0, max - 1) + '...'
}

type Props = {
  shapes: Shape[]
  pin: [number, number]
  width?: number
  height?: number
  distanceLabel?: string
  pinLabel?: string
  /** Extra contracts on the same pin (shared-pin cases). */
  stackCount?: number
}

export function Locator({
  shapes,
  pin,
  width = 520,
  height = 380,
  distanceLabel,
  pinLabel,
  stackCount = 0,
}: Props) {
  const [outline, setOutline] = useState<Geom | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadOutline()
      .then((g) => {
        if (!cancelled) {
          setOutline(g)
          setReady(true)
        }
      })
      .catch(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const claimed = shapes.find((s) => s.role === 'claimed')
  const actual = shapes.find((s) => s.role === 'actual')

  const view = useMemo(() => {
    const claimedC = claimed ? centroid(claimed.geometry) : null
    const actualC = actual ? centroid(actual.geometry) : null
    const probe: number[][] = [[pin[1], pin[0]]]
    if (claimedC) probe.push([claimedC[0], claimedC[1]])
    if (actualC) probe.push([actualC[0], actualC[1]])

    let spanGuess = 0
    if (probe.length >= 2) {
      const lons = probe.map((p) => p[0])
      const lats = probe.map((p) => p[1])
      const mid = (Math.min(...lats) + Math.max(...lats)) / 2
      const kx0 = Math.cos((mid * Math.PI) / 180) || 1
      spanGuess = Math.max((Math.max(...lons) - Math.min(...lons)) / kx0, Math.max(...lats) - Math.min(...lats)) * 111
    }
    const longRange = spanGuess >= 80

    const pts: number[][] = [[pin[1], pin[0]]]
    if (longRange) {
      if (claimedC) pts.push([claimedC[0], claimedC[1]])
      if (actualC) pts.push([actualC[0], actualC[1]])
    } else {
      for (const s of shapes) for (const r of rings(s.geometry)) pts.push(...r)
    }

    let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity]
    for (const [x, y] of pts) {
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
    if (!Number.isFinite(minX)) {
      minX = pin[1] - 0.05
      maxX = pin[1] + 0.05
      minY = pin[0] - 0.05
      maxY = pin[0] + 0.05
    }

    const midLat = (minY + maxY) / 2
    const kx = Math.cos((midLat * Math.PI) / 180) || 1
    let w = Math.max((maxX - minX) * kx, longRange ? 0.8 : 0.04)
    let h = Math.max(maxY - minY, longRange ? 0.8 : 0.04)
    // Leave room for labels and legend; local diagrams need more pad so the town is not cropped.
    const pad = longRange ? 0.55 : shapes.length > 1 ? 0.42 : 0.55
    const scale = Math.min(width / (w * (1 + pad * 2)), height / (h * (1 + pad * 2)))
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const project = (lon: number, lat: number): [number, number] => [
      width / 2 + (lon - cx) * kx * scale,
      height / 2 - (lat - cy) * scale,
    ]
    const spanKm = Math.max(w / kx, h) * 111
    return { project, scale, spanKm, longRange }
  }, [shapes, pin, width, height, claimed, actual])

  const path = (g: Geom) =>
    rings(g)
      .map((r) => 'M' + r.map(([x, y]) => view.project(x, y).map((v) => v.toFixed(1)).join(',')).join('L') + 'Z')
      .join('')

  const pinXY = view.project(pin[1], pin[0])
  const claimedXY = claimed ? view.project(...centroid(claimed.geometry)) : null
  const actualXY = actual ? view.project(...centroid(actual.geometry)) : null

  // Only draw the distance line when the story is a real mismatch (caller passed a distance).
  const showConnector = Boolean(
    distanceLabel && claimedXY && Math.hypot(claimedXY[0] - pinXY[0], claimedXY[1] - pinXY[1]) > 40,
  )
  const showLand = Boolean(outline && view.spanKm >= 80)
  const local = !view.longRange

  if (!ready && !shapes.length) {
    return (
      <div className="figure-placeholder" style={{ aspectRatio: `${width} / ${height}` }} aria-hidden="true">
        Loading figure...
      </div>
    )
  }

  const hatchId = `hatch-${width}-${height}`
  const clipId = `frame-${width}-${height}`
  const plateId = `plate-${width}-${height}`

  /** Place a label just outside a shape bbox so it does not sit on the fill. */
  const outsideLabel = (g: Geom, prefer: 'right' | 'left' | 'top' | 'bottom'): [number, number] => {
    const [a, b, c, d] = bbox(g)
    const corners = {
      right: view.project(c, (b + d) / 2),
      left: view.project(a, (b + d) / 2),
      top: view.project((a + c) / 2, d),
      bottom: view.project((a + c) / 2, b),
    }
    const [x, y] = corners[prefer]
    const pad = 14
    if (prefer === 'right') return [Math.min(width - 8, x + pad), y]
    if (prefer === 'left') return [Math.max(8, x - pad), y]
    if (prefer === 'top') return [x, Math.max(18, y - pad)]
    return [x, Math.min(height - 56, y + pad)]
  }

  const labelBlock = (
    xy: [number, number],
    s: Shape,
    role: string,
    anchor: 'start' | 'middle' | 'end',
  ) => {
    const x = xy[0]
    const y = xy[1]
    return (
      <g className="locator-label">
        <text x={x} y={y} className="locator-name" textAnchor={anchor}>
          {shortName(s.name)}
        </text>
        {s.province && (
          <text x={x} y={y + 13} className="locator-province" textAnchor={anchor}>
            {shortName(s.province, 28)}
          </text>
        )}
        <text x={x} y={y + (s.province ? 26 : 13)} className="locator-role" textAnchor={anchor}>
          {role}
        </text>
      </g>
    )
  }

  const claimedLabelXY =
    claimed && local
      ? outsideLabel(claimed.geometry, pinXY[0] < width * 0.5 ? 'right' : 'left')
      : claimedXY
  const actualLabelXY =
    actual && local && !view.longRange
      ? outsideLabel(actual.geometry, claimedLabelXY && claimedLabelXY[0] > width * 0.5 ? 'left' : 'right')
      : actualXY

  const stack = Math.max(0, stackCount)
  const pinCaption = pinLabel || (stack > 0 ? `${stack + 1} contracts` : null)

  return (
    <svg className="locator" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Locator diagram">
      <defs>
        <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" className="locator-hatch" />
        </pattern>
        <clipPath id={clipId}>
          <rect x="0" y="0" width={width} height={height} />
        </clipPath>
        <linearGradient id={plateId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ececec" />
          <stop offset="100%" stopColor="#e2e2e2" />
        </linearGradient>
      </defs>

      {/* Ground plate so the figure never reads as a blank unfinished box. */}
      <rect className="locator-plate" x="0" y="0" width={width} height={height} fill={`url(#${plateId})`} />
      <rect className="locator-frame" x="0.5" y="0.5" width={width - 1} height={height - 1} />

      <g clipPath={`url(#${clipId})`}>
        {showLand && outline && <path d={path(outline)} className="locator-land" />}

        {local &&
          shapes
            .filter((s) => s.role === 'actual')
            .map((s, k) => <path key={`a${k}`} d={path(s.geometry)} className="locator-actual" />)}
        {local &&
          shapes
            .filter((s) => s.role === 'claimed')
            .map((s, k) => (
              <path key={`c${k}`} d={path(s.geometry)} className="locator-claimed" fill={`url(#${hatchId})`} />
            ))}

        {view.longRange && claimedXY && (
          <g>
            <circle cx={claimedXY[0]} cy={claimedXY[1]} r={16} className="locator-claimed-mark" fill={`url(#${hatchId})`} />
            <circle cx={claimedXY[0]} cy={claimedXY[1]} r={4} className="locator-claimed-dot" />
          </g>
        )}

        {showConnector && claimedXY && (
          <>
            <line x1={pinXY[0]} y1={pinXY[1]} x2={claimedXY[0]} y2={claimedXY[1]} className="locator-connector" />
            {distanceLabel && (
              <text
                x={(pinXY[0] + claimedXY[0]) / 2}
                y={(pinXY[1] + claimedXY[1]) / 2 - 8}
                className="locator-distance"
                textAnchor="middle"
              >
                {distanceLabel}
              </text>
            )}
          </>
        )}

        {claimed && claimedLabelXY &&
          labelBlock(
            claimedLabelXY,
            claimed,
            'Municipality field',
            local ? (claimedLabelXY[0] < width * 0.5 ? 'start' : 'end') : 'middle',
          )}

        {actual && actualLabelXY && local &&
          labelBlock(
            actualLabelXY,
            actual,
            'Pin falls here',
            actualLabelXY[0] < width * 0.5 ? 'start' : 'end',
          )}

        {/* Shared-pin stack: concentric rings so "many contracts" is visible. */}
        {stack > 0 &&
          [18, 14, 10].map((r, i) => (
            <circle
              key={r}
              cx={pinXY[0]}
              cy={pinXY[1]}
              r={r}
              className="locator-pin-stack"
              opacity={0.35 - i * 0.08}
            />
          ))}

        <circle cx={pinXY[0]} cy={pinXY[1]} r={11} className="locator-pin-ring" />
        <circle cx={pinXY[0]} cy={pinXY[1]} r={4} className="locator-pin" />

        {view.longRange && actual &&
          labelBlock(
            [pinXY[0], pinXY[1] + (claimedXY && claimedXY[1] < pinXY[1] ? 28 : -34)],
            actual,
            pinCaption || 'Recorded pin',
            'middle',
          )}

        {local && pinCaption && (
          <text
            x={pinXY[0] + (stack > 0 ? 20 : 14)}
            y={pinXY[1] + 4}
            className="locator-pin-label"
            textAnchor="start"
          >
            {pinCaption}
          </text>
        )}
      </g>

      <g className="locator-legend" transform={`translate(12, ${height - 44})`}>
        <circle cx="6" cy="6" r="7" className="locator-claimed-mark" fill={`url(#${hatchId})`} />
        <circle cx="6" cy="6" r="2.5" className="locator-claimed-dot" />
        <text x="18" y="10" className="locator-legend-text">
          Claimed in record
        </text>
        <circle cx="6" cy="28" r="7" className="locator-pin-ring" />
        <circle cx="6" cy="28" r="3.5" className="locator-pin" />
        <text x="18" y="31" className="locator-legend-text">
          {stack > 0 ? 'Shared pin' : 'Recorded pin'}
        </text>
      </g>
    </svg>
  )
}
