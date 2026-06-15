import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { AlertTriangle, Trash2, Pencil, Plus, Loader2, ChevronDown, X, Calendar, CalendarDays, CalendarRange, User, ChevronLeft, ChevronRight, Building2, Maximize2, Minimize2, Palette, Download, FileImage, FileText, FileType } from 'lucide-react'
import * as htmlToImage from 'html-to-image'
import jsPDF from 'jspdf'
import SearchableSelect from '@/components/ui/SearchableSelect'
import RoleGroupedSelect, { type GroupedOption } from '@/components/ui/RoleGroupedSelect'
import { moduleScheduleService, moduleCatalogService, moduleAssignmentService } from '@/services/modulesService'
import { academicService } from '@/services/academicService'
import { academicsMgmtService } from '@/services/academicsMgmtService'
import { portalService } from '@/services/admissionService'
import { useModulesScopeStore } from '@/store/modulesScopeStore'
import type { Module, ModuleScheduleRow, ScheduleConflict, SchedulePayload } from '@/types/modules'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const EMPTY: SchedulePayload = { module_id: 0, academic_term_id: 0, room_id: 0, day_of_week: 1, start_time: '08:00', end_time: '10:00', session_type: 'lecture', start_date: '', end_date: '', module_assignment_id: null }

type ViewMode  = 'week' | 'month' | 'year'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/* ── Date helpers ─────────────────────────────────────────────────── */
const fmtIso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
/** 1=Mon .. 7=Sun (matches backend day_of_week). */
const dowMon = (d: Date) => { const g = d.getDay(); return g === 0 ? 7 : g }
const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r }
const startOfWeekMon = (d: Date) => addDays(d, -(dowMon(d) - 1))
const startOfMonth   = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)
const endOfMonth     = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0)
const sameDate = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
const inRange = (iso: string, start?: string | null, end?: string | null) => {
  if (start && iso < start) return false
  if (end && iso > end) return false
  return true
}

/** Default hue for a module (golden-angle distribution for max separation). */
const defaultHue = (id: number) => Math.round(((id || 1) * 137.508) % 360)
const hueToColor = (h: number) => ({
  bg:     `hsl(${h}, 75%, 95%)`,
  text:   `hsl(${h}, 60%, 28%)`,
  border: `hsl(${h}, 65%, 55%)`,
})

const COLOR_KEY = 'curmis.module_colors'
type ColorOverrides = Record<string, number>
const loadOverrides = (): ColorOverrides => {
  try { return JSON.parse(localStorage.getItem(COLOR_KEY) || '{}') } catch { return {} }
}

/** Curated hue palette shown in the color picker (12 well-separated hues). */
const PALETTE_HUES = [0, 30, 50, 90, 130, 165, 195, 220, 250, 280, 310, 340]

