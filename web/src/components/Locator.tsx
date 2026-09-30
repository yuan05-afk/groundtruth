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
  return [x / n, y / n]
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
  useEffect(() => {
    loadOutline().then(setOutline).catch(() => {})
  }, [])

  const view = useMemo(() => {
    const pts: number[][] = [[pin[1], pin[0]]]
    for (const s of shapes) for (const r of rings(s.geometry)) pts.push(...r)
    let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity]
    for (const [x, y] of pts) {
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
    const midLat = (minY + maxY) / 2
    const kx = Math.cos((midLat * Math.PI) / 180)
    let w = (maxX - minX) * kx
    let h = maxY - minY
    const minSpan = 0.08
    if (w < minSpan) w = minSpan
    if (h < minSpan) h = minSpan
    const pad = 0.28
    const scale = Math.min(width / (w * (1 + pad * 2)), height / (h * (1 + pad * 2)))
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const project = (lon: number, lat: number): [number, number] => [
      width / 2 + (lon - cx) * kx * scale,
      height / 2 - (lat - cy) * scale,
    ]
    return { project, scale }
  }, [shapes, pin, width, height])

  const path = (g: Geom) =>
    rings(g)
      .map((r) => 'M' + r.map(([x, y]) => view.project(x, y).map((v) => v.toFixed(1)).join(',')).join('L') + 'Z')
      .join('')

  const pinXY = view.project(pin[1], pin[0])
  const claimed = shapes.find((s) => s.role === 'claimed')
  const claimedXY = claimed ? view.project(...centroid(claimed.geometry)) : null
  const showConnector = claimedXY && Math.hypot(claimedXY[0] - pinXY[0], claimedXY[1] - pinXY[1]) > 40

  return (
    <svg className="locator" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Locator map">
      <defs>
        <pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="5" className="locator-hatch" />
        </pattern>
        <clipPath id="frame">
          <rect x="0" y="0" width={width} height={height} />
        </clipPath>
      </defs>
      <g clipPath="url(#frame)">
        {outline && <path d={path(outline)} className="locator-land" />}
        {shapes
          .filter((s) => s.role === 'actual')
          .map((s, k) => (
            <path key={`a${k}`} d={path(s.geometry)} className="locator-actual" />
          ))}
        {shapes
          .filter((s) => s.role === 'claimed')
          .map((s, k) => (
            <path key={`c${k}`} d={path(s.geometry)} className="locator-claimed" fill="url(#hatch)" />
          ))}
        {showConnector && claimedXY && (
          <>
            <line x1={pinXY[0]} y1={pinXY[1]} x2={claimedXY[0]} y2={claimedXY[1]} className="locator-connector" />
            {distanceLabel && (
              <text
                x={(pinXY[0] + claimedXY[0]) / 2 + 10}
                y={(pinXY[1] + claimedXY[1]) / 2}
                className="locator-distance"
              >
                {distanceLabel}
              </text>
            )}
          </>
        )}
        {claimed && claimedXY && (
          <text x={claimedXY[0]} y={claimedXY[1] - 12} className="locator-name" textAnchor="middle">
            {claimed.name}
          </text>
        )}
        <circle cx={pinXY[0]} cy={pinXY[1]} r={11} className="locator-pin-ring" />
        <circle cx={pinXY[0]} cy={pinXY[1]} r={4} className="locator-pin" />
        {pinLabel && (
          <text x={pinXY[0] + 16} y={pinXY[1] + 4} className="locator-pin-label">
            {pinLabel}
          </text>
        )}
      </g>
    </svg>
  )
}
