import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle, CalendarClock, CheckCircle2,
  CircleSlash, Download, Info, Loader2, Search, XCircle,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import toast from 'react-hot-toast'
import Modal from '@/components/ui/Modal'
import Pagination, { DEFAULT_PER_PAGE_OPTIONS } from '@/components/ui/Pagination'
import { useDebounce } from '@/hooks/useDebounce'
import { cn } from '@/utils/helpers'
import { useGradingScale } from '@/utils/gradingScale'
import { useLevels } from '@/hooks/useLevels'
import {
  graduandService,
  type AuditLevelGroup,
  type CompletionFilter, type CompletionRow, type CompletionSort,
  type ModuleAuditStatus, type StartSource,
} from '@/services/graduandService'

/* ── Shared vocabulary ─────────────────────────────────────────────────────── */

const STATUS_STYLE: Record<ModuleAuditStatus, { label: string; chip: string; dot: string }> = {
  passed:   { label: 'Passed',   chip: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300',    dot: 'bg-green-500' },
  failed:   { label: 'Failed',   chip: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300',            dot: 'bg-red-500' },
  exempted: { label: 'Exempted', chip: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300',dot: 'bg-purple-500' },
  pending:  { label: 'Awaiting marks', chip: 'bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300', dot: 'bg-amber-500' },
  missing:  { label: 'Not taken', chip: 'bg-gray-200 text-gray-700 dark:bg-ink-700 dark:text-ink-300',            dot: 'bg-gray-400' },
}

/** Explains the derived start date, since neither column in the DB is reliable. */
const START_SOURCE_HINT: Record<StartSource, string> = {
  registration_date: 'Exact date recorded at registration.',
  regnumber:         'No usable registration date — taken as 1 September of the intake year encoded in the reg number.',
  unknown:           'Neither the registration date nor the reg number gives an intake year.',
}

const COMPLETION_TABS: Array<{ key: CompletionFilter; label: string }> = [
  { key: 'all',           label: 'Everyone' },
  { key: 'complete',      label: 'Fully recorded' },
  { key: 'incomplete',    label: 'Missing modules' },
  { key: 'with_failures', label: 'Has failures' },
]

const SORTS: Array<{ key: CompletionSort; label: string }> = [
  { key: 'completion', label: 'Closest to done' },
  { key: 'missing',    label: 'Most outstanding' },
  { key: 'started',    label: 'Longest enrolled' },
  { key: 'name',       label: 'Student' },
]

/** Default cut-off: four years back, i.e. the cohort that should have finished. */
function defaultCutoff(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 4)
  return d.toISOString().slice(0, 10)
}

/* ── Panel ─────────────────────────────────────────────────────────────────── */

export default function GraduationAuditPanel() {
  const { levels } = useLevels()
  const [startedBefore, setStartedBefore] = useState(defaultCutoff)
  // Opens on the students who already have a mark for every module in their
  // program — the graduation list itself. The other buckets are one click away.
  const [completion, setCompletion]       = useState<CompletionFilter>('complete')
  const [sort, setSort]                   = useState<CompletionSort>('completion')
  const [option, setOption]               = useState('')
  const [level, setLevel]                 = useState(0)
  const [state, setState]                 = useState('active')
  const [searchInput, setSearchInput]     = useState('')
  const [page, setPage]                   = useState(1)
  const [perPage, setPerPage]             = useState(DEFAULT_PER_PAGE_OPTIONS[0])
  const [openStudent, setOpenStudent]     = useState<CompletionRow | null>(null)

  const search = useDebounce(searchInput, 400)

  const params = useMemo(() => ({
    started_before: startedBefore,
    completion,
    sort,
    std_option:    option || undefined,
    current_level: level || undefined,
    student_state: state,
    search:        search || undefined,
    page,
    per_page:      perPage,
  }), [startedBefore, completion, sort, option, level, state, search, page, perPage])

  const { data: result, isFetching, isError, error } = useQuery({
    queryKey: ['graduation-audit', params],
    queryFn:  ({ signal }) => graduandService.completionList(params, signal),
    enabled:  /^\d{4}-\d{2}-\d{2}$/.test(startedBefore),
    placeholderData: (prev) => prev,
  })
  const audit = result?.data

  // Any filter change invalidates the current page number.
  const reset = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setPage(1) }

  return (
    <div className="space-y-5">
      {/* Cut-off + filters */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-ink-700 dark:bg-ink-800">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-ink-300">
              Students who started on or before
            </label>
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-gray-400 dark:text-ink-500" />
              <input
                type="date"
                value={startedBefore}
                onChange={(e) => reset(setStartedBefore)(e.target.value)}
                className="rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-ink-700 dark:bg-ink-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-ink-300">Program</label>
            <select
              value={option}
              onChange={(e) => reset(setOption)(e.target.value)}
              className="min-w-[15rem] rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-ink-700 dark:bg-ink-900 dark:text-white"
            >
              <option value="">All programs</option>
              {(audit?.programs ?? []).map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.name ?? p.acro ?? `#${p.id}`} ({p.students})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-ink-300">Level</label>
            <select
              value={level}
              onChange={(e) => reset(setLevel)(Number(e.target.value))}
              className="rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-ink-700 dark:bg-ink-900 dark:text-white"
            >
              <option value={0}>Any</option>
              {/* Named from the catalogue; the value stays the id the API filters on. */}
              {levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-ink-300">Status</label>
            <select
              value={state}
              onChange={(e) => reset(setState)(e.target.value)}
              className="rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-ink-700 dark:bg-ink-900 dark:text-white"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="graduated">Graduated</option>
              <option value="all">All</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-ink-300">Sort by</label>
            <select
              value={sort}
              onChange={(e) => reset(setSort)(e.target.value as CompletionSort)}
              className="rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-ink-700 dark:bg-ink-900 dark:text-white"
            >
              {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>

          <div className="flex-1 min-w-[12rem]">
            <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-ink-300">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-ink-500" />
              <input
                value={searchInput}
                onChange={(e) => reset(setSearchInput)(e.target.value)}
                placeholder="Reg number or name"
                className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-ink-700 dark:bg-ink-900 dark:text-white"
              />
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <p className="flex max-w-3xl items-start gap-1.5 text-xs text-gray-500 dark:text-ink-400">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            A module counts as recorded once any mark exists for it, pass or fail. Failures are
            counted separately so a student with a full record but an outstanding resit is still visible.
          </p>
          <a
            href={graduandService.completionExportUrl({ ...params, page: undefined, per_page: undefined })}
            className={cn(
              'inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium',
              'border-gray-300 text-gray-700 hover:bg-gray-50',
              'dark:border-ink-700 dark:text-ink-200 dark:hover:bg-ink-700/50',
              (audit?.total ?? 0) === 0 && 'pointer-events-none opacity-40',
            )}
            title="Download every row matching the current filters, not just this page."
          >
            <Download className="h-4 w-4" />
            Export CSV{audit ? ` (${audit.total})` : ''}
          </a>
        </div>
      </div>

      {/* Summary counters, doubling as the completion filter */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {COMPLETION_TABS.map((t) => {
          const n = audit
            ? t.key === 'all'           ? audit.summary.cohort
            : t.key === 'complete'      ? audit.summary.complete
            : t.key === 'incomplete'    ? audit.summary.incomplete
            :                             audit.summary.with_failures
            : null
          const active = completion === t.key
          return (
            <button
              key={t.key}
              onClick={() => reset(setCompletion)(t.key)}
              className={cn(
                'rounded-xl border p-4 text-left transition-colors',
                active
                  ? 'border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-900/20'
                  : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-ink-700 dark:bg-ink-800 dark:hover:bg-ink-700/50',
              )}
            >
              <div className={cn(
                'text-2xl font-bold',
                active ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-white',
              )}>
                {n ?? '—'}
              </div>
              <div className="text-xs text-gray-500 dark:text-ink-400">{t.label}</div>
            </button>
          )
        })}
      </div>

      {audit && audit.summary.no_curriculum > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {audit.summary.no_curriculum} student{audit.summary.no_curriculum !== 1 ? 's' : ''} in this
            cohort {audit.summary.no_curriculum !== 1 ? 'are' : 'is'} on a program with no modules mapped to it,
            so nothing can be checked for them. They are listed with an empty curriculum rather than hidden.
          </span>
        </div>
      )}

      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
          {(error as { response?: { data?: { message?: string } } })?.response?.data?.message
            ?? 'Could not load the audit.'}
        </div>
      )}

      {/* Cohort table.
          No `overflow-*` anywhere between the page scroll container and <th>:
          any overflow ancestor would trap `position: sticky` in a box that
          never scrolls vertically, and the header row would stop pinning. */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-ink-700 dark:bg-ink-800">
        {isFetching && (
          <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-2 text-xs text-gray-500 dark:border-ink-700 dark:text-ink-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Recalculating the cohort…
          </div>
        )}
        <table className="w-full text-sm">
          {/* Pins directly under the sticky tab bar, which is h-12 in
              GraduandManagementPage. Opaque background — a translucent one
              would show rows sliding beneath the header. */}
          <thead className={cn(
            '[&_th]:sticky [&_th]:z-20 [&_th]:top-12',
            '[&_th]:bg-gray-50 dark:[&_th]:bg-ink-900',
            '[&_th]:border-b [&_th]:border-gray-200 dark:[&_th]:border-ink-700',
            '[&_th]:px-4 [&_th]:py-3 [&_th]:font-semibold [&_th]:text-gray-700 dark:[&_th]:text-ink-200',
            '[&_th:first-child]:rounded-tl-xl [&_th:last-child]:rounded-tr-xl',
          )}>
            <tr>
              <th className="text-left">Student</th>
              <th className="text-left">Program</th>
              <th className="text-left">Started</th>
              <th className="text-left">Modules recorded</th>
              <th className="text-center">Outstanding</th>
              <th className="text-center">Failed</th>
              <th className="text-center">Verdict</th>
            </tr>
          </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-ink-700">
              {(audit?.data ?? []).length === 0 && !isFetching && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-400 dark:text-ink-500">
                    No students match this cut-off and filter.
                  </td>
                </tr>
              )}
              {(audit?.data ?? []).map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setOpenStudent(r)}
                  className="cursor-pointer hover:bg-gray-50 dark:hover:bg-ink-700/50"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 dark:text-white">{r.lname} {r.fname}</div>
                    <div className="text-xs text-gray-500 dark:text-ink-400">{r.regnumber}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600 dark:text-ink-300">
                    <div className="flex items-center gap-1">
                      {r.option_name ?? r.option_acronym ?? '—'}
                      {r.curriculum_suspect && (
                        <span title="This program maps to an implausible number of modules — the counts below are unreliable until its curriculum is cleaned up.">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                        </span>
                      )}
                    </div>
                    {r.dep_name && <div className="text-gray-400 dark:text-ink-500">{r.dep_name}</div>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600 dark:text-ink-300">
                    <div>{r.started_on ?? '—'}</div>
                    <div
                      className="text-gray-400 dark:text-ink-500"
                      title={r.start_source ? START_SOURCE_HINT[r.start_source] : undefined}
                    >
                      {r.start_source === 'regnumber' ? 'from reg number' : 'from registration'}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <ProgressCell recorded={r.recorded} expected={r.expected} pct={r.percent_complete} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn(
                      'font-semibold',
                      r.outstanding === 0
                        ? 'text-gray-400 dark:text-ink-500'
                        : 'text-amber-600 dark:text-amber-400',
                    )}>
                      {r.outstanding}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn(
                      'font-semibold',
                      r.failed === 0
                        ? 'text-gray-400 dark:text-ink-500'
                        : 'text-red-600 dark:text-red-400',
                    )}>
                      {r.failed}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Verdict row={r} />
                  </td>
                </tr>
              ))}
            </tbody>
        </table>
      </div>

      {audit && (
        <Pagination
          currentPage={page}
          lastPage={audit.last_page}
          total={audit.total}
          perPage={perPage}
          onPageChange={setPage}
          perPageOptions={DEFAULT_PER_PAGE_OPTIONS}
          onPerPageChange={(n) => { setPerPage(n); setPage(1) }}
        />
      )}

      <StudentAuditModal row={openStudent} onClose={() => setOpenStudent(null)} />
    </div>
  )
}