/* ── Inline multi-select with checkboxes ────────────────────────── */
function MultiCheckSelect({
  options, values, onChange, placeholder, disabled,
}: {
  options:    { value: number; label: string }[]
  values:     number[]
  onChange:   (next: number[]) => void
  placeholder: string
  disabled?:   boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const selected = options.filter((o) => values.includes(Number(o.value)))
  const summary = selected.length === 0
    ? placeholder
    : selected.length === 1
      ? selected[0].label
      : `${selected.length} selected`
  const allChecked = options.length > 0 && options.every((o) => values.includes(Number(o.value)))

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        className="input input-sm w-full text-left flex items-center justify-between gap-2"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={selected.length ? 'text-ink-900 dark:text-white truncate' : 'text-ink-400'}>{summary}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-ink-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-700 rounded-lg shadow-xl overflow-hidden">
          {options.length === 0 ? (
            <p className="p-3 text-center text-ink-400 text-[12px]">No options</p>
          ) : (
            <>
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 text-[12px] flex items-center gap-2 border-b border-ink-100 dark:border-ink-700 hover:bg-ink-50 dark:hover:bg-ink-700/30"
                onClick={() => onChange(allChecked ? [] : options.map((o) => Number(o.value)))}
              >
                <input type="checkbox" readOnly checked={allChecked} className="rounded border-ink-300 text-brand pointer-events-none" />
                <span className="font-semibold">{allChecked ? 'Deselect all' : 'Select all'}</span>
                <span className="text-ink-400 ml-auto">{values.length}/{options.length}</span>
              </button>
              <div className="max-h-60 overflow-y-auto">
                {options.map((opt) => {
                  const checked = values.includes(Number(opt.value))
                  return (
                    <label
                      key={opt.value}
                      className="flex items-center gap-2 px-3 py-1.5 text-[13px] hover:bg-ink-50 dark:hover:bg-ink-700/30 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const v = Number(opt.value)
                          onChange(checked ? values.filter((x) => x !== v) : [...values, v])
                        }}
                        className="rounded border-ink-300 text-brand focus:ring-brand/30"
                      />
                      <span className="truncate">{opt.label}</span>
                    </label>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}


export default function ModulesSchedulePage() {
  const qc = useQueryClient()

  // ── Data sources ──
  const termsQ = useQuery({ queryKey: ['academic', 'terms'], queryFn: () => academicService.listTerms() })
  const terms = termsQ.data?.data ?? []
  const [termId, setTermId] = useState(0)
  useEffect(() => { if (!termId && terms.length) { setTermId((terms.find((t: any) => t.is_current) ?? terms[0]).id) } }, [terms, termId])

  const modulesQ = useQuery({ queryKey: ['modules', 'catalog-all'], queryFn: () => moduleCatalogService.list({ per_page: 500, status: 'active' }) })
  const allModules: Module[] = modulesQ.data?.data?.data ?? []

  const roomsQ = useQuery({ queryKey: ['facilities'], queryFn: () => academicsMgmtService.list<any>('facility', { per_page: 100 }) })
  const rooms = roomsQ.data?.data?.data ?? []

  const facultiesQ = useQuery({ queryKey: ['portal', 'faculties'], queryFn: () => portalService.getFaculties() })
  const faculties: any[] = facultiesQ.data?.data ?? []

  const deptsQ = useQuery({ queryKey: ['academics', 'departments'], queryFn: () => academicsMgmtService.list<any>('departments', { per_page: 200 }) })
  const departments: any[] = deptsQ.data?.data?.data ?? []

  const optionsQ = useQuery({ queryKey: ['academics', 'options'], queryFn: () => academicsMgmtService.list<any>('options', { per_page: 500 }) })
  const options: any[] = optionsQ.data?.data?.data ?? []

  const deptMap = useMemo(() => { const m = new Map<number, { dep_name: string; fac_id: number }>(); departments.forEach((d: any) => m.set(Number(d.dep_id), { dep_name: d.dep_name, fac_id: Number(d.fac_id) })); return m }, [departments])
  const moduleDeptMap = useMemo(() => { const m = new Map<number, number>(); allModules.forEach((mod) => m.set(mod.module_id, Number(mod.department ?? 0))); return m }, [allModules])

  const schedulesQ = useQuery({ queryKey: ['modules', 'schedules', termId], queryFn: () => moduleScheduleService.list({ term_id: termId }), enabled: !!termId })
  const allSchedules: ModuleScheduleRow[] = schedulesQ.data?.data ?? []

  // ── Cascading filters (shared with other Modules tabs via store) ──
  const gFaculty  = useModulesScopeStore((s) => s.facultyId)
  const gDepts    = useModulesScopeStore((s) => s.departmentIds)
  const gPrograms = useModulesScopeStore((s) => s.programIds)
  const setGFaculty  = useModulesScopeStore((s) => s.setFaculty)
  const setGDepts    = useModulesScopeStore((s) => s.setDepartments)
  const setGPrograms = useModulesScopeStore((s) => s.setPrograms)

  const filteredDepts = useMemo(() => gFaculty ? departments.filter((d: any) => Number(d.fac_id) === gFaculty) : [], [departments, gFaculty])
  const filteredPrograms = useMemo(() => gDepts.length ? options.filter((o: any) => gDepts.includes(Number(o.department_id))) : [], [options, gDepts])

  const filteredModules = useMemo(() => {
    let list = allModules
    if (gDepts.length)    list = list.filter((m) => gDepts.includes(Number(m.department)))
    if (gPrograms.length) list = list.filter((m) => gPrograms.includes(Number(m.d_option ?? 0)))
    return list
  }, [allModules, gDepts, gPrograms])

  const moduleIdSet = useMemo(() => new Set(filteredModules.map((m) => m.module_id)), [filteredModules])
  const filteredSchedules = useMemo(() => {
    if (!gDepts.length) return [] as ModuleScheduleRow[]
    return allSchedules.filter((s) => moduleIdSet.has(s.module_id))
  }, [allSchedules, gDepts, moduleIdSet])

  // ── Form state ──
  const [draft, setDraft] = useState<SchedulePayload>(EMPTY)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [conflicts, setConflicts] = useState<ScheduleConflict[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)

  // ── Calendar view state (right panel) ──
  const [viewMode, setViewMode] = useState<ViewMode>('week')
  const [viewDate, setViewDate] = useState<Date>(() => new Date())
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Per-module color overrides (persisted in localStorage)
  const [colorOverrides, setColorOverrides] = useState<ColorOverrides>(() => loadOverrides())
  const moduleColor = (id: number) => hueToColor(typeof colorOverrides[String(id)] === 'number' ? colorOverrides[String(id)] : defaultHue(id))
  const setModuleHue = (id: number, hue: number | null) => {
    const next = { ...colorOverrides }
    if (hue === null) delete next[String(id)]; else next[String(id)] = hue
    setColorOverrides(next)
    try { localStorage.setItem(COLOR_KEY, JSON.stringify(next)) } catch { /* ignore */ }
  }

  // Color picker popover (which schedule's chip is being recolored)
  const [colorPickerFor, setColorPickerFor] = useState<number | null>(null) // module_id or null

  // Esc closes fullscreen
  useEffect(() => {
    if (!isFullscreen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsFullscreen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isFullscreen])

  // ── Export (PNG / SVG / PDF) ──
  const calendarRef = useRef<HTMLDivElement>(null)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [exporting, setExporting] = useState<null | 'png' | 'svg' | 'pdf'>(null)
  const exportMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!exportMenuOpen) return
    const onDoc = (e: MouseEvent) => { if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) setExportMenuOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [exportMenuOpen])

  const exportFilename = () => {
    const slug = `schedule-${viewMode}-${fmtIso(viewDate)}`
    return slug
  }

  const exportCalendar = async (kind: 'png' | 'svg' | 'pdf') => {
    if (!calendarRef.current) return
    setExporting(kind)
    setExportMenuOpen(false)
    try {
      const node = calendarRef.current
      const opts = { backgroundColor: '#ffffff', pixelRatio: 2, cacheBust: true }
      if (kind === 'svg') {
        const url = await htmlToImage.toSvg(node, opts)
        downloadDataUrl(url, `${exportFilename()}.svg`)
      } else if (kind === 'png') {
        const url = await htmlToImage.toPng(node, opts)
        downloadDataUrl(url, `${exportFilename()}.png`)
      } else {
        const url = await htmlToImage.toPng(node, opts)
        const img = new Image()
        await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = reject; img.src = url })
        const orientation: 'l' | 'p' = img.width >= img.height ? 'l' : 'p'
        const pdf = new jsPDF({ orientation, unit: 'pt', format: 'a4' })
        const pageW = pdf.internal.pageSize.getWidth()
        const pageH = pdf.internal.pageSize.getHeight()
        const margin = 24
        const maxW = pageW - margin * 2
        const maxH = pageH - margin * 2
        const ratio = Math.min(maxW / img.width, maxH / img.height)
        const w = img.width * ratio, h = img.height * ratio
        const x = (pageW - w) / 2, y = (pageH - h) / 2
        pdf.addImage(url, 'PNG', x, y, w, h)
        pdf.save(`${exportFilename()}.pdf`)
      }
      toast.success(`Exported ${kind.toUpperCase()}`)
    } catch (e: any) {
      toast.error(`Export failed: ${e?.message ?? 'unknown error'}`)
    } finally {
      setExporting(null)
    }
  }

  const downloadDataUrl = (dataUrl: string, filename: string) => {
    const a = document.createElement('a')
    a.href = dataUrl; a.download = filename
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
  }

  /** Returns schedules occurring on the given calendar date. */
  const schedulesOnDate = (date: Date): ModuleScheduleRow[] => {
    const iso = fmtIso(date)
    const dow = dowMon(date)
    return filteredSchedules.filter((s) => s.day_of_week === dow && inRange(iso, s.start_date, s.end_date))
  }

  useEffect(() => { if (termId) setDraft((d) => ({ ...d, academic_term_id: termId })) }, [termId])

  // Default date range to the current calendar month (when not editing & dates empty)
  useEffect(() => {
    if (editingId) return
    const now = new Date()
    const first = new Date(now.getFullYear(), now.getMonth(), 1)
    const last  = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    setDraft((d) => ({
      ...d,
      start_date: d.start_date || fmtIso(first),
      end_date:   d.end_date   || fmtIso(last),
    }))
  }, [termId, editingId])

  // Reset assignment + staff when module changes
  useEffect(() => {
    if (!editingId) {
      setDraft((d) => ({ ...d, module_assignment_id: null }))
      setSelectedStaffId(null)
    }
  }, [draft.module_id, editingId])

  // Existing assignments for this module/term (used to skip duplicate creation on save)
  const assignmentsQ = useQuery({
    queryKey: ['modules', 'assignments-for-schedule', termId, draft.module_id],
    queryFn: () => moduleAssignmentService.list({ term_id: termId, module_id: draft.module_id }),
    enabled: !!termId && !!draft.module_id,
  })
  const moduleAssignments = assignmentsQ.data?.data ?? []

  // Lecturers / staff — the same unified pool used on the Scheduling & Exams
  // tabs (HR employees + staff user accounts). Ids are namespaced server-side so
  // a user-account lecturer (e.g. one with no HR record) can be assigned too.
  const staffQ = useQuery({
    queryKey: ['scheduling', 'instructors'],
    queryFn: () => academicsMgmtService.getInstructors(),
    staleTime: 5 * 60_000,
  })
  const allStaff = (staffQ.data?.data?.rows ?? []) as Array<{ id: number; full_name: string; position: string | null }>
  const staffOptions: GroupedOption[] = useMemo(
    () => allStaff.map((s) => ({
      value: s.id,
      label: s.full_name,
      sub: s.position ?? undefined,
      group: (s.position ?? '').trim() || 'Other',
    })),
    [allStaff],
  )

  // Staff selection (independent of module_assignment_id — created on save if needed)
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(null)

  const selectedStaff = allStaff.find((s) => Number(s.id) === selectedStaffId)

  useEffect(() => {
    if (!draft.module_id || !draft.room_id || !draft.academic_term_id) { setConflicts([]); return }
    const h = setTimeout(async () => { try { const r = await moduleScheduleService.checkConflicts({ ...draft, ignore_id: editingId ?? undefined }); setConflicts(r.data?.conflicts ?? []) } catch { /* ignore */ } }, 400)
    return () => clearTimeout(h)
  }, [draft, editingId])

  const currentTerm = terms.find((t: any) => t.id === termId)

  const save = useMutation({
    mutationFn: async () => {
      // Resolve module_assignment_id from the picked staff:
      //   - existing assignment for (module, staff, term) → reuse its id
      //   - none yet → create one as 'primary', then use its id
      let assignmentId = draft.module_assignment_id ?? null
      if (selectedStaffId) {
        const existing = moduleAssignments.find((a: any) => Number(a.staff_id) === selectedStaffId)
        if (existing) {
          assignmentId = Number(existing.id)
        } else {
          const created = await moduleAssignmentService.create({
            module_id:        draft.module_id,
            staff_id:         selectedStaffId,
            academic_term_id: draft.academic_term_id,
            role:             'primary',
          })
          assignmentId = Number(created.data?.id ?? 0) || null
          qc.invalidateQueries({ queryKey: ['modules', 'assignments-for-schedule'] })
        }
      } else {
        assignmentId = null
      }
      const base: SchedulePayload = { ...draft, module_assignment_id: assignmentId }
      return (editingId ? moduleScheduleService.update(editingId, base) : moduleScheduleService.create(base)) as Promise<any>
    },
    onSuccess: () => {
      toast.success(editingId ? 'Schedule updated' : 'Schedule added')
      setDraft({ ...EMPTY, academic_term_id: termId })
      setEditingId(null); setConflicts([])
      setSelectedStaffId(null)
      qc.invalidateQueries({ queryKey: ['modules', 'schedules', termId] })
    },
    onError: (e: any) => { const c = e?.response?.data?.errors?.conflicts; if (c) { setConflicts(c); toast.error('Conflicts detected') } else toast.error(e?.message ?? e?.response?.data?.message ?? 'Save failed') },
  })
  const remove = useMutation({ mutationFn: (id: number) => moduleScheduleService.remove(id), onSuccess: () => { toast.success('Removed'); qc.invalidateQueries({ queryKey: ['modules', 'schedules', termId] }) } })

  const editEntry = (row: ModuleScheduleRow) => {
    setEditingId(row.id)
    setDraft({
      module_id: row.module_id, academic_term_id: row.academic_term_id, room_id: row.room_id,
      day_of_week: row.day_of_week, start_time: row.start_time.slice(0, 5), end_time: row.end_time.slice(0, 5),
      start_date: row.start_date ?? '', end_date: row.end_date ?? '',
      session_type: row.session_type, notes: row.notes ?? undefined,
      module_assignment_id: row.module_assignment_id ?? null,
    })
    setSelectedStaffId(row.staff_id ? Number(row.staff_id) : null)
  }

  const selectedModule = allModules.find((m) => m.module_id === draft.module_id)
  const canSubmit = draft.module_id > 0
    && draft.room_id > 0
    && draft.academic_term_id > 0
    && draft.start_time < draft.end_time
    && !!draft.start_date && !!draft.end_date
    && draft.start_date <= draft.end_date
    && conflicts.length === 0
  const hasFilters = gFaculty > 0 || gDepts.length > 0 || gPrograms.length > 0

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-ink-900 dark:text-white">Modules Scheduling</h2>
          <p className="text-[13px] text-ink-500">Weekly timetable with live room conflict detection.</p>
        </div>
        <select className="input input-sm w-56" value={termId || ''} onChange={(e) => setTermId(Number(e.target.value))}>
          <option value="" disabled>Select term…</option>
          {terms.map((t: any) => <option key={t.id} value={t.id}>{t.label}{t.is_current ? ' (current)' : ''}</option>)}
        </select>
      </div>

      {/* ── Cascading filter bar: Faculty → Department → Program ── */}
      <div className="card p-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          {/* Step 1 — Faculty */}
          <div>
            <label className="text-[10px] uppercase tracking-wide font-bold text-ink-400 mb-1 flex items-center gap-1">
              <span className="w-4 h-4 rounded-full bg-brand text-white inline-flex items-center justify-center text-[9px] font-bold">1</span>
              Faculty
            </label>
            <SearchableSelect
              options={faculties.map((f: any) => ({ value: f.id, label: f.name }))}
              value={gFaculty}
              onChange={(v) => { setGFaculty(Number(v)); setGDepts([]); setGPrograms([]) }}
              allLabel="Select faculty…"
            />
          </div>

          {/* Step 2 — Department (multi, locked until faculty picked) */}
          <div>
            <label className={`text-[10px] uppercase tracking-wide font-bold mb-1 flex items-center gap-1 ${gFaculty ? 'text-ink-400' : 'text-ink-300'}`}>
              <span className={`w-4 h-4 rounded-full inline-flex items-center justify-center text-[9px] font-bold ${gFaculty ? 'bg-brand text-white' : 'bg-ink-200 text-ink-400'}`}>2</span>
              Departments <span className="text-ink-300 font-normal normal-case">(pick one or many)</span>
            </label>
            <div className={!gFaculty ? 'opacity-50 pointer-events-none' : ''}>
              <MultiCheckSelect
                options={filteredDepts.map((d: any) => ({ value: Number(d.dep_id), label: d.dep_name }))}
                values={gDepts}
                onChange={(next) => { setGDepts(next); setGPrograms([]) }}
                placeholder={gFaculty ? 'Select department(s)…' : 'Pick faculty first'}
                disabled={!gFaculty}
              />
            </div>
          </div>

          {/* Step 3 — Program (multi, locked until department picked) */}
          <div>
            <label className={`text-[10px] uppercase tracking-wide font-bold mb-1 flex items-center gap-1 ${gDepts.length ? 'text-ink-400' : 'text-ink-300'}`}>
              <span className={`w-4 h-4 rounded-full inline-flex items-center justify-center text-[9px] font-bold ${gDepts.length ? 'bg-brand text-white' : 'bg-ink-200 text-ink-400'}`}>3</span>
              Programs <span className="text-ink-300 font-normal normal-case">(optional)</span>
            </label>
            <div className={!gDepts.length ? 'opacity-50 pointer-events-none' : ''}>
              <MultiCheckSelect
                options={filteredPrograms.map((o: any) => ({ value: Number(o.id), label: o.name }))}
                values={gPrograms}
                onChange={setGPrograms}
                placeholder={gDepts.length ? (filteredPrograms.length ? 'All programs' : 'No programs in selection') : 'Pick department first'}
                disabled={!gDepts.length}
              />
            </div>
          </div>
        </div>

        {hasFilters && (
          <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-ink-100 dark:border-ink-700">
            <p className="text-[11px] text-ink-400">
              {gDepts.length > 1 && <span className="font-semibold mr-1">{gDepts.length} departments combined ·</span>}
              Showing <b>{filteredModules.length}</b> module{filteredModules.length !== 1 ? 's' : ''} · <b>{filteredSchedules.length}</b> schedule entr{filteredSchedules.length !== 1 ? 'ies' : 'y'}
            </p>
            <button className="text-[11px] text-ink-400 hover:text-red-500 flex items-center gap-1" onClick={() => { setGFaculty(0); setGDepts([]); setGPrograms([]) }}>
              <X className="w-3 h-3" /> Clear filters
            </button>
          </div>
        )}
      </div>

      {!termId ? (
        <div className="card p-8 text-center text-ink-400">Pick an academic term to begin.</div>
      ) : !gFaculty ? (
        <div className="card p-10 text-center">
          <div className="w-14 h-14 rounded-full bg-brand/10 text-brand flex items-center justify-center mx-auto mb-3">
            <Building2 className="w-7 h-7" />
          </div>
          <h3 className="font-semibold text-ink-900 dark:text-white mb-1">Start by picking a faculty</h3>
          <p className="text-[13px] text-ink-500 max-w-md mx-auto">Use step 1 above to choose a faculty. The department list and schedule canvas will unlock once you do.</p>
          {faculties.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5 max-w-xl mx-auto">
              {faculties.slice(0, 12).map((f: any) => (
                <button key={f.id} className="text-[12px] px-2.5 py-1 rounded-full border border-ink-200 dark:border-ink-700 hover:border-brand hover:text-brand transition-colors" onClick={() => setGFaculty(Number(f.id))}>
                  {f.name}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : gDepts.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="w-14 h-14 rounded-full bg-brand/10 text-brand flex items-center justify-center mx-auto mb-3">
            <Building2 className="w-7 h-7" />
          </div>
          <h3 className="font-semibold text-ink-900 dark:text-white mb-1">Now pick one or more departments</h3>
          <p className="text-[13px] text-ink-500 max-w-md mx-auto">Tap any department under <b>{faculties.find((f: any) => f.id === gFaculty)?.name ?? 'this faculty'}</b> to add it. Add several to view their modules and schedules combined.</p>
          {filteredDepts.length > 0 ? (
            <>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5 max-w-xl mx-auto">
                {filteredDepts.slice(0, 16).map((d: any) => (
                  <button key={d.dep_id} className="text-[12px] px-2.5 py-1 rounded-full border border-ink-200 dark:border-ink-700 hover:border-brand hover:text-brand transition-colors" onClick={() => { const id = Number(d.dep_id); if (!gDepts.includes(id)) setGDepts([...gDepts, id]) }}>
                    + {d.dep_name}
                  </button>
                ))}
              </div>
              {filteredDepts.length > 1 && (
                <button className="mt-3 text-[12px] text-brand hover:underline" onClick={() => setGDepts(filteredDepts.map((d: any) => Number(d.dep_id)))}>
                  Or add all {filteredDepts.length} departments
                </button>
              )}
            </>
          ) : (
            <p className="mt-3 text-[12px] text-ink-400">No departments under this faculty yet.</p>
          )}
        </div>
      ) : (
        <div className={isFullscreen ? 'space-y-4' : 'grid grid-cols-1 lg:grid-cols-5 gap-4'}>
          {/* ── Add/Edit Form ── */}
          <div className={`card overflow-hidden ${isFullscreen ? 'hidden' : 'lg:col-span-2'}`}>
            {/* Header */}
            <div className="px-4 py-2.5 border-b border-ink-100 dark:border-ink-700 flex items-center justify-between">
              <h3 className="font-semibold text-[13px] flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                {editingId ? 'Edit schedule entry' : 'Add schedule entry'}
              </h3>
              {editingId && (
                <button className="text-[11px] text-ink-400 hover:text-ink-700 underline" onClick={() => { setEditingId(null); setDraft({ ...EMPTY, academic_term_id: termId }); setConflicts([]) }}>
                  Cancel edit
                </button>
              )}
            </div>

            <div className="px-4 pt-4 pb-4 space-y-3">
              {/* ── Section: WHAT ── */}
              <div>
                <div className="text-[10px] uppercase font-bold text-ink-400 mb-1.5 tracking-wide">What</div>
                <div className="space-y-2.5">
                  {/* Module picker */}
                  <div className="text-[13px]">
                    <span className="text-ink-600 block mb-1">Module</span>
                    <div className="relative">
                      <button type="button" className="input input-sm w-full text-left flex items-center justify-between gap-2" onClick={() => setPickerOpen(!pickerOpen)}>
                        <span className={selectedModule ? 'text-ink-900 dark:text-white truncate' : 'text-ink-400'}>
                          {selectedModule ? `${selectedModule.module_code} — ${selectedModule.module_name}` : 'Pick a module…'}
                        </span>
                        <ChevronDown className={`w-3.5 h-3.5 text-ink-400 shrink-0 transition-transform ${pickerOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {pickerOpen && (
                        <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-700 rounded-lg shadow-xl overflow-hidden">
                          <div className="max-h-64 overflow-y-auto">
                            {filteredModules.length === 0 ? (
                              <p className="p-3 text-center text-ink-400 text-[12px]">No modules match filters.</p>
                            ) : filteredModules.map((m) => {
                              const dept = deptMap.get(Number(m.department))
                              const c = moduleColor(m.module_id)
                              return (
                                <button key={m.module_id} type="button"
                                  className={`w-full text-left px-3 py-1.5 text-[12px] flex items-center gap-2 transition-colors ${draft.module_id === m.module_id ? 'bg-brand/10 text-brand' : 'hover:bg-ink-50 dark:hover:bg-ink-700/30'}`}
                                  onClick={() => { setDraft({ ...draft, module_id: m.module_id }); setPickerOpen(false) }}>
                                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.border }} />
                                  <span className="font-mono font-semibold whitespace-nowrap">{m.module_code}</span>
                                  <span className="text-ink-600 dark:text-ink-300 truncate flex-1">— {m.module_name}</span>
                                  {dept && <span className="text-[10px] text-ink-400 whitespace-nowrap">{dept.dep_name}</span>}
                                </button>
                              )
                            })}
                          </div>
                          <div className="p-1.5 border-t border-ink-100 dark:border-ink-700 text-right">
                            <span className="text-[10px] text-ink-400">{filteredModules.length} modules</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-[13px]">
                      <span className="text-ink-600 block mb-1">Session</span>
                      <select className="input input-sm w-full" value={draft.session_type} onChange={(e) => setDraft({ ...draft, session_type: e.target.value as any })}>
                        <option value="lecture">Lecture</option>
                        <option value="lab">Lab</option>
                        <option value="tutorial">Tutorial</option>
                        <option value="seminar">Seminar</option>
                        <option value="exam">Exam</option>
                      </select>
                    </label>

                    <div className="block text-[13px]">
                      <span className="text-ink-600 mb-1 flex items-center gap-1">
                        <User className="w-3 h-3" />Teacher <span className="text-ink-400 font-normal text-[11px]">(opt.)</span>
                      </span>
                      {/* Same unified lecturer pool as the Scheduling & Exams tabs
                          (HR employees + staff user accounts). */}
                      <RoleGroupedSelect
                        options={staffOptions}
                        value={selectedStaffId ?? ''}
                        onChange={(v) => setSelectedStaffId(v === '' ? null : Number(v))}
                        placeholder={draft.module_id ? 'Search staff by name or role…' : 'Pick a module first'}
                        allLabel="— no teacher —"
                        ariaLabel="Teacher"
                        disabled={!draft.module_id}
                        showSubOnTrigger
                      />
                    </div>
                  </div>
                  {selectedStaff && draft.module_id > 0 && !moduleAssignments.some((a: any) => Number(a.staff_id) === selectedStaffId) && (
                    <p className="text-[11px] text-emerald-600 -mt-1 flex items-center gap-1">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <b>{selectedStaff.full_name}</b>&nbsp;will be assigned to this module when you save.
                    </p>
                  )}
                </div>
              </div>

              {/* ── Section: WHEN & WHERE ── */}
              <div className="pt-1">
                <div className="text-[10px] uppercase font-bold text-ink-400 mb-1.5 tracking-wide">When &amp; where</div>
                <div className="space-y-2.5">
                  <label className="block text-[13px]">
                    <span className="text-ink-600 block mb-1">Room</span>
                    <select className="input input-sm w-full" value={draft.room_id || ''} onChange={(e) => setDraft({ ...draft, room_id: Number(e.target.value) })}>
                      <option value="" disabled>Pick a room</option>
                      {rooms.map((r: any) => <option key={r.id} value={r.id}>{r.name} {r.building ? `· ${r.building}` : ''} (cap {r.capacity})</option>)}
                    </select>
                  </label>

                  <div className="grid grid-cols-3 gap-2">
                    <label className="block text-[13px]">
                      <span className="text-ink-600 block mb-1">Day</span>
                      <select className="input input-sm w-full" value={draft.day_of_week} onChange={(e) => setDraft({ ...draft, day_of_week: Number(e.target.value) })}>
                        {DAYS.map((d, i) => <option key={i} value={i + 1}>{d}</option>)}
                      </select>
                    </label>
                    <label className="block text-[13px]">
                      <span className="text-ink-600 block mb-1">Start</span>
                      <input type="time" className="input input-sm w-full" value={draft.start_time} onChange={(e) => setDraft({ ...draft, start_time: e.target.value })} />
                    </label>
                    <label className="block text-[13px]">
                      <span className="text-ink-600 block mb-1">End</span>
                      <input type="time" className="input input-sm w-full" value={draft.end_time} onChange={(e) => setDraft({ ...draft, end_time: e.target.value })} />
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-[13px]">
                      <span className="text-ink-600 block mb-1">From <span className="text-red-500">*</span></span>
                      <input
                        type="date"
                        required
                        className="input input-sm w-full"
                        min="2025-01-01"
                        value={draft.start_date ?? ''}
                        onChange={(e) => setDraft({ ...draft, start_date: e.target.value })}
                      />
                    </label>
                    <label className="block text-[13px]">
                      <span className="text-ink-600 block mb-1">To <span className="text-red-500">*</span></span>
                      <input
                        type="date"
                        required
                        className="input input-sm w-full"
                        min={draft.start_date || '2025-01-01'}
                        value={draft.end_date ?? ''}
                        onChange={(e) => setDraft({ ...draft, end_date: e.target.value })}
                      />
                    </label>
                    <p className="col-span-2 text-[11px] text-ink-400 -mt-1">
                      The schedule will appear on the calendar only within this date range. Pick any dates — across years if the module runs that long.
                      {currentTerm?.start_date && currentTerm?.end_date ? ` Suggested term window: ${currentTerm.start_date} → ${currentTerm.end_date}.` : ''}
                    </p>
                  </div>
                </div>
              </div>

              {conflicts.length > 0 && (
                <div className="border border-amber-200 bg-amber-50 dark:bg-amber-500/10 rounded-md p-3 text-[12.5px]">
                  <div className="flex items-center gap-1.5 font-semibold text-amber-700 mb-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {conflicts.length} conflict{conflicts.length > 1 ? 's' : ''} — save disabled
                  </div>
                  <ul className="space-y-1 text-amber-700">
                    {conflicts.map((c, i) => {
                      const dept = deptMap.get(moduleDeptMap.get(c.conflict_with.module_id) ?? 0)
                      return (
                        <li key={i} className="leading-snug">
                          <span className="font-semibold uppercase text-[10px] tracking-wide">{c.type}</span>
                          <span className="mx-1">·</span>
                          <span className="font-mono font-semibold">{c.conflict_with.module_code}</span>
                          <span className="mx-1">·</span>
                          {DAYS[c.conflict_with.day_of_week - 1]} {c.conflict_with.start_time.slice(0, 5)}–{c.conflict_with.end_time.slice(0, 5)}
                          {c.type === 'room' && c.conflict_with.room_name ? <> · {c.conflict_with.room_name}</> : null}
                          {dept && (
                            <div className="text-[11px] text-amber-700/80 mt-0.5 ml-1 flex items-center gap-1">
                              <Building2 className="w-3 h-3" /> Used by <b>{dept.dep_name}</b>
                            </div>
                          )}
                          {c.conflict_with.staff_name && (
                            <div className="text-[11px] text-amber-700/80 ml-1 flex items-center gap-1">
                              <User className="w-3 h-3" /> Teacher: <b>{c.conflict_with.staff_name}</b>
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}

              <button className="btn-primary btn-sm w-full mt-1" disabled={!canSubmit || save.isPending} onClick={() => save.mutate()}>
                {save.isPending ? 'Saving…' : editingId ? 'Save changes' : `Add to ${currentTerm?.label ?? 'term'}`}
              </button>
            </div>
          </div>

          {/* ── Calendar (Week / Month / Year) ── */}
          <div ref={calendarRef} className={`card overflow-hidden ${isFullscreen ? 'fixed inset-0 z-50 rounded-none flex flex-col' : 'lg:col-span-3'}`}>
            {/* View tabs + navigator */}
            <div className="px-4 py-2.5 border-b border-ink-100 dark:border-ink-700 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="flex p-1 bg-ink-50 dark:bg-ink-800/50 rounded-md text-[12px]">
                  {([
                    { v: 'week',  label: 'Week',  icon: CalendarDays },
                    { v: 'month', label: 'Month', icon: Calendar },
                    { v: 'year',  label: 'Year',  icon: CalendarRange },
                  ] as const).map((opt) => {
                    const Icon = opt.icon
                    const active = viewMode === opt.v
                    return (
                      <button key={opt.v} type="button"
                        className={`px-2.5 py-1 rounded flex items-center gap-1.5 transition-colors ${active ? 'bg-white dark:bg-ink-900 text-brand shadow-sm font-semibold' : 'text-ink-500 hover:text-ink-700'}`}
                        onClick={() => setViewMode(opt.v)}
                      >
                        <Icon className="w-3.5 h-3.5" /> {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button className="icon-btn" title="Previous"
                  onClick={() => setViewDate((d) => viewMode === 'week' ? addDays(d, -7) : viewMode === 'month' ? new Date(d.getFullYear(), d.getMonth() - 1, 1) : new Date(d.getFullYear() - 1, d.getMonth(), 1))}>
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button className="text-[12px] px-2 py-1 rounded hover:bg-ink-100 dark:hover:bg-ink-700/40 text-ink-500" onClick={() => setViewDate(new Date())}>Today</button>
                <button className="icon-btn" title="Next"
                  onClick={() => setViewDate((d) => viewMode === 'week' ? addDays(d, 7) : viewMode === 'month' ? new Date(d.getFullYear(), d.getMonth() + 1, 1) : new Date(d.getFullYear() + 1, d.getMonth(), 1))}>
                  <ChevronRight className="w-4 h-4" />
                </button>
                <span className="text-[13px] font-semibold text-ink-700 dark:text-ink-200 ml-2 min-w-[140px] text-right">
                  {viewMode === 'week'
                    ? (() => { const m = startOfWeekMon(viewDate); const s = addDays(m, 6); return `${MONTHS[m.getMonth()]} ${m.getDate()} – ${m.getMonth() === s.getMonth() ? '' : MONTHS[s.getMonth()] + ' '}${s.getDate()}, ${s.getFullYear()}` })()
                    : viewMode === 'month'
                      ? `${MONTHS[viewDate.getMonth()]} ${viewDate.getFullYear()}`
                      : `${viewDate.getFullYear()}`}
                </span>
                <div className="relative ml-2" ref={exportMenuRef}>
                  <button className="icon-btn" title="Download calendar" disabled={!!exporting}
                    onClick={() => setExportMenuOpen((o) => !o)}>
                    {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  </button>
                  {exportMenuOpen && (
                    <div className="absolute z-30 right-0 top-full mt-1 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-700 rounded-lg shadow-xl overflow-hidden w-44">
                      <button className="w-full text-left px-3 py-2 text-[12.5px] flex items-center gap-2 hover:bg-ink-50 dark:hover:bg-ink-700/30" onClick={() => exportCalendar('png')}>
                        <FileImage className="w-3.5 h-3.5 text-ink-500" /> PNG image
                      </button>
                      <button className="w-full text-left px-3 py-2 text-[12.5px] flex items-center gap-2 hover:bg-ink-50 dark:hover:bg-ink-700/30" onClick={() => exportCalendar('svg')}>
                        <FileType className="w-3.5 h-3.5 text-ink-500" /> SVG vector
                      </button>
                      <button className="w-full text-left px-3 py-2 text-[12.5px] flex items-center gap-2 hover:bg-ink-50 dark:hover:bg-ink-700/30 border-t border-ink-100 dark:border-ink-700" onClick={() => exportCalendar('pdf')}>
                        <FileText className="w-3.5 h-3.5 text-ink-500" /> PDF document
                      </button>
                    </div>
                  )}
                </div>
                <button className="icon-btn" title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
                  onClick={() => setIsFullscreen((v) => !v)}>
                  {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className={`p-3 overflow-x-auto ${isFullscreen ? 'flex-1 overflow-y-auto' : ''}`}>
              {/* Print/export banner — visible whenever fullscreen so the downloaded image makes sense alone */}
              {isFullscreen && (
                <div className="mb-3 px-2 py-3 border-b border-ink-200 dark:border-ink-700 flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-ink-400 font-bold">Modules Schedule</div>
                    <div className="text-[18px] font-bold text-ink-900 dark:text-white">
                      {faculties.find((f: any) => f.id === gFaculty)?.name ?? 'All faculties'}
                    </div>
                    <div className="text-[12.5px] text-ink-500 mt-0.5">
                      {gDepts.length > 0 && (
                        <span>
                          <b>{gDepts.length === 1 ? 'Department' : `${gDepts.length} Departments`}:</b>{' '}
                          {gDepts.map((id) => departments.find((d: any) => Number(d.dep_id) === id)?.dep_name).filter(Boolean).join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] uppercase tracking-wider text-ink-400 font-bold">{viewMode === 'week' ? 'Week of' : viewMode === 'month' ? 'Month' : 'Year'}</div>
                    <div className="text-[16px] font-bold text-ink-900 dark:text-white">
                      {viewMode === 'week'
                        ? (() => { const m = startOfWeekMon(viewDate); const s = addDays(m, 6); return `${MONTHS[m.getMonth()]} ${m.getDate()} – ${m.getMonth() === s.getMonth() ? '' : MONTHS[s.getMonth()] + ' '}${s.getDate()}, ${s.getFullYear()}` })()
                        : viewMode === 'month'
                          ? `${MONTHS[viewDate.getMonth()]} ${viewDate.getFullYear()}`
                          : `${viewDate.getFullYear()}`}
                    </div>
                    <div className="text-[11px] text-ink-400 mt-0.5">{currentTerm?.label ?? ''}{filteredSchedules.length ? ` · ${filteredSchedules.length} entries` : ''}</div>
                  </div>
                </div>
              )}

              {schedulesQ.isLoading ? (
                <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" /></div>
              ) : viewMode === 'week' ? (
                /* ── WEEK VIEW ── */
                (() => {
                  const monday = startOfWeekMon(viewDate)
                  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
                  const today = new Date()
                  return (
                    <table className="w-full text-[12px] table-fixed">
                      <thead>
                        <tr>
                          {days.map((d) => {
                            const isToday = sameDate(d, today)
                            return (
                              <th key={d.toISOString()} className="px-2 py-1.5 text-center font-bold text-[10px] uppercase">
                                <div className={isToday ? 'text-brand' : 'text-ink-400'}>{DAYS[dowMon(d) - 1]}</div>
                                <div className={`text-[14px] ${isToday ? 'text-brand' : 'text-ink-700 dark:text-ink-200'}`}>{d.getDate()}</div>
                              </th>
                            )
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          {days.map((d) => {
                            const dayRows = schedulesOnDate(d).sort((a, b) => a.start_time.localeCompare(b.start_time))
                            const isToday = sameDate(d, today)
                            return (
                              <td key={d.toISOString()} className={`align-top p-1 border border-ink-100 dark:border-ink-700 min-w-[120px] ${isToday ? 'bg-brand/[0.03]' : ''}`}>
                                {dayRows.length === 0 ? (
                                  <span className="text-ink-300 text-[11px] block text-center py-2">—</span>
                                ) : dayRows.map((r) => {
                                  const dept = deptMap.get(moduleDeptMap.get(r.module_id) ?? 0)
                                  const c = moduleColor(r.module_id)
                                  const pickerOpen = colorPickerFor === r.module_id
                                  return (
                                    <div key={r.id} className="rounded p-1.5 mb-1 border-l-[3px] relative" style={{ backgroundColor: c.bg, color: c.text, borderLeftColor: c.border }}>
                                      <div className="font-bold">{r.module_code}</div>
                                      {r.module_name && <div className={`opacity-90 ${isFullscreen ? 'text-[12px]' : 'text-[11px] truncate'}`}>{r.module_name}</div>}
                                      <div className="text-[11px] opacity-80">{r.start_time.slice(0, 5)}–{r.end_time.slice(0, 5)} · {r.room_name}</div>
                                      <div className="text-[10px] opacity-70 capitalize">{r.session_type}</div>
                                      {r.staff_name && <div className="text-[10px] opacity-80 truncate flex items-center gap-1"><User className="w-2.5 h-2.5" />{r.staff_name}</div>}
                                      {dept && <div className="text-[10px] opacity-70 mt-0.5 truncate flex items-center gap-1"><Building2 className="w-2.5 h-2.5" />{dept.dep_name}</div>}
                                      <div className="mt-1 flex justify-end gap-1">
                                        <button className="icon-btn" title="Recolor module" onClick={(e) => { e.stopPropagation(); setColorPickerFor(pickerOpen ? null : r.module_id) }}><Palette className="w-3 h-3" /></button>
                                        <button className="icon-btn" title="Edit" onClick={() => editEntry(r)}><Pencil className="w-3 h-3" /></button>
                                        <button className="icon-btn text-red-500" onClick={() => confirm('Delete?') && remove.mutate(r.id)}><Trash2 className="w-3 h-3" /></button>
                                      </div>
                                      {pickerOpen && (
                                        <div className="absolute z-20 right-1 top-full mt-1 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-700 rounded-lg shadow-xl p-2 w-[150px]">
                                          <div className="text-[10px] uppercase tracking-wide font-bold text-ink-400 mb-1">Module color</div>
                                          <div className="grid grid-cols-6 gap-1">
                                            {PALETTE_HUES.map((h) => (
                                              <button key={h} type="button" title={`Hue ${h}°`}
                                                className="w-5 h-5 rounded-full border-2 border-white shadow ring-1 ring-ink-200 hover:scale-110 transition-transform"
                                                style={{ backgroundColor: `hsl(${h}, 65%, 55%)` }}
                                                onClick={(e) => { e.stopPropagation(); setModuleHue(r.module_id, h); setColorPickerFor(null) }}
                                              />
                                            ))}
                                          </div>
                                          <button type="button" className="text-[10px] text-ink-400 hover:text-ink-700 mt-1.5 block" onClick={(e) => { e.stopPropagation(); setModuleHue(r.module_id, null); setColorPickerFor(null) }}>
                                            Reset to default
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </td>
                            )
                          })}
                        </tr>
                      </tbody>
                    </table>
                  )
                })()
              ) : viewMode === 'month' ? (
                /* ── MONTH VIEW ── */
                (() => {
                  const first = startOfMonth(viewDate)
                  const last  = endOfMonth(viewDate)
                  const gridStart = startOfWeekMon(first)
                  const totalDays = Math.ceil((last.getTime() - gridStart.getTime()) / 86400000) + 1
                  const weeks = Math.ceil(totalDays / 7)
                  const today = new Date()
                  return (
                    <table className="w-full text-[11px] table-fixed">
                      <thead>
                        <tr>
                          {DAYS.map((d) => <th key={d} className="px-1 py-1 text-center font-bold text-ink-400 text-[10px] uppercase">{d}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: weeks }).map((_, w) => (
                          <tr key={w}>
                            {Array.from({ length: 7 }).map((_, di) => {
                              const d = addDays(gridStart, w * 7 + di)
                              const inMonth = d.getMonth() === viewDate.getMonth()
                              const isToday = sameDate(d, today)
                              const items = schedulesOnDate(d).sort((a, b) => a.start_time.localeCompare(b.start_time))
                              const cellHeight = isFullscreen ? 'h-40' : 'h-24'
                              const visibleCount = isFullscreen ? 6 : 2
                              return (
                                <td key={di} className={`align-top p-1 border border-ink-100 dark:border-ink-700 ${cellHeight} ${inMonth ? '' : 'bg-ink-50/50 dark:bg-ink-800/20'} ${isToday ? 'bg-brand/[0.04]' : ''}`}>
                                  <div className={`text-[11px] font-semibold mb-0.5 ${isToday ? 'text-brand' : inMonth ? 'text-ink-700 dark:text-ink-200' : 'text-ink-300'}`}>{d.getDate()}</div>
                                  <div className="space-y-0.5">
                                    {items.slice(0, visibleCount).map((r) => {
                                      const c = moduleColor(r.module_id)
                                      const dept = deptMap.get(moduleDeptMap.get(r.module_id) ?? 0)
                                      return (
                                        <button key={r.id}
                                          className={`w-full text-left rounded leading-tight border-l-[3px] hover:opacity-80 transition-opacity ${isFullscreen ? 'px-1.5 py-1 text-[11px]' : 'px-1 py-0.5 text-[10px]'}`}
                                          style={{ backgroundColor: c.bg, color: c.text, borderLeftColor: c.border }}
                                          title={`${r.module_code} ${r.module_name ?? ''}\n${r.start_time.slice(0, 5)}–${r.end_time.slice(0, 5)} · ${r.room_name}${r.staff_name ? '\nTeacher: ' + r.staff_name : ''}${dept ? '\nDept: ' + dept.dep_name : ''}`}
                                          onClick={() => editEntry(r)}>
                                          <div className="font-bold truncate">
                                            <span className="opacity-90">{r.start_time.slice(0, 5)}–{r.end_time.slice(0, 5)}</span>
                                            <span className="ml-1">{r.module_code}</span>
                                          </div>
                                          {isFullscreen && r.module_name && (
                                            <div className="text-[10px] opacity-90 truncate">{r.module_name}</div>
                                          )}
                                          <div className={`text-[9px] truncate opacity-80 ${isFullscreen ? '' : ''}`}>{r.room_name}</div>
                                          {r.staff_name && (
                                            <div className="text-[9px] truncate flex items-center gap-0.5 opacity-80">
                                              <User className="w-2.5 h-2.5" />{r.staff_name}
                                            </div>
                                          )}
                                          {isFullscreen && dept && (
                                            <div className="text-[9px] truncate flex items-center gap-0.5 opacity-70">
                                              <Building2 className="w-2.5 h-2.5" />{dept.dep_name}
                                            </div>
                                          )}
                                        </button>
                                      )
                                    })}
                                    {items.length > visibleCount && (
                                      <div className="text-[9px] text-ink-500 px-1">+{items.length - visibleCount} more</div>
                                    )}
                                  </div>
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                })()
              ) : (
                /* ── YEAR VIEW (12 mini months) ── */
                (() => {
                  const year = viewDate.getFullYear()
                  const today = new Date()
                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {Array.from({ length: 12 }).map((_, mi) => {
                        const monthStart = new Date(year, mi, 1)
                        const monthEnd   = endOfMonth(monthStart)
                        const gridStart  = startOfWeekMon(monthStart)
                        const totalDays  = Math.ceil((monthEnd.getTime() - gridStart.getTime()) / 86400000) + 1
                        const weeks      = Math.ceil(totalDays / 7)
                        const monthCount = (() => {
                          let c = 0
                          for (let d = new Date(monthStart); d <= monthEnd; d = addDays(d, 1)) c += schedulesOnDate(d).length
                          return c
                        })()
                        return (
                          <button key={mi} type="button"
                            className="border border-ink-100 dark:border-ink-700 rounded-md p-2 text-left hover:border-brand/40 hover:shadow-sm transition-all"
                            onClick={() => { setViewDate(monthStart); setViewMode('month') }}>
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="font-semibold text-[12px] text-ink-700 dark:text-ink-200">{MONTHS[mi]}</div>
                              {monthCount > 0 && <div className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand/10 text-brand font-semibold">{monthCount}</div>}
                            </div>
                            <table className="w-full text-[9px] table-fixed">
                              <thead>
                                <tr>
                                  {DAYS.map((d) => <th key={d} className="text-center text-ink-300 font-medium">{d[0]}</th>)}
                                </tr>
                              </thead>
                              <tbody>
                                {Array.from({ length: weeks }).map((_, w) => (
                                  <tr key={w}>
                                    {Array.from({ length: 7 }).map((_, di) => {
                                      const d = addDays(gridStart, w * 7 + di)
                                      const inMonth = d.getMonth() === mi
                                      const isToday = sameDate(d, today)
                                      const dayItems = inMonth ? schedulesOnDate(d) : []
                                      const has = dayItems.length > 0
                                      // Color the day cell with the first scheduled module's hue.
                                      // If multiple modules share that day, render a thin underline of stacked colors.
                                      const primary = has ? moduleColor(dayItems[0].module_id) : null
                                      const extras = has && dayItems.length > 1
                                        ? Array.from(new Set(dayItems.slice(1, 5).map((r) => r.module_id))).map((id) => moduleColor(id))
                                        : []
                                      const cellStyle = primary && !isToday
                                        ? { backgroundColor: primary.bg, color: primary.text, borderColor: primary.border }
                                        : undefined
                                      return (
                                        <td key={di} className="text-center p-0.5">
                                          <div
                                            className={`w-5 h-5 mx-auto flex items-center justify-center rounded-full text-[9px] relative ${
                                              !inMonth ? 'text-ink-200' :
                                              isToday ? 'bg-brand text-white font-bold' :
                                              has ? 'font-semibold border' :
                                              'text-ink-500'
                                            }`}
                                            style={cellStyle}
                                          >
                                            {d.getDate()}
                                            {extras.length > 0 && (
                                              <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 flex gap-[1px]">
                                                {extras.map((c, i) => (
                                                  <span key={i} className="w-1 h-1 rounded-full" style={{ backgroundColor: c.border }} />
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        </td>
                                      )
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </button>
                        )
                      })}
                    </div>
                  )
                })()
              )}
            </div>
          </div>

          {/* ── Schedule List (table view) ── */}
          <div className="card overflow-hidden lg:col-span-5">
            <div className="px-4 py-2.5 border-b border-ink-100 dark:border-ink-700 font-semibold text-[13px]">
              All scheduled entries ({filteredSchedules.length})
            </div>
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="bg-ink-50 dark:bg-ink-800/50 border-b border-ink-100 dark:border-ink-700">
                  <th className="px-4 py-2 font-bold text-ink-400 text-[10px] uppercase">Module</th>
                  <th className="px-4 py-2 font-bold text-ink-400 text-[10px] uppercase">Department</th>
                  <th className="px-4 py-2 font-bold text-ink-400 text-[10px] uppercase">Day</th>
                  <th className="px-4 py-2 font-bold text-ink-400 text-[10px] uppercase">Time</th>
                  <th className="px-4 py-2 font-bold text-ink-400 text-[10px] uppercase">Room</th>
                  <th className="px-4 py-2 font-bold text-ink-400 text-[10px] uppercase">Type</th>
                  <th className="px-4 py-2 font-bold text-ink-400 text-[10px] uppercase">Teacher</th>
                  <th className="px-4 py-2 font-bold text-ink-400 text-[10px] uppercase">Range</th>
                  <th className="px-4 py-2 font-bold text-ink-400 text-[10px] uppercase text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                {filteredSchedules.length === 0 ? (
                  <tr><td colSpan={9} className="p-6 text-center text-ink-400">No schedule entries{hasFilters ? ' match the filters' : ' yet'}.</td></tr>
                ) : filteredSchedules.sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time)).map((r) => {
                  const dept = deptMap.get(moduleDeptMap.get(r.module_id) ?? 0)
                  const isWeek = r.start_date && r.end_date && Math.round((new Date(r.end_date).getTime() - new Date(r.start_date).getTime()) / 86400000) === 6
                  return (
                    <tr key={r.id} className="hover:bg-ink-50/50 dark:hover:bg-ink-700/20">
                      <td className="px-4 py-2.5"><span className="font-mono">{r.module_code}</span> <span className="text-ink-500">· {r.module_name}</span></td>
                      <td className="px-4 py-2.5 text-ink-500">{dept?.dep_name ?? '—'}</td>
                      <td className="px-4 py-2.5">{DAYS[r.day_of_week - 1]}</td>
                      <td className="px-4 py-2.5 font-mono">{r.start_time.slice(0, 5)}–{r.end_time.slice(0, 5)}</td>
                      <td className="px-4 py-2.5">{r.room_name}</td>
                      <td className="px-4 py-2.5 capitalize">{r.session_type}</td>
                      <td className="px-4 py-2.5 text-ink-600">{r.staff_name ?? <span className="text-ink-300">Unassigned</span>}</td>
                      <td className="px-4 py-2.5 text-[12px] text-ink-500">
                        {isWeek
                          ? <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-brand/10 text-brand text-[11px]"><CalendarDays className="w-3 h-3" />Week of {r.start_date}</span>
                          : r.start_date || r.end_date
                            ? `${r.start_date ?? '…'} → ${r.end_date ?? '…'}`
                            : <span className="text-ink-300">Full term</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button className="icon-btn" onClick={() => editEntry(r)}><Pencil className="w-3.5 h-3.5" /></button>
                          <button className="icon-btn text-red-500" onClick={() => confirm('Delete?') && remove.mutate(r.id)}><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
