import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import {
  Plus, Trash2, Pencil, Loader2, AlertCircle, CalendarClock, Save, Upload, Download,
  Search, ChevronDown, X, MapPin, User, CheckCircle2,
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import SearchableSelect from '@/components/ui/SearchableSelect'
import RoleGroupedSelect, { type GroupedOption } from '@/components/ui/RoleGroupedSelect'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import ModalPortal from '@/components/ui/ModalPortal'
import { academicService } from '@/services/academicService'
import { academicsMgmtService } from '@/services/academicsMgmtService'
import { useSessionStorage } from '@/hooks/useSessionStorage'
import type { AcademicTerm } from '@/types/academic'

/* ============================================================
   Module Scheduling — pick a program + mode, manage each
   module's teaching blocks through a focused modal.
   ============================================================ */

type ServerBlock = {
  id:              number
  start_date:      string | null
  end_date:        string | null
  semesters:       string | null
  academic_year:   string | null
  day_of_week:     number | null
  /** Comma-separated ISO day numbers (1=Mon…7=Sun). May be multi-day. */
  day_pattern:     string | null
  start_time:      string | null
  end_time:        string | null
  instructor_id:   number | null
  instructor_name: string | null
  activity:        string | null
  year_of_study:   number | null
  campus_id:       number | null
}
type ServerModule = {
  module_id:      number
  module_order:   number | null
  module_code:    string
  module_name:    string
  module_credits: number | null
  level:          number | null
  blocks:         ServerBlock[]
}

/** A working-copy block: tracks its server `id` (if any), plus a local
 *  React key so add/remove flows work. Drafts have id=null and get
 *  inserted by the backend on save. */
type WorkingBlock = {
  _key:            string
  id:              number | null
  module_id:       number
  start_date:      string
  end_date:        string
  semesters:       string
  day_of_week:     number | ''
  /** Selected ISO day numbers (1=Mon…7=Sun). Empty = "any day". */
  day_pattern:     number[]
  start_time:      string  // 'HH:MM'
  end_time:        string  // 'HH:MM'
  instructor_id:   number | ''
  instructor_name: string
  activity:        string
  year_of_study:   number | ''
  campus_id:       number | ''
}

type BlockIssues = {
  startAfterEnd:        boolean
  endBeforeStartTime:   boolean
  endTimeWithoutStart:  boolean
}

function validateBlock(b: WorkingBlock): BlockIssues {
  const startAfterEnd =
    !!b.start_date && !!b.end_date && b.end_date < b.start_date
  const endBeforeStartTime =
    !!b.start_time && !!b.end_time && b.end_time <= b.start_time
  const endTimeWithoutStart = !b.start_time && !!b.end_time
  return { startAfterEnd, endBeforeStartTime, endTimeWithoutStart }
}
const blockHasIssue = (i: BlockIssues) => i.startAfterEnd || i.endBeforeStartTime || i.endTimeWithoutStart

/** Field-level diff of a working block vs its server snapshot, so edits to
 *  existing (saved) blocks count toward the dirty state. */
const CMP_FIELDS: Array<keyof WorkingBlock> = ['start_date', 'end_date', 'semesters', 'day_of_week', 'start_time', 'end_time', 'instructor_id', 'instructor_name', 'activity', 'year_of_study', 'campus_id']
function blockChanged(a: WorkingBlock, b: WorkingBlock): boolean {
  if (CMP_FIELDS.some((f) => a[f] !== b[f])) return true
  const ap = [...a.day_pattern].sort((x, y) => x - y)
  const bp = [...b.day_pattern].sort((x, y) => x - y)
  return ap.length !== bp.length || ap.some((d, i) => d !== bp[i])
}

const ACTIVITY_OPTIONS = ['', 'Teaching', 'Final Exam', 'Lab', 'Tutorial', 'Workshop']
const SEMESTER_OPTIONS = [
  '', 'S1', 'S2', 'S1&S2',
  'S3', 'S4', 'S3&S4',
  'S5', 'S6', 'S5&S6',
  'S7', 'S8', 'S7&S8',
]
const YEAR_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8]
const DAY_LABELS: Record<number, string> = {
  1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun',
}
const WEEKDAYS = [1, 2, 3, 4, 5]
const WEEKEND  = [6, 7]

const SCHED_MODES: Array<{ v: string; label: string }> = [
  { v: 'Day', label: 'Day' },
  { v: 'Weekend', label: 'Weekend' },
  { v: 'Holiday', label: 'Holiday' },
  { v: '', label: 'Unassigned' },
]

/** Teaching titles bubble to the top of the lecturer dropdown; everything
 *  else follows alphabetically, with "Other" (no title) last. */
const ROLE_GROUP_ORDER = [
  'Professor', 'Associate Professor', 'Senior Lecturer', 'Lecturer',
  'Assistant Lecturer', 'Tutor', 'HOD', 'Dean', 'Director', 'Registrar',
]

function parseDayPattern(pattern: string | null | undefined, dayOfWeek: number | null | undefined): number[] {
  const out = new Set<number>()
  const raw = (pattern ?? '').trim().toLowerCase()
  if (raw === 'weekdays' || raw === 'mon-fri' || raw === 'monday-friday') {
    WEEKDAYS.forEach((d) => out.add(d))
  } else if (raw === 'weekend' || raw === 'sat-sun' || raw === 'saturday-sunday') {
    WEEKEND.forEach((d) => out.add(d))
  } else if (raw) {
    for (const tok of raw.split(/[,\s]+/)) {
      const n = Number(tok)
      if (Number.isInteger(n) && n >= 1 && n <= 7) out.add(n)
    }
  } else if (typeof dayOfWeek === 'number' && dayOfWeek >= 1 && dayOfWeek <= 7) {
    out.add(dayOfWeek)
  }
  return [...out].sort((a, b) => a - b)
}

function formatDayPattern(days: number[]): string {
  if (days.length === 0) return '— any —'
  const sorted = [...days].sort((a, b) => a - b)
  const isWeekdays = sorted.length === 5 && sorted.every((d, i) => d === i + 1)
  const isWeekend  = sorted.length === 2 && sorted[0] === 6 && sorted[1] === 7
  if (isWeekdays) return 'Mon–Fri'
  if (isWeekend)  return 'Sat–Sun'
  if (sorted.length === 7) return 'All week'
  return sorted.map((d) => DAY_LABELS[d]).join(', ')
}

/** 'HH:MM' → 'HHhMM' (university timetable convention). */
const fmtHm = (t: string | '') => (t ? `${t.slice(0, 2)}h${t.slice(3, 5)}` : '')
/** Normalised module code for duplicate detection ("ADPR 2322" === "ADPR2322"). */
const normCode = (c: string) => c.replace(/\s+/g, '').toUpperCase()

/** Compact one-line summary of a block for the list chips. */
function blockSummary(b: WorkingBlock): string {
  const days = formatDayPattern(b.day_pattern)
  const time = b.start_time && b.end_time
    ? `${fmtHm(b.start_time)}–${fmtHm(b.end_time)}`
    : b.start_time ? fmtHm(b.start_time) : ''
  const parts: string[] = []
  if (days && days !== '— any —') parts.push(days)
  if (time) parts.push(time)
  const label = parts.join(' ')
  return label || b.activity || 'Block'
}