/* ── Row bits ──────────────────────────────────────────────────────────────── */

function ProgressCell({ recorded, expected, pct }: { recorded: number; expected: number; pct: number | null }) {
  if (expected === 0) {
    return <span className="text-xs text-gray-400 dark:text-ink-500">No curriculum mapped</span>
  }
  const value = pct ?? 0
  return (
    <div className="min-w-[9rem]">
      <div className="mb-1 flex justify-between text-xs text-gray-600 dark:text-ink-300">
        <span>{recorded} / {expected}</span>
        <span className="font-medium">{value}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-ink-700">
        <div
          className={cn(
            'h-full rounded-full',
            value >= 100 ? 'bg-green-500' : value >= 75 ? 'bg-blue-500' : value >= 40 ? 'bg-amber-500' : 'bg-red-400',
          )}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
    </div>
  )
}

function Verdict({ row }: { row: CompletionRow }) {
  if (row.expected === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gray-400 dark:text-ink-500">
        <CircleSlash className="h-4 w-4" /> Can't check
      </span>
    )
  }
  if (row.outstanding > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
        <XCircle className="h-4 w-4" /> Incomplete
      </span>
    )
  }
  if (row.failed > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
        <AlertTriangle className="h-4 w-4" /> Resits due
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
      <CheckCircle2 className="h-4 w-4" /> Complete
    </span>
  )
}

