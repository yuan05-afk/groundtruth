import { fmtInt } from '../lib/data'

type Props = { edges: number[]; counts: number[]; highlight?: [number, number] }

export function AmountHistogram({ edges, counts, highlight = [95, 100] }: Props) {
  const W = 720
  const H = 220
  const padL = 36
  const padB = 28
  const max = Math.max(...counts)
  const bw = (W - padL) / counts.length
  const y = (v: number) => (H - padB) * (1 - v / max)

  const ticks = [0, 50, 100, 150, 200]
  return (
    <svg className="histogram" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Distribution of contract amounts">
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={padL} x2={W} y1={y(max * f)} y2={y(max * f)} className="hist-grid" />
          <text x={padL - 6} y={y(max * f) + 4} textAnchor="end" className="hist-axis">
            {fmtInt(Math.round(max * f))}
          </text>
        </g>
      ))}
      {counts.map((c, k) => {
        const lo = edges[k]
        const hot = lo >= highlight[0] && lo < highlight[1]
        const after = lo >= highlight[1] && lo < highlight[1] + 5
        return (
          <rect
            key={k}
            x={padL + k * bw + 1}
            y={y(c)}
            width={bw - 2}
            height={H - padB - y(c)}
            className={hot ? 'hist-bar hot' : after ? 'hist-bar after' : 'hist-bar'}
          >
            <title>{`₱${lo}M to ₱${edges[k + 1]}M: ${fmtInt(c)} contracts`}</title>
          </rect>
        )
      })}
      {ticks.map((t) => (
        <text key={t} x={padL + (t / 5) * bw} y={H - 8} className="hist-axis" textAnchor="middle">
          ₱{t}M
        </text>
      ))}
    </svg>
  )
}
