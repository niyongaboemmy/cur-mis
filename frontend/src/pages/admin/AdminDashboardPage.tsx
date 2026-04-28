import { memo, useEffect, useMemo, useState } from 'react'
import {
  GraduationCap,
  Users,
  Users2,
  Wallet,
  ChevronDown,
  MoreHorizontal,
  UserPlus,
  FileText,
  CreditCard,
  BookOpen,
  Award,
  Medal,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { api } from '@/services/api'
import StatCard   from '@/components/dashboard/StatCard'
import LineChart  from '@/components/dashboard/LineChart'
import DonutChart from '@/components/dashboard/DonutChart'

type DashboardData = {
  stats: { students: number; employees: number; applicants: number; revenue: number }
  levels: { undergraduate: number; postgraduate: number; masters: number }
  gender: { male: number; female: number; unknown: number }
  trend:  { labels: string[]; applications: number[]; registrations: number[] }
  stars:  { name: string; id: string; marks: number; percent: number; year: string | number }[]
  activity: { kind: string; title: string; detail: string; at: string | null }[]
}

const fmtCount = (n: number) => new Intl.NumberFormat('en-US').format(n)
const fmtRWF   = (n: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n) + ' RWF'

const AVATAR_TONES = [
  'bg-accent-lilac text-primary-700',
  'bg-accent-peach text-orange-700',
  'bg-accent-sky text-sky-700',
  'bg-accent-mint text-emerald-700',
  'bg-accent-sun text-amber-700',
]

const ACTIVITY_TONE: Record<string, { tone: string; icon: typeof UserPlus }> = {
  application: { tone: 'bg-sky-100 text-sky-600',         icon: UserPlus    },
  payment:     { tone: 'bg-emerald-100 text-emerald-600', icon: CreditCard  },
  default:     { tone: 'bg-red-100 text-red-500',         icon: FileText    },
}

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const t = new Date(iso.replace(' ', 'T')).getTime()
  if (isNaN(t)) return ''
  const diff = Math.max(0, Date.now() - t)
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'Just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(t).toLocaleDateString()
}

