import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Loader2, Search, Users, ClipboardCheck, GraduationCap,
  CalendarRange, MapPin, Clock, Download, Pencil, Save,
} from 'lucide-react'
import { teacherService, type TeacherClassStudent } from '@/services/teacherService'
// The very same date-strip + roster editor the /attendance page uses, so a
// lecturer records attendance in place instead of being sent off to re-pick the
// module they already have open.
import { RecordTab, DateStrip, mostRecentAllowedDate } from '@/pages/AttendancePage'
import { attendanceService } from '@/services/attendanceService'
// The real CUR mark sheet, embedded so marks are entered without leaving the course.
import { MarksEditor } from '@/pages/modules/ModulesMarksPage'

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

type TabKey = 'students' | 'attendance' | 'marks'

const TABS: Array<{ key: TabKey; label: string; icon: typeof Users }> = [
  { key: 'students',   label: 'Students',   icon: Users },
  { key: 'attendance', label: 'Attendance', icon: ClipboardCheck },
  { key: 'marks',      label: 'Marks',      icon: GraduationCap },
]

function pct(n: number | null | undefined): string {
  return n == null ? '—' : `${n}%`
}
function hhmm(t?: string | null): string {
  return t ? t.slice(0, 5) : ''
}
function niceDate(d?: string | null): string {
  if (!d) return '—'
  const dt = new Date(`${d}T00:00:00`)
  return Number.isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Shared table chrome so all three tabs line up visually. */
function TableShell({
  head, colSpan, isLoading, isError, isEmpty, emptyText, children,
}: {
  head: string[]
  colSpan: number
  isLoading: boolean
  isError: boolean
  isEmpty: boolean
  emptyText: string
  children: React.ReactNode
}) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="bg-ink-50 dark:bg-ink-800/50 border-b border-ink-100 dark:border-ink-700">
            {head.map((h) => (
              <th key={h}
                  className="px-4 py-2.5 font-bold text-ink-400 uppercase tracking-wider text-[10px] whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
          {isLoading ? (
            <tr><td colSpan={colSpan} className="p-10 text-center">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" />
            </td></tr>
          ) : isError ? (
            <tr><td colSpan={colSpan} className="p-10 text-center text-rose-500">Failed to load.</td></tr>
          ) : isEmpty ? (
            <tr><td colSpan={colSpan} className="p-10 text-center text-ink-400">{emptyText}</td></tr>
          ) : children}
        </tbody>
      </table>
    </div>
  )
}

export default function TeacherCourseDetailPage() {
  const { moduleId } = useParams<{ moduleId: string }>()
  const id = Number(moduleId)
  const qc = useQueryClient()

  // Tab lives in the URL so a refresh keeps it, but is written with replace so
  // the browser Back button returns to the course list rather than stepping
  // back through every tab the lecturer looked at.
  const [sp, setSp] = useSearchParams()
  const tab = (sp.get('tab') as TabKey) || 'students'
  const setTab = (t: TabKey) => {
    const next = new URLSearchParams(sp)
    next.set('tab', t)
    setSp(next, { replace: true })
  }

  const [search, setSearch] = useState('')
  /** Attendance tab: false = review the history, true = the editable roster. */
  const [recording, setRecording] = useState(false)
  /** Marks tab: false = read-only summary, true = the editable mark sheet. */
  const [editingMarks, setEditingMarks] = useState(false)

  /** Save handles published by the embedded editors, so the single header
   *  button can save without either editor showing its own Save. */
  type EditorBridge = { save: () => void; saving: boolean; canSave: boolean } | null
  const [attBridge, setAttBridge]     = useState<EditorBridge>(null)
  const [marksBridge, setMarksBridge] = useState<EditorBridge>(null)

  const courseQ = useQuery({
    queryKey: ['teacher', 'course', id],
    queryFn:  ({ signal }) => teacherService.courseDetail(id, signal),
    enabled:  id > 0,
  })
  const c = courseQ.data?.data

  const listQ = useQuery({
    queryKey: ['teacher', 'classList', id, c?.term_id],
    queryFn:  ({ signal }) => teacherService.classList(id, c?.term_id, signal),
    enabled:  id > 0 && !!c && (tab === 'students' || tab === 'marks'),
  })

  const attQ = useQuery({
    queryKey: ['teacher', 'courseAttendance', id, c?.term_id],
    queryFn:  ({ signal }) => teacherService.courseAttendance(id, c?.term_id, signal),
    enabled:  id > 0 && !!c && tab === 'attendance',
  })

  const recordingRoster = tab === 'attendance' && recording
  const editingSheet    = tab === 'marks' && editingMarks

  // ── Attendance date state ───────────────────────────────────────────────
  // Owned here rather than inside RecordTab so the date strip can stay on
  // screen in review mode too; RecordTab takes it as `initialDate` and has its
  // own strip suppressed.
  const allowedDows = useMemo<Set<number> | null>(() => {
    const dows = (c?.schedules ?? [])
      .map((b) => b.day_of_week)
      .filter((d): d is number => !!d && d >= 1 && d <= 7)
    return dows.length ? new Set(dows) : null
  }, [c?.schedules])

  const [sessionDate, setSessionDate] = useState<string | null>(null)
  useEffect(() => {
    if (!c || sessionDate) return
    setSessionDate(mostRecentAllowedDate(allowedDows, c.start_date, c.end_date))
  }, [c, allowedDows, sessionDate])

  const needle = search.trim().toLowerCase()
  const match = (name: string, reg: string) =>
    !needle || name.toLowerCase().includes(needle) || reg.toLowerCase().includes(needle)

  const students = useMemo(
    () => (listQ.data?.data ?? []).filter((s) => match(s.full_name, s.regnumber)),
    [listQ.data, needle],
  )
  const attStudents = useMemo(
    () => (attQ.data?.data?.students ?? []).filter((s) => match(s.full_name, s.regnumber)),
    [attQ.data, needle],
  )
  // ── What was recorded on the selected day ───────────────────────────────
  // Two hops, both already lecturer-scoped server-side: find the session for
  // (module, date), then load its roster with each student's marked status.
  const findQ = useQuery({
    queryKey: ['teacher', 'findSession', id, sessionDate],
    queryFn:  () => attendanceService.findSession({
      module_id: id, session_date: sessionDate as string, session_type: 'lecture',
    }),
    enabled: id > 0 && !!sessionDate && tab === 'attendance' && !recording,
  })
  const daySession = findQ.data?.data?.session ?? null

  const dayQ = useQuery({
    queryKey: ['teacher', 'session', daySession?.id],
    queryFn:  () => attendanceService.showSession(daySession!.id),
    enabled:  !!daySession?.id,
  })

  const dayRoster = useMemo(
    () => (dayQ.data?.data?.roster ?? []).filter((r) =>
      match(`${r.fname ?? ''} ${r.lname ?? ''}`.trim(), r.regnumber)),
    [dayQ.data, needle],
  )

  const dayLoading = findQ.isLoading || (!!daySession && dayQ.isLoading)

  /** Counts for the selected day, or null when nothing was recorded. */
  const dayCounts = useMemo(() => {
    const rows = dayQ.data?.data?.roster ?? []
    if (!daySession || rows.length === 0) return null
    const c = { present: 0, absent: 0, late: 0, excused: 0 }
    rows.forEach((r) => { if (r.record_status) c[r.record_status] += 1 })
    return c
  }, [dayQ.data, daySession])

  /** CSV of whichever tab is open. */
  const exportCsv = () => {
    let head: string[] = []
    let body: (string | number)[][] = []
    if (tab === 'attendance') {
      head = ['Reg number', 'Student', 'Present', 'Absent', 'Late', 'Excused', 'Marked', 'Rate %']
      body = attStudents.map((s) => [s.regnumber, s.full_name, s.present, s.absent, s.late, s.excused, s.marked, s.rate ?? ''])
    } else if (tab === 'marks') {
      head = ['Reg number', 'Student', 'Total', 'Percentage', 'Grade', 'Decision', 'Status']
      body = students.map((s: TeacherClassStudent) => [
        s.regnumber, s.full_name, s.total ?? '', s.percentage ?? '', s.grade ?? '', s.decision ?? '', s.marks_status ?? '',
      ])
    } else {
      head = ['Reg number', 'Student', 'Gender', 'Level', 'Email', 'Phone', 'Attendance %']
      body = students.map((s: TeacherClassStudent) => [
        s.regnumber, s.full_name, s.gender ?? '', s.level ?? '', s.email ?? '', s.phone ?? '', s.attendance_rate ?? '',
      ])
    }
    const csv = [head, ...body]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${c?.module_code ?? 'course'}-${tab}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (courseQ.isLoading) {
    return <div className="p-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" /></div>
  }
  if (courseQ.isError || !c) {
    return (
      <div className="card p-10 text-center">
        <p className="text-sm text-rose-500">
          {(courseQ.error as any)?.response?.data?.message ?? 'Could not load this course.'}
        </p>
        <Link to="/teacher/courses" className="btn-ghost btn-sm mt-3 inline-flex">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to my courses
        </Link>
      </div>
    )
  }

  const block = c.schedules[0]

  /**
   * The single header action. One button, four states:
   *   Students   → nothing (there is nothing to record on that tab)
   *   Attendance → "Record attendance"  →  "Save attendance"
   *   Marks      → "Enter marks"        →  "Save marks"
   * While editing it calls the embedded editor's own save through the bridge,
   * then leaves edit mode and refreshes the summaries.
   */
  const afterSave = (keys: (string | number)[][]) => {
    keys.forEach((k) => qc.invalidateQueries({ queryKey: k }))
  }

  let primaryAction: React.ReactNode = null

  if (tab === 'attendance') {
    primaryAction = recording ? (
      <button
        className="btn-primary btn-sm"
        disabled={attBridge?.saving}
        onClick={() => {
          attBridge?.save()
          setRecording(false)
          afterSave([
            ['teacher', 'courseAttendance', id],
            ['teacher', 'course', id],
            ['teacher', 'findSession', id],
            ['teacher', 'session'],
          ])
        }}
      >
        {attBridge?.saving
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <Save className="w-3.5 h-3.5" />}
        Save attendance
      </button>
    ) : (
      <button className="btn-primary btn-sm" onClick={() => setRecording(true)}>
        <Pencil className="w-3.5 h-3.5" /> Record attendance
      </button>
    )
  } else if (tab === 'marks') {
    primaryAction = editingMarks ? (
      <button
        className="btn-primary btn-sm"
        disabled={marksBridge?.saving}
        onClick={() => {
          marksBridge?.save()
          setEditingMarks(false)
          afterSave([
            ['teacher', 'classList', id],
            ['teacher', 'course', id],
          ])
        }}
      >
        {marksBridge?.saving
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <Save className="w-3.5 h-3.5" />}
        Save marks
      </button>
    ) : (
      <button className="btn-primary btn-sm" onClick={() => setEditingMarks(true)}>
        <GraduationCap className="w-3.5 h-3.5" /> Enter marks
      </button>
    )
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* ══ Sticky header — identical across all three tabs ══════════════════
          <main> (MainLayout.tsx) is the scroll container and carries
          `px-5 sm:px-6 lg:px-8 py-6`. Two consequences to cancel out:

          1. Horizontally, the negative margins + matching padding let the
             header's background span the full width, so rows scrolling under it
             are not visible in the side gutters.
          2. Vertically, `top-0` pins to the scrollport's CONTENT box, i.e. 24px
             (py-6) below the container's top edge — leaving a strip in which
             table rows scroll past ABOVE the header. Pinning at `-top-6`
             instead moves the pin up by exactly that padding, and the matching
             `pt-6` means nothing but background sits in the reclaimed strip.
             `-mt-6` keeps it flush with the top before any scrolling. */}
      <div className="sticky -top-6 z-30 -mx-5 sm:-mx-6 lg:-mx-8 -mt-6 px-5 sm:px-6 lg:px-8 pt-6
                      bg-[rgb(var(--bg-app))] border-b border-ink-100 dark:border-ink-700">
        <Link
          to="/teacher/courses"
          className="text-[11px] text-brand hover:underline inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" /> My courses
        </Link>

        <div className="flex items-start justify-between gap-4 flex-wrap mt-1">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold text-brand tracking-widest">{c.module_code}</span>
              <span className={STATUS_CHIP[c.status] ?? 'chip-soft'}>
                {STATUS_LABEL[c.status] ?? c.status}
              </span>
              {c.module_credits != null && <span className="chip-soft">{c.module_credits} cr</span>}
              {c.level != null && <span className="chip-soft">Level {c.level}</span>}
            </div>
            <h2 className="text-[17px] font-bold text-ink-900 dark:text-white leading-tight mt-0.5">
              {c.module_name}
            </h2>
            <p className="text-[12px] text-ink-500 flex items-center gap-2.5 flex-wrap mt-0.5">
              <span className="flex items-center gap-1">
                <CalendarRange className="w-3 h-3" />
                {niceDate(c.start_date)} → {niceDate(c.end_date)}
              </span>
              {block && (
                <span className="flex items-center gap-1 tabular-nums">
                  <Clock className="w-3 h-3" />
                  {block.day_of_week ? `${DAY_ABBR[block.day_of_week]} ` : ''}
                  {hhmm(block.start_time)}–{hhmm(block.end_time)}
                  {c.schedules.length > 1 && ` +${c.schedules.length - 1}`}
                </span>
              )}
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />{c.rooms || 'No room'}
              </span>
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />{c.students} student(s)
              </span>
              {c.term_label && <span className="chip-soft">{c.term_label}</span>}
            </p>
          </div>

          {/* ONE action button, driven entirely by the active tab. While an
              editor is open it becomes that editor's Save — the embedded
              editors publish a save handle rather than showing their own. */}
          <div className="shrink-0">{primaryAction}</div>
        </div>

        {/* Tabs + search share the last header row, so both stay reachable
            while the table scrolls underneath. */}
        <div className="flex items-end justify-between gap-3 mt-2 -mb-px flex-wrap">
          <div className="flex gap-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 text-[13px] font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                  tab === t.key
                    ? 'border-brand text-brand'
                    : 'border-transparent text-ink-500 hover:text-ink-800 dark:hover:text-ink-200'
                }`}
              >
                <t.icon className="w-3.5 h-3.5" />{t.label}
              </button>
            ))}
          </div>

          {/* The one search box on the page. While the roster editor is open it
              drives that roster too (its own input is hidden), so there is never
              more than one place to type. */}
          <div className="flex items-center gap-2 pb-1.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                className="input input-sm pl-8 w-52"
                placeholder="Search students…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {!recordingRoster && !editingSheet && (
              <button className="btn-ghost btn-sm" onClick={exportCsv} title="Export the open tab as CSV">
                <Download className="w-3.5 h-3.5" /> Export
              </button>
            )}
          </div>
        </div>

        {/* The date strip belongs to the header too, so the roster/table below
            scrolls beneath it rather than pushing it off screen. */}
        {tab === 'attendance' && sessionDate && (
          <div className="pb-2.5 pt-2">
            <DateStrip
              moduleId={c.module_id}
              selected={sessionDate}
              onSelect={setSessionDate}
              // Every past day inside the teaching window is selectable, in both
              // review and record mode: sessions get held off the usual timetable
              // (make-ups, moved lectures) and must still be reachable and
              // recordable. Future days remain blocked by DateStrip itself.
              allowedDows={null}
              scopeStartDate={c.start_date}
              scopeEndDate={c.end_date}
            />
          </div>
        )}
      </div>

      {/* ══ Students ══════════════════════════════════════════════════════ */}
      {tab === 'students' && (
        <TableShell
          head={['Reg number', 'Student', 'Level', 'Contact', 'Attendance']}
          colSpan={5}
          isLoading={listQ.isLoading}
          isError={listQ.isError}
          isEmpty={students.length === 0}
          emptyText={search ? 'No student matches that search.' : 'No students registered for this course.'}
        >
          {students.map((s) => (
            <tr key={s.regnumber} className="hover:bg-ink-50/50 dark:hover:bg-ink-700/20">
              <td className="px-4 py-2.5 font-mono text-[12px]">{s.regnumber}</td>
              <td className="px-4 py-2.5">
                <span className="font-medium text-ink-900 dark:text-white">{s.full_name}</span>
                {s.gender && <span className="text-ink-400 text-[11px] ml-1.5">({s.gender})</span>}
              </td>
              <td className="px-4 py-2.5">{s.level ?? '—'}</td>
              <td className="px-4 py-2.5 text-[12px] text-ink-500">
                <div className="truncate max-w-[220px]">{s.email ?? '—'}</div>
                <div className="text-ink-400">{s.phone ?? ''}</div>
              </td>
              <td className="px-4 py-2.5 tabular-nums">{pct(s.attendance_rate)}</td>
            </tr>
          ))}
        </TableShell>
      )}

      {/* ══ Attendance ════════════════════════════════════════════════════
          Recording happens right here: the same DateStrip + roster editor as
          /attendance, pre-scoped to this course, so there is no second page to
          visit and no module to re-pick. */}
      {tab === 'attendance' && (
        <div className="space-y-4">
          {recording ? (
            <>
              <RecordTab
                termId={c.term_id}
                pickedModule={{
                  module_id:   c.module_id,
                  module_code: c.module_code,
                  module_name: c.module_name,
                  level:       c.level ?? 0,
                  academic_term_id: c.term_id,
                }}
                initialSessionType="lecture"
                initialDate={sessionDate}
                showDateStrip={false}
                externalFilter={search}
                compact
                onBridge={setAttBridge}
                // No day-pattern restriction: any day inside the teaching window
                // can be recorded, matching what the strip above allows.
                scopeDayPattern={null}
                scopeStartDate={c.start_date}
                scopeEndDate={c.end_date}
              />
            </>
          ) : (
            <>
              {/* What was recorded on the day picked in the strip above. */}
              <div>
                <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                  <h3 className="text-[13px] font-bold text-ink-900 dark:text-white">
                    {sessionDate ? niceDate(sessionDate) : 'Select a date'}
                    {dayCounts && (
                      <span className="ml-2 font-normal text-[12px] tabular-nums">
                        <span className="text-emerald-600 dark:text-emerald-400">{dayCounts.present} present</span>
                        {' · '}
                        <span className="text-rose-500">{dayCounts.absent} absent</span>
                        {' · '}
                        <span className="text-amber-500">{dayCounts.late} late</span>
                        {' · '}
                        <span className="text-ink-400">{dayCounts.excused} excused</span>
                      </span>
                    )}
                  </h3>
                </div>

                {dayLoading ? (
                  <div className="card p-10 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" /></div>
                ) : !daySession ? (
                  <p className="text-[12px] text-ink-400 px-1 py-2">
                    Not recorded — pick another date above, or press
                    {' '}<strong className="text-ink-500">Edit attendance</strong>.
                  </p>
                ) : (
                  <TableShell
                    head={['Reg number', 'Student', 'Status', 'Note', 'Term rate']}
                    colSpan={5}
                    isLoading={false}
                    isError={dayQ.isError}
                    isEmpty={dayRoster.length === 0}
                    emptyText={search ? 'No student matches that search.' : 'No students on this roster.'}
                  >
                    {dayRoster.map((r) => {
                      const name = `${r.fname ?? ''} ${r.lname ?? ''}`.trim() || r.regnumber
                      const tone =
                        r.record_status === 'present' ? 'chip-success'
                        : r.record_status === 'absent' ? 'chip-danger'
                        : r.record_status === 'late'   ? 'chip-warning'
                        : r.record_status === 'excused' ? 'chip-soft'
                        : ''
                      const total = Number(r.total_sessions ?? 0)
                      const seen  = Number(r.present_sessions ?? 0)
                      return (
                        <tr key={r.regnumber} className="hover:bg-ink-50/50 dark:hover:bg-ink-700/20">
                          <td className="px-4 py-2.5 font-mono text-[12px]">{r.regnumber}</td>
                          <td className="px-4 py-2.5 font-medium text-ink-900 dark:text-white">{name}</td>
                          <td className="px-4 py-2.5">
                            {r.record_status
                              ? <span className={tone}>{r.record_status}</span>
                              : <span className="text-ink-400 text-[12px] italic">not marked</span>}
                          </td>
                          <td className="px-4 py-2.5 text-[12px] text-ink-500">{r.remarks || '—'}</td>
                          <td className="px-4 py-2.5 text-[12px] tabular-nums text-ink-500">
                            {total > 0 ? `${Math.round((seen / total) * 100)}%` : '—'}
                            <span className="text-ink-400"> ({seen}/{total})</span>
                          </td>
                        </tr>
                      )
                    })}
                  </TableShell>
                )}
              </div>

              {/* Per-student tally */}
              <div>
                <h3 className="text-[13px] font-bold text-ink-900 dark:text-white mb-2">Per student</h3>
                <TableShell
              head={['Reg number', 'Student', 'Present', 'Absent', 'Late', 'Excused', 'Rate']}
              colSpan={7}
              isLoading={attQ.isLoading}
              isError={attQ.isError}
              isEmpty={attStudents.length === 0}
              emptyText={search ? 'No student matches that search.' : 'No students registered for this course.'}
            >
              {attStudents.map((s) => (
                <tr key={s.regnumber} className="hover:bg-ink-50/50 dark:hover:bg-ink-700/20">
                  <td className="px-4 py-2.5 font-mono text-[12px]">{s.regnumber}</td>
                  <td className="px-4 py-2.5 font-medium text-ink-900 dark:text-white">{s.full_name}</td>
                  <td className="px-4 py-2.5 tabular-nums text-emerald-600 dark:text-emerald-400">{s.present}</td>
                  <td className="px-4 py-2.5 tabular-nums text-rose-500">{s.absent}</td>
                  <td className="px-4 py-2.5 tabular-nums text-amber-500">{s.late}</td>
                  <td className="px-4 py-2.5 tabular-nums text-ink-400">{s.excused}</td>
                  <td className="px-4 py-2.5">
                    {s.rate == null ? (
                      <span className="text-ink-400">—</span>
                    ) : (
                      <div className="flex items-center gap-2 min-w-[90px]">
                        <div className="h-1.5 rounded-full bg-ink-100 dark:bg-ink-700 overflow-hidden flex-1">
                          <div
                            className={`h-full rounded-full ${s.rate >= 75 ? 'bg-emerald-500' : s.rate >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                            style={{ width: `${s.rate}%` }}
                          />
                        </div>
                        <span className="text-[11px] tabular-nums shrink-0">{s.rate}%</span>
                      </div>
                    )}
                  </td>
                    </tr>
                  ))}
                </TableShell>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══ Marks ═════════════════════════════════════════════════════════
          Same pattern as Attendance: the real mark sheet is edited in place
          rather than on /modules/marks, so the lecturer never leaves the
          course they already have open. */}
      {tab === 'marks' && editingMarks && (
        <MarksEditor
          moduleId={c.module_id}
          termId={c.term_id}
          terms={c.term_label ? [{ id: c.term_id, label: c.term_label }] : []}
          setTermId={() => { /* term is fixed by the course */ }}
          onBackToSchedules={() => setEditingMarks(false)}
          embedded
          onBridge={setMarksBridge}
        />
      )}

      {tab === 'marks' && !editingMarks && (
        <TableShell
          head={['Reg number', 'Student', 'Total', '%', 'Grade', 'Decision', 'Status']}
          colSpan={7}
          isLoading={listQ.isLoading}
          isError={listQ.isError}
          isEmpty={students.length === 0}
          emptyText={search ? 'No student matches that search.' : 'No students registered for this course.'}
        >
          {students.map((s) => (
            <tr key={s.regnumber} className="hover:bg-ink-50/50 dark:hover:bg-ink-700/20">
              <td className="px-4 py-2.5 font-mono text-[12px]">{s.regnumber}</td>
              <td className="px-4 py-2.5 font-medium text-ink-900 dark:text-white">{s.full_name}</td>
              <td className="px-4 py-2.5 tabular-nums">{s.total ?? <span className="text-ink-400">—</span>}</td>
              <td className="px-4 py-2.5 tabular-nums">{s.percentage != null ? `${s.percentage}%` : <span className="text-ink-400">—</span>}</td>
              <td className="px-4 py-2.5">
                {s.grade ? <span className="chip-soft">{s.grade}</span> : <span className="text-ink-400">—</span>}
              </td>
              <td className="px-4 py-2.5">
                {s.decision
                  ? <span className={s.decision.toUpperCase().startsWith('P') ? 'chip-success' : 'chip-danger'}>{s.decision}</span>
                  : <span className="text-ink-400">—</span>}
              </td>
              <td className="px-4 py-2.5 text-[12px] text-ink-500 capitalize">{s.marks_status ?? '—'}</td>
            </tr>
          ))}
        </TableShell>
      )}

      <p className="text-[12px] text-ink-400">
        {tab === 'attendance' ? attStudents.length : students.length} student(s) shown
      </p>
    </div>
  )
}
