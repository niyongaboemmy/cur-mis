import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Loader2, Users, ClipboardCheck, GraduationCap, ChevronRight, Search,
  CalendarRange, MapPin, Clock, CalendarX, LayoutGrid, List, BookOpen,
} from 'lucide-react'
import { teacherService, type TeacherCourse } from '@/services/teacherService'

const DAY_ABBR = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const STATUS_LABEL: Record<string, string> = {
  ongoing:     'Ongoing',
  upcoming:    'Upcoming',
  completed:   'Completed',
  unscheduled: 'Not timetabled',
}

const STATUS_CHIP: Record<string, string> = {
  ongoing:     'chip-success',
  upcoming:    'chip-primary',
  completed:   'chip-soft',
  unscheduled: 'chip-warning',
}

function pct(n: number | null): string {
  return n == null ? '—' : `${n}%`
}

/** hh:mm:ss -> hh:mm */
function hhmm(t?: string | null): string {
  return t ? t.slice(0, 5) : ''
}

/** 2026-07-10 -> 10 Jul 2026 */
function niceDate(d?: string | null): string {
  if (!d) return '—'
  const dt = new Date(`${d}T00:00:00`)
  return Number.isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Short form for dense rows: 10 Jul */
function shortDate(d?: string | null): string {
  if (!d) return '—'
  const dt = new Date(`${d}T00:00:00`)
  return Number.isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/** Weeks remaining until the module's end date; null once it has ended. */
function weeksLeft(end?: string | null): number | null {
  if (!end) return null
  const ms = new Date(`${end}T00:00:00`).getTime() - Date.now()
  return ms <= 0 ? null : Math.ceil(ms / (7 * 24 * 60 * 60 * 1000))
}

/** "Mon 08:00–10:00" for the first block, with "+n" when there are more. */
function scheduleSummary(c: TeacherCourse): string {
  const b = c.schedules[0]
  if (!b) return '—'
  const day  = b.day_of_week ? `${DAY_ABBR[b.day_of_week]} ` : ''
  const time = `${hhmm(b.start_time)}${b.end_time ? `–${hhmm(b.end_time)}` : ''}`
  const more = c.schedules.length > 1 ? ` +${c.schedules.length - 1}` : ''
  return `${day}${time}${more}`
}

/* ══════════════════════════════════════════════════════════════════════════
 * Course card (grid view)
 * ═══════════════════════════════════════════════════════════════════════ */

function CourseCard({ c }: { c: TeacherCourse }) {
  const left     = weeksLeft(c.end_date)
  const marksPct = c.students > 0 ? Math.round((c.marks_scored / c.students) * 100) : 0
  const block    = c.schedules[0]

  return (
    <Link
      to={`/teacher/courses/${c.module_id}`}
      className="card text-left hover:shadow-lg hover:-translate-y-0.5 transition-all group overflow-hidden flex flex-col"
    >
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Header */}
        <div className="p-3.5 pb-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-brand tracking-widest">{c.module_code}</span>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className={STATUS_CHIP[c.status] ?? 'chip-soft'}>
                {STATUS_LABEL[c.status] ?? c.status}
              </span>
              <ChevronRight className="w-4 h-4 text-ink-300 group-hover:text-brand group-hover:translate-x-0.5 transition-all" />
            </div>
          </div>

          <p className="text-[15px] font-semibold text-ink-900 dark:text-white mt-1 leading-snug line-clamp-2">
            {c.module_name}
          </p>

          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {c.module_credits != null && <span className="chip-soft">{c.module_credits} cr</span>}
            {c.level != null && <span className="chip-soft">Level {c.level}</span>}
            {c.role === 'assistant' && <span className="chip-warning">Assistant</span>}
            {c.status === 'ongoing' && left != null && left <= 4 && (
              <span className="chip-warning">{left} wk{left === 1 ? '' : 's'} left</span>
            )}
          </div>
        </div>

        {/* Schedule — one compact band: period on top, then time + room side by side */}
        <div className="px-3.5 py-2.5 bg-ink-50/70 dark:bg-ink-800/40 border-y border-ink-100 dark:border-ink-700">
          <p className="text-[12px] text-ink-600 dark:text-ink-300 flex items-center gap-1.5">
            <CalendarRange className="w-3.5 h-3.5 text-brand shrink-0" />
            <span className="font-medium">{niceDate(c.start_date)}</span>
            <span className="text-ink-400">→</span>
            <span className="font-medium">{niceDate(c.end_date)}</span>
          </p>
          <div className="flex items-center gap-4 mt-1">
            <p className="text-[12px] text-ink-600 dark:text-ink-300 flex items-center gap-1.5 min-w-0">
              <Clock className="w-3.5 h-3.5 text-ink-400 shrink-0" />
              <span className="tabular-nums truncate">{scheduleSummary(c)}</span>
            </p>
            <p className="text-[12px] text-ink-600 dark:text-ink-300 flex items-center gap-1.5 min-w-0">
              <MapPin className="w-3.5 h-3.5 text-ink-400 shrink-0" />
              {c.rooms
                ? <span className="truncate" title={block?.building ?? ''}>{c.rooms}</span>
                : <span className="text-ink-400 italic">No room</span>}
            </p>
          </div>
        </div>

        {/* Figures */}
        <div className="p-3.5 pt-2.5 mt-auto">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-ink-400 font-bold">Students</p>
              <p className="text-base font-bold text-ink-900 dark:text-white flex items-center gap-1 leading-none mt-1">
                <Users className="w-3.5 h-3.5 text-ink-400" />{c.students}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-ink-400 font-bold">Attend.</p>
              <p className="text-base font-bold text-ink-900 dark:text-white leading-none mt-1">
                {pct(c.attendance_rate)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-ink-400 font-bold">Marked</p>
              <p className="text-base font-bold text-ink-900 dark:text-white leading-none mt-1">
                {c.marks_scored}<span className="text-ink-400 text-[12px]">/{c.students}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-2.5">
            <div className="h-1.5 rounded-full bg-ink-100 dark:bg-ink-700 overflow-hidden flex-1">
              <div
                className={`h-full rounded-full transition-all ${marksPct === 100 ? 'bg-emerald-500' : 'bg-brand'}`}
                style={{ width: `${marksPct}%` }}
              />
            </div>
            <span className="text-[10px] font-bold text-ink-400 tabular-nums shrink-0">{marksPct}%</span>
          </div>
        </div>
      </div>
    </Link>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
 * Course row (list view) — scales to a long teaching history
 * ═══════════════════════════════════════════════════════════════════════ */

function CourseRow({ c, onOpen }: { c: TeacherCourse; onOpen: (c: TeacherCourse) => void }) {
  const marksPct = c.students > 0 ? Math.round((c.marks_scored / c.students) * 100) : 0

  return (
    <tr
      onClick={() => onOpen(c)}
      className="hover:bg-ink-50/60 dark:hover:bg-ink-700/20 cursor-pointer group"
    >
      <td className="px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-brand tracking-widest">{c.module_code}</p>
          <p className="text-[13px] font-semibold text-ink-900 dark:text-white truncate max-w-[280px]">
            {c.module_name}
          </p>
        </div>
      </td>
      <td className="px-3 py-2.5">
        <span className={STATUS_CHIP[c.status] ?? 'chip-soft'}>
          {STATUS_LABEL[c.status] ?? c.status}
        </span>
      </td>
      <td className="px-3 py-2.5 text-[12px] text-ink-600 dark:text-ink-300 whitespace-nowrap">
        {shortDate(c.start_date)} → {shortDate(c.end_date)}
      </td>
      <td className="px-3 py-2.5 text-[12px] text-ink-600 dark:text-ink-300 tabular-nums whitespace-nowrap">
        {scheduleSummary(c)}
      </td>
      <td className="px-3 py-2.5 text-[12px] text-ink-600 dark:text-ink-300">
        {c.rooms || <span className="text-ink-400 italic">—</span>}
      </td>
      <td className="px-3 py-2.5 text-[13px] font-semibold text-ink-900 dark:text-white tabular-nums">
        {c.students}
      </td>
      <td className="px-3 py-2.5 text-[13px] tabular-nums">{pct(c.attendance_rate)}</td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2 min-w-[92px]">
          <div className="h-1.5 rounded-full bg-ink-100 dark:bg-ink-700 overflow-hidden flex-1">
            <div
              className={`h-full rounded-full ${marksPct === 100 ? 'bg-emerald-500' : 'bg-brand'}`}
              style={{ width: `${marksPct}%` }}
            />
          </div>
          <span className="text-[11px] text-ink-500 tabular-nums shrink-0">
            {c.marks_scored}/{c.students}
          </span>
        </div>
      </td>
      <td className="pl-3 pr-0 py-2.5">
        <ChevronRight className="w-4 h-4 text-ink-300 group-hover:text-brand transition-colors" />
      </td>
    </tr>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
 * Page
 * ═══════════════════════════════════════════════════════════════════════ */

type TabKey  = 'ongoing' | 'upcoming' | 'completed' | 'all'
type ViewKey = 'grid' | 'list'

const VIEW_STORAGE_KEY = 'teacher.courses.view'

export default function TeacherCoursesPage() {
  const navigate = useNavigate()
  const [tab, setTab]       = useState<TabKey>('ongoing')
  const [term, setTerm]     = useState<number | 'all'>('all')
  const [search, setSearch] = useState('')
  const [view, setView]     = useState<ViewKey>(
    () => (localStorage.getItem(VIEW_STORAGE_KEY) as ViewKey) || 'grid',
  )

  const chooseView = (v: ViewKey) => {
    setView(v)
    localStorage.setItem(VIEW_STORAGE_KEY, v)
  }

  // Fetched once across ALL terms, then filtered in the browser: tab switching
  // is instant and the per-tab counts need no extra request.
  const q = useQuery({
    queryKey: ['teacher', 'courses', 'scheduled'],
    queryFn:  ({ signal }) => teacherService.courses('all', false, signal),
  })

  // Only used to explain an empty/short list — a course with no timetable block
  // is hidden, and silently hiding it would look like the data was lost.
  const qAll = useQuery({
    queryKey: ['teacher', 'courses', 'all'],
    queryFn:  ({ signal }) => teacherService.courses('all', true, signal),
  })

  const all         = useMemo(() => q.data?.data ?? [], [q.data])
  const unscheduled = (qAll.data?.data ?? []).filter((c) => !c.is_scheduled)

  /** Terms present in the data — no extra API call needed. */
  const terms = useMemo(() => {
    const seen = new Map<number, string>()
    all.forEach((c) => { if (!seen.has(c.term_id)) seen.set(c.term_id, c.term_label ?? `Term ${c.term_id}`) })
    return [...seen.entries()].map(([id, label]) => ({ id, label }))
  }, [all])

  const byTerm = useMemo(
    () => (term === 'all' ? all : all.filter((c) => c.term_id === term)),
    [all, term],
  )

  const counts = useMemo(() => ({
    all:       byTerm.length,
    ongoing:   byTerm.filter((c) => c.status === 'ongoing').length,
    upcoming:  byTerm.filter((c) => c.status === 'upcoming').length,
    completed: byTerm.filter((c) => c.status === 'completed').length,
  }), [byTerm])

  const courses = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return byTerm
      .filter((c) => tab === 'all' || c.status === tab)
      .filter((c) => !needle
        || c.module_code.toLowerCase().includes(needle)
        || c.module_name.toLowerCase().includes(needle))
  }, [byTerm, tab, search])

  /** Totals across whatever is currently on screen, for the summary strip. */
  const totals = useMemo(() => {
    const students  = courses.reduce((n, c) => n + c.students, 0)
    const unmarked  = courses.reduce((n, c) => n + Math.max(0, c.students - c.marks_scored), 0)
    const rated     = courses.filter((c) => c.attendance_rate != null)
    const attend    = rated.length
      ? Math.round(rated.reduce((n, c) => n + (c.attendance_rate ?? 0), 0) / rated.length)
      : null
    return { students, unmarked, attend }
  }, [courses])

  // "Ongoing" is the right default for most terms, but a lecturer whose modules
  // have all finished (or not started) would land on an empty tab and think the
  // page was broken. Fall through to the first tab that actually has courses —
  // once only, so it never fights the user's own tab clicks.
  const autoTabbed = useRef(false)
  useEffect(() => {
    if (autoTabbed.current || all.length === 0) return
    autoTabbed.current = true
    if (counts.ongoing === 0) {
      setTab(counts.upcoming > 0 ? 'upcoming' : counts.completed > 0 ? 'completed' : 'all')
    }
  }, [all.length, counts])

  const TABS: Array<{ key: TabKey; label: string; count: number }> = [
    { key: 'ongoing',   label: 'Ongoing',   count: counts.ongoing },
    { key: 'upcoming',  label: 'Upcoming',  count: counts.upcoming },
    { key: 'completed', label: 'Completed', count: counts.completed },
    { key: 'all',       label: 'All',       count: counts.all },
  ]

  const SUMMARY = [
    { icon: BookOpen,       label: 'Courses',   value: courses.length,                     tone: 'text-brand bg-brand/10' },
    { icon: Users,          label: 'Students',  value: totals.students,                    tone: 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10' },
    { icon: ClipboardCheck, label: 'Avg attend.', value: totals.attend != null ? `${totals.attend}%` : '—', tone: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' },
    { icon: GraduationCap,  label: 'To mark',   value: totals.unmarked,                    tone: 'text-amber-600 dark:text-amber-400 bg-amber-500/10' },
  ]

  return (
    <div className="space-y-4 animate-fade-in">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-ink-900 dark:text-white">My Courses</h2>
          <p className="text-[13px] text-ink-500">
            Modules you are assigned to teach that have a timetable. Open one to see its class list.
          </p>
        </div>

        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-ink-100 dark:bg-ink-700/60 shrink-0">
          {([['grid', LayoutGrid, 'Grid view'], ['list', List, 'List view']] as const).map(
            ([key, Icon, title]) => (
              <button
                key={key}
                onClick={() => chooseView(key)}
                title={title}
                aria-label={title}
                aria-pressed={view === key}
                className={`p-1.5 rounded-md transition-colors ${
                  view === key
                    ? 'bg-white dark:bg-ink-800 text-brand shadow-sm'
                    : 'text-ink-400 hover:text-ink-600 dark:hover:text-ink-200'
                }`}
              >
                <Icon className="w-4 h-4" />
              </button>
            ),
          )}
        </div>
      </div>

      {/* ── Summary of what is on screen ─────────────────────────────────── */}
      {all.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {SUMMARY.map((s) => (
            <div key={s.label} className="card p-3 flex items-center gap-3">
              <span className={`w-9 h-9 rounded-lg grid place-items-center shrink-0 ${s.tone}`}>
                <s.icon className="w-[18px] h-[18px]" />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-ink-400 font-bold">{s.label}</p>
                <p className="text-lg font-bold text-ink-900 dark:text-white leading-none mt-0.5">
                  {s.value}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div className="card p-2.5 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors flex items-center gap-1.5 ${
                tab === t.key
                  ? 'bg-brand text-white'
                  : 'text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-700'
              }`}
            >
              {t.label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full tabular-nums ${
                tab === t.key ? 'bg-white/25' : 'bg-ink-100 dark:bg-ink-700'
              }`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {terms.length > 1 && (
            <select
              className="input input-sm w-auto"
              value={term === 'all' ? 'all' : String(term)}
              onChange={(e) => setTerm(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            >
              <option value="all">All terms</option>
              {terms.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          )}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              className="input input-sm pl-8 w-44"
              placeholder="Search courses…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      {q.isLoading ? (
        <div className="p-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" /></div>
      ) : q.isError ? (
        <div className="card p-8 text-center text-rose-500 text-sm">Failed to load your courses.</div>
      ) : courses.length === 0 ? (
        <div className="card p-10 text-center">
          <CalendarX className="w-7 h-7 mx-auto text-ink-300 mb-2" />
          {all.length > 0 ? (
            <>
              <p className="text-sm font-semibold text-ink-900 dark:text-white">
                No {tab === 'all' ? '' : STATUS_LABEL[tab]?.toLowerCase() + ' '}courses match
              </p>
              <p className="text-[13px] text-ink-500 mt-1">
                {search
                  ? <>Nothing matches “{search}”.</>
                  : <>You have no {STATUS_LABEL[tab]?.toLowerCase()} courses
                      {term !== 'all' ? ' in this term' : ''}.</>}
              </p>
              <button
                className="btn-ghost btn-sm mt-3"
                onClick={() => { setTab('all'); setTerm('all'); setSearch('') }}
              >
                Clear filters
              </button>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-ink-900 dark:text-white">
                {unscheduled.length > 0 ? 'None of your courses are timetabled yet' : 'No courses assigned'}
              </p>
              <p className="text-[13px] text-ink-500 mt-1 max-w-md mx-auto">
                {unscheduled.length > 0
                  ? `You are assigned to ${unscheduled.length} module(s) — ${unscheduled
                      .map((c) => c.module_code).join(', ')} — but none has a timetable
                     block yet, so there is no date, time or room to show.`
                  : 'A registrar needs to assign you to a module for the current term.'}
              </p>
            </>
          )}
        </div>
      ) : view === 'grid' ? (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {courses.map((c) => (
            <CourseCard key={c.assignment_id} c={c} />
          ))}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-ink-50 dark:bg-ink-800/50 border-b border-ink-100 dark:border-ink-700">
                {['Course', 'Status', 'Period', 'Schedule', 'Room', 'Students', 'Attend.', 'Marked', ''].map((h) => (
                  <th key={h}
                      className="px-3 py-2.5 font-bold text-ink-400 uppercase tracking-wider text-[10px] whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
              {courses.map((c) => (
                <CourseRow
                  key={c.assignment_id}
                  c={c}
                  onOpen={(x) => navigate(`/teacher/courses/${x.module_id}`)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      {courses.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-ink-400">
          <span>
            Showing {courses.length} of {counts.all} course(s)
            {term !== 'all' && ' in this term'}
          </span>
          {unscheduled.length > 0 && (
            <span className="flex items-center gap-1.5">
              <CalendarX className="w-3.5 h-3.5" />
              {unscheduled.length} not timetabled and hidden
              ({unscheduled.map((c) => c.module_code).join(', ')}).
            </span>
          )}
        </div>
      )}

    </div>
  )
}
