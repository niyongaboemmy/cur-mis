interface Segment {
  label: string
  value: number
  color: string
}

interface DonutChartProps {
  segments:  Segment[]
  centerTop?:  string
  centerBig?:  string | number
  size?:       number   // svg viewbox size
  thickness?:  number
}

export default function DonutChart({
  segments,
  centerTop  = 'Total',
  centerBig,
  size       = 220,
  thickness  = 22,
}: DonutChartProps) {
  const total  = segments.reduce((sum, s) => sum + s.value, 0)
  const big    = centerBig ?? total.toLocaleString()
  const cx     = size / 2
  const cy     = size / 2
  const r      = (size - thickness) / 2 - 4
  const c      = 2 * Math.PI * r

  let offset = 0

  return (
    <div className="relative flex items-center justify-center">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="-rotate-90">
        {/* Track */}
        <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth={thickness} className="stroke-ink-100 dark:stroke-ink-700" />
        {segments.map((s, i) => {
          const share  = total === 0 ? 0 : s.value / total
          const len    = share * c
          const seg = (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeLinecap="round"
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              style={{ transition: 'stroke-dasharray 0.6s ease' }}
            />
          )
          offset += len
          return seg
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-[10px] uppercase tracking-widest font-semibold text-ink-400">{centerTop}</span>
        <span className="text-2xl font-semibold font-display text-ink-900 dark:text-white tabular-nums">{big}</span>
      </div>
    </div>
  )
}
