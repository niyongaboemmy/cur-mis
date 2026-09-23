import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Loader2, Search, Users, ClipboardCheck, GraduationCap,
  CalendarRange, MapPin, Clock, Download, Pencil, Save, UserPlus, Check,
  Trash2, AlertTriangle, UserMinus,
} from 'lucide-react'
import { teacherService, type TeacherClassStudent } from '@/services/teacherService'
import { useAuthStore } from '@/store/authStore'
import Modal from '@/components/ui/Modal'
// The very same date-strip + roster editor the /attendance page uses, so a
// lecturer records attendance in place instead of being sent off to re-pick the
// module they already have open.
import { RecordTab, DateStrip, mostRecentAllowedDate } from '@/pages/AttendancePage'
import { attendanceService } from '@/services/attendanceService'
import { studentService } from '@/services/studentService'
import { useLevels } from '@/hooks/useLevels'
import toast from 'react-hot-toast'
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

type TabKey = 'students' | 'enroll' | 'attendance' | 'marks'

const TABS: Array<{ key: TabKey; label: string; icon: typeof Users }> = [
  { key: 'students',   label: 'Students',   icon: Users },
  { key: 'enroll',     label: 'Enroll',     icon: UserPlus },
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

/* ══════════════════════════════════════════════════════════════════════════
 * Removing an enrolled student
 * ═══════════════════════════════════════════════════════════════════════ */

/** One line in the "what gets deleted" list. */
function ImpactRow({ label, n, muted }: { label: string; n: number; muted?: boolean }) {
  return (
    <li className={`flex items-center justify-between gap-4 py-1 ${muted ? 'opacity-45' : ''}`}>
      <span className="text-[12.5px] text-ink-600 dark:text-ink-300">{label}</span>
      <span className={`text-[12.5px] font-semibold tabular-nums ${
        n > 0 && !muted ? 'text-red-600 dark:text-red-400' : 'text-ink-400'
      }`}>
        {n}
      </span>
    </li>
  )
}

/**
 * Confirm removing one student from this course.
 *
 * The counts are fetched rather than guessed: a warning that names the exact
 * number of marks and attendance records about to be destroyed is the whole
 * point of the dialog, and "this cannot be undone" on its own tells a
 * superadmin nothing about what they are about to lose.
 */
function RemoveStudentDialog({
  moduleId, moduleCode, termId, student, onClose, onDone,
}: {
  moduleId:   number
  moduleCode: string
  termId?:    number
  student:    TeacherClassStudent
  onClose:    () => void
  onDone:     () => void
}) {
  const impactQ = useQuery({
    queryKey: ['teacher', 'removalImpact', moduleId, student.regnumber, termId],
    queryFn:  ({ signal }) => teacherService.removalImpact(moduleId, student.regnumber, termId, signal),
  })
  const impact = impactQ.data?.data

  /* Checked by default: the request is "remove this student", and a removal
     that leaves the marks behind is exactly what makes them keep appearing in
     the deliberation grid with a grade. Unticking downgrades to a soft drop. */
  const [purge, setPurge]       = useState(true)
  const [allTerms, setAllTerms] = useState(false)

  const canPurge   = !!impact?.can_purge
  const willPurge  = purge && canPurge
  const otherMarks = impact?.other_terms_marks ?? 0

  const remove = useMutation({
    mutationFn: () => teacherService.unenrolStudent(moduleId, student.regnumber, {
      purge:           willPurge,
      purgeOtherTerms: willPurge && allTerms,
      termId,
    }),
    onSuccess: (r: any) => {
      toast.success(r?.message ?? 'Student removed.')
      onDone()
      onClose()
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not remove the student.'),
  })

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      static={remove.isPending}
      footer={
        <>
          <button className="btn-secondary btn-sm" onClick={onClose} disabled={remove.isPending}>
            Cancel
          </button>
          <button
            className="btn-danger btn-sm"
            onClick={() => remove.mutate()}
            disabled={remove.isPending || impactQ.isLoading}
          >
            {remove.isPending
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Trash2 className="w-3.5 h-3.5" />}
            {willPurge ? 'Remove and delete records' : 'Remove from course'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-3">
          <div className="shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/25 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-ink-900 dark:text-white">
              Remove {impact?.full_name ?? student.full_name}?
            </h3>
            <p className="text-[12.5px] text-ink-500 mt-0.5">
              <span className="font-mono">{student.regnumber}</span> will be taken off{' '}
              <strong className="text-ink-700 dark:text-ink-200">{moduleCode}</strong>.
            </p>
          </div>
        </div>

        {impactQ.isLoading ? (
          <div className="p-6 text-center">
            <Loader2 className="w-5 h-5 animate-spin mx-auto text-brand" />
          </div>
        ) : impactQ.isError ? (
          <p className="text-[13px] text-rose-500">
            Could not check what this would delete. Try again before removing.
          </p>
        ) : impact && (
          <>
            <label className="flex items-start gap-3 p-3 rounded-lg border border-ink-100 dark:border-ink-700
                              cursor-pointer hover:bg-ink-50 dark:hover:bg-ink-700/30 transition-colors">
              <input
                type="checkbox"
                className="mt-0.5 rounded border-ink-300 text-brand focus:ring-brand/30"
                checked={willPurge}
                disabled={!canPurge}
                onChange={(e) => setPurge(e.target.checked)}
              />
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-ink-900 dark:text-white">
                  Also delete their marks and attendance
                </span>
                <span className="block text-[12px] text-ink-500 mt-0.5">
                  {canPurge
                    ? 'Permanently deletes the records below. This cannot be undone.'
                    : 'Only a superadmin can delete records. They will be kept and the student marked dropped.'}
                </span>
              </span>
            </label>

            <div className="rounded-lg bg-ink-50 dark:bg-ink-900/40 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400 mb-1">
                {willPurge ? 'Will be deleted' : 'Will be kept'}
              </p>
              <ul className="divide-y divide-ink-100 dark:divide-ink-700/60">
                <ImpactRow label="Marks"                  n={impact.marks}              muted={!willPurge} />
                <ImpactRow label="Attendance records"     n={impact.attendance_records} muted={!willPurge} />
                <ImpactRow label="Exam attendance"        n={impact.exam_attendance}    muted={!willPurge} />
                {impact.revaluations > 0 && (
                  <ImpactRow label="Revaluation requests" n={impact.revaluations}       muted={!willPurge} />
                )}
              </ul>
            </div>

            {/* A mark recorded in another term survives a term-scoped removal,
                and the deliberation grid reads marks directly — so the student
                would come back with a grade. Surface it instead of guessing. */}
            {willPurge && otherMarks > 0 && (
              <label className="flex items-start gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50
                                dark:border-amber-500/30 dark:bg-amber-500/10 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 rounded border-amber-400 text-amber-600 focus:ring-amber-400/30"
                  checked={allTerms}
                  onChange={(e) => setAllTerms(e.target.checked)}
                />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-amber-900 dark:text-amber-200">
                    Also remove {otherMarks} mark{otherMarks === 1 ? '' : 's'} recorded in other terms
                  </span>
                  <span className="block text-[12px] text-amber-800/80 dark:text-amber-300/80 mt-0.5">
                    {impact.other_terms
                      .map((t) => `${t.term_label ?? `Term ${t.term_id ?? '—'}`}${t.grade ? ` · ${t.grade}` : ''}${t.locked ? ' · confirmed' : ''}`)
                      .join(', ')}
                    . Left in place, these keep the student showing in deliberation with a grade.
                  </span>
                </span>
              </label>
            )}

            {impact.registration_status === 'completed' && (
              <p className="text-[12px] text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                This registration is marked <strong>completed</strong> — the student has already
                finished the module.
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
 * Enroll tab — search the student directory and add students to this course
 * ═══════════════════════════════════════════════════════════════════════ */

function EnrollPanel({
  moduleId, moduleCode, termId, students, search, onDone,
}: {
  moduleId:   number
  moduleCode: string
  termId?:    number
  /** The current class list — already on the course, so not re-addable. */
  students:   TeacherClassStudent[]
  search:     string
  onDone:     () => void
}) {
  const { levelName } = useLevels()
  const [picked, setPicked] = useState<Set<string>>(new Set())
  /** Which student the removal dialog is open for, if any. */
  const [removing, setRemoving] = useState<TeacherClassStudent | null>(null)

  /* Deleting a student's marks and attendance is destructive and institution-
     wide in effect, so the entry point is superadmin-only — matching the server,
     which refuses `purge` for anyone else. */
  const isSuperadmin = useAuthStore((s) => s.user)?.role === 'superadmin'

  const enrolled = useMemo(
    () => new Set(students.map((s) => s.regnumber)),
    [students],
  )

  /* The header search box drives both halves of this tab: it filters the class
     list below and searches the directory above. */
  const enrolledShown = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return students
    return students.filter((s) =>
      s.full_name.toLowerCase().includes(needle) ||
      s.regnumber.toLowerCase().includes(needle))
  }, [students, search])

  // The directory holds 13k students, so require a search before listing —
  // an arbitrary first page would be meaningless to the lecturer.
  const needle = search.trim()
  const q = useQuery({
    queryKey: ['teacher', 'enrollSearch', needle],
    queryFn:  ({ signal }) => studentService.list({ q: needle, per_page: 50 }, signal),
    enabled:  needle.length >= 2,
  })

  const rows = useMemo(() => {
    const d: any = q.data?.data
    return (Array.isArray(d) ? d : d?.data ?? []) as Array<Record<string, any>>
  }, [q.data])

  const enrol = useMutation({
    mutationFn: () => teacherService.enrolStudents(moduleId, [...picked]),
    onSuccess: (r: any) => {
      toast.success(r?.message ?? 'Students enrolled.')
      setPicked(new Set())
      onDone()
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not enrol.'),
  })

  const toggle = (reg: string) =>
    setPicked((p) => {
      const next = new Set(p)
      if (next.has(reg)) next.delete(reg); else next.add(reg)
      return next
    })

  return (
    <div className="space-y-5">
      {/* ── Already on the course ─────────────────────────────────────────
          Listed here, not only on the Students tab, because removing someone
          is an enrolment action and this is the enrolment tab. */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-[13px] font-semibold text-ink-900 dark:text-white flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-ink-400" />
            Enrolled
            <span className="chip-soft">{students.length}</span>
          </h3>
          {!isSuperadmin && students.length > 0 && (
            <p className="text-[11.5px] text-ink-400">
              Only a superadmin can remove an enrolled student.
            </p>
          )}
        </div>

        <TableShell
          head={isSuperadmin ? ['Reg number', 'Student', 'Level', ''] : ['Reg number', 'Student', 'Level']}
          colSpan={isSuperadmin ? 4 : 3}
          isLoading={false}
          isError={false}
          isEmpty={enrolledShown.length === 0}
          emptyText={
            students.length === 0
              ? 'Nobody is enrolled on this course yet — search below to add students.'
              : 'No enrolled student matches that search.'
          }
        >
          {enrolledShown.map((s) => (
            <tr key={s.regnumber} className="hover:bg-ink-50/50 dark:hover:bg-ink-700/20">
              <td className="px-4 py-2 font-mono text-[12px]">{s.regnumber}</td>
              <td className="px-4 py-2 font-medium text-ink-900 dark:text-white">{s.full_name}</td>
              <td className="px-4 py-2">{s.level_name ?? levelName(s.level)}</td>
              {isSuperadmin && (
                <td className="px-4 py-2 text-right">
                  <button
                    className="btn-ghost btn-sm text-red-600 hover:bg-red-50 hover:text-red-700
                               dark:text-red-400 dark:hover:bg-red-500/10"
                    onClick={() => setRemoving(s)}
                  >
                    <UserMinus className="w-3.5 h-3.5" /> Remove
                  </button>
                </td>
              )}
            </tr>
          ))}
        </TableShell>
      </div>

      {/* ── Add more ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap pt-1 border-t border-ink-100 dark:border-ink-700">
        <p className="text-[12px] text-ink-500 pt-3">
          Search the student directory in the header, tick students, then add them to{' '}
          <strong className="text-ink-700 dark:text-ink-200">{moduleCode}</strong>.
        </p>
        <button
          className="btn-primary btn-sm mt-3"
          disabled={picked.size === 0 || enrol.isPending}
          onClick={() => enrol.mutate()}
        >
          {enrol.isPending
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <UserPlus className="w-3.5 h-3.5" />}
          Enroll{picked.size > 0 ? ` ${picked.size}` : ''}
        </button>
      </div>

      {removing && (
        <RemoveStudentDialog
          /* Keyed on the student so the checkboxes can never carry over from a
             previous one — ticking "delete the records" for A and then opening
             B must not arrive pre-armed. */
          key={removing.regnumber}
          moduleId={moduleId}
          moduleCode={moduleCode}
          termId={termId}
          student={removing}
          onClose={() => setRemoving(null)}
          onDone={onDone}
        />
      )}

      {needle.length < 2 ? (
        <div className="card p-10 text-center">
          <UserPlus className="w-7 h-7 mx-auto text-ink-300 mb-2" />
          <p className="text-[13px] text-ink-500">
            Type at least 2 characters in the search box above to find students.
          </p>
        </div>
      ) : (
        <TableShell
          head={['', 'Reg number', 'Student', 'Level', 'Programme']}
          colSpan={5}
          isLoading={q.isLoading}
          isError={q.isError}
          isEmpty={rows.length === 0}
          emptyText={`No student matches "${needle}".`}
        >
          {rows.map((st) => {
            const reg    = String(st.regnumber ?? '')
            const on     = enrolled.has(reg)
            const chosen = picked.has(reg)
            return (
              <tr
                key={reg}
                onClick={() => { if (!on) toggle(reg) }}
                className={on ? 'opacity-50' : 'cursor-pointer hover:bg-ink-50/60 dark:hover:bg-ink-700/20'}
              >
                <td className="px-4 py-2.5 w-10">
                  {on
                    ? <Check className="w-4 h-4 text-emerald-500" />
                    : <input type="checkbox" checked={chosen} readOnly className="pointer-events-none" />}
                </td>
                <td className="px-4 py-2.5 font-mono text-[12px]">{reg}</td>
                <td className="px-4 py-2.5 font-medium text-ink-900 dark:text-white">
                  {`${st.fname ?? ''} ${st.lname ?? ''}`.trim() || reg}
                  {on && <span className="chip-soft ml-2">Enrolled</span>}
                </td>
                <td className="px-4 py-2.5">{st.current_level ?? '—'}</td>
                <td className="px-4 py-2.5 text-[12px] text-ink-500">{st.program ?? st.std_option ?? '—'}</td>
              </tr>
            )
          })}
        </TableShell>
      )}
    </div>
  )
}

export default function TeacherCourseDetailPage() {
  const { levelName } = useLevels()
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
  type EditorBridge = { save: () => Promise<unknown>; saving: boolean; canSave: boolean } | null
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
    enabled:  id > 0 && !!c && (tab === 'students' || tab === 'marks' || tab === 'enroll'),
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
        s.regnumber, s.full_name, s.gender ?? '', s.level_name ?? levelName(s.level, ''),
        s.email ?? '', s.phone ?? '', s.attendance_rate ?? '',
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
        onClick={async () => {
          // Await the editor's save before invalidating, otherwise the refetch
          // races the in-flight mutation and re-reads the OLD rows.
          try { await attBridge?.save() } catch { /* editor surfaces its own toast */ }
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
        onClick={async () => {
          try { await marksBridge?.save() } catch { /* editor surfaces its own toast */ }
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

          z-index is deliberately 25, not 30: the topbar <header> is
          `relative z-30`, and its campus/category dropdown panels are z-50
          INSIDE that stacking context — so they resolve against 30. A z-30
          page header appears later in the DOM and therefore won the tie,
          clipping those menus. 25 keeps this header above the page content and
          above the embedded roster's own `sticky z-20` bar, while staying
          under the topbar.

          1. Horizontally, the negative margins + matching padding let the
             header's background span the full width, so rows scrolling under it
             are not visible in the side gutters.
          2. Vertically, `top-0` pins to the scrollport's CONTENT box, i.e. 24px
             (py-6) below the container's top edge — leaving a strip in which
             table rows scroll past ABOVE the header. Pinning at `-top-6`
             instead moves the pin up by exactly that padding, and the matching
             `pt-6` means nothing but background sits in the reclaimed strip.
             `-mt-6` keeps it flush with the top before any scrolling. */}
      <div className="sticky -top-6 z-[25] -mx-5 sm:-mx-6 lg:-mx-8 -mt-6 px-5 sm:px-6 lg:px-8 pt-6
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
              {c.level != null && <span className="chip-soft">{c.level_name ?? levelName(c.level)}</span>}
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
          emptyText={search ? 'No student matches that search.' : 'No students registered yet — use the Enroll tab to add them.'}
        >
          {students.map((s) => (
            <tr key={s.regnumber} className="hover:bg-ink-50/50 dark:hover:bg-ink-700/20 group/row">
              <td className="px-4 py-2.5 font-mono text-[12px]">{s.regnumber}</td>
              <td className="px-4 py-2.5">
                <span className="font-medium text-ink-900 dark:text-white">{s.full_name}</span>
                {s.gender && <span className="text-ink-400 text-[11px] ml-1.5">({s.gender})</span>}
              </td>
              <td className="px-4 py-2.5">{s.level_name ?? levelName(s.level)}</td>
              <td className="px-4 py-2.5 text-[12px] text-ink-500">
                <div className="truncate max-w-[220px]">{s.email ?? '—'}</div>
                <div className="text-ink-400">{s.phone ?? ''}</div>
              </td>
              <td className="px-4 py-2.5 tabular-nums">{pct(s.attendance_rate)}</td>
            </tr>
          ))}
        </TableShell>
      )}

      {/* ══ Enroll ════════════════════════════════════════════════════════ */}
      {tab === 'enroll' && (
        <EnrollPanel
          moduleId={id}
          moduleCode={c.module_code}
          termId={c.term_id}
          students={listQ.data?.data ?? []}
          search={search}
          onDone={() => {
            qc.invalidateQueries({ queryKey: ['teacher', 'classList', id] })
            qc.invalidateQueries({ queryKey: ['teacher', 'course', id] })
            qc.invalidateQueries({ queryKey: ['teacher', 'courses'] })
            // A purge deletes attendance rows too, so the Attendance tab's
            // session tallies are stale the moment this returns. Same for the
            // impact preview, which a soft drop leaves cached against a student
            // who is still on the list.
            qc.invalidateQueries({ queryKey: ['teacher', 'courseAttendance', id] })
            qc.invalidateQueries({ queryKey: ['teacher', 'removalImpact', id] })
          }}
        />
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
          emptyText={search ? 'No student matches that search.' : 'No students registered yet — use the Enroll tab to add them.'}
        >
          {students.map((s) => (
            <tr key={s.regnumber} className="hover:bg-ink-50/50 dark:hover:bg-ink-700/20 group/row">
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
