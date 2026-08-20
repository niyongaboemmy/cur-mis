import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Activity, Download, RefreshCw, Shield, Users, Zap,
  TrendingUp, TrendingDown, Clock, BarChart2, User,
  AlertTriangle, CheckCircle2, LogIn, LogOut, Trash2,
  PencilLine, Plus,
} from 'lucide-react'
import { logService } from '@/services/logService'
import { usePagination } from '@/hooks/usePagination'
import DataTable, { type Column } from '@/components/ui/DataTable'
import Button from '@/components/ui/Button'
import type { SystemLog, SystemLogFilters, SystemLogStats } from '@/types'

// ─── Design tokens (match the codebase design system) ────────────────────────

type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info'

const ACTION_META: Record<string, { variant: BadgeVariant; icon: React.ElementType; color: string }> = {
  CREATE:   { variant: 'success', icon: Plus,        color: 'text-emerald-500' },
  UPDATE:   { variant: 'info',    icon: PencilLine,  color: 'text-blue-500'   },
  DELETE:   { variant: 'danger',  icon: Trash2,      color: 'text-red-500'    },
  LOGIN:    { variant: 'primary', icon: LogIn,       color: 'text-brand'      },
  LOGOUT:   { variant: 'default', icon: LogOut,      color: 'text-ink-400'    },
  APPROVE:  { variant: 'success', icon: CheckCircle2,color: 'text-emerald-500'},
  REJECT:   { variant: 'danger',  icon: AlertTriangle,color: 'text-red-500'   },
  GENERATE: { variant: 'warning', icon: Zap,         color: 'text-amber-500'  },
  EXPORT:   { variant: 'info',    icon: Download,    color: 'text-blue-500'   },
  ASSIGN:   { variant: 'warning', icon: Shield,      color: 'text-amber-500'  },
}

const MODULE_COLORS: Record<string, string> = {
  AUTH:       '#4A7FC1',
  USERS:      '#6366f1',
  ROLES:      '#f59e0b',
  FINANCE:    '#10b981',
  HR:         '#3b82f6',
  ADMISSIONS: '#8b5cf6',
  STUDENTS:   '#64748b',
  SYSTEM:     '#94a3b8',
}

const KNOWN_ACTIONS = Object.keys(ACTION_META)

// ─── Badge chip ───────────────────────────────────────────────────────────────

const ACTION_CLS: Record<BadgeVariant, string> = {
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  info:    'bg-blue-100    text-blue-700    dark:bg-blue-900/30    dark:text-blue-400',
  danger:  'bg-red-100     text-red-700     dark:bg-red-900/30     dark:text-red-400',
  primary: 'bg-brand/10   text-brand       dark:bg-brand/20       dark:text-blue-300',
  warning: 'bg-amber-100  text-amber-700   dark:bg-amber-900/30   dark:text-amber-400',
  default: 'bg-ink-100    text-ink-600     dark:bg-ink-700        dark:text-ink-300',
}

