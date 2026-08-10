import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Loader2, BookOpen, Users, CalendarDays, ClipboardCheck,
  GraduationCap, Wallet, PlaneTakeoff, ArrowRight, Clock, MapPin, AlertTriangle,
} from 'lucide-react'
import { teacherService } from '@/services/teacherService'

const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

/** hh:mm:ss -> hh:mm */
function hhmm(t?: string | null): string {
  return t ? t.slice(0, 5) : '--:--'
}

function StatTile({
  icon: Icon, label, value, hint, tone = 'brand', to,
}: {
  icon: typeof BookOpen
  label: string
  value: string | number
  hint?: string
  tone?: 'brand' | 'emerald' | 'amber' | 'rose' | 'indigo'
  to?: string
}) {
  const tones: Record<string, string> = {
    brand:   'bg-brand/10 text-brand',
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    amber:   'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    rose:    'bg-rose-500/10 text-rose-600 dark:text-rose-400',
    indigo:  'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
  }
  const inner = (
    <div className="card p-4 h-full hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-ink-400">{label}</p>
          <p className="text-2xl font-bold text-ink-900 dark:text-white mt-1 leading-none">{value}</p>
          {hint && <p className="text-[12px] text-ink-500 mt-1.5 truncate">{hint}</p>}
        </div>
        <span className={`shrink-0 w-9 h-9 rounded-lg grid place-items-center ${tones[tone]}`}>
          <Icon className="w-[18px] h-[18px]" />
        </span>
      </div>
    </div>
  )
  return to ? <Link to={to} className="block">{inner}</Link> : inner
}

