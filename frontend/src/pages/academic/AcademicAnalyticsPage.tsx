import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell,
} from 'recharts'
import {
  TrendingUp, Users, BookOpen, CheckCircle, XCircle,
  GraduationCap, BarChart2, ClipboardCheck, Activity, Loader2,
  AlertCircle,
} from 'lucide-react'
import { useQuery as useQ } from '@tanstack/react-query'
import { academicAnalyticsService } from '@/services/academicAnalyticsService'
import { academicService } from '@/services/academicService'

/* ─── Palette ────────────────────────────────────────────────────── */
const GRADE_COLORS: Record<string, string> = {
  A: '#22c55e',
  B: '#6366f1',
  C: '#eab308',
  D: '#f97316',
  E: '#ef4444',
}
const PIE_COLORS = ['#6366f1','#22c55e','#3b82f6','#f97316','#8b5cf6','#14b8a6','#ec4899','#eab308']

/* ─── Tiny helpers ───────────────────────────────────────────────── */
function pct(v: number) { return `${v.toFixed(1)}%` }

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
    <div className="flex items-center justify-center h-32 gap-2 text-red-500">
      <AlertCircle className="w-5 h-5" />
      <span className="text-sm">{message ?? 'Failed to load data'}</span>
    </div>
  )
}

/* ─── Custom tooltip ─────────────────────────────────────────────── */
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

/* ─── Tab types ──────────────────────────────────────────────────── */
type Tab = 'overview' | 'grades' | 'passfail' | 'enrollment' | 'departments' | 'attendance'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview',     label: 'Overview',         icon: <Activity className="w-4 h-4" /> },
  { id: 'grades',       label: 'Grade Distribution', icon: <BarChart2 className="w-4 h-4" /> },
  { id: 'passfail',     label: 'Pass / Fail Rates',  icon: <CheckCircle className="w-4 h-4" /> },
  { id: 'enrollment',   label: 'Enrollment Trends',  icon: <TrendingUp className="w-4 h-4" /> },
  { id: 'departments',  label: 'Dept. Performance',  icon: <BookOpen className="w-4 h-4" /> },
  { id: 'attendance',   label: 'Attendance',          icon: <ClipboardCheck className="w-4 h-4" /> },
]

/* ═══════════════════════════════════════════════════════════════════
 * Main Page
 * ═══════════════════════════════════════════════════════════════════ */
