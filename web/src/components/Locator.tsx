import { useEffect, useMemo, useState } from 'react'

type Geom = GeoJSON.Geometry
type Shape = { geometry: Geom; role: 'claimed' | 'actual'; name: string }

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

function shortName(name: string, max = 18) {
  if (name.length <= max) return name
  return name.slice(0, max - 1) + '…'
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

  const view = useMemo(() => {
    // Fit to claimed + actual shapes and pin — never let the national outline dominate the bbox.
    const pts: number[][] = [[pin[1], pin[0]]]
    for (const s of shapes) for (const r of rings(s.geometry)) pts.push(...r)

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
    let w = Math.max((maxX - minX) * kx, 0.04)
    let h = Math.max(maxY - minY, 0.04)
    // Keep aspect readable; pad so both towns and connector have air.
    const pad = shapes.length > 1 ? 0.35 : 0.45
    const scale = Math.min(width / (w * (1 + pad * 2)), height / (h * (1 + pad * 2)))
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const project = (lon: number, lat: number): [number, number] => [
      width / 2 + (lon - cx) * kx * scale,
      height / 2 - (lat - cy) * scale,
    ]
    const spanKm = Math.max(w / kx, h) * 111
    return { project, scale, spanKm }
  }, [shapes, pin, width, height])

  const path = (g: Geom) =>
    rings(g)
      .map((r) => 'M' + r.map(([x, y]) => view.project(x, y).map((v) => v.toFixed(1)).join(',')).join('L') + 'Z')
      .join('')

  const pinXY = view.project(pin[1], pin[0])
  const claimed = shapes.find((s) => s.role === 'claimed')
  const actual = shapes.find((s) => s.role === 'actual')
  const claimedXY = claimed ? view.project(...centroid(claimed.geometry)) : null
  const actualXY = actual ? view.project(...centroid(actual.geometry)) : null
  const showConnector = claimedXY && Math.hypot(claimedXY[0] - pinXY[0], claimedXY[1] - pinXY[1]) > 28
  // Show national outline only as faint context when the span is regional, not continental fill.
  const showLand = outline && view.spanKm < 400

  if (!ready && !shapes.length) {
    return (
      <div className="figure-placeholder" style={{ aspectRatio: `${width} / ${height}` }} aria-hidden="true">
        Loading figure…
      </div>
    )
  }

  const hatchId = `hatch-${width}-${height}`
  const clipId = `frame-${width}-${height}`

  return (
    <svg className="locator" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Locator map">
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
        {shapes
          .filter((s) => s.role === 'actual')
          .map((s, k) => (
            <path key={`a${k}`} d={path(s.geometry)} className="locator-actual" />
          ))}
        {shapes
          .filter((s) => s.role === 'claimed')
          .map((s, k) => (
            <path key={`c${k}`} d={path(s.geometry)} className="locator-claimed" fill={`url(#${hatchId})`} />
          ))}
        {showConnector && claimedXY && (
          <>
            <line x1={pinXY[0]} y1={pinXY[1]} x2={claimedXY[0]} y2={claimedXY[1]} className="locator-connector" />
            {distanceLabel && (
              <text
                x={(pinXY[0] + claimedXY[0]) / 2 + 8}
                y={(pinXY[1] + claimedXY[1]) / 2 - 4}
                className="locator-distance"
              >
                {distanceLabel}
              </text>
            )}
          </>
        )}
        {claimed && claimedXY && (
          <text x={claimedXY[0]} y={claimedXY[1] - 10} className="locator-name" textAnchor="middle">
            {shortName(claimed.name)}
          </text>
        )}
        {actual && actualXY && (!claimed || actual.name !== claimed.name) && (
          <text x={actualXY[0]} y={actualXY[1] + 16} className="locator-name" textAnchor="middle">
            {shortName(actual.name)}
          </text>
        )}
        <circle cx={pinXY[0]} cy={pinXY[1]} r={10} className="locator-pin-ring" />
        <circle cx={pinXY[0]} cy={pinXY[1]} r={3.5} className="locator-pin" />
        {pinLabel && (
          <text x={pinXY[0] + 14} y={pinXY[1] + 4} className="locator-pin-label">
            {pinLabel}
          </text>
        )}
      </g>
    </svg>
  )
}