export default function TeacherDashboardPage() {
  const q = useQuery({
    queryKey: ['teacher', 'summary'],
    queryFn:  ({ signal }) => teacherService.summary(undefined, signal),
  })

  const d = q.data?.data
  const s = d?.stats

  if (q.isLoading) {
    return (
      <div className="p-12 text-center">
        <Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" />
      </div>
    )
  }

  if (q.isError) {
    return (
      <div className="card p-8 text-center">
        <AlertTriangle className="w-7 h-7 mx-auto text-rose-500 mb-2" />
        <p className="text-sm text-rose-500">Could not load your dashboard.</p>
      </div>
    )
  }

  const noAssignments = (s?.courses ?? 0) === 0

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-ink-900 dark:text-white">My Teaching</h2>
          <p className="text-[13px] text-ink-500">
            Your courses, students, timetable and records at a glance.
          </p>
        </div>
        <Link to="/teacher/calendar" className="btn-primary btn-sm">
          <CalendarDays className="w-3.5 h-3.5" /> My calendar
        </Link>
      </div>

      {noAssignments && (
        <div className="card p-4 border-l-4 border-l-amber-500">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-ink-900 dark:text-white">
                You have no module assignments yet
              </p>
              <p className="text-[13px] text-ink-500 mt-0.5">
                Until a registrar assigns you to a module for the current term, your courses,
                students, attendance and marks pages will all be empty.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Stat tiles ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile icon={BookOpen} label="My courses" value={s?.courses ?? 0}
                  hint="Assigned this term" tone="brand" to="/teacher/courses" />
        <StatTile icon={Users} label="My students" value={s?.students ?? 0}
                  hint="Across all my courses" tone="indigo" to="/teacher/students" />
        {/* Attendance is per-course now, so the aggregate tile lands on the
            course list where you pick one, not the standalone /attendance page. */}
        <StatTile icon={ClipboardCheck} label="Attendance"
                  value={s?.attendance_rate != null ? `${s.attendance_rate}%` : '—'}
                  hint={`${s?.sessions_held ?? 0} session(s) held`} tone="emerald"
                  to="/teacher/courses" />
        <StatTile icon={GraduationCap} label="Marks pending" value={s?.marks_pending ?? 0}
                  hint="Courses with unmarked students" tone="amber" to="/teacher/courses" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* ── Today's classes ────────────────────────────────────────────── */}
        <div className="card p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-ink-900 dark:text-white">Today&apos;s classes</h3>
            <Link to="/teacher/calendar" className="text-[12px] text-brand hover:underline flex items-center gap-1">
              Full calendar <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {(d?.today_classes ?? []).length === 0 ? (
            <p className="text-[13px] text-ink-400 py-6 text-center">
              No classes scheduled for today.
            </p>
          ) : (
            <ul className="divide-y divide-ink-100 dark:divide-ink-700">
              {d!.today_classes.map((c, i) => (
                <li key={`${c.module_id}-${i}`} className="py-2.5 flex items-center gap-3">
                  <span className="chip-soft shrink-0 tabular-nums">
                    {hhmm(c.start_time)}–{hhmm(c.end_time)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-ink-900 dark:text-white truncate">
                      {c.module_code} — {c.module_name}
                    </p>
                    <p className="text-[12px] text-ink-500 flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {c.room ?? 'No room'} · {c.session_type}
                    </p>
                  </div>
                  <Link
                    to={`/teacher/courses/${c.module_id}?tab=attendance`}
                    className="btn-ghost btn-sm shrink-0"
                  >
                    Take attendance
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── Personal / HR ──────────────────────────────────────────────── */}
        <div className="space-y-3">
          <Link to="/me/leave" className="card p-4 block hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-lg grid place-items-center bg-sky-500/10 text-sky-600 dark:text-sky-400 shrink-0">
                <PlaneTakeoff className="w-[18px] h-[18px]" />
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-ink-900 dark:text-white">My leave</p>
                <p className="text-[12px] text-ink-500">
                  {s?.pending_leave ? `${s.pending_leave} pending request(s)` : 'Request or track leave'}
                </p>
              </div>
            </div>
          </Link>

          <Link to="/me/payroll" className="card p-4 block hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-lg grid place-items-center bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                <Wallet className="w-[18px] h-[18px]" />
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-ink-900 dark:text-white">My salary</p>
                <p className="text-[12px] text-ink-500 truncate">
                  {d?.latest_payslip
                    ? `${MONTHS[d.latest_payslip.period_month] ?? ''} ${d.latest_payslip.period_year} · ${Number(d.latest_payslip.net_pay).toLocaleString()} RWF`
                    : 'Payslip history'}
                </p>
              </div>
            </div>
          </Link>

          <Link to="/teacher/exams" className="card p-4 block hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-lg grid place-items-center bg-violet-500/10 text-violet-600 dark:text-violet-400 shrink-0">
                <CalendarDays className="w-[18px] h-[18px]" />
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-ink-900 dark:text-white">My exams</p>
                <p className="text-[12px] text-ink-500">
                  {s?.upcoming_exams ? `${s.upcoming_exams} upcoming` : 'Rooms & attendance'}
                </p>
              </div>
            </div>
          </Link>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* ── Marks progress ─────────────────────────────────────────────── */}
        <div className="card p-4">
          <h3 className="text-sm font-bold text-ink-900 dark:text-white mb-3">Marks progress</h3>
          {(d?.marks_progress ?? []).length === 0 ? (
            <p className="text-[13px] text-ink-400 py-6 text-center">Nothing to mark yet.</p>
          ) : (
            <ul className="space-y-3">
              {d!.marks_progress.map((m) => {
                const done = m.enrolled - m.unmarked
                const pct  = m.enrolled > 0 ? Math.round((done / m.enrolled) * 100) : 0
                return (
                  <li key={m.module_id}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[13px] font-medium text-ink-900 dark:text-white truncate">
                        {m.module_code}
                      </span>
                      <span className="text-[12px] text-ink-500 tabular-nums shrink-0">
                        {done}/{m.enrolled}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-ink-100 dark:bg-ink-700 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${pct === 100 ? 'bg-emerald-500' : 'bg-brand'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* ── Upcoming exams ─────────────────────────────────────────────── */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-ink-900 dark:text-white">Upcoming exams</h3>
            <Link to="/teacher/exams" className="text-[12px] text-brand hover:underline flex items-center gap-1">
              All exams <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {(d?.upcoming_exams ?? []).length === 0 ? (
            <p className="text-[13px] text-ink-400 py-6 text-center">No exams scheduled.</p>
          ) : (
            <ul className="divide-y divide-ink-100 dark:divide-ink-700">
              {d!.upcoming_exams.map((e) => (
                <li key={e.id} className="py-2.5 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-ink-900 dark:text-white truncate">
                      {e.module_code} · {e.component}
                    </p>
                    <p className="text-[12px] text-ink-500 flex items-center gap-2">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />{e.exam_date} {hhmm(e.start_time)}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />{e.room ?? 'No room'}
                      </span>
                    </p>
                  </div>
                  <Link to={`/teacher/exams/${e.id}`} className="btn-ghost btn-sm shrink-0">
                    Open
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