function newDraftBlock(moduleId: number): WorkingBlock {
  return {
    _key:        `new-${moduleId}-${Math.random().toString(36).slice(2, 8)}`,
    id:          null,
    module_id:   moduleId,
    start_date:  '', end_date: '',
    semesters:   '',
    day_of_week: '',
    day_pattern: [],
    start_time:  '', end_time: '',
    instructor_id:   '',
    instructor_name: '',
    activity:    '',
    year_of_study:   '',
    campus_id:       '',
  }
}
function serverBlockToWorking(moduleId: number, b: ServerBlock): WorkingBlock {
  return {
    _key:        `b-${b.id}`,
    id:          b.id,
    module_id:   moduleId,
    start_date:  b.start_date ?? '',
    end_date:    b.end_date   ?? '',
    semesters:   b.semesters  ?? '',
    day_of_week: b.day_of_week ?? '',
    day_pattern: parseDayPattern(b.day_pattern, b.day_of_week),
    start_time:  b.start_time ? b.start_time.slice(0, 5) : '',
    end_time:    b.end_time   ? b.end_time.slice(0, 5)   : '',
    instructor_id:   b.instructor_id ?? '',
    instructor_name: b.instructor_id ? '' : (b.instructor_name ?? ''),
    activity:    b.activity ?? '',
    year_of_study:   b.year_of_study ?? '',
    campus_id:       b.campus_id ?? '',
  }
}

/** Trigger the timetable export and save the response as an .xlsx mirroring
 *  the university's spreadsheet layout. The leading `ID` column carries the
 *  offering's primary key so a re-import updates rows in place. */
async function downloadTimetable() {
  try {
    const res = await academicsMgmtService.exportTimetable()
    const rows = res.data?.rows ?? []
    if (rows.length === 0) {
      toast.error('No timetable data to export yet.')
      return
    }
    const headers = [
      'ID',
      'M', 'DPT', 'OPT', 'Attendance Mode',
      'Module & Component', 'Code',
      'Credits', 'Total Contact Hours',
      'Start Date', 'End Date', 'Period',
      'Hours/Day', 'Total Days', 'Total Weeks',
      'Activity', "Lecturer's Name",
      'Level', 'Year', 'Sem', 'Campus',
    ]
    const fmtDate = (iso: string | null) => {
      if (!iso) return ''
      const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      if (!m) return iso
      return `${Number(m[2])}/${Number(m[3])}/${m[1]}`
    }
    const fmtPeriod = (s: string | null, e: string | null) => {
      const fmt = (t: string) => t.slice(0, 2) + 'h' + t.slice(3, 5)
      if (!s || !e) return ''
      return `${fmt(s)}:${fmt(e)}`
    }
    const hoursPerDay = (s: string | null, e: string | null): number | '' => {
      if (!s || !e) return ''
      const toMin = (t: string) => {
        const m = t.match(/^(\d{1,2}):(\d{2})/); if (!m) return NaN
        return Number(m[1]) * 60 + Number(m[2])
      }
      const diff = toMin(e) - toMin(s)
      if (!Number.isFinite(diff) || diff <= 0) return ''
      return Math.round((diff / 60) * 100) / 100
    }
    const round1 = (n: number) => Math.round(n * 10) / 10
    const data = rows.map((r) => {
      const start = r.start_date ?? ''
      const month = start ? Number(start.slice(5, 7)) : ''
      const dayCount: number | '' = (r.start_date && r.end_date)
        ? (Math.round((+new Date(r.end_date) - +new Date(r.start_date)) / 86_400_000) + 1)
        : ''
      const hpd = hoursPerDay(r.start_time, r.end_time)
      const totalHours: number | '' =
        typeof hpd === 'number' && typeof dayCount === 'number'
          ? Math.round(hpd * dayCount * 100) / 100
          : ''
      const weeks: number | '' = typeof dayCount === 'number' ? round1(dayCount / 7) : ''
      return [
        r.id ?? '',
        month,
        r.dep_acronym ?? '',
        r.option_acro ?? '',
        r.mode === 'Day' ? 'DP' : r.mode === 'Weekend' ? 'WK' : r.mode === 'Holiday' ? 'HD' : '',
        r.module_name ?? '',
        r.module_code ?? '',
        r.module_credits ?? '',
        totalHours,
        fmtDate(r.start_date),
        fmtDate(r.end_date),
        fmtPeriod(r.start_time, r.end_time),
        hpd,
        dayCount,
        weeks,
        r.activity ?? '',
        r.instructor_full_name ?? r.instructor_name_raw ?? '',
        r.level ?? '',
        r.year_of_study ?? '',
        r.semesters ?? '',
        r.campus_name ?? '',
      ]
    })
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Timetable')
    XLSX.writeFile(wb, 'Timetable.xlsx')
    toast.success(`Exported ${rows.length} block${rows.length === 1 ? '' : 's'}.`)
  } catch (e: any) {
    toast.error(e?.response?.data?.message ?? 'Export failed')
  }
}