export default function AdminDashboardPage() {
  const { user } = useAuthStore()
  const firstName = user?.full_name?.split(' ')[0] ?? 'Admin'

  const [range, setRange]   = useState<'Weekly' | 'Monthly' | 'Yearly'>('Weekly')
  const [rangeOpen, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const [data, setData]       = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    api.get<DashboardData>('/api/admin/dashboard', {}, ctrl.signal)
      .then((r) => { setData(r.data ?? null); setError(null) })
      .catch((e) => { if (e?.name !== 'CanceledError') setError(e?.message ?? 'Failed to load') })
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [])

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const examSeries = useMemo(() => {
    if (!data) return []
    return [
      { name: 'Applications',  color: '#0A2A5E', data: data.trend.applications },
      { name: 'Registrations', color: '#4FB4FF', data: data.trend.registrations },
    ]
  }, [data])

  const genderSegments = useMemo(() => {
    if (!data) return []
    const segs: { label: string; value: number; color: string }[] = []
    if (data.gender.male)    segs.push({ label: 'Male',    value: data.gender.male,    color: '#0A2A5E' })
    if (data.gender.female)  segs.push({ label: 'Female',  value: data.gender.female,  color: '#F5C400' })
    if (data.gender.unknown) segs.push({ label: 'Unknown', value: data.gender.unknown, color: '#94A3B8' })
    return segs
  }, [data])

  const genderTotal = (data?.gender.male ?? 0) + (data?.gender.female ?? 0) + (data?.gender.unknown ?? 0)

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">

      {/* ── header panel ─────────────────────────────────────────── */}
      <section className="card p-6">
        <h2 className="text-[22px] font-semibold text-ink-900 dark:text-white tracking-tight">
          Admin Dashboard
        </h2>
        <p className="sr-only">Welcome back, {firstName}</p>

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard label="Active Students" value={loading ? '—' : fmtCount(data?.stats.students   ?? 0)} icon={GraduationCap} tone="lilac" />
          <StatCard label="Employees"       value={loading ? '—' : fmtCount(data?.stats.employees  ?? 0)} icon={Users}         tone="sky"   />
          <StatCard label="Applicants"      value={loading ? '—' : fmtCount(data?.stats.applicants ?? 0)} icon={Users2}        tone="peach" />
          <StatCard label="Revenue"         value={loading ? '—' : fmtRWF(data?.stats.revenue      ?? 0)} icon={Wallet}        tone="mint"  />
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="Undergraduate" value={loading ? '—' : fmtCount(data?.levels.undergraduate ?? 0)} icon={BookOpen} tone="sky"   />
          <StatCard label="Postgraduate"  value={loading ? '—' : fmtCount(data?.levels.postgraduate  ?? 0)} icon={Award}    tone="peach" />
          <StatCard label="Masters"       value={loading ? '—' : fmtCount(data?.levels.masters       ?? 0)} icon={Medal}    tone="mint"  />
        </div>

        {error && (
          <p className="mt-4 text-[12.5px] text-red-600 dark:text-red-400">
            Failed to load dashboard data: {error}
          </p>
        )}
      </section>

      {/* ── line chart + donut ────────────────────────────────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="card-pad lg:col-span-2">
          <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
            <h3 className="text-[16px] font-semibold text-ink-900 dark:text-white">
              Applications vs Registrations (last 7 days)
            </h3>
            <div className="flex items-center gap-4">
              <Legend color="#0A2A5E" label="Applications" />
              <Legend color="#4FB4FF" label="Registrations" />

              <div className="relative">
                <button
                  onClick={() => setOpen((v) => !v)}
                  className="flex items-center gap-2 border border-ink-200 dark:border-ink-700 rounded-lg px-3 py-1.5 text-[12.5px] font-medium text-ink-700 dark:text-ink-200 hover:bg-ink-50 dark:hover:bg-ink-700"
                >
                  {range} <ChevronDown className="w-3 h-3" />
                </button>
                {rangeOpen && (
                  <ul
                    onMouseLeave={() => setOpen(false)}
                    className="absolute right-0 mt-1.5 w-32 rounded-lg bg-white dark:bg-ink-800 border border-ink-100 dark:border-ink-700 shadow-card p-1 z-10"
                  >
                    {(['Weekly', 'Monthly', 'Yearly'] as const).map((r) => (
                      <li key={r}>
                        <button
                          onClick={() => { setRange(r); setOpen(false) }}
                          className={`w-full text-left text-[12.5px] px-3 py-1.5 rounded-md ${
                            range === r
                              ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-200'
                              : 'hover:bg-ink-50 dark:hover:bg-ink-700 text-ink-600 dark:text-ink-300'
                          }`}
                        >
                          {r}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
          {data && examSeries.length > 0 ? (
            <LineChart labels={data.trend.labels} series={examSeries} height={260} />
          ) : (
            <div className="h-[260px] flex items-center justify-center text-ink-400 text-[13px]">
              {loading ? 'Loading…' : 'No data'}
            </div>
          )}
        </div>

        <div className="card-pad flex flex-col">
          <div className="flex items-start justify-between mb-2">
            <h3 className="text-[16px] font-semibold text-ink-900 dark:text-white">Active Students by Gender</h3>
            <button className="icon-btn">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 flex items-center justify-center">
            {genderSegments.length > 0 ? (
              <DonutChart
                segments={genderSegments}
                centerTop="Total"
                centerBig={genderTotal.toLocaleString()}
              />
            ) : (
              <div className="text-ink-400 text-[13px]">{loading ? 'Loading…' : 'No data'}</div>
            )}
          </div>

          <div className="flex items-center justify-center gap-6 mt-4 flex-wrap">
            {genderSegments.map((s) => (
              <Legend key={s.label} color={s.color} label={`${s.label} (${s.value.toLocaleString()})`} />
            ))}
          </div>
        </div>
      </section>

      {/* ── star students + activity ──────────────────────────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="card-pad lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[16px] font-semibold text-ink-900 dark:text-white">
              Top Students
            </h3>
            <button className="icon-btn">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-[13px] text-left min-w-[620px]">
              <thead>
                <tr className="text-[11.5px] uppercase tracking-[0.06em] text-ink-500">
                  <th className="w-10 px-3 py-3"></th>
                  <th className="px-3 py-3 font-semibold">Name</th>
                  <th className="px-3 py-3 font-semibold">Reg #</th>
                  <th className="px-3 py-3 font-semibold">Total</th>
                  <th className="px-3 py-3 font-semibold">Avg %</th>
                  <th className="px-3 py-3 font-semibold">Year</th>
                </tr>
              </thead>
              <tbody>
                {(data?.stars ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-ink-400 text-[12.5px]">
                      {loading ? 'Loading…' : 'No marks recorded yet.'}
                    </td>
                  </tr>
                ) : (
                  (data?.stars ?? []).map((s, i) => {
                    const isOn = selected.has(s.id)
                    const tone = AVATAR_TONES[i % AVATAR_TONES.length]
                    return (
                      <tr
                        key={s.id || i}
                        className="border-t border-ink-100 dark:border-ink-700 hover:bg-ink-50/50 dark:hover:bg-ink-700/30 transition-colors"
                      >
                        <td className="px-3 py-3">
                          <button
                            onClick={() => toggleRow(s.id)}
                            aria-label={isOn ? 'Deselect row' : 'Select row'}
                            className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                              isOn
                                ? 'bg-primary-600 border-primary-600 text-white'
                                : 'border-ink-300 dark:border-ink-600 hover:border-primary-400'
                            }`}
                          >
                            {isOn && (
                              <svg viewBox="0 0 20 20" className="w-3 h-3" fill="currentColor">
                                <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.4 7.4a1 1 0 01-1.4 0L3.3 9.5a1 1 0 111.4-1.4l3.3 3.3 6.7-6.7a1 1 0 011.4 0z" clipRule="evenodd" />
                              </svg>
                            )}
                          </button>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-3">
                            <span className={`w-9 h-9 rounded-full flex items-center justify-center font-semibold text-[12px] ${tone}`}>
                              {(s.name || '??').split(' ').filter(Boolean).map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
                            </span>
                            <span className="font-medium text-ink-800 dark:text-ink-100">{s.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-ink-600 dark:text-ink-300">{s.id}</td>
                        <td className="px-3 py-3 text-ink-700 dark:text-ink-200 tabular-nums">{Math.round(s.marks)}</td>
                        <td className="px-3 py-3 text-ink-700 dark:text-ink-200 tabular-nums">{Math.round(s.percent)}%</td>
                        <td className="px-3 py-3 text-ink-600 dark:text-ink-300 tabular-nums">{s.year}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card-pad">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[16px] font-semibold text-ink-900 dark:text-white">
              Recent Activity
            </h3>
            <button className="icon-btn">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>

          <ul className="space-y-3">
            {(data?.activity ?? []).length === 0 ? (
              <li className="text-ink-400 text-[12.5px]">{loading ? 'Loading…' : 'No recent activity.'}</li>
            ) : (
              (data?.activity ?? []).map((a, i) => {
                const cfg = ACTIVITY_TONE[a.kind] ?? ACTIVITY_TONE.default
                const Icon = cfg.icon
                return (
                  <li key={i} className="flex items-start gap-3">
                    <span className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${cfg.tone}`}>
                      <Icon className="w-[18px] h-[18px]" />
                    </span>
                    <div className="min-w-0 flex-1 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[13.5px] font-semibold text-ink-900 dark:text-white leading-tight">
                          {a.title}
                        </p>
                        <p className="text-[12px] text-ink-500 mt-0.5 truncate">{a.detail}</p>
                      </div>
                      <span className="text-[11.5px] text-ink-400 shrink-0">{timeAgo(a.at)}</span>
                    </div>
                  </li>
                )
              })
            )}
          </ul>
        </div>
      </section>
    </div>
  )
}

const Legend = memo(function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-600 dark:text-ink-300">
      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
})
