import { useState, useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell,
} from 'recharts'
import {
  TrendingUp, Users, BookOpen, CheckCircle, XCircle,
  GraduationCap, BarChart2, ClipboardCheck, Activity, Loader2,
  AlertCircle, RefreshCw, Download, Search, ChevronUp, ChevronDown,
  ChevronsUpDown, Star, AlertTriangle,
} from 'lucide-react'
import { academicAnalyticsService } from '@/services/academicAnalyticsService'
import { academicService } from '@/services/academicService'

/* ─── Palette ─────────────────────────────────────────────────────────────── */
const GRADE_COLORS: Record<string, string> = {
  A: '#22c55e', B: '#6366f1', C: '#eab308', D: '#f97316', E: '#ef4444',
}
const PIE_COLORS = ['#6366f1','#22c55e','#3b82f6','#f97316','#8b5cf6','#14b8a6','#ec4899','#eab308']

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function pct(v: number) { return `${v.toFixed(1)}%` }

function formatTimeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000)
  if (secs < 5)  return 'just now'
  if (secs < 60) return `${secs}s ago`
  return `${Math.floor(secs / 60)}m ago`
}

/** Download an array of objects as a CSV file. */
function exportCSV(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const lines   = [
    headers.join(','),
    ...rows.map(r =>
      headers.map(h => {
        const val = String(r[h] ?? '')
        return val.includes(',') ? `"${val.replace(/"/g, '""')}"` : val
      }).join(',')
    ),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/* ─── Sorting hook ────────────────────────────────────────────────────────── */
type SortDir = 'asc' | 'desc' | null
function useSortable<T extends Record<string, unknown>>(rows: T[]) {
  const [col, setCol] = useState<keyof T | null>(null)
  const [dir, setDir] = useState<SortDir>(null)

  const sorted = useMemo(() => {
    if (!col || !dir) return rows
    return [...rows].sort((a, b) => {
      const av = a[col] ?? '', bv = b[col] ?? ''
      if (typeof av === 'number' && typeof bv === 'number')
        return dir === 'asc' ? av - bv : bv - av
      return dir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av))
    })
  }, [rows, col, dir])

  const toggle = useCallback((key: keyof T) => {
    if (col !== key) { setCol(key); setDir('desc') }
    else if (dir === 'desc') setDir('asc')
    else { setCol(null); setDir(null) }
  }, [col, dir])

  return { sorted, col, dir, toggle }
}

/* ─── Reusable UI atoms ───────────────────────────────────────────────────── */
function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronsUpDown className="w-3 h-3 text-ink-300 dark:text-ink-600" />
  return dir === 'asc'
    ? <ChevronUp className="w-3 h-3 text-indigo-500" />
    : <ChevronDown className="w-3 h-3 text-indigo-500" />
}

function Th({
  label, sortKey, col, dir, onSort, right = false,
}: {
  label: string
  sortKey?: string
  col: string | null
  dir: SortDir
  onSort?: (k: string) => void
  right?: boolean
}) {
  return (
    <th
      className={[
        'py-2 px-3 text-xs font-medium text-ink-500 select-none whitespace-nowrap',
        right ? 'text-right' : 'text-left',
        sortKey ? 'cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400' : '',
      ].join(' ')}
      onClick={() => sortKey && onSort?.(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {!right && label}
        {sortKey && <SortIcon active={col === sortKey} dir={col === sortKey ? dir : null} />}
        {right && label}
      </span>
    </th>
  )
}

function RateBar({ value, max = 100 }: { value: number; max?: number }) {
  const pctVal  = Math.min((value / max) * 100, 100)
  const color   = value >= 70 ? '#22c55e' : value >= 50 ? '#eab308' : '#ef4444'
  return (
    <div className="flex items-center gap-2 justify-end">
      <div className="w-16 h-1.5 rounded-full bg-ink-100 dark:bg-ink-700 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pctVal}%`, background: color }} />
      </div>
      <span className="font-semibold text-xs w-12 text-right" style={{ color }}>{pct(value)}</span>
    </div>
  )
}

function AttBar({ value }: { value: number }) {
  const color = value >= 80 ? '#22c55e' : value >= 60 ? '#eab308' : '#ef4444'
  return (
    <div className="flex items-center gap-2 justify-end">
      <div className="w-16 h-1.5 rounded-full bg-ink-100 dark:bg-ink-700 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(value, 100)}%`, background: color }} />
      </div>
      <span className="font-semibold text-xs w-12 text-right" style={{ color }}>{pct(value)}</span>
    </div>
  )
}

function StatusBadge({ rate, thresholds = [70, 50] }: { rate: number; thresholds?: [number, number] }) {
  const [hi, mid] = thresholds
  if (rate >= hi)  return <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 font-medium">Good</span>
  if (rate >= mid) return <span className="text-xs px-1.5 py-0.5 rounded-full bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 font-medium">Watch</span>
  return             <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 font-medium">At Risk</span>
}

function KpiCard({
  label, value, sub, icon, accent = 'indigo',
}: {
  label: string; value: string | number; sub?: string
  icon: React.ReactNode; accent?: 'indigo' | 'green' | 'red' | 'yellow' | 'blue'
}) {
  const accents: Record<string, string> = {
    indigo: 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400',
    green:  'bg-green-50  dark:bg-green-900/30  text-green-600  dark:text-green-400',
    red:    'bg-red-50    dark:bg-red-900/30    text-red-600    dark:text-red-400',
    yellow: 'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400',
    blue:   'bg-blue-50   dark:bg-blue-900/30   text-blue-600   dark:text-blue-400',
  }
  return (
    <div className="bg-white dark:bg-ink-800 rounded-xl border border-ink-100 dark:border-ink-700 p-5 flex items-start gap-4">
      <div className={`rounded-lg p-2.5 shrink-0 ${accents[accent]}`}>{icon}</div>
      <div>
        <p className="text-xs text-ink-400 dark:text-ink-500 font-medium uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-ink-800 dark:text-white mt-0.5">{value}</p>
        {sub && <p className="text-xs text-ink-400 dark:text-ink-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-base font-semibold text-ink-800 dark:text-white">{title}</h3>
      {sub && <p className="text-xs text-ink-400 dark:text-ink-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function ChartCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white dark:bg-ink-800 rounded-xl border border-ink-100 dark:border-ink-700 p-5 ${className}`}>
      {children}
    </div>
  )
}

function LoadingPlaceholder() {
  return (
    <div className="flex items-center justify-center h-48 text-ink-400">
      <Loader2 className="w-6 h-6 animate-spin" />
    </div>
  )
}

function ErrorPlaceholder({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-32 gap-2 text-red-500">
      <AlertCircle className="w-6 h-6" />
      <span className="text-sm">{message ?? 'Failed to load data'}</span>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-2 text-ink-400">
      <AlertTriangle className="w-8 h-8 opacity-40" />
      <p className="text-sm">{message}</p>
    </div>
  )
}

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative w-full sm:w-64">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-400 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? 'Search…'}
        className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-ink-200 dark:border-ink-600
                   bg-white dark:bg-ink-800 text-ink-700 dark:text-ink-200
                   focus:outline-none focus:ring-2 focus:ring-indigo-400"
      />
    </div>
  )
}

function ExportBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Export to CSV"
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-ink-200 dark:border-ink-600
                 text-ink-600 dark:text-ink-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20
                 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
    >
      <Download className="w-3.5 h-3.5" />
      Export CSV
    </button>
  )
}

