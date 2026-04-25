import { useMemo, useRef, useState } from 'react'

export interface BarDatum {
  value: string
  label: string
  total: number
  color?: string
}

interface BarChartProps {
  data:        BarDatum[]
  onPick?:     (d: BarDatum) => void
  labelWidth?: number
  barHeight?:  number
  gap?:        number
  maxBars?:    number
}

/**
 * Horizontal bar chart with a rich hover tooltip.
 * - Long labels truncate in the left gutter
 * - Hovering any bar floats a tooltip with the FULL label + value
 */
export default function BarChart({
  data,
  onPick,
  labelWidth = 160,
  barHeight  = 22,
  gap        = 8,
  maxBars    = 12,
}: BarChartProps) {
  const rows = useMemo(() => data.slice(0, maxBars), [data, maxBars])

  const max = useMemo(
    () => rows.reduce((m, r) => Math.max(m, Number(r.total) || 0), 0) || 1,
    [rows],
  )

  const paddingR = 56
  const trackH   = rows.length * (barHeight + gap) + gap

  const wrapRef  = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<{ idx: number; x: number; y: number } | null>(null)

  const onMove = (e: React.MouseEvent, idx: number) => {
    const box = wrapRef.current?.getBoundingClientRect()
    if (!box) return
    setHover({ idx, x: e.clientX - box.left, y: e.clientY - box.top })
  }

  const hovered = hover ? rows[hover.idx] : null

  return (
    <div ref={wrapRef} className="relative w-full" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 600 ${trackH}`} width="100%" height={trackH} preserveAspectRatio="none">
        {rows.map((r, i) => {
          const y      = gap + i * (barHeight + gap)
          const total  = Number(r.total) || 0
          const fullW  = 600 - labelWidth - paddingR
          const w      = Math.max(2, (total / max) * fullW)
          const color  = r.color ?? '#0A2A5E'
          const short  = r.label.length > 22 ? r.label.slice(0, 20) + '…' : r.label
          const isActive = hover?.idx === i

          return (
            <g
              key={r.value}
              className={onPick ? 'cursor-pointer' : ''}
              onClick={onPick ? () => onPick(r) : undefined}
              onMouseEnter={(e) => onMove(e, i)}
              onMouseMove={(e) => onMove(e, i)}
            >
              {/* Label on the left */}
              <text
                x={labelWidth - 6}
                y={y + barHeight / 2 + 4}
                fontSize="11"
                textAnchor="end"
                className={isActive
                  ? 'fill-ink-900 dark:fill-white font-semibold'
                  : 'fill-ink-600 dark:fill-ink-300'}
              >
                {short}
              </text>

              {/* Track */}
              <rect
                x={labelWidth}
                y={y}
                width={fullW}
                height={barHeight}
                rx={4}
                className="fill-ink-100 dark:fill-ink-700/40"
              />

              {/* Bar */}
              <rect
                x={labelWidth}
                y={y}
                width={w}
                height={barHeight}
                rx={4}
                fill={color}
                style={{ transition: 'width 300ms', opacity: isActive ? 0.9 : 1 }}
              />

              {/* Value on the right */}
              <text
                x={labelWidth + w + 6}
                y={y + barHeight / 2 + 4}
                fontSize="11"
                textAnchor="start"
                className="fill-ink-900 dark:fill-white tabular-nums font-semibold"
              >
                {total.toLocaleString()}
              </text>
            </g>
          )
        })}
      </svg>

      {hovered && hover && (
        <div
          role="tooltip"
          style={{
            left: Math.min(hover.x + 14, (wrapRef.current?.clientWidth ?? 600) - 260),
            top:  Math.max(hover.y - 12, 0),
          }}
          className="pointer-events-none absolute z-20 max-w-[260px] rounded-lg bg-ink-900 text-white shadow-xl px-3 py-2"
        >
          <p className="text-[12px] font-semibold leading-snug break-words">
            {hovered.label}
          </p>
          <div className="flex items-center gap-2 mt-0.5 text-[11.5px] text-ink-200">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: hovered.color ?? '#0A2A5E' }}
            />
            <span className="tabular-nums font-semibold">{Number(hovered.total).toLocaleString()}</span>
            <span className="text-ink-400">student{Number(hovered.total) === 1 ? '' : 's'}</span>
          </div>
        </div>
      )}
    </div>
  )
}