function Chip({ label, variant = 'default' }: { label: string; variant?: BadgeVariant }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold tracking-wide ${ACTION_CLS[variant]}`}>
      {label}
    </span>
  )
}

// ─── Spark bar (7-day mini trend) ────────────────────────────────────────────

function SparkBars({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1)
  const days = useMemo(() => {
    const filled: { date: string; count: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      const found = data.find((r) => r.date === key)
      filled.push({ date: key, count: found?.count ?? 0 })
    }
    return filled
  }, [data])

  return (
    <div className="flex items-end gap-[3px] h-8">
      {days.map((d) => {
        const pct = max > 0 ? (d.count / max) * 100 : 0
        const isToday = d.date === new Date().toISOString().slice(0, 10)
        return (
          <div
            key={d.date}
            title={`${d.date}: ${d.count} events`}
            className={`flex-1 rounded-sm transition-all ${isToday ? 'bg-brand' : 'bg-ink-200 dark:bg-ink-600'}`}
            style={{ height: `${Math.max(pct, 8)}%` }}
          />
        )
      })}
    </div>
  )
}

// ─── Module horizontal bar ────────────────────────────────────────────────────

function ModuleBar({ rows, total, onPick }: {
  rows: { module: string; count: number }[]
  total: number
  onPick: (m: string) => void
}) {
  return (
    <div className="space-y-2">
      {rows.slice(0, 7).map((r) => {
        const pct = total > 0 ? (r.count / total) * 100 : 0
        const color = MODULE_COLORS[r.module] ?? '#94a3b8'
        return (
          <button
            key={r.module}
            onClick={() => onPick(r.module)}
            className="w-full group text-left"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[12px] font-medium text-ink-700 dark:text-ink-300 group-hover:text-brand transition-colors">
                {r.module}
              </span>
              <span className="text-[11px] text-ink-400 tabular-nums">{r.count.toLocaleString()}</span>
            </div>
            <div className="h-1.5 rounded-full bg-ink-100 dark:bg-ink-700 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon, iconCls, delta,
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ElementType
  iconCls: string
  delta?: number
}) {
  return (
    <div className="card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconCls}`}>
          <Icon className="w-4 h-4" />
        </div>
        {delta !== undefined && (
          <span className={`text-[11px] font-semibold flex items-center gap-0.5 ${delta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
            {delta >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(delta)}%
          </span>
        )}
      </div>
      <div>
        <p className="text-[22px] font-bold text-ink-900 dark:text-white tabular-nums leading-none">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
        <p className="text-[12px] text-ink-500 dark:text-ink-400 mt-1">{label}</p>
        {sub && <p className="text-[11px] text-ink-400 dark:text-ink-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Table columns ────────────────────────────────────────────────────────────

const COLUMNS: Column<SystemLog>[] = [
  {
    key: 'created_at',
    header: 'Time',
    sortable: true,
    render: (row) => (
      <span className="text-[11px] font-mono text-ink-400 dark:text-ink-500 whitespace-nowrap">
        {new Date(row.created_at).toLocaleString(undefined, {
          month: 'short', day: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
        })}
      </span>
    ),
  },
  {
    key: 'user_name',
    header: 'Actor',
    render: (row) => (
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-brand/10 dark:bg-brand/20 flex items-center justify-center shrink-0">
          <User className="w-3 h-3 text-brand" />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-ink-900 dark:text-ink-100 truncate leading-none">
            {row.user_name || 'System'}
          </p>
          <p className="text-[11px] text-ink-400 truncate">{row.user_email || '—'}</p>
        </div>
      </div>
    ),
  },
  {
    key: 'module',
    header: 'Module',
    render: (row) => (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold tracking-wider"
        style={{
          backgroundColor: (MODULE_COLORS[row.module] ?? '#94a3b8') + '22',
          color: MODULE_COLORS[row.module] ?? '#94a3b8',
        }}
      >
        {row.module}
      </span>
    ),
  },
  {
    key: 'action',
    header: 'Action',
    render: (row) => {
      const meta = ACTION_META[row.action]
      return <Chip label={row.action} variant={meta?.variant ?? 'default'} />
    },
  },
  {
    key: 'description',
    header: 'Description',
    render: (row) => (
      <span
        title={row.description}
        className="text-[13px] text-ink-700 dark:text-ink-300 block max-w-sm truncate"
      >
        {row.description}
      </span>
    ),
  },
  {
    key: 'entity_type',
    header: 'Entity',
    render: (row) =>
      row.entity_type ? (
        <span className="text-[11px] font-mono text-ink-500 dark:text-ink-400 whitespace-nowrap">
          {row.entity_type}{row.entity_id != null ? ` #${row.entity_id}` : ''}
        </span>
      ) : (
        <span className="text-ink-300 dark:text-ink-600">—</span>
      ),
  },
  {
    key: 'ip_address',
    header: 'IP',
    render: (row) => (
      <span className="font-mono text-[11px] text-ink-400 dark:text-ink-500">
        {row.ip_address || '—'}
      </span>
    ),
  },
]

// ─── Main page ────────────────────────────────────────────────────────────────

