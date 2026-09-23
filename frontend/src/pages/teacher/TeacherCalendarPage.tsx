import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Loader2, ChevronLeft, ChevronRight, MapPin, PlaneTakeoff, BookOpen, FileText,
  CalendarDays, LayoutGrid,
} from 'lucide-react'
import { teacherService, type TeacherCalendar } from '@/services/teacherService'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/* ── date helpers (local-time safe: no UTC round-trips) ─────────────────── */

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function hhmm(t?: string | null): string {
  return t ? t.slice(0, 5) : ''
}
/** Minutes since midnight, for positioning in the week grid. */
function mins(t?: string | null): number | null {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  return Number.isFinite(h) ? h * 60 + (m || 0) : null
}
/** Monday of the week containing `d`. */
function startOfWeek(d: Date): Date {
  const out = new Date(d)
  out.setDate(out.getDate() - ((out.getDay() + 6) % 7))
  out.setHours(0, 0, 0, 0)
  return out
}
function addDays(d: Date, n: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

/* ── one thing happening on one day ─────────────────────────────────────── */

type Entry = {
  kind:      'class' | 'exam' | 'leave'
  key:       string
  title:     string
  sub:       string
  start:     string          // '' for all-day (leave)
  end:       string
  startMin:  number | null
  endMin:    number | null
  to:        string | null   // where clicking goes
}

const TONE: Record<Entry['kind'], string> = {
  class: 'bg-brand/10 text-brand border-brand/25',
  exam:  'bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/25',
  leave: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25',
}

const ICON: Record<Entry['kind'], typeof BookOpen> = {
  class: BookOpen,
  exam:  FileText,
  leave: PlaneTakeoff,
}

/**
 * Expands the API payload onto concrete dates.
 * Classes arrive as weekly RULES (day_of_week + active window), exams as single
 * dates, leave as ranges — so all three have to be projected onto each day the
 * grid is about to draw.
 */
function buildDayMap(data: TeacherCalendar | null | undefined, days: Date[]): Record<string, Entry[]> {
  const map: Record<string, Entry[]> = {}
  days.forEach((d) => { map[ymd(d)] = [] })
  if (!data) return map

  days.forEach((d) => {
    const key = ymd(d)
    const dow = ((d.getDay() + 6) % 7) + 1 // 1 = Monday, matching module_schedules

    data.classes.forEach((c) => {
      if (c.day_of_week !== dow) return
      if (c.start_date && key < c.start_date) return
      if (c.end_date   && key > c.end_date)   return
      map[key].push({
        kind: 'class',
        key: `c-${c.id}-${key}`,
        title: c.module_code,
        sub: c.room ? `${c.session_type} · ${c.room}` : c.session_type,
        start: hhmm(c.start_time),
        end: hhmm(c.end_time),
        startMin: mins(c.start_time),
        endMin: mins(c.end_time),
        to: `/teacher/courses/${c.module_id}?tab=attendance`,
      })
    })

    data.exams.forEach((e) => {
      if (e.exam_date !== key) return
      map[key].push({
        kind: 'exam',
        key: `e-${e.id}`,
        title: `${e.module_code} exam`,
        sub: e.room ? `${e.component} · ${e.room}` : e.component,
        start: hhmm(e.start_time),
        end: hhmm(e.end_time),
        startMin: mins(e.start_time),
        endMin: mins(e.end_time),
        to: `/teacher/exams/${e.id}`,
      })
    })

    data.leave.forEach((l) => {
      if (key < l.start_date || key > l.end_date) return
      map[key].push({
        kind: 'leave',
        key: `l-${l.id}-${key}`,
        title: l.leave_type ?? 'Leave',
        sub: l.status,
        start: '', end: '', startMin: null, endMin: null,
        to: '/me/leave',
      })
    })
  })

  Object.values(map).forEach((list) =>
    list.sort((a, b) => (a.startMin ?? -1) - (b.startMin ?? -1)))
  return map
}

/* ── a single event block ───────────────────────────────────────────────── */

function EventBlock({ e, dense, style }: { e: Entry; dense?: boolean; style?: React.CSSProperties }) {
  const Icon = ICON[e.kind]
  const body = (
    <>
      <div className="flex items-center gap-1 min-w-0">
        <Icon className="w-2.5 h-2.5 shrink-0" />
        <span className="text-[11px] font-bold truncate">{e.title}</span>
      </div>
      {!dense && e.start && (
        <p className="text-[10px] opacity-80 tabular-nums">{e.start}–{e.end}</p>
      )}
      {!dense && (
        <p className="text-[10px] opacity-80 truncate flex items-center gap-0.5">
          {e.kind !== 'leave' && <MapPin className="w-2.5 h-2.5 shrink-0" />}{e.sub}
        </p>
      )}
    </>
  )
  const cls = `block rounded-md border px-1.5 py-1 overflow-hidden ${TONE[e.kind]} hover:brightness-95 transition-all`
  return e.to
    ? <Link to={e.to} className={cls} style={style}>{body}</Link>
    : <div className={cls} style={style}>{body}</div>
}

/* ══════════════════════════════════════════════════════════════════════════ */

type ViewKey = 'month' | 'week'

export default function TeacherCalendarPage() {
  const [view, setView]   = useState<ViewKey>('month')
  const [anchor, setAnchor] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d })

  /* The visible grid: a full 6×7 month (including leading/trailing days from
     the neighbouring months, so every cell is drawn) or a Mon–Sun week. */
  const days = useMemo(() => {
    if (view === 'week') {
      const s = startOfWeek(anchor)
      return Array.from({ length: 7 }, (_, i) => addDays(s, i))
    }
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    const gridStart = startOfWeek(first)
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  }, [anchor, view])

  const from = ymd(days[0])
  const to   = ymd(days[days.length - 1])

  const q = useQuery({
    queryKey: ['teacher', 'calendar', from, to],
    queryFn:  ({ signal }) => teacherService.calendar({ from, to }, signal),
  })

  const byDay = useMemo(() => buildDayMap(q.data?.data, days), [q.data, days])

  /* Week grid vertical extent — derived from the events actually present so the
     grid is not 24 hours of mostly-empty rows, with a sane 08:00–18:00 floor. */
  const [gridFrom, gridTo] = useMemo(() => {
    let lo = 8 * 60, hi = 18 * 60
    Object.values(byDay).flat().forEach((e) => {
      if (e.startMin != null) lo = Math.min(lo, e.startMin)
      if (e.endMin   != null) hi = Math.max(hi, e.endMin)
    })
    return [Math.floor(lo / 60) * 60, Math.ceil(hi / 60) * 60]
  }, [byDay])

  const hours = useMemo(() => {
    const out: number[] = []
    for (let m = gridFrom; m <= gridTo; m += 60) out.push(m)
    return out
  }, [gridFrom, gridTo])

  const shift = (n: number) => setAnchor((d) =>
    view === 'week'
      ? addDays(d, n * 7)
      : new Date(d.getFullYear(), d.getMonth() + n, 1))

  const todayKey = ymd(new Date())
  const label = view === 'week'
    ? `${days[0].toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${days[6].toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`
    : anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  const HOUR_PX = 52

  return (
    <div className="space-y-4 animate-fade-in">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-ink-900 dark:text-white">My Calendar</h2>
          <p className="text-[13px] text-ink-500">
            Your classes, exam sittings and approved leave.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-ink-100 dark:bg-ink-700/60">
            {([['month', LayoutGrid, 'Month'], ['week', CalendarDays, 'Week']] as const).map(
              ([key, Icon, title]) => (
                <button
                  key={key}
                  onClick={() => setView(key)}
                  title={`${title} view`}
                  aria-pressed={view === key}
                  className={`px-2.5 py-1.5 rounded-md text-[12px] font-semibold inline-flex items-center gap-1.5 transition-colors ${
                    view === key
                      ? 'bg-white dark:bg-ink-800 text-brand shadow-sm'
                      : 'text-ink-400 hover:text-ink-600 dark:hover:text-ink-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />{title}
                </button>
              ),
            )}
          </div>

          <div className="flex items-center gap-1">
            <button className="icon-btn" onClick={() => shift(-1)} aria-label="Previous">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              className="btn-ghost btn-sm"
              onClick={() => { const d = new Date(); d.setHours(0, 0, 0, 0); setAnchor(d) }}
            >
              Today
            </button>
            <button className="icon-btn" onClick={() => shift(1)} aria-label="Next">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap -mt-2">
        <p className="text-[14px] font-semibold text-ink-800 dark:text-ink-100">{label}</p>
        <div className="flex gap-3 text-[12px] text-ink-500">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-brand/40" /> Class</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-violet-500/40" /> Exam</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-amber-500/40" /> Leave</span>
        </div>
      </div>

      {q.isLoading ? (
        <div className="card p-16 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" /></div>
      ) : q.isError ? (
        <div className="card p-10 text-center text-rose-500 text-sm">Failed to load your calendar.</div>

      /* ══ MONTH — every cell drawn, empty or not ══════════════════════════ */
      ) : view === 'month' ? (
        <div className="card overflow-hidden">
          <div className="grid grid-cols-7 border-b border-ink-100 dark:border-ink-700 bg-ink-50 dark:bg-ink-800/50">
            {DAY_LABELS.map((d) => (
              <div key={d} className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-ink-400 text-center">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {days.map((d, i) => {
              const key       = ymd(d)
              const entries   = byDay[key] ?? []
              const isToday   = key === todayKey
              const inMonth   = d.getMonth() === anchor.getMonth()
              const isWeekend = d.getDay() === 0 || d.getDay() === 6
              return (
                <div
                  key={key}
                  className={`min-h-[104px] p-1.5 border-b border-r border-ink-100 dark:border-ink-700
                    ${i % 7 === 6 ? 'border-r-0' : ''}
                    ${!inMonth ? 'bg-ink-50/50 dark:bg-ink-900/30' : isWeekend ? 'bg-ink-50/30 dark:bg-ink-800/20' : ''}`}
                >
                  <div className="flex justify-end mb-1">
                    <span className={`text-[12px] font-semibold tabular-nums w-6 h-6 grid place-items-center rounded-full
                      ${isToday ? 'bg-brand text-white'
                        : inMonth ? 'text-ink-700 dark:text-ink-200'
                        : 'text-ink-300 dark:text-ink-600'}`}>
                      {d.getDate()}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {entries.slice(0, 3).map((e) => <EventBlock key={e.key} e={e} dense />)}
                    {entries.length > 3 && (
                      <p className="text-[10px] text-ink-400 pl-1">+{entries.length - 3} more</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

      /* ══ WEEK — hour rows, so empty slots are visible ════════════════════ */
      ) : (
        <div className="card overflow-x-auto">
          <div className="min-w-[720px]">
            {/* Day header */}
            <div className="grid border-b border-ink-100 dark:border-ink-700 bg-ink-50 dark:bg-ink-800/50"
                 style={{ gridTemplateColumns: '56px repeat(7, minmax(0,1fr))' }}>
              <div />
              {days.map((d) => {
                const isToday = ymd(d) === todayKey
                return (
                  <div key={ymd(d)} className="px-2 py-2 text-center border-l border-ink-100 dark:border-ink-700">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
                      {DAY_LABELS[(d.getDay() + 6) % 7]}
                    </p>
                    <p className={`text-[13px] font-bold tabular-nums ${isToday ? 'text-brand' : 'text-ink-800 dark:text-ink-100'}`}>
                      {d.getDate()}
                    </p>
                  </div>
                )
              })}
            </div>

            {/* All-day row — leave has no clock time, so it cannot sit in the grid */}
            {days.some((d) => (byDay[ymd(d)] ?? []).some((e) => e.startMin == null)) && (
              <div className="grid border-b border-ink-100 dark:border-ink-700"
                   style={{ gridTemplateColumns: '56px repeat(7, minmax(0,1fr))' }}>
                <div className="px-1 py-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-400 text-right pr-2">
                  All day
                </div>
                {days.map((d) => (
                  <div key={ymd(d)} className="p-1 border-l border-ink-100 dark:border-ink-700 space-y-1">
                    {(byDay[ymd(d)] ?? []).filter((e) => e.startMin == null)
                      .map((e) => <EventBlock key={e.key} e={e} dense />)}
                  </div>
                ))}
              </div>
            )}

            {/* Time grid */}
            <div className="relative grid" style={{ gridTemplateColumns: '56px repeat(7, minmax(0,1fr))' }}>
              {/* Hour labels */}
              <div>
                {hours.slice(0, -1).map((m) => (
                  <div key={m} style={{ height: HOUR_PX }}
                       className="text-[10px] text-ink-400 tabular-nums text-right pr-2 -translate-y-1.5">
                    {String(Math.floor(m / 60)).padStart(2, '0')}:00
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {days.map((d) => {
                const key     = ymd(d)
                const timed   = (byDay[key] ?? []).filter((e) => e.startMin != null)
                const isToday = key === todayKey
                return (
                  <div key={key}
                       className={`relative border-l border-ink-100 dark:border-ink-700 ${isToday ? 'bg-brand/[0.03]' : ''}`}>
                    {/* Empty hour slots — the grid itself */}
                    {hours.slice(0, -1).map((m) => (
                      <div key={m} style={{ height: HOUR_PX }}
                           className="border-b border-ink-100/70 dark:border-ink-700/50" />
                    ))}

                    {/* Positioned events */}
                    {timed.map((e) => {
                      const s = Math.max(e.startMin as number, gridFrom)
                      const eMin = Math.min(e.endMin ?? (s + 60), gridTo)
                      const top    = ((s - gridFrom) / 60) * HOUR_PX
                      const height = Math.max(((eMin - s) / 60) * HOUR_PX - 2, 20)
                      return (
                        <EventBlock
                          key={e.key}
                          e={e}
                          style={{ position: 'absolute', top, height, left: 3, right: 3 }}
                        />
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