function SchedEmpty({ icon: Icon = CalendarClock, title, msg }: { icon?: typeof CalendarClock; title?: string; msg: string }) {
  return (
    <div className="rounded-xl border border-dashed border-ink-200 dark:border-ink-700 p-12 text-center">
      <div className="inline-flex w-12 h-12 rounded-full bg-brand/10 text-brand dark:bg-brand/25 dark:text-gold-400 items-center justify-center mb-3">
        <Icon className="w-6 h-6" />
      </div>
      {title && <h3 className="text-[15px] font-semibold text-ink-900 dark:text-ink-100 mb-1">{title}</h3>}
      <p className="text-[13px] text-ink-500 max-w-md mx-auto">{msg}</p>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   MAIN PANEL
   ════════════════════════════════════════════════════════════ */
export default function SchedulingPanel() {
  const qc = useQueryClient()
  const [programId, setProgramId] = useSessionStorage<number | ''>('sched.programId', '')
  const [mode,      setMode]      = useSessionStorage<string>('sched.mode', 'Day')
  const [termId,    setTermId]    = useSessionStorage<number | ''>('sched.termId', '')

  const [working, setWorking] = useState<Record<number, WorkingBlock[]>>({})
  const [originalIds, setOriginalIds] = useState<Set<number>>(new Set())
  const [originalById, setOriginalById] = useState<Map<number, WorkingBlock>>(new Map())
  const [importOpen, setImportOpen] = useState(false)

  // List filters + which module's modal is open.
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'unscheduled' | 'has'>('all')
  const [managingModuleId, setManagingModuleId] = useState<number | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Reset working copy whenever the user changes program / mode / term.
  useEffect(() => {
    setWorking({})
    setOriginalIds(new Set())
    setOriginalById(new Map())
  }, [programId, mode, termId])

  const termsQ = useQuery({ queryKey: ['academic', 'terms'], queryFn: () => academicService.listTerms() })
  const terms = (termsQ.data?.data ?? []) as AcademicTerm[]
  const selectedTerm = useMemo(() => terms.find((t) => t.id === Number(termId)) ?? null, [terms, termId])
  useEffect(() => {
    if (termId === '' && terms.length > 0) {
      const active = terms.find((t) => !!t.is_current)
      if (active) setTermId(active.id)
    }
  }, [terms, termId])
  const termStart = selectedTerm?.start_date ?? ''
  const termEnd   = selectedTerm?.end_date   ?? ''

  const programsQ = useQuery({
    queryKey: ['acmgmt', 'options', 'all'],
    queryFn:  () => academicsMgmtService.list<any>('options', { per_page: 1000 }),
  })
  const programs = (programsQ.data?.data?.data ?? []) as Array<{ id: number; name: string; code?: string; department_id?: number }>

  const departmentsQ = useQuery({
    queryKey: ['acmgmt', 'departments', 'all'],
    queryFn:  () => academicsMgmtService.list<any>('departments', { per_page: 500 }),
    staleTime: 5 * 60 * 1000,
  })
  const deptNameById = useMemo(() => {
    const m = new Map<number, string>()
    for (const d of (departmentsQ.data?.data?.data ?? []) as any[]) m.set(Number(d.dep_id), String(d.dep_name ?? ''))
    return m
  }, [departmentsQ.data])

  const instructorsQ = useQuery({
    queryKey: ['scheduling', 'instructors'],
    queryFn:  () => academicsMgmtService.getInstructors(),
    staleTime: 5 * 60 * 1000,
  })
  const instructors = (instructorsQ.data?.data?.rows ?? []) as Array<{ id: number; full_name: string; position: string | null }>

  const campusesQ = useQuery({
    queryKey: ['scheduling', 'campuses'],
    queryFn:  () => academicsMgmtService.list<any>('campuses', { per_page: 1000 }),
    staleTime: 5 * 60 * 1000,
  })
  const campuses = (campusesQ.data?.data?.data ?? []) as Array<{ id: number; name: string }>

  const schedulesQ = useQuery({
    queryKey: ['scheduling', programId, mode],
    queryFn:  () => academicsMgmtService.getSchedules(Number(programId), mode),
    enabled:  !!programId,
  })
  const rows = (schedulesQ.data?.data?.rows ?? []) as ServerModule[]

  // Hydrate the working copy when server data arrives.
  useEffect(() => {
    if (!schedulesQ.data) return
    const next: Record<number, WorkingBlock[]> = {}
    const ids = new Set<number>()
    const byId = new Map<number, WorkingBlock>()
    rows.forEach((m) => {
      next[m.module_id] = m.blocks.map((b) => {
        ids.add(b.id)
        const wb = serverBlockToWorking(m.module_id, b)
        byId.set(b.id, wb)
        return wb
      })
    })
    setWorking(next)
    setOriginalIds(ids)
    setOriginalById(byId)
  }, [schedulesQ.data])

  const blocksOf = (moduleId: number): WorkingBlock[] => working[moduleId] ?? []
  const setBlocks = (moduleId: number, list: WorkingBlock[]) => setWorking((prev) => ({ ...prev, [moduleId]: list }))
  const updateBlock = (moduleId: number, key: string, patch: Partial<WorkingBlock>) =>
    setBlocks(moduleId, blocksOf(moduleId).map((b) => b._key === key ? { ...b, ...patch } : b))
  const addBlock = (moduleId: number): string => {
    const draft = newDraftBlock(moduleId)
    setBlocks(moduleId, [...blocksOf(moduleId), draft])
    return draft._key
  }
  const removeBlock = (moduleId: number, key: string) =>
    setBlocks(moduleId, blocksOf(moduleId).filter((b) => b._key !== key))

  // Reconcile working copy against the server snapshot.
  const { allBlocks, deleteIds, dirty, dirtyCount } = useMemo(() => {
    const all: WorkingBlock[] = []
    const presentIds = new Set<number>()
    for (const list of Object.values(working)) {
      for (const b of list) { all.push(b); if (b.id !== null) presentIds.add(b.id) }
    }
    const dels = [...originalIds].filter((id) => !presentIds.has(id))
    const news = all.filter((b) => b.id === null).length
    const modified = all.filter((b) => b.id !== null && originalById.get(b.id) && blockChanged(b, originalById.get(b.id)!)).length
    return {
      allBlocks: all,
      deleteIds: dels,
      dirty: news > 0 || dels.length > 0 || modified > 0,
      dirtyCount: news + dels.length + modified,
    }
  }, [working, originalIds, originalById])

  const issuesByKey = useMemo(() => {
    const map = new Map<string, BlockIssues>()
    for (const b of allBlocks) {
      const issues = validateBlock(b)
      if (blockHasIssue(issues)) map.set(b._key, issues)
    }
    return map
  }, [allBlocks])
  const invalidCount = issuesByKey.size
  const canSave      = dirty && invalidCount === 0

  const saveM = useMutation({
    mutationFn: () => {
      const blocks = allBlocks.map((b) => ({
        ...(b.id !== null ? { id: b.id } : {}),
        module_id:       b.module_id,
        start_date:      b.start_date || null,
        end_date:        b.end_date   || null,
        semesters:       b.semesters  || null,
        day_of_week:     b.day_pattern.length === 1 ? b.day_pattern[0]
                       : b.day_of_week === '' ? null : Number(b.day_of_week),
        day_pattern:     b.day_pattern.length ? b.day_pattern.join(',') : null,
        start_time:      b.start_time || null,
        end_time:        b.end_time   || null,
        instructor_id:   b.instructor_id === '' ? null : Number(b.instructor_id),
        instructor_name: b.instructor_name || null,
        activity:        b.activity   || null,
        year_of_study:   b.year_of_study === '' ? null : Number(b.year_of_study),
        campus_id:       b.campus_id === '' ? null : Number(b.campus_id),
      }))
      return academicsMgmtService.saveSchedules({ program_id: Number(programId), mode, blocks, delete_ids: deleteIds })
    },
    onSuccess: (res) => {
      const d = res.data ?? { created: 0, updated: 0, deleted: 0, failed: [] }
      const summary = [
        d.created ? `${d.created} new` : null,
        d.updated ? `${d.updated} updated` : null,
        d.deleted ? `${d.deleted} deleted` : null,
      ].filter(Boolean).join(', ')
      toast.success(summary ? `Schedule saved — ${summary}.` : 'Schedule saved.')
      if (d.failed.length > 0) {
        const first = d.failed[0]
        toast.error(d.failed.length === 1 ? `Block #${first.index}: ${first.error}` : `${d.failed.length} blocks failed — first: ${first.error}`)
      }
      qc.invalidateQueries({ queryKey: ['scheduling'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to save schedule'),
  })

  // ── Derived option lists ──
  const programOptions: GroupedOption[] = useMemo(
    () => programs.map((p) => ({
      value: Number(p.id),
      label: p.code ? `${p.code} · ${p.name}` : p.name,
      group: (p.department_id != null ? deptNameById.get(Number(p.department_id)) : '') || 'Other programs',
    })),
    [programs, deptNameById],
  )
  const instructorOptions: GroupedOption[] = useMemo(
    () => instructors.map((i) => ({
      value: i.id,
      label: i.full_name,
      sub: i.position ?? undefined,
      group: (i.position ?? '').trim() || 'Other',
    })),
    [instructors],
  )
  const campusOptions: GroupedOption[] = useMemo(
    () => campuses.map((c) => ({ value: c.id, label: c.name })),
    [campuses],
  )
  const instructorById = useMemo(() => {
    const m = new Map<number, { full_name: string; position: string | null }>()
    instructors.forEach((i) => m.set(i.id, { full_name: i.full_name, position: i.position }))
    return m
  }, [instructors])
  const campusById = useMemo(() => {
    const m = new Map<number, string>()
    campuses.forEach((c) => m.set(c.id, c.name))
    return m
  }, [campuses])

  const selectedProgramLabel = programOptions.find((o) => o.value === Number(programId))?.label ?? ''

  // ── Filtered + sorted module list ──
  const sortedModules = useMemo(() => {
    return [...rows].sort((a, b) => {
      const mo = (a.module_order ?? 9999) - (b.module_order ?? 9999)
      return mo !== 0 ? mo : a.module_code.localeCompare(b.module_code)
    })
  }, [rows])

  const dupCodes = useMemo(() => {
    const seen = new Map<string, number>()
    sortedModules.forEach((m) => seen.set(normCode(m.module_code), (seen.get(normCode(m.module_code)) ?? 0) + 1))
    return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([c]) => c))
  }, [sortedModules])

  const visibleModules = useMemo(() => {
    const q = search.trim().toLowerCase()
    return sortedModules.filter((m) => {
      if (q && !(`${m.module_code} ${m.module_name}`.toLowerCase().includes(q))) return false
      const n = blocksOf(m.module_id).length
      if (statusFilter === 'unscheduled' && n > 0) return false
      if (statusFilter === 'has' && n === 0) return false
      return true
    })
  }, [sortedModules, search, statusFilter, working])

  const scheduledCount = useMemo(() => sortedModules.filter((m) => blocksOf(m.module_id).length > 0).length, [sortedModules, working])

  // `/` focuses the module search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !managingModuleId && !importOpen) {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        e.preventDefault(); searchRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [managingModuleId, importOpen])

  const managingModule = managingModuleId != null ? rows.find((m) => m.module_id === managingModuleId) ?? null : null

  return (
    <section className="card p-6 min-h-[calc(100vh-12rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-md bg-brand/10 text-brand dark:bg-brand/25 dark:text-gold-400 flex items-center justify-center shrink-0">
          <CalendarClock className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h2 className="section-title">Module scheduling</h2>
          <p className="section-sub">
            {programId
              ? 'Pick a module to manage its teaching blocks — schedules open in a focused editor.'
              : 'Choose a program to begin — every block is scoped to one program at a time.'}
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="card-tight !p-3 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(200px,1.5fr)_150px_minmax(190px,1.1fr)_auto] gap-3 items-end">
          {/* Program */}
          <div className="min-w-0">
            <label className="label">Program <span className="text-red-500">*</span></label>
            <RoleGroupedSelect
              options={programOptions}
              value={programId === '' ? '' : Number(programId)}
              onChange={(v) => setProgramId(v ? Number(v) : '')}
              placeholder="Search & pick a program…"
              ariaLabel="Program"
              groupOrder={[]}
            />
          </div>

          {/* Mode */}
          <div className="min-w-0">
            <label className="label">Mode</label>
            <select className="input input-sm w-full" value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Attendance mode">
              {SCHED_MODES.map((m) => <option key={m.v || 'none'} value={m.v}>{m.label}</option>)}
            </select>
          </div>

          {/* Term */}
          <div className="min-w-0">
            <label className="label">
              Academic term
              {selectedTerm && <span className="ml-1 text-[10.5px] text-ink-400 font-normal">({termStart} → {termEnd})</span>}
            </label>
            <SearchableSelect
              options={terms.map((t) => ({
                value: t.id,
                label: `${t.label}${t.is_current ? ' • active' : ''}${t.start_date && t.end_date ? ` (${t.start_date} → ${t.end_date})` : ''}`,
              }))}
              value={termId === '' ? 0 : Number(termId)}
              onChange={(v) => setTermId(v ? Number(v) : '')}
              allLabel="— no term (no date bounds) —"
              placeholder="Pick a term…"
            />
          </div>

          {/* Actions */}
          <div className="flex items-end gap-2">
            <button className="btn-secondary" onClick={() => downloadTimetable()} disabled={!programId} title="Export every block to a university-format .xlsx">
              <Download className="w-4 h-4" /> <span className="hidden sm:inline">Export</span>
            </button>
            <button className="btn-secondary" onClick={() => setImportOpen(true)} title="Upload the university timetable spreadsheet">
              <Upload className="w-4 h-4" /> <span className="hidden sm:inline">Import</span>
            </button>
            <button
              className="btn-primary"
              onClick={() => saveM.mutate()}
              disabled={!canSave || saveM.isPending}
              title={!dirty ? 'No changes to save' : invalidCount > 0 ? `Fix ${invalidCount} invalid block${invalidCount === 1 ? '' : 's'} first` : 'Save schedule'}
            >
              {saveM.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {invalidCount > 0 ? `${invalidCount} invalid` : dirtyCount > 0 ? `Save (${dirtyCount})` : 'Save'}
            </button>
          </div>
        </div>
        {selectedProgramLabel && (
          <p className="mt-2 text-[11px] text-ink-500">
            Currently scheduling: <span className="font-semibold text-ink-700 dark:text-ink-200">{selectedProgramLabel}</span>
          </p>
        )}
      </div>

      {invalidCount > 0 && (
        <div className="mb-3 rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-[12.5px] text-red-700 dark:text-red-300 flex items-center gap-2" role="alert">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span><strong>{invalidCount}</strong> block{invalidCount === 1 ? ' has' : 's have'} an invalid time or date range. Fix them before saving.</span>
        </div>
      )}

      {/* Body */}
      {!programId ? (
        <SchedEmpty title="Which program are you scheduling?" msg="Modules, mode, dates and lecturers are all tracked per program. Pick one above to load its modules." />
      ) : schedulesQ.isLoading ? (
        <div className="py-16 flex items-center justify-center text-ink-500 text-[13px]"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading schedule…</div>
      ) : rows.length === 0 ? (
        <SchedEmpty msg="This program has no modules linked yet. Add modules via the Modules tab first, then come back." />
      ) : (
        <>
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                ref={searchRef}
                className="input input-sm pl-7 w-full"
                placeholder="Search modules…  ( / )"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button
              type="button"
              className={`text-[12px] px-2.5 py-1.5 rounded-md border transition-colors ${statusFilter === 'unscheduled' ? 'bg-brand text-brand-ink border-brand' : 'border-ink-200 dark:border-ink-700 text-ink-600 dark:text-ink-300 hover:border-brand hover:text-brand'}`}
              onClick={() => setStatusFilter((s) => s === 'unscheduled' ? 'all' : 'unscheduled')}
            >
              Unscheduled only
            </button>
            <button
              type="button"
              className={`text-[12px] px-2.5 py-1.5 rounded-md border transition-colors ${statusFilter === 'has' ? 'bg-brand text-brand-ink border-brand' : 'border-ink-200 dark:border-ink-700 text-ink-600 dark:text-ink-300 hover:border-brand hover:text-brand'}`}
              onClick={() => setStatusFilter((s) => s === 'has' ? 'all' : 'has')}
            >
              Has blocks
            </button>
            <span className="ml-auto text-[12px] text-ink-400">
              {scheduledCount}/{sortedModules.length} scheduled
            </span>
          </div>

          {/* Modules list */}
          {visibleModules.length === 0 ? (
            <SchedEmpty icon={Search} msg="No modules match your filters." />
          ) : (
            <div className="card overflow-hidden">
              <table className="data-table text-[12.5px]">
                <thead>
                  <tr>
                    <th className="w-[44px]">#</th>
                    <th className="w-[130px]">Code</th>
                    <th>Module</th>
                    <th className="w-[34%]">Teaching blocks</th>
                    <th className="w-[130px]">Status</th>
                    <th className="w-[120px] text-right">Manage</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleModules.map((m, i) => (
                    <ModuleScheduleRow
                      key={m.module_id}
                      index={i + 1}
                      module={m}
                      blocks={blocksOf(m.module_id)}
                      issuesByKey={issuesByKey}
                      isDup={dupCodes.has(normCode(m.module_code))}
                      instructorById={instructorById}
                      onManage={() => setManagingModuleId(m.module_id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Per-module schedule modal */}
      {managingModule && (
        <ScheduleModuleModal
          module={managingModule}
          mode={mode}
          blocks={blocksOf(managingModule.module_id)}
          issuesByKey={issuesByKey}
          instructorOptions={instructorOptions}
          instructorById={instructorById}
          campusOptions={campusOptions}
          campusById={campusById}
          termStart={termStart}
          termEnd={termEnd}
          dirtyCount={dirtyCount}
          invalidCount={invalidCount}
          saving={saveM.isPending}
          onAddBlock={() => addBlock(managingModule.module_id)}
          onUpdateBlock={(key, patch) => updateBlock(managingModule.module_id, key, patch)}
          onRemoveBlock={(key) => removeBlock(managingModule.module_id, key)}
          onSaveAll={() => saveM.mutate(undefined, { onSuccess: () => setManagingModuleId(null) })}
          onClose={() => setManagingModuleId(null)}
        />
      )}

      {/* Import-timetable dialog */}
      <ImportTimetableModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onDone={() => qc.invalidateQueries({ queryKey: ['scheduling'] })}
      />
    </section>
  )
}

/* ════════════════════════════════════════════════════════════
   MODULE ROW (compact, one per module)
   ════════════════════════════════════════════════════════════ */
function ModuleScheduleRow({
  index, module: m, blocks, issuesByKey, isDup, instructorById, onManage,
}: {
  index: number
  module: ServerModule
  blocks: WorkingBlock[]
  issuesByKey: Map<string, BlockIssues>
  isDup: boolean
  instructorById: Map<number, { full_name: string; position: string | null }>
  onManage: () => void
}) {
  const n = blocks.length
  const invalid = blocks.filter((b) => issuesByKey.has(b._key)).length
  const subBits = [m.level != null ? `L${m.level}` : null, m.module_credits != null ? `${m.module_credits}cr` : null].filter(Boolean).join(' · ')

  return (
    <tr
      className="cursor-pointer hover:bg-ink-50 dark:hover:bg-ink-700/30 transition-colors"
      onClick={onManage}
      role="button"
      aria-label={`Manage schedule for ${m.module_code} ${m.module_name}`}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onManage() }}
    >
      <td className="text-ink-400 font-mono text-[12px]">{m.module_order ?? index}</td>
      <td className="font-mono font-semibold whitespace-nowrap text-ink-700 dark:text-ink-200">
        {m.module_code}
        {isDup && <span className="ml-1.5 chip-warning !px-1.5 !py-0 text-[9.5px] align-middle" title={`Duplicate code · module #${m.module_id}`}>dup</span>}
      </td>
      <td>
        <div className="text-ink-900 dark:text-white truncate max-w-[260px]" title={m.module_name}>{m.module_name}</div>
        {subBits && <div className="text-[11px] text-ink-400">{subBits}</div>}
      </td>
      <td onClick={(e) => e.stopPropagation()}>
        {n === 0 ? (
          <span className="text-ink-400">—</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {blocks.slice(0, 2).map((b) => {
              const bad = issuesByKey.has(b._key)
              const lect = b.instructor_id !== '' ? instructorById.get(Number(b.instructor_id))?.full_name : b.instructor_name
              return (
                <span
                  key={b._key}
                  className={`${bad ? 'chip-danger' : 'chip-soft'} !text-[10.5px]`}
                  title={lect ? `${blockSummary(b)} · ${lect}` : blockSummary(b)}
                >
                  {blockSummary(b)}
                </span>
              )
            })}
            {n > 2 && <span className="chip-soft !text-[10.5px]">+{n - 2} more</span>}
          </div>
        )}
      </td>
      <td>
        {n === 0 ? (
          <span className="chip-warning !text-[10.5px]">Not scheduled</span>
        ) : invalid > 0 ? (
          <span className="chip-danger !text-[10.5px]">{invalid} invalid</span>
        ) : (
          <span className="chip-success !text-[10.5px]"><CheckCircle2 className="w-3 h-3" /> Scheduled · {n}</span>
        )}
      </td>
      <td className="text-right" onClick={(e) => e.stopPropagation()}>
        <button className="btn-ghost btn-sm" onClick={onManage}>
          {n > 0 ? <><Pencil className="w-3.5 h-3.5" /> Manage</> : <><Plus className="w-3.5 h-3.5" /> Schedule</>}
        </button>
      </td>
    </tr>
  )
}

/* ════════════════════════════════════════════════════════════
   PER-MODULE MODAL  (State A: block list · State B: editor)
   ════════════════════════════════════════════════════════════ */
function ScheduleModuleModal({
  module: m, mode, blocks, issuesByKey, instructorOptions, instructorById, campusOptions, campusById,
  termStart, termEnd, dirtyCount, invalidCount, saving,
  onAddBlock, onUpdateBlock, onRemoveBlock, onSaveAll, onClose,
}: {
  module: ServerModule
  mode: string
  blocks: WorkingBlock[]
  issuesByKey: Map<string, BlockIssues>
  instructorOptions: GroupedOption[]
  instructorById: Map<number, { full_name: string; position: string | null }>
  campusOptions: GroupedOption[]
  campusById: Map<number, string>
  termStart: string
  termEnd: string
  dirtyCount: number
  invalidCount: number
  saving: boolean
  onAddBlock: () => string
  onUpdateBlock: (key: string, patch: Partial<WorkingBlock>) => void
  onRemoveBlock: (key: string) => void
  onSaveAll: () => void
  onClose: () => void
}) {
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const freshKeys = useRef<Set<string>>(new Set())

  const startAdd = () => { const key = onAddBlock(); freshKeys.current.add(key); setEditingKey(key) }
  const editing = editingKey ? blocks.find((b) => b._key === editingKey) ?? null : null

  const handleEditorSave = (patch: Partial<WorkingBlock>) => {
    if (!editingKey) return
    onUpdateBlock(editingKey, patch)
    freshKeys.current.delete(editingKey)
    setEditingKey(null)
  }
  const handleEditorCancel = () => {
    if (editingKey && freshKeys.current.has(editingKey)) {
      onRemoveBlock(editingKey)
      freshKeys.current.delete(editingKey)
    }
    setEditingKey(null)
  }
  // Close the whole modal, discarding an untouched fresh draft if the editor
  // is open so we never leave an orphan empty block in the working copy.
  const closeAll = () => {
    if (editingKey && freshKeys.current.has(editingKey)) {
      onRemoveBlock(editingKey)
      freshKeys.current.delete(editingKey)
    }
    onClose()
  }

  // Esc: in the editor it backs out to the block list; in the list it closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || confirmDelete) return
      if (editingKey) handleEditorCancel()
      else onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [editingKey, confirmDelete, onClose])

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 backdrop-blur-sm p-4">
        <div className="bg-white dark:bg-ink-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-ink-100 dark:border-ink-700">
            <div className="min-w-0">
              <h3 className="font-bold text-[15px] text-ink-900 dark:text-white truncate">
                <span className="font-mono">{m.module_code}</span> · {m.module_name}
              </h3>
              <p className="text-[11.5px] text-ink-500">{editing ? (freshKeys.current.has(editing._key) ? 'New teaching block' : 'Edit teaching block') : 'Teaching blocks'}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {mode && <span className="chip-primary !text-[10.5px]">{mode}</span>}
              <button className="icon-btn" onClick={closeAll} aria-label="Close"><X className="w-4 h-4" /></button>
            </div>
          </div>

          {/* Body */}
          <div className="px-5 py-4 overflow-y-auto">
            {editing ? (
              <BlockEditor
                key={editing._key}
                block={editing}
                instructorOptions={instructorOptions}
                campusOptions={campusOptions}
                termStart={termStart}
                termEnd={termEnd}
                onSave={handleEditorSave}
                onCancel={handleEditorCancel}
              />
            ) : blocks.length === 0 ? (
              <div className="text-center py-10">
                <div className="inline-flex w-12 h-12 rounded-full bg-brand/10 text-brand dark:bg-brand/25 dark:text-gold-400 items-center justify-center mb-3">
                  <CalendarClock className="w-6 h-6" />
                </div>
                <p className="text-[13px] text-ink-500 mb-4">No teaching blocks yet for this module.</p>
                <button className="btn-primary" onClick={startAdd}><Plus className="w-4 h-4" /> Add first block</button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {[...blocks].sort((a, b) => (a.start_date || '9').localeCompare(b.start_date || '9')).map((b) => {
                  const bad = issuesByKey.has(b._key)
                  const lect = b.instructor_id !== '' ? instructorById.get(Number(b.instructor_id))?.full_name : (b.instructor_name || null)
                  const camp = b.campus_id !== '' ? campusById.get(Number(b.campus_id)) : null
                  const time = b.start_time && b.end_time ? `${fmtHm(b.start_time)}–${fmtHm(b.end_time)}` : b.start_time ? fmtHm(b.start_time) : '—'
                  return (
                    <div key={b._key} className={`card-tight !p-3 flex items-start gap-3 ${bad ? 'border-red-300 dark:border-red-700' : ''}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                          {b.day_pattern.length > 0
                            ? b.day_pattern.map((d) => <span key={d} className="chip-soft !px-1.5 !py-0 !text-[10px]">{DAY_LABELS[d]}</span>)
                            : <span className="text-[11px] text-ink-400">Any day</span>}
                          <span className="font-semibold text-[13px] text-ink-900 dark:text-white ml-1">{time}</span>
                          {b.activity && <span className="chip-primary !text-[10px]">{b.activity}</span>}
                          {b.id === null && <span className="chip-gold !text-[10px]">new</span>}
                        </div>
                        <div className="text-[11.5px] text-ink-500 flex items-center gap-x-3 gap-y-0.5 flex-wrap">
                          <span className="inline-flex items-center gap-1"><User className="w-3 h-3" /> {lect || 'Unassigned'}</span>
                          <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> {camp || 'Any campus'}</span>
                          {b.year_of_study !== '' && <span>Yr {b.year_of_study}</span>}
                          {b.semesters && <span>{b.semesters}</span>}
                          {(b.start_date || b.end_date) && <span>{b.start_date || '…'} → {b.end_date || '…'}</span>}
                        </div>
                        {bad && <p className="error-text">Invalid time or date range — fix before saving.</p>}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button className="icon-btn" title="Edit block" onClick={() => setEditingKey(b._key)}><Pencil className="w-3.5 h-3.5" /></button>
                        <button className="icon-btn text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" title="Delete block" onClick={() => setConfirmDelete(b._key)}><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Footer (hidden while the editor is open — editor has its own) */}
          {!editing && (
            <div className="px-5 py-4 border-t border-ink-100 dark:border-ink-700 flex items-center gap-2">
              <span className="text-[11.5px] text-ink-400 mr-auto">
                {invalidCount > 0 ? `${invalidCount} invalid block${invalidCount === 1 ? '' : 's'}` : dirtyCount > 0 ? `${dirtyCount} unsaved change${dirtyCount === 1 ? '' : 's'}` : 'All changes saved'}
              </span>
              {blocks.length > 0 && (
                <button className="btn-secondary" onClick={startAdd}><Plus className="w-4 h-4" /> Add another</button>
              )}
              <button className="btn-secondary" onClick={onClose}>Close</button>
              <button className="btn-primary" onClick={onSaveAll} disabled={saving || invalidCount > 0 || dirtyCount === 0} title={invalidCount > 0 ? 'Fix invalid blocks first' : dirtyCount === 0 ? 'No changes to save' : 'Save schedule'}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save schedule
              </button>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => { if (confirmDelete) onRemoveBlock(confirmDelete); setConfirmDelete(null) }}
        title="Delete teaching block?"
        message="This removes the block from the schedule. It is deleted permanently when you save."
        confirmLabel="Delete"
        variant="danger"
      />
    </ModalPortal>
  )
}

/* ════════════════════════════════════════════════════════════
   BLOCK EDITOR (local draft; commits to working on Save)
   ════════════════════════════════════════════════════════════ */
function BlockEditor({
  block, instructorOptions, campusOptions, termStart, termEnd, onSave, onCancel,
}: {
  block: WorkingBlock
  instructorOptions: GroupedOption[]
  campusOptions: GroupedOption[]
  termStart: string
  termEnd: string
  onSave: (patch: Partial<WorkingBlock>) => void
  onCancel: () => void
}) {
  const [d, setD] = useState<WorkingBlock>(() => ({ ...block }))
  const set = (patch: Partial<WorkingBlock>) => setD((prev) => ({ ...prev, ...patch }))
  const issues = validateBlock(d)
  const valid = !blockHasIssue(issues)
  const errInput = 'border-red-400 dark:border-red-500 focus:ring-red-300'
  const dateBad = issues.startAfterEnd
  const timeBad = issues.endBeforeStartTime || issues.endTimeWithoutStart
  const timeMsg = issues.endBeforeStartTime ? 'End time must be after start time' : issues.endTimeWithoutStart ? 'Set a start time too' : ''

  return (
    <div className="space-y-3.5">
      {/* Days */}
      <div>
        <label className="label">Day(s)</label>
        <DaysPicker value={d.day_pattern} onChange={(next) => set({ day_pattern: next, day_of_week: next.length === 1 ? next[0] : '' })} />
      </div>

      {/* Times */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Start time</label>
          <input type="time" className={`input input-sm w-full ${timeBad ? errInput : ''}`} value={d.start_time} onChange={(e) => set({ start_time: e.target.value })} />
        </div>
        <div>
          <label className="label">End time</label>
          <input type="time" className={`input input-sm w-full ${timeBad ? errInput : ''}`} min={d.start_time || undefined} value={d.end_time} onChange={(e) => set({ end_time: e.target.value })} />
        </div>
        {timeMsg && <p className="error-text col-span-2 -mt-1">{timeMsg}</p>}
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Start date</label>
          <input type="date" className={`input input-sm w-full ${dateBad ? errInput : ''}`} min={termStart || undefined} max={termEnd || undefined} value={d.start_date} onChange={(e) => set({ start_date: e.target.value })} />
        </div>
        <div>
          <label className="label">End date</label>
          <input type="date" className={`input input-sm w-full ${dateBad ? errInput : ''}`} min={(d.start_date || termStart) || undefined} max={termEnd || undefined} value={d.end_date} onChange={(e) => set({ end_date: e.target.value })} />
        </div>
        {dateBad && <p className="error-text col-span-2 -mt-1">End date can't be before start date.</p>}
        {(termStart || termEnd) && !dateBad && <p className="col-span-2 text-[11px] text-ink-400 -mt-1">Dates are bounded by the selected term.</p>}
      </div>

      {/* Activity + Semester */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Activity</label>
          <select className="input input-sm w-full" value={d.activity} onChange={(e) => set({ activity: e.target.value })}>
            {ACTIVITY_OPTIONS.map((a) => <option key={a || 'none'} value={a}>{a || '—'}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Semester</label>
          <select className="input input-sm w-full" value={d.semesters} onChange={(e) => set({ semesters: e.target.value })}>
            {SEMESTER_OPTIONS.map((s) => <option key={s || 'none'} value={s}>{s || '—'}</option>)}
          </select>
        </div>
      </div>

      {/* Lecturer */}
      <div>
        <label className="label">Lecturer</label>
        {d.instructor_id === '' && d.instructor_name ? (
          <div className="flex items-center gap-2 input input-sm">
            <span className="italic text-ink-700 dark:text-ink-200 truncate flex-1">{d.instructor_name}</span>
            <span className="chip-warning !text-[10px]">unmatched</span>
            <button type="button" className="text-[11.5px] text-brand hover:underline" onClick={() => set({ instructor_name: '' })}>Pick from list</button>
          </div>
        ) : (
          <RoleGroupedSelect
            options={instructorOptions}
            value={d.instructor_id === '' ? '' : Number(d.instructor_id)}
            onChange={(v) => set({ instructor_id: v === '' ? '' : Number(v) })}
            placeholder="Search staff by name or role…"
            allLabel="— unassigned —"
            ariaLabel="Lecturer"
            groupOrder={ROLE_GROUP_ORDER}
            showSubOnTrigger
          />
        )}
      </div>

      {/* Campus + Year */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Campus</label>
          <RoleGroupedSelect
            options={campusOptions}
            value={d.campus_id === '' ? '' : Number(d.campus_id)}
            onChange={(v) => set({ campus_id: v === '' ? '' : Number(v) })}
            placeholder="Any campus"
            allLabel="— any campus —"
            ariaLabel="Campus"
          />
        </div>
        <div>
          <label className="label">Year of study</label>
          <select className="input input-sm w-full" value={d.year_of_study === '' ? '' : String(d.year_of_study)} onChange={(e) => set({ year_of_study: e.target.value === '' ? '' : Number(e.target.value) })}>
            <option value="">—</option>
            {YEAR_OPTIONS.map((y) => <option key={y} value={y}>Year {y}</option>)}
          </select>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 pt-3 border-t border-ink-100 dark:border-ink-700">
        <button className="btn-secondary ml-auto" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" onClick={() => onSave(d)} disabled={!valid} title={valid ? 'Save block' : 'Fix the highlighted fields'}>
          <CheckCircle2 className="w-4 h-4" /> Save block
        </button>
      </div>
    </div>
  )
}

/* ── Days picker (Mon–Fri / Sat–Sun / custom) — portaled popover ── */
function DaysPicker({ value, onChange }: { value: number[]; onChange: (next: number[]) => void }) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ left: number; width: number; top?: number; bottom?: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const reposition = () => {
      const r = btnRef.current?.getBoundingClientRect()
      if (!r) return
      // Flip upward anchored to the trigger's top edge (via `bottom`) when
      // there isn't room below, so the popover always hugs the field.
      const margin = 8
      const spaceBelow = window.innerHeight - r.bottom - margin
      const spaceAbove = r.top - margin
      const flipUp = spaceBelow < 240 && spaceAbove > spaceBelow
      setCoords({
        left: r.left,
        width: Math.max(r.width, 280),
        ...(flipUp ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
      })
    }
    reposition()
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return
      setOpen(false)
    }
    // Capture-phase + stopPropagation so Esc closes only this popover and does
    // not bubble to a parent modal's Esc handler.
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey, true)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey, true)
    }
  }, [open])

  const sorted = [...value].sort((a, b) => a - b)
  const summary = formatDayPattern(sorted)
  const has = (n: number) => sorted.includes(n)
  const isWeekdays = sorted.length === 5 && WEEKDAYS.every((d) => sorted.includes(d))
  const isWeekend  = sorted.length === 2 && WEEKEND.every((d) => sorted.includes(d))
  const toggle = (n: number) => onChange(has(n) ? sorted.filter((d) => d !== n) : [...sorted, n])

  return (
    <>
      <button ref={btnRef} type="button" aria-label="Days" className="input input-sm w-full text-left flex items-center justify-between gap-1.5" onClick={() => setOpen((v) => !v)}>
        <span className={sorted.length ? 'text-ink-900 dark:text-white truncate' : 'text-ink-400 truncate'}>{summary}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-ink-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && coords && createPortal(
        <div ref={popRef} style={{ position: 'fixed', left: coords.left, width: coords.width, zIndex: 1100, ...(coords.top != null ? { top: coords.top } : { bottom: coords.bottom }) }} className="bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-700 rounded-lg shadow-2xl overflow-hidden">
          <div className="p-2 border-b border-ink-100 dark:border-ink-700 flex items-center gap-1.5 flex-wrap">
            <button type="button" className={`text-[11.5px] px-2 py-1 rounded-md border transition-colors ${isWeekdays ? 'bg-brand text-brand-ink border-brand' : 'border-ink-200 dark:border-ink-700 hover:border-brand hover:text-brand'}`} onClick={() => onChange(isWeekdays ? [] : [...WEEKDAYS])}>Weekdays · Mon–Fri</button>
            <button type="button" className={`text-[11.5px] px-2 py-1 rounded-md border transition-colors ${isWeekend ? 'bg-brand text-brand-ink border-brand' : 'border-ink-200 dark:border-ink-700 hover:border-brand hover:text-brand'}`} onClick={() => onChange(isWeekend ? [] : [...WEEKEND])}>Weekend · Sat–Sun</button>
            {sorted.length > 0 && <button type="button" className="ml-auto text-[11px] text-ink-500 hover:text-red-500" onClick={() => onChange([])}>Clear</button>}
          </div>
          <div className="p-2">
            <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-1.5">Custom days</div>
            <div className="grid grid-cols-7 gap-1">
              {[1, 2, 3, 4, 5, 6, 7].map((n) => {
                const on = has(n)
                return (
                  <button key={n} type="button" aria-pressed={on} className={`text-[11.5px] py-1.5 rounded-md border transition-colors ${on ? 'bg-brand text-brand-ink border-brand' : 'border-ink-200 dark:border-ink-700 text-ink-600 dark:text-ink-300 hover:border-brand hover:text-brand'}`} onClick={() => toggle(n)}>{DAY_LABELS[n]}</button>
                )
              })}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

function Field2({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-[10.5px] uppercase tracking-wider text-ink-500 mb-0.5">{label}</label>
      {children}
    </div>
  )
}

/* ============================================================
   Import-timetable dialog — accepts the wide university CSV /
   xlsx, parses each row into a teaching block, sends to backend.
   ============================================================ */
function ImportTimetableModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [academicYear, setAcademicYear] = useState('')
  const [modeDefault,  setModeDefault]  = useState('Day')
  const [replace,      setReplace]      = useState(false)
  const [parsedRows,   setParsedRows]   = useState<Array<Record<string, any>> | null>(null)
  const [previewMeta,  setPreviewMeta]  = useState<{ total: number; distinctModules: number; distinctOpts: number; distinctLecturers: number } | null>(null)
  const [submitting,   setSubmitting]   = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) { setParsedRows(null); setPreviewMeta(null); setReplace(false); setModeDefault('Day') }
  }, [open])

  const parseFile = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array', cellDates: false })
      const ws = wb.Sheets[wb.SheetNames[0]]
      if (!ws) throw new Error('No sheet found in workbook')
      const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, blankrows: false, defval: '' })
      if (aoa.length < 2) { toast.error('File has no data rows.'); return }
      const headers = (aoa[0] as any[]).map((h) => String(h ?? '').trim().toUpperCase())
      const find = (...candidates: string[]) => {
        for (const c of candidates) { const idx = headers.indexOf(c.toUpperCase()); if (idx >= 0) return idx }
        return -1
      }
      const ix = {
        id:         find('ID', 'OFFERING ID', 'BLOCK ID'),
        dpt:        find('DPT'),
        opt:        find('OPT'),
        attendance: find('ATTENDANCE MODE'),
        moduleName: find('MODULE & COMPONENT', 'MODULE NAME', 'MODULE TITLE & COMPONENT'),
        code:       find('CODE', 'MODULE CODE'),
        startDate:  find('START DATE'),
        endDate:    find('END DATE'),
        period:     find('PERIOD'),
        activity:   find('ACTIVITY'),
        lecturer:   find("LECTURER'S NAME", 'LECTURER NAME', 'LECTURER'),
        level:      find('LEVEL'),
        year:       find('YEAR'),
        sem:        find('SEM', 'SEMESTER', 'SEMESTERS'),
        campus:     find('CAMPUS', 'CAMPUS NAME'),
      }
      if (ix.code < 0 || ix.opt < 0) { toast.error('Required columns missing. Need at minimum: OPT and Code.'); return }

      const parseDate = (s: string): string | null => {
        if (!s) return null
        const trimmed = String(s).trim()
        let m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
        if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
        m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
        if (m) return trimmed
        return null
      }
      const parsePeriod = (s: string): { start: string; end: string } | null => {
        if (!s) return null
        const m = String(s).match(/^\s*(\d{1,2})h(\d{2})\s*[:\-–]\s*(\d{1,2})h(\d{2})\s*$/i)
        if (!m) return null
        return { start: `${m[1].padStart(2, '0')}:${m[2]}`, end: `${m[3].padStart(2, '0')}:${m[4]}` }
      }
      const text = (cell: any) => cell == null ? '' : String(cell).trim()
      const intOrNull = (cell: any) => { const t = text(cell); if (!t) return null; const n = Number(t); return Number.isFinite(n) ? n : null }

      const rows: Array<Record<string, any>> = []
      const modules = new Set<string>(); const opts = new Set<string>(); const lecturers = new Set<string>()
      for (const row of aoa.slice(1)) {
        const r = row as any[]
        const optAcro = text(r[ix.opt]); const code = text(r[ix.code])
        if (!optAcro || !code) continue
        const period = ix.period >= 0 ? parsePeriod(text(r[ix.period])) : null
        const lecturer = ix.lecturer >= 0 ? text(r[ix.lecturer]) : ''
        modules.add(code.toLowerCase()); opts.add(optAcro.toLowerCase())
        if (lecturer) lecturers.add(lecturer.toLowerCase())
        rows.push({
          id:              ix.id >= 0 ? intOrNull(r[ix.id]) : null,
          option_acro:     optAcro,
          module_code:     code,
          module_name:     ix.moduleName >= 0 ? text(r[ix.moduleName]) : '',
          start_date:      ix.startDate >= 0 ? parseDate(text(r[ix.startDate])) : null,
          end_date:        ix.endDate   >= 0 ? parseDate(text(r[ix.endDate]))   : null,
          start_time:      period?.start ?? null,
          end_time:        period?.end   ?? null,
          semesters:       ix.sem >= 0 ? text(r[ix.sem]) : null,
          activity:        ix.activity >= 0 ? text(r[ix.activity]) : null,
          lecturer_name:   lecturer || null,
          level:           ix.level >= 0 ? intOrNull(r[ix.level]) : null,
          year_of_study:   ix.year >= 0 ? intOrNull(r[ix.year]) : null,
          campus_name:     ix.campus >= 0 ? text(r[ix.campus]) : null,
          attendance_mode: ix.attendance >= 0 ? text(r[ix.attendance]) : null,
        })
      }

      if (rows.length === 0) { toast.error('No usable rows — every row needs an OPT and Code.'); return }
      setParsedRows(rows)
      setPreviewMeta({ total: rows.length, distinctModules: modules.size, distinctOpts: opts.size, distinctLecturers: lecturers.size })
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to read file')
    }
  }

  const submit = async () => {
    if (!parsedRows) return
    setSubmitting(true)
    try {
      const res = await academicsMgmtService.importTimetable({ academic_year: academicYear || null, mode_default: modeDefault, replace, rows: parsedRows as any })
      const d = res.data ?? { modules_created: 0, blocks_created: 0, blocks_updated: 0, blocks_replaced: 0, failed: [], unknown_opts: [], unknown_staff: [], unknown_campuses: [], unknown_levels: [] }
      const summary = [
        d.modules_created ? `${d.modules_created} module${d.modules_created === 1 ? '' : 's'} created` : null,
        d.blocks_created  ? `${d.blocks_created} block${d.blocks_created === 1 ? '' : 's'} created` : null,
        d.blocks_updated  ? `${d.blocks_updated} updated` : null,
        d.blocks_replaced ? `${d.blocks_replaced} replaced` : null,
      ].filter(Boolean).join(', ')
      toast.success(summary ? `Timetable imported — ${summary}.` : 'Timetable imported.')
      if (d.failed.length > 0) {
        const first = d.failed[0]
        toast.error(d.failed.length === 1 ? `Row #${first.index} failed: ${first.error}` : `${d.failed.length} rows failed — first: ${first.error}`)
      }
      if (d.unknown_opts.length > 0) toast.error(`Unknown OPT values: ${d.unknown_opts.slice(0, 5).join(', ')}${d.unknown_opts.length > 5 ? ', …' : ''}`)
      if (d.unknown_levels.length > 0) toast(`Levels not in catalogue (saved as null): ${d.unknown_levels.slice(0, 5).join(', ')}${d.unknown_levels.length > 5 ? ', …' : ''}`, { icon: 'ℹ️' })
      onDone(); onClose()
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Import failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import timetable"
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={submitting || !parsedRows}>
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {parsedRows ? `Import ${previewMeta?.total ?? 0} block${(previewMeta?.total ?? 0) === 1 ? '' : 's'}` : 'Choose file first'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-[13px] text-ink-700 dark:text-ink-200">
          Upload the university timetable spreadsheet. Each row becomes one teaching block. OPT, Code, dates, period, lecturer and campus are read; computed columns are ignored. If a row's <strong>ID</strong> matches an existing block (e.g., from a prior export), that block is updated in place instead of duplicated.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field2 label="Academic year (optional)">
            <input type="text" className="input" placeholder="e.g. 2025-2026" value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} />
          </Field2>
          <Field2 label="Default mode (used when DP/WK/HD is blank)">
            <select className="input" value={modeDefault} onChange={(e) => setModeDefault(e.target.value)}>
              {SCHED_MODES.filter((m) => m.v).map((m) => <option key={m.v} value={m.v}>{m.label}</option>)}
            </select>
          </Field2>
        </div>
        <label className="flex items-start gap-2 rounded-md border border-ink-200 dark:border-ink-700 p-3 cursor-pointer">
          <input type="checkbox" className="mt-0.5" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
          <div>
            <div className="text-[13px] font-semibold text-ink-900 dark:text-ink-100">Replace existing blocks for these (module, program, mode) combinations</div>
            <div className="text-[11.5px] text-ink-500">Recommended for clean re-imports — wipes any saved blocks for the same combos before inserting the file's rows. Leave off to add blocks alongside whatever's already there.</div>
          </div>
        </label>
        {!parsedRows ? (
          <div className="rounded-md border border-dashed border-ink-200 dark:border-ink-700 p-6 text-center text-[12.5px] text-ink-500">
            <button type="button" className="btn-primary" onClick={() => fileRef.current?.click()}><Upload className="w-3.5 h-3.5" /> Choose file…</button>
            <p className="mt-2">Accepts .xlsx and .csv files.</p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) parseFile(f); e.target.value = '' }} />
          </div>
        ) : (
          <div className="rounded-md border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-900/20 p-3.5 text-[12.5px] text-emerald-800 dark:text-emerald-200">
            <p className="font-semibold mb-1">File parsed.</p>
            <ul className="list-disc pl-5 space-y-0.5">
              <li><strong>{previewMeta?.total}</strong> block rows</li>
              <li><strong>{previewMeta?.distinctModules}</strong> distinct modules detected</li>
              <li><strong>{previewMeta?.distinctOpts}</strong> distinct programs (OPT)</li>
              <li><strong>{previewMeta?.distinctLecturers}</strong> distinct lecturer names</li>
            </ul>
            <button type="button" className="mt-2 text-[12px] text-brand hover:underline" onClick={() => { setParsedRows(null); setPreviewMeta(null) }}>Pick a different file</button>
          </div>
        )}
      </div>
    </Modal>
  )
}