/* ── Drill-down ────────────────────────────────────────────────────────────── */

/** `2026-08-10 11:06:35` → `2026-08-10`. Time is noise in an audit table. */
function dayOf(v: string | null | undefined): string {
  if (!v) return '—'
  return String(v).slice(0, 10)
}

/**
 * Collapse repeated catalogue rows for the same module code.
 *
 * `module_programs` maps several catalogue entries that share a code to the same
 * program — CCU8112 exists three times under different names ("Introduction to
 * ICT", "…to ICT in Education", "…to Information and Communication Technology").
 * Each is a separate `module_id`, so the audit listed the student three times for
 * one subject: once Passed and twice Not taken.
 *
 * The row that survives is the most advanced one by STATUS_RANK — a recorded
 * result always beats an untouched duplicate. The rest are counted and reported
 * so the duplication is visible rather than silently swallowed.
 */
const STATUS_RANK: Record<ModuleAuditStatus, number> = {
  passed: 5, failed: 4, exempted: 3, pending: 2, missing: 1,
}

function dedupeByCode<T extends { module_code: string; module_id: number; status: ModuleAuditStatus }>(
  modules: T[],
): { rows: T[]; duplicates: Array<{ code: string; count: number }> } {
  const byCode = new Map<string, T[]>()
  const order: string[] = []
  for (const m of modules) {
    // Modules with no code cannot be matched to each other — keep them all.
    const key = (m.module_code || '').trim().toUpperCase() || `#${m.module_id}`
    if (!byCode.has(key)) { byCode.set(key, []); order.push(key) }
    byCode.get(key)!.push(m)
  }
  const rows: T[] = []
  const duplicates: Array<{ code: string; count: number }> = []
  for (const key of order) {
    const group = byCode.get(key)!
    const best = group.reduce((a, b) => (STATUS_RANK[b.status] > STATUS_RANK[a.status] ? b : a))
    rows.push(best)
    if (group.length > 1) duplicates.push({ code: group[0].module_code || key, count: group.length })
  }
  return { rows, duplicates }
}

