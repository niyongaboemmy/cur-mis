import { memo, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  GraduationCap,
  Users,
  Users2,
  Wallet,
  ChevronDown,
  MoreHorizontal,
  UserPlus,
  FileText,
  BookOpen,
  ArrowRight,
  Upload,
  Search,
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import StatCard   from '@/components/dashboard/StatCard'
import LineChart  from '@/components/dashboard/LineChart'
import DonutChart from '@/components/dashboard/DonutChart'
import { applicantService } from '@/services/admissionService'
import type { ApplicationStatus } from '@/types/admission'

/* ------------------------------------------------------------------
 * Placeholder numbers — real data will land with each module.
 * ------------------------------------------------------------------ */

const WEEK_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const EXAM_SERIES = [
  { name: 'Teacher',  color: '#0A2A5E', data: [55, 72, 48, 65, 82, 58, 60] },
  { name: 'Students', color: '#4FB4FF', data: [30, 58, 40, 55, 35, 48, 25] },
]

const GENDER_SEGMENTS = [
  { label: 'Male',   value: 9000, color: '#0A2A5E' },
  { label: 'Female', value: 6000, color: '#F5C400' },
]

const STAR_STUDENTS = [
  { name: 'Evelyn Harper', id: 'PRE43178', marks: 1185, percent: 98, year: 2014, avatarTone: 'bg-accent-lilac text-primary-700' },
  { name: 'Diana Plenty',  id: 'PRE43174', marks: 1165, percent: 91, year: 2014, avatarTone: 'bg-accent-peach text-orange-700' },
  { name: 'John Millar',   id: 'PRE43187', marks: 1175, percent: 92, year: 2014, avatarTone: 'bg-accent-sky text-sky-700'     },
  { name: 'Mukamana Grace',id: 'PRE43201', marks: 1155, percent: 90, year: 2014, avatarTone: 'bg-accent-mint text-emerald-700' },
]

type ActivityItem = { title: string; detail: string; time: string; icon: typeof UserPlus; tone: string }
const ACTIVITY: ActivityItem[] = [
  { title: 'New Teacher',    detail: 'It is a long established readable..', time: 'Just now',    icon: UserPlus, tone: 'bg-sky-100 text-sky-600' },
  { title: 'Fees Structure', detail: 'It is a long established readable..', time: 'Today',       icon: FileText, tone: 'bg-red-100 text-red-500' },
  { title: 'New Course',     detail: 'It is a long established readable..', time: '24 Sep 2023', icon: BookOpen, tone: 'bg-emerald-100 text-emerald-600' },
]

const STATUS_CHIP: Record<ApplicationStatus, { label: string; cls: string; icon: any }> = {
  draft:                  { label: 'Draft',                  cls: 'chip-soft',    icon: FileText },
  submitted:              { label: 'Submitted',              cls: 'chip-primary', icon: CheckCircle2 },
  documents_under_review: { label: 'Docs under review',      cls: 'chip-warning', icon: Clock },
  documents_verified:     { label: 'Docs verified',          cls: 'chip-success', icon: CheckCircle2 },
  documents_rejected:     { label: 'Docs rejected',          cls: 'chip-danger',  icon: XCircle },
  merit_listed:           { label: 'Merit listed',           cls: 'chip-primary', icon: CheckCircle2 },
  offered:                { label: 'Offer received',         cls: 'chip-success', icon: CheckCircle2 },
  offer_accepted:         { label: 'Offer accepted',         cls: 'chip-success', icon: CheckCircle2 },
  offer_declined:         { label: 'Offer declined',         cls: 'chip-soft',    icon: XCircle },
  enrolled:               { label: 'Enrolled',               cls: 'chip-success', icon: CheckCircle2 },
  withdrawn:              { label: 'Withdrawn',              cls: 'chip-soft',    icon: XCircle },
}

function ApplicantDashboard() {
  const { user } = useAuthStore()
  const firstName = user?.full_name?.split(' ')[0] ?? 'Applicant'

  const appsQ = useQuery({
    queryKey: ['applicant', 'applications'],
    queryFn: () => applicantService.listApplications(),
  })
  const apps = appsQ.data?.data ?? []
  const app = apps[0]
  const status = app?.status as ApplicationStatus | undefined
  const chip = status ? STATUS_CHIP[status] : null

  if (appsQ.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-brand" />
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-[900px] mx-auto">
      {/* Welcome */}
      <section className="card p-6">
        <h2 className="text-[22px] font-semibold text-ink-900 dark:text-white tracking-tight">
          Welcome back, {firstName}
        </h2>
        <p className="text-[13px] text-ink-500 mt-1">
          {app ? 'Here is the current status of your application.' : 'You have not started an application yet.'}
        </p>
      </section>

      {app ? (
        <>
          {/* Application status card */}
          <section className="card p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-ink-400">Application number</p>
                <p className="text-[22px] font-mono font-bold text-brand mt-0.5">{app.application_number}</p>
                <p className="text-[13px] text-ink-500 mt-1">
                  {app.department_name ?? app.faculty_name} · {app.intake}
                </p>
              </div>
              {chip && (
                <span className={`${chip.cls} text-[13px]`}>
                  <chip.icon className="w-3.5 h-3.5" />
                  {chip.label}
                </span>
              )}
            </div>
          </section>

          {/* Quick actions */}
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <QuickLink
              to={`/apply/track?no=${app.application_number}`}
              icon={Search}
              label="Track application"
              sub="See full status & history"
            />
            <QuickLink
              to="/applicant/documents"
              icon={Upload}
              label="Upload documents"
              sub="Manage required files"
            />
            <QuickLink
              to="/applicant"
              icon={GraduationCap}
              label="My application"
              sub="View and edit details"
            />
          </section>
        </>
      ) : (
        <section className="card p-10 text-center space-y-4">
          <GraduationCap className="w-12 h-12 text-brand mx-auto opacity-40" />
          <div>
            <p className="text-[16px] font-semibold text-ink-900 dark:text-white">No application yet</p>
            <p className="text-[13px] text-ink-500 mt-1">Start your application to begin the admission process.</p>
          </div>
          <Link to="/apply" className="btn-primary inline-flex">
            Start application <ArrowRight className="w-4 h-4" />
          </Link>
        </section>
      )}
    </div>
  )
}

function QuickLink({ to, icon: Icon, label, sub }: { to: string; icon: any; label: string; sub: string }) {
  return (
    <Link
      to={to}
      className="card p-4 flex items-center gap-3 hover:border-brand/40 hover:bg-brand/5 transition-all group"
    >
      <span className="w-10 h-10 rounded-lg bg-brand/10 text-brand flex items-center justify-center shrink-0 group-hover:bg-brand group-hover:text-white transition-colors">
        <Icon className="w-4.5 h-4.5" />
      </span>
      <div className="min-w-0">
        <p className="text-[13.5px] font-semibold text-ink-900 dark:text-white">{label}</p>
        <p className="text-[11.5px] text-ink-500 truncate">{sub}</p>
      </div>
      <ArrowRight className="w-3.5 h-3.5 text-ink-300 ml-auto group-hover:text-brand transition-colors" />
    </Link>
  )
}

export default function HomePage() {
  const { user } = useAuthStore()

  if (user?.role === 'applicant') return <ApplicantDashboard />

  const [range, setRange] = useState<'Weekly' | 'Monthly' | 'Yearly'>('Monthly')
  const [rangeOpen, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set(['PRE43174']))

  const firstName = useMemo(() => user?.full_name?.split(' ')[0] ?? 'Admin', [user])

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">

      {/* ───────── Admin Dashboard panel ───────── */}
      <section className="card p-6">
        <h2 className="text-[22px] font-semibold text-ink-900 dark:text-white tracking-tight">
          Admin Dashboard
        </h2>
        <p className="sr-only">Welcome back, {firstName}</p>

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard label="Students"  value="15.00K" icon={GraduationCap} tone="lilac" />
          <StatCard label="Teachers"  value="2.00K"  icon={Users}         tone="sky"   />
          <StatCard label="Parents"   value="5.6K"   icon={Users2}        tone="peach" />
          <StatCard label="Earnings"  value="$19.3K" icon={Wallet}        tone="mint"  />
        </div>
      </section>

      {/* ───────── Line + Donut ───────── */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="card-pad lg:col-span-2">
          <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
            <h3 className="text-[16px] font-semibold text-ink-900 dark:text-white">
              All Exam Results
            </h3>
            <div className="flex items-center gap-4">
              <Legend color="#0A2A5E" label="Teacher" />
              <Legend color="#4FB4FF" label="Students" />

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
          <LineChart labels={WEEK_LABELS} series={EXAM_SERIES} height={260} />
        </div>

        <div className="card-pad flex flex-col">
          <div className="flex items-start justify-between mb-2">
            <h3 className="text-[16px] font-semibold text-ink-900 dark:text-white">Students</h3>
            <button className="icon-btn">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 flex items-center justify-center">
            <DonutChart
              segments={GENDER_SEGMENTS}
              centerTop="Total"
              centerBig={(GENDER_SEGMENTS[0].value + GENDER_SEGMENTS[1].value).toLocaleString()}
            />
          </div>

          <div className="flex items-center justify-center gap-6 mt-4">
            {GENDER_SEGMENTS.map((s) => (
              <Legend key={s.label} color={s.color} label={s.label} />
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Star students + Activity feed ───────── */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="card-pad lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[16px] font-semibold text-ink-900 dark:text-white">
              Star Students
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
                  <th className="px-3 py-3 font-semibold">ID</th>
                  <th className="px-3 py-3 font-semibold">Marks</th>
                  <th className="px-3 py-3 font-semibold">Percent</th>
                  <th className="px-3 py-3 font-semibold">Year</th>
                </tr>
              </thead>
              <tbody>
                {STAR_STUDENTS.map((s) => {
                  const isOn = selected.has(s.id)
                  return (
                    <tr
                      key={s.id}
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
                          <span className={`w-9 h-9 rounded-full flex items-center justify-center font-semibold text-[12px] ${s.avatarTone}`}>
                            {s.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                          </span>
                          <span className="font-medium text-ink-800 dark:text-ink-100">{s.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-ink-600 dark:text-ink-300">{s.id}</td>
                      <td className="px-3 py-3 text-ink-700 dark:text-ink-200 tabular-nums">{s.marks}</td>
                      <td className="px-3 py-3 text-ink-700 dark:text-ink-200 tabular-nums">{s.percent}%</td>
                      <td className="px-3 py-3 text-ink-600 dark:text-ink-300 tabular-nums">{s.year}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card-pad">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[16px] font-semibold text-ink-900 dark:text-white">
              All Exam Results
            </h3>
            <button className="icon-btn">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>

          <ul className="space-y-3">
            {ACTIVITY.map((a, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${a.tone}`}>
                  <a.icon className="w-[18px] h-[18px]" />
                </span>
                <div className="min-w-0 flex-1 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-semibold text-ink-900 dark:text-white leading-tight">
                      {a.title}
                    </p>
                    <p className="text-[12px] text-ink-500 mt-0.5 truncate">{a.detail}</p>
                  </div>
                  <span className="text-[11.5px] text-ink-400 shrink-0">{a.time}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  )
}

/* ------------------------------------------------------------------ */
const Legend = memo(function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-600 dark:text-ink-300">
      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
})
