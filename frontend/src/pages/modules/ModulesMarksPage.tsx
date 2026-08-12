import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAnyPermission } from '@/utils/permissions'
import { useGradingScale } from '@/utils/gradingScale'
import { PERMISSIONS } from '@/constants/permissions'
import {
  Loader2, Save,
  CheckCircle2, FileCheck, SendHorizontal, RotateCcw, Lock,
  UserPlus, Search, X, Download, Upload, AlertTriangle,
  Filter, BookOpen, ChevronLeft, AlertCircle,
  CalendarClock, UserSearch,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'
import { academicService } from '@/services/academicService'
import { studentService } from '@/services/studentService'
import { attendanceService, type ScheduledBlock } from '@/services/attendanceService'
import { portalService } from '@/services/admissionService'
import { academicsMgmtService } from '@/services/academicsMgmtService'
import SearchableSelect from '@/components/ui/SearchableSelect'
import {
  marksService,
  type MarkableModule,
  type MarksRosterRow,
  type SaveMarkRecord,
  type MarksModuleHeader,
  type MarksWorkflow,
  type MarksWorkflowStatus,
  type MyMarksRow,
} from '@/services/marksService'

interface RowDraft {
  cat1:     string
  cat2:     string
  cat3:     string
  partial:  string
  exam1:    string
  exam2:    string
  remarks:  string
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const toStr = (v: unknown): string =>
  v === null || v === undefined || v === '' ? '' : String(v)

// Grades come from the registry's configured scale (/academic/grading-scale)
// via useGradingScale(), not from a ladder hardcoded here — see
// @/utils/gradingScale and its server twin App\Helpers\GradingScale.

const decisionFor = (pct: number | null): string | null =>
  pct === null ? null : pct >= 50 ? 'P' : 'F&R'

/* ──────────────────────────────────────────────────────────────────────
 * Top-level dispatcher. Decides between the schedule-list landing view
 * and the marks editor based on whether `module_id` is in the URL.
 *
 * The two views are split into separate components so each owns a stable
 * set of hooks. Mounting a different component when the route changes
 * keeps React's hook-count invariant intact (otherwise toggling between
 * the picker and editor blows up with "Rendered more hooks…").
 * ─────────────────────────────────────────────────────────────────── */
export default function ModulesMarksPage() {
  const [sp, setSp] = useSearchParams()
  const moduleId = Number(sp.get('module_id') || 0)

  /* ── shared term state — kept here so it survives toggling the views ── */
  const termsQ = useQuery({ queryKey: ['academic', 'terms'], queryFn: () => academicService.listTerms() })
  const terms  = termsQ.data?.data ?? []
  const [termId, setTermId] = useState<number>(0)
  useEffect(() => {
    if (!termId && terms.length) {
      const current = terms.find((t: any) => t.is_current) ?? terms[0]
      setTermId(current.id)
    }
  }, [terms, termId])

  const pickModule = (modId: number, code: string, name: string) => {
    const next = new URLSearchParams(sp)
    next.set('module_id', String(modId))
    next.set('m_code', code || '')
    next.set('m_name', name || '')
    setSp(next, { replace: true })
  }

  /* ── Entry tabs ────────────────────────────────────────────────────────
   * Three ways into the same marks data, because the schedule list alone
   * only reaches modules that have a timetable block — four of them here,
   * against 663 modules that actually hold marks. The tab lives in the URL
   * so a reload or a back-navigation returns to the same place. */
  const tab = (sp.get('tab') ?? 'schedules') as MarksEntryTab
  const setTab = (t: MarksEntryTab) => {
    const next = new URLSearchParams(sp)
    next.set('tab', t)
    setSp(next, { replace: true })
  }

  if (!moduleId) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center gap-1 border-b border-ink-100 dark:border-ink-700">
          {([
            ['schedules', 'Schedules',   CalendarClock],
            ['modules',   'All modules', BookOpen],
            ['student',   'By student',  UserSearch],
          ] as [MarksEntryTab, string, typeof BookOpen][]).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-semibold border-b-2 -mb-px transition-colors ${
                tab === id
                  ? 'border-brand text-brand'
                  : 'border-transparent text-ink-500 hover:text-ink-800 dark:hover:text-ink-200'
              }`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {tab === 'schedules' && (
          <MarksSchedulePicker
            termId={termId}
            terms={terms}
            onChangeTerm={setTermId}
            onPickModule={pickModule}
          />
        )}
        {tab === 'modules' && (
          <AllModulesPicker
            termId={termId}
            terms={terms}
            onChangeTerm={setTermId}
            onPickModule={pickModule}
          />
        )}
        {tab === 'student' && <StudentMarksExplorer />}
      </div>
    )
  }

  return (
    <MarksEditor
      // Remount on module switch so the editor's internal state (drafts,
      // extras, hydration ref) resets cleanly to the new module.
      key={moduleId}
      moduleId={moduleId}
      termId={termId}
      terms={terms}
      setTermId={setTermId}
      onBackToSchedules={() => {
        const next = new URLSearchParams(sp)
        next.delete('module_id')
        next.delete('m_code')
        next.delete('m_name')
        setSp(next, { replace: true })
      }}
    />
  )
}

type MarksEntryTab = 'schedules' | 'modules' | 'student'

/**
 * Every module that can hold marks, not just the timetabled ones.
 *
 * `/api/marks/markable-modules` returns every active module for a
 * MANAGE_MODULE_MARKS holder and the lecturer's own modules otherwise, so this
 * list is already correctly scoped per user.
 */
function AllModulesPicker({
  termId, terms, onChangeTerm, onPickModule,
}: {
  termId:       number
  terms:        any[]
  onChangeTerm: (id: number) => void
  onPickModule: (moduleId: number, code: string, name: string) => void
}) {
  const [search, setSearch] = useState('')

  const modulesQ = useQuery({
    queryKey: ['marks', 'markable-modules', termId],
    queryFn:  () => marksService.markableModules({ academic_term_id: termId }),
    enabled:  !!termId,
  })
  const modules: MarkableModule[] = modulesQ.data?.data ?? []

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return modules
    return modules.filter((m) =>
      `${m.module_code} ${m.module_name}`.toLowerCase().includes(q))
  }, [modules, search])

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-ink-900 dark:text-white">All modules</h2>
            <p className="text-[13px] text-ink-500">
              Every module you can record or review marks for — including those with no
              timetable block. Pick one to open its mark sheet.
            </p>
          </div>
          <select
            className="input input-sm w-44"
            value={termId || ''}
            onChange={(e) => onChangeTerm(Number(e.target.value))}
          >
            <option value="" disabled>Select term…</option>
            {terms.map((t: any) => (
              <option key={t.id} value={t.id}>{t.label}{t.is_current ? ' (current)' : ''}</option>
            ))}
          </select>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
          <input
            className="input input-sm w-full pl-8"
            placeholder="Search by module code or name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-ink-100 dark:border-ink-700">
          <span className="font-bold text-ink-900 dark:text-white">
            {modulesQ.isLoading ? 'Loading…' : `${shown.length} module${shown.length === 1 ? '' : 's'}`}
          </span>
        </div>
        {modulesQ.isLoading ? (
          <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" /></div>
        ) : shown.length === 0 ? (
          <div className="p-8 text-center text-ink-400">
            {termId ? 'No module matches that search.' : 'Pick a term to list modules.'}
          </div>
        ) : (
          <div className="max-h-[620px] overflow-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="sticky top-0 bg-sky-50 dark:bg-ink-800/50">
                <tr className="border-b border-ink-100 dark:border-ink-700">
                  <th className="px-4 py-2.5 text-[10px] uppercase font-bold text-ink-500">Code</th>
                  <th className="px-4 py-2.5 text-[10px] uppercase font-bold text-ink-500">Module</th>
                  <th className="px-4 py-2.5 text-[10px] uppercase font-bold text-ink-500">Level</th>
                  <th className="px-4 py-2.5 text-[10px] uppercase font-bold text-ink-500 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                {shown.map((m) => (
                  <tr
                    key={m.module_id}
                    className="hover:bg-ink-50/60 dark:hover:bg-ink-700/20 cursor-pointer"
                    onClick={() => onPickModule(m.module_id, m.module_code, m.module_name)}
                  >
                    <td className="px-4 py-2.5 font-mono font-bold text-brand">{m.module_code}</td>
                    <td className="px-4 py-2.5 text-ink-800 dark:text-ink-100">{m.module_name}</td>
                    <td className="px-4 py-2.5 text-ink-500">{m.level ? `Level ${m.level}` : '—'}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="btn-primary btn-sm inline-flex">View marks</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Search a student, see their entire academic record.
 *
 * Reads `/api/marks/students/by-id/:id`, which returns every mark the student
 * holds across all modules and terms — the id-based route rather than the
 * regnumber one because CUR regnumbers can contain slashes that break
 * path-segment routing.
 */
function StudentMarksExplorer() {
  const [query, setQuery]     = useState('')
  const [debounced, setDeb]   = useState('')
  const [picked, setPicked]   = useState<{ id: number; label: string } | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDeb(query.trim()), 300)
    return () => clearTimeout(t)
  }, [query])

  // Suggest only from 3 characters — two characters matches a large chunk of a
  // 13k-student table and the list is noise.
  const MIN_CHARS = 3
  const canSearch = debounced.length >= MIN_CHARS

  const searchQ = useQuery({
    queryKey: ['marks', 'student-search', debounced],
    queryFn:  () => studentService.list({ q: debounced, per_page: 20 }),
    enabled:  canSearch && !picked,
  })
  // The students endpoint answers { data: { data: [...], pagination } } — the
  // payload is nested twice. Reading only one level handed back an object, and
  // `results.map` then threw "results.map is not a function".
  const results: any[] = ((searchQ.data as any)?.data?.data ?? []) as any[]

  const recordQ = useQuery({
    queryKey: ['marks', 'student-record', picked?.id],
    queryFn:  () => marksService.studentMarksById(picked!.id),
    enabled:  !!picked,
  })
  const record = recordQ.data?.data
  const rows   = record?.rows ?? []

  // Completed vs still-outstanding programme modules.
  const coverageQ = useQuery({
    queryKey: ['marks', 'student-coverage', picked?.id],
    queryFn:  () => marksService.studentCoverageById(picked!.id),
    enabled:  !!picked,
  })
  const coverage = coverageQ.data?.data
  const remaining = coverage?.remaining ?? []

  // Group by academic year → term, the way a transcript reads.
  const grouped = useMemo(() => {
    const g = new Map<string, MyMarksRow[]>()
    rows.forEach((r) => {
      const key = `${r.year_label ?? '—'} · ${r.term_label ?? '—'}`
      if (!g.has(key)) g.set(key, [])
      g.get(key)!.push(r)
    })
    return Array.from(g.entries())
  }, [rows])

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-3">
        <div>
          <h2 className="text-lg font-bold text-ink-900 dark:text-white">Student academic record</h2>
          <p className="text-[13px] text-ink-500">
            Search a student to see every mark they hold — and which programme
            modules they still have outstanding.
          </p>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
          <input
            className="input input-sm w-full pl-8"
            placeholder={`Search by name or registration number (${MIN_CHARS}+ characters)…`}
            value={picked ? picked.label : query}
            onChange={(e) => { setPicked(null); setQuery(e.target.value) }}
          />
          {picked && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700"
              onClick={() => { setPicked(null); setQuery('') }}
              title="Clear"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {!picked && query.trim().length > 0 && !canSearch && (
          <p className="text-[12px] text-ink-400">
            Keep typing — {MIN_CHARS} characters or more to search.
          </p>
        )}

        {!picked && canSearch && (
          <div className="border border-ink-100 dark:border-ink-700 rounded-lg max-h-64 overflow-auto divide-y divide-ink-100 dark:divide-ink-700">
            {searchQ.isLoading ? (
              <div className="p-4 text-center"><Loader2 className="w-4 h-4 animate-spin mx-auto text-brand" /></div>
            ) : results.length === 0 ? (
              <div className="p-4 text-center text-ink-400 text-[13px]">No student found.</div>
            ) : results.map((s: any) => (
              <button
                key={s.id}
                className="w-full text-left px-3 py-2 hover:bg-ink-50 dark:hover:bg-ink-800 text-[13px]"
                onClick={() => setPicked({ id: s.id, label: `${s.fname ?? ''} ${s.lname ?? ''} — ${s.regnumber}`.trim() })}
              >
                <span className="font-semibold text-ink-800 dark:text-ink-100">
                  {s.fname} {s.lname}
                </span>
                <span className="text-ink-500 font-mono ml-2">{s.regnumber}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {picked && recordQ.isLoading && (
        <div className="card p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" /></div>
      )}

      {picked && !recordQ.isLoading && record && (
        <>
          <div className="card p-4 flex flex-wrap items-center gap-5">
            <div className="min-w-0">
              <div className="text-[15px] font-bold text-ink-900 dark:text-white">
                {record.student?.fname} {record.student?.lname}
              </div>
              <div className="text-[12px] text-ink-500 font-mono">{record.student?.regnumber}</div>
              {coverage?.student?.option_name && (
                <div className="text-[12px] text-ink-500 mt-0.5">
                  {coverage.student.option_acro ? `${coverage.student.option_acro} — ` : ''}
                  {coverage.student.option_name}
                </div>
              )}
            </div>
            <div className="flex items-center gap-5 flex-wrap ml-auto">
              <HeaderStat label="Completed" value={record.totals?.modules ?? rows.length} tone="good" />
              <HeaderStat
                label="Remaining"
                value={coverage?.totals?.has_curriculum ? (coverage.totals.remaining ?? 0) : '—'}
                tone={(coverage?.totals?.remaining ?? 0) > 0 ? 'warn' : undefined}
              />
              <HeaderStat label="Passed"   value={record.totals?.passed ?? 0} tone="good" />
              <HeaderStat label="Failed"   value={record.totals?.failed ?? 0} tone={(record.totals?.failed ?? 0) > 0 ? 'warn' : undefined} />
              <HeaderStat label="Average"  value={record.totals?.weighted_average != null ? `${record.totals.weighted_average}%` : '—'} />
            </div>
          </div>

          {/* Outstanding programme modules. Shown FIRST — the reason to open a
              student's record is usually "what are they still missing?", and
              burying it under years of completed marks hides the answer. */}
          {coverage && (
            coverage.totals.has_curriculum ? (
              remaining.length > 0 ? (
                <div className="card overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-ink-100 dark:border-ink-700 flex items-center gap-2 flex-wrap">
                    <AlertCircle className="w-4 h-4 text-amber-500" />
                    <span className="font-semibold text-[13px] text-ink-800 dark:text-ink-100">
                      Remaining — {remaining.length} module{remaining.length === 1 ? '' : 's'} with no mark
                    </span>
                    <span className="text-[12px] text-ink-400">
                      {coverage.totals.credits_remaining} credit{coverage.totals.credits_remaining === 1 ? '' : 's'} outstanding
                    </span>
                  </div>
                  {coverage.totals.curriculum_suspect && (
                    <div className="px-4 py-2 bg-amber-50 dark:bg-amber-500/10 border-b border-ink-100 dark:border-ink-700 text-[12px] text-amber-800 dark:text-amber-300">
                      This programme maps to {coverage.totals.curriculum_size} modules in
                      {' '}<span className="font-mono">module_programs</span> — a legacy bulk
                      import rather than a real curriculum, so treat this list as
                      indicative, not a definitive backlog.
                    </div>
                  )}
                  <div className="overflow-auto max-h-72">
                    <table className="w-full text-left text-[12.5px]">
                      <thead className="sticky top-0 bg-amber-50/70 dark:bg-amber-500/10">
                        <tr className="border-b border-ink-100 dark:border-ink-700">
                          <th className="px-3 py-2 text-[10px] uppercase font-bold text-ink-500">Code</th>
                          <th className="px-3 py-2 text-[10px] uppercase font-bold text-ink-500">Module</th>
                          <th className="px-3 py-2 text-[10px] uppercase font-bold text-ink-500 text-center">Level</th>
                          <th className="px-3 py-2 text-[10px] uppercase font-bold text-ink-500 text-center">Credits</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                        {remaining.map((r) => (
                          <tr key={r.module_id} className="hover:bg-ink-50/50 dark:hover:bg-ink-700/20">
                            <td className="px-3 py-2 font-mono font-semibold text-amber-700 dark:text-amber-400">{r.module_code}</td>
                            <td className="px-3 py-2 text-ink-800 dark:text-ink-100">{r.module_name}</td>
                            <td className="px-3 py-2 text-center text-ink-500">{r.level ?? '—'}</td>
                            <td className="px-3 py-2 text-center text-ink-500">{r.module_credits ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="card p-4 flex items-center gap-2 text-[13px] text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  Every module in this student&apos;s programme has a recorded mark.
                </div>
              )
            ) : (
              // No programme mapped — "0 remaining" would read as "finished".
              <div className="card p-4 flex items-center gap-2 text-[13px] text-ink-500">
                <AlertCircle className="w-4 h-4 text-ink-400" />
                No programme is mapped to this student, so outstanding modules
                cannot be worked out. Their completed marks are listed below.
              </div>
            )
          )}

          {rows.length === 0 ? (
            <div className="card p-8 text-center text-ink-400">
              This student has no marks recorded.
            </div>
          ) : grouped.map(([label, list]) => (
            <div key={label} className="card overflow-hidden">
              <div className="px-4 py-2.5 border-b border-ink-100 dark:border-ink-700 font-semibold text-[13px] text-ink-700 dark:text-ink-200">
                {label} <span className="text-ink-400 font-normal">· {list.length} module{list.length === 1 ? '' : 's'}</span>
              </div>
              <div className="overflow-auto">
                <table className="w-full text-left text-[12.5px]">
                  <thead className="bg-sky-50 dark:bg-ink-800/50">
                    <tr className="border-b border-ink-100 dark:border-ink-700">
                      <th className="px-3 py-2 text-[10px] uppercase font-bold text-ink-500">Code</th>
                      <th className="px-3 py-2 text-[10px] uppercase font-bold text-ink-500">Module</th>
                      <th className="px-3 py-2 text-[10px] uppercase font-bold text-ink-500 text-center">Credits</th>
                      <th className="px-3 py-2 text-[10px] uppercase font-bold text-ink-500 text-center">CAT</th>
                      <th className="px-3 py-2 text-[10px] uppercase font-bold text-ink-500 text-center">Exam</th>
                      <th className="px-3 py-2 text-[10px] uppercase font-bold text-ink-500 text-center">Total</th>
                      <th className="px-3 py-2 text-[10px] uppercase font-bold text-ink-500 text-center">%</th>
                      <th className="px-3 py-2 text-[10px] uppercase font-bold text-ink-500 text-center">Grade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                    {list.map((r) => (
                      <tr key={r.id} className="hover:bg-ink-50/50 dark:hover:bg-ink-700/20">
                        <td className="px-3 py-2 font-mono font-semibold text-brand">{r.module_code}</td>
                        <td className="px-3 py-2 text-ink-800 dark:text-ink-100">{r.module_name}</td>
                        <td className="px-3 py-2 text-center text-ink-500">{r.module_credits ?? '—'}</td>
                        <td className="px-3 py-2 text-center">{r.cat_marks ?? '—'}</td>
                        <td className="px-3 py-2 text-center">{r.exam_marks ?? '—'}</td>
                        <td className="px-3 py-2 text-center font-semibold">{r.total ?? '—'}</td>
                        <td className="px-3 py-2 text-center">{r.percentage ?? '—'}</td>
                        {/* The server grades every row off the configured scale,
                            so this is only ever blank when there is no mark. */}
                        <td
                          className="px-3 py-2 text-center font-bold"
                          title={r.grade_label ?? undefined}
                        >
                          {r.grade ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

export function MarksEditor({
  moduleId, termId, terms, setTermId, onBackToSchedules, embedded = false, onBridge,
}: {
  moduleId:         number
  termId:           number
  terms:            any[]
  setTermId:        (id: number) => void
  onBackToSchedules: () => void
  /**
   * Embedded in the teacher course page: the host already shows the module
   * identity and owns term/module selection, so the picker toolbar and the
   * module header card are suppressed and the action bar stops being sticky
   * (the host header is the only sticky element there).
   */
  embedded?: boolean
  /** Lets a host (the teacher course page) drive Save from its own header. */
  onBridge?: (api: { save: () => Promise<unknown>; saving: boolean; canSave: boolean } | null) => void
}) {
  const qc = useQueryClient()
  const [, setSp] = useSearchParams()
  const scale = useGradingScale()

  const setModuleId = (id: number) => {
    setSp((prev) => {
      const next = new URLSearchParams(prev)
      if (id > 0) {
        next.set('module_id', String(id))
      } else {
        next.delete('module_id')
        next.delete('m_code')
        next.delete('m_name')
      }
      return next
    }, { replace: true })
  }

  const modulesQ = useQuery({
    queryKey: ['marks', 'markable-modules', termId],
    queryFn: () => marksService.markableModules({ academic_term_id: termId }),
    enabled: !!termId,
  })
  const modules: MarkableModule[] = modulesQ.data?.data ?? []
  // If the term was switched and the previously-picked module isn't markable
  // there anymore, drop it so the schedule picker reappears.
  useEffect(() => {
    if (moduleId && modules.length && !modules.find((m) => m.module_id === moduleId)) {
      onBackToSchedules()
    }
     
  }, [modules, moduleId])

  /* ── roster ───────────────────────────────────────────────────── */
  const listQ = useQuery({
    queryKey: ['marks', 'list', moduleId, termId],
    queryFn: () => marksService.list({ module_id: moduleId, academic_term_id: termId }),
    enabled: !!moduleId && !!termId,
  })
  const payload  = listQ.data?.data
  const baseRoster = payload?.roster
  const summary  = payload?.summary
  const moduleH: MarksModuleHeader | undefined = payload?.module
  const workflow: MarksWorkflow | undefined    = payload?.workflow

  /* ── The term the sheet is actually showing ─────────────────────────────
   * Nearly every mark in the system was landed under the 'Legacy (imported
   * marks)' term, so opening a module on the current term showed a guessed
   * roster and not one mark. The server now falls back to the term that holds
   * the module's marks and reports which one it served.
   *
   * The selector displays THAT term rather than the requested one, and writes
   * go to it — saving against `termId` would fork a second sheet in a term the
   * user is not looking at. The query key deliberately stays on `termId`: the
   * request is what the user picked, so the redirect stays visible and
   * explainable instead of erasing its own reason on a follow-up refetch. */
  const servedTermId = payload?.term?.id ?? 0
  const writeTermId  = servedTermId || termId
  const redirectedTerm =
    payload?.requested_term_id != null && servedTermId && payload.requested_term_id !== servedTermId
      ? payload?.term ?? null
      : null
  /** Terms holding marks for this module other than the one on screen. */
  const otherMarkTerms = (payload?.terms_with_marks ?? []).filter((t) => t.id !== servedTermId)

  /* ── manually-picked students (admin "let me select") ─────────── */
  const [extras, setExtras] = useState<Record<string, MarksRosterRow>>({})
  // Reset extras when the user switches module/term — they're context-bound.
  useEffect(() => { setExtras({}) }, [moduleId, termId])

  const roster = useMemo<MarksRosterRow[] | undefined>(() => {
    if (!baseRoster) return undefined
    const seen = new Set(baseRoster.map((r) => r.regnumber))
    const onlyNew = Object.values(extras).filter((r) => !seen.has(r.regnumber))
    return [...baseRoster, ...onlyNew].sort((a, b) =>
      `${a.lname ?? ''} ${a.fname ?? ''}`.localeCompare(`${b.lname ?? ''} ${b.fname ?? ''}`)
    )
  }, [baseRoster, extras])

  /* ── per-row draft state ──────────────────────────────────────── */
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({})
  const [maxes, setMaxes] = useState<{
    cat1: number; cat2: number; cat3: number; partial: number; cats: number; final: number
  }>({ cat1: 15, cat2: 15, cat3: 15, partial: 15, cats: 60, final: 40 })

  // Hydrate drafts ONCE per (module, term) selection — preserves user edits
  // (manual entry, CSV import, etc.) across refetches/refocuses that would
  // otherwise change the `roster` reference and trigger a re-hydration.
  const hydratedKey = useRef<string>('')
  useEffect(() => {
    if (!roster) return
    const key = `${moduleId}|${termId}`
    if (hydratedKey.current === key) return
    hydratedKey.current = key

    const next: Record<string, RowDraft> = {}
    for (const r of roster) {
      next[r.regnumber] = {
        cat1:    toStr(r.cat1),
        cat2:    toStr(r.cat2),
        cat3:    toStr(r.cat3),
        partial: toStr(r.partial_exam),
        exam1:   toStr(r.exam_1st_sitting),
        exam2:   toStr(r.exam_2nd_sitting),
        remarks: r.remarks ?? '',
      }
    }
    setDrafts(next)

    const first = roster.find((r) => r.mark_id !== null)
    if (first) {
      setMaxes({
        cat1:    Number(first.cat1_max)         || 15,
        cat2:    Number(first.cat2_max)         || 15,
        cat3:    Number(first.cat3_max)         || 15,
        partial: Number(first.partial_exam_max) || 15,
        cats:    Number(first.cats_max)         || 60,
        final:   Number(first.final_exam_max)   || 40,
      })
    }
  }, [roster, moduleId, termId])

  // Backfill drafts for new roster rows. When the row has saved marks, seed
  // from the server values; otherwise create an empty draft. This handles
  // students that join the roster after the initial hydration ran — e.g.,
  // a manually-picked student whose marks were just saved and now arrive
  // through the registered roster path with persisted cat1/cat2/etc.
  useEffect(() => {
    if (!roster) return
    setDrafts((prev) => {
      let changed = false
      const next = { ...prev }
      for (const r of roster) {
        const cur = next[r.regnumber]
        const isEmpty = !cur || (
          !cur.cat1 && !cur.cat2 && !cur.cat3 && !cur.partial &&
          !cur.exam1 && !cur.exam2 && !cur.remarks
        )
        if (cur && !isEmpty) continue
        if (r.mark_id !== null) {
          next[r.regnumber] = {
            cat1:    toStr(r.cat1),
            cat2:    toStr(r.cat2),
            cat3:    toStr(r.cat3),
            partial: toStr(r.partial_exam),
            exam1:   toStr(r.exam_1st_sitting),
            exam2:   toStr(r.exam_2nd_sitting),
            remarks: r.remarks ?? '',
          }
          changed = true
        } else if (!cur) {
          next[r.regnumber] = { cat1: '', cat2: '', cat3: '', partial: '', exam1: '', exam2: '', remarks: '' }
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [roster])

  /* ── derived ──────────────────────────────────────────────────── */

  const computed = useMemo(() => {
    type Row = {
      catsTotal: number | null
      finalMark: number | null
      total:     number | null
      pct:       number | null
      grade:     string | null
      decision:  string | null
      hasAny:    boolean
      /** Values come from the legacy CAT/exam columns, not the CUR components. */
      legacy:    boolean
    }
    const map: Record<string, Row> = {}
    if (!roster) return map
    const maxSum = maxes.cats + maxes.final
    const blank = (): Row => ({
      catsTotal: null, finalMark: null, total: null, pct: null,
      grade: null, decision: null, hasAny: false, legacy: false,
    })

    /* Historical marks were recorded as a single CAT aggregate plus one exam
     * mark — `cat_marks` / `exam_marks` / `total` — with no CAT1–Partial
     * breakdown, and that is how 292,632 of the 292,648 rows in the system are
     * stored. The sheet reads the CUR component columns, which are NULL on all
     * of them, so those marks rendered as dashes. Fall back to what WAS
     * recorded rather than showing nothing: the CAT total and the exam land in
     * their aggregate columns, and the breakdown honestly stays blank. */
    const legacyRow = (r: MarksRosterRow): Row | null => {
      if (r.mark_id === null) return null
      const lCats  = num(r.cat_marks)
      const lExam  = num(r.exam_marks)
      const lTotal = num(r.total)
      if (lCats === null && lExam === null && lTotal === null) return null
      const total = lTotal ?? (lCats ?? 0) + (lExam ?? 0)
      const pct   = num(r.percentage) ?? (maxSum > 0 ? +(total / maxSum * 100).toFixed(2) : null)
      return {
        catsTotal: lCats,
        finalMark: lExam,
        total,
        pct,
        grade:    scale.gradeFor(pct) ?? r.grade,
        decision: r.decision ?? decisionFor(pct),
        hasAny:   true,
        legacy:   true,
      }
    }

    for (const r of roster) {
      const d = drafts[r.regnumber]
      if (!d) {
        map[r.regnumber] = legacyRow(r) ?? blank()
        continue
      }
      const c1 = num(d.cat1), c2 = num(d.cat2), c3 = num(d.cat3), pe = num(d.partial)
      const e1 = num(d.exam1), e2 = num(d.exam2)
      const hasAny = [c1, c2, c3, pe, e1, e2].some((x) => x !== null)
      if (!hasAny) {
        // No components typed or saved — show the legacy figures if the row has
        // them. Once any component IS entered the computed values win, so a row
        // being re-keyed into the CUR template never shows stale legacy totals.
        map[r.regnumber] = legacyRow(r) ?? blank()
        continue
      }
      const catsTotal = (c1 ?? 0) + (c2 ?? 0) + (c3 ?? 0) + (pe ?? 0)
      const finalMark = e2 !== null ? Math.max(e1 ?? 0, e2) : (e1 ?? null)
      const total     = catsTotal + (finalMark ?? 0)
      const pct       = maxSum > 0 ? +(total / maxSum * 100).toFixed(2) : null
      map[r.regnumber] = {
        catsTotal: +catsTotal.toFixed(2),
        finalMark: finalMark !== null ? +finalMark.toFixed(2) : null,
        total: +total.toFixed(2),
        pct,
        grade: scale.gradeFor(pct),
        decision: decisionFor(pct),
        hasAny,
        legacy: false,
      }
    }
    return map
  }, [drafts, roster, maxes, scale])

  const setCell = (reg: string, key: keyof RowDraft, val: string) => {
    setDrafts((prev) => ({
      ...prev,
      [reg]: {
        ...(prev[reg] ?? { cat1: '', cat2: '', cat3: '', partial: '', exam1: '', exam2: '', remarks: '' }),
        [key]: val,
      },
    }))
  }

  // Dirty per row — drafts differ from the persisted row.
  const dirty = useMemo<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {}
    if (!roster) return out
    for (const r of roster) {
      if (r.is_exempted) { out[r.regnumber] = false; continue }
      const d = drafts[r.regnumber]; if (!d) { out[r.regnumber] = false; continue }
      const same =
        toStr(r.cat1)             === d.cat1 &&
        toStr(r.cat2)             === d.cat2 &&
        toStr(r.cat3)             === d.cat3 &&
        toStr(r.partial_exam)     === d.partial &&
        toStr(r.exam_1st_sitting) === d.exam1 &&
        toStr(r.exam_2nd_sitting) === d.exam2 &&
        (r.remarks ?? '')         === d.remarks
      out[r.regnumber] = !same
    }
    return out
  }, [drafts, roster])
  const dirtyCount = Object.values(dirty).filter(Boolean).length

  /** Rows displaying imported figures rather than CUR component scores. */
  const legacyCount = useMemo(
    () => Object.values(computed).filter((c) => c.legacy).length,
    [computed]
  )

  /* ── workflow lock ────────────────────────────────────────────── */
  const status: MarksWorkflowStatus = workflow?.status ?? 'draft'
  const isLocked = status === 'submitted' || status === 'confirmed'

  /* ── save ─────────────────────────────────────────────────────── */
  const save = useMutation({
    mutationFn: () => {
      const records: SaveMarkRecord[] = (roster ?? [])
        .map((r): SaveMarkRecord | null => {
          // Exempted rows are owned by the Student details → Curriculum view;
          // never overwrite them from this page.
          if (r.is_exempted) return null
          const d = drafts[r.regnumber]; if (!d) return null
          const cat1 = num(d.cat1), cat2 = num(d.cat2), cat3 = num(d.cat3)
          const pe   = num(d.partial)
          const e1   = num(d.exam1), e2 = num(d.exam2)
          const remarks = d.remarks?.trim() || null
          if (cat1 === null && cat2 === null && cat3 === null && pe === null && e1 === null && e2 === null && !remarks) {
            return null
          }
          return {
            student_regnumber: r.regnumber,
            cat1, cat2, cat3, partial_exam: pe,
            exam_1st_sitting: e1, exam_2nd_sitting: e2,
            cat1_max: maxes.cat1, cat2_max: maxes.cat2, cat3_max: maxes.cat3,
            partial_exam_max: maxes.partial, cats_max: maxes.cats, final_exam_max: maxes.final,
            remarks,
          }
        })
        .filter((x): x is SaveMarkRecord => x !== null)

      if (records.length === 0) return Promise.reject(new Error('Nothing to save yet.'))
      return marksService.save({
        module_id: moduleId,
        // The term the rows on screen belong to, which is not always the term
        // in the selector — writing to `termId` here would fork a second sheet.
        academic_term_id: writeTermId,
        records,
      })
    },
    onSuccess: (res: any) => {
      toast.success(res?.message ?? `Saved ${res?.data?.saved ?? 0} record(s).`)
      // Force the next refetch to re-hydrate drafts from the server's
      // normalized values (e.g., "10" → "10.00") so the rows aren't reported
      // as dirty just because of decimal formatting, and so saved students
      // reappear with their marks instead of empty cells.
      hydratedKey.current = ''
      qc.invalidateQueries({ queryKey: ['marks', 'list', moduleId] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? e?.message ?? 'Save failed'),
  })

  const wf = useMutation({
    mutationFn: (action: 'open_claims' | 'submit' | 'confirm' | 'reset') =>
      marksService.workflow({ module_id: moduleId, academic_term_id: writeTermId, action }),
    onSuccess: (res: any) => {
      toast.success(res?.message ?? 'Workflow updated.')
      qc.invalidateQueries({ queryKey: ['marks', 'list', moduleId] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? e?.message ?? 'Workflow update failed'),
  })

  /* ───────────────────────────────────────────────────────────── */

  const fileRef = useRef<HTMLInputElement | null>(null)

  /* ── Export — XLSX for clean Excel round-trip ─────────────────── */
  const handleExport = () => {
    if (!roster || !moduleH) return
    const headers = [
      'Reg #', 'First Name', 'Surname', 'Sex', 'Program', 'Option',
      `CAT1 (/${maxes.cat1})`, `CAT2 (/${maxes.cat2})`, `CAT3 (/${maxes.cat3})`,
      `Partial (/${maxes.partial})`,
      `Exam 1st (/${maxes.final})`, `Exam 2nd (/${maxes.final})`,
      'Remarks',
      // Read-only trailing columns so an imported sheet doesn't export blank —
      // its marks live in these aggregates, not in the component boxes. The
      // import matcher keys off the component headers above and ignores these.
      'Recorded CAT total', 'Recorded exam', 'Recorded total', 'Recorded %', 'Grade',
    ]
    // Export exactly what is on screen. Dumping the full roster would put back
    // the eligibility-derived students the "With marks" view exists to remove,
    // and re-importing that file would then create empty rows for them.
    const aoa: any[][] = [headers]
    visibleRoster.forEach((r) => {
      const d = drafts[r.regnumber] ?? emptyDraft()
      const c = computed[r.regnumber]
      aoa.push([
        r.regnumber, r.fname, r.lname, r.sex ?? '', r.student_program ?? '', r.option_acro ?? '',
        d.cat1, d.cat2, d.cat3, d.partial, d.exam1, d.exam2, d.remarks,
        c?.catsTotal ?? '', c?.finalMark ?? '', c?.total ?? '', c?.pct ?? '', c?.grade ?? '',
      ])
    })
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    // Pin column widths and force text-type on the Reg # column so Excel
    // doesn't strip leading zeros or rewrite as number.
    ws['!cols'] = [
      { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 5 },
      { wch: 12 }, { wch: 8 },
      { wch: 9 }, { wch: 9 }, { wch: 9 }, { wch: 9 },
      { wch: 11 }, { wch: 13 }, { wch: 24 },
      { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 11 }, { wch: 8 },
    ]
    for (let R = 1; R <= visibleRoster.length; R++) {
      const ref = XLSX.utils.encode_cell({ c: 0, r: R })
      if (ws[ref]) { ws[ref].t = 's'; ws[ref].v = String(ws[ref].v ?? '') }
    }
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Marks')
    XLSX.writeFile(wb, `marks_${moduleH.module_code.replace(/\s+/g, '')}_term-${termId}.xlsx`)
  }

  /* ── Import — parse file, show preview modal, apply on approve ──── */
  const [preview, setPreview] = useState<ImportPreview | null>(null)

  const handleImportFile = async (file: File) => {
    if (!roster) return
    try {
      const buf = await file.arrayBuffer()
      // SheetJS reads CSV / TSV / XLSX / XLS automatically.
      const wb  = XLSX.read(buf, { type: 'array' })
      const ws  = wb.Sheets[wb.SheetNames[0]]
      if (!ws) { toast.error('No sheet found in the file.'); return }
      const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }) as any
      if (rows.length < 2) { toast.error('File is empty.'); return }

      // Strip BOM from the first header cell (some CSVs have it even via SheetJS).
      if (rows[0][0]) rows[0][0] = String(rows[0][0]).replace(/^\uFEFF/, '')

      const head = rows[0].map((h) => String(h ?? '').trim().toLowerCase())
      const idx = (...names: string[]) => {
        for (const n of names) {
          const i = head.findIndex((h) => h === n || h.startsWith(n) || h.includes(n))
          if (i !== -1) return i
        }
        return -1
      }
      const iReg     = idx('reg #', 'reg#', 'reg', 'regnumber', 'registration')
      const iCat1    = idx('cat1', 'cat 1')
      const iCat2    = idx('cat2', 'cat 2')
      const iCat3    = idx('cat3', 'cat 3')
      const iPartial = idx('partial')
      const iExam1   = idx('exam 1st', 'exam1', '1st sitting', '1st')
      const iExam2   = idx('exam 2nd', 'exam2', '2nd', 'special')
      const iRemarks = idx('remarks', 'remark', 'comment')

      if (iReg < 0) {
        toast.error('Could not find a "Reg #" column. Re-export the template and try again.', { duration: 7000 })
        return
      }

      const normReg = (s: string) =>
        s.replace(/^['’]+/, '')
         .replace(/\s+/g, '')
         .toUpperCase()
      const rosterByReg = new Map(
        roster.map((r) => [normReg(r.regnumber ?? ''), r])
      )

      const entries: ImportEntry[] = []
      const cell = (row: any[], i: number) => i >= 0 ? String(row[i] ?? '').trim() : ''
      let matched = 0
      let unmatched = 0
      let unchanged = 0

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i]
        if (row.every((c) => String(c ?? '').trim() === '')) continue
        const rawReg = cell(row, iReg)
        if (!rawReg) continue
        const key = normReg(rawReg)
        const target = rosterByReg.get(key)
        if (!target) {
          unmatched++
          entries.push({
            regnumber: rawReg, fname: '', lname: '', matched: false,
            current: emptyDraft(), incoming: emptyDraft(), changed: false,
          })
          continue
        }
        const cur: RowDraft = drafts[target.regnumber] ?? emptyDraft()
        const incoming: RowDraft = {
          cat1:    cell(row, iCat1)    || cur.cat1,
          cat2:    cell(row, iCat2)    || cur.cat2,
          cat3:    cell(row, iCat3)    || cur.cat3,
          partial: cell(row, iPartial) || cur.partial,
          exam1:   cell(row, iExam1)   || cur.exam1,
          exam2:   cell(row, iExam2)   || cur.exam2,
          remarks: cell(row, iRemarks) || cur.remarks,
        }
        const changed = !sameDraft(cur, incoming)
        if (changed) matched++; else unchanged++
        entries.push({
          regnumber: target.regnumber,
          fname: target.fname, lname: target.lname,
          matched: true, current: cur, incoming, changed,
        })
      }

      if (entries.length === 0) {
        toast.error('The file had no usable rows.')
        return
      }

      setPreview({ entries, summary: { matched, unmatched, unchanged } })
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not parse the file.')
    }
  }

  const applyImport = () => {
    if (!preview) return
    setDrafts((prev) => {
      const next = { ...prev }
      for (const e of preview.entries) {
        if (!e.matched || !e.changed) continue
        next[e.regnumber] = e.incoming
      }
      return next
    })
    const n = preview.summary.matched
    toast.success(`Applied ${n} row${n === 1 ? '' : 's'} of marks.`)
    setPreview(null)
  }

  const canWrite = useAnyPermission([PERMISSIONS.RECORD_MODULE_MARKS, PERMISSIONS.MANAGE_MODULE_MARKS])

  // Confirming locks the sheet and re-opening it is the only way back — both are
  // registry acts, deliberately NOT implied by being able to record marks. The
  // backend enforces the same split, so hiding these buttons is presentation
  // rather than the security boundary.
  const canConfirm = useAnyPermission([PERMISSIONS.CONFIRM_MODULE_MARKS])

  /* ── Roster filters — student search + when the mark was entered ────────
   * Filtering is client-side on purpose: a roster is one class (hundreds of
   * rows at most) and is already loaded, so this stays instant and costs no
   * extra request. Save/Export deliberately keep using the FULL roster — the
   * exported sheet is the official record, not the current view. */
  const [rosterSearch, setRosterSearch] = useState('')
  const [addedFrom,    setAddedFrom]    = useState('')
  const [addedTo,      setAddedTo]      = useState('')

  /* ── "With marks" vs "All students" ──────────────────────────────────
   * The roster is padded by an eligibility guess (module → programs →
   * options → students at that level) whenever formal registrations are
   * absent, which is nearly always. That guess uses each student's CURRENT
   * option and level, so it invents classmates who never sat the module —
   * module 1008 listed 2,330 students for 2,047 real mark-holders.
   *
   * So the sheet defaults to the students who actually hold a mark. The
   * exception is a sheet with no marks yet: filtering that to "with marks"
   * would show an empty table and make recording impossible, so a fresh
   * sheet opens on the full roster. */
  const [markedOnly, setMarkedOnly] = useState(false)
  const markedOnlyKey = useRef('')
  useEffect(() => {
    const key = `${moduleId}:${termId}`
    if (!roster || markedOnlyKey.current === key) return
    markedOnlyKey.current = key
    setMarkedOnly(roster.some((r) => !!r.mark_id))
  }, [moduleId, termId, roster])

  const visibleRoster = useMemo<MarksRosterRow[]>(() => {
    const all  = roster ?? []
    const q    = rosterSearch.trim().toLowerCase()
    // MySQL hands back "2026-08-12 10:19:27"; the space form is not reliably
    // parseable across browsers, so normalise to ISO before comparing.
    const from = addedFrom ? new Date(`${addedFrom}T00:00:00`).getTime()     : null
    const to   = addedTo   ? new Date(`${addedTo}T23:59:59.999`).getTime()   : null
    if (!q && from === null && to === null && !markedOnly) return all

    return all.filter((r: MarksRosterRow) => {
      // "With marks" — the sheet as a record of what was actually awarded,
      // without the eligibility-derived students padding it out.
      if (markedOnly && !r.mark_id) return false
      if (q) {
        const hay = `${r.fname ?? ''} ${r.lname ?? ''} ${r.regnumber ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (from !== null || to !== null) {
        // A student with no mark yet has no entry date, so it cannot fall
        // inside a window — that is the point of the filter.
        if (!r.created_at) return false
        const t = new Date(String(r.created_at).replace(' ', 'T')).getTime()
        if (Number.isNaN(t)) return false
        if (from !== null && t < from) return false
        if (to   !== null && t > to)   return false
      }
      return true
    })
  }, [roster, rosterSearch, addedFrom, addedTo, markedOnly])

  // Keep the printed row number tied to the student's position on the real
  // mark sheet, so filtering never renumbers the class.
  const rosterIndex = useMemo(() => {
    const m = new Map<string, number>()
    ;(roster ?? []).forEach((r: MarksRosterRow, i: number) => m.set(r.regnumber, i))
    return m
  }, [roster])

  const markedCount   = useMemo(() => (roster ?? []).filter((r) => !!r.mark_id).length, [roster])
  const filtersActive = !!rosterSearch.trim() || !!addedFrom || !!addedTo
  const clearFilters  = () => { setRosterSearch(''); setAddedFrom(''); setAddedTo('') }

  // Publish a save handle so a host header can own the Save button.
  //
  // Keyed on primitives only — publishing a new object every render fed a fresh
  // reference into the host's setState, re-rendering and re-running the effect
  // in an infinite loop. The callback lives in a ref to keep a stable identity.
  const marksSaveRef = useRef<() => Promise<unknown>>(() => Promise.resolve())
  marksSaveRef.current = () => save.mutateAsync()
  const marksCanSave = canWrite && !isLocked && dirtyCount > 0 && !save.isPending
  useEffect(() => {
    if (!onBridge) return
    onBridge({
      save:    () => marksSaveRef.current(),
      saving:  save.isPending,
      canSave: marksCanSave,
    })
    return () => onBridge(null)
  }, [onBridge, save.isPending, marksCanSave])

  const canExport = !!roster && roster.length > 0
  const canImport = canExport && !isLocked && canWrite

  return (
    <div className="space-y-4 animate-fade-in">
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.tsv,.txt,.xlsx,.xls,text/csv,text/tab-separated-values,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleImportFile(f)
          e.target.value = ''
        }}
      />

      <ImportPreviewModal
        preview={preview}
        onCancel={() => setPreview(null)}
        onApprove={applyImport}
      />

      <div className={`items-start justify-between gap-3 flex-wrap ${embedded ? 'hidden' : 'flex'}`}>
        <div className="flex items-start gap-2 min-w-0">
          <button
            type="button"
            onClick={onBackToSchedules}
            className="mt-0.5 p-1.5 hover:bg-ink-100 dark:hover:bg-ink-800 rounded-lg text-ink-500 hover:text-brand transition-colors shrink-0"
            title="Back to schedule list"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-lg font-bold text-ink-900 dark:text-white">Module Marks</h2>
            <p className="text-[13px] text-ink-500">
              Pick a term and a module — the official CUR mark sheet auto-fills with the module
              header and full registered roster.
            </p>
          </div>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <select
            className="input input-sm w-44"
            // Shows the term the sheet is really on, which is not always the
            // one requested — see the redirect note above.
            value={servedTermId || termId || ''}
            onChange={(e) => setTermId(Number(e.target.value))}
          >
            <option value="" disabled>Select term…</option>
            {terms.map((t: any) => (
              <option key={t.id} value={t.id}>
                {t.label}{t.is_current ? ' (current)' : ''}
              </option>
            ))}
          </select>
          <ModuleCombobox
            modules={modules}
            value={moduleId}
            onChange={setModuleId}
            disabled={!termId || modulesQ.isLoading}
            loading={modulesQ.isLoading}
          />
        </div>
      </div>

      {/* Sticky action toolbar — Save / Export / Import always visible */}
      {!!termId && !!moduleId && !embedded && (
        <div className={`${embedded ? 'rounded-lg border px-3' : 'sticky top-0 z-20 -mx-5 sm:-mx-6 lg:-mx-8 px-5 sm:px-6 lg:px-8 border-b'} py-2 bg-[rgb(var(--bg-app))]/95 backdrop-blur border-ink-100 dark:border-ink-700 flex items-center justify-between gap-3 flex-wrap`}>
          <div className="text-[12.5px] text-ink-500 inline-flex items-center gap-2">
            {dirtyCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                {dirtyCount} row{dirtyCount === 1 ? '' : 's'} unsaved
              </span>
            ) : (
              <span className="text-ink-400">All changes saved.</span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              className="btn-ghost btn-sm"
              disabled={!canExport}
              onClick={handleExport}
              title="Download the roster as an Excel template"
            >
              <Download className="w-3.5 h-3.5" /> Export
            </button>
            {canWrite && (
              <button
                className="btn-ghost btn-sm"
                disabled={!canImport}
                onClick={() => fileRef.current?.click()}
                title="Upload a completed sheet (xlsx, xls, csv, tsv)"
              >
                <Upload className="w-3.5 h-3.5" /> Import
              </button>
            )}
            {canWrite && (
              <button
                className="btn-primary btn-sm"
                disabled={save.isPending || isLocked || !roster || roster.length === 0 || dirtyCount === 0}
                onClick={() => save.mutate()}
              >
                {save.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {save.isPending ? 'Saving…' : dirtyCount > 0 ? `Save ${dirtyCount} change${dirtyCount === 1 ? '' : 's'}` : 'Save marks'}
              </button>
            )}
          </div>
        </div>
      )}

      {!termId || !moduleId ? (
        <div className="card p-8 text-center text-ink-400">Pick a term and module to begin recording marks.</div>
      ) : listQ.isLoading || !roster || !moduleH ? (
        <div className="card p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" /></div>
      ) : (
        <>
          {/* One consolidated header: identity → progress → workflow → maxes.
              Rendered in every mode; `compact` drops the identity/workflow rows
              for the teacher portal, which already shows the course above. */}
          <ModuleHeaderCard
            compact={embedded}
            moduleH={moduleH}
            summary={summary}
            status={status}
            disabled={isLocked}
            canWrite={canWrite}
            canConfirm={canConfirm}
            workflow={workflow}
            onWorkflow={(a) => wf.mutate(a)}
            wfPending={wf.isPending}
            maxes={maxes}
            setMaxes={setMaxes}
          />

          {/* Say plainly when the sheet is not on the term that was asked for,
              and when the rows on it predate the CUR component template — both
              are otherwise silent surprises about whose marks these are. */}
          {(redirectedTerm || otherMarkTerms.length > 0 || legacyCount > 0) && (
            <div className="card p-3 flex items-start gap-2 text-[12.5px] text-ink-600 dark:text-ink-300">
              <AlertCircle className="w-4 h-4 mt-px shrink-0 text-sky-500" />
              <div className="space-y-0.5">
                {redirectedTerm && (
                  <p>
                    No marks are recorded for this module in the term you picked, so the sheet is
                    showing <span className="font-semibold">{redirectedTerm.label}</span>, where its
                    marks actually live.
                  </p>
                )}
                {otherMarkTerms.length > 0 && (
                  <p>
                    This module also holds marks in{' '}
                    {otherMarkTerms.map((t, n) => (
                      <span key={t.id}>
                        {n > 0 ? ', ' : ''}
                        <button
                          type="button"
                          className="font-semibold text-brand hover:underline"
                          onClick={() => setTermId(t.id)}
                        >
                          {t.label}
                        </button>{' '}
                        ({t.mark_count})
                      </span>
                    ))}
                    . Switch term to see them.
                  </p>
                )}
                {legacyCount > 0 && (
                  <p>
                    {legacyCount} of {roster.length} row{roster.length === 1 ? '' : 's'} are imported
                    marks: only a CAT total and a final exam mark were recorded, so the
                    CAT1–Partial breakdown is blank for them.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Manual student picker — adds students to the marks sheet on the fly */}
          <StudentPicker
            disabled={isLocked}
            existingRegs={new Set(roster.map((r) => r.regnumber))}
            onPick={(s) => {
              setExtras((prev) => ({ ...prev, [s.regnumber]: s }))
              setDrafts((prev) => prev[s.regnumber] ? prev : ({
                ...prev,
                [s.regnumber]: { cat1: '', cat2: '', cat3: '', partial: '', exam1: '', exam2: '', remarks: '' },
              }))
            }}
            onRemove={(reg) => {
              setExtras((prev) => {
                const next = { ...prev }
                delete next[reg]
                return next
              })
            }}
            extrasCount={Object.keys(extras).length}
          />

          {/* Roster filters — find a student fast, or isolate marks entered in
              a given window (e.g. "what was added after the claims deadline"). */}
          {roster.length > 0 && (
            <div className="card p-3 flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[220px]">
                <label className="block text-[11px] font-semibold uppercase text-ink-400 mb-1">
                  Find student
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
                  <input
                    className="input input-sm w-full pl-8"
                    placeholder="Name or registration number…"
                    value={rosterSearch}
                    onChange={(e) => setRosterSearch(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase text-ink-400 mb-1">
                  Marks added from
                </label>
                <input
                  type="date"
                  className="input input-sm"
                  value={addedFrom}
                  max={addedTo || undefined}
                  onChange={(e) => setAddedFrom(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase text-ink-400 mb-1">
                  to
                </label>
                <input
                  type="date"
                  className="input input-sm"
                  value={addedTo}
                  min={addedFrom || undefined}
                  onChange={(e) => setAddedTo(e.target.value)}
                />
              </div>
              {/* Who is on the sheet: the real mark-holders, or the padded
                  eligible class. Segmented so the current choice is obvious —
                  a hidden filter that silently drops students would be worse
                  than the padding it removes. */}
              <div className="inline-flex rounded-lg border border-ink-200 dark:border-ink-700 overflow-hidden shrink-0">
                <button
                  type="button"
                  onClick={() => setMarkedOnly(true)}
                  className={`px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                    markedOnly
                      ? 'bg-brand text-white'
                      : 'bg-transparent text-ink-500 hover:bg-ink-50 dark:hover:bg-ink-800'
                  }`}
                >
                  With marks ({markedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setMarkedOnly(false)}
                  className={`px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                    !markedOnly
                      ? 'bg-brand text-white'
                      : 'bg-transparent text-ink-500 hover:bg-ink-50 dark:hover:bg-ink-800'
                  }`}
                >
                  All students ({roster.length})
                </button>
              </div>
              {filtersActive && (
                <button className="btn-ghost btn-sm" onClick={clearFilters} title="Clear filters">
                  <X className="w-3.5 h-3.5" /> Clear
                </button>
              )}
              <div className="text-[12px] text-ink-500 ml-auto">
                Showing <span className="font-semibold text-ink-700 dark:text-ink-200">{visibleRoster.length}</span>
                {' '}of {markedOnly ? markedCount : roster.length} student{(markedOnly ? markedCount : roster.length) === 1 ? '' : 's'}
              </div>
            </div>
          )}

          {roster.length === 0 ? (
            <div className="card p-8 text-center text-ink-400">
              No registered or eligible students were auto-detected for this module. Use
              <span className="font-medium"> Pick students </span>
              above to add a roster manually, or register students under
              <span className="font-mono"> Modules → Registrations</span>.
            </div>
          ) : visibleRoster.length === 0 ? (
            <div className="card p-8 text-center text-ink-400">
              {markedOnly && markedCount === 0 && !filtersActive ? (
                <>
                  No marks have been recorded for this module yet.
                  <button className="btn-ghost btn-sm ml-2" onClick={() => setMarkedOnly(false)}>
                    Show all students to start recording
                  </button>
                </>
              ) : (
                <>
                  No student matches these filters.
                  <button className="btn-ghost btn-sm ml-2" onClick={clearFilters}>Clear filters</button>
                </>
              )}
            </div>
          ) : (
            /* Roster table — CUR template */
            <div className="card overflow-auto max-h-[640px]">
              {/* min-width covers the fixed component columns plus the wide
                  Remarks column below, so Remarks keeps its room instead of
                  being squeezed to a few unreadable characters. */}
              <table className="w-full text-left text-[12.5px] min-w-[1850px]">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-sky-50 dark:bg-ink-800/50 border-b border-ink-100 dark:border-ink-700">
                    <th rowSpan={2} className="px-2 py-2.5 font-bold text-ink-500 text-[10px] uppercase border-r border-ink-100 dark:border-ink-700">No</th>
                    <th rowSpan={2} className="px-2 py-2.5 font-bold text-ink-500 text-[10px] uppercase border-r border-ink-100 dark:border-ink-700">First Name</th>
                    <th rowSpan={2} className="px-2 py-2.5 font-bold text-ink-500 text-[10px] uppercase border-r border-ink-100 dark:border-ink-700">Surname</th>
                    <th rowSpan={2} className="px-2 py-2.5 font-bold text-ink-500 text-[10px] uppercase border-r border-ink-100 dark:border-ink-700">Sex</th>
                    <th rowSpan={2} className="px-2 py-2.5 font-bold text-ink-500 text-[10px] uppercase border-r border-ink-100 dark:border-ink-700">Reg #</th>
                    <th rowSpan={2} className="px-2 py-2.5 font-bold text-ink-500 text-[10px] uppercase border-r border-ink-100 dark:border-ink-700">Program</th>
                    <th rowSpan={2} className="px-2 py-2.5 font-bold text-ink-500 text-[10px] uppercase border-r border-ink-100 dark:border-ink-700">Option</th>
                    <th rowSpan={2} className="px-2 py-2.5 font-bold text-ink-500 text-[10px] uppercase text-center border-r border-ink-100 dark:border-ink-700">CAT1<br/><span className="font-normal text-ink-400">/{maxes.cat1}</span></th>
                    <th rowSpan={2} className="px-2 py-2.5 font-bold text-ink-500 text-[10px] uppercase text-center border-r border-ink-100 dark:border-ink-700">CAT2<br/><span className="font-normal text-ink-400">/{maxes.cat2}</span></th>
                    <th rowSpan={2} className="px-2 py-2.5 font-bold text-ink-500 text-[10px] uppercase text-center border-r border-ink-100 dark:border-ink-700">CAT3<br/><span className="font-normal text-ink-400">/{maxes.cat3}</span></th>
                    <th rowSpan={2} className="px-2 py-2.5 font-bold text-ink-500 text-[10px] uppercase text-center border-r border-ink-100 dark:border-ink-700">Partial<br/><span className="font-normal text-ink-400">/{maxes.partial}</span></th>
                    <th rowSpan={2} className="px-2 py-2.5 font-bold text-ink-500 text-[10px] uppercase text-center border-r border-ink-100 dark:border-ink-700 bg-amber-50 dark:bg-amber-500/10">Tot. CATs<br/><span className="font-normal text-ink-400">/{maxes.cats}</span></th>
                    <th colSpan={2} className="px-2 py-1.5 font-bold text-ink-500 text-[10px] uppercase text-center border-r border-ink-100 dark:border-ink-700">Final Exam /{maxes.final}</th>
                    <th rowSpan={2} className="px-2 py-2.5 font-bold text-ink-500 text-[10px] uppercase text-center border-r border-ink-100 dark:border-ink-700 bg-amber-50 dark:bg-amber-500/10">Final Mark</th>
                    <th rowSpan={2} className="px-2 py-2.5 font-bold text-ink-500 text-[10px] uppercase text-center border-r border-ink-100 dark:border-ink-700 bg-amber-50 dark:bg-amber-500/10">Tot %</th>
                    <th rowSpan={2} className="px-2 py-2.5 font-bold text-ink-500 text-[10px] uppercase text-center border-r border-ink-100 dark:border-ink-700 bg-amber-50 dark:bg-amber-500/10">Grade</th>
                    <th rowSpan={2} className="px-2 py-2.5 font-bold text-ink-500 text-[10px] uppercase text-center border-r border-ink-100 dark:border-ink-700 bg-amber-50 dark:bg-amber-500/10">Decision</th>
                    <th rowSpan={2} className="px-2 py-2.5 font-bold text-ink-500 text-[10px] uppercase w-[300px] min-w-[300px]">Remarks</th>
                  </tr>
                  <tr className="bg-sky-50 dark:bg-ink-800/50 border-b border-ink-100 dark:border-ink-700">
                    <th className="px-2 py-1.5 font-semibold text-ink-500 text-[10px] uppercase text-center border-r border-ink-100 dark:border-ink-700">1st sitting</th>
                    <th className="px-2 py-1.5 font-semibold text-ink-500 text-[10px] uppercase text-center border-r border-ink-100 dark:border-ink-700">2nd / Special</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                  {visibleRoster.map((r: MarksRosterRow) => {
                    // Position on the full sheet, not within the filtered view.
                    const i = rosterIndex.get(r.regnumber) ?? 0
                    const d = drafts[r.regnumber] ?? { cat1: '', cat2: '', cat3: '', partial: '', exam1: '', exam2: '', remarks: '' }
                    const c = computed[r.regnumber]
                    const isExempted = !!r.is_exempted
                    const rowDisabled = isLocked || isExempted
                    // Values shown come from the legacy CAT/exam columns, not
                    // from the CUR component boxes (which are empty for them).
                    // Only collapse the component cells to static text while the
                    // row is read-only — on a re-opened sheet the inputs must
                    // stay live so the breakdown can be keyed in properly.
                    const isLegacy = !!c?.legacy && !isExempted && rowDisabled
                    return (
                      <tr key={r.regnumber} className={`hover:bg-ink-50/50 dark:hover:bg-ink-700/20 ${
                        isExempted ? 'bg-violet-50/40 dark:bg-violet-500/10' :
                        dirty[r.regnumber] ? 'bg-amber-50/40 dark:bg-amber-500/5' : ''
                      }`}>
                        <td className="px-2 py-2 text-ink-500 border-r border-ink-100 dark:border-ink-700">
                          <span className="inline-flex items-center gap-1">
                            {dirty[r.regnumber] && !isExempted && (
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Unsaved changes" />
                            )}
                            {i + 1}
                          </span>
                        </td>
                        <td className="px-2 py-2 border-r border-ink-100 dark:border-ink-700">
                          {r.fname}
                          {isExempted ? (
                            <span
                              className="ml-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"
                              title={r.exemption_reason ?? 'Exempted from this module'}
                            >
                              EXEMPTED
                            </span>
                          ) : r.reg_status === 'completed' ? (
                            <span
                              className="ml-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                              title="Marks saved — student passed this module"
                            >
                              COMPLETED
                            </span>
                          ) : r.reg_status === 'failed' ? (
                            <span
                              className="ml-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
                              title="Marks saved — student failed this module"
                            >
                              FAILED
                            </span>
                          ) : null}
                        </td>
                        <td className="px-2 py-2 border-r border-ink-100 dark:border-ink-700">{r.lname}</td>
                        <td className="px-2 py-2 text-center border-r border-ink-100 dark:border-ink-700">{r.sex ?? '—'}</td>
                        <td className="px-2 py-2 font-mono border-r border-ink-100 dark:border-ink-700">{r.regnumber}</td>
                        <td className="px-2 py-2 border-r border-ink-100 dark:border-ink-700">{r.student_program ?? '—'}</td>
                        <td className="px-2 py-2 border-r border-ink-100 dark:border-ink-700">{r.option_acro ?? '—'}</td>
                        {/* A legacy row has no CAT1–Partial breakdown to show —
                            only the aggregate that was recorded — so the four
                            component cells say so instead of offering four
                            empty boxes that imply the marks are missing. */}
                        {isLegacy ? (
                          <td
                            colSpan={4}
                            className="px-2 py-2 text-center text-[11px] italic text-ink-400 border-r border-ink-100 dark:border-ink-700"
                            title="Imported mark — recorded as a single CAT total, with no CAT1/CAT2/CAT3/Partial split"
                          >
                            no breakdown recorded
                          </td>
                        ) : (
                          <>
                            <td className="px-1 py-1 text-center border-r border-ink-100 dark:border-ink-700">
                              <NumCell cellId={`${i}:0`} value={d.cat1} max={maxes.cat1} disabled={rowDisabled} onChange={(v) => setCell(r.regnumber, 'cat1', v)} />
                            </td>
                            <td className="px-1 py-1 text-center border-r border-ink-100 dark:border-ink-700">
                              <NumCell cellId={`${i}:1`} value={d.cat2} max={maxes.cat2} disabled={rowDisabled} onChange={(v) => setCell(r.regnumber, 'cat2', v)} />
                            </td>
                            <td className="px-1 py-1 text-center border-r border-ink-100 dark:border-ink-700">
                              <NumCell cellId={`${i}:2`} value={d.cat3} max={maxes.cat3} disabled={rowDisabled} onChange={(v) => setCell(r.regnumber, 'cat3', v)} />
                            </td>
                            <td className="px-1 py-1 text-center border-r border-ink-100 dark:border-ink-700">
                              <NumCell cellId={`${i}:3`} value={d.partial} max={maxes.partial} disabled={rowDisabled} onChange={(v) => setCell(r.regnumber, 'partial', v)} />
                            </td>
                          </>
                        )}
                        <td className="px-2 py-2 text-center font-semibold bg-amber-50/50 dark:bg-amber-500/5 border-r border-ink-100 dark:border-ink-700">
                          {isExempted ? '—' : (c?.catsTotal ?? '—')}
                        </td>
                        <td className="px-1 py-1 text-center border-r border-ink-100 dark:border-ink-700">
                          {isLegacy ? (
                            <span className="font-medium text-ink-800 dark:text-ink-100">{c?.finalMark ?? '—'}</span>
                          ) : (
                            <NumCell cellId={`${i}:4`} value={d.exam1} max={maxes.final} disabled={rowDisabled} onChange={(v) => setCell(r.regnumber, 'exam1', v)} />
                          )}
                        </td>
                        <td className="px-1 py-1 text-center border-r border-ink-100 dark:border-ink-700">
                          {isLegacy ? (
                            <span className="text-ink-400">—</span>
                          ) : (
                            <NumCell cellId={`${i}:5`} value={d.exam2} max={maxes.final} disabled={rowDisabled} onChange={(v) => setCell(r.regnumber, 'exam2', v)} />
                          )}
                        </td>
                        <td className="px-2 py-2 text-center font-semibold bg-amber-50/50 dark:bg-amber-500/5 border-r border-ink-100 dark:border-ink-700">
                          {isExempted ? '—' : (c?.finalMark ?? '—')}
                        </td>
                        <td className="px-2 py-2 text-center font-semibold bg-amber-50/50 dark:bg-amber-500/5 border-r border-ink-100 dark:border-ink-700">
                          {isExempted
                            ? (r.percentage != null ? `${Math.round(Number(r.percentage))}%` : '—')
                            : (c?.pct != null ? `${c.pct}%` : '—')}
                        </td>
                        {/* Letter grade from the registry's configured scale —
                            the same bands the transcript and GPA are read off. */}
                        <td
                          className="px-2 py-2 text-center font-bold bg-amber-50/50 dark:bg-amber-500/5 border-r border-ink-100 dark:border-ink-700"
                          title={scale.labelFor(isExempted ? num(r.percentage) : c?.pct ?? null) ?? undefined}
                        >
                          {isExempted
                            ? (scale.gradeFor(num(r.percentage)) ?? '—')
                            : (c?.grade ?? <span className="font-normal text-ink-400">—</span>)}
                        </td>
                        <td className="px-2 py-2 text-center bg-amber-50/50 dark:bg-amber-500/5 border-r border-ink-100 dark:border-ink-700">
                          {isExempted
                            ? <DecisionPill decision={r.decision ?? (Number(r.percentage) >= 50 ? 'P' : 'F&R')} />
                            : (c?.decision ? <DecisionPill decision={c.decision} /> : <span className="text-ink-400">—</span>)}
                        </td>
                        <td className="px-2 py-1 w-[300px] min-w-[300px] align-top">
                          {isExempted ? (
                            <span className="text-[11.5px] italic text-violet-700 dark:text-violet-300 whitespace-normal break-words">
                              Exempted{r.exemption_reason ? ` — ${r.exemption_reason}` : ''}
                            </span>
                          ) : isLocked ? (
                            /* A locked sheet cannot be edited, and a disabled
                               input just clips the text at the box edge. Render
                               the remark as wrapping copy so a long one is
                               actually readable. */
                            <span className="block py-1 text-[11.5px] leading-snug whitespace-pre-wrap break-words text-ink-700 dark:text-ink-200">
                              {d.remarks || <span className="text-ink-400">—</span>}
                            </span>
                          ) : (
                            <input
                              type="text"
                              className="input input-sm w-full"
                              placeholder="—"
                              value={d.remarks}
                              title={d.remarks || undefined}
                              onChange={(e) => setCell(r.regnumber, 'remarks', e.target.value)}
                            />
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Lecturer footer */}
          <div className="card p-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-[13px]">
            <div>
              <span className="text-ink-500 font-semibold">Lecturer's Names: </span>
              <span className="text-ink-800 dark:text-white">{moduleH.lecturer_name ?? '—'}</span>
            </div>
            <div>
              <span className="text-ink-500 font-semibold">Lecturer's Email: </span>
              <span className="text-ink-800 dark:text-white">{moduleH.lecturer_email ?? '—'}</span>
            </div>
          </div>

        </>
      )}
    </div>
  )
}

/* ─── small UI bits ──────────────────────────────────────────────────── */

/** Treat 0 / "" / "0" as "no value" — several module columns store 0 for
 *  "unset", which `??` happily rendered as a literal "0" in the header. */
function meaningful(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' || s === '0' ? null : s
}

/**
 * One header for the whole mark sheet: identity → progress → workflow → maxes.
 *
 * This used to be four stacked cards (module card, KPI strip, maxes row, then
 * the picker), which pushed the actual roster below the fold on a laptop. The
 * facts a marker needs at a glance — which module, how far along, what state,
 * what the components are out of — now live in one block.
 */
function ModuleHeaderCard({
  compact, moduleH, summary, status, disabled, canWrite, canConfirm, workflow,
  onWorkflow, wfPending, maxes, setMaxes,
}: {
  compact:  boolean
  moduleH:  MarksModuleHeader
  summary?: { total_roster: number; recorded: number; unmarked: number; avg_pct: number }
  status:   MarksWorkflowStatus
  disabled: boolean
  canWrite: boolean
  canConfirm: boolean
  workflow?: MarksWorkflow
  onWorkflow: (a: 'open_claims' | 'submit' | 'confirm' | 'reset') => void
  wfPending: boolean
  maxes:    { cat1: number; cat2: number; cat3: number; partial: number; cats: number; final: number }
  setMaxes: (m: { cat1: number; cat2: number; cat3: number; partial: number; cats: number; final: number }) => void
}) {
  // Maxes are configuration set once a term, not per-session data — collapsed
  // by default so they stop eating a full row above the roster.
  const [maxesOpen, setMaxesOpen] = useState(false)
  const scale = useGradingScale()

  const statusLabel: Record<MarksWorkflowStatus, string> = {
    draft:        'Draft',
    claims_open:  'Claims open',
    submitted:    'Submitted to faculty',
    confirmed:    'Confirmed & sent to options',
  }
  const statusTone: Record<MarksWorkflowStatus, string> = {
    draft:        'bg-ink-100 text-ink-700 dark:bg-ink-700/60 dark:text-ink-200',
    claims_open:  'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    submitted:    'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
    confirmed:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  }

  const total    = summary?.total_roster ?? 0
  const recorded = summary?.recorded ?? 0
  const unmarked = summary?.unmarked ?? 0
  const pctDone  = total > 0 ? Math.round((recorded / total) * 100) : 0

  // Subtitle facts, built from whatever the module actually carries. Anything
  // unset simply drops out rather than rendering a placeholder.
  const facts = [
    meaningful(moduleH.dep_name) &&
      `${moduleH.dep_name}${meaningful(moduleH.dep_acronym) ? ` (${moduleH.dep_acronym})` : ''}`,
    meaningful(moduleH.fac_name) &&
      `${moduleH.fac_name}${meaningful(moduleH.fac_code) ? ` (${moduleH.fac_code})` : ''}`,
    meaningful(moduleH.level) && `Level ${moduleH.level}`,
    meaningful(moduleH.program),
    meaningful(moduleH.option_acronym),
  ].filter(Boolean) as string[]

  return (
    <div className="card divide-y divide-ink-100 dark:divide-ink-700">
      {/* ── Identity ───────────────────────────────────────────────────── */}
      {!compact && (
        <div className="p-4 flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="font-mono text-[13px] font-bold text-brand">{moduleH.module_code}</span>
              <h2 className="text-[17px] font-bold text-ink-900 dark:text-white truncate">
                {moduleH.module_name}
              </h2>
            </div>
            {facts.length > 0 && (
              <div className="text-[12.5px] text-ink-500 mt-0.5">{facts.join(' · ')}</div>
            )}
          </div>
          <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0 ${statusTone[status]}`}>
            {statusLabel[status]}
          </span>
        </div>
      )}

      {/* ── Progress: the four numbers plus how far the sheet has got ──── */}
      <div className="p-4 flex items-center gap-5 flex-wrap">
        <div className="flex items-center gap-5 flex-wrap">
          <HeaderStat label="Roster"   value={total} />
          <HeaderStat label="Recorded" value={recorded} tone={recorded > 0 ? 'good' : undefined} />
          <HeaderStat label="Unmarked" value={unmarked} tone={unmarked > 0 ? 'warn' : undefined} />
          <HeaderStat label="Class avg" value={`${summary?.avg_pct ?? 0}%`} />
        </div>
        <div className="flex-1 min-w-[160px]">
          <div className="flex justify-between text-[11px] text-ink-500 mb-1">
            <span>Marking progress</span>
            <span className="font-semibold">{pctDone}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-ink-100 dark:bg-ink-700 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${pctDone === 100 ? 'bg-emerald-500' : 'bg-brand'}`}
              style={{ width: `${pctDone}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── Mark maxes, collapsed ──────────────────────────────────────── */}
      <div className="px-4 py-2.5">
        <button
          type="button"
          onClick={() => setMaxesOpen((o) => !o)}
          className="w-full flex items-center gap-2 text-[12.5px] text-ink-600 dark:text-ink-300 hover:text-brand transition-colors"
        >
          <ChevronLeft className={`w-3.5 h-3.5 transition-transform ${maxesOpen ? '-rotate-90' : 'rotate-180'}`} />
          <span className="font-semibold">Mark maxes</span>
          <span className="text-ink-400">
            CAT1 {maxes.cat1} · CAT2 {maxes.cat2} · CAT3 {maxes.cat3} · Partial {maxes.partial} · CATs {maxes.cats} · Final {maxes.final}
          </span>
          <span className="ml-auto text-ink-500">
            Total <span className="font-semibold text-ink-800 dark:text-white">{maxes.cats + maxes.final}</span>
          </span>
        </button>
        {maxesOpen && (
          <div className="flex flex-wrap items-center gap-3 text-[13px] pt-3">
            <MaxField label="CAT1"    value={maxes.cat1}    onChange={(v) => setMaxes({ ...maxes, cat1: v })} disabled={disabled} />
            <MaxField label="CAT2"    value={maxes.cat2}    onChange={(v) => setMaxes({ ...maxes, cat2: v })} disabled={disabled} />
            <MaxField label="CAT3"    value={maxes.cat3}    onChange={(v) => setMaxes({ ...maxes, cat3: v })} disabled={disabled} />
            <MaxField label="Partial" value={maxes.partial} onChange={(v) => setMaxes({ ...maxes, partial: v })} disabled={disabled} />
            <MaxField label="CATs"    value={maxes.cats}    onChange={(v) => setMaxes({ ...maxes, cats: v })} disabled={disabled} />
            <MaxField label="Final"   value={maxes.final}   onChange={(v) => setMaxes({ ...maxes, final: v })} disabled={disabled} />
          </div>
        )}

        {/* The bands the Grade column is read off — configured by the registry
            at /academic/grading-scale, not hardcoded here. */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 text-[11px] text-ink-500">
          <span className="font-semibold uppercase tracking-wide">Grading scale</span>
          {scale.bands.map((b) => (
            <span
              key={b.id}
              className="rounded border border-ink-200 px-1.5 py-0.5 dark:border-ink-700"
              title={b.description ?? undefined}
            >
              <span className="font-bold text-ink-700 dark:text-ink-200">{b.grade}</span>{' '}
              {Number(b.min_marks)}–{Number(b.max_marks)}
            </span>
          ))}
        </div>
      </div>

      {/* ── Workflow ───────────────────────────────────────────────────── */}
      {!compact && (
      <div className="p-3 flex flex-wrap items-center gap-2">
        {canWrite && (
          <>
            <button
              className="btn-ghost btn-sm"
              disabled={wfPending || status === 'claims_open' || status === 'submitted' || status === 'confirmed'}
              onClick={() => onWorkflow('open_claims')}
              title="Open the 15-day claims window for students to query their marks"
            >
              <FileCheck className="w-3.5 h-3.5" /> Open claims
            </button>
            <button
              className="btn-ghost btn-sm"
              disabled={wfPending || status === 'submitted' || status === 'confirmed'}
              onClick={() => onWorkflow('submit')}
              title="Submit to faculty & close claims"
            >
              <SendHorizontal className="w-3.5 h-3.5" /> Submit & close claims
            </button>
          </>
        )}

        {/* Confirming and re-opening are registry-only. Rendered separately from
            the recorder actions above so a lecturer never sees a button that
            would 403 — the backend rejects these regardless of what shows. */}
        {canConfirm && (
          <>
            <button
              className="btn-ghost btn-sm"
              disabled={wfPending || status !== 'submitted'}
              onClick={() => onWorkflow('confirm')}
              title="Confirm and send to options — this locks the sheet"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Confirm & send to options
            </button>
            <button
              className="btn-ghost btn-sm ml-auto"
              disabled={wfPending || status === 'draft'}
              onClick={() => onWorkflow('reset')}
              title="Re-open editing for this module"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Re-open for editing
            </button>
          </>
        )}

        {disabled && (
          <span className="inline-flex items-center gap-1 text-[12px] text-ink-500">
            <Lock className="w-3 h-3" /> Read-only
          </span>
        )}
      </div>
      )}

      {/* A locked sheet is a dead end unless you know who to ask. */}
      {!compact && (status === 'confirmed' || status === 'submitted') && (
        <div className="px-4 py-2.5 text-[12px] text-ink-500 flex flex-wrap gap-x-4 gap-y-1">
          {status === 'confirmed' && workflow?.confirmed_at && (
            <span>
              <span className="font-semibold text-ink-600 dark:text-ink-300">Confirmed</span>{' '}
              {workflow.confirmed_by_name ? `by ${workflow.confirmed_by_name} ` : ''}
              on {String(workflow.confirmed_at).slice(0, 16).replace('T', ' ')}
            </span>
          )}
          {workflow?.submitted_at && (
            <span>
              <span className="font-semibold text-ink-600 dark:text-ink-300">Submitted</span>{' '}
              {workflow.submitted_by_name ? `by ${workflow.submitted_by_name} ` : ''}
              on {String(workflow.submitted_at).slice(0, 16).replace('T', ' ')}
            </span>
          )}
          {!canConfirm && (
            <span className="text-ink-400">Ask the registry to re-open this sheet before editing.</span>
          )}
        </div>
      )}
    </div>
  )
}

/** Compact inline figure for the header progress row. */
function HeaderStat({ label, value, tone }: {
  label: string; value: React.ReactNode; tone?: 'warn' | 'good'
}) {
  const toneCls =
    tone === 'warn' ? 'text-amber-600 dark:text-amber-400'
    : tone === 'good' ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-ink-900 dark:text-white'
  return (
    <div>
      <div className={`text-[19px] font-bold leading-none ${toneCls}`}>{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-ink-400 mt-1">{label}</div>
    </div>
  )
}

// `Field` and `Stat` retired with the old stacked header — the identity facts
// are now a single subtitle line and the KPIs are inline in HeaderStat.

function MaxField({
  label, value, onChange, disabled,
}: { label: string; value: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <label className="inline-flex items-center gap-1">
      <span className="text-ink-600">{label}</span>
      <input
        type="number"
        min={1}
        step="1"
        className="input input-sm w-16"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const n = Number(e.target.value)
          onChange(Number.isFinite(n) && n > 0 ? n : 0)
        }}
      />
    </label>
  )
}

function NumCell({
  value, max, onChange, disabled, cellId,
}: { value: string; max: number; onChange: (v: string) => void; disabled?: boolean; cellId?: string }) {
  const clamp = (raw: string): string => {
    if (raw === '') return ''
    const n = Number(raw)
    if (!Number.isFinite(n)) return ''
    if (n < 0)   return '0'
    if (n > max) return String(max)
    return raw
  }

  // Excel-like nav: Enter / ↓ → next row; ↑ → prev row; ← / → → adjacent col.
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!cellId) return
    const [rStr, cStr] = cellId.split(':')
    const r = Number(rStr), c = Number(cStr)
    let dr = 0, dc = 0
    if (e.key === 'Enter' || e.key === 'ArrowDown') dr = 1
    else if (e.key === 'ArrowUp') dr = -1
    else if (e.key === 'ArrowRight' && (e.target as HTMLInputElement).selectionStart === (e.target as HTMLInputElement).value.length) dc = 1
    else if (e.key === 'ArrowLeft'  && (e.target as HTMLInputElement).selectionStart === 0) dc = -1
    else return
    e.preventDefault()
    const nextId = `${r + dr}:${c + dc}`
    const next = document.querySelector<HTMLInputElement>(`input[data-mark-cell="${nextId}"]`)
    if (next) { next.focus(); next.select() }
  }

  return (
    <input
      type="number"
      step="0.5"
      min={0}
      max={max}
      className="input input-sm w-16 text-center"
      placeholder="—"
      value={value}
      disabled={disabled}
      data-mark-cell={cellId}
      onChange={(e) => onChange(clamp(e.target.value))}
      onBlur={(e) => onChange(clamp(e.target.value))}
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={onKeyDown}
    />
  )
}

function DecisionPill({ decision }: { decision: string }) {
  const tone = decision === 'P'
    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
    : 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300'
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${tone}`}>{decision}</span>
}

/* ─── Student picker — admin "let me select" panel ──────────────────── */

function StudentPicker({
  disabled, existingRegs, onPick, onRemove, extrasCount,
}: {
  disabled:     boolean
  existingRegs: Set<string>
  onPick:       (s: MarksRosterRow) => void
  onRemove:     (reg: string) => void
  extrasCount:  number
}) {
  const [open, setOpen]         = useState(false)
  const [q, setQ]               = useState('')
  const [debounced, setDebounced] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250)
    return () => clearTimeout(t)
  }, [q])

  const searchQ = useQuery({
    queryKey: ['marks', 'student-search', debounced],
    queryFn: () => studentService.list({ q: debounced, per_page: 20, student_state: 'active' }),
    enabled: open && debounced.length >= 2,
  })
  const results = ((searchQ.data as any)?.data?.data ?? []) as any[]

  if (!open) {
    return (
      <div className="card p-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[13px] text-ink-500">
          {extrasCount > 0
            ? <>You added <span className="font-semibold text-ink-800 dark:text-white">{extrasCount}</span> student(s) manually.</>
            : <>Need a different roster? Pick students by name or registration number.</>}
        </div>
        <button
          className="btn-ghost btn-sm"
          disabled={disabled}
          onClick={() => setOpen(true)}
        >
          <UserPlus className="w-3.5 h-3.5" /> Pick students
        </button>
      </div>
    )
  }

  return (
    <div className="card p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Search className="w-4 h-4 text-ink-400" />
        <input
          type="text"
          autoFocus
          className="input input-sm flex-1"
          placeholder="Search by name or registration number (min 2 chars)…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          disabled={disabled}
        />
        <button className="btn-ghost btn-sm" onClick={() => setOpen(false)}>
          <X className="w-3.5 h-3.5" /> Done
        </button>
      </div>

      {debounced.length < 2 ? (
        <div className="text-[12px] text-ink-400 px-1">Type at least 2 characters.</div>
      ) : searchQ.isLoading ? (
        <div className="text-[12px] text-ink-400 px-1 inline-flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" /> Searching…
        </div>
      ) : results.length === 0 ? (
        <div className="text-[12px] text-ink-400 px-1">No matches.</div>
      ) : (
        <ul className="max-h-64 overflow-y-auto divide-y divide-ink-100 dark:divide-ink-700 border border-ink-100 dark:border-ink-700 rounded-md">
          {results.map((s: any) => {
            const reg = String(s.regnumber ?? '')
            if (!reg) return null
            const already = existingRegs.has(reg)
            return (
              <li key={reg} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px] hover:bg-ink-50/50 dark:hover:bg-ink-700/20">
                <div className="min-w-0">
                  <div className="font-medium truncate">{s.fname} {s.lname}</div>
                  <div className="text-[11px] text-ink-500 font-mono">{reg}</div>
                </div>
                {already ? (
                  <button
                    className="btn-ghost btn-sm text-red-600"
                    onClick={() => onRemove(reg)}
                    disabled={disabled}
                  >
                    Remove
                  </button>
                ) : (
                  <button
                    className="btn-ghost btn-sm"
                    disabled={disabled}
                    onClick={() => onPick(toRosterRow(s))}
                  >
                    Add
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** Build a placeholder MarksRosterRow from a Student record. */
function toRosterRow(s: any): MarksRosterRow {
  return {
    student_id:        Number(s.id ?? 0),
    regnumber:         String(s.regnumber ?? ''),
    fname:             String(s.fname ?? ''),
    lname:             String(s.lname ?? ''),
    email:             s.email ?? null,
    sex:               s.gender ?? null,
    student_program:   s.program ?? null,
    option_acro:       s.std_option ?? null,
    mark_id:           null,

    cat_marks:         null,
    assignment_marks:  null,
    exam_marks:        null,
    cat_max:           20,
    assignment_max:    10,
    exam_max:          70,

    cat1:              null,
    cat2:              null,
    cat3:              null,
    partial_exam:      null,
    cat1_max:          15,
    cat2_max:          15,
    cat3_max:          15,
    partial_exam_max:  15,
    cats_max:          60,
    exam_1st_sitting:  null,
    exam_2nd_sitting:  null,
    final_exam_max:    40,

    total:             null,
    percentage:        null,
    grade:             null,
    decision:          null,
    status:            null,
    remarks:           null,
    updated_at:        null,
    // Manually-picked student with no saved mark yet — no entry date to filter on.
    created_at:        null,
    teaching_started_on: null,
    teaching_ended_on:   null,
  }
}

/* ─── Searchable module combobox ─────────────────────────────────────── */

function ModuleCombobox({
  modules, value, onChange, disabled, loading,
}: {
  modules:  MarkableModule[]
  value:    number
  onChange: (id: number) => void
  disabled?: boolean
  loading?:  boolean
}) {
  const [open, setOpen]       = useState(false)
  const [query, setQuery]     = useState('')
  const [highlight, setHighlight] = useState(0)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const selected = modules.find((m) => m.module_id === value) ?? null

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return modules
    return modules.filter((m) =>
      m.module_code.toLowerCase().includes(q) ||
      m.module_name.toLowerCase().includes(q)
    )
  }, [modules, query])

  // Click outside closes the panel.
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  // Reset highlight when the filtered list changes.
  useEffect(() => { setHighlight(0) }, [query, open])

  // Focus the search input when opening.
  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => Math.min(h + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      const m = filtered[highlight]
      if (m) { onChange(m.module_id); setOpen(false); setQuery('') }
    } else if (e.key === 'Escape') {
      e.preventDefault(); setOpen(false)
    }
  }

  return (
    <div ref={wrapRef} className="relative w-80">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-2 input input-sm text-left ${
          disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex-1 min-w-0 truncate">
          {loading
            ? <span className="text-ink-400">Loading modules…</span>
            : selected
              ? <>
                  <span className="font-mono text-ink-500 mr-1.5">{selected.module_code}</span>
                  <span className="text-ink-800 dark:text-white">{selected.module_name}</span>
                </>
              : <span className="text-ink-400">Select module…</span>
          }
        </span>
        <svg className={`w-3 h-3 shrink-0 text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 12 12" fill="none">
          <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-[28rem] right-0 rounded-lg border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-800 shadow-lg overflow-hidden">
          <div className="p-2 border-b border-ink-100 dark:border-ink-700 bg-ink-50/40 dark:bg-ink-700/40">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-400 pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKey}
                placeholder="Search by code or name…"
                className="w-full input input-sm pl-8"
              />
            </div>
            <div className="mt-1.5 px-1 text-[11px] text-ink-400 flex items-center justify-between">
              <span>{filtered.length} of {modules.length} modules</span>
              <span className="hidden sm:inline">↑↓ navigate · enter select · esc close</span>
            </div>
          </div>

          <ul className="max-h-72 overflow-y-auto py-1" role="listbox">
            {filtered.length === 0 ? (
              <li className="px-3 py-6 text-center text-[13px] text-ink-400">
                No modules match "{query}".
              </li>
            ) : filtered.map((m, i) => {
              const isActive = i === highlight
              const isSelected = m.module_id === value
              return (
                <li
                  key={m.module_id}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => { onChange(m.module_id); setOpen(false); setQuery('') }}
                  className={`px-3 py-2 cursor-pointer flex items-center gap-3 text-[13px] ${
                    isActive ? 'bg-primary-50 dark:bg-primary-900/30' : ''
                  } ${isSelected ? 'text-primary-700 dark:text-primary-200' : 'text-ink-800 dark:text-ink-100'}`}
                >
                  <span className="font-mono text-[12px] tabular-nums w-24 shrink-0 text-ink-500">
                    {m.module_code}
                  </span>
                  <span className="flex-1 min-w-0 truncate">{m.module_name}</span>
                  {m.level !== null && m.level !== undefined && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-ink-100 text-ink-600 dark:bg-ink-700/60 dark:text-ink-300 shrink-0">
                      L{m.level}
                    </span>
                  )}
                  {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-primary-600 shrink-0" />}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

/* ─── Import helpers ────────────────────────────────────────────────── */

function emptyDraft(): RowDraft {
  return { cat1: '', cat2: '', cat3: '', partial: '', exam1: '', exam2: '', remarks: '' }
}

function sameDraft(a: RowDraft, b: RowDraft): boolean {
  return a.cat1 === b.cat1 && a.cat2 === b.cat2 && a.cat3 === b.cat3 &&
         a.partial === b.partial && a.exam1 === b.exam1 && a.exam2 === b.exam2 &&
         a.remarks === b.remarks
}

interface ImportEntry {
  regnumber: string
  fname:     string
  lname:     string
  matched:   boolean
  current:   RowDraft
  incoming:  RowDraft
  changed:   boolean
}

interface ImportPreview {
  entries: ImportEntry[]
  summary: { matched: number; unmatched: number; unchanged: number }
}

/* ─── Import preview modal ──────────────────────────────────────────── */

function ImportPreviewModal({
  preview, onCancel, onApprove,
}: {
  preview:  ImportPreview | null
  onCancel: () => void
  onApprove: () => void
}) {
  if (!preview) return null
  const { entries, summary } = preview
  const cols: { k: keyof RowDraft; label: string }[] = [
    { k: 'cat1', label: 'C1' }, { k: 'cat2', label: 'C2' }, { k: 'cat3', label: 'C3' },
    { k: 'partial', label: 'P' }, { k: 'exam1', label: 'E1' }, { k: 'exam2', label: 'E2' },
  ]
  return (
    <div className="fixed inset-0 z-50 bg-ink-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white dark:bg-ink-800 w-full max-w-5xl max-h-[88vh] rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <div className="px-5 py-3 border-b border-ink-100 dark:border-ink-700 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-ink-900 dark:text-white">Review imported marks</h3>
            <p className="text-[12px] text-ink-500">
              Approve to overwrite the marks for matched students. Unmatched rows are ignored.
            </p>
          </div>
          <button className="icon-btn" onClick={onCancel} aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-ink-100 dark:border-ink-700 flex flex-wrap items-center gap-3 text-[12.5px]">
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 font-semibold">
            <CheckCircle2 className="w-3 h-3" /> {summary.matched} will be updated
          </span>
          {summary.unchanged > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-ink-100 text-ink-600 dark:bg-ink-700/60 dark:text-ink-300">
              {summary.unchanged} unchanged
            </span>
          )}
          {summary.unmatched > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 font-semibold">
              <AlertTriangle className="w-3 h-3" /> {summary.unmatched} unmatched
            </span>
          )}
          <span className="ml-auto text-ink-400">{entries.length} row(s) read</span>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-[12.5px]">
            <thead className="bg-ink-50/70 dark:bg-ink-700/40 sticky top-0 z-10 text-[10px] uppercase font-bold text-ink-500">
              <tr>
                <th className="px-3 py-2 border-b border-ink-100 dark:border-ink-700">Status</th>
                <th className="px-3 py-2 border-b border-ink-100 dark:border-ink-700">Reg #</th>
                <th className="px-3 py-2 border-b border-ink-100 dark:border-ink-700">Student</th>
                {cols.map((c) => (
                  <th key={c.k} colSpan={2} className="px-2 py-2 border-b border-ink-100 dark:border-ink-700 text-center">{c.label}</th>
                ))}
              </tr>
              <tr>
                <th className="border-b border-ink-100 dark:border-ink-700"></th>
                <th className="border-b border-ink-100 dark:border-ink-700"></th>
                <th className="border-b border-ink-100 dark:border-ink-700"></th>
                {cols.map((c) => (
                  <Fragment2 key={c.k}>
                    <th className="px-2 py-1 border-b border-ink-100 dark:border-ink-700 text-center text-[9px] font-medium text-ink-400">cur</th>
                    <th className="px-2 py-1 border-b border-ink-100 dark:border-ink-700 text-center text-[9px] font-medium text-ink-400">new</th>
                  </Fragment2>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
              {entries.map((e, i) => (
                <tr key={i} className={e.matched
                  ? (e.changed ? 'bg-emerald-50/30 dark:bg-emerald-500/5' : '')
                  : 'bg-amber-50/30 dark:bg-amber-500/5'}>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    {e.matched
                      ? (e.changed
                          ? <span className="text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Update</span>
                          : <span className="text-ink-400">Unchanged</span>)
                      : <span className="text-amber-700 dark:text-amber-300 inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Not in roster</span>}
                  </td>
                  <td className="px-3 py-1.5 font-mono">{e.regnumber}</td>
                  <td className="px-3 py-1.5">{e.matched ? `${e.fname} ${e.lname}` : '—'}</td>
                  {cols.map((c) => {
                    const before = e.current[c.k]
                    const after  = e.incoming[c.k]
                    const diff   = e.matched && before !== after
                    return (
                      <Fragment2 key={c.k}>
                        <td className="px-2 py-1.5 text-center text-ink-400 text-[11px]">{before || '—'}</td>
                        <td className={`px-2 py-1.5 text-center text-[11px] ${diff ? 'font-bold text-emerald-700 dark:text-emerald-300' : 'text-ink-400'}`}>
                          {after || '—'}
                        </td>
                      </Fragment2>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 border-t border-ink-100 dark:border-ink-700 flex items-center justify-end gap-2 bg-ink-50/40 dark:bg-ink-700/20">
          <button className="btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
          <button
            className="btn-primary btn-sm"
            disabled={summary.matched === 0}
            onClick={onApprove}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {summary.matched === 0
              ? 'Nothing to apply'
              : `Approve & apply ${summary.matched} row${summary.matched === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  )
}

/** React.Fragment alias to keep <Fragment2 key…> JSX legal as a sibling of <th>/<td>. */
function Fragment2({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

/* ═══════════════════════════════════════════════════════════════════════════
 * MarksSchedulePicker — landing view that mirrors the Attendance flow.
 * Shows every teaching block on the timetable as a flat table; clicking a
 * row opens that module's marks roster.
 * ═══════════════════════════════════════════════════════════════════════ */
const DAY_LABELS_MARKS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function formatDayPatternMarks(pattern: string | null, dayOfWeek: number | null): string {
  const days = (pattern && pattern.trim() !== ''
    ? pattern.split(',').map((s) => Number(s.trim())).filter((n) => n >= 1 && n <= 7)
    : (dayOfWeek ? [dayOfWeek] : []))
  if (!days.length) return '—'
  return days.map((d) => DAY_LABELS_MARKS[d - 1]).join(', ')
}

function MarksSchedulePicker({
  termId, terms, onChangeTerm, onPickModule,
}: {
  termId:        number
  terms:         any[]
  onChangeTerm:  (id: number) => void
  onPickModule:  (moduleId: number, code: string, name: string) => void
}) {
  const [programId, setProgramId] = useState<number>(0)
  const [gLevel, setGLevel]       = useState<number>(0)
  const [gSearch, setGSearch]     = useState('')

  const programsQ = useQuery({
    queryKey:  ['portal', 'programs'],
    queryFn:   () => portalService.getPrograms(),
    staleTime: 5 * 60_000,
  })
  const program = useMemo(
    () => (programsQ.data?.data ?? []).find((p: any) => Number(p.id) === programId) ?? null,
    [programsQ.data, programId],
  )

  const levelsQ = useQuery({
    queryKey: ['academics', 'levels'],
    queryFn:  () => academicsMgmtService.list<any>('levels', { per_page: 100 }),
    staleTime: 5 * 60_000,
  })
  const levels: any[] = levelsQ.data?.data?.data ?? []

  // Reuse the attendance endpoint — it returns every module_offerings block
  // with the same shape the marks roster needs (module id/code/name).
  const blocksQ = useQuery({
    queryKey:  ['marks', 'scheduled-blocks', programId || 0],
    queryFn:   () => attendanceService.scheduledBlocks(
      programId ? { program_id: programId } : {},
    ),
    staleTime: 60_000,
  })
  const allBlocks: ScheduledBlock[] = blocksQ.data?.data?.rows ?? []

  const filteredBlocks = useMemo(() => {
    let list = allBlocks
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
  }, [allBlocks, gLevel, gSearch])

  const hasFilters = gLevel > 0 || gSearch.trim().length > 0

  return (
    <div className="space-y-4 animate-fade-in">
      <section className="card p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-semibold text-ink-900 dark:text-white">
              Exam results — scheduled modules
            </h2>
            <p className="text-[12px] text-ink-500">
              Every module that has a teaching block on the timetable. Click a row to open the
              official CUR mark sheet for that module.
            </p>
          </div>
          <select
            className="input input-sm w-44 shrink-0"
            value={termId || ''}
            onChange={(e) => onChangeTerm(Number(e.target.value))}
            title="Academic term"
          >
            <option value="" disabled>Select term…</option>
            {terms.map((t: any) => (
              <option key={t.id} value={t.id}>
                {t.label}{t.is_current ? ' (current)' : ''}
              </option>
            ))}
          </select>
        </div>

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
              onChange={(v) => setProgramId(Number(v))}
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
              onClick={() => { setGLevel(0); setGSearch(''); setProgramId(0) }}
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
              onClick={() => setProgramId(0)}
              className="ml-1 text-ink-400 hover:text-rose-500"
              title="Clear programme filter"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </section>

      <section className="card p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-ink-100 dark:border-ink-700 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-[14px] text-ink-900 dark:text-white">
              All schedules ({filteredBlocks.length})
            </h3>
            <p className="text-[11.5px] text-ink-500 mt-0.5">
              Same data as Module scheduling. Click any row to record marks for that module.
            </p>
          </div>
          {blocksQ.isFetching && <Loader2 className="w-3.5 h-3.5 animate-spin text-ink-400" />}
        </div>

        {blocksQ.isLoading ? (
          <div className="p-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-ink-400" /></div>
        ) : filteredBlocks.length === 0 ? (
          <div className="p-8 text-center text-ink-500 text-[13px] inline-flex flex-col items-center gap-2 w-full">
            <AlertCircle className="w-5 h-5 text-ink-300" />
            No teaching blocks match the current filters.
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
                  const pick = () => onPickModule(b.module_id, b.module_code ?? '', b.module_name ?? '')
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
                      <td className="text-[12px]">{formatDayPatternMarks(b.day_pattern, b.day_of_week)}</td>
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
                          Record marks
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
