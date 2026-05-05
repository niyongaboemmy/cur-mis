import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import {
  Files, Search, ChevronRight, ArrowLeft, ArrowRight, Filter,
  CheckCircle2, Clock, Sparkles, AlertCircle, GraduationCap, FileText,
  Download, FileSpreadsheet,
} from 'lucide-react'
import { applicationAdminService, intakeService } from '@/services/admissionService'
import { ApplicationStatus } from '@/types/admission'
import SearchableSelect from '@/components/ui/SearchableSelect'
import ApplicationsDashboard from './ApplicationsDashboard'

// On the admin side we relabel `submitted` → `Pending` so the queue
// is framed as "awaiting review" rather than the raw state-machine name.
const STATUS_LABEL: Record<string, string> = {
  submitted:              'Pending',
  documents_under_review: 'Docs under review',
  documents_verified:     'Docs verified',
  documents_rejected:     'Docs rejected',
  requested_changes:      'Changes requested',
  offered:                'Offered',
  offer_accepted:         'Fee paid',
  offer_declined:         'Declined',
  enrolled:               'Enrolled',
  withdrawn:              'Withdrawn',
  draft:                  'Draft',
}

const STATUSES: { value: ApplicationStatus | ''; label: string }[] = [
  { value: '',                                     label: 'All statuses' },
  { value: ApplicationStatus.SUBMITTED,            label: 'Pending' },
  { value: ApplicationStatus.DOCUMENTS_UNDER_REVIEW, label: 'Docs under review' },
  { value: ApplicationStatus.DOCUMENTS_VERIFIED,   label: 'Docs verified' },
  { value: ApplicationStatus.DOCUMENTS_REJECTED,   label: 'Docs rejected' },
  { value: ApplicationStatus.REQUESTED_CHANGES,    label: 'Changes requested' },
  { value: ApplicationStatus.OFFERED,              label: 'Offered' },
  { value: ApplicationStatus.OFFER_ACCEPTED,       label: 'Fee paid' },
  { value: ApplicationStatus.OFFER_DECLINED,       label: 'Declined' },
  { value: ApplicationStatus.ENROLLED,             label: 'Enrolled' },
  { value: ApplicationStatus.WITHDRAWN,            label: 'Withdrawn' },
]

const STATUS_TONE: Record<string, string> = {
  submitted:              'chip-primary',
  documents_under_review: 'chip-warning',
  documents_verified:     'chip-success',
  documents_rejected:     'chip-danger',
  requested_changes:      'chip-warning',
  offered:                'chip-success',
  offer_accepted:         'chip-success',
  offer_declined:         'chip-soft',
  enrolled:               'chip-success',
  withdrawn:              'chip-soft',
  draft:                  'chip-soft',
}