/* ─── Custom tooltip ──────────────────────────────────────────────────────── */
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-ink-800 border border-ink-100 dark:border-ink-700 rounded-lg shadow-lg px-3 py-2 text-xs min-w-[140px]">
      {label != null && <p className="font-semibold text-ink-700 dark:text-ink-200 mb-1.5">{label}</p>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-ink-500">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="font-mono font-semibold text-ink-800 dark:text-ink-100">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

/* ─── Tab types ───────────────────────────────────────────────────────────── */
type Tab = 'overview' | 'grades' | 'passfail' | 'enrollment' | 'departments' | 'attendance'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview',    label: 'Overview',           icon: <Activity className="w-4 h-4" /> },
  { id: 'grades',      label: 'Grade Distribution', icon: <BarChart2 className="w-4 h-4" /> },
  { id: 'passfail',    label: 'Pass / Fail Rates',  icon: <CheckCircle className="w-4 h-4" /> },
  { id: 'enrollment',  label: 'Enrollment Trends',  icon: <TrendingUp className="w-4 h-4" /> },
  { id: 'departments', label: 'Dept. Performance',  icon: <BookOpen className="w-4 h-4" /> },
  { id: 'attendance',  label: 'Attendance',          icon: <ClipboardCheck className="w-4 h-4" /> },
]

/* ═════════════════════════════════════════════════════════════════════════════
 * Main Page
 * ═════════════════════════════════════════════════════════════════════════════ */