export default function AcademicAnalyticsPage() {
  const [tab,      setTab]      = useState<Tab>('overview')
  const [yearId,   setYearId]   = useState<string>('')
  const [pfGroup,  setPfGroup]  = useState<'department' | 'module'>('department')

  /* years */
  const yearsQ = useQ({ queryKey: ['academic-years'], queryFn: () => academicService.listYears() })
  const years  = yearsQ.data?.data ?? []

  const yParam = yearId ? { academic_year_id: Number(yearId) } : {}

  /* ── Queries (all tabs prefetched lazily on mount) ───────────── */
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

  const overview  = overviewQ.data?.data
  const grades    = gradesQ.data?.data
  const passFail  = passFailQ.data?.data
  const enroll    = enrollQ.data?.data
  const deptPerf  = deptQ.data?.data
  const att       = attQ.data?.data

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* ── Header ─────────────────────────────────────────────── */}
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

        {/* Year filter */}
        <select
          value={yearId}
          onChange={(e) => setYearId(e.target.value)}
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

      {/* ── Tabs ────────────────────────────────────────────────── */}
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

      {/* ════════════════════════════════════════════════════════
       * TAB: Overview
       * ════════════════════════════════════════════════════════ */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {overviewQ.isLoading ? <LoadingPlaceholder /> :
           overviewQ.isError   ? <ErrorPlaceholder /> : overview && (
            <>
              {/* KPI cards */}
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
                  sub={`${overview.passed} passed / ${overview.failed} failed`}
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
                  sub={`${overview.assessed_students} students assessed`}
                  icon={<BookOpen className="w-5 h-5" />}
                  accent="indigo"
                />
              </div>

              {/* Mini grade distribution */}
              {grades && (
                <ChartCard>
                  <SectionTitle title="Grade Distribution" sub="Count of marks per grade (A–E)" />
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={grades.distribution} margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                      <XAxis dataKey="grade" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="count" name="Students" radius={[4,4,0,0]}>
                        {grades.distribution.map((d) => (
                          <Cell key={d.grade} fill={GRADE_COLORS[d.grade] ?? '#6366f1'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-3 mt-3">
                    {grades.distribution.map(d => (
                      <span key={d.grade} className="flex items-center gap-1.5 text-xs text-ink-500">
                        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: GRADE_COLORS[d.grade] }} />
                        Grade {d.grade}: <strong>{d.count}</strong> ({d.percentage}%)
                      </span>
                    ))}
                  </div>
                </ChartCard>
              )}

              {/* Pass/fail summary bar */}
              <ChartCard>
                <SectionTitle title="Pass vs. Fail Summary" />
                <div className="flex items-center gap-4">
                  <div className="flex-1 bg-ink-100 dark:bg-ink-700 rounded-full h-6 overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all duration-700"
                      style={{ width: `${overview.pass_rate}%` }}
                    />
                  </div>
                  <div className="flex gap-6 text-sm shrink-0">
                    <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400 font-semibold">
                      <CheckCircle className="w-4 h-4" /> {overview.pass_rate}% pass
                    </span>
                    <span className="flex items-center gap-1.5 text-red-500 dark:text-red-400 font-semibold">
                      <XCircle className="w-4 h-4" /> {(100 - overview.pass_rate).toFixed(1)}% fail
                    </span>
                  </div>
                </div>
              </ChartCard>
            </>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
       * TAB: Grade Distribution
       * ════════════════════════════════════════════════════════ */}
      {tab === 'grades' && (
        <div className="space-y-6">
          {gradesQ.isLoading ? <LoadingPlaceholder /> :
           gradesQ.isError   ? <ErrorPlaceholder /> : grades && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                {grades.distribution.map(d => (
                  <div
                    key={d.grade}
                    className="rounded-xl border p-4 text-center"
                    style={{ borderColor: GRADE_COLORS[d.grade] + '40', background: GRADE_COLORS[d.grade] + '10' }}
                  >
                    <p className="text-3xl font-bold" style={{ color: GRADE_COLORS[d.grade] }}>{d.grade}</p>
                    <p className="text-xl font-semibold text-ink-800 dark:text-white mt-1">{d.count}</p>
                    <p className="text-xs text-ink-400 mt-0.5">{d.percentage}% of total</p>
                  </div>
                ))}
              </div>

              <ChartCard>
                <SectionTitle title="Grade Distribution Chart" sub={`Total: ${grades.total} assessed records`} />
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={grades.distribution} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                    <XAxis dataKey="grade" tick={{ fontSize: 13, fontWeight: 600 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" name="Students" radius={[6,6,0,0]}>
                      {grades.distribution.map(d => (
                        <Cell key={d.grade} fill={GRADE_COLORS[d.grade] ?? '#6366f1'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              {/* Donut */}
              <ChartCard>
                <SectionTitle title="Grade Share" />
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <ResponsiveContainer width={220} height={220}>
                    <PieChart>
                      <Pie
                        data={grades.distribution.filter(d => d.count > 0)}
                        dataKey="count"
                        nameKey="grade"
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                      >
                        {grades.distribution.map(d => (
                          <Cell key={d.grade} fill={GRADE_COLORS[d.grade] ?? '#6366f1'} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2 flex-1">
                    {grades.distribution.map(d => (
                      <div key={d.grade} className="flex items-center gap-3">
                        <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: GRADE_COLORS[d.grade] }} />
                        <span className="text-sm text-ink-600 dark:text-ink-300 flex-1">Grade {d.grade}</span>
                        <span className="text-sm font-semibold text-ink-800 dark:text-white">{d.count}</span>
                        <span className="text-xs text-ink-400 w-14 text-right">{d.percentage}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </ChartCard>
            </>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
       * TAB: Pass / Fail Rates
       * ════════════════════════════════════════════════════════ */}
      {tab === 'passfail' && (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
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
                    data={passFail.rows.map(r => ({ name: r.label, Passed: r.passed, Failed: r.failed }))}
                    layout="vertical"
                    margin={{ top: 0, right: 16, bottom: 0, left: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.12} />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="Passed" stackId="a" fill="#22c55e" radius={[0,0,0,0]} />
                    <Bar dataKey="Failed" stackId="a" fill="#ef4444" radius={[0,4,4,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard>
                <SectionTitle title="Detailed Table" />
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-ink-100 dark:border-ink-700">
                        <th className="text-left py-2 px-3 text-ink-500 font-medium">
                          {pfGroup === 'department' ? 'Department' : 'Module'}
                        </th>
                        <th className="text-right py-2 px-3 text-ink-500 font-medium">Total</th>
                        <th className="text-right py-2 px-3 text-ink-500 font-medium">Passed</th>
                        <th className="text-right py-2 px-3 text-ink-500 font-medium">Failed</th>
                        <th className="text-right py-2 px-3 text-ink-500 font-medium">Pass Rate</th>
                        <th className="text-right py-2 px-3 text-ink-500 font-medium">Avg Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {passFail.rows.map((r, i) => (
                        <tr
                          key={i}
                          className="border-b border-ink-50 dark:border-ink-800 hover:bg-ink-50 dark:hover:bg-ink-900/30"
                        >
                          <td className="py-2 px-3 text-ink-700 dark:text-ink-200 font-medium">
                            {pfGroup === 'module' ? (
                              <span>
                                <span className="text-xs font-mono text-ink-400 mr-1">{r.label}</span>
                                {r.name}
                              </span>
                            ) : r.label}
                          </td>
                          <td className="py-2 px-3 text-right text-ink-600 dark:text-ink-300">{r.total}</td>
                          <td className="py-2 px-3 text-right text-green-600 dark:text-green-400 font-semibold">{r.passed}</td>
                          <td className="py-2 px-3 text-right text-red-500 dark:text-red-400 font-semibold">{r.failed}</td>
                          <td className="py-2 px-3 text-right">
                            <span className={[
                              'font-semibold',
                              r.pass_rate >= 70 ? 'text-green-600 dark:text-green-400' :
                              r.pass_rate >= 50 ? 'text-yellow-600 dark:text-yellow-400' :
                              'text-red-500 dark:text-red-400',
                            ].join(' ')}>
                              {pct(r.pass_rate)}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right text-ink-600 dark:text-ink-300">
                            {pct(r.avg_pct)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ChartCard>
            </>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
       * TAB: Enrollment Trends
       * ════════════════════════════════════════════════════════ */}
      {tab === 'enrollment' && (
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
                    <Line type="monotone" dataKey="total" name="Total" stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="male" name="Male" stroke="#3b82f6" strokeWidth={1.5} dot={{ r: 3 }} strokeDasharray="4 2" />
                    <Line type="monotone" dataKey="female" name="Female" stroke="#ec4899" strokeWidth={1.5} dot={{ r: 3 }} strokeDasharray="4 2" />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Category breakdown */}
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

                {/* Program donut — latest year */}
                <ChartCard>
                  <SectionTitle
                    title={`Top Programs${enroll.latest_year ? ` — ${enroll.latest_year}` : ''}`}
                    sub="Top 10 programs by enrollment"
                  />
                  {enroll.by_program.length === 0 ? (
                    <p className="text-sm text-ink-400 text-center py-8">No program data available</p>
                  ) : (
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                      <ResponsiveContainer width={180} height={180}>
                        <PieChart>
                          <Pie data={enroll.by_program} dataKey="count" nameKey="program_name" cx="50%" cy="50%" innerRadius={50} outerRadius={80}>
                            {enroll.by_program.map((_, i) => (
                              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip content={<CustomTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-1.5 flex-1 text-xs">
                        {enroll.by_program.map((p, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                            <span className="text-ink-600 dark:text-ink-300 flex-1 truncate">{p.program_name}</span>
                            <span className="font-semibold text-ink-800 dark:text-white">{p.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </ChartCard>
              </div>

              {/* Table */}
              <ChartCard>
                <SectionTitle title="Enrollment Data Table" />
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-ink-100 dark:border-ink-700">
                        {['Year', 'Total', 'Male', 'Female', 'Undergraduate', 'Postgraduate', 'Masters'].map(h => (
                          <th key={h} className="text-right first:text-left py-2 px-3 text-ink-500 font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...enroll.trends].reverse().map((r, i) => (
                        <tr key={i} className="border-b border-ink-50 dark:border-ink-800 hover:bg-ink-50 dark:hover:bg-ink-900/30">
                          <td className="py-2 px-3 font-medium text-ink-700 dark:text-ink-200">{r.year_label}</td>
                          <td className="py-2 px-3 text-right font-semibold text-indigo-600 dark:text-indigo-400">{r.total}</td>
                          <td className="py-2 px-3 text-right text-blue-600 dark:text-blue-400">{r.male}</td>
                          <td className="py-2 px-3 text-right text-pink-500 dark:text-pink-400">{r.female}</td>
                          <td className="py-2 px-3 text-right text-ink-500">{r.undergraduate}</td>
                          <td className="py-2 px-3 text-right text-ink-500">{r.postgraduate}</td>
                          <td className="py-2 px-3 text-right text-ink-500">{r.masters}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ChartCard>
            </>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
       * TAB: Department Performance
       * ════════════════════════════════════════════════════════ */}
      {tab === 'departments' && (
        <div className="space-y-6">
          {deptQ.isLoading ? <LoadingPlaceholder /> :
           deptQ.isError   ? <ErrorPlaceholder /> : deptPerf && (
            <>
              <ChartCard>
                <SectionTitle title="Average Score by Department" sub="Higher is better" />
                <ResponsiveContainer width="100%" height={Math.max(250, deptPerf.rows.length * 45)}>
                  <BarChart
                    data={deptPerf.rows.map(r => ({ name: r.department, 'Avg Score': r.avg_percentage, 'Pass Rate': r.pass_rate }))}
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
                <SectionTitle title="Department Performance Table" />
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-ink-100 dark:border-ink-700">
                        {['Department', 'Modules', 'Students', 'Records', 'Avg Score', 'Pass Rate', 'Min', 'Max'].map(h => (
                          <th key={h} className="text-right first:text-left py-2 px-3 text-ink-500 font-medium text-xs">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {deptPerf.rows.map((r, i) => (
                        <tr key={i} className="border-b border-ink-50 dark:border-ink-800 hover:bg-ink-50 dark:hover:bg-ink-900/30">
                          <td className="py-2 px-3 text-ink-700 dark:text-ink-200 font-medium max-w-[160px] truncate">{r.department}</td>
                          <td className="py-2 px-3 text-right text-ink-500">{r.modules_assessed}</td>
                          <td className="py-2 px-3 text-right text-ink-500">{r.students_assessed}</td>
                          <td className="py-2 px-3 text-right text-ink-500">{r.total_records}</td>
                          <td className="py-2 px-3 text-right font-semibold text-indigo-600 dark:text-indigo-400">{pct(r.avg_percentage)}</td>
                          <td className="py-2 px-3 text-right">
                            <span className={[
                              'font-semibold',
                              r.pass_rate >= 70 ? 'text-green-600 dark:text-green-400' :
                              r.pass_rate >= 50 ? 'text-yellow-600 dark:text-yellow-400' :
                              'text-red-500 dark:text-red-400',
                            ].join(' ')}>
                              {pct(r.pass_rate)}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right text-ink-400">{pct(r.min_percentage)}</td>
                          <td className="py-2 px-3 text-right text-ink-400">{pct(r.max_percentage)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ChartCard>
            </>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
       * TAB: Attendance Compliance
       * ════════════════════════════════════════════════════════ */}
      {tab === 'attendance' && (
        <div className="space-y-6">
          {attQ.isLoading ? <LoadingPlaceholder /> :
           attQ.isError   ? <ErrorPlaceholder /> : att && (
            <>
              {/* Overall */}
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

              {/* Chart */}
              {att.rows.length > 0 && (
                <ChartCard>
                  <SectionTitle title="Attendance Rate by Program" sub="Present / Total sessions" />
                  <ResponsiveContainer width="100%" height={Math.max(250, att.rows.length * 40)}>
                    <BarChart
                      data={att.rows.map(r => ({ name: r.program, 'Attendance Rate': r.attendance_rate }))}
                      layout="vertical"
                      margin={{ top: 0, right: 24, bottom: 0, left: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.12} />
                      <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 11 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="Attendance Rate" fill="#22c55e" radius={[0,4,4,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}

              {/* Table */}
              <ChartCard>
                <SectionTitle title="Attendance by Program — Detail" />
                {att.rows.length === 0 ? (
                  <p className="text-sm text-ink-400 text-center py-8">No attendance records found for the selected period.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-ink-100 dark:border-ink-700">
                          {['Program', 'Modules', 'Total', 'Present', 'Absent', 'Late', 'Excused', 'Rate'].map(h => (
                            <th key={h} className="text-right first:text-left py-2 px-3 text-ink-500 font-medium text-xs">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {att.rows.map((r, i) => (
                          <tr key={i} className="border-b border-ink-50 dark:border-ink-800 hover:bg-ink-50 dark:hover:bg-ink-900/30">
                            <td className="py-2 px-3 text-ink-700 dark:text-ink-200 font-medium max-w-[180px] truncate">{r.program}</td>
                            <td className="py-2 px-3 text-right text-ink-400">{r.modules_tracked}</td>
                            <td className="py-2 px-3 text-right text-ink-500">{r.total_records}</td>
                            <td className="py-2 px-3 text-right text-green-600 dark:text-green-400 font-semibold">{r.present}</td>
                            <td className="py-2 px-3 text-right text-red-500 dark:text-red-400">{r.absent}</td>
                            <td className="py-2 px-3 text-right text-yellow-600 dark:text-yellow-400">{r.late}</td>
                            <td className="py-2 px-3 text-right text-ink-400">{r.excused}</td>
                            <td className="py-2 px-3 text-right">
                              <span className={[
                                'font-semibold',
                                r.attendance_rate >= 80 ? 'text-green-600 dark:text-green-400' :
                                r.attendance_rate >= 60 ? 'text-yellow-600 dark:text-yellow-400' :
                                'text-red-500 dark:text-red-400',
                              ].join(' ')}>
                                {pct(r.attendance_rate)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </ChartCard>
            </>
          )}
        </div>
      )}
    </div>
  )
}