export default function ApplicationsListPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  // Default to "pending" (submitted) — that's the queue admins act on first.
  const [status, setStatus] = useState<ApplicationStatus | ''>(ApplicationStatus.SUBMITTED)
  const [intake, setIntake] = useState('')
  const [campusId, setCampusId] = useState<number | ''>('')
  const [mode, setMode] = useState('')
  const [q, setQ] = useState('')
  const [activeTab, setActiveTab] = useState<'list' | 'dashboard'>('list')

  const intakesQ = useQuery({ queryKey: ['admin', 'intakes'], queryFn: () => intakeService.list() })
  const intakes = intakesQ.data?.data ?? []

  const listQ = useQuery({
    queryKey: ['admin', 'applications', page, status, intake, campusId, mode, q],
    queryFn: () => applicationAdminService.list({
      page, per_page: 15,
      status: status || undefined,
      intake: intake || undefined,
      campus_id: campusId || undefined,
      mode_of_study: mode || undefined,
      q: q || undefined,
    }),
    placeholderData: (prev) => prev,
  })

  const rows = listQ.data?.data?.data ?? []
  const total = listQ.data?.data?.total ?? 0
  const last  = listQ.data?.data?.last_page ?? 1

  // Server-side aggregate stats (independent of pagination/filters)
  const statsQ = useQuery({
    queryKey: ['admin', 'applications', 'stats'],
    queryFn: () => applicationAdminService.getStats(),
  })

  const stats = useMemo(() => {
    const byStatus = (statsQ.data?.data?.by_status ?? []) as { status: string; cnt: number }[]
    const counts: Record<string, number> = {}
    for (const r of byStatus) counts[r.status] = Number(r.cnt) || 0
    const totalAll = statsQ.data?.data?.total ?? Object.values(counts).reduce((a, b) => a + b, 0)
    const submitted = counts.submitted ?? 0
    const inReview = (counts.documents_under_review ?? 0) + (counts.documents_verified ?? 0)
    const offers = (counts.offered ?? 0) + (counts.offer_accepted ?? 0)
    const enrolled = counts.enrolled ?? 0
    const actionNeeded = (counts.documents_rejected ?? 0) + (counts.requested_changes ?? 0)
    return { totalAll, submitted, inReview, offers, enrolled, actionNeeded }
  }, [statsQ.data])

  // Filter options use the full catalogue (every active campus / every
  // canonical mode) so admins can still filter by values that don't yet
  // appear on any application. Counts are merged in when present.
  const campusOptions = useMemo(() => {
    const all = ((statsQ.data?.data as any)?.all_campuses ?? []) as { id: number; label: string }[]
    const counts = new Map<number, number>()
    for (const r of ((statsQ.data?.data as any)?.by_campus ?? []) as { id: number; cnt: number }[]) {
      counts.set(Number(r.id), Number(r.cnt) || 0)
    }
    return all.map((c) => ({ id: Number(c.id), label: c.label, cnt: counts.get(Number(c.id)) ?? 0 }))
  }, [statsQ.data])

  const modeOptions = useMemo(() => {
    const all = ((statsQ.data?.data as any)?.all_modes ?? []) as { label: string }[]
    const counts = new Map<string, number>()
    for (const r of ((statsQ.data?.data as any)?.by_mode ?? []) as { label: string; cnt: number }[]) {
      counts.set(String(r.label), Number(r.cnt) || 0)
    }
    return all.map((m) => ({ label: m.label, cnt: counts.get(m.label) ?? 0 }))
  }, [statsQ.data])

  // Build the export URL (PDF / Excel) so it carries the active filters.
  const buildExportUrl = (format: 'pdf' | 'xlsx') => {
    const params = new URLSearchParams({ format })
    if (status) params.set('status', status)
    if (intake) params.set('intake', intake)
    if (campusId !== '') params.set('campus_id', String(campusId))
    if (mode) params.set('mode_of_study', mode)
    if (q) params.set('search', q)
    return applicationAdminService.exportUrl(params.toString())
  }

  const statusOptions = STATUSES.filter(s => s.value !== '').map(s => ({
    value: s.value,
    label: s.label
  }))

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] font-bold text-brand mb-1">Admissions</p>
          <h1 className="text-[26px] sm:text-[30px] font-black text-ink-900 dark:text-white tracking-tight leading-tight">
            Applications
          </h1>
          <p className="text-[13px] text-ink-500 mt-1">
            Review submissions, verify documents, and manage admission decisions across all intakes.
          </p>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex items-center gap-2 p-1 bg-ink-100 dark:bg-ink-800 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`px-6 py-2 text-[13px] font-bold rounded-lg transition-all ${
            activeTab === 'dashboard'
              ? 'bg-white dark:bg-ink-900 text-brand shadow-sm'
              : 'text-ink-500 hover:text-ink-700'
          }`}
        >
          Dashboard
        </button>
        <button
          onClick={() => setActiveTab('list')}
          className={`px-6 py-2 text-[13px] font-bold rounded-lg transition-all ${
            activeTab === 'list'
              ? 'bg-white dark:bg-ink-900 text-brand shadow-sm'
              : 'text-ink-500 hover:text-ink-700'
          }`}
        >
          Applications List
        </button>
      </div>

      {activeTab === 'dashboard' ? (
        <ApplicationsDashboard />
      ) : (
        <>
          {/* Stats strip — clicking a tile applies the matching status filter. */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatTile
              icon={FileText} label="Total" value={stats.totalAll}
              accent="bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
              active={status === ''}
              onClick={() => { setStatus(''); setPage(1) }}
            />
            <StatTile
              icon={CheckCircle2} label="Pending" value={stats.submitted}
              accent="bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
              active={status === ApplicationStatus.SUBMITTED}
              onClick={() => { setStatus(ApplicationStatus.SUBMITTED); setPage(1) }}
            />
            <StatTile
              icon={Clock} label="In Review" value={stats.inReview}
              accent="bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
              active={status === ApplicationStatus.DOCUMENTS_UNDER_REVIEW}
              onClick={() => { setStatus(ApplicationStatus.DOCUMENTS_UNDER_REVIEW); setPage(1) }}
            />
            <StatTile
              icon={Sparkles} label="Offers" value={stats.offers}
              accent="bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
              highlight={stats.offers > 0}
              active={status === ApplicationStatus.OFFERED}
              onClick={() => { setStatus(ApplicationStatus.OFFERED); setPage(1) }}
            />
            <StatTile
              icon={GraduationCap} label="Enrolled" value={stats.enrolled}
              accent="bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
              active={status === ApplicationStatus.ENROLLED}
              onClick={() => { setStatus(ApplicationStatus.ENROLLED); setPage(1) }}
            />
            <StatTile
              icon={AlertCircle} label="Action" value={stats.actionNeeded}
              accent="bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300"
              highlight={stats.actionNeeded > 0}
              active={status === ApplicationStatus.REQUESTED_CHANGES}
              onClick={() => { setStatus(ApplicationStatus.REQUESTED_CHANGES); setPage(1) }}
            />
          </div>

          <section className="card p-0 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Toolbar */}
            <div className="flex items-center gap-3 flex-wrap border-b border-ink-100 p-4">
              <div className="flex items-center gap-2">
                <Files className="w-5 h-5 text-brand" />
                <div>
                  <h2 className="section-title">Applications</h2>
                  <p className="section-sub">{total.toLocaleString()} match{total === 1 ? '' : 'es'} current filters</p>
                </div>
              </div>

              <div className="flex-1" />

              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-400 pointer-events-none" />
                <input
                  value={q}
                  onChange={(e) => { setQ(e.target.value); setPage(1) }}
                  placeholder="Search by name, email, number…"
                  className="input pl-8 w-64"
                />
              </div>
              <div className="w-56">
                <SearchableSelect
                  options={statusOptions}
                  value={status}
                  onChange={(val) => { setStatus(val as any); setPage(1) }}
                  allLabel="All statuses"
                  placeholder="Filter by status"
                />
              </div>
              <div className="relative">
                <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-400 pointer-events-none" />
                <select
                  className="input pl-8 w-40"
                  value={intake}
                  onChange={(e) => { setIntake(e.target.value); setPage(1) }}
                >
                  <option value="">All intakes</option>
                  {intakes.map((i: any) => (
                    <option key={i.id} value={i.name}>{i.name}</option>
                  ))}
                </select>
              </div>
              <div className="relative">
                <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-400 pointer-events-none" />
                <select
                  className="input pl-8 w-44"
                  value={campusId === '' ? '' : String(campusId)}
                  onChange={(e) => { setCampusId(e.target.value ? Number(e.target.value) : ''); setPage(1) }}
                >
                  <option value="">All campuses</option>
                  {campusOptions.map((c) => (
                    <option key={c.id} value={c.id}>{c.label} ({c.cnt})</option>
                  ))}
                </select>
              </div>
              <div className="relative">
                <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-400 pointer-events-none" />
                <select
                  className="input pl-8 w-44"
                  value={mode}
                  onChange={(e) => { setMode(e.target.value); setPage(1) }}
                >
                  <option value="">All modes</option>
                  {modeOptions.map((m) => (
                    <option key={m.label} value={m.label}>{m.label} ({m.cnt})</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5 ml-1 pl-3 border-l border-ink-100 dark:border-ink-800">
                <a
                  href={buildExportUrl('xlsx')}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary btn-sm"
                  title="Export current filters to Excel"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
                </a>
                <a
                  href={buildExportUrl('pdf')}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary btn-sm"
                  title="Export current filters to PDF"
                >
                  <Download className="w-3.5 h-3.5" /> PDF
                </a>
              </div>
            </div>

      {listQ.isLoading ? (
        <Skel />
      ) : rows.length === 0 ? (
        <p className="p-10 text-center text-ink-500 text-[13px]">No applications match your filters.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>App #</th>
                  <th>Applicant</th>
                  <th>Program</th>
                  <th>Campus</th>
                  <th>Mode</th>
                  <th>Intake</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr
                    key={a.id}
                    onClick={() => navigate(`/admin/admissions/applications/${a.id}`)}
                    className="cursor-pointer hover:bg-ink-50/60 dark:hover:bg-ink-800/40 transition-colors"
                  >
                    <td className="font-mono text-[12px]">{a.application_number}</td>
                    <td>
                      <p className="font-medium text-ink-900 dark:text-ink-100">{a.first_name} {a.last_name}</p>
                      <p className="text-[11.5px] text-ink-500">{a.email}</p>
                    </td>
                    <td>{(a as any).program_name ?? a.department_name ?? `#${a.department_id}`}</td>
                    <td>{(a as any).campus_name ?? '—'}</td>
                    <td>{(a as any).mode_of_study ?? '—'}</td>
                    <td>{a.intake}</td>
                    <td><span className={STATUS_TONE[a.status] ?? 'chip-soft'}>{STATUS_LABEL[a.status] ?? a.status}</span></td>
                    <td>{fmt(a.submitted_at ?? a.created_at)}</td>
                    <td className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Link to={`/admin/admissions/applications/${a.id}`} className="btn-secondary btn-sm">
                        View <ChevronRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} last={last} onPage={setPage} />
        </>
      )}
          </section>
        </>
      )}
    </div>
  )
}

function StatTile({
  icon: Icon, label, value, accent, highlight, active, onClick,
}: { icon: any; label: string; value: number; accent: string; highlight?: boolean; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`p-3.5 rounded-2xl border flex items-center gap-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${
        active
          ? 'border-primary-400 dark:border-primary-600 bg-white dark:bg-ink-900 shadow-md ring-2 ring-primary-200 dark:ring-primary-900/40'
          : highlight
            ? 'border-primary-200 dark:border-primary-800 bg-white dark:bg-ink-900 shadow-sm'
            : 'border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/40'
      }`}
    >
      <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${accent}`}>
        <Icon className="w-4 h-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider font-bold text-ink-400 leading-none">{label}</p>
        <p className="text-[18px] font-black text-ink-900 dark:text-white leading-none mt-1">{value}</p>
      </div>
    </button>
  )
}

function fmt(v: string | null | undefined) {
  if (!v) return '—'
  try {
    const d = new Date(v.replace(' ', 'T'))
    return isNaN(d.getTime()) ? v : d.toLocaleDateString()
  } catch { return v }
}

function Skel() {
  return (
    <div className="p-6 space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-10 rounded-md bg-ink-50 dark:bg-ink-700/30 animate-pulse" />
      ))}
    </div>
  )
}

function Pager({ page, last, onPage }: { page: number; last: number; onPage: (p: number) => void }) {
  if (last <= 1) return null
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-ink-100 text-[12.5px] text-ink-500">
      <span>Page {page} of {last}</span>
      <div className="flex gap-1">
        <button className="btn-secondary btn-sm" onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1}>
          <ArrowLeft className="w-3 h-3" /> Prev
        </button>
        <button className="btn-secondary btn-sm" onClick={() => onPage(Math.min(last, page + 1))} disabled={page >= last}>
          Next <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}