export default function LogsPage() {
  const pagination   = usePagination({ sortKey: 'created_at', sortDir: 'desc' })
  const [filters, setFilters]       = useState<SystemLogFilters>({})
  const [autoRefresh, setAutoRefresh] = useState(false)
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null)

  // Stats (dashboard strip) — refresh every 30 s when auto-refresh on
  const { data: statsRes, refetch: refetchStats } = useQuery({
    queryKey: ['log-stats'],
    queryFn:  ({ signal }) => logService.getStats(signal),
    staleTime: 20_000,
  })
  const stats: SystemLogStats | null = statsRes?.data ?? null

  // Module filter options
  const { data: modulesRes } = useQuery({
    queryKey: ['log-modules'],
    queryFn:  ({ signal }) => logService.getModules(signal),
    staleTime: 60_000,
  })
  const modules: string[] = modulesRes?.data ?? []

  // Log table
  const queryParams = { ...pagination.toParams(), ...filters }
  const { data: logsRes, isLoading, refetch: refetchLogs } = useQuery({
    queryKey: ['system-logs', queryParams],
    queryFn:  ({ signal }) => logService.getLogs(queryParams as SystemLogFilters, signal),
    staleTime: 15_000,
  })

  const refetchAll = useCallback(() => { refetchLogs(); refetchStats() }, [refetchLogs, refetchStats])

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(refetchAll, 30_000)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [autoRefresh, refetchAll])

  const paginated = logsRes?.data
  const logs: SystemLog[] = paginated?.data ?? []

  const todayDelta = useMemo(() => {
    if (!stats || stats.yesterday === 0) return undefined
    return Math.round(((stats.today - stats.yesterday) / stats.yesterday) * 100)
  }, [stats])

  const topModule = stats?.by_module?.[0]?.module ?? '—'
  const topAction = stats?.by_action?.[0]?.action ?? '—'

  const setFilter = useCallback((key: keyof SystemLogFilters, value: string) => {
    setFilters((prev) => {
      const next = { ...prev }
      if (value === '') delete (next as Record<string, unknown>)[key]
      else (next as Record<string, unknown>)[key] = value
      return next
    })
    pagination.setPage(1)
  }, [pagination])

  const pickModule = useCallback((m: string) => {
    setFilter('module', filters.module === m ? '' : m)
  }, [filters.module, setFilter])

  const clearFilters = useCallback(() => { setFilters({}); pagination.reset() }, [pagination])

  const activeFilterCount = Object.keys(filters).length

  return (
    <div className="min-h-full bg-[rgb(var(--bg-app))] dark:bg-[rgb(var(--bg-app))]">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand/10 dark:bg-brand/20 flex items-center justify-center">
              <Activity className="w-5 h-5 text-brand" />
            </div>
            <div>
              <h1 className="text-[18px] font-bold text-ink-900 dark:text-white leading-tight">
                System Logs
              </h1>
              <p className="text-[12px] text-ink-500 dark:text-ink-400">
                Full audit trail of every action across the platform
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-1.5 text-[12px] text-ink-500 dark:text-ink-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-ink-300 dark:border-ink-600 text-brand"
              />
              Auto-refresh
            </label>
            <Button variant="ghost" size="sm" onClick={refetchAll}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Refresh
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.open(logService.exportUrl(filters), '_blank')}
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* ── KPI strip ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Total events"
            value={stats?.total ?? '—'}
            sub="all time"
            icon={BarChart2}
            iconCls="bg-brand/10 dark:bg-brand/20 text-brand"
          />
          <KpiCard
            label="Today"
            value={stats?.today ?? '—'}
            sub={stats?.yesterday !== undefined ? `${stats.yesterday} yesterday` : undefined}
            icon={Clock}
            iconCls="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600"
            delta={todayDelta}
          />
          <KpiCard
            label="Most active module"
            value={topModule}
            sub={stats?.by_module?.[0] ? `${stats.by_module[0].count.toLocaleString()} events` : undefined}
            icon={Shield}
            iconCls="bg-amber-50 dark:bg-amber-900/20 text-amber-600"
          />
          <KpiCard
            label="Most frequent action"
            value={topAction}
            sub={stats?.by_action?.[0] ? `${stats.by_action[0].count.toLocaleString()} times` : undefined}
            icon={Zap}
            iconCls="bg-purple-50 dark:bg-purple-900/20 text-purple-600"
          />
        </div>

        {/* ── Dashboard row: trend + module breakdown + top users ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* 7-day activity trend */}
          <div className="card p-4 lg:col-span-1">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[13px] font-semibold text-ink-800 dark:text-white">
                  7-day activity
                </p>
                <p className="text-[11px] text-ink-400 dark:text-ink-500 mt-0.5">
                  Events per day
                </p>
              </div>
              <TrendingUp className="w-4 h-4 text-ink-300 dark:text-ink-600" />
            </div>
            {stats?.trend_7d && stats.trend_7d.length > 0 ? (
              <SparkBars data={stats.trend_7d} />
            ) : (
              <div className="h-8 bg-ink-50 dark:bg-ink-700/30 rounded animate-pulse" />
            )}
            <div className="flex justify-between mt-2">
              {[-6, -5, -4, -3, -2, -1, 0].map((offset) => {
                const d = new Date()
                d.setDate(d.getDate() + offset)
                return (
                  <span key={offset} className="text-[9px] text-ink-300 dark:text-ink-600 flex-1 text-center">
                    {d.toLocaleDateString(undefined, { weekday: 'narrow' })}
                  </span>
                )
              })}
            </div>
          </div>

          {/* Module breakdown */}
          <div className="card p-4 lg:col-span-1">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[13px] font-semibold text-ink-800 dark:text-white">
                  By module
                </p>
                <p className="text-[11px] text-ink-400 dark:text-ink-500 mt-0.5">
                  Click to filter
                </p>
              </div>
              <Shield className="w-4 h-4 text-ink-300 dark:text-ink-600" />
            </div>
            {stats?.by_module && stats.by_module.length > 0 ? (
              <ModuleBar
                rows={stats.by_module}
                total={stats.total}
                onPick={pickModule}
              />
            ) : (
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-6 bg-ink-50 dark:bg-ink-700/30 rounded animate-pulse" />
                ))}
              </div>
            )}
          </div>

          {/* Top users */}
          <div className="card p-4 lg:col-span-1">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[13px] font-semibold text-ink-800 dark:text-white">
                  Top actors
                </p>
                <p className="text-[11px] text-ink-400 dark:text-ink-500 mt-0.5">
                  Most active users
                </p>
              </div>
              <Users className="w-4 h-4 text-ink-300 dark:text-ink-600" />
            </div>
            {stats?.top_users && stats.top_users.length > 0 ? (
              <div className="space-y-2">
                {stats.top_users.map((u, i) => (
                  <button
                    key={u.user_email}
                    onClick={() => setFilter('search', u.user_email)}
                    className="w-full flex items-center gap-2.5 group text-left p-1.5 rounded-lg hover:bg-ink-50 dark:hover:bg-ink-700/40 transition-colors"
                  >
                    <div className="w-6 h-6 rounded-full bg-brand/10 dark:bg-brand/20 flex items-center justify-center shrink-0 text-[10px] font-bold text-brand">
                      {i + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-medium text-ink-800 dark:text-ink-200 truncate leading-none group-hover:text-brand transition-colors">
                        {u.user_name}
                      </p>
                      <p className="text-[10px] text-ink-400 truncate">{u.user_email}</p>
                    </div>
                    <span className="text-[12px] font-semibold text-ink-500 dark:text-ink-400 tabular-nums shrink-0">
                      {u.count.toLocaleString()}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-8 bg-ink-50 dark:bg-ink-700/30 rounded animate-pulse" />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Filter bar ─────────────────────────────────────────── */}
        <div className="card p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-ink-500 dark:text-ink-400 uppercase tracking-wide">
                Module
              </label>
              <select
                className="border border-ink-200 dark:border-ink-600 rounded-lg px-3 py-1.5 text-[13px] bg-white dark:bg-ink-800 text-ink-900 dark:text-ink-100 focus:outline-none focus:ring-2 focus:ring-brand/40"
                value={filters.module ?? ''}
                onChange={(e) => setFilter('module', e.target.value)}
              >
                <option value="">All modules</option>
                {modules.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-ink-500 dark:text-ink-400 uppercase tracking-wide">
                Action
              </label>
              <select
                className="border border-ink-200 dark:border-ink-600 rounded-lg px-3 py-1.5 text-[13px] bg-white dark:bg-ink-800 text-ink-900 dark:text-ink-100 focus:outline-none focus:ring-2 focus:ring-brand/40"
                value={filters.action ?? ''}
                onChange={(e) => setFilter('action', e.target.value)}
              >
                <option value="">All actions</option>
                {KNOWN_ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-ink-500 dark:text-ink-400 uppercase tracking-wide">
                From
              </label>
              <input
                type="date"
                className="border border-ink-200 dark:border-ink-600 rounded-lg px-3 py-1.5 text-[13px] bg-white dark:bg-ink-800 text-ink-900 dark:text-ink-100 focus:outline-none focus:ring-2 focus:ring-brand/40"
                value={filters.date_from ?? ''}
                onChange={(e) => setFilter('date_from', e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-ink-500 dark:text-ink-400 uppercase tracking-wide">
                To
              </label>
              <input
                type="date"
                className="border border-ink-200 dark:border-ink-600 rounded-lg px-3 py-1.5 text-[13px] bg-white dark:bg-ink-800 text-ink-900 dark:text-ink-100 focus:outline-none focus:ring-2 focus:ring-brand/40"
                value={filters.date_to ?? ''}
                onChange={(e) => setFilter('date_to', e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
              <label className="text-[11px] font-semibold text-ink-500 dark:text-ink-400 uppercase tracking-wide">
                Search
              </label>
              <input
                type="text"
                placeholder="Name, email, description…"
                className="border border-ink-200 dark:border-ink-600 rounded-lg px-3 py-1.5 text-[13px] bg-white dark:bg-ink-800 text-ink-900 dark:text-ink-100 placeholder-ink-400 dark:placeholder-ink-500 focus:outline-none focus:ring-2 focus:ring-brand/40 w-full"
                value={filters.search ?? ''}
                onChange={(e) => setFilter('search', e.target.value)}
              />
            </div>

            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="text-[12px] text-ink-500 hover:text-red-500 dark:text-ink-400 dark:hover:text-red-400 transition-colors flex items-center gap-1 pb-1.5"
              >
                <Trash2 className="w-3 h-3" />
                Clear {activeFilterCount > 1 ? `(${activeFilterCount})` : ''}
              </button>
            )}
          </div>

          {/* Active module filter pill */}
          {filters.module && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-[11px] text-ink-400">Filtered by module:</span>
              <button
                onClick={() => setFilter('module', '')}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                style={{
                  backgroundColor: (MODULE_COLORS[filters.module] ?? '#94a3b8') + '22',
                  color: MODULE_COLORS[filters.module] ?? '#94a3b8',
                }}
              >
                {filters.module}
                <span className="opacity-60">×</span>
              </button>
            </div>
          )}
        </div>

        {/* ── Result count ───────────────────────────────────────── */}
        {paginated && (
          <div className="flex items-center justify-between">
            <p className="text-[12px] text-ink-500 dark:text-ink-400">
              <span className="font-semibold text-ink-800 dark:text-ink-200">
                {paginated.total.toLocaleString()}
              </span>{' '}
              log entr{paginated.total === 1 ? 'y' : 'ies'}
              {activeFilterCount > 0 && ' matching current filters'}
            </p>
            {stats?.last_entry && (
              <p className="text-[11px] text-ink-400 dark:text-ink-500">
                Last event: {new Date(stats.last_entry).toLocaleString()}
              </p>
            )}
          </div>
        )}

        {/* ── Log table ──────────────────────────────────────────── */}
        <div className="card overflow-hidden">
          <DataTable<SystemLog>
            columns={COLUMNS}
            data={logs}
            keyExtractor={(row) => row.id}
            isLoading={isLoading}
            total={paginated?.total}
            currentPage={paginated?.current_page ?? 1}
            lastPage={paginated?.last_page ?? 1}
            perPage={paginated?.per_page ?? 25}
            onPageChange={pagination.setPage}
            sort={{ key: pagination.sortKey, direction: pagination.sortDir }}
            onSort={pagination.setSort}
            emptyTitle="No logs found"
            emptyDescription={
              activeFilterCount > 0
                ? 'No events match your current filters. Try clearing some.'
                : 'No activity has been recorded yet. Events will appear here as users interact with the platform.'
            }
          />
        </div>

      </div>
    </div>
  )
}
