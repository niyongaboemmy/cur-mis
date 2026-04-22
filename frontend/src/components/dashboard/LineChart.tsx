import { useMemo } from 'react'

interface Series {
  name:  string
  color: string   // hex
  data:  number[]
}

interface LineChartProps {
  labels: string[]
  series: Series[]
  yMax?:  number
  height?: number
}

/**
 * Lightweight hand-rolled line chart — Catmull-Rom → bezier path for smooth curves.
 * Avoids adding recharts/chart.js to the bundle.
 */
export default function LineChart({ labels, series, yMax, height = 240 }: LineChartProps) {
  const W       = 720
  const H       = height
  const padding = { l: 40, r: 16, t: 24, b: 32 }
  const innerW  = W - padding.l - padding.r
  const innerH  = H - padding.t - padding.b

  const maxV = useMemo(() => {
    const m = yMax ?? Math.max(...series.flatMap((s) => s.data), 1)
    // round up to a nice-ish number
    const mag  = Math.pow(10, Math.floor(Math.log10(m)))
    return Math.ceil(m / mag) * mag
  }, [series, yMax])

  const xFor = (i: number) => padding.l + (i / Math.max(labels.length - 1, 1)) * innerW
  const yFor = (v: number) => padding.t + innerH - (v / maxV) * innerH

  // Catmull-Rom smoothing
  const toSmoothPath = (pts: [number, number][]) => {
    if (pts.length === 0) return ''
    if (pts.length === 1) return `M${pts[0][0]},${pts[0][1]}`
    let d = `M${pts[0][0]},${pts[0][1]}`
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i]
      const p1 = pts[i]
      const p2 = pts[i + 1]
      const p3 = pts[i + 2] ?? p2
      const c1x = p1[0] + (p2[0] - p0[0]) / 6
      const c1y = p1[1] + (p2[1] - p0[1]) / 6
      const c2x = p2[0] - (p3[0] - p1[0]) / 6
      const c2y = p2[1] - (p3[1] - p1[1]) / 6
      d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`
    }
    return d
  }

  const ticks = 4
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => Math.round((maxV * i) / ticks))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} className="overflow-visible">
      {/* Gradients */}
      <defs>
        {series.map((s, i) => (
          <linearGradient id={`lc-fill-${i}`} key={s.name} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={s.color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={s.color} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>

      {/* Horizontal grid + y-axis labels */}
      {yTicks.map((v, i) => {
        const y = yFor(v)
        return (
          <g key={i}>
            <line x1={padding.l} x2={W - padding.r} y1={y} y2={y} stroke="currentColor" className="text-ink-100 dark:text-ink-700" strokeDasharray="3 4" />
            <text x={padding.l - 8} y={y + 3} fontSize="10" textAnchor="end" className="fill-ink-400">{v >= 1000 ? `${v / 1000}k` : v}</text>
          </g>
        )
      })}

      {/* X labels */}
      {labels.map((lb, i) => (
        <text
          key={lb + i}
          x={xFor(i)}
          y={H - 8}
          fontSize="10"
          textAnchor="middle"
          className="fill-ink-400"
        >
          {lb}
        </text>
      ))}

      {/* Series */}
      {series.map((s, idx) => {
        const pts = s.data.map((v, i) => [xFor(i), yFor(v)] as [number, number])
        const line = toSmoothPath(pts)
        const area = `${line} L${pts[pts.length - 1][0]},${yFor(0)} L${pts[0][0]},${yFor(0)} Z`
        return (
          <g key={s.name}>
            <path d={area} fill={`url(#lc-fill-${idx})`} />
            <path d={line} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            {pts.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r="3" fill="#fff" stroke={s.color} strokeWidth="2" />
            ))}
          </g>
        )
      })}
    </svg>
  )
}
