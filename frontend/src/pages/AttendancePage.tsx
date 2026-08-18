import { useEffect, useMemo, useState, useRef } from 'react'
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
  Lock,
  Unlock,
  Pencil,
  UserPlus,
  CalendarDays,
  Check,
  Download,
  FileText,
  X,
} from 'lucide-react'
import StatCard from '@/components/dashboard/StatCard'
import SearchableSelect from '@/components/ui/SearchableSelect'
import { useDebounce } from '@/hooks/useDebounce'
import { useLevels } from '@/hooks/useLevels'
import {
  attendanceService,
  type AttendanceStatus,
  type SessionType,
  type RosterRow,
  type SessionListParams,
  type TeachableModule,
  type CreateSessionPayload,
} from '@/services/attendanceService'
import { moduleScheduleService, moduleRegistrationService } from '@/services/modulesService'
import { apiClient } from '@/services/api'
import { studentService } from '@/services/studentService'
import { academicsMgmtService } from '@/services/academicsMgmtService'
import { portalService } from '@/services/admissionService'
import { useSystemStore } from '@/store/systemStore'
import { PERMISSIONS } from '@/constants'
import { useAnyPermission, usePermission } from '@/utils/permissions'
import type { AcademicTerm } from '@/types/academic'
import Modal from '@/components/ui/Modal'
import type { Student } from '@/types/academic'

type Tab = 'overview' | 'record' | 'sessions'

const STATUS_OPTIONS: {
  key: AttendanceStatus
  label: string
  tone: string  // active state classes
  ring: string  // selected ring color
  dot: string  // hex for status dot
  Icon: typeof CheckCircle2
}[] = [
    { key: 'present', label: 'Present', tone: 'bg-emerald-500 text-white', ring: 'ring-emerald-500/40', dot: '#10B981', Icon: CheckCircle2 },
    { key: 'late', label: 'Late', tone: 'bg-amber-500 text-white', ring: 'ring-amber-500/40', dot: '#F59E0B', Icon: Clock },
    { key: 'absent', label: 'Absent', tone: 'bg-rose-500 text-white', ring: 'ring-rose-500/40', dot: '#E11D48', Icon: XCircle },
    { key: 'excused', label: 'Excused', tone: 'bg-sky-500 text-white', ring: 'ring-sky-500/40', dot: '#0EA5E9', Icon: AlertCircle },
  ]