export default function AcademicAnalyticsPage() {
  const [tab,     setTab]     = useState<Tab>('overview')
  const [yearId,  setYearId]  = useState<string>('')
  const [pfGroup, setPfGroup] = useState<'department' | 'module'>('department')
  const [refreshedAt, setRefreshedAt] = useState<Date>(new Date())

  const qc = useQueryClient()

  /* years */
  const yearsQ = useQuery({ queryKey: ['academic-years'], queryFn: () => academicService.listYears() })
  const years  = yearsQ.data?.data ?? []

  const yParam = yearId ? { academic_year_id: Number(yearId) } : {}

  /* ── Queries ──────────────────────────────────────────────────────────── */
  const overviewQ = useQuery({
    queryKey: ['analytics', 'overview', yearId],
    queryFn:  () => academicAnalyticsService.overview(yParam),
  })
  const gradesQ = useQuery({
    queryKey: ['analytics', 'grades', yearId],
    queryFn:  () => academicAnalyticsService.gradeDistribution(yParam),
    enabled:  tab === 'grades' || tab === 'overview',
  })
  const passFailQ = useQuery({
    queryKey: ['analytics', 'passfail', yearId, pfGroup],
    queryFn:  () => academicAnalyticsService.passFailRates({ ...yParam, group_by: pfGroup }),
    enabled:  tab === 'passfail',
  })
  const enrollQ = useQuery({
    queryKey: ['analytics', 'enrollment'],
    queryFn:  () => academicAnalyticsService.enrollmentTrends(),
    enabled:  tab === 'enrollment',
  })
  const deptQ = useQuery({
    queryKey: ['analytics', 'departments', yearId],
    queryFn:  () => academicAnalyticsService.departmentPerformance(yParam),
    enabled:  tab === 'departments',
  })
  const attQ = useQuery({
    queryKey: ['analytics', 'attendance', yearId],
    queryFn:  () => academicAnalyticsService.attendanceCompliance(yParam),
    enabled:  tab === 'attendance',
  })

  const overview = overviewQ.data?.data
  const grades   = gradesQ.data?.data
  const passFail = passFailQ.data?.data
  const enroll   = enrollQ.data?.data
  const deptPerf = deptQ.data?.data
  const att      = attQ.data?.data

  const isRefreshing = overviewQ.isFetching || gradesQ.isFetching ||
                       passFailQ.isFetching || enrollQ.isFetching ||
                       deptQ.isFetching || attQ.isFetching

  function handleRefresh() {
    qc.invalidateQueries({ queryKey: ['analytics'] })
    setRefreshedAt(new Date())
  }

  /* ── Render ───────────────────────────────────────────────────────────── */
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-800 dark:text-white flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-indigo-500" />
            Academic Analytics
          </h1>
          <p className="text-sm text-ink-400 dark:text-ink-500 mt-0.5">
            Module performance, grade distribution, enrollment trends and attendance compliance
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Refresh */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-400 dark:text-ink-500 hidden sm:block">
              Updated {formatTimeAgo(refreshedAt)}
            </span>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              title="Refresh all data"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-ink-200 dark:border-ink-600
                         text-ink-600 dark:text-ink-300 hover:bg-ink-50 dark:hover:bg-ink-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {/* Year filter */}
          <select
            value={yearId}
            onChange={e => setYearId(e.target.value)}
            className="text-sm border border-ink-200 dark:border-ink-600 rounded-lg px-3 py-2
                       bg-white dark:bg-ink-800 text-ink-700 dark:text-ink-200
                       focus:outline-none focus:ring-2 focus:ring-indigo-400 min-w-[180px]"
          >
            <option value="">All academic years</option>
            {years.map((y: any) => (
              <option key={y.id} value={y.id}>{y.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-ink-50 dark:bg-ink-900/50 rounded-xl p-1 flex-wrap">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={[
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
              tab === t.id
                ? 'bg-white dark:bg-ink-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-ink-500 dark:text-ink-400 hover:text-ink-700 dark:hover:text-ink-200',
            ].join(' ')}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
       * TAB: Overview
       * ════════════════════════════════════════════════════════════════════ */}
      {tab === 'overview' && (
        <OverviewTab
          overviewQ={overviewQ}
          gradesQ={gradesQ}
          overview={overview}
          grades={grades}
        />
      )}

      {/* ════════════════════════════════════════════════════════════════════
       * TAB: Grade Distribution
       * ════════════════════════════════════════════════════════════════════ */}
      {tab === 'grades' && (
        <GradesTab gradesQ={gradesQ} grades={grades} />
      )}

      {/* ════════════════════════════════════════════════════════════════════
       * TAB: Pass / Fail Rates
       * ════════════════════════════════════════════════════════════════════ */}
      {tab === 'passfail' && (
        <PassFailTab
          passFailQ={passFailQ}
          passFail={passFail}
          pfGroup={pfGroup}
          setPfGroup={setPfGroup}
        />
      )}

      {/* ════════════════════════════════════════════════════════════════════
       * TAB: Enrollment Trends
       * ════════════════════════════════════════════════════════════════════ */}
      {tab === 'enrollment' && (
        <EnrollmentTab enrollQ={enrollQ} enroll={enroll} />
      )}

      {/* ════════════════════════════════════════════════════════════════════
       * TAB: Department Performance
       * ════════════════════════════════════════════════════════════════════ */}
      {tab === 'departments' && (
        <DepartmentsTab deptQ={deptQ} deptPerf={deptPerf} />
      )}

      {/* ════════════════════════════════════════════════════════════════════
       * TAB: Attendance Compliance
       * ════════════════════════════════════════════════════════════════════ */}
      {tab === 'attendance' && (
        <AttendanceTab attQ={attQ} att={att} />
      )}
    </div>
  )
}

/* ═════════════════════════════════════════════════════════════════════════════
 * Overview Tab
 * ═════════════════════════════════════════════════════════════════════════════ */
