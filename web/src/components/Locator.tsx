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
}

export function Locator({ shapes, pin, width = 520, height = 380, distanceLabel, pinLabel }: Props) {
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
    // Long spans: fit to town centroids + pin so markers stay readable.
    // Short spans: fit to full polygons so town outlines matter.
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
    const pad = longRange ? 0.55 : shapes.length > 1 ? 0.35 : 0.45
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
  const showConnector = claimedXY && Math.hypot(claimedXY[0] - pinXY[0], claimedXY[1] - pinXY[1]) > 28
  // Long-range cases need the PH outline for context; short cases skip it.
  const showLand = Boolean(outline && view.spanKm >= 80)

  if (!ready && !shapes.length) {
    return (
      <div className="figure-placeholder" style={{ aspectRatio: `${width} / ${height}` }} aria-hidden="true">
        Loading figure...
      </div>
    )
  }

  const hatchId = `hatch-${width}-${height}`
  const clipId = `frame-${width}-${height}`

  const labelBlock = (
    xy: [number, number],
    s: Shape,
    role: string,
    anchor: 'start' | 'middle' | 'end',
    dy: number,
  ) => {
    const x = xy[0]
    const y = xy[1] + dy
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

  // Prefer putting claimed label left/top and pin/actual right/bottom when far apart.
  const claimedAbove = claimedXY ? claimedXY[1] < pinXY[1] : true

  return (
    <svg className="locator" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Locator diagram">
      <defs>
        <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" className="locator-hatch" />
        </pattern>
        <clipPath id={clipId}>
          <rect x="0" y="0" width={width} height={height} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {showLand && outline && <path d={path(outline)} className="locator-land" />}

        {!view.longRange &&
          shapes
            .filter((s) => s.role === 'actual')
            .map((s, k) => <path key={`a${k}`} d={path(s.geometry)} className="locator-actual" />)}
        {!view.longRange &&
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

        {claimed && claimedXY &&
          labelBlock(claimedXY, claimed, 'Municipality field', 'middle', claimedAbove ? -28 : 22)}

        {actual && actualXY && !view.longRange &&
          labelBlock(
            actualXY,
            actual,
            'Pin falls here',
            'middle',
            claimed && actualXY[1] > (claimedXY?.[1] ?? 0) ? 22 : -28,
          )}

        <circle cx={pinXY[0]} cy={pinXY[1]} r={11} className="locator-pin-ring" />
        <circle cx={pinXY[0]} cy={pinXY[1]} r={4} className="locator-pin" />

        {view.longRange && actual &&
          labelBlock(pinXY, actual, pinLabel || 'Recorded pin', 'middle', claimedAbove ? 22 : -28)}
        {!view.longRange && pinLabel && (
          <text x={pinXY[0] + 14} y={pinXY[1] + 4} className="locator-pin-label">
            {pinLabel}
          </text>
        )}
      </g>

      <g className="locator-legend" transform={`translate(12, ${height - 44})`}>
        <rect x="0" y="0" width="12" height="12" className="locator-claimed" fill={`url(#${hatchId})`} />
        <text x="18" y="10" className="locator-legend-text">
          Claimed in record
        </text>
        <circle cx="6" cy="28" r="4" className="locator-pin" />
        <text x="18" y="31" className="locator-legend-text">
          Recorded pin
        </text>
      </g>
    </svg>
  )
}