/** Everything the drill-down needs to identify a student. Deliberately narrower
 *  than `CompletionRow` so the graduation roster, whose rows carry extra
 *  lifecycle fields, can open the same modal. */
export interface AuditModalTarget {
  id:        number
  regnumber: string | null
  fname:     string | null
  lname:     string | null
}

/** `percentage` arrives as a string from MySQL DECIMAL — normalise before grading. */
const pctOf = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function StudentAuditModal({ row, onClose }: { row: AuditModalTarget | null; onClose: () => void }) {
  const [only, setOnly] = useState<'all' | 'outstanding'>('all')
  const scale = useGradingScale()
  const { levelName } = useLevels()

  const { data: result, isLoading } = useQuery({
    queryKey: ['graduation-audit-detail', row?.id],
    queryFn:  ({ signal }) => graduandService.completionDetail(row!.id, signal),
    enabled:  row !== null,
  })
  const detail = result?.data

  const title = row ? `${row.lname ?? ''} ${row.fname ?? ''} — ${row.regnumber ?? ''}`.trim() : ''

  /* Deduplicate every level, and collect the duplicate codes for the banner. */
  const { groups, duplicates } = useMemo<{
    groups: AuditLevelGroup[]
    duplicates: Array<{ code: string; count: number }>
  }>(() => {
    if (!detail) return { groups: [], duplicates: [] }
    const dupMap = new Map<string, number>()
    const groups = detail.groups.map((g) => {
      const { rows, duplicates } = dedupeByCode(g.modules)
      duplicates.forEach((d) => dupMap.set(d.code, Math.max(dupMap.get(d.code) ?? 0, d.count)))
      return { ...g, modules: rows }
    })
    return {
      groups,
      duplicates: Array.from(dupMap.entries()).map(([code, count]) => ({ code, count })),
    }
  }, [detail])

  /** Flat row set for the exports — exactly what the table renders. */
  const exportRows = useMemo(() => {
    const out: Array<Record<string, string | number>> = []
    groups.forEach((g) => {
      const mods = only === 'all'
        ? g.modules
        : g.modules.filter((m) => m.status === 'missing' || m.status === 'pending' || m.status === 'failed')
      mods.forEach((m) => out.push({
        Level:        g.level_name ?? levelName(g.level_id, ''),
        Code:         m.module_code || '—',
        Module:       m.module_name || '—',
        Credits:      m.module_credits || '',
        Mark:         m.percentage != null ? `${m.percentage}%` : '',
        Grade:        scale.gradeFor(pctOf(m.percentage)) ?? '',
        Attempts:     m.attempts,
        'Last updated': dayOf(m.updated_at),
        Status:       STATUS_STYLE[m.status].label,
      }))
    })
    return out
  }, [groups, only, scale])

  const handleExcel = () => {
    if (!detail || exportRows.length === 0) { toast.error('Nothing to export.'); return }
    const headers = Object.keys(exportRows[0])
    const aoa: any[][] = [
      [`${title}`],
      [`Program: ${detail.program?.name ?? '—'}`,
       `Started: ${detail.student.started_on ?? '—'}`,
       `Passed: ${detail.totals.passed}`,
       `Outstanding: ${detail.totals.missing + detail.totals.pending}`],
      [],
      headers,
      ...exportRows.map((r) => headers.map((h) => r[h] ?? '')),
    ]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    // One width per key in exportRows — the last covers Status, whose longest
    // label is 'Awaiting marks'. A short list here leaves the trailing column
    // at Excel's ~8-char default, where that label truncates.
    ws['!cols'] = [{ wch: 16 }, { wch: 12 }, { wch: 46 }, { wch: 8 }, { wch: 8 }, { wch: 9 }, { wch: 13 }, { wch: 14 }, { wch: 16 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Curriculum audit')
    XLSX.writeFile(wb, `audit_${row?.regnumber ?? 'student'}.xlsx`)
    toast.success(`Exported ${exportRows.length} rows.`)
  }

  const handlePdf = () => {
    if (!detail || exportRows.length === 0) { toast.error('Nothing to export.'); return }
    // Laid out by hand rather than screenshotted: an audit runs to hundreds of
    // rows, and an image of the scroll box would be one illegible page.
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()
    const M = 32
    const cols = [
      { key: 'Level',        x: M,       w: 70 },
      { key: 'Code',         x: M + 74,  w: 58 },
      { key: 'Module',       x: M + 136, w: 300 },
      { key: 'Credits',      x: M + 440, w: 44 },
      { key: 'Mark',         x: M + 488, w: 40 },
      { key: 'Grade',        x: M + 532, w: 34 },
      { key: 'Last updated', x: M + 570, w: 74 },
      { key: 'Status',       x: M + 648, w: 90 },
    ]
    let y = M

    doc.setFont('helvetica', 'bold'); doc.setFontSize(13)
    doc.text(title, M, y); y += 16
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5)
    doc.text(
      `Program: ${detail.program?.name ?? '—'}   Started: ${detail.student.started_on ?? '—'}   ` +
      `Passed: ${detail.totals.passed}   Failed: ${detail.totals.failed}   ` +
      `Outstanding: ${detail.totals.missing + detail.totals.pending}   ` +
      `Credits: ${detail.totals.credits_recorded}/${detail.totals.credits_expected}`,
      M, y,
    )
    y += 18

    const header = () => {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8)
      cols.forEach((c) => doc.text(c.key, c.x, y))
      y += 4
      doc.setDrawColor(200); doc.line(M, y, pageW - M, y); y += 10
      doc.setFont('helvetica', 'normal')
    }
    header()

    exportRows.forEach((r) => {
      if (y > pageH - M) { doc.addPage(); y = M; header() }
      cols.forEach((c) => {
        const raw = String(r[c.key] ?? '')
        // jsPDF does not wrap: clip to the column so text never overlaps.
        const text = doc.splitTextToSize(raw, c.w)[0] ?? ''
        doc.text(text, c.x, y)
      })
      y += 12
    })

    doc.save(`audit_${row?.regnumber ?? 'student'}.pdf`)
    toast.success(`Exported ${exportRows.length} rows.`)
  }

  return (
    <Modal
      open={row !== null}
      title={title}
      onClose={onClose}
      size="full"
      // Full-height panel: an audit is a long table, and a 70vh box inside a
      // 90vh modal wasted a third of the screen and nested two scrollbars.
      className="!max-h-[95vh] h-[95vh]"
      // The sticky header below owns the top edge. Leaving the body's default
      // `pt-5` in place would keep a 20px band between the title bar and the
      // header that scrolled rows travel through and remain visible in.
      bodyClassName="pt-0"
    >
      {isLoading || !detail ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-400 dark:text-ink-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading curriculum…
        </div>
      ) : (
        // The Modal body is the scroll container, so the block below can pin
        // itself with `sticky top-0` — the facts, counts and filters stay put
        // while the curriculum scrolls under them.
        <div className="space-y-4">
          {/* Sits flush under the title bar: the modal body is given `pt-0`
              above, so there is no padding band left to cancel out and no gap
              for scrolled rows to show through. `-mx-6 px-6` lets the opaque
              background span the body's full width. */}
          <div className="sticky top-0 z-10 -mx-6 space-y-3 border-b border-gray-200 bg-white px-6 pb-3 pt-0 dark:border-ink-700 dark:bg-ink-800">
            {/* Header facts */}
            <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
              <Fact label="Program" value={detail.program?.name ?? '—'} />
              <Fact
                label="Started"
                value={detail.student.started_on ?? '—'}
                hint={detail.student.start_source ? START_SOURCE_HINT[detail.student.start_source] : undefined}
              />
              <Fact label="Year of study" value={levelName(detail.student.current_level)} />
              <Fact label="Enrolment" value={detail.student.student_state ?? '—'} />
            </div>

            {detail.program?.curriculum_suspect && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  This program has {detail.totals.expected} modules mapped to it — far more than a real
                  curriculum. Modules below marked "Not taken" most likely belong to other programs and
                  were bulk-linked by a legacy import, so treat the outstanding count as a curriculum
                  problem rather than a student one.
                </span>
              </div>
            )}

            {/* Duplicate module codes — a catalogue fault, so it is reported
                rather than quietly hidden by the de-duplication above. */}
            {duplicates.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <span className="font-semibold">
                    {duplicates.length} module code{duplicates.length === 1 ? '' : 's'} appear more than once
                    in this curriculum
                  </span>{' '}
                  — {duplicates.slice(0, 8).map((d) => `${d.code} ×${d.count}`).join(', ')}
                  {duplicates.length > 8 ? `, +${duplicates.length - 8} more` : ''}.
                  The same subject is catalogued under several module ids, so the student appeared once per
                  copy. Only the furthest-progressed row is listed below; the counts above still include
                  every catalogue entry. Merging these duplicates is registry work.
                </span>
              </div>
            )}

            {/* Bucket counts */}
            <div className="flex flex-wrap items-center gap-2">
              {(['passed', 'failed', 'exempted', 'pending', 'missing'] as ModuleAuditStatus[]).map((s) => (
                <span key={s} className={cn('rounded-full px-3 py-1 text-xs font-medium', STATUS_STYLE[s].chip)}>
                  {STATUS_STYLE[s].label}: {detail.totals[s]}
                </span>
              ))}
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 dark:bg-ink-700 dark:text-ink-200">
                Credits: {detail.totals.credits_recorded} / {detail.totals.credits_expected}
              </span>

              <div className="ml-auto flex items-center gap-2">
                <button className="btn-ghost btn-sm" onClick={handleExcel} title="Download the rows below as XLSX">
                  <Download className="h-3.5 w-3.5" /> Excel
                </button>
                <button className="btn-ghost btn-sm" onClick={handlePdf} title="Download the rows below as PDF">
                  <Download className="h-3.5 w-3.5" /> PDF
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              {(['all', 'outstanding'] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setOnly(k)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium',
                    only === k
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'text-gray-600 hover:bg-gray-50 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-700/50',
                  )}
                >
                  {k === 'all' ? 'All modules' : 'Only what is outstanding'}
                </button>
              ))}

              {/* The bands the Grade column is read off, so a letter on a row
                  can be checked without leaving the modal. Configured at
                  /academic/grading-scale. */}
              <div className="ml-auto flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500 dark:text-ink-400">
                <span className="font-semibold uppercase tracking-wide">Grading scale</span>
                {scale.bands.map((b) => (
                  <span
                    key={b.id}
                    className="rounded border border-gray-200 px-1.5 py-0.5 dark:border-ink-700"
                    title={b.description ?? undefined}
                  >
                    <span className="font-bold text-gray-700 dark:text-ink-200">{b.grade}</span>{' '}
                    {Number(b.min_marks)}–{Number(b.max_marks)}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Per-level curriculum */}
          {groups.length === 0 && (
            <p className="py-8 text-center text-sm text-gray-400 dark:text-ink-500">
              No curriculum is mapped to this student's program, so there is nothing to check.
            </p>
          )}
          {groups.map((g) => {
            const modules = only === 'all'
              ? g.modules
              : g.modules.filter((m) => m.status === 'missing' || m.status === 'pending' || m.status === 'failed')
            if (modules.length === 0) return null
            return (
              <div key={`${g.level_id ?? 'none'}`} className="overflow-hidden rounded-lg border border-gray-200 dark:border-ink-700">
                <div className="flex items-center justify-between bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700 dark:bg-ink-900/40 dark:text-ink-200">
                  <span>{g.level_name ?? levelName(g.level_id)}</span>
                  <span className="font-normal text-gray-500 dark:text-ink-400">
                    {g.modules.filter((m) => m.status !== 'missing' && m.status !== 'pending').length} of {g.modules.length} recorded
                  </span>
                </div>
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-gray-100 dark:divide-ink-700">
                    {modules.map((m) => (
                      <tr key={`${g.level_id}-${m.module_id}`} className="hover:bg-gray-50 dark:hover:bg-ink-700/40">
                        <td className="w-2 px-3 py-2">
                          <span className={cn('block h-2 w-2 rounded-full', STATUS_STYLE[m.status].dot)} />
                        </td>
                        <td className="py-2 pr-3 font-mono text-gray-500 dark:text-ink-400">{m.module_code || '—'}</td>
                        <td className="py-2 pr-3 text-gray-800 dark:text-ink-100">{m.module_name || '—'}</td>
                        <td className="py-2 pr-3 text-center text-gray-500 dark:text-ink-400">{m.module_credits || '—'} cr</td>
                        <td
                          className="py-2 pr-3 text-center font-semibold text-gray-800 dark:text-ink-100"
                          // The attempt count is still worth knowing, just not
                          // worth a badge on every repeated row — it reads as
                          // part of the mark. Kept on hover instead.
                          title={m.attempts > 1
                            ? `${m.attempts} mark rows recorded — the result that stands is shown.`
                            : undefined}
                        >
                          {m.percentage != null ? `${m.percentage}%` : '—'}
                        </td>
                        {/* Letter grade off the registry's configured scale. */}
                        <td
                          className="py-2 pr-3 text-center font-bold text-gray-800 dark:text-ink-100"
                          title={scale.labelFor(pctOf(m.percentage)) ?? undefined}
                        >
                          {scale.gradeFor(pctOf(m.percentage)) ?? '—'}
                        </td>
                        {/* Was the term label, but every legacy mark reads
                            "Legacy (imported marks)" — the edit date is the
                            fact the registry actually needs. */}
                        <td className="py-2 pr-3 text-center text-gray-500 dark:text-ink-400" title={m.updated_at ?? undefined}>
                          {dayOf(m.updated_at)}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          <span className={cn('rounded-full px-2 py-0.5 font-medium', STATUS_STYLE[m.status].chip)}>
                            {STATUS_STYLE[m.status].label}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}

          {/* Marks that don't belong to the mapped curriculum */}
          {detail.extra_modules.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-blue-200 dark:border-blue-900/40">
              <div className="bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
                {detail.extra_modules.length} mark{detail.extra_modules.length !== 1 ? 's' : ''} outside this
                program's curriculum — usually a transferred student or an incomplete mapping. Not counted above.
              </div>
              <table className="w-full text-xs">
                <tbody className="divide-y divide-gray-100 dark:divide-ink-700">
                  {detail.extra_modules.map((m) => (
                    <tr key={m.module_id}>
                      <td className="px-3 py-2 font-mono text-gray-500 dark:text-ink-400">{m.module_code || `#${m.module_id}`}</td>
                      <td className="py-2 pr-3 text-gray-800 dark:text-ink-100">{m.module_name || '—'}</td>
                      <td className="py-2 pr-3 text-center font-semibold text-gray-800 dark:text-ink-100">
                        {m.percentage != null ? `${m.percentage}%` : '—'}
                      </td>
                      <td className="py-2 pr-3 text-right text-gray-500 dark:text-ink-400" title={m.updated_at ?? undefined}>
                        {dayOf(m.updated_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg bg-gray-50 p-2 dark:bg-ink-900/40" title={hint}>
      <div className="text-gray-500 dark:text-ink-400">{label}</div>
      <div className="font-medium text-gray-900 dark:text-white">{value}</div>
    </div>
  )
}
