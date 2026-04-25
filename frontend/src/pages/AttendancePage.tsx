import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  ClipboardCheck,
  BarChart3,
  List as ListIcon,
  Search,
  Loader2,
  BookOpen,
  CheckCircle2,
  XCircle,
  Clock,
  FileWarning,
  Trash2,
  Save,
  Users,
  TrendingDown,
  Filter,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Lock,
  Unlock,
  Pencil,
  PlusCircle,
} from 'lucide-react'
import StatCard from '@/components/dashboard/StatCard'
import SearchableSelect from '@/components/ui/SearchableSelect'
import {
  attendanceService,
  type AttendanceStatus,
  type SessionType,
  type RosterRow,
  type SessionListParams,
  type TeachableModule,
} from '@/services/attendanceService'
import { useSystemStore } from '@/store/systemStore'
import { useAuthStore } from '@/store/authStore'
import { PERMISSIONS } from '@/constants'
import type { AcademicTerm } from '@/types/academic'

type Tab = 'overview' | 'record' | 'sessions'

const STATUS_OPTIONS: { key: AttendanceStatus; label: string; tone: string }[] = [
  { key: 'present', label: 'Present', tone: 'bg-emerald-500 text-white' },
  { key: 'late',    label: 'Late',    tone: 'bg-amber-500 text-white'   },
  { key: 'absent',  label: 'Absent',  tone: 'bg-rose-500 text-white'    },
  { key: 'excused', label: 'Excused', tone: 'bg-sky-500 text-white'     },
]

const SESSION_TYPES: SessionType[] = ['lecture', 'lab', 'tutorial', 'seminar', 'exam']