function OverviewTab({ overviewQ, gradesQ, overview, grades }: any) {
  return (
    <div className="space-y-6">
      {overviewQ.isLoading ? <LoadingPlaceholder /> :
       overviewQ.isError   ? <ErrorPlaceholder /> : overview && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
            <KpiCard
              label="Active Students"
              value={overview.students.toLocaleString()}
              icon={<Users className="w-5 h-5" />}
              accent="indigo"
            />
            <KpiCard
              label="Pass Rate"
              value={pct(overview.pass_rate)}
              sub={`${overview.passed.toLocaleString()} passed / ${overview.failed.toLocaleString()} failed`}
              icon={<CheckCircle className="w-5 h-5" />}
              accent={overview.pass_rate >= 70 ? 'green' : overview.pass_rate >= 50 ? 'yellow' : 'red'}
            />
            <KpiCard
              label="Avg. Score"
              value={pct(overview.avg_percentage)}
              sub="across all recorded marks"
              icon={<TrendingUp className="w-5 h-5" />}
              accent="blue"
            />
            <KpiCard
              label="Attendance Rate"
              value={pct(overview.attendance_rate)}
              sub={`${overview.attendance_total.toLocaleString()} sessions tracked`}
              icon={<ClipboardCheck className="w-5 h-5" />}
              accent={overview.attendance_rate >= 80 ? 'green' : 'yellow'}
            />
            <KpiCard
              label="Modules Assessed"
              value={overview.assessed_modules}
              sub={`${overview.assessed_students.toLocaleString()} students assessed`}
              icon={<BookOpen className="w-5 h-5" />}
              accent="indigo"
            />
          </div>

          {/* Pass/fail visual bar */}
          <ChartCard>
            <SectionTitle title="Pass vs. Fail Summary" />
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <div className="flex-1 bg-ink-100 dark:bg-ink-700 rounded-full h-7 overflow-hidden relative">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all duration-700 flex items-center justify-end pr-2"
                    style={{ width: `${overview.pass_rate}%` }}
                  >
                    {overview.pass_rate > 15 && (
                      <span className="text-white text-xs font-semibold">{pct(overview.pass_rate)}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-6 text-sm">
                <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400 font-semibold">
                  <CheckCircle className="w-4 h-4" />
                  {overview.pass_rate}% pass ({overview.passed.toLocaleString()} students)
                </span>
                <span className="flex items-center gap-1.5 text-red-500 dark:text-red-400 font-semibold">
                  <XCircle className="w-4 h-4" />
                  {(100 - overview.pass_rate).toFixed(1)}% fail ({overview.failed.toLocaleString()} students)
                </span>
              </div>
              {overview.pass_rate < 50 && (
                <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2 border border-red-200 dark:border-red-800">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Overall pass rate is below 50% — academic intervention may be required.
                </div>
              )}
            </div>
          </ChartCard>

          {/* Mini grade chart */}
          {gradesQ.isLoading ? <LoadingPlaceholder /> : grades && (
            <ChartCard>
              <SectionTitle title="Grade Distribution" sub="Count of marks per grade (A–E)" />
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={grades.distribution} margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                  <XAxis dataKey="grade" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" name="Students" radius={[4,4,0,0]}>
                    {grades.distribution.map((d: any) => (
                      <Cell key={d.grade} fill={GRADE_COLORS[d.grade] ?? '#6366f1'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-3 mt-3">
                {grades.distribution.map((d: any) => (
                  <span key={d.grade} className="flex items-center gap-1.5 text-xs text-ink-500">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: GRADE_COLORS[d.grade] }} />
                    Grade {d.grade}: <strong>{d.count}</strong> ({d.percentage}%)
                  </span>
                ))}
              </div>
            </ChartCard>
          )}
        </>
      )}
    </div>
  )
}

/* ═════════════════════════════════════════════════════════════════════════════
 * Grade Distribution Tab
 * ═════════════════════════════════════════════════════════════════════════════ */
function GradesTab({ gradesQ, grades }: any) {
  return (
    <div className="space-y-6">
      {gradesQ.isLoading ? <LoadingPlaceholder /> :
       gradesQ.isError   ? <ErrorPlaceholder /> : grades && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {grades.distribution.map((d: any) => (
              <div
                key={d.grade}
                className="rounded-xl border p-4 text-center transition-transform hover:scale-105 cursor-default"
                style={{ borderColor: GRADE_COLORS[d.grade] + '40', background: GRADE_COLORS[d.grade] + '10' }}
              >
                <p className="text-3xl font-bold" style={{ color: GRADE_COLORS[d.grade] }}>{d.grade}</p>
                <p className="text-xl font-semibold text-ink-800 dark:text-white mt-1">
                  {d.count.toLocaleString()}
                </p>
                <p className="text-xs text-ink-400 mt-0.5">{d.percentage}% of total</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard>
              <SectionTitle title="Grade Distribution Chart" sub={`Total: ${grades.total.toLocaleString()} assessed records`} />
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={grades.distribution} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                  <XAxis dataKey="grade" tick={{ fontSize: 13, fontWeight: 600 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" name="Students" radius={[6,6,0,0]}>
                    {grades.distribution.map((d: any) => (
                      <Cell key={d.grade} fill={GRADE_COLORS[d.grade] ?? '#6366f1'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard>
              <SectionTitle title="Grade Share (Donut)" />
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <ResponsiveContainer width={200} height={200}>
                  <PieChart>
                    <Pie
                      data={grades.distribution.filter((d: any) => d.count > 0)}
                      dataKey="count"
                      nameKey="grade"
                      cx="50%" cy="50%"
                      innerRadius={55} outerRadius={85}
                    >
                      {grades.distribution.map((d: any) => (
                        <Cell key={d.grade} fill={GRADE_COLORS[d.grade] ?? '#6366f1'} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 flex-1">
                  {grades.distribution.map((d: any) => (
                    <div key={d.grade} className="flex items-center gap-3">
                      <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: GRADE_COLORS[d.grade] }} />
                      <span className="text-sm text-ink-600 dark:text-ink-300 flex-1">Grade {d.grade}</span>
                      <span className="text-sm font-semibold text-ink-800 dark:text-white">{d.count.toLocaleString()}</span>
                      <span className="text-xs text-ink-400 w-14 text-right">{d.percentage}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </ChartCard>
          </div>

          {/* Export */}
          <div className="flex justify-end">
            <ExportBtn onClick={() =>
              exportCSV(
                grades.distribution.map((d: any) => ({ Grade: d.grade, Count: d.count, Percentage: d.percentage })),
                'grade-distribution.csv'
              )
            } />
          </div>
        </>
      )}
    </div>
  )
}

/* ═════════════════════════════════════════════════════════════════════════════
 * Pass / Fail Tab
 * ═════════════════════════════════════════════════════════════════════════════ */
function PassFailTab({ passFailQ, passFail, pfGroup, setPfGroup }: any) {
  const [search, setSearch] = useState('')

  const rawRows: Record<string, unknown>[] = (passFail?.rows ?? []).map((r: any) => ({ ...r }))
  const { sorted, col, dir, toggle } = useSortable(rawRows)

  const filtered = sorted.filter((r: any) =>
    (r.label ?? r.name ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const bestIdx  = filtered.length ? filtered.reduce((bi, r, i, a) => (r as any).pass_rate > (a[bi] as any).pass_rate ? i : bi, 0) : -1
  const worstIdx = filtered.length ? filtered.reduce((wi, r, i, a) => (r as any).pass_rate < (a[wi] as any).pass_rate ? i : wi, 0) : -1

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-ink-500">Group by:</span>
        {(['department', 'module'] as const).map(g => (
          <button
            key={g}
            onClick={() => setPfGroup(g)}
            className={[
              'px-3 py-1 rounded-lg text-sm font-medium border transition-colors',
              pfGroup === g
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'border-ink-200 dark:border-ink-600 text-ink-600 dark:text-ink-300 hover:border-indigo-400',
            ].join(' ')}
          >
            {g.charAt(0).toUpperCase() + g.slice(1)}
          </button>
        ))}
      </div>

      {passFailQ.isLoading ? <LoadingPlaceholder /> :
       passFailQ.isError   ? <ErrorPlaceholder /> : passFail && (
        <>
          <ChartCard>
            <SectionTitle
              title={`Pass / Fail by ${pfGroup === 'department' ? 'Department' : 'Module'}`}
              sub="Pass threshold: 50%"
            />
            <ResponsiveContainer width="100%" height={Math.max(250, passFail.rows.length * 40)}>
              <BarChart
                data={passFail.rows.map((r: any) => ({ name: r.label, Passed: r.passed, Failed: r.failed }))}
                layout="vertical"
                margin={{ top: 0, right: 16, bottom: 0, left: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.12} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="Passed" stackId="a" fill="#22c55e" />
                <Bar dataKey="Failed" stackId="a" fill="#ef4444" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Interactive table */}
          <ChartCard>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <SectionTitle title="Detailed Table" />
              <div className="flex items-center gap-2">
                <SearchInput value={search} onChange={setSearch} placeholder={`Search ${pfGroup}…`} />
                <ExportBtn onClick={() =>
                  exportCSV(
                    filtered.map((r: any) => ({
                      [pfGroup === 'department' ? 'Department' : 'Code']: r.label,
                      Name: r.name,
                      Total: r.total,
                      Passed: r.passed,
                      Failed: r.failed,
                      PassRate: pct(r.pass_rate),
                      AvgScore: pct(r.avg_pct),
                    })),
                    `pass-fail-by-${pfGroup}.csv`
                  )
                } />
              </div>
            </div>

            {filtered.length === 0 ? (
              <EmptyState message="No results match your search." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink-100 dark:border-ink-700">
                      <Th label={pfGroup === 'department' ? 'Department' : 'Module'} sortKey="label" col={col} dir={dir} onSort={toggle} />
                      <Th label="Total"     sortKey="total"     col={col} dir={dir} onSort={toggle} right />
                      <Th label="Passed"    sortKey="passed"    col={col} dir={dir} onSort={toggle} right />
                      <Th label="Failed"    sortKey="failed"    col={col} dir={dir} onSort={toggle} right />
                      <Th label="Pass Rate" sortKey="pass_rate" col={col} dir={dir} onSort={toggle} right />
                      <Th label="Avg Score" sortKey="avg_pct"   col={col} dir={dir} onSort={toggle} right />
                      <Th label="Status"    col={null}          dir={null} right />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r: any, i: number) => {
                      const isBest  = i === bestIdx
                      const isWorst = i === worstIdx && filtered.length > 1
                      return (
                        <tr
                          key={i}
                          className={[
                            'border-b border-ink-50 dark:border-ink-800 hover:bg-ink-50 dark:hover:bg-ink-900/30 transition-colors',
                            isBest  ? 'bg-green-50/50 dark:bg-green-900/10' : '',
                            isWorst ? 'bg-red-50/50 dark:bg-red-900/10' : '',
                          ].join(' ')}
                        >
                          <td className="py-2 px-3 text-ink-700 dark:text-ink-200 font-medium">
                            <span className="flex items-center gap-1.5">
                              {isBest  && <Star className="w-3 h-3 text-green-500" />}
                              {isWorst && <AlertTriangle className="w-3 h-3 text-red-400" />}
                              {pfGroup === 'module' ? (
                                <span>
                                  <span className="text-xs font-mono text-ink-400 mr-1">{r.label}</span>
                                  {r.name}
                                </span>
                              ) : r.label}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right text-ink-500">{r.total.toLocaleString()}</td>
                          <td className="py-2 px-3 text-right text-green-600 dark:text-green-400 font-semibold">{r.passed.toLocaleString()}</td>
                          <td className="py-2 px-3 text-right text-red-500 dark:text-red-400 font-semibold">{r.failed.toLocaleString()}</td>
                          <td className="py-2 px-3"><RateBar value={r.pass_rate} /></td>
                          <td className="py-2 px-3 text-right text-ink-500 font-mono text-xs">{pct(r.avg_pct)}</td>
                          <td className="py-2 px-3 text-right"><StatusBadge rate={r.pass_rate} /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <p className="text-xs text-ink-400 mt-2 px-1">
                  Showing {filtered.length} of {passFail.rows.length} rows
                  {filtered.length < passFail.rows.length ? ` · ${passFail.rows.length - filtered.length} hidden by search` : ''}
                  {filtered.length > 1 && (
                    <> · <Star className="w-3 h-3 text-green-500 inline" /> Best &nbsp;
                       <AlertTriangle className="w-3 h-3 text-red-400 inline" /> Worst</>
                  )}
                </p>
              </div>
            )}
          </ChartCard>
        </>
      )}
    </div>
  )
}

/* ═════════════════════════════════════════════════════════════════════════════
 * Enrollment Trends Tab
 * ═════════════════════════════════════════════════════════════════════════════ */
function EnrollmentTab({ enrollQ, enroll }: any) {
  const [search, setSearch] = useState('')

  const tableRows: Record<string, unknown>[] = enroll
    ? [...enroll.trends].reverse().map((r: any) => ({ ...r }))
    : []
  const { sorted, col, dir, toggle } = useSortable(tableRows)
  const filtered = sorted.filter((r: any) =>
    String(r.year_label ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {enrollQ.isLoading ? <LoadingPlaceholder /> :
       enrollQ.isError   ? <ErrorPlaceholder /> : enroll && (
        <>
          <ChartCard>
            <SectionTitle title="Student Enrollment by Academic Year" sub="Total registered students per intake year" />
            <ResponsiveContainer width="100%" height={270}>
              <LineChart data={enroll.trends} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                <XAxis dataKey="year_label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line type="monotone" dataKey="total"  name="Total"  stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="male"   name="Male"   stroke="#3b82f6" strokeWidth={1.5} dot={{ r: 3 }} strokeDasharray="4 2" />
                <Line type="monotone" dataKey="female" name="Female" stroke="#ec4899" strokeWidth={1.5} dot={{ r: 3 }} strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard>
              <SectionTitle title="By Study Level (all years)" />
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={enroll.trends} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.12} />
                  <XAxis dataKey="year_label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar dataKey="undergraduate" name="Undergraduate" fill="#6366f1" stackId="a" />
                  <Bar dataKey="postgraduate"  name="Postgraduate"  fill="#22c55e" stackId="a" />
                  <Bar dataKey="masters"       name="Masters"       fill="#f97316" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard>
              <SectionTitle
                title={`Top Programs${enroll.latest_year ? ` — ${enroll.latest_year}` : ''}`}
                sub="Top 10 programs by enrollment"
              />
              {enroll.by_program.length === 0 ? (
                <EmptyState message="No program data available for the latest year." />
              ) : (
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <ResponsiveContainer width={180} height={180}>
                    <PieChart>
                      <Pie data={enroll.by_program} dataKey="count" nameKey="program_name" cx="50%" cy="50%" innerRadius={50} outerRadius={80}>
                        {enroll.by_program.map((_: any, i: number) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 flex-1 text-xs">
                    {enroll.by_program.map((p: any, i: number) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="text-ink-600 dark:text-ink-300 flex-1 truncate">{p.program_name}</span>
                        <span className="font-semibold text-ink-800 dark:text-white">{p.count.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </ChartCard>
          </div>

          {/* Sortable + searchable table */}
          <ChartCard>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <SectionTitle title="Enrollment Data Table" />
              <div className="flex items-center gap-2">
                <SearchInput value={search} onChange={setSearch} placeholder="Search year…" />
                <ExportBtn onClick={() =>
                  exportCSV(
                    filtered.map((r: any) => ({
                      Year: r.year_label, Total: r.total, Male: r.male, Female: r.female,
                      Undergraduate: r.undergraduate, Postgraduate: r.postgraduate, Masters: r.masters,
                    })),
                    'enrollment-trends.csv'
                  )
                } />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100 dark:border-ink-700">
                    <Th label="Year"          sortKey="year_label"    col={col} dir={dir} onSort={toggle} />
                    <Th label="Total"         sortKey="total"         col={col} dir={dir} onSort={toggle} right />
                    <Th label="Male"          sortKey="male"          col={col} dir={dir} onSort={toggle} right />
                    <Th label="Female"        sortKey="female"        col={col} dir={dir} onSort={toggle} right />
                    <Th label="Undergraduate" sortKey="undergraduate" col={col} dir={dir} onSort={toggle} right />
                    <Th label="Postgraduate"  sortKey="postgraduate"  col={col} dir={dir} onSort={toggle} right />
                    <Th label="Masters"       sortKey="masters"       col={col} dir={dir} onSort={toggle} right />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r: any, i: number) => (
                    <tr key={i} className="border-b border-ink-50 dark:border-ink-800 hover:bg-ink-50 dark:hover:bg-ink-900/30 transition-colors">
                      <td className="py-2 px-3 font-medium text-ink-700 dark:text-ink-200">{r.year_label}</td>
                      <td className="py-2 px-3 text-right font-semibold text-indigo-600 dark:text-indigo-400">{r.total.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right text-blue-600 dark:text-blue-400">{r.male.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right text-pink-500 dark:text-pink-400">{r.female.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right text-ink-500">{r.undergraduate.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right text-ink-500">{r.postgraduate.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right text-ink-500">{r.masters.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && <EmptyState message="No results match your search." />}
            </div>
          </ChartCard>
        </>
      )}
    </div>
  )
}

/* ═════════════════════════════════════════════════════════════════════════════
 * Department Performance Tab
 * ═════════════════════════════════════════════════════════════════════════════ */
function DepartmentsTab({ deptQ, deptPerf }: any) {
  const [search, setSearch] = useState('')

  const rawRows: Record<string, unknown>[] = (deptPerf?.rows ?? []).map((r: any) => ({ ...r }))
  const { sorted, col, dir, toggle } = useSortable(rawRows)
  const filtered = sorted.filter((r: any) =>
    (r.department ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const bestIdx  = filtered.length ? filtered.reduce((bi, r, i, a) => (r as any).avg_percentage > (a[bi] as any).avg_percentage ? i : bi, 0) : -1
  const worstIdx = filtered.length ? filtered.reduce((wi, r, i, a) => (r as any).avg_percentage < (a[wi] as any).avg_percentage ? i : wi, 0) : -1

  return (
    <div className="space-y-6">
      {deptQ.isLoading ? <LoadingPlaceholder /> :
       deptQ.isError   ? <ErrorPlaceholder /> : deptPerf && (
        <>
          <ChartCard>
            <SectionTitle title="Average Score by Department" sub="Higher is better — click columns to sort" />
            <ResponsiveContainer width="100%" height={Math.max(250, deptPerf.rows.length * 45)}>
              <BarChart
                data={deptPerf.rows.map((r: any) => ({ name: r.department, 'Avg Score': r.avg_percentage, 'Pass Rate': r.pass_rate }))}
                layout="vertical"
                margin={{ top: 0, right: 24, bottom: 0, left: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.12} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="Avg Score" fill="#6366f1" radius={[0,4,4,0]} />
                <Bar dataKey="Pass Rate" fill="#22c55e" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <SectionTitle title="Department Performance Table" />
              <div className="flex items-center gap-2">
                <SearchInput value={search} onChange={setSearch} placeholder="Search department…" />
                <ExportBtn onClick={() =>
                  exportCSV(
                    filtered.map((r: any) => ({
                      Department: r.department,
                      Modules: r.modules_assessed,
                      Students: r.students_assessed,
                      Records: r.total_records,
                      AvgScore: pct(r.avg_percentage),
                      PassRate: pct(r.pass_rate),
                      Min: pct(r.min_percentage),
                      Max: pct(r.max_percentage),
                    })),
                    'department-performance.csv'
                  )
                } />
              </div>
            </div>

            {filtered.length === 0 ? (
              <EmptyState message="No departments match your search." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink-100 dark:border-ink-700">
                      <Th label="Department"  sortKey="department"       col={col} dir={dir} onSort={toggle} />
                      <Th label="Modules"     sortKey="modules_assessed" col={col} dir={dir} onSort={toggle} right />
                      <Th label="Students"    sortKey="students_assessed" col={col} dir={dir} onSort={toggle} right />
                      <Th label="Avg Score"   sortKey="avg_percentage"   col={col} dir={dir} onSort={toggle} right />
                      <Th label="Pass Rate"   sortKey="pass_rate"        col={col} dir={dir} onSort={toggle} right />
                      <Th label="Min / Max"   col={null} dir={null} right />
                      <Th label="Status"      col={null} dir={null} right />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r: any, i: number) => {
                      const isBest  = i === bestIdx
                      const isWorst = i === worstIdx && filtered.length > 1
                      return (
                        <tr
                          key={i}
                          className={[
                            'border-b border-ink-50 dark:border-ink-800 hover:bg-ink-50 dark:hover:bg-ink-900/30 transition-colors',
                            isBest  ? 'bg-green-50/50 dark:bg-green-900/10' : '',
                            isWorst ? 'bg-red-50/50 dark:bg-red-900/10' : '',
                          ].join(' ')}
                        >
                          <td className="py-2 px-3 text-ink-700 dark:text-ink-200 font-medium max-w-[200px]">
                            <span className="flex items-center gap-1.5 truncate">
                              {isBest  && <Star className="w-3 h-3 text-green-500 shrink-0" />}
                              {isWorst && <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />}
                              {r.department}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right text-ink-500">{r.modules_assessed}</td>
                          <td className="py-2 px-3 text-right text-ink-500">{r.students_assessed.toLocaleString()}</td>
                          <td className="py-2 px-3"><RateBar value={r.avg_percentage} /></td>
                          <td className="py-2 px-3"><RateBar value={r.pass_rate} /></td>
                          <td className="py-2 px-3 text-right text-xs text-ink-400 font-mono">
                            {pct(r.min_percentage)} / {pct(r.max_percentage)}
                          </td>
                          <td className="py-2 px-3 text-right"><StatusBadge rate={r.pass_rate} /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <p className="text-xs text-ink-400 mt-2 px-1">
                  {filtered.length} of {deptPerf.rows.length} departments shown
                </p>
              </div>
            )}
          </ChartCard>
        </>
      )}
    </div>
  )
}

/* ═════════════════════════════════════════════════════════════════════════════
 * Attendance Compliance Tab
 * ═════════════════════════════════════════════════════════════════════════════ */
function AttendanceTab({ attQ, att }: any) {
  const [search, setSearch] = useState('')

  const rawRows: Record<string, unknown>[] = (att?.rows ?? []).map((r: any) => ({ ...r }))
  const { sorted, col, dir, toggle } = useSortable(rawRows)
  const filtered = sorted.filter((r: any) =>
    (r.program ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const bestIdx  = filtered.length ? filtered.reduce((bi, r, i, a) => (r as any).attendance_rate > (a[bi] as any).attendance_rate ? i : bi, 0) : -1
  const worstIdx = filtered.length ? filtered.reduce((wi, r, i, a) => (r as any).attendance_rate < (a[wi] as any).attendance_rate ? i : wi, 0) : -1

  return (
    <div className="space-y-6">
      {attQ.isLoading ? <LoadingPlaceholder /> :
       attQ.isError   ? <ErrorPlaceholder /> : att && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <KpiCard
              label="Overall Attendance"
              value={pct(att.overall.attendance_rate)}
              sub={`${att.overall.total.toLocaleString()} total records`}
              icon={<ClipboardCheck className="w-5 h-5" />}
              accent={att.overall.attendance_rate >= 80 ? 'green' : 'yellow'}
            />
            <KpiCard
              label="Present"
              value={att.overall.present.toLocaleString()}
              icon={<CheckCircle className="w-5 h-5" />}
              accent="green"
            />
            <KpiCard
              label="Absent"
              value={att.overall.absent.toLocaleString()}
              icon={<XCircle className="w-5 h-5" />}
              accent="red"
            />
            <KpiCard
              label="Programs Tracked"
              value={att.rows.length}
              icon={<GraduationCap className="w-5 h-5" />}
              accent="indigo"
            />
          </div>

          {att.overall.attendance_rate < 60 && (
            <div className="flex items-center gap-2 text-sm text-yellow-700 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg px-4 py-3 border border-yellow-200 dark:border-yellow-700">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Overall attendance is below 60% — targeted follow-up with low-attendance programs is recommended.
            </div>
          )}

          {att.rows.length > 0 && (
            <ChartCard>
              <SectionTitle title="Attendance Rate by Program" sub="Present / Total sessions" />
              <ResponsiveContainer width="100%" height={Math.max(250, att.rows.length * 40)}>
                <BarChart
                  data={att.rows.map((r: any) => ({ name: r.program, 'Attendance Rate': r.attendance_rate }))}
                  layout="vertical"
                  margin={{ top: 0, right: 24, bottom: 0, left: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.12} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="Attendance Rate" radius={[0,4,4,0]}>
                    {att.rows.map((r: any, i: number) => (
                      <Cell
                        key={i}
                        fill={r.attendance_rate >= 80 ? '#22c55e' : r.attendance_rate >= 60 ? '#eab308' : '#ef4444'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          <ChartCard>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <SectionTitle title="Attendance by Program — Detail" />
              <div className="flex items-center gap-2">
                <SearchInput value={search} onChange={setSearch} placeholder="Search program…" />
                <ExportBtn onClick={() =>
                  exportCSV(
                    filtered.map((r: any) => ({
                      Program: r.program,
                      Modules: r.modules_tracked,
                      Total: r.total_records,
                      Present: r.present,
                      Absent: r.absent,
                      Late: r.late,
                      Excused: r.excused,
                      AttendanceRate: pct(r.attendance_rate),
                    })),
                    'attendance-compliance.csv'
                  )
                } />
              </div>
            </div>

            {filtered.length === 0 ? (
              <EmptyState message="No programs match your search." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink-100 dark:border-ink-700">
                      <Th label="Program"  sortKey="program"         col={col} dir={dir} onSort={toggle} />
                      <Th label="Modules"  sortKey="modules_tracked" col={col} dir={dir} onSort={toggle} right />
                      <Th label="Total"    sortKey="total_records"   col={col} dir={dir} onSort={toggle} right />
                      <Th label="Present"  sortKey="present"         col={col} dir={dir} onSort={toggle} right />
                      <Th label="Absent"   sortKey="absent"          col={col} dir={dir} onSort={toggle} right />
                      <Th label="Late"     sortKey="late"            col={col} dir={dir} onSort={toggle} right />
                      <Th label="Excused"  sortKey="excused"         col={col} dir={dir} onSort={toggle} right />
                      <Th label="Rate"     sortKey="attendance_rate" col={col} dir={dir} onSort={toggle} right />
                      <Th label="Status"   col={null} dir={null} right />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r: any, i: number) => {
                      const isBest  = i === bestIdx
                      const isWorst = i === worstIdx && filtered.length > 1
                      return (
                        <tr
                          key={i}
                          className={[
                            'border-b border-ink-50 dark:border-ink-800 hover:bg-ink-50 dark:hover:bg-ink-900/30 transition-colors',
                            isBest  ? 'bg-green-50/50 dark:bg-green-900/10' : '',
                            isWorst ? 'bg-red-50/50 dark:bg-red-900/10' : '',
                          ].join(' ')}
                        >
                          <td className="py-2 px-3 text-ink-700 dark:text-ink-200 font-medium max-w-[200px]">
                            <span className="flex items-center gap-1.5 truncate">
                              {isBest  && <Star className="w-3 h-3 text-green-500 shrink-0" />}
                              {isWorst && <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />}
                              {r.program}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right text-ink-400">{r.modules_tracked}</td>
                          <td className="py-2 px-3 text-right text-ink-500">{r.total_records.toLocaleString()}</td>
                          <td className="py-2 px-3 text-right text-green-600 dark:text-green-400 font-semibold">{r.present.toLocaleString()}</td>
                          <td className="py-2 px-3 text-right text-red-500 dark:text-red-400">{r.absent.toLocaleString()}</td>
                          <td className="py-2 px-3 text-right text-yellow-600 dark:text-yellow-400">{r.late.toLocaleString()}</td>
                          <td className="py-2 px-3 text-right text-ink-400">{r.excused.toLocaleString()}</td>
                          <td className="py-2 px-3"><AttBar value={r.attendance_rate} /></td>
                          <td className="py-2 px-3 text-right"><StatusBadge rate={r.attendance_rate} thresholds={[80, 60]} /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <p className="text-xs text-ink-400 mt-2 px-1">
                  {filtered.length} of {att.rows.length} programs shown
                </p>
              </div>
            )}
          </ChartCard>
        </>
      )}
    </div>
  )
}
