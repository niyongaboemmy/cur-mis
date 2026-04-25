import { useMemo, useRef, useState } from 'react'

interface Segment {
  label: string
  value: number
  color: string
}

interface DonutChartProps {
  segments:   Segment[]
  centerTop?: string
  centerBig?: string | number
  size?:      number
  thickness?: number
}

export default function DonutChart({
  segments,
  centerTop  = 'Total',
  centerBig,
  size       = 220,
  thickness  = 22,
}: DonutChartProps) {
  const total = useMemo(() => segments.reduce((sum, s) => sum + s.value, 0), [segments])
  const big   = centerBig ?? total.toLocaleString()
  const cx    = size / 2
  const cy    = size / 2
  const r     = (size - thickness) / 2 - 4
  const c     = 2 * Math.PI * r

  const wrapRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<{ idx: number; x: number; y: number } | null>(null)

  const onMove = (e: React.MouseEvent, idx: number) => {
    const box = wrapRef.current?.getBoundingClientRect()
    if (!box) return
    setHover({ idx, x: e.clientX - box.left, y: e.clientY - box.top })
  }

  // Precompute each segment's stroke-dash geometry
  let offset = 0
  const segs = segments.map((s) => {
    const share = total === 0 ? 0 : s.value / total
    const len   = share * c
    const d     = { s, len, offset, percent: Math.round(share * 100) }
    offset += len
    return d
  })

  const hovered = hover ? segs[hover.idx] : null

  return (
    <div ref={wrapRef} className="relative flex items-center justify-center" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="-rotate-90">
        <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth={thickness} className="stroke-ink-100 dark:stroke-ink-700" />
        {segs.map(({ s, len, offset }, i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={hover?.idx === i ? thickness + 4 : thickness}
            strokeLinecap="round"
            strokeDasharray={`${len} ${c - len}`}
            strokeDashoffset={-offset}
            onMouseEnter={(e) => onMove(e, i)}
            onMouseMove={(e) => onMove(e, i)}
            style={{ transition: 'stroke-width 0.15s ease, stroke-dasharray 0.6s ease', cursor: 'pointer' }}
          />
        ))}
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
        {hovered ? (
          <>
            <span className="text-[10px] uppercase tracking-widest font-semibold text-ink-400">
              {hovered.s.label}
            </span>
            <span className="text-2xl font-semibold text-ink-900 dark:text-white tabular-nums">
              {hovered.s.value.toLocaleString()}
            </span>
            <span className="text-[11px] text-ink-500 mt-0.5 tabular-nums">
              {hovered.percent}%
            </span>
          </>
        ) : (
          <>
            <span className="text-[10px] uppercase tracking-widest font-semibold text-ink-400">{centerTop}</span>
            <span className="text-2xl font-semibold text-ink-900 dark:text-white tabular-nums">{big}</span>
          </>
        )}
      </div>

      {hovered && hover && (
        <div
          role="tooltip"
          style={{
            left: Math.min(hover.x + 14, (wrapRef.current?.clientWidth ?? size) - 200),
            top:  Math.max(hover.y - 12, 0),
          }}
          className="pointer-events-none absolute z-20 max-w-[220px] rounded-lg bg-ink-900 text-white shadow-xl px-3 py-2"
        >
          <p className="text-[12px] font-semibold leading-snug">
            {hovered.s.label}
          </p>
          <div className="flex items-center gap-2 mt-0.5 text-[11.5px] text-ink-200">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: hovered.s.color }} />
            <span className="tabular-nums font-semibold">{hovered.s.value.toLocaleString()}</span>
            <span className="text-ink-400 tabular-nums">· {hovered.percent}%</span>
          </div>
        </div>
      )}
    </div>
  )
}
