import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import {
  AlertTriangle, CheckCircle2, Download, Info, Loader2, RefreshCw, Search, Stethoscope, UserCheck, X,
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Pagination, { DEFAULT_PER_PAGE_OPTIONS } from '@/components/ui/Pagination'
import { useDebounce } from '@/hooks/useDebounce'
import { cn, timeAgo } from '@/utils/helpers'
import { useAuthStore } from '@/store/authStore'
import { PERMISSIONS } from '@/constants/permissions'
import { StudentAuditModal } from './GraduationAuditPanel'
import {
  graduandService,
  type DegreeClass, type GraduandStatus, type ReadyRow, type ReadySummary,
} from '@/services/graduandService'

const DEGREE_CLASSES: DegreeClass[] = [
  'First Class', 'Upper Second', 'Lower Second', 'Pass', 'Distinction',
]

/** The four graduation statuses. `waiting` also covers a student with no stored
 *  record at all — the API normalises the two to one value. */
const STATUSES: GraduandStatus[] = ['waiting', 'pending', 'approved', 'graduated']

const STATUS_CHIP: Record<GraduandStatus, string> = {
  waiting:   'bg-gray-100 text-gray-700 dark:bg-ink-700 dark:text-ink-300',
  pending:   'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300',
  approved:  'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
  graduated: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300',
}

type StatusFilter = '' | GraduandStatus

const STATUS_TABS: Array<{ key: StatusFilter; label: string; countKey: keyof ReadySummary }> = [
  { key: '',          label: 'Ready to graduate', countKey: 'ready' },
  { key: 'waiting',   label: 'Waiting',           countKey: 'waiting' },
  { key: 'pending',   label: 'Pending',           countKey: 'pending' },
  { key: 'approved',  label: 'Approved',          countKey: 'approved' },
  { key: 'graduated', label: 'Graduated',         countKey: 'graduated' },
]

export default function GraduationRosterPanel() {
  const authUser = useAuthStore((s) => s.user)
  const canWrite = authUser?.permissions?.includes(PERMISSIONS.MANAGE_GRADUANDS)
                || authUser?.role === 'superadmin'

  const qc = useQueryClient()

  const [status, setStatus]            = useState<StatusFilter>('')
  const [department, setDepartment]    = useState('')
  const [option, setOption]            = useState('')
  const [intakeYear, setIntakeYear]    = useState(0)
  const [sort, setSort]                = useState<'name' | 'started' | 'gpa' | 'program'>('name')
  const [includeFailures, setFailures] = useState(false)
  const [searchInput, setSearchInput]  = useState('')
  const [page, setPage]                = useState(1)
  const [perPage, setPerPage]          = useState(DEFAULT_PER_PAGE_OPTIONS[0])

  const [showDiag, setShowDiag]        = useState(false)
  const [selected, setSelected]        = useState<Set<number>>(new Set())
  const [openStudent, setOpenStudent]  = useState<ReadyRow | null>(null)
  const [bulkTarget, setBulkTarget]    = useState<GraduandStatus | null>(null)
  const [bulkClass, setBulkClass]      = useState<DegreeClass | ''>('')
  const [gradDate, setGradDate]        = useState(new Date().toISOString().slice(0, 10))
  const [ceremony, setCeremony]        = useState('')

  const search = useDebounce(searchInput, 400)

  // A filter change invalidates both the page number and the selection —
  // keeping ids selected that are no longer on screen would apply a bulk update
  // to students the user can no longer see.
  const reset = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v); setPage(1); setSelected(new Set())
  }

  const params = useMemo(() => ({
    graduand_status: status || undefined,
    department:      department || undefined,
    std_option:      option || undefined,
    intake_year:     intakeYear || undefined,
    search:          search || undefined,
    clean:           includeFailures ? ('0' as const) : ('1' as const),
    sort,
    page,
    per_page:        perPage,
  }), [status, department, option, intakeYear, search, includeFailures, sort, page, perPage])

  const { data: result, isFetching, isError, error } = useQuery({
    queryKey: ['graduation-roster', params],
    queryFn:  ({ signal }) => graduandService.readyList(params, signal),
    placeholderData: (prev) => prev,
  })

  const errMessage = (error as { response?: { data?: { message?: string } } })
    ?.response?.data?.message
  const roster  = result?.data
  const rows    = useMemo(() => roster?.data ?? [], [roster])
  const summary = roster?.summary

  // Programs narrow to the chosen department so the two selects stay in step.
  const programs = useMemo(() => {
    const all = roster?.programs ?? []
    return department ? all.filter((p) => String(p.department_id) === department) : all
  }, [roster, department])

  // Progress across the batch walk, so a multi-second rebuild shows movement
  // instead of a frozen button.
  const [rebuildDone, setRebuildDone] = useState(0)

  const rebuildMut = useMutation({
    mutationFn: async () => {
      let afterId = 0
      let guard   = 0
      setRebuildDone(0)
      // Bounded so a server that never advances the cursor cannot spin here.
      for (;;) {
        const r = await graduandService.rebuildCompletion(afterId, 2000)
        const b = r.data
        if (!b) throw new Error('Empty rebuild response')
        setRebuildDone(b.students)
        if (b.done) return b
        if (b.last_id <= afterId || ++guard > 200) {
          throw new Error('Rebuild did not advance')
        }
        afterId = b.last_id
      }
    },
    onSuccess: (b) => {
      toast.success(`Recomputed ${b.students.toLocaleString()} students — ${b.complete.toLocaleString()} have finished.`)
      qc.invalidateQueries({ queryKey: ['graduation-roster'] })
      qc.invalidateQueries({ queryKey: ['graduation-audit'] })
    },
    onError: (e: unknown) => toast.error(
      (e as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Could not recompute the graduation figures.',
    ),
  })

  const approveMut = useMutation({
    mutationFn: (studentId: number) =>
      graduandService.bulkStatus({ student_ids: [studentId], status: 'approved' }),
    onSuccess: () => {
      toast.success('Approved for graduation.')
      qc.invalidateQueries({ queryKey: ['graduation-roster'] })
    },
    onError: (e: unknown) => toast.error(
      (e as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Could not approve this student.',
    ),
  })

  const bulkMut = useMutation({
    mutationFn: () => graduandService.bulkStatus({
      student_ids: [...selected],
      status:      bulkTarget!,
      ...(bulkClass ? { degree_class: bulkClass } : {}),
      ...(bulkTarget === 'graduated'
        ? { graduation_date: gradDate, ceremony_number: ceremony || undefined }
        : {}),
    }),
    onSuccess: (r) => {
      toast.success(r.message ?? 'Status updated.')
      setBulkTarget(null); setBulkClass(''); setCeremony('')
      setSelected(new Set())
      qc.invalidateQueries({ queryKey: ['graduation-roster'] })
    },
    onError: (e: unknown) => toast.error(
      (e as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Could not update the selected students.',
    ),
  })

  /* ── Selection ─────────────────────────────────────────────────────────── */

  const pageIds    = rows.map((r) => r.id)
  const allOnPage  = pageIds.length > 0 && pageIds.every((id) => selected.has(id))
  const someOnPage = pageIds.some((id) => selected.has(id)) && !allOnPage

  const toggleAll = () => setSelected((prev) => {
    const next = new Set(prev)
    if (allOnPage) pageIds.forEach((id) => next.delete(id))
    else           pageIds.forEach((id) => next.add(id))
    return next
  })

  const toggleOne = (id: number) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else              next.add(id)
    return next
  })

  /* ── Export ────────────────────────────────────────────────────────────── */

  /** One flat record per visible student — the shape both exports render. */
  const exportRows = useMemo(() => rows.map((r) => ({
    'Reg number':   r.regnumber ?? '',
    'Student':      `${r.lname ?? ''} ${r.fname ?? ''}`.trim(),
    'Program':      r.option_name ?? r.option_acronym ?? '',
    'Department':   r.dep_name ?? '',
    'Registered':   r.intake_year ?? '',
    'Modules':      `${r.recorded}/${r.expected}`,
    'Credits':      `${r.credits_earned}/${r.credits_expected}`,
    'Average':      r.weighted_avg != null ? `${r.weighted_avg}%` : '',
    'Degree class': r.degree_class ?? r.suggested_class ?? '',
    'Status':       r.graduand_status,
  })), [rows])

  const EXPORT_TITLE = 'Graduation list'

  /** The filters in force, so an exported file explains its own contents. */
  const exportMeta = (): string[] => [
    `Status: ${status || 'all'}`,
    department
      ? `Department: ${roster?.departments.find((d) => String(d.id) === department)?.name ?? department}`
      : null,
    option
      ? `Program: ${programs.find((p) => String(p.id) === option)?.name ?? option}`
      : null,
    intakeYear ? `Registered: ${intakeYear}` : null,
    `Students: ${rows.length}`,
    `Figures computed: ${roster?.computed_at ?? 'never'}`,
  ].filter((v): v is string => v !== null)

  const handleExcel = () => {
    if (exportRows.length === 0) { toast.error('Nothing to export.'); return }
    const headers = Object.keys(exportRows[0])
    const aoa: (string | number)[][] = [
      [EXPORT_TITLE],
      exportMeta(),
      [],
      headers,
      ...exportRows.map((r) => headers.map((h) => (r as Record<string, string | number>)[h] ?? '')),
    ]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = [{ wch: 16 }, { wch: 30 }, { wch: 30 }, { wch: 26 }, { wch: 11 },
                   { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 15 }, { wch: 11 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Graduation list')
    XLSX.writeFile(wb, `graduation-list-${status || 'all'}.xlsx`)
    toast.success(`Exported ${exportRows.length} students.`)
  }

  const handlePdf = () => {
    if (exportRows.length === 0) { toast.error('Nothing to export.'); return }
    // Laid out by hand rather than screenshotted — a roster runs to hundreds of
    // rows and an image of the scroll box would be one illegible page.
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()
    const M = 32
    const cols = [
      { key: 'Reg number',   x: M,       w: 88 },
      { key: 'Student',      x: M + 92,  w: 150 },
      { key: 'Program',      x: M + 246, w: 150 },
      { key: 'Registered',   x: M + 400, w: 58 },
      { key: 'Modules',      x: M + 462, w: 52 },
      { key: 'Credits',      x: M + 518, w: 58 },
      { key: 'Average',      x: M + 580, w: 50 },
      { key: 'Degree class', x: M + 634, w: 86 },
      { key: 'Status',       x: M + 724, w: 62 },
    ]
    let y = M

    doc.setFont('helvetica', 'bold'); doc.setFontSize(13)
    doc.text(EXPORT_TITLE, M, y); y += 16
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5)
    doc.text(exportMeta().join('   '), M, y); y += 18

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
        const raw = String((r as Record<string, string | number>)[c.key] ?? '')
        // jsPDF does not wrap: clip to the column so text never overlaps.
        doc.text(doc.splitTextToSize(raw, c.w)[0] ?? '', c.x, y)
      })
      y += 13
    })

    doc.save(`graduation-list-${status || 'all'}.pdf`)
    toast.success(`Exported ${exportRows.length} students.`)
  }

  const selectCls = 'rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-ink-700 dark:bg-ink-900 dark:text-white'

  return (
    <div className="space-y-5">
      {/* What this list is, how fresh it is, and how to get it out */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-ink-700 dark:bg-ink-800">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="flex max-w-3xl items-start gap-1.5 text-xs text-gray-500 dark:text-ink-400">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Every student with a mark recorded for all of their program's modules
            {!includeFailures && ' and no outstanding failure'}. Figures come from the stored
            completion snapshot, so this list loads instantly — recompute it after a marks import
            to pick up new results.
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <span className="mr-1 text-xs text-gray-400 dark:text-ink-500">
              {roster?.computed_at
                ? `Computed ${timeAgo(roster.computed_at)}`
                : isError ? 'Status unknown' : 'Never computed'}
            </span>
            {canWrite && (
              <button
                onClick={() => setShowDiag(true)}
                className="btn-ghost btn-sm"
                title="Why is this list empty? Shows the snapshot state, the data it is built from, and which migrations this environment is missing."
              >
                <Stethoscope className="h-3.5 w-3.5" /> Diagnose
              </button>
            )}
            <button onClick={handleExcel} className="btn-ghost btn-sm" title="Download the rows below as XLSX">
              <Download className="h-3.5 w-3.5" /> Excel
            </button>
            <button onClick={handlePdf} className="btn-ghost btn-sm" title="Download the rows below as PDF">
              <Download className="h-3.5 w-3.5" /> PDF
            </button>
            {canWrite && (
              <button
                onClick={() => rebuildMut.mutate()}
                disabled={rebuildMut.isPending}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-ink-700 dark:text-ink-200 dark:hover:bg-ink-700/50"
              >
                <RefreshCw className={cn('h-4 w-4', rebuildMut.isPending && 'animate-spin')} />
                {rebuildMut.isPending
                  ? `Recomputing… ${rebuildDone ? rebuildDone.toLocaleString() : ''}`
                  : 'Recompute'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Lifecycle counters, doubling as filters */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {STATUS_TABS.map((t) => {
          const active = status === t.key
          return (
            <button
              key={t.key || 'all'}
              onClick={() => reset(setStatus)(t.key)}
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
                {summary ? summary[t.countKey] : '—'}
              </div>
              <div className="text-xs text-gray-500 dark:text-ink-400">{t.label}</div>
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-ink-700 dark:bg-ink-800">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-ink-300">Department</label>
          <select
            value={department}
            // Clearing the department would strand a program filter belonging to
            // a different one, so the program resets alongside it.
            onChange={(e) => { reset(setDepartment)(e.target.value); setOption('') }}
            className={cn(selectCls, 'min-w-[13rem]')}
          >
            <option value="">All departments</option>
            {(roster?.departments ?? []).map((d) => (
              <option key={d.id} value={String(d.id)}>{d.name} ({d.students})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-ink-300">Program</label>
          <select
            value={option}
            onChange={(e) => reset(setOption)(e.target.value)}
            className={cn(selectCls, 'min-w-[13rem]')}
          >
            <option value="">All programs</option>
            {programs.map((p) => (
              <option key={p.id} value={String(p.id)}>{p.name ?? p.acro} ({p.students})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-ink-300">Registered in</label>
          <select
            value={intakeYear}
            onChange={(e) => reset(setIntakeYear)(Number(e.target.value))}
            className={selectCls}
          >
            <option value={0}>Any year</option>
            {(roster?.intake_years ?? []).map((y) => (
              <option key={y.year} value={y.year}>{y.year} ({y.students})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-ink-300">Sort by</label>
          <select value={sort} onChange={(e) => reset(setSort)(e.target.value as typeof sort)} className={selectCls}>
            <option value="name">Student</option>
            <option value="program">Program</option>
            <option value="gpa">Highest average</option>
            <option value="started">Longest enrolled</option>
          </select>
        </div>

        <div className="min-w-[12rem] flex-1">
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

        <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-gray-700 dark:text-ink-200">
          <input
            type="checkbox"
            checked={includeFailures}
            onChange={(e) => reset(setFailures)(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          Include students with a failed module
        </label>
      </div>

      {/* Bulk action bar — only while something is selected */}
      {canWrite && selected.size > 0 && (
        <div className="sticky top-12 z-20 flex flex-wrap items-center gap-3 rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 shadow-sm dark:border-blue-800 dark:bg-blue-900/30">
          <span className="text-sm font-medium text-blue-900 dark:text-blue-200">
            {selected.size} student{selected.size !== 1 ? 's' : ''} selected
          </span>
          <button
            onClick={() => setSelected(new Set())}
            className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline dark:text-blue-300"
          >
            <X className="h-3 w-3" /> Clear
          </button>
          <span className="ml-auto text-sm text-blue-900 dark:text-blue-200">Set status to</span>
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => {
                setBulkTarget(s)
                setBulkClass('')
                setGradDate(new Date().toISOString().slice(0, 10))
                setCeremony('')
              }}
              className={cn(
                'rounded-lg border border-transparent px-3 py-1.5 text-xs font-medium capitalize transition-opacity hover:opacity-80',
                STATUS_CHIP[s],
              )}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {isError && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{errMessage ?? 'Could not load the graduation list.'}</span>
        </div>
      )}

      {/* Roster */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-ink-700 dark:bg-ink-800">
        {isFetching && (
          <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-2 text-xs text-gray-500 dark:border-ink-700 dark:text-ink-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </div>
        )}
        <table className="w-full text-sm">
          {/* Pins under the h-12 tab bar, same as the audit table. */}
          <thead className={cn(
            '[&_th]:sticky [&_th]:z-10 [&_th]:top-12',
            '[&_th]:bg-gray-50 dark:[&_th]:bg-ink-900',
            '[&_th]:border-b [&_th]:border-gray-200 dark:[&_th]:border-ink-700',
            '[&_th]:px-4 [&_th]:py-3 [&_th]:font-semibold [&_th]:text-gray-700 dark:[&_th]:text-ink-200',
            '[&_th:first-child]:rounded-tl-xl [&_th:last-child]:rounded-tr-xl',
          )}>
            <tr>
              {canWrite && (
                <th className="w-10 text-left">
                  <input
                    type="checkbox"
                    checked={allOnPage}
                    ref={(el) => { if (el) el.indeterminate = someOnPage }}
                    onChange={toggleAll}
                    aria-label="Select all on this page"
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
              )}
              <th className="text-left">Student</th>
              <th className="text-left">Program</th>
              <th className="text-center">Registered</th>
              <th className="text-center">Modules</th>
              <th className="text-center">Credits</th>
              <th className="text-center">Average</th>
              <th className="text-left">Degree class</th>
              <th className="text-center">Status</th>
              {canWrite && <th className="text-center">Approve</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-ink-700">
            {rows.length === 0 && !isFetching && (
              <tr>
                <td colSpan={canWrite ? 10 : 8} className="px-4 py-12 text-center text-gray-400 dark:text-ink-500">
                  {isError
                    ? 'The list could not be loaded — see the message above.'
                    : roster?.computed_at
                      ? 'No students match this filter.'
                      : 'The completion snapshot has not been computed yet — use Recompute above.'}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.id}
                onClick={() => setOpenStudent(r)}
                className={cn(
                  'cursor-pointer hover:bg-gray-50 dark:hover:bg-ink-700/50',
                  selected.has(r.id) && 'bg-blue-50/60 dark:bg-blue-900/20',
                )}
              >
                {canWrite && (
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggleOne(r.id)}
                      aria-label={`Select ${r.lname ?? ''} ${r.fname ?? ''}`}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                )}
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900 dark:text-white">{r.lname} {r.fname}</div>
                  <div className="text-xs text-gray-500 dark:text-ink-400">{r.regnumber}</div>
                </td>
                <td className="px-4 py-3 text-xs text-gray-600 dark:text-ink-300">
                  <div className="flex items-center gap-1">
                    {r.option_name ?? r.option_acronym ?? '—'}
                    {r.curriculum_suspect && (
                      <span title="This program maps to an implausible number of modules — treat the completion figure with caution.">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                      </span>
                    )}
                  </div>
                  {r.dep_name && <div className="text-gray-400 dark:text-ink-500">{r.dep_name}</div>}
                </td>
                <td className="px-4 py-3 text-center text-xs text-gray-600 dark:text-ink-300">
                  {r.intake_year ?? '—'}
                </td>
                <td className="px-4 py-3 text-center text-gray-700 dark:text-ink-200">
                  {r.recorded}/{r.expected}
                  {r.failed > 0 && (
                    <div className="text-xs font-medium text-red-500 dark:text-red-400">{r.failed} failed</div>
                  )}
                </td>
                <td className="px-4 py-3 text-center text-xs text-gray-600 dark:text-ink-300">
                  {r.credits_earned}/{r.credits_expected}
                </td>
                <td className="px-4 py-3 text-center font-semibold text-gray-800 dark:text-ink-100">
                  {r.weighted_avg != null ? `${r.weighted_avg}%` : '—'}
                </td>
                <td className="px-4 py-3 text-xs text-gray-700 dark:text-ink-200">
                  {/* Stored class if the student has one, otherwise the class
                      their weighted average earns. Both read the same — the
                      status column already says whether it has been committed. */}
                  {r.degree_class ?? r.suggested_class ?? '—'}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={cn(
                    'inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize',
                    STATUS_CHIP[r.graduand_status],
                  )}>
                    {r.graduand_status}
                  </span>
                </td>
                {canWrite && (
                  <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    {r.graduand_status === 'approved' || r.graduand_status === 'graduated' ? (
                      <CheckCircle2 className="mx-auto h-4 w-4 text-green-500 dark:text-green-400" />
                    ) : (
                      <button
                        onClick={() => approveMut.mutate(r.id)}
                        disabled={approveMut.isPending}
                        title={`Approve ${r.lname ?? ''} ${r.fname ?? ''} for graduation`}
                        className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        <UserCheck className="h-3 w-3" /> Approve
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {roster && (
        <Pagination
          currentPage={page}
          lastPage={roster.last_page}
          total={roster.total}
          perPage={perPage}
          onPageChange={(p) => { setPage(p); setSelected(new Set()) }}
          perPageOptions={DEFAULT_PER_PAGE_OPTIONS}
          onPerPageChange={(n) => { setPerPage(n); setPage(1); setSelected(new Set()) }}
        />
      )}

      {/* Same curriculum drill-down the audit tab uses */}
      <StudentAuditModal row={openStudent} onClose={() => setOpenStudent(null)} />

      <DiagnosticsModal open={showDiag} onClose={() => setShowDiag(false)} />

      {/* Bulk status confirmation */}
      <Modal
        open={bulkTarget !== null}
        title={`Set ${selected.size} student${selected.size !== 1 ? 's' : ''} to ${bulkTarget ?? ''}`}
        onClose={() => setBulkTarget(null)}
      >
        <div className="space-y-4 p-1">
          <p className="text-sm text-gray-600 dark:text-ink-300">
            {bulkTarget === 'waiting'
              ? 'These students go back to the waiting pool. Any graduation date already recorded is kept.'
              : 'The graduation record is created for anyone who does not have one yet.'}
          </p>

          {bulkTarget !== 'waiting' && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-ink-300">Degree class</label>
              <select
                value={bulkClass}
                onChange={(e) => setBulkClass(e.target.value as DegreeClass | '')}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-ink-700 dark:bg-ink-900 dark:text-white"
              >
                <option value="">Classify each from their own average</option>
                {DEGREE_CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <p className="mt-1 text-xs text-gray-400 dark:text-ink-500">
                Pick a class only to override every selected student with the same one.
              </p>
            </div>
          )}

          {bulkTarget === 'graduated' && (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-ink-300">Graduation date</label>
                <input
                  type="date" value={gradDate} onChange={(e) => setGradDate(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-ink-700 dark:bg-ink-900 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-ink-300">Ceremony (optional)</label>
                <input
                  value={ceremony} onChange={(e) => setCeremony(e.target.value)}
                  placeholder="e.g. 26th Graduation Ceremony"
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-ink-700 dark:bg-ink-900 dark:text-white"
                />
              </div>
            </>
          )}

          <div className="flex justify-end gap-2">
            <button onClick={() => setBulkTarget(null)} className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50 dark:border-ink-700 dark:text-ink-200 dark:hover:bg-ink-700/50">
              Cancel
            </button>
            <button
              onClick={() => bulkMut.mutate()} disabled={bulkMut.isPending}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {bulkMut.isPending ? 'Updating…' : `Set to ${bulkTarget ?? ''}`}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

/* ── Diagnostics ───────────────────────────────────────────────────────────── */

/**
 * Answers "why is this environment showing zeros". Deployment ships code on
 * push while migrations run from a separate manual workflow, so live can be
 * running new code over an older schema or over un-consolidated data — and
 * every one of those looks identical from the list itself.
 */
function DiagnosticsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: result, isLoading, isError } = useQuery({
    queryKey: ['graduation-diagnostics'],
    queryFn:  ({ signal }) => graduandService.completionDiagnostics(signal),
    enabled:  open,
  })
  const d = result?.data

  /**
   * Only conclusions the counts actually prove.
   *
   * Two tempting checks are deliberately absent. The schema_migrations ledger
   * reports MISSING for anything applied by hand, which is how 125-127 were
   * applied — so it is shown as information, not as a fault. And "legacy marks
   * outnumber module_marks" proves nothing either: migration 125 copies rows
   * and deletes none, and it remaps module ids through module_id_map, so
   * neither a row-count comparison nor a raw id join survives contact with it.
   */
  const problems = useMemo(() => {
    if (!d) return []
    const out: string[] = []

    if (!d.snapshot.exists) {
      out.push('The graduation_audit table does not exist here — migration 2026_08_12_128 has not been applied.')
      return out
    }
    if ((d.snapshot.rows_total ?? 0) === 0) {
      out.push('The snapshot has no rows — press Recompute to build it.')
      return out
    }
    if ((d.snapshot.with_started_on ?? 0) === 0) {
      out.push('No student resolved a start date, so every date-bounded list is empty. Check that regnumbers follow the 1CURyy… pattern.')
    }
    if ((d.sources.module_programs ?? 0) === 0) {
      out.push('module_programs is empty — no program has a curriculum, so nothing can be judged complete.')
    } else if ((d.snapshot.with_curriculum ?? 0) === 0) {
      out.push('No student is attached to a program that has modules mapped to it — check student.std_option against options.id.')
    }
    if ((d.sources.module_marks ?? 0) === 0) {
      out.push('module_marks is empty in this environment.')
    } else if ((d.snapshot.with_any_mark ?? 0) === 0) {
      out.push('Marks exist but not one of them lines up with a student\u2019s own curriculum — the marks are not reaching the audit.')
    }

    const mm = d.sources.module_marks ?? 0
    const ok = d.sources.module_marks_matching_a_student ?? 0
    if (mm > 0 && ok < mm) {
      const lost = mm - ok
      out.push(`${lost.toLocaleString()} of ${mm.toLocaleString()} mark rows match no student regnumber, so they are invisible to the audit.`)
    }
    return out
  }, [d])

  const Row = ({ k, v, bad }: { k: string; v: React.ReactNode; bad?: boolean }) => (
    <div className="flex justify-between gap-4 border-b border-gray-100 py-1 last:border-0 dark:border-ink-700">
      <span className="text-gray-500 dark:text-ink-400">{k}</span>
      <span className={cn('font-medium tabular-nums', bad ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white')}>{v}</span>
    </div>
  )

  return (
    <Modal open={open} title="Graduation data diagnostics" onClose={onClose} size="lg">
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-400 dark:text-ink-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking…
        </div>
      ) : isError || !d ? (
        <p className="py-8 text-center text-sm text-red-600 dark:text-red-400">
          Could not read diagnostics from this environment.
        </p>
      ) : (
        <div className="space-y-5 p-1 text-xs">
          {problems.length > 0 ? (
            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4" /> What is wrong here
              </div>
              <ul className="list-disc space-y-1 pl-5">
                {problems.map((p) => <li key={p}>{p}</li>)}
              </ul>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 font-medium text-green-800 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-300">
              <CheckCircle2 className="h-4 w-4" /> No problems detected — the data behind this list looks healthy.
            </div>
          )}

          <div>
            <h4 className="mb-1 font-semibold text-gray-700 dark:text-ink-200">Snapshot</h4>
            {d.snapshot.exists ? (
              <>
                <Row k="Students recorded"          v={(d.snapshot.rows_total ?? 0).toLocaleString()} bad={(d.snapshot.rows_total ?? 0) === 0} />
                <Row k="…with a start date"         v={(d.snapshot.with_started_on ?? 0).toLocaleString()} />
                <Row k="…assigned to a program"     v={(d.snapshot.with_program ?? 0).toLocaleString()} />
                <Row k="…whose program has modules" v={(d.snapshot.with_curriculum ?? 0).toLocaleString()} />
                <Row k="…with at least one mark"    v={(d.snapshot.with_any_mark ?? 0).toLocaleString()} bad={(d.snapshot.with_any_mark ?? 0) === 0} />
                <Row k="…fully recorded"            v={(d.snapshot.complete ?? 0).toLocaleString()} />
                <Row k="Computed"                   v={d.snapshot.computed_at ?? 'never'} bad={!d.snapshot.computed_at} />
              </>
            ) : (
              <Row k="graduation_audit table" v="missing" bad />
            )}
          </div>

          <div>
            <h4 className="mb-1 font-semibold text-gray-700 dark:text-ink-200">Data it is built from</h4>
            {Object.entries(d.sources).map(([k, v]) => (
              <Row key={k} k={k.replace(/_/g, ' ')} v={v < 0 ? 'unavailable' : v.toLocaleString()} bad={v === 0 || v < 0} />
            ))}
            {Object.entries(d.legacy).map(([k, v]) => (
              <Row key={k} k={`legacy "${k}" table`} v={v === null ? 'not present' : v.toLocaleString()} />
            ))}
          </div>

          <div>
            <h4 className="mb-1 font-semibold text-gray-700 dark:text-ink-200">Migrations</h4>
            <p className="mb-1 text-gray-400 dark:text-ink-500">
              Ledger status only. A migration applied by hand shows MISSING here even though its
              changes are in place, so treat this as a hint rather than a verdict.
            </p>
            {Object.entries(d.migrations).map(([f, status]) => (
              <Row key={f} k={f.replace(/^2026_08_12_/, '').replace(/\.sql$/, '')} v={status} />
            ))}
          </div>
        </div>
      )}
    </Modal>
  )
}