export default function AttendancePage() {
  const [sp, setSp] = useSearchParams()
  const tab = (sp.get('tab') as Tab) || 'overview'
  const setTab = (t: Tab) => { const n = new URLSearchParams(sp); n.set('tab', t); setSp(n, { replace: true }) }

  // Permissions
  const { user } = useAuthStore()
  const perms = user?.permissions ?? []
  const canRecord  = user?.role === 'superadmin'
    || perms.includes(PERMISSIONS.RECORD_ATTENDANCE)
    || perms.includes(PERMISSIONS.MANAGE_ATTENDANCE)
  const canManage  = user?.role === 'superadmin' || perms.includes(PERMISSIONS.MANAGE_ATTENDANCE)

  // Term selector — default to active term
  const basics      = useSystemStore((s) => s.basics)
  const allTerms    = useMemo<AcademicTerm[]>(() => (basics?.terms ?? []), [basics?.terms])
  const activeTerm  = basics?.active_term && typeof basics.active_term === 'object' ? (basics.active_term as AcademicTerm) : null
  const [termId, setTermId] = useState<number>(0)
  useEffect(() => {
    if (termId === 0 && activeTerm?.id) setTermId(activeTerm.id)
  }, [activeTerm?.id, termId])

  // Module — the page-level scope. Until a module is picked, the tabs are
  // hidden and we show a full-width picker card instead.
  const moduleIdParam = Number(sp.get('module_id') || 0)
  const [moduleId, setModuleIdState] = useState<number>(moduleIdParam)
  const setModuleId = (id: number) => {
    setModuleIdState(id)
    const n = new URLSearchParams(sp)
    if (id > 0) n.set('module_id', String(id)); else n.delete('module_id')
    setSp(n, { replace: true })
  }

  const teachableQ = useQuery({
    queryKey: ['attendance-teachable', termId],
    queryFn:  () => attendanceService.teachableModules({ academic_term_id: termId || undefined }),
    staleTime: 60_000,
  })
  const modules = teachableQ.data?.data ?? []
  const pickedModule = modules.find((m) => m.module_id === moduleId)

  // Step 1: no module yet — full-screen picker
  if (!moduleId || !pickedModule) {
    return (
      <div className="max-w-[720px] mx-auto space-y-5">
        <section className="card p-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center">
              <BookOpen className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h2 className="text-[16px] font-semibold text-ink-900 dark:text-white">Pick a module to continue</h2>
              <p className="text-[12.5px] text-ink-500 mt-1">
                Attendance is scoped per module. {canManage
                  ? 'As admin you see every module with at least one teacher assigned.'
                  : "You'll see only the modules you're assigned to."}
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <label className="text-[11px] uppercase tracking-wider text-ink-400">Term</label>
            <select
              value={termId}
              onChange={(e) => setTermId(Number(e.target.value))}
              className="input input-sm bg-white dark:bg-ink-900 cursor-pointer"
            >
              <option value={0}>All terms</option>
              {allTerms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}{activeTerm?.id === t.id ? ' · active' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4">
            <SearchableSelect
              value={moduleId}
              onChange={(v) => setModuleId(Number(v) || 0)}
              placeholder={
                teachableQ.isLoading
                  ? 'Loading modules…'
                  : modules.length === 0
                    ? 'No assigned modules'
                    : 'Search by code or name…'
              }
              options={modules.map((m) => ({
                value: m.module_id,
                label: `${m.module_code} — ${m.module_name}`,
                sub: [m.teacher_first_name, m.teacher_last_name].filter(Boolean).join(' ') || undefined,
              }))}
            />
            {!teachableQ.isLoading && modules.length === 0 && (
              <p className="text-[12px] text-ink-500 mt-2">
                You have no module assignments{termId ? ' in this term' : ''}. Ask an admin to assign modules to you.
              </p>
            )}
          </div>

          {/* Quick-pick list when there's a handful of modules */}
          {modules.length > 0 && modules.length <= 8 && (
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {modules.map((m) => (
                <button
                  key={m.module_id}
                  type="button"
                  onClick={() => setModuleId(m.module_id)}
                  className="text-left p-3 rounded-lg border border-ink-100 dark:border-ink-700 hover:border-brand/40 hover:bg-brand/5 transition-colors"
                >
                  <p className="font-mono text-[12px] font-semibold text-ink-900 dark:text-white">{m.module_code}</p>
                  <p className="text-[12px] text-ink-600 dark:text-ink-300 truncate">{m.module_name}</p>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    )
  }

  // Step 2: module picked — show tabs, each scoped to this module
  return (
    <div className="max-w-[1400px] mx-auto space-y-4">
      {/* Compact header: module · tabs · term · change */}
      <section className="card px-3 py-2 flex items-center gap-3 flex-wrap">
        <BookOpen className="w-4 h-4 text-brand shrink-0" />
        <div className="min-w-0 flex items-baseline gap-2">
          <p className="font-mono text-[12.5px] font-semibold text-ink-900 dark:text-white whitespace-nowrap">{pickedModule.module_code}</p>
          <p className="text-[12px] text-ink-500 truncate max-w-[320px]" title={pickedModule.module_name}>· {pickedModule.module_name}</p>
        </div>

        <div className="flex items-center gap-1 ml-1">
          <TabBtn active={tab === 'overview'} onClick={() => setTab('overview')} icon={BarChart3}      label="Overview" />
          {canRecord && <TabBtn active={tab === 'record'}   onClick={() => setTab('record')}   icon={ClipboardCheck} label="Record" />}
          <TabBtn active={tab === 'sessions'} onClick={() => setTab('sessions')} icon={ListIcon}       label="History" />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <select
            value={termId}
            onChange={(e) => setTermId(Number(e.target.value))}
            className="input input-sm bg-white dark:bg-ink-900 cursor-pointer"
            title="Academic term"
          >
            <option value={0}>All terms</option>
            {allTerms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}{activeTerm?.id === t.id ? ' · active' : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setModuleId(0)}
            className="btn-secondary btn-sm whitespace-nowrap"
            title="Pick a different module"
          >
            Change
          </button>
        </div>
      </section>

      {tab === 'overview'           && <OverviewTab termId={termId} moduleId={moduleId} mineOnly={!canManage && canRecord} />}
      {tab === 'record' && canRecord && <RecordTab   termId={termId} pickedModule={pickedModule} />}
      {tab === 'sessions'           && <SessionsTab termId={termId} moduleId={moduleId} canDelete={canRecord} setTab={setTab} />}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Overview tab
 * ═══════════════════════════════════════════════════════════════════════ */
function OverviewTab({ termId, moduleId, mineOnly }: { termId: number; moduleId: number; mineOnly: boolean }) {
  const q = useQuery({
    queryKey: ['attendance-overview', termId, moduleId, mineOnly ? 1 : 0],
    queryFn:  () => attendanceService.overview({
      academic_term_id: termId || undefined,
      module_id:        moduleId || undefined,
      mine:             mineOnly ? 1 : 0,
    }),
    staleTime: 30_000,
  })
  const data = q.data?.data

  if (q.isLoading) {
    return (
      <section className="card p-10 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-ink-400" />
      </section>
    )
  }
  if (q.isError || !data) {
    return <section className="card p-6 text-center text-ink-500 text-[13px]">Failed to load attendance overview.</section>
  }

  const t = data.totals

  return (
    <div className="space-y-5">
      <section className="card p-6">
        <h2 className="text-[18px] font-semibold text-ink-900 dark:text-white tracking-tight">Attendance overview</h2>
        <p className="text-[12.5px] text-ink-500 mt-1">
          {mineOnly
            ? 'Scoped to sessions you run.'
            : 'Aggregate across every session in the selected term.'}
          {' '}Click a session below to open its roster.
        </p>

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard label="Sessions"         value={fmt(t.sessions)}        icon={ClipboardCheck} tone="sky"   />
          <StatCard label="Avg attendance"   value={`${t.attendance_pct}%`} icon={TrendingDown}   tone="mint"  />
          <StatCard label="Records marked"   value={fmt(t.records)}         icon={Users}          tone="lilac" />
          <StatCard label="Modules covered"  value={fmt(t.modules)}         icon={BookOpen}       tone="peach" />
        </div>

        {/* Status breakdown bar */}
        {t.records > 0 && (
          <div className="mt-5">
            <div className="flex items-center gap-2 text-[12px] text-ink-500 mb-2">
              <Filter className="w-3 h-3" /> Status breakdown
            </div>
            <div className="h-3 rounded-full bg-ink-100 dark:bg-ink-700/50 overflow-hidden flex">
              <Seg v={t.present} tot={t.records} color="#10B981" />
              <Seg v={t.late}    tot={t.records} color="#F59E0B" />
              <Seg v={t.excused} tot={t.records} color="#0EA5E9" />
              <Seg v={t.absent}  tot={t.records} color="#E11D48" />
            </div>
            <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-[12px]">
              <Legend color="#10B981" label="Present" v={t.present} tot={t.records} />
              <Legend color="#F59E0B" label="Late"    v={t.late}    tot={t.records} />
              <Legend color="#0EA5E9" label="Excused" v={t.excused} tot={t.records} />
              <Legend color="#E11D48" label="Absent"  v={t.absent}  tot={t.records} />
            </div>
          </div>
        )}
      </section>

      {/* Module leaderboard */}
      {data.by_module.length > 0 && (
        <section className="card p-6">
          <h3 className="text-[15px] font-semibold text-ink-900 dark:text-white">Attendance by module</h3>
          <p className="text-[12px] text-ink-500 mt-1">Top 10 modules by session volume — lower % means students are missing class.</p>
          <div className="mt-4 space-y-2">
            {data.by_module.map((m) => (
              <div key={m.module_id} className="flex items-center gap-3">
                <div className="w-48 shrink-0 min-w-0">
                  <p className="font-mono text-[11.5px] text-ink-700 dark:text-ink-200 truncate">{m.module_code}</p>
                  <p className="text-[12px] text-ink-500 truncate">{m.module_name}</p>
                </div>
                <div className="flex-1 h-2 rounded-full bg-ink-100 dark:bg-ink-700/40 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{ width: `${m.attendance_pct}%`, backgroundColor: toneForPct(m.attendance_pct) }}
                  />
                </div>
                <span className="w-14 text-right text-[12.5px] font-semibold text-ink-900 dark:text-white tabular-nums">{m.attendance_pct}%</span>
                <span className="w-24 text-right text-[11.5px] text-ink-500 tabular-nums">{fmt(m.sessions)} sess.</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent sessions */}
      {data.recent_sessions.length > 0 && (
        <section className="card p-0 overflow-hidden">
          <div className="px-6 pt-5 pb-3 border-b border-ink-100 dark:border-ink-700">
            <h3 className="text-[15px] font-semibold text-ink-900 dark:text-white">Recent sessions</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Date</th><th>Module</th><th>Type</th><th>Status</th><th className="text-right">Attendance</th></tr></thead>
              <tbody>
                {data.recent_sessions.map((r) => (
                  <tr key={r.id}>
                    <td className="text-[12.5px]">{r.session_date}</td>
                    <td>
                      <p className="font-mono text-[11.5px]">{r.module_code}</p>
                      <p className="text-[11.5px] text-ink-500 truncate">{r.module_name}</p>
                    </td>
                    <td className="text-[12px] capitalize">{r.session_type}</td>
                    <td><span className={`chip-soft ${r.status === 'closed' ? '' : 'text-amber-700'}`}>{r.status}</span></td>
                    <td className="text-right text-[12.5px] tabular-nums">
                      <span className="font-semibold">{r.attendance_pct}%</span>
                      <span className="text-ink-400 ml-2">({fmt(r.recorded_count)})</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* At-risk students */}
      {data.at_risk.length > 0 && (
        <section className="card p-6">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-500" />
            <h3 className="text-[15px] font-semibold text-ink-900 dark:text-white">Students needing attention</h3>
          </div>
          <p className="text-[12px] text-ink-500 mt-1">Lowest attendance percentages in the current scope.</p>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
            {data.at_risk.map((s) => (
              <div key={s.regnumber} className="flex items-center gap-3 p-3 rounded-lg border border-ink-100 dark:border-ink-700">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[13px] text-ink-900 dark:text-white truncate">{s.fname} {s.lname}</p>
                  <p className="font-mono text-[11px] text-ink-500">{s.regnumber}</p>
                </div>
                <span className="text-[13px] font-semibold tabular-nums" style={{ color: toneForPct(s.attendance_pct) }}>
                  {s.attendance_pct}%
                </span>
                <span className="text-[11px] text-ink-400 tabular-nums">{fmt(s.total_records)}×</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {data.totals.sessions === 0 && (
        <section className="card p-10 text-center text-ink-500">
          <ClipboardCheck className="w-10 h-10 mx-auto text-ink-300 mb-3" />
          <p className="text-[14px]">No attendance sessions recorded yet for this term.</p>
        </section>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Record tab — module first, then date navigator; auto-loads the matching
 * session (if any). Saved sessions come back read-only with Edit / Lock.
 * ═══════════════════════════════════════════════════════════════════════ */
function RecordTab({ termId, pickedModule }: { termId: number; pickedModule: TeachableModule }) {
  const qc = useQueryClient()

  const moduleId = pickedModule.module_id
  const [sessionDate, setSessionDate] = useState<string>(todayISO)
  const [sessionType, setSessionType] = useState<SessionType>('lecture')
  const [notes, setNotes]             = useState('')

  // Auto-lookup session for the (module, date, type) combo
  const findQ = useQuery({
    queryKey: ['attendance-find', moduleId, sessionDate, sessionType],
    queryFn:  () => attendanceService.findSession({ module_id: moduleId, session_date: sessionDate, session_type: sessionType }),
    enabled:  moduleId > 0 && !!sessionDate,
    staleTime: 10_000,
  })
  const foundSession = findQ.data?.data?.session ?? null

  const createMut = useMutation({
    mutationFn: () => attendanceService.createSession({
      module_id:        moduleId,
      academic_term_id: termId,
      session_date:     sessionDate,
      session_type:     sessionType,
      notes:            notes || null,
    }),
    onSuccess: (res) => {
      if (!res.success || !res.data?.id) {
        toast.error(res.message || 'Could not open session.')
        return
      }
      toast.success('Session created — mark the roster below.')
      setNotes('')
      qc.invalidateQueries({ queryKey: ['attendance-find', moduleId, sessionDate, sessionType] })
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed to create session.'),
  })

  const moveDate = (days: number) => setSessionDate((d) => addDaysISO(d, days))

  return (
    <div className="space-y-4">
      {/* Single-row date nav + session type */}
      <section className="card px-3 py-2 flex items-center gap-2 flex-wrap">
        <select
          value={sessionType}
          onChange={(e) => setSessionType(e.target.value as SessionType)}
          className="input input-sm bg-white dark:bg-ink-900 capitalize"
          title="Session type"
        >
          {SESSION_TYPES.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
        </select>

        <div className="h-5 w-px bg-ink-200 dark:bg-ink-700 mx-1" />

        <button type="button" onClick={() => moveDate(-1)} className="btn-secondary btn-sm inline-flex items-center gap-1" title="Previous day">
          <ChevronLeft className="w-3.5 h-3.5" /> Prev
        </button>
        <button
          type="button"
          onClick={() => setSessionDate(todayISO())}
          className={`btn-secondary btn-sm ${sessionDate === todayISO() ? 'bg-brand/10 text-brand font-semibold' : ''}`}
          title="Jump to today"
        >
          Today
        </button>
        <button type="button" onClick={() => moveDate(1)} className="btn-secondary btn-sm inline-flex items-center gap-1" title="Next day">
          Next <ChevronRight className="w-3.5 h-3.5" />
        </button>
        <input
          type="date"
          value={sessionDate}
          onChange={(e) => setSessionDate(e.target.value || todayISO())}
          className="input input-sm bg-white dark:bg-ink-900"
        />
        <span className="text-[12px] text-ink-500 whitespace-nowrap">{prettyDate(sessionDate)}</span>
        {findQ.isFetching && <Loader2 className="w-3.5 h-3.5 animate-spin text-ink-400" />}
      </section>

      {termId === 0 && (
        <section className="card p-4 text-[12.5px] text-amber-900 bg-amber-50 border-amber-200 dark:bg-amber-900/30 dark:text-amber-100 dark:border-amber-700">
          Select an academic term at the top before recording — sessions must belong to a term.
        </section>
      )}

      {termId > 0 && !findQ.isLoading && !foundSession && (
        <section className="card p-6">
          <div className="flex items-center gap-3 flex-wrap">
            <PlusCircle className="w-5 h-5 text-brand shrink-0" />
            <div className="min-w-0 flex-1">
              <h3 className="text-[14px] font-semibold text-ink-900 dark:text-white">
                No session yet for this {sessionType} on {prettyDate(sessionDate)}.
              </h3>
              <p className="text-[12px] text-ink-500 mt-0.5">Create one and start marking students.</p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (topic, substitute, etc.) — optional"
              className="input input-sm bg-white dark:bg-ink-900 flex-1 min-w-[240px]"
            />
            <button
              type="button"
              onClick={() => createMut.mutate()}
              disabled={createMut.isPending}
              className="btn-primary inline-flex items-center gap-2"
            >
              {createMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ClipboardCheck className="w-3.5 h-3.5" />}
              Create session
            </button>
          </div>
        </section>
      )}

      {foundSession && (
        <RosterEditor
          sessionId={foundSession.id}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['attendance-overview'] })
            qc.invalidateQueries({ queryKey: ['attendance-sessions'] })
            qc.invalidateQueries({ queryKey: ['attendance-find', moduleId, sessionDate, sessionType] })
          }}
        />
      )}
    </div>
  )
}

/* ───────────────────────────────────────────────────────────────────────────
 * RosterEditor — read-only by default when the session is saved/closed.
 * Teacher clicks Edit to reopen and mutate; admin can additionally lock/unlock.
 * ─────────────────────────────────────────────────────────────────────── */
function RosterEditor({ sessionId, onSaved }: { sessionId: number; onSaved?: () => void }) {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const perms = user?.permissions ?? []
  const canManage = user?.role === 'superadmin' || perms.includes(PERMISSIONS.MANAGE_ATTENDANCE)

  const q = useQuery({
    queryKey: ['attendance-session', sessionId],
    queryFn:  () => attendanceService.showSession(sessionId),
  })

  const [edits, setEdits] = useState<Record<string, { status: AttendanceStatus; remarks?: string | null }>>({})
  const [filter, setFilter] = useState('')
  const [editMode, setEditMode] = useState(false) // local override when user hits Edit

  useEffect(() => {
    const roster = q.data?.data?.roster ?? []
    const init: typeof edits = {}
    for (const r of roster) {
      if (r.record_status) {
        init[r.regnumber] = { status: r.record_status as AttendanceStatus, remarks: r.remarks }
      }
    }
    setEdits(init)
    setEditMode(false) // reset when session switches
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data?.data?.session.id])

  const saveMut = useMutation({
    mutationFn: () => attendanceService.saveRecords(sessionId, {
      records: Object.entries(edits).map(([regnumber, v]) => ({
        student_regnumber: regnumber,
        status:            v.status,
        remarks:           v.remarks || null,
      })),
    }),
    onSuccess: (res) => {
      if (!res.success) return toast.error(res.message || 'Save failed.')
      toast.success(`${res.data?.saved ?? 0} students saved.`)
      setEditMode(false)
      qc.invalidateQueries({ queryKey: ['attendance-session', sessionId] })
      onSaved?.()
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed to save attendance.'),
  })

  const reopenMut = useMutation({
    mutationFn: () => attendanceService.reopenSession(sessionId),
    onSuccess: (res) => {
      if (!res.success) return toast.error(res.message || 'Could not reopen.')
      setEditMode(true)
      qc.invalidateQueries({ queryKey: ['attendance-session', sessionId] })
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Could not reopen.'),
  })

  const lockMut = useMutation({
    mutationFn: (locked: boolean) => attendanceService.toggleLock(sessionId, locked),
    onSuccess: (res) => {
      if (!res.success) return toast.error(res.message || 'Lock toggle failed.')
      toast.success(res.data?.is_locked ? 'Session locked.' : 'Session unlocked.')
      qc.invalidateQueries({ queryKey: ['attendance-session', sessionId] })
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Lock toggle failed.'),
  })

  if (q.isLoading) return <section className="card p-10 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-ink-400" /></section>
  if (q.isError || !q.data?.data) return <section className="card p-6 text-ink-500 text-[13px]">Failed to load session.</section>

  const { session, roster, summary } = q.data.data
  const hasAnyRecorded = roster.some((r) => r.record_status)
  const isLocked = session.is_locked === 1
  const isClosed = session.status === 'closed'

  // Editing is allowed when:
  //   - session is open (fresh) AND not locked OR user is admin-locked-override
  //   - session is closed and the user toggled `editMode` after a Reopen
  // Admins: the lock is enforced server-side too; UI still blocks them gently.
  const canEditNow =
    (session.status === 'open' && (!isLocked || canManage)) ||
    (editMode && (!isLocked || canManage))

  const fq = filter.trim().toLowerCase()
  const visible = fq
    ? roster.filter((r) => `${r.fname} ${r.lname} ${r.regnumber}`.toLowerCase().includes(fq))
    : roster

  const setAllTo = (st: AttendanceStatus) => {
    setEdits((prev) => {
      const n: typeof prev = { ...prev }
      for (const r of roster) n[r.regnumber] = { ...(n[r.regnumber] ?? {}), status: st }
      return n
    })
  }

  const markedCount = Object.keys(edits).length

  return (
    <section className="card p-0 overflow-hidden">
      <div className="px-6 pt-5 pb-3 border-b border-ink-100 dark:border-ink-700 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[15px] font-semibold text-ink-900 dark:text-white">
              {session.module_code} · {session.session_date} · <span className="capitalize">{session.session_type}</span>
            </h3>
            <StatusChip status={session.status} />
            {isLocked && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200">
                <Lock className="w-3 h-3" /> Locked
              </span>
            )}
          </div>
          <p className="text-[12px] text-ink-500">{session.module_name} · {session.term_label ?? '—'} · {summary.total_roster} enrolled · {hasAnyRecorded ? 'records saved' : 'not yet recorded'}</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-400" />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find student…" className="input input-sm pl-9 w-full" />
          </div>

          {canEditNow && (
            <>
              <button className="btn-secondary btn-sm" onClick={() => setAllTo('present')}>Mark all present</button>
              <button
                className="btn-primary btn-sm inline-flex items-center gap-1.5"
                disabled={saveMut.isPending || markedCount === 0}
                onClick={() => saveMut.mutate()}
              >
                {saveMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save attendance
              </button>
            </>
          )}

          {/* Edit button — shows on closed sessions when lock allows */}
          {!canEditNow && (!isLocked || canManage) && (
            <button
              className="btn-secondary btn-sm inline-flex items-center gap-1.5"
              disabled={reopenMut.isPending}
              onClick={() => { if (isClosed) reopenMut.mutate(); else setEditMode(true) }}
              title="Edit attendance — this re-opens the session"
            >
              {reopenMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pencil className="w-3.5 h-3.5" />}
              Edit attendance
            </button>
          )}

          {canManage && (
            <button
              className={`btn-secondary btn-sm inline-flex items-center gap-1.5 ${isLocked ? 'text-emerald-700' : 'text-rose-700'}`}
              disabled={lockMut.isPending}
              onClick={() => lockMut.mutate(!isLocked)}
              title={isLocked ? 'Unlock so the teacher can edit' : 'Lock — prevents teacher from editing'}
            >
              {lockMut.isPending
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : (isLocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />)}
              {isLocked ? 'Unlock' : 'Lock'}
            </button>
          )}
        </div>
      </div>

      {/* Locked banner for teachers */}
      {isLocked && !canManage && (
        <div className="px-6 py-3 bg-rose-50 dark:bg-rose-900/20 text-rose-800 dark:text-rose-200 text-[12.5px] border-b border-rose-100 dark:border-rose-900/50 flex items-center gap-2">
          <Lock className="w-3.5 h-3.5" /> This session has been locked by an administrator — editing is disabled.
        </div>
      )}

      {roster.length === 0 ? (
        <div className="p-10 text-center text-ink-500 text-[13px]">No students are registered for this module in this term.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-[44%]">Student</th>
                <th>Status</th>
                <th>Remarks</th>
                <th className="text-right pr-4">History</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <RosterRowEditor
                  key={r.regnumber}
                  row={r}
                  value={edits[r.regnumber]?.status ?? (r.record_status as AttendanceStatus | null) ?? 'present'}
                  remarks={edits[r.regnumber]?.remarks ?? r.remarks ?? ''}
                  readOnly={!canEditNow}
                  recorded={!!r.record_status}
                  onStatus={(status) => setEdits((prev) => ({ ...prev, [r.regnumber]: { ...(prev[r.regnumber] ?? {}), status } }))}
                  onRemarks={(remarks) => setEdits((prev) => ({ ...prev, [r.regnumber]: { ...(prev[r.regnumber] ?? { status: 'present' }), remarks } }))}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function RosterRowEditor({
  row, value, remarks, readOnly, recorded, onStatus, onRemarks,
}: {
  row:       RosterRow
  value:     AttendanceStatus
  remarks:   string
  readOnly:  boolean
  recorded:  boolean
  onStatus:  (s: AttendanceStatus) => void
  onRemarks: (s: string) => void
}) {
  return (
    <tr className={readOnly ? 'opacity-95' : ''}>
      <td>
        <div className="min-w-0">
          <p className="font-semibold text-ink-900 dark:text-ink-100 truncate">{row.fname} {row.lname}</p>
          <p className="font-mono text-[11.5px] text-ink-500">{row.regnumber}</p>
        </div>
      </td>
      <td>
        {readOnly ? (
          recorded ? (
            <StatusBadge status={value} />
          ) : (
            <span className="text-[11.5px] text-ink-400">Not marked</span>
          )
        ) : (
          <div className="inline-flex items-center gap-1 rounded-lg bg-ink-50 dark:bg-ink-700/40 p-0.5">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => onStatus(opt.key)}
                title={opt.label}
                className={`px-2.5 py-1 rounded-md text-[11.5px] font-semibold transition-colors ${
                  value === opt.key ? opt.tone : 'text-ink-600 dark:text-ink-300 hover:bg-white/60 dark:hover:bg-ink-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </td>
      <td>
        {readOnly ? (
          <span className="text-[12px] text-ink-600 dark:text-ink-300">{remarks || <span className="text-ink-400">—</span>}</span>
        ) : (
          <input
            value={remarks}
            onChange={(e) => onRemarks(e.target.value)}
            placeholder="—"
            className="input input-sm bg-white dark:bg-ink-900 w-full max-w-[280px]"
          />
        )}
      </td>
      <td className="text-right pr-4">
        <AttendancePill value={row.attendance_pct} total={Number(row.total_sessions)} />
      </td>
    </tr>
  )
}

function StatusBadge({ status }: { status: AttendanceStatus }) {
  const opt = STATUS_OPTIONS.find((o) => o.key === status)
  if (!opt) return <span className="text-[11.5px] text-ink-400">{status}</span>
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11.5px] font-semibold ${opt.tone}`}>
      {opt.label}
    </span>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Sessions tab — history
 * ═══════════════════════════════════════════════════════════════════════ */
function SessionsTab({ termId, moduleId, canDelete, setTab }: { termId: number; moduleId: number; canDelete: boolean; setTab: (t: Tab) => void }) {
  const qc = useQueryClient()
  const [params, setParams] = useState<SessionListParams>({ page: 1, per_page: 25 })
  const [openSessionId, setOpenSessionId] = useState<number | null>(null)

  const effective: SessionListParams = {
    ...params,
    academic_term_id: termId || undefined,
    module_id:        moduleId || undefined,
  }

  const q = useQuery({
    queryKey: ['attendance-sessions', effective],
    queryFn:  () => attendanceService.listSessions(effective),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  const delMut = useMutation({
    mutationFn: (id: number) => attendanceService.deleteSession(id),
    onSuccess:  (res) => {
      if (!res.success) return toast.error(res.message || 'Delete failed.')
      toast.success('Session deleted.')
      qc.invalidateQueries({ queryKey: ['attendance-sessions'] })
      qc.invalidateQueries({ queryKey: ['attendance-overview'] })
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Delete failed.'),
  })

  const rows = q.data?.data?.data ?? []
  const total = q.data?.data?.total ?? 0

  if (openSessionId != null) {
    return (
      <div className="space-y-3">
        <button className="btn-secondary btn-sm" onClick={() => setOpenSessionId(null)}>← Back to sessions</button>
        <RosterEditor sessionId={openSessionId} onSaved={() => qc.invalidateQueries({ queryKey: ['attendance-sessions'] })} />
      </div>
    )
  }

  return (
    <section className="card p-0 overflow-hidden">
      <div className="px-6 pt-5 pb-3 border-b border-ink-100 dark:border-ink-700 flex items-center gap-3 flex-wrap">
        <h3 className="text-[15px] font-semibold text-ink-900 dark:text-white flex-1">Sessions history</h3>
        <label className="flex items-center gap-2 text-[12px] text-ink-500">
          <input
            type="checkbox"
            checked={params.mine === 1}
            onChange={(e) => setParams((p) => ({ ...p, mine: e.target.checked ? 1 : 0, page: 1 }))}
          />
          My sessions only
        </label>
        <input
          type="date"
          value={params.date_from ?? ''}
          onChange={(e) => setParams((p) => ({ ...p, date_from: e.target.value || undefined, page: 1 }))}
          className="input input-sm bg-white dark:bg-ink-900"
        />
        <input
          type="date"
          value={params.date_to ?? ''}
          onChange={(e) => setParams((p) => ({ ...p, date_to: e.target.value || undefined, page: 1 }))}
          className="input input-sm bg-white dark:bg-ink-900"
        />
        <span className="text-[11.5px] text-ink-500">{total.toLocaleString()} total</span>
        {q.isFetching && <Loader2 className="w-3.5 h-3.5 animate-spin text-ink-400" />}
      </div>

      {q.isLoading ? (
        <div className="p-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-ink-400" /></div>
      ) : rows.length === 0 ? (
        <div className="p-10 text-center text-ink-500 text-[13px]">
          No sessions yet. {setTab && <button className="text-brand underline" onClick={() => setTab('record')}>Record one</button>}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Module</th>
                <th>Type</th>
                <th>Teacher</th>
                <th>Status</th>
                <th className="text-right">Present / Marked</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const marked  = Number(r.recorded_count ?? 0)
                const present = Number(r.present_count ?? 0)
                const pct = marked > 0 ? Math.round((present / marked) * 100) : 0
                return (
                  <tr key={r.id}>
                    <td className="text-[12.5px]">{r.session_date}</td>
                    <td>
                      <p className="font-mono text-[11.5px]">{r.module_code}</p>
                      <p className="text-[11.5px] text-ink-500 truncate">{r.module_name}</p>
                    </td>
                    <td className="text-[12px] capitalize">{r.session_type}</td>
                    <td className="text-[12px]">{r.started_by_name || '—'}</td>
                    <td><StatusChip status={r.status} /></td>
                    <td className="text-right text-[12.5px] tabular-nums">
                      <span className="font-semibold">{present}/{marked}</span>
                      <span className="ml-2 text-ink-400">({pct}%)</span>
                    </td>
                    <td className="text-right pr-4">
                      <button className="btn-secondary btn-sm" onClick={() => setOpenSessionId(r.id)}>Open</button>
                      {canDelete && (
                        <button
                          className="btn-secondary btn-sm ml-1 text-rose-600 hover:text-rose-700"
                          title="Delete session"
                          onClick={() => { if (confirm('Delete this session and all its records?')) delMut.mutate(r.id) }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

/* ══════════ Small bits ══════════ */
function TabBtn({ active, icon: Icon, label, onClick }: { active: boolean; icon: any; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-2 text-[13px] rounded-md transition-colors ${
        active ? 'bg-brand text-white font-semibold shadow-sm' : 'text-ink-600 dark:text-ink-300 hover:text-ink-900 hover:bg-ink-50 dark:hover:text-white dark:hover:bg-ink-700/40'
      }`}
    >
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  )
}

function AttendancePill({ value, total }: { value: number; total: number }) {
  if (!total) return <span className="text-[11px] text-ink-400">—</span>
  return (
    <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold tabular-nums px-2 py-0.5 rounded-full" style={{ color: toneForPct(value), backgroundColor: `${toneForPct(value)}1A` }}>
      {value}% <span className="text-ink-400 font-normal">· {total}</span>
    </span>
  )
}

function StatusChip({ status }: { status: 'open' | 'closed' }) {
  const map = {
    open:   { Icon: Clock,        klass: 'bg-amber-50 text-amber-700',  label: 'Open' },
    closed: { Icon: CheckCircle2, klass: 'bg-emerald-50 text-emerald-700', label: 'Closed' },
  } as const
  const m = map[status]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${m.klass}`}>
      <m.Icon className="w-3 h-3" /> {m.label}
    </span>
  )
}

function Seg({ v, tot, color }: { v: number; tot: number; color: string }) {
  if (tot <= 0) return null
  const w = (v / tot) * 100
  return <div style={{ width: `${w}%`, backgroundColor: color }} />
}
function Legend({ v, tot, color, label }: { v: number; tot: number; color: string; label: string }) {
  const p = tot > 0 ? Math.round((v / tot) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-ink-600 dark:text-ink-300">{label}</span>
      <span className="ml-auto tabular-nums text-ink-500">{v.toLocaleString()} · {p}%</span>
    </div>
  )
}

function toneForPct(p: number): string {
  if (p >= 85) return '#10B981'
  if (p >= 70) return '#22C55E'
  if (p >= 50) return '#F59E0B'
  return '#E11D48'
}

function fmt(n: number | string | null | undefined): string {
  if (n === null || n === undefined) return '—'
  const num = typeof n === 'string' ? Number(n) : n
  if (Number.isNaN(num)) return '—'
  return num.toLocaleString()
}

function todayISO(): string {
  const d = new Date()
  const tz = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - tz).toISOString().slice(0, 10)
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  const tz = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - tz).toISOString().slice(0, 10)
}

function prettyDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

// Silence unused lint — reserved for future per-row warnings on excused/manual logs.
void XCircle; void FileWarning
