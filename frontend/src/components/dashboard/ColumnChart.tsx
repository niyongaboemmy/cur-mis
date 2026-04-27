import { useMemo } from 'react'

export interface ColumnDatum {
  value: string
  label: string
  total: number
  color?: string
}

interface ColumnChartProps {
  data:     ColumnDatum[]
  onPick?:  (d: ColumnDatum) => void
  height?:  number
  maxBars?: number
}

/**
 * Lightweight vertical column chart. Bars are clickable, labels truncate
 * under the bar, values sit on top. Scales to container width.
 */
export default function ColumnChart({
  data,
  onPick,
  height = 260,
  maxBars = 12,
}: ColumnChartProps) {
  const rows = useMemo(() => data.slice(0, maxBars), [data, maxBars])

  const max = useMemo(
    () => rows.reduce((m, r) => Math.max(m, Number(r.total) || 0), 0) || 1,
    [rows],
  )

  const W = Math.max(rows.length * 56, 320)
  const padding = { l: 36, r: 16, t: 24, b: 56 }
  const innerW  = W - padding.l - padding.r
  const innerH  = height - padding.t - padding.b
  const gap     = 8
  const barW    = Math.max(18, (innerW - gap * (rows.length - 1)) / Math.max(rows.length, 1))

  // y-axis ticks
  const ticks = 4
  const mag   = Math.pow(10, Math.floor(Math.log10(max)))
  const niceMax = Math.ceil(max / mag) * mag
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => Math.round((niceMax * i) / ticks))
  const yFor   = (v: number) => padding.t + innerH - (v / niceMax) * innerH

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${height}`} width={W} height={height} className="min-w-full">
        {/* y grid + labels */}
        {yTicks.map((v, i) => {
          const y = yFor(v)
          return (
            <g key={i}>
              <line x1={padding.l} x2={W - padding.r} y1={y} y2={y} stroke="currentColor" className="text-ink-100 dark:text-ink-700" strokeDasharray="3 4" />
              <text x={padding.l - 8} y={y + 3} fontSize="10" textAnchor="end" className="fill-ink-400">
                {v >= 1000 ? `${Math.round(v / 100) / 10}k` : v}
              </text>
            </g>
          )
        })}

        {rows.map((r, i) => {
          const total = Number(r.total) || 0
          const x = padding.l + i * (barW + gap)
          const y = yFor(total)
          const h = Math.max(2, (padding.t + innerH) - y)
          const color = r.color ?? '#0A2A5E'
          const short = r.label.length > 14 ? r.label.slice(0, 12) + '…' : r.label

          const Bar = (
            <g key={r.value}>
              <title>{`${r.label}: ${total.toLocaleString()}`}</title>
              <rect
                x={x}
                y={y}
                width={barW}
                height={h}
                rx={4}
                fill={color}
                className={onPick ? 'cursor-pointer transition-opacity hover:opacity-80' : ''}
                onClick={onPick ? () => onPick(r) : undefined}
              />
              {/* value on top */}
              <text
                x={x + barW / 2}
                y={y - 6}
                fontSize="10.5"
                textAnchor="middle"
                className="fill-ink-600 dark:fill-ink-300 tabular-nums font-semibold"
              >
                {total.toLocaleString()}
              </text>
              {/* label below */}
              <text
                x={x + barW / 2}
                y={padding.t + innerH + 16}
                fontSize="10"
                textAnchor="middle"
                className="fill-ink-500"
              >
                {short}
              </text>
            </g>
          )
          return Bar
        })}
      </svg>
    </div>
  )
}