export default function AttendancePage() {
  const [sp, setSp] = useSearchParams()
  const tab = (sp.get('tab') as Tab) || 'overview'
  const setTab = (t: Tab) => { const n = new URLSearchParams(sp); n.set('tab', t); setSp(n, { replace: true }) }

  // Permissions
  const canRecord = useAnyPermission([PERMISSIONS.RECORD_ATTENDANCE, PERMISSIONS.MANAGE_ATTENDANCE])
  const canManage = usePermission(PERMISSIONS.MANAGE_ATTENDANCE)

  // Term selector — default to active term
  const basics = useSystemStore((s) => s.basics)
  const allTerms = useMemo<AcademicTerm[]>(() => (basics?.terms ?? []), [basics?.terms])
  const activeTerm = basics?.active_term && typeof basics.active_term === 'object' ? (basics.active_term as AcademicTerm) : null
  const [termId, setTermId] = useState<number>(0)
  useEffect(() => {
    if (termId === 0 && activeTerm?.id) setTermId(activeTerm.id)
  }, [activeTerm?.id, termId])

  // Program — the gating scope. Until a program is picked we show only a
  // program picker; the calendar / module work is hidden so users can't
  // record attendance without first declaring which programme they're in.
  const programId = Number(sp.get('program_id') || 0)
  const setProgramId = (id: number) => {
    const n = new URLSearchParams(sp)
    if (id > 0) n.set('program_id', String(id))
    else n.delete('program_id')
    // Picking / changing program clears any deeper selection.
    n.delete('module_id'); n.delete('m_code'); n.delete('m_name')
    n.delete('session_type'); n.delete('date')
    setSp(n, { replace: true })
  }

  // Module — the page-level scope. Until a module is picked, the tabs are
  // hidden and we show a full-width picker card instead. Derived from URL so
  // any URL update (e.g. picking a schedule entry) re-renders correctly.
  const moduleId = Number(sp.get('module_id') || 0)
  const setModuleId = (id: number) => {
    const n = new URLSearchParams(sp)
    if (id > 0) {
      n.set('module_id', String(id))
    } else {
      n.delete('module_id')
      n.delete('session_type')
      n.delete('date')
    }
    setSp(n, { replace: true })
  }

  const teachableQ = useQuery({
    queryKey: ['attendance-teachable', termId],
    queryFn: () => attendanceService.teachableModules({ academic_term_id: termId || undefined }),
    staleTime: 60_000,
  })
  const allTeachable = teachableQ.data?.data ?? []

  // Only modules that actually have a teaching block in `module_schedules`
  // qualify for attendance — irrespective of which term the schedule
  // belongs to. The user explicitly wants every active schedule visible.
  const termSchedulesQ = useQuery({
    queryKey: ['attendance-all-schedules'],
    queryFn: () => moduleScheduleService.list({}),
    staleTime: 60_000,
  })
  const scheduledModuleIds = useMemo(
    () => new Set((termSchedulesQ.data?.data ?? []).map((s) => Number(s.module_id))),
    [termSchedulesQ.data],
  )
  const modules = useMemo(
    () => allTeachable.filter((m) => scheduledModuleIds.has(Number(m.module_id))),
    [allTeachable, scheduledModuleIds],
  )

  const pickedModule = modules.find((m) => m.module_id === moduleId)
    || allTeachable.find((m) => m.module_id === moduleId)
    || (moduleId > 0 ? {
      module_id: moduleId,
      module_code: sp.get('m_code') || 'Module',
      module_name: sp.get('m_name') || '',
    } as TeachableModule : null)

  // URL-persisted preferred session type — set when user clicks a calendar entry
  const preferredSessionType = (sp.get('session_type') as SessionType | null) || null
  const preferredDate = sp.get('date') || null
  // Schedule scope from URL — restricts which dates the strip lights up.
  const scopeDayPattern = sp.get('days') || null
  const scopeStartDate = sp.get('from') || null
  const scopeEndDate = sp.get('to') || null

  // Landing view: no module picked yet → show every scheduled module in
  // the term as a list. Programme is just an optional filter; users no
  // longer have to choose one before they can see anything.
  if (!moduleId || !pickedModule) {
    return (
      <SchedulePicker
        canManage={canManage}
        teachableModuleIds={modules.map((m) => m.module_id)}
        teachableLoading={teachableQ.isLoading}
        programId={programId}
        onChangeProgram={() => setProgramId(0)}
        onPickProgram={(id) => setProgramId(id)}
        onPickModule={(modId, code, name, scope) => {
          const next = new URLSearchParams(sp)
          next.set('module_id', String(modId))
          next.set('m_code', code || '')
          next.set('m_name', name || '')
          next.set('tab', 'record')
          next.delete('session_type')
          next.delete('date')
          // Schedule scope — days the strip should keep clickable. Persists
          // via URL so deep-links still constrain the picker correctly.
          if (scope?.day_pattern) next.set('days', scope.day_pattern); else next.delete('days')
          if (scope?.start_date) next.set('from', scope.start_date); else next.delete('from')
          if (scope?.end_date) next.set('to', scope.end_date); else next.delete('to')
          setSp(next, { replace: true })
        }}
      />
    )
  }

  // Step 2: module picked — show tabs, each scoped to this module
  return (
    <div className="max-w-[1400px] mx-auto space-y-4">
      {/* Compact header: module · tabs · term · change */}
      <ModuleHeaderBar
        pickedModule={pickedModule}
        modules={modules}
        onSwitchModule={(id) => setModuleId(id)}
        onBackToCalendar={() => setModuleId(0)}
        tab={tab}
        setTab={setTab}
        canRecord={canRecord}
        termId={termId}
        setTermId={setTermId}
        allTerms={allTerms}
        activeTerm={activeTerm}
      />

      {tab === 'overview' && <OverviewTab termId={termId} moduleId={moduleId} mineOnly={!canManage && canRecord} />}
      {tab === 'record' && canRecord && (
        scheduledModuleIds.size > 0 && !scheduledModuleIds.has(moduleId) ? (
          <section className="card p-6 text-[13px] text-amber-900 bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:text-amber-100 dark:border-amber-700/60 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">This module has no teaching block on the timetable.</p>
              <p className="mt-1 text-[12.5px] opacity-90">
                Attendance can only be recorded for modules that have a teaching block in <code>module_schedules</code>. Add a schedule under <em>Academics → Scheduling</em>, or pick a different module from the switcher.
              </p>
            </div>
          </section>
        ) : (
          <RecordTab
            termId={termId}
            pickedModule={pickedModule}
            initialSessionType={preferredSessionType}
            initialDate={preferredDate}
            scopeDayPattern={scopeDayPattern}
            scopeStartDate={scopeStartDate}
            scopeEndDate={scopeEndDate}
          />
        )
      )}
      {tab === 'sessions' && <SessionsTab termId={termId} moduleId={moduleId} canDelete={canRecord} setTab={setTab} />}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Overview tab
 * ═══════════════════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════════════════
 * ModuleHeaderBar — sticky module switcher + tabs + export menu
 * ═══════════════════════════════════════════════════════════════════════ */
function ModuleHeaderBar({
  pickedModule, modules, onSwitchModule, onBackToCalendar,
  tab, setTab, canRecord, termId, setTermId, allTerms, activeTerm,
}: {
  pickedModule: TeachableModule
  modules: TeachableModule[]
  onSwitchModule: (id: number) => void
  onBackToCalendar: () => void
  tab: Tab
  setTab: (t: Tab) => void
  canRecord: boolean
  termId: number
  setTermId: (n: number) => void
  allTerms: AcademicTerm[]
  activeTerm: AcademicTerm | null
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [pickerLevel, setPickerLevel] = useState<number | 0>(0)
  const [pickerSearch, setPickerSearch] = useState('')
  const { levelName } = useLevels()
  const moduleId = pickedModule.module_id

  const availableLevels = useMemo(() => {
    const set = new Set<number>()
    modules.forEach((m) => { if (m.level) set.add(Number(m.level)) })
    return [...set].sort((a, b) => a - b)
  }, [modules])

  const visibleModules = useMemo(() => {
    let list = modules
    if (pickerLevel) list = list.filter((m) => Number(m.level) === pickerLevel)
    if (pickerSearch.trim()) {
      const q = pickerSearch.toLowerCase()
      list = list.filter((m) => m.module_code.toLowerCase().includes(q) || m.module_name.toLowerCase().includes(q))
    }
    return list
  }, [modules, pickerLevel, pickerSearch])

  // Close popovers on outside click / escape
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-popover="module-picker"]')) setPickerOpen(false)
      if (!target.closest('[data-popover="export-menu"]')) setExportOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const downloadReport = async (kind: 'pdf' | 'csv') => {
    setExporting(true); setExportOpen(false)
    try {
      const url = `/api/attendance/modules/${moduleId}/report`
      const res = await apiClient.get(url, {
        params: { academic_term_id: termId || 0, format: kind },
        responseType: 'blob',
      })
      const cd = res.headers['content-disposition'] as string | undefined
      const match = cd?.match(/filename="?([^";]+)"?/i)
      const safeCode = pickedModule.module_code.replace(/[^A-Za-z0-9_-]+/g, '')
      const filename = match?.[1] ?? `attendance-${safeCode}-${todayISO()}.${kind}`
      downloadBlob(res.data as Blob, filename)
      toast.success(`Report downloaded`)
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? e?.message ?? 'Export failed'
      toast.error(msg)
    } finally {
      setExporting(false)
    }
  }

  return (
    <section className="card px-3 py-2 flex items-center gap-2 flex-wrap print:hidden">
      <button
        type="button"
        onClick={onBackToCalendar}
        className="p-1.5 hover:bg-ink-100 dark:hover:bg-ink-800 rounded-lg text-ink-500 hover:text-brand transition-colors shrink-0"
        title="Back to schedule picker"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>

      {/* Module switcher */}
      <div className="relative min-w-0 flex-1 sm:flex-none" data-popover="module-picker">
        <button
          type="button"
          onClick={() => setPickerOpen((o) => !o)}
          className="w-full sm:w-auto inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-ink-50 dark:hover:bg-ink-800 transition-colors min-w-0"
          title="Switch module"
        >
          <BookOpen className="w-4 h-4 text-brand shrink-0" />
          <div className="min-w-0 text-left">
            <p className="font-mono text-[12px] font-bold text-ink-900 dark:text-white whitespace-nowrap leading-tight">{pickedModule.module_code}</p>
            <p className="text-[11px] text-ink-500 truncate max-w-[320px] leading-tight" title={pickedModule.module_name}>{pickedModule.module_name}</p>
          </div>
          <ChevronDownIcon className="w-3.5 h-3.5 text-ink-400 shrink-0" />
        </button>
        {pickerOpen && (
          <div className="absolute z-30 left-0 top-full mt-1 w-[340px] max-w-[90vw] bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-700 rounded-lg shadow-xl overflow-hidden">
            <div className="px-3 py-2 border-b border-ink-100 dark:border-ink-700 flex items-center justify-between">
              <span className="text-[10.5px] uppercase tracking-wider text-ink-400 font-semibold">
                {modules.length} {modules.length === 1 ? 'module' : 'modules'}
              </span>
              {availableLevels.length > 0 && (
                <select
                  value={pickerLevel}
                  onChange={(e) => setPickerLevel(Number(e.target.value))}
                  className="text-[11px] bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded px-1.5 py-0.5 cursor-pointer"
                >
                  <option value={0}>All levels</option>
                  {availableLevels.map((l) => (
                    <option key={l} value={l}>{levelName(l)}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="px-3 py-2 border-b border-ink-100 dark:border-ink-700">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  autoFocus
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  placeholder="Search modules…"
                  className="input input-sm pl-8 w-full text-[12px]"
                />
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {visibleModules.length === 0 ? (
                <p className="p-3 text-center text-ink-400 text-[12px]">
                  {modules.length === 0 ? 'No modules assigned.' : 'No modules match.'}
                </p>
              ) : visibleModules.map((m) => {
                const isActive = m.module_id === moduleId
                return (
                  <button
                    key={m.module_id}
                    type="button"
                    onClick={() => { onSwitchModule(m.module_id); setPickerOpen(false); setPickerSearch('') }}
                    className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${isActive
                        ? 'bg-brand/10 text-brand'
                        : 'hover:bg-ink-50 dark:hover:bg-ink-700/30'
                      }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[12px] font-semibold truncate">{m.module_code}</p>
                      <p className="text-[11.5px] text-ink-500 truncate">{m.module_name}</p>
                    </div>
                    {m.level ? (
                      <span className="text-[10px] text-ink-400 whitespace-nowrap">{(m as any).level_name ?? levelName(m.level)}</span>
                    ) : null}
                    {isActive && <Check className="w-3.5 h-3.5 text-brand shrink-0" />}
                  </button>
                )
              })}
            </div>
            <div className="px-3 py-2 border-t border-ink-100 dark:border-ink-700">
              <button
                type="button"
                onClick={() => { setPickerOpen(false); onBackToCalendar() }}
                className="text-[11.5px] text-brand hover:underline inline-flex items-center gap-1"
              >
                <CalendarDays className="w-3 h-3" /> View calendar
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        <TabBtn active={tab === 'overview'} onClick={() => setTab('overview')} icon={BarChart3} label="Overview" />
        {canRecord && <TabBtn active={tab === 'record'} onClick={() => setTab('record')} icon={ClipboardCheck} label="Record" />}
        <TabBtn active={tab === 'sessions'} onClick={() => setTab('sessions')} icon={ListIcon} label="History" />
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

        {/* Export menu */}
        <div className="relative" data-popover="export-menu">
          <button
            type="button"
            onClick={() => setExportOpen((o) => !o)}
            disabled={exporting}
            className="btn-secondary btn-sm inline-flex items-center gap-1.5"
            title="Download attendance report"
          >
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Export
            <ChevronDownIcon className="w-3 h-3" />
          </button>
          {exportOpen && (
            <div className="absolute z-30 right-0 top-full mt-1 w-48 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-700 rounded-lg shadow-xl overflow-hidden">
              <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-ink-400 font-semibold">Module report</div>
              <button
                type="button"
                onClick={() => downloadReport('pdf')}
                className="w-full text-left px-3 py-2 text-[12.5px] hover:bg-ink-50 dark:hover:bg-ink-700/30 inline-flex items-center gap-2"
              >
                <FileText className="w-3.5 h-3.5 text-rose-600" />
                <span className="flex-1">Download PDF</span>
                <span className="text-[10px] text-ink-400">.pdf</span>
              </button>
              <button
                type="button"
                onClick={() => downloadReport('csv')}
                className="w-full text-left px-3 py-2 text-[12.5px] hover:bg-ink-50 dark:hover:bg-ink-700/30 inline-flex items-center gap-2 border-t border-ink-100 dark:border-ink-700/60"
              >
                <FileText className="w-3.5 h-3.5 text-emerald-600" />
                <span className="flex-1">Download CSV</span>
                <span className="text-[10px] text-ink-400">.csv</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

/** Tiny chevron-down icon — avoids adding another lucide import. */
function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 6l4 4 4-4" />
    </svg>
  )
}

/** Escape a CSV field — wrap in quotes if it contains comma, quote, or newline. */
/** Trigger a browser download for an opaque Blob (e.g. PDF or CSV from API). */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
}

function OverviewTab({ termId, moduleId, mineOnly }: { termId: number; moduleId: number; mineOnly: boolean }) {
  const q = useQuery({
    queryKey: ['attendance-overview', termId, moduleId, mineOnly ? 1 : 0],
    queryFn: () => attendanceService.overview({
      academic_term_id: termId || undefined,
      module_id: moduleId || undefined,
      mine: mineOnly ? 1 : 0,
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
          <StatCard label="Sessions" value={fmt(t.sessions)} icon={ClipboardCheck} tone="sky" />
          <StatCard label="Avg attendance" value={`${t.attendance_pct}%`} icon={TrendingDown} tone="mint" />
          <StatCard label="Records marked" value={fmt(t.records)} icon={Users} tone="lilac" />
          <StatCard label="Modules covered" value={fmt(t.modules)} icon={BookOpen} tone="peach" />
        </div>

        {/* Status breakdown bar */}
        {t.records > 0 && (
          <div className="mt-5">
            <div className="flex items-center gap-2 text-[12px] text-ink-500 mb-2">
              <Filter className="w-3 h-3" /> Status breakdown
            </div>
            <div className="h-3 rounded-full bg-ink-100 dark:bg-ink-700/50 overflow-hidden flex">
              <Seg v={t.present} tot={t.records} color="#10B981" />
              <Seg v={t.late} tot={t.records} color="#F59E0B" />
              <Seg v={t.excused} tot={t.records} color="#0EA5E9" />
              <Seg v={t.absent} tot={t.records} color="#E11D48" />
            </div>
            <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-[12px]">
              <Legend color="#10B981" label="Present" v={t.present} tot={t.records} />
              <Legend color="#F59E0B" label="Late" v={t.late} tot={t.records} />
              <Legend color="#0EA5E9" label="Excused" v={t.excused} tot={t.records} />
              <Legend color="#E11D48" label="Absent" v={t.absent} tot={t.records} />
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
/**
 * The date strip + editable attendance roster.
 *
 * Exported so the teacher course page (pages/teacher/TeacherCourseDetailPage)
 * can embed the identical recording UI on its Attendance tab instead of sending
 * the lecturer to /attendance and making them re-pick the module they already
 * had open. Keeping one component means the two surfaces cannot drift apart.
 */
export function RecordTab({
  termId, pickedModule, initialSessionType, initialDate,
  scopeDayPattern, scopeStartDate, scopeEndDate, showDateStrip = true,
  externalFilter, compact = false, onBridge,
}: {
  termId: number
  pickedModule: TeachableModule
  initialSessionType?: SessionType | null
  initialDate?: string | null
  scopeDayPattern?: string | null
  scopeStartDate?: string | null
  scopeEndDate?: string | null
  /** Set false when the host already renders its own DateStrip. */
  showDateStrip?: boolean
  /** Forwarded to RosterEditor — host-owned search box. */
  externalFilter?: string
  /** Forwarded to RosterEditor — drops the duplicated title block. */
  compact?: boolean
  /** Forwarded to RosterEditor — lets the host header own Save. */
  onBridge?: (api: { save: () => Promise<unknown>; saving: boolean; canSave: boolean } | null) => void
}) {
  const qc = useQueryClient()

  const moduleId = pickedModule.module_id
  const sessionType: SessionType = initialSessionType || 'lecture'

  // The day pattern (e.g. "1,2,3,4,5") restricts which dates can be picked.
  // `null` means no scope was passed — fall back to "any past or today".
  const allowedDows = useMemo<Set<number> | null>(() => {
    if (!scopeDayPattern) return null
    const parts = scopeDayPattern.split(',').map((s) => Number(s.trim())).filter((n) => n >= 1 && n <= 7)
    return parts.length ? new Set(parts) : null
  }, [scopeDayPattern])

  const initialPickedDate = useMemo(() => {
    if (initialDate) return initialDate
    return mostRecentAllowedDate(allowedDows, scopeStartDate, scopeEndDate)
  }, [initialDate, allowedDows, scopeStartDate, scopeEndDate])

  // Date strip — admins can scrub any allowed past day to record/edit attendance.
  const [sessionDate, setSessionDate] = useState<string>(initialPickedDate)
  useEffect(() => {
    if (initialDate) setSessionDate(initialDate)
  }, [initialDate])

  // Auto-lookup session for the (module, date, type) combo
  const findQ = useQuery({
    queryKey: ['attendance-find', moduleId, sessionDate, sessionType],
    queryFn: () => attendanceService.findSession({ module_id: moduleId, session_date: sessionDate, session_type: sessionType }),
    enabled: moduleId > 0 && !!sessionDate,
    staleTime: 10_000,
  })
  const foundSession = findQ.data?.data?.session ?? null

  const createMut = useMutation({
    mutationFn: (payload: CreateSessionPayload) => attendanceService.createSession(payload),
    onSuccess: (res) => {
      if (!res.success || !res.data?.id) {
        toast.error(res.message || 'Could not open session.')
        return
      }
      qc.invalidateQueries({ queryKey: ['attendance-find', moduleId, sessionDate, sessionType] })
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed to create session.'),
  })

  // Auto-create session if it doesn't exist when we pick a module/date/type
  useEffect(() => {
    if (moduleId > 0 && termId > 0 && sessionDate && !findQ.isLoading && !foundSession && !createMut.isPending) {
      createMut.mutate({
        module_id: moduleId,
        academic_term_id: termId,
        session_date: sessionDate,
        session_type: sessionType,
        notes: null,
      })
    }
     
  }, [moduleId, termId, sessionDate, sessionType, findQ.isLoading, foundSession])

  return (
    <div className="space-y-4">
      {showDateStrip && (
        <DateStrip
          moduleId={moduleId}
          selected={sessionDate}
          onSelect={setSessionDate}
          allowedDows={allowedDows}
          scopeStartDate={scopeStartDate ?? null}
          scopeEndDate={scopeEndDate ?? null}
        />
      )}

      {termId === 0 && (
        <section className="card p-4 text-[12.5px] text-amber-900 bg-amber-50 border-amber-200 dark:bg-amber-900/30 dark:text-amber-100 dark:border-amber-700">
          Select an academic term at the top before recording — sessions must belong to a term.
        </section>
      )}

      {termId > 0 && (findQ.isLoading || (createMut.isPending && !foundSession)) && (
        <section className="card p-10 flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-brand" />
          <p className="text-[14px] text-ink-500 font-medium">Opening attendance roster…</p>
        </section>
      )}

      {foundSession && (
        <RosterEditor
          sessionId={foundSession.id}
          externalFilter={externalFilter}
          compact={compact}
          onBridge={onBridge}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['attendance-overview'] })
            qc.invalidateQueries({ queryKey: ['attendance-sessions'] })
            qc.invalidateQueries({ queryKey: ['attendance-find', moduleId, sessionDate, sessionType] })
            // Refresh the date strip so the just-recorded day picks up
            // its green ✓ badge without waiting for the next refetch tick.
            qc.invalidateQueries({ queryKey: ['attendance-strip-sessions', moduleId] })
          }}
        />
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
 * DateStrip — horizontal month-strip date picker for the Record tab.
 * Only days that match the schedule's day_pattern, fall inside [start,end],
 * and are today or earlier are clickable. Days where this module already
 * has a recorded session get a checkmark stamp.
 * ═══════════════════════════════════════════════════════════════════════ */
/**
 * Exported so the teacher course page can keep the date strip on screen in
 * review mode too, not only while the roster editor is open.
 */
export function DateStrip({ moduleId, selected, onSelect, allowedDows, scopeStartDate, scopeEndDate }: {
  moduleId: number
  selected: string
  onSelect: (iso: string) => void
  allowedDows: Set<number> | null
  scopeStartDate: string | null
  scopeEndDate: string | null
}) {
  const [monthRef, setMonthRef] = useState(() => {
    const d = new Date(selected + 'T00:00:00')
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  useEffect(() => {
    const d = new Date(selected + 'T00:00:00')
    if (d.getFullYear() !== monthRef.year || d.getMonth() !== monthRef.month) {
      setMonthRef({ year: d.getFullYear(), month: d.getMonth() })
    }
     
  }, [selected])

  const monthStart = useMemo(() => stripDateISO(new Date(monthRef.year, monthRef.month, 1)), [monthRef])
  const monthEnd = useMemo(() => stripDateISO(new Date(monthRef.year, monthRef.month + 1, 0)), [monthRef])
  const monthLabel = useMemo(
    () => new Date(monthRef.year, monthRef.month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
    [monthRef],
  )

  const sessionsQ = useQuery({
    queryKey: ['attendance-strip-sessions', moduleId, monthStart, monthEnd],
    queryFn: () => attendanceService.listSessions({
      module_id: moduleId, date_from: monthStart, date_to: monthEnd, per_page: 200,
    }),
    enabled: moduleId > 0,
    staleTime: 30_000,
  })
  const recordedDates = useMemo(() => {
    const s = new Set<string>()
    for (const r of sessionsQ.data?.data?.data ?? []) {
      if (Number(r.recorded_count ?? 0) > 0) s.add(r.session_date)
    }
    return s
  }, [sessionsQ.data])

  const days = useMemo(() => {
    const out: { iso: string; day: number; jsDow: number; backendDow: number }[] = []
    const last = new Date(monthRef.year, monthRef.month + 1, 0).getDate()
    for (let d = 1; d <= last; d++) {
      const date = new Date(monthRef.year, monthRef.month, d)
      const jsDow = date.getDay()              // 0 Sun … 6 Sat
      const backendDow = jsDow === 0 ? 7 : jsDow // 1 Mon … 7 Sun
      out.push({ iso: stripDateISO(date), day: d, jsDow, backendDow })
    }
    return out
  }, [monthRef])

  const today = todayISO()
  const goPrev = () => setMonthRef((m) => {
    const n = new Date(m.year, m.month - 1, 1); return { year: n.getFullYear(), month: n.getMonth() }
  })
  const goNext = () => setMonthRef((m) => {
    const n = new Date(m.year, m.month + 1, 1); return { year: n.getFullYear(), month: n.getMonth() }
  })
  const isCurrentMonth = (() => {
    const t = new Date()
    return t.getFullYear() === monthRef.year && t.getMonth() === monthRef.month
  })()

  const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  /** A date is selectable iff it matches the schedule's day-of-week pattern,
   *  sits inside [start_date, end_date], and isn't in the future. */
  const isSelectable = (iso: string, backendDow: number): boolean => {
    if (iso > today) return false
    if (scopeStartDate && iso < scopeStartDate) return false
    if (scopeEndDate && iso > scopeEndDate) return false
    if (allowedDows && !allowedDows.has(backendDow)) return false
    return true
  }

  // Month-nav clamping: prev disabled once the visible month already shows
  // (or precedes) the block's start month; next disabled once it reaches the
  // earlier of end_date and today.
  const minMonth = useMemo(() => {
    if (!scopeStartDate) return null
    const d = new Date(scopeStartDate + 'T00:00:00')
    return { year: d.getFullYear(), month: d.getMonth() }
  }, [scopeStartDate])
  const maxMonth = useMemo(() => {
    const t = new Date()
    let cap = t
    if (scopeEndDate) {
      const e = new Date(scopeEndDate + 'T00:00:00')
      if (e < cap) cap = e
    }
    return { year: cap.getFullYear(), month: cap.getMonth() }
  }, [scopeEndDate])
  const monthIndex = (m: { year: number; month: number }) => m.year * 12 + m.month
  const cmpRef = monthIndex(monthRef)
  const canGoPrev = minMonth ? cmpRef > monthIndex(minMonth) : true
  const canGoNext = cmpRef < monthIndex(maxMonth)

  return (
    <section className="card p-3">
      <div className="flex items-center gap-2 mb-2">
        <button
          type="button"
          onClick={goPrev}
          disabled={!canGoPrev}
          className="p-1 text-ink-500 hover:text-brand disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-ink-500"
          title={canGoPrev ? 'Previous month' : 'Reached the schedule start'}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="font-semibold text-[13px] text-ink-900 dark:text-white tabular-nums">{monthLabel}</span>
        <button
          type="button"
          onClick={goNext}
          disabled={!canGoNext}
          className="p-1 text-ink-500 hover:text-brand disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-ink-500"
          title={canGoNext ? 'Next month' : 'Reached the schedule end (or today)'}
        >
          <ChevronLeft className="w-4 h-4 rotate-180" />
        </button>
        <span className={`ml-1 px-2 py-0.5 text-[11.5px] rounded-md font-medium ${isCurrentMonth ? 'text-brand' : 'text-ink-400'}`}>
          {isCurrentMonth ? 'Current month' : ''}
        </span>
        {sessionsQ.isFetching && <Loader2 className="w-3.5 h-3.5 animate-spin text-ink-400" />}
        <span className="ml-auto text-[11px] text-ink-400 inline-flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Recorded
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded border border-brand bg-brand/10" /> Selected
          </span>
        </span>
      </div>
      <div className="overflow-x-auto">
        <div className="flex gap-0.5 min-w-max">
          {days.map((d) => {
            const isSelected = d.iso === selected
            const isToday = d.iso === today
            const isFuture = d.iso > today
            const allowed = isSelectable(d.iso, d.backendDow)
            const recorded = recordedDates.has(d.iso)
            const baseTone =
              isSelected
                ? 'border-brand bg-brand/10 ring-1 ring-brand/20'
                : isToday && allowed
                  ? 'border-amber-300 bg-amber-50 dark:bg-amber-900/15 dark:border-amber-700/60'
                  : allowed
                    ? 'border-ink-100 dark:border-ink-700/60 hover:bg-ink-50 dark:hover:bg-ink-800/60'
                    : 'border-transparent bg-ink-50/40 dark:bg-ink-800/20 opacity-50 cursor-not-allowed'
            return (
              <button
                key={d.iso}
                type="button"
                disabled={!allowed}
                onClick={() => onSelect(d.iso)}
                title={
                  !allowed
                    ? (isFuture ? 'Future dates can\'t be recorded' : 'Not part of this schedule')
                    : recorded ? `${d.iso} — already recorded` : d.iso
                }
                className={`relative w-12 shrink-0 flex flex-col items-center py-1.5 rounded-md border transition-colors ${baseTone}`}
              >
                <span className={`text-[10px] uppercase tracking-wider ${d.jsDow === 0 || d.jsDow === 6 ? 'text-rose-400' : 'text-ink-400'
                  }`}>
                  {DOW_SHORT[d.jsDow]}
                </span>
                <span className={`text-[14px] font-semibold tabular-nums ${isSelected ? 'text-brand' : isToday ? 'text-amber-700 dark:text-amber-300' : 'text-ink-700 dark:text-ink-200'
                  }`}>
                  {d.day}
                </span>
                {recorded && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                    <Check className="w-2.5 h-2.5" />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/** YYYY-MM-DD for a Date in local time (no UTC drift). */
function stripDateISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Most recent past-or-today date that lies in `allowedDows` and inside the
 *  optional [start,end] window. Walks back from min(today, end) and stops
 *  at start. Returns today (clamped to the window) if no day matches. */
/** Exported for the teacher course page, which owns its own date state. */
export function mostRecentAllowedDate(
  allowedDows: Set<number> | null,
  scopeStart: string | null | undefined,
  scopeEnd: string | null | undefined,
): string {
  const today = new Date()
  const todayIso = stripDateISO(today)
  // Pick the highest valid starting date: today, capped by end_date.
  const cap = (scopeEnd && todayIso > scopeEnd)
    ? new Date(scopeEnd + 'T00:00:00')
    : today
  for (let i = 0; i < 366; i++) {
    const d = new Date(cap.getFullYear(), cap.getMonth(), cap.getDate() - i)
    const iso = stripDateISO(d)
    if (scopeStart && iso < scopeStart) break
    const backendDow = d.getDay() === 0 ? 7 : d.getDay()
    if (allowedDows && !allowedDows.has(backendDow)) continue
    return iso
  }
  // No matching day inside the window — pick the start (or today as last fallback).
  return scopeStart ?? todayIso
}

function RosterEditor({ sessionId, onSaved, externalFilter, compact = false, onBridge }: {
  sessionId: number
  onSaved?: () => void
  /** Lets a host (the teacher course page) drive Save from its own header. */
  onBridge?: (api: { save: () => Promise<unknown>; saving: boolean; canSave: boolean } | null) => void
  /** When supplied, the roster's own search box is hidden and this value is
   *  used instead — the teacher course page owns the search in its header. */
  externalFilter?: string
  /** Drops the title/module line, which duplicates the host page's header. */
  compact?: boolean
}) {
  const qc = useQueryClient()
  const canRecord = useAnyPermission([PERMISSIONS.RECORD_ATTENDANCE, PERMISSIONS.MANAGE_ATTENDANCE])
  const canManage = usePermission(PERMISSIONS.MANAGE_ATTENDANCE)

  const q = useQuery({
    queryKey: ['attendance-session', sessionId],
    queryFn: () => attendanceService.showSession(sessionId),
  })

  const [edits, setEdits] = useState<Record<string, { status: AttendanceStatus; remarks?: string | null }>>({})
  const [ownFilter, setOwnFilter] = useState('')
  const usingExternalFilter = externalFilter !== undefined
  const filter = usingExternalFilter ? (externalFilter as string) : ownFilter
  const setFilter = setOwnFilter
  const [editMode, setEditMode] = useState(false)
  const [showEnroll, setShowEnroll] = useState(false)
  const [selectedRegs, setSelectedRegs] = useState<Set<string>>(new Set())

  const sessionData = q.data?.data
  const session = sessionData?.session
  const roster = sessionData?.roster ?? []
  const summary = sessionData?.summary ?? { total_roster: 0, present: 0, absent: 0, late: 0, excused: 0, unmarked: 0 }

  const isLocked = session?.is_locked === 1
  // If user has record perms, they should be able to edit unless explicitly locked
  const canEditNow = (canRecord && !isLocked) || editMode

  useEffect(() => {
    if (session) {
      if (session.status === 'open' && !isLocked) setEditMode(true)

      const init: typeof edits = {}
      for (const r of roster) {
        if (r.record_status) {
          init[r.regnumber] = { status: r.record_status as AttendanceStatus, remarks: r.remarks }
        }
      }
      setEdits(init)
    }
  }, [session?.id, isLocked, roster])

  const saveMut = useMutation({
    mutationFn: () => attendanceService.saveRecords(sessionId, {
      records: Object.entries(edits).map(([regnumber, v]) => ({
        student_regnumber: regnumber,
        status: v.status,
        remarks: v.remarks || null,
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


  const lockMut = useMutation({
    mutationFn: (locked: boolean) => attendanceService.toggleLock(sessionId, locked),
    onSuccess: (res) => {
      if (!res.success) return toast.error(res.message || 'Lock toggle failed.')
      toast.success(res.data?.is_locked ? 'Session locked.' : 'Session unlocked.')
      qc.invalidateQueries({ queryKey: ['attendance-session', sessionId] })
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Lock toggle failed.'),
  })

  const visible = useMemo(() => {
    if (!filter) return roster
    const f = filter.toLowerCase()
    return roster.filter(r =>
      `${r.fname} ${r.lname} ${r.regnumber}`.toLowerCase().includes(f)
    )
  }, [roster, filter])

  const markedCount = Object.keys(edits).length

  // Publish a save handle so a host header can own the Save button.
  //
  // The effect MUST be keyed on primitives only. Publishing a fresh object on
  // every render (no dep array) fed a new reference into the host's setState
  // each time, which re-rendered, which re-ran the effect — an infinite loop
  // that pinned the CPU. The callback is held in a ref so its identity is
  // stable while still closing over the latest mutation.
  const rosterSaveRef = useRef<() => Promise<unknown>>(() => Promise.resolve())
  rosterSaveRef.current = () => saveMut.mutateAsync()
  const canSaveNow = canEditNow && markedCount > 0 && !saveMut.isPending
  useEffect(() => {
    if (!onBridge) return
    onBridge({
      save:    () => rosterSaveRef.current(),
      saving:  saveMut.isPending,
      canSave: canSaveNow,
    })
    return () => onBridge(null)
  }, [onBridge, saveMut.isPending, canSaveNow])

  // Counts for live tally chips in header. Must be declared before early returns.
  const tally = useMemo(() => {
    const c = { present: 0, late: 0, absent: 0, excused: 0 }
    Object.values(edits).forEach((e) => { if (e.status) c[e.status]++ })
    return c
  }, [edits])

  if (q.isLoading) return <section className="card p-12 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand" /></section>
  if (q.isError || !sessionData || !session) return <section className="card p-8 text-center text-rose-500 font-medium">Failed to load attendance session.</section>

  // After guards, narrow session/module_code for downstream JSX.
  const moduleCode = session.module_code ?? ''

  const markAllPresent = () => {
    setEdits((prev) => {
      const next = { ...prev }
      roster.forEach((r) => { next[r.regnumber] = { status: 'present', remarks: next[r.regnumber]?.remarks ?? null } })
      return next
    })
  }

  const applyToSelected = (status: AttendanceStatus) => {
    setEdits((prev) => {
      const next = { ...prev }
      selectedRegs.forEach((reg) => { next[reg] = { status, remarks: next[reg]?.remarks ?? null } })
      return next
    })
    setSelectedRegs(new Set())
  }

  const progressPct = roster.length > 0 ? (markedCount / roster.length) * 100 : 0
  const allMarked = roster.length > 0 && markedCount === roster.length

  return (
    <section className="card p-0 overflow-hidden shadow-xl shadow-ink-900/5 dark:shadow-none border-ink-100 dark:border-ink-800">
      {/* ─── Header ─── */}
      <div className="border-b border-ink-100 dark:border-ink-700">
        {/* Title row */}
        <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <h4 className="text-[16px] sm:text-[17px] font-bold text-ink-900 dark:text-white">Attendance Roster</h4>
              <StatusChip status={session.status} />
              {isLocked && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                  <Lock className="w-3 h-3" /> Locked
                </span>
              )}
            </div>
            {!compact && (
              <p className="text-[12px] text-ink-500 truncate">
                <span className="font-semibold">{moduleCode}</span> · {session.module_name}
                <span className="hidden sm:inline"> · {summary.total_roster} students</span>
              </p>
            )}
          </div>

          {/* Right-side action cluster — primary Save button + secondary actions */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {/* Hidden when a host owns Save (teacher course page header) —
                two Save buttons on one screen is a coin toss for the user. */}
            {canEditNow && !onBridge && (
              <button
                className={`btn-primary inline-flex items-center gap-1.5 ${markedCount === 0 ? 'opacity-60' : ''}`}
                disabled={saveMut.isPending || markedCount === 0}
                onClick={() => saveMut.mutate()}
              >
                {saveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save{markedCount > 0 ? ` (${markedCount})` : ''}
              </button>
            )}
            {canManage && (
              <button
                className={`btn-secondary btn-sm h-9 ${isLocked ? 'text-emerald-700' : 'text-amber-700'}`}
                disabled={lockMut.isPending}
                onClick={() => lockMut.mutate(!isLocked)}
                title={isLocked ? 'Unlock session — let teacher edit' : 'Lock session — prevent edits'}
              >
                {lockMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (isLocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />)}
                {isLocked ? 'Unlock' : 'Lock'}
              </button>
            )}
            {canRecord && (
              <button className="btn-secondary btn-sm h-9 inline-flex items-center gap-1.5" onClick={() => setShowEnroll(true)}>
                <UserPlus className="w-3.5 h-3.5" /> Enroll
              </button>
            )}
          </div>
        </div>

        {/* Live tally — minimal, single line of dotted counts */}
        {markedCount > 0 && (
          <div className="px-4 sm:px-6 pb-3 flex items-center gap-3 flex-wrap text-[11.5px] text-ink-600 dark:text-ink-300">
            {STATUS_OPTIONS.map((opt) => {
              const v = tally[opt.key]
              if (v === 0) return null
              return (
                <span key={opt.key} className="inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: opt.dot }} />
                  {v} {opt.label.toLowerCase()}
                </span>
              )
            })}
            {markedCount < roster.length && (
              <span className="text-ink-400">{roster.length - markedCount} unmarked</span>
            )}
          </div>
        )}

        {/* Search + quick actions row */}
        <div className="px-4 sm:px-6 pb-3 flex flex-col sm:flex-row sm:items-center gap-2">
          <div className={`relative flex-1 min-w-0 ${usingExternalFilter ? 'hidden' : ''}`}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-400" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search students by name or reg #…"
              className="input pl-9 h-9 w-full text-[13px]"
            />
            {filter && (
              <button onClick={() => setFilter('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-ink-400 hover:text-ink-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {canEditNow && (
            <button
              className={`btn-secondary btn-sm h-9 inline-flex items-center gap-1.5 whitespace-nowrap ${allMarked ? 'opacity-60' : ''}`}
              disabled={allMarked}
              onClick={markAllPresent}
              title="Mark every student as present in one click"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> All present
            </button>
          )}

          {!canEditNow && canRecord && !isLocked && (
            <button className="btn-primary btn-sm h-9 inline-flex items-center gap-1.5 shrink-0" onClick={() => setEditMode(true)}>
              <Pencil className="w-3.5 h-3.5" /> Start recording
            </button>
          )}
        </div>

        {/* Progress bar */}
        {canEditNow && roster.length > 0 && (
          <div className="px-4 sm:px-6 pb-3">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-ink-500 mb-1.5">
              <div className="flex items-center gap-1.5">
                <ClipboardCheck className="w-3 h-3" />
                <span>Marking progress</span>
              </div>
              <span className={allMarked ? 'text-emerald-600' : 'text-ink-600 dark:text-ink-300'}>
                {markedCount} / {roster.length}
                <span className="ml-1 text-ink-400">({Math.round(progressPct)}%)</span>
              </span>
            </div>
            <div className="h-1.5 w-full bg-ink-100 dark:bg-ink-700/50 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ease-out ${allMarked ? 'bg-emerald-500' : 'bg-brand'}`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Locked banner for non-admin teachers */}
        {isLocked && !canManage && (
          <div className="px-4 sm:px-6 py-2.5 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 text-[12.5px] border-t border-amber-200 dark:border-amber-900/50 flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 shrink-0" /> This session is locked by an administrator — editing is disabled.
          </div>
        )}
      </div>

      {/* Selection bar — neutral, low-key */}
      {canEditNow && selectedRegs.size > 0 && (
        <div className="sticky top-0 z-20 px-4 sm:px-6 py-2 bg-ink-50 dark:bg-ink-800/60 border-b border-ink-200 dark:border-ink-700 flex items-center gap-2 flex-wrap text-[12px]">
          <span className="font-semibold text-ink-700 dark:text-ink-200">{selectedRegs.size} selected</span>
          <span className="text-ink-400">· Mark as</span>
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => applyToSelected(opt.key)}
              className="px-2 py-0.5 rounded text-[11px] font-medium text-ink-600 dark:text-ink-300 hover:bg-white dark:hover:bg-ink-700 transition-colors"
            >
              {opt.label}
            </button>
          ))}
          <button
            onClick={() => setSelectedRegs(new Set())}
            className="ml-auto text-[11px] text-ink-500 hover:text-ink-700 dark:hover:text-ink-200"
          >
            Clear
          </button>
        </div>
      )}

      {showEnroll && (
        <EnrollStudentModal
          moduleId={session.module_id}
          moduleCode={moduleCode}
          termId={session.academic_term_id}
          onClose={() => setShowEnroll(false)}
          onSuccess={() => {
            setShowEnroll(false)
            qc.invalidateQueries({ queryKey: ['attendance-session', sessionId] })
          }}
          existingRegnumbers={roster.map((r) => r.regnumber)}
        />
      )}

      {/* ─── Roster ─── */}
      {roster.length === 0 ? (
        <div className="p-10 text-center text-ink-500">
          <Users className="w-8 h-8 mx-auto text-ink-300 mb-2" />
          <p className="text-[13px]">No students enrolled in this module for this term.</p>
          {canRecord && (
            <button className="btn-primary btn-sm mt-3 inline-flex items-center gap-1.5" onClick={() => setShowEnroll(true)}>
              <UserPlus className="w-3.5 h-3.5" /> Enroll students
            </button>
          )}
        </div>
      ) : visible.length === 0 ? (
        <div className="p-10 text-center text-ink-500 text-[13px]">No students match "{filter}".</div>
      ) : (
        <>
          {/* Select-all bar (sits above roster) */}
          {canEditNow && visible.length > 0 && (
            <div className="px-4 sm:px-6 py-2 bg-ink-50/50 dark:bg-ink-800/20 border-b border-ink-100 dark:border-ink-700/50 flex items-center gap-2">
              <input
                id="select-all"
                type="checkbox"
                className="rounded border-ink-300 text-brand focus:ring-brand cursor-pointer"
                checked={visible.length > 0 && visible.every((r) => selectedRegs.has(r.regnumber))}
                ref={(el) => {
                  if (!el) return
                  const someSelected = visible.some((r) => selectedRegs.has(r.regnumber))
                  const allSelected = visible.every((r) => selectedRegs.has(r.regnumber))
                  el.indeterminate = someSelected && !allSelected
                }}
                onChange={(e) => {
                  const next = new Set(selectedRegs)
                  if (e.target.checked) visible.forEach((r) => next.add(r.regnumber))
                  else visible.forEach((r) => next.delete(r.regnumber))
                  setSelectedRegs(next)
                }}
              />
              <label htmlFor="select-all" className="text-[11.5px] text-ink-600 dark:text-ink-300 cursor-pointer select-none">
                Select all {filter ? 'visible' : ''} ({visible.length})
              </label>
            </div>
          )}

          {/* Responsive list — cards stacked on mobile, row layout on desktop */}
          <ul className="divide-y divide-ink-100 dark:divide-ink-700">
            {visible.map((row) => {
              const currentEdit = edits[row.regnumber]
              const initialStatus = row.record_status as AttendanceStatus | null
              return (
                <RosterRowEditor
                  key={row.regnumber}
                  row={row}
                  canEdit={canEditNow}
                  isSelected={selectedRegs.has(row.regnumber)}
                  onSelect={(sel) => {
                    const next = new Set(selectedRegs)
                    if (sel) next.add(row.regnumber); else next.delete(row.regnumber)
                    setSelectedRegs(next)
                  }}
                  edit={currentEdit ?? { status: initialStatus as AttendanceStatus, remarks: row.remarks }}
                  onChange={(val) => setEdits((prev) => {
                    const next = { ...prev }
                    if (val.status === null) delete next[row.regnumber]
                    else next[row.regnumber] = { status: val.status, remarks: val.remarks ?? null }
                    return next
                  })}
                />
              )
            })}
          </ul>
        </>
      )}

      {/* Compact bottom save bar (mobile-only, since header save isn't always in view on small screens) */}
      {canEditNow && roster.length > 0 && (
        <div className="sm:hidden sticky bottom-0 left-0 right-0 z-10 bg-white/95 dark:bg-ink-900/95 backdrop-blur border-t border-ink-100 dark:border-ink-700 px-4 py-3 flex items-center justify-between gap-3">
          <div className="text-[12px] text-ink-500">
            {markedCount === 0
              ? '0 marked'
              : allMarked
                ? <span className="text-emerald-600 font-semibold">All marked</span>
                : <>{markedCount} / {roster.length} marked</>}
          </div>
          <button
            className={`btn-primary inline-flex items-center gap-2 ${markedCount === 0 ? 'opacity-60' : ''} flex-1 justify-center min-h-11`}
            disabled={saveMut.isPending || markedCount === 0}
            onClick={() => saveMut.mutate()}
          >
            {saveMut.isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Save className="w-4 h-4" />}
            Save attendance{markedCount > 0 ? ` (${markedCount})` : ''}
          </button>
        </div>
      )}
    </section>
  )
}

function RosterRowEditor({
  row, canEdit, edit, onChange, isSelected, onSelect,
}: {
  row: RosterRow
  canEdit: boolean
  isSelected: boolean
  onSelect: (sel: boolean) => void
  edit?: { status: AttendanceStatus | null; remarks?: string | null }
  onChange: (val: { status: AttendanceStatus | null; remarks?: string | null }) => void
}) {
  const currentStatus = edit?.status ?? null
  const opt = currentStatus ? STATUS_OPTIONS.find((o) => o.key === currentStatus) : null
  const name = `${row.fname} ${row.lname}`.trim()
  const pct = Number(row.attendance_pct ?? 0)
  const totalSessions = Number(row.total_sessions ?? 0)

  // Subtle status-tinted row background. Selection also gets a slightly stronger
  // gray to remain distinguishable.
  const rowBg = isSelected
    ? 'bg-ink-100/70 dark:bg-ink-800/50'
    : opt
      ? ''  // inline style below
      : 'hover:bg-ink-50/50 dark:hover:bg-ink-800/20'
  const rowStyle = !isSelected && opt ? { backgroundColor: `${opt.dot}10` } : undefined

  return (
    <li className={`transition-colors ${rowBg}`} style={rowStyle}>
      <div className="px-4 sm:px-6 py-2.5 flex flex-col md:flex-row md:items-center gap-2.5 md:gap-4">
        {/* Left: select + identity */}
        <div className="flex items-center gap-2.5 min-w-0 md:flex-[0_0_36%]">
          {canEdit && (
            <input
              type="checkbox"
              className="rounded border-ink-300 text-brand focus:ring-brand cursor-pointer shrink-0"
              checked={isSelected}
              onChange={(e) => onSelect(e.target.checked)}
              aria-label={`Select ${name}`}
            />
          )}

          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-ink-800 dark:text-ink-100 truncate leading-snug">{name}</p>
            <p className="text-[10.5px] text-ink-400 font-mono truncate">{row.regnumber}</p>
          </div>

          {/* Compact attendance pill — mobile only */}
          <div className="md:hidden shrink-0">
            <AttendancePctMini value={pct} total={totalSessions} />
          </div>
        </div>

        {/* Status pills — click again to toggle off */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 flex-wrap">
            {STATUS_OPTIONS.map((o) => {
              const isActive = currentStatus === o.key
              return (
                <button
                  key={o.key}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => onChange({
                    status: isActive ? null : o.key,
                    remarks: edit?.remarks,
                  })}
                  className={`inline-flex items-center justify-center px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors flex-1 md:flex-none md:min-w-[72px] ${isActive
                      ? `${o.tone}`
                      : 'text-ink-500 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-ink-700/60'
                    } ${!canEdit ? 'opacity-50 cursor-not-allowed' : ''}`}
                  aria-pressed={isActive}
                  aria-label={`Mark ${name} ${o.label}`}
                >
                  {o.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Remarks */}
        <div className="md:w-[180px] md:shrink-0">
          {canEdit ? (
            <input
              value={edit?.remarks || ''}
              onChange={(e) => onChange({ status: currentStatus, remarks: e.target.value })}
              placeholder="Note…"
              className="input input-sm bg-white dark:bg-ink-900 w-full text-[12px] h-8"
              aria-label={`Remark for ${name}`}
            />
          ) : (
            <span className="text-[12px] text-ink-600 dark:text-ink-300 truncate block">
              {edit?.remarks || <span className="text-ink-300">—</span>}
            </span>
          )}
        </div>

        {/* Course attendance — desktop only */}
        <div className="hidden md:block md:w-[120px] md:shrink-0">
          <AttendancePctBar value={pct} present={Number(row.present_sessions ?? 0)} total={totalSessions} />
        </div>
      </div>
    </li>
  )
}

/** Compact attendance % pill for the mobile card layout. */
function AttendancePctMini({ value, total }: { value: number; total: number }) {
  if (!total) return <span className="text-[10px] text-ink-300">—</span>
  const color = value >= 85 ? '#10B981' : value >= 70 ? '#F59E0B' : '#E11D48'
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums"
      style={{ color, backgroundColor: `${color}1A` }}
    >
      {value}%
    </span>
  )
}

/** Course attendance bar shown on the desktop layout. */
function AttendancePctBar({ value, present, total }: { value: number; present: number; total: number }) {
  if (!total) return <span className="text-[10.5px] text-ink-300 uppercase tracking-tighter">No history</span>
  const color = value >= 85 ? '#10B981' : value >= 70 ? '#F59E0B' : '#E11D48'
  return (
    <div className="flex flex-col items-end gap-0.5">
      <div className="flex items-center gap-1.5 w-full">
        <div className="flex-1 h-1.5 bg-ink-100 dark:bg-ink-800 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, backgroundColor: color }} />
        </div>
        <span className="text-[11.5px] font-bold tabular-nums" style={{ color }}>{value}%</span>
      </div>
      <span className="text-[10px] text-ink-400 uppercase tracking-tighter">{present}/{total} sessions</span>
    </div>
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
    module_id: moduleId || undefined,
  }

  const q = useQuery({
    queryKey: ['attendance-sessions', effective],
    queryFn: () => attendanceService.listSessions(effective),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  const delMut = useMutation({
    mutationFn: (id: number) => attendanceService.deleteSession(id),
    onSuccess: (res) => {
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
                const marked = Number(r.recorded_count ?? 0)
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
      className={`inline-flex items-center gap-1.5 px-3 py-2 text-[13px] rounded-md transition-colors ${active ? 'bg-brand text-white font-semibold shadow-sm' : 'text-ink-600 dark:text-ink-300 hover:text-ink-900 hover:bg-ink-50 dark:hover:text-white dark:hover:bg-ink-700/40'
        }`}
    >
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  )
}

function StatusChip({ status }: { status: 'open' | 'closed' }) {
  const map = {
    open: { Icon: Clock, klass: 'bg-amber-50 text-amber-700', label: 'Open' },
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

/* ═══════════════════════════════════════════════════════════════════════════
 * SchedulePicker — landing view. Shows every schedule on the timetable as
 * a flat table (one row per teaching block) with the assigned teacher.
 * Click a row → roster + attendance recording for that module.
 * ═══════════════════════════════════════════════════════════════════════ */
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Render the comma-separated `day_pattern` (e.g. "1,2,3,4,5") as
 *  "Mon–Fri" / "Mon, Wed". Falls back to single `day_of_week` when the
 *  pattern field isn't set. */
function formatDayPattern(pattern: string | null, dayOfWeek: number | null): string {
  const days = (pattern && pattern.trim() !== ''
    ? pattern.split(',').map((s) => Number(s.trim())).filter((n) => n >= 1 && n <= 7)
    : (dayOfWeek ? [dayOfWeek] : []))
  if (!days.length) return '—'
  return days.map((d) => DAY_LABELS[d - 1]).join(', ')
}

function SchedulePicker({
  canManage,
  teachableModuleIds, teachableLoading, programId, onChangeProgram, onPickProgram,
  onPickModule,
}: {
  canManage: boolean
  teachableModuleIds: number[]
  teachableLoading: boolean
  programId: number
  onChangeProgram: () => void
  onPickProgram: (id: number) => void
  onPickModule: (
    moduleId: number,
    code: string,
    name: string,
    scope?: { day_pattern?: string | null; start_date?: string | null; end_date?: string | null },
  ) => void
}) {
  const [gLevel, setGLevel] = useState(0)
  const [gSearch, setGSearch] = useState('')

  const programsQ = useQuery({
    queryKey: ['portal', 'programs'],
    queryFn: () => portalService.getPrograms(),
    staleTime: 5 * 60_000,
  })
  const program = useMemo(
    () => (programsQ.data?.data ?? []).find((p) => Number(p.id) === programId) ?? null,
    [programsQ.data, programId],
  )

  const levelsQ = useQuery({ queryKey: ['academics', 'levels'], queryFn: () => academicsMgmtService.list<any>('levels', { per_page: 100 }), staleTime: 5 * 60_000 })
  const levels: any[] = levelsQ.data?.data?.data ?? []

  // Same data-source the Module scheduling page uses: `module_offerings`
  // joined with module/programme/instructor labels. Server returns a flat
  // list of every block across every programme & mode.
  const blocksQ = useQuery({
    queryKey: ['attendance', 'scheduled-blocks', programId || 0],
    queryFn: () => attendanceService.scheduledBlocks(
      programId ? { program_id: programId } : {},
    ),
    staleTime: 60_000,
  })
  const allBlocks = blocksQ.data?.data?.rows ?? []

  const teachableSet = useMemo(() => new Set(teachableModuleIds), [teachableModuleIds])

  const filteredBlocks = useMemo(() => {
    let list = allBlocks
    // Role scope: non-admins only see blocks for modules they teach.
    if (!canManage) list = list.filter((b) => teachableSet.has(Number(b.module_id)))
    if (gLevel) list = list.filter((b) => Number(b.level ?? 0) === gLevel)
    if (gSearch.trim()) {
      const q = gSearch.toLowerCase()
      list = list.filter((b) =>
        (b.module_code ?? '').toLowerCase().includes(q)
        || (b.module_name ?? '').toLowerCase().includes(q)
        || (b.program_name ?? '').toLowerCase().includes(q),
      )
    }
    return list
  }, [allBlocks, canManage, teachableSet, gLevel, gSearch])

  const hasFilters = gLevel > 0 || gSearch.trim().length > 0
  const totalForRole = canManage
    ? allBlocks.length
    : allBlocks.filter((b) => teachableSet.has(Number(b.module_id))).length

  return (
    <div className="max-w-[1400px] mx-auto space-y-4 animate-fade-in">
      {/* Hero — page title + filter bar. Programme is one optional filter
          among others; users land on the full list of scheduled modules. */}
      <section className="card p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-semibold text-ink-900 dark:text-white">
              Attendance — scheduled modules
            </h2>
            <p className="text-[12px] text-ink-500">
              Every module that has a teaching block on the timetable. Click a module to open its roster and record attendance.
            </p>
          </div>
        </div>

        {/* Filter bar — programme is now an optional dropdown alongside
            search and level. Empty programme = show every scheduled module. */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-ink-400 shrink-0" />
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              className="input input-sm pl-8 w-full"
              placeholder="Search by module code or name…"
              value={gSearch}
              onChange={(e) => setGSearch(e.target.value)}
            />
          </div>
          <div className="w-72 shrink-0">
            <SearchableSelect
              options={(programsQ.data?.data ?? []).map((p: any) => ({ value: p.id, label: p.name }))}
              value={programId}
              onChange={(v) => onPickProgram(Number(v))}
              allLabel="All programmes"
            />
          </div>
          <div className="w-44 shrink-0">
            <SearchableSelect
              options={levels.map((l: any) => ({ value: l.id, label: l.name }))}
              value={gLevel}
              onChange={(v) => setGLevel(Number(v))}
              allLabel="All levels"
            />
          </div>
          {(hasFilters || programId > 0) && (
            <button
              type="button"
              className="icon-btn text-ink-400 hover:text-rose-500"
              title="Clear all filters"
              onClick={() => { setGLevel(0); setGSearch(''); if (programId > 0) onChangeProgram() }}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {program && (
          <div className="mt-3 inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-brand/5 border border-brand/20 text-[11.5px] text-brand">
            <BookOpen className="w-3.5 h-3.5" />
            <span className="font-semibold">{program.name}</span>
            <span className="text-ink-500">· {[program.department_name, program.faculty_name].filter(Boolean).join(' · ')}</span>
            <button
              type="button"
              onClick={onChangeProgram}
              className="ml-1 text-ink-400 hover:text-rose-500"
              title="Clear programme filter"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {!canManage && totalForRole === 0 && !teachableLoading && !blocksQ.isLoading && (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 p-3 text-[12.5px] text-amber-800 dark:text-amber-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            No schedules are assigned to you. Ask an admin to assign a module schedule to you.
          </div>
        )}
      </section>

      {/* All schedules — one row per teaching block. Mirrors the Module
          scheduling page so admins can see the full timetable plus the
          assigned teacher. Click any row to open that module's roster. */}
      <section className="card p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-ink-100 dark:border-ink-700 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-[14px] text-ink-900 dark:text-white">
              All schedules ({filteredBlocks.length})
            </h3>
            <p className="text-[11.5px] text-ink-500 mt-0.5">
              Same data as Module scheduling. Click any row to open the module's roster and record attendance.
            </p>
          </div>
          {blocksQ.isFetching && <Loader2 className="w-3.5 h-3.5 animate-spin text-ink-400" />}
        </div>

        {blocksQ.isLoading ? (
          <div className="p-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-ink-400" /></div>
        ) : filteredBlocks.length === 0 ? (
          <div className="p-8 text-center text-ink-500 text-[13px]">
            No teaching blocks on the timetable yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Module &amp; component</th>
                  <th>Programme</th>
                  <th>Activity</th>
                  <th>Sem</th>
                  <th>Day</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Period</th>
                  <th>Teacher</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredBlocks.map((b) => {
                  const pickScope = {
                    day_pattern: b.day_pattern ?? (b.day_of_week ? String(b.day_of_week) : null),
                    start_date: b.start_date,
                    end_date: b.end_date,
                  }
                  const pick = () => onPickModule(b.module_id, b.module_code ?? '', b.module_name ?? '', pickScope)
                  return (
                    <tr
                      key={b.block_id}
                      className="cursor-pointer hover:bg-ink-50/50 dark:hover:bg-ink-700/20"
                      onClick={pick}
                    >
                      <td className="font-mono text-[12px] font-semibold">{b.module_code ?? '—'}</td>
                      <td className="text-[12.5px]">{b.module_name ?? '—'}</td>
                      <td className="text-[12px] text-ink-500">{b.program_acro ?? b.program_name ?? '—'}</td>
                      <td className="text-[12px]">{b.activity ?? '—'}</td>
                      <td className="text-[12px] text-ink-500">{b.semesters ?? '—'}</td>
                      <td className="text-[12px]">{formatDayPattern(b.day_pattern, b.day_of_week)}</td>
                      <td className="text-[12px] tabular-nums text-ink-500">{b.start_date ?? '—'}</td>
                      <td className="text-[12px] tabular-nums text-ink-500">{b.end_date ?? '—'}</td>
                      <td className="text-[12px] tabular-nums text-ink-500">
                        {b.start_time?.slice(0, 5) ?? '—'}–{b.end_time?.slice(0, 5) ?? '—'}
                      </td>
                      <td className="text-[12px] text-ink-700 dark:text-ink-200">{b.instructor_name ?? '—'}</td>
                      <td className="text-right">
                        <button
                          type="button"
                          className="btn-primary btn-sm"
                          onClick={(e) => { e.stopPropagation(); pick() }}
                        >
                          Record
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

    </div>
  )
}

/** Returns the YYYY-MM-DD of the occurrence of `dow` (1=Mon..7=Sun) in the week of `refDateISO`. */
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

function EnrollStudentModal({ moduleId, moduleCode, termId, onClose, onSuccess, existingRegnumbers = [] }: { moduleId: number; moduleCode: string; termId: number; onClose: () => void; onSuccess: () => void; existingRegnumbers?: string[] }) {
  // The current programme scope lives in the page URL (`program_id`). Default
  // student lookup is scoped to that programme so admins immediately see the
  // cohort that should be in the module — no manual filtering required.
  const [sp] = useSearchParams()
  const programId = Number(sp.get('program_id') || 0)

  const [q, setQ] = useState('')
  const debouncedQ = useDebounce(q, 300)
  const [faculty, setFaculty] = useState('')
  const [department, setDepartment] = useState('')
  const [picking, setPicking] = useState<Student | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // All historical registrations for this module (any term, any status) —
  // used to hide students who have already studied / are studying it. Active
  // session roster is also excluded via `existingRegnumbers`.
  const moduleRegsQ = useQuery({
    queryKey: ['attendance-module-regs-all', moduleId],
    queryFn: () => moduleRegistrationService.list({ module_id: moduleId }),
    staleTime: 30_000,
  })
  const studiedSet = useMemo(() => {
    const set = new Set<string>(existingRegnumbers)
    for (const r of moduleRegsQ.data?.data ?? []) {
      if (r.student_regnumber) set.add(r.student_regnumber)
    }
    return set
  }, [moduleRegsQ.data, existingRegnumbers])

  const studentsQ = useQuery({
    queryKey: ['attendance-students-search', debouncedQ, faculty, department, programId],
    queryFn: () => studentService.list({
      q: debouncedQ || undefined,
      per_page: 200,
      faculty: faculty || undefined,
      department: department || undefined,
      // Admin-picked programme at the page level — scopes the cohort by default.
      // Faculty/department/search filters are additive on top of this scope.
      std_option: programId ? String(programId) : undefined,
    }),
    staleTime: 10_000,
  })

  const statsQ = useQuery({
    queryKey: ['student-stats-facets'],
    queryFn: () => studentService.stats(),
    staleTime: 300_000,
  })
  const facets = statsQ.data?.data?.facets

  const regMut = useMutation({
    mutationFn: (student: Student) => {
      const reg = student.regnumber || (student as any).student_regnumber
      if (!reg) throw new Error('Student has no registration number.')
      return moduleRegistrationService.create({
        module_id: moduleId,
        academic_term_id: termId,
        student_regnumber: reg,
        status: 'registered',
      })
    },
    onSuccess: (res) => {
      if (!res.success) return toast.error(res.message || 'Enrollment failed.')
      toast.success('Student enrolled successfully.')
      onSuccess()
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed to enroll student.'),
  })

  const bulkMut = useMutation({
    mutationFn: () => moduleRegistrationService.bulkRegister({
      module_id: moduleId,
      academic_term_id: termId,
      student_regnumbers: Array.from(selected),
    }),
    onSuccess: (res: any) => {
      if (!res.success) return toast.error(res.message || 'Bulk enrollment failed.')
      toast.success(`${res.data.created} students enrolled successfully.`)
      onSuccess()
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Bulk enrollment failed.'),
  })

  const allStudents = studentsQ.data?.data?.data ?? []
  // Hide anyone who already studied or is registered for this module — the
  // user wants a list of "students in the programme who have NOT studied
  // this module". Filtering client-side keeps the API contract narrow.
  const students = useMemo(
    () => allStudents.filter((s) => {
      const reg = s.regnumber || (s as any).student_regnumber
      return reg && !studiedSet.has(reg)
    }),
    [allStudents, studiedSet],
  )
  const hiddenCount = allStudents.length - students.length

  const toggleSelect = (reg: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(reg)) next.delete(reg)
      else next.add(reg)
      return next
    })
  }

  const selectAll = () => {
    setSelected(prev => {
      const next = new Set(prev)
      students.forEach((s) => {
        const reg = s.regnumber || (s as any).student_regnumber
        if (reg) next.add(reg)
      })
      return next
    })
  }

  return (
    <Modal open={true} title={`Enroll Students in ${moduleCode}`} onClose={onClose} size="xl">
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <h5 className="text-[14px] font-bold text-ink-900 dark:text-white">Find and select students</h5>
            <p className="text-[12px] text-ink-500">
              Showing students in the selected programme who haven't taken this module yet. Add filters or a search if you want to narrow further.
              {hiddenCount > 0 && (
                <span className="ml-1 text-ink-400">({hiddenCount} already enrolled or completed — hidden)</span>
              )}
            </p>
          </div>
          {selected.size > 0 && (
            <button
              onClick={() => bulkMut.mutate()}
              disabled={bulkMut.isPending}
              className="btn-primary btn-sm px-6 shadow-lg shadow-brand/20 animate-in zoom-in duration-200"
            >
              {bulkMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
              Enroll {selected.size} Selected
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
          <div className="md:col-span-5 relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 group-focus-within:text-brand transition-colors" />
            <input
              autoFocus
              className="input pl-10 w-full"
              placeholder="Search by name or reg #…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="md:col-span-3">
            <select
              className="input w-full bg-white dark:bg-ink-900 text-[13px]"
              value={faculty}
              onChange={(e) => setFaculty(e.target.value)}
            >
              <option value="">All Faculties</option>
              {facets?.faculty?.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <div className="md:col-span-4">
            <select
              className="input w-full bg-white dark:bg-ink-900 text-[13px]"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            >
              <option value="">All Departments</option>
              {facets?.department?.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
        </div>

        <div className="border border-ink-100 dark:border-ink-800 rounded-xl overflow-hidden bg-white dark:bg-ink-950 shadow-sm">
          <div className="px-4 py-2 bg-ink-50/50 dark:bg-ink-900/50 border-b border-ink-100 dark:border-ink-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={selectAll}
                className="text-[11px] font-bold text-brand hover:underline uppercase tracking-tight"
              >
                Select All on page
              </button>
              <div className="w-px h-3 bg-ink-200 dark:bg-ink-800" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-ink-400">
                {students.length} students found
              </span>
            </div>
            {selected.size > 0 && (
              <button onClick={() => setSelected(new Set())} className="text-[11px] text-rose-600 font-bold hover:underline">
                Clear {selected.size} selections
              </button>
            )}
          </div>

          <div className="h-[450px] overflow-y-auto divide-y divide-ink-50 dark:divide-ink-900 custom-scrollbar">
            {studentsQ.isLoading ? (
              <div className="p-12 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-brand" />
                <p className="text-[13px] text-ink-400">Loading student records…</p>
              </div>
            ) : students.length === 0 ? (
              <div className="p-12 text-center">
                <Users className="w-10 h-10 text-ink-200 mx-auto mb-3" />
                <p className="text-[13px] text-ink-500 font-medium">No students match.</p>
                <p className="text-[12px] text-ink-400 mt-1">
                  {programId
                    ? 'No remaining students in this programme have yet to take this module.'
                    : 'Pick a programme on the attendance page first to see the cohort.'}
                </p>
              </div>
            ) : (
              students.map((s) => {
                const reg = s.regnumber || (s as any).student_regnumber
                const isSelected = selected.has(reg)

                return (
                  <div
                    key={s.id}
                    className={`p-3 flex items-center justify-between transition-all group/row cursor-pointer ${isSelected ? 'bg-brand/[0.04]' : 'hover:bg-brand/[0.01]'}`}
                    onClick={() => toggleSelect(reg)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all cursor-pointer ${isSelected ? 'bg-brand border-brand text-white' : 'border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-900'}`}>
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                      </div>
                      <div className="w-10 h-10 rounded-full bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-400 flex items-center justify-center font-bold text-[13px] border border-ink-200 dark:border-ink-700">
                        {s.fname[0]}{s.lname[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-[14px] text-ink-900 dark:text-white truncate">{s.fname} {s.lname}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="font-mono text-[11px] text-ink-400 uppercase tracking-tighter">{reg || 'NO REG #'}</span>
                          <span className="w-1 h-1 rounded-full bg-ink-200 dark:bg-ink-700" />
                          <span className="text-[11px] text-ink-500 truncate">{String(s.department_name || s.program || 'General')}</span>
                        </div>
                      </div>
                    </div>

                    <div onClick={e => e.stopPropagation()}>
                      <button
                        type="button"
                        disabled={regMut.isPending || !reg}
                        onClick={() => { setPicking(s); regMut.mutate(s) }}
                        className="btn-secondary btn-sm px-4 bg-white dark:bg-ink-900 hover:bg-brand hover:text-white hover:border-brand transition-all"
                      >
                        {regMut.isPending && picking?.id === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Enroll'}
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-1">
          <button type="button" className="btn-secondary px-6" onClick={onClose}>Close</button>
        </div>
      </div>
    </Modal>
  )
}

// Silence unused lint — reserved for future per-row warnings on excused/manual logs.
void XCircle; void FileWarning
