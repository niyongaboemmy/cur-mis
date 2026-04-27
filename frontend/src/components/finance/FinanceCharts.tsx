/**
 * Shared Recharts wrappers used across finance pages.
 * All charts are responsive and respect dark mode via CSS var colors.
 */
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  RadialBarChart, RadialBar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

// ─── Palette ──────────────────────────────────────────────────────────────────

export const CHART_COLORS = {
  brand:    '#6366f1',
  green:    '#22c55e',
  red:      '#ef4444',
  yellow:   '#eab308',
  orange:   '#f97316',
  blue:     '#3b82f6',
  violet:   '#8b5cf6',
  teal:     '#14b8a6',
  pink:     '#ec4899',
  sky:      '#0ea5e9',
}

export const PIE_COLORS = [
  CHART_COLORS.brand, CHART_COLORS.green, CHART_COLORS.blue,
  CHART_COLORS.orange, CHART_COLORS.violet, CHART_COLORS.teal,
  CHART_COLORS.pink, CHART_COLORS.yellow,
]

// ─── Currency formatter ───────────────────────────────────────────────────────

function fmtRwf(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K`
  return String(v)
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, currency = true }: {
  active?: boolean; payload?: any[]; label?: any; currency?: boolean
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-ink-800 border border-ink-100 dark:border-ink-700 rounded-lg shadow-lg px-3 py-2 text-xs min-w-[140px]">
      {label != null && <p className="font-semibold text-ink-700 dark:text-ink-200 mb-1.5">{String(label)}</p>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-ink-500">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="font-mono font-semibold text-ink-800 dark:text-ink-100">
            {currency ? `${fmtRwf(Number(p.value))} RWF` : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Area / Line Chart ────────────────────────────────────────────────────────

export interface AreaSeries { key: string; label: string; color: string; dashed?: boolean }

export function FinanceAreaChart({
  data, series, height = 220, xKey = 'month',
}: {
  data:    Record<string, unknown>[]
  series:  AreaSeries[]
  height?: number
  xKey?:   string
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <defs>
          {series.map(s => (
            <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={s.color} stopOpacity={0.18} />
              <stop offset="95%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-ink-100 dark:text-ink-700" />
        <XAxis dataKey={xKey} tick={{ fontSize: 10, fill: 'currentColor' }} className="text-ink-400" />
        <YAxis tickFormatter={fmtRwf} tick={{ fontSize: 10, fill: 'currentColor' }} className="text-ink-400" width={52} />
        <Tooltip content={(p) => <ChartTooltip {...(p as any)} />} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {series.map(s => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            strokeDasharray={s.dashed ? '4 3' : undefined}
            fill={`url(#grad-${s.key})`}
            dot={{ r: 3, fill: s.color }}
            activeDot={{ r: 5 }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ─── Grouped Bar Chart ────────────────────────────────────────────────────────

export interface BarSeries { key: string; label: string; color: string }

export function FinanceBarChart({
  data, series, height = 220, xKey = 'label', currency = true,
}: {
  data:      Record<string, unknown>[]
  series:    BarSeries[]
  height?:   number
  xKey?:     string
  currency?: boolean
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barCategoryGap="25%">
        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-ink-100 dark:text-ink-700" vertical={false} />
        <XAxis dataKey={xKey} tick={{ fontSize: 10, fill: 'currentColor' }} className="text-ink-400" />
        <YAxis tickFormatter={currency ? fmtRwf : undefined} tick={{ fontSize: 10, fill: 'currentColor' }} className="text-ink-400" width={52} />
        <Tooltip content={(p) => <ChartTooltip {...(p as any)} currency={currency} />} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {series.map(s => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[3, 3, 0, 0]} maxBarSize={32} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─── Donut / Pie Chart ────────────────────────────────────────────────────────

export interface PieSlice { name: string; value: number; color?: string }

export function FinanceDonut({
  data, height = 200, innerLabel, innerSub,
}: {
  data:        PieSlice[]
  height?:     number
  innerLabel?: string
  innerSub?:   string
}) {
  const filled = data.filter(d => d.value > 0)
  if (!filled.length) return (
    <div style={{ height }} className="flex items-center justify-center text-ink-300 text-xs">No data</div>
  )
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={filled}
          cx="50%"
          cy="50%"
          innerRadius="55%"
          outerRadius="80%"
          paddingAngle={2}
          dataKey="value"
          nameKey="name"
        >
          {filled.map((entry, i) => (
            <Cell key={i} fill={entry.color ?? PIE_COLORS[i % PIE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip content={(p) => <ChartTooltip {...(p as any)} />} />
        <Legend
          layout="vertical"
          align="right"
          verticalAlign="middle"
          wrapperStyle={{ fontSize: 10, lineHeight: '1.8' }}
          formatter={(value) => <span className="text-ink-500">{value}</span>}
        />
        {innerLabel && (
          <text x="33%" y="47%" textAnchor="middle" dominantBaseline="middle" className="fill-ink-700 dark:fill-white">
            <tspan x="33%" dy="0" fontSize={15} fontWeight={700}>{innerLabel}</tspan>
            {innerSub && <tspan x="33%" dy={16} fontSize={10} fill="#94a3b8">{innerSub}</tspan>}
          </text>
        )}
      </PieChart>
    </ResponsiveContainer>
  )
}

// ─── Radial Progress Ring ─────────────────────────────────────────────────────

export function RadialProgress({
  pct, color = CHART_COLORS.brand, size = 100, label, sub,
}: {
  pct:    number
  color?: string
  size?:  number
  label?: string
  sub?:   string
}) {
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <ResponsiveContainer width={size} height={size}>
        <RadialBarChart
          innerRadius="70%"
          outerRadius="100%"
          data={[{ value: Math.min(pct, 100), fill: color }]}
          startAngle={90}
          endAngle={-270}
        >
          <RadialBar dataKey="value" background={{ fill: '#e2e8f0' }} cornerRadius={4} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {label && <span className="text-sm font-bold text-ink-700 dark:text-white leading-none">{label}</span>}
        {sub   && <span className="text-[9px] text-ink-400 mt-0.5">{sub}</span>}
      </div>
    </div>
  )
}

// ─── Mini Sparkline (inline area) ────────────────────────────────────────────

export function Sparkline({
  data, color = CHART_COLORS.brand, height = 36,
}: {
  data:    number[]
  color?:  string
  height?: number
}) {
  const chartData = data.map((v, i) => ({ i, v }))
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 2, right: 2, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`spark-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#spark-${color})`} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
