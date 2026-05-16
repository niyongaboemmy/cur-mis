import { useState, useMemo, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import {
  Files, Search, ChevronRight, ArrowLeft, ArrowRight, Filter,
  CheckCircle2, Clock, Sparkles, AlertCircle, GraduationCap, FileText,
  Download, FileSpreadsheet, StickyNote, X, MessageSquarePlus,
  EyeOff, RotateCcw, Upload,
} from 'lucide-react'
import { applicationAdminService, intakeService } from '@/services/admissionService'
import { ApplicationStatus, ApplicationPendingNote } from '@/types/admission'
import SearchableSelect from '@/components/ui/SearchableSelect'
import ModalPortal from '@/components/ui/ModalPortal'
import ApplicationsDashboard from './ApplicationsDashboard'
import { useAuthStore } from '@/store/authStore'

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
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  // The "shared why-pending notes" panel — opened from a row's notes badge.
  const [notesAppId, setNotesAppId] = useState<number | null>(null)
  const [notesAppLabel, setNotesAppLabel] = useState<string>('')
  // Visibility scoping (Task 1.7) — filter applicants by programme level
  // (Undergraduate / PGDE / Masters / etc.).
  const [levelId, setLevelId] = useState<number | ''>('')
  // Task 1.8 — advanced applicant filters.
  const [gender, setGender]               = useState<string>('')
  const [paymentStatus, setPaymentStatus] = useState<string>('')
  const [paidFirst, setPaidFirst]         = useState(false)
  // Task 1.9 — toggle to view only the hidden applications.
  const [showHidden, setShowHidden]       = useState(false)
  // Task 1.12 — bulk upload modal state.
  const [showBulkUpload, setShowBulkUpload] = useState(false)
  // Default to "pending" (submitted) — that's the queue admins act on first.
  const [status, setStatus] = useState<ApplicationStatus | ''>(ApplicationStatus.SUBMITTED)
  const [intake, setIntake] = useState('')
  // Campus is no longer set from this page (global topbar + role flag own
  // scope), but the state stays so the query key changes when a dashboard
  // tile drill-down or other affordance updates it.
  const [campusId] = useState<number | ''>('')
  const [mode, setMode] = useState('')
  const [q, setQ] = useState('')
  const [activeTab, setActiveTab] = useState<'list' | 'dashboard'>('list')

  const intakesQ = useQuery({ queryKey: ['admin', 'intakes'], queryFn: () => intakeService.list() })
  const intakes = intakesQ.data?.data ?? []

  const listQ = useQuery({
    queryKey: ['admin', 'applications', page, status, intake, campusId, mode, q, levelId, gender, paymentStatus, paidFirst, showHidden],
    queryFn: () => applicationAdminService.list({
      page, per_page: 15,
      status: status || undefined,
      intake: intake || undefined,
      campus_id: campusId || undefined,
      mode_of_study: mode || undefined,
      level_id: levelId || undefined,
      gender: gender || undefined,
      payment_status: paymentStatus || undefined,
      q: q || undefined,
      ...(paidFirst ? { sort_paid_first: '1' as const } : {}),
      ...(showHidden ? { only_hidden: '1' as const } : {}),
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

  const modeOptions = useMemo(() => {
    const all = ((statsQ.data?.data as any)?.all_modes ?? []) as { label: string }[]
    const counts = new Map<string, number>()
    for (const r of ((statsQ.data?.data as any)?.by_mode ?? []) as { label: string; cnt: number }[]) {
      counts.set(String(r.label), Number(r.cnt) || 0)
    }
    return all.map((m) => ({ label: m.label, cnt: counts.get(m.label) ?? 0 }))
  }, [statsQ.data])

  const levelOptions = useMemo(() => {
    const all = ((statsQ.data?.data as any)?.all_levels ?? []) as { id: number; label: string }[]
    const counts = new Map<number, number>()
    for (const r of ((statsQ.data?.data as any)?.by_level ?? []) as { id: number; cnt: number }[]) {
      counts.set(Number(r.id), Number(r.cnt) || 0)
    }
    return all.map((l) => ({ id: Number(l.id), label: l.label, cnt: counts.get(Number(l.id)) ?? 0 }))
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
        <button
          type="button"
          onClick={() => setShowBulkUpload(true)}
          className="btn-secondary inline-flex items-center gap-1.5 whitespace-nowrap"
          title="Bulk import applicants from a CSV template"
        >
          <Upload className="w-3.5 h-3.5" /> Bulk upload
        </button>
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
          {(statsQ.data?.data as any)?.desynced_pending_count > 0 && (
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-100 px-3.5 py-2.5">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="text-[12.5px] leading-snug">
                <strong>{(statsQ.data?.data as any).desynced_pending_count}</strong>
                {' '}application(s) are pending but may already have a student record.
                Ask the system administrator to run
                {' '}<code className="bg-amber-100 dark:bg-amber-900/50 px-1 rounded">scripts/diagnose_pending_enrolled.php --fix</code>
                {' '}to repair.
              </div>
            </div>
          )}

          <ScopeHint stats={statsQ.data?.data} />

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
              {/* Inline campus dropdown removed. Scope is now controlled
                  globally by the topbar Campus switcher + the role-level
                  enforce_campus_scope flag, so this filter would have been
                  redundant noise on the toolbar. */}
              <div className="relative">
                <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-400 pointer-events-none" />
                <select
                  className="input pl-8 w-44"
                  value={levelId === '' ? '' : String(levelId)}
                  onChange={(e) => { setLevelId(e.target.value ? Number(e.target.value) : ''); setPage(1) }}
                >
                  <option value="">All levels</option>
                  {levelOptions.map((l) => (
                    <option key={l.id} value={l.id}>{l.label} ({l.cnt})</option>
                  ))}
                </select>
              </div>
              <div className="relative">
                <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-400 pointer-events-none" />
                <select
                  className="input pl-8 w-36"
                  value={gender}
                  onChange={(e) => { setGender(e.target.value); setPage(1) }}
                >
                  <option value="">All genders</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                  <option value="O">Other</option>
                </select>
              </div>
              <div className="relative">
                <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-400 pointer-events-none" />
                <select
                  className="input pl-8 w-40"
                  value={paymentStatus}
                  onChange={(e) => { setPaymentStatus(e.target.value); setPage(1) }}
                >
                  <option value="">All payment</option>
                  <option value="paid">Paid</option>
                  <option value="unpaid">Unpaid</option>
                </select>
              </div>
              <label className="flex items-center gap-1.5 text-[12px] text-ink-600 dark:text-ink-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="accent-brand"
                  checked={paidFirst}
                  onChange={(e) => { setPaidFirst(e.target.checked); setPage(1) }}
                />
                Paid first
              </label>
              <button
                type="button"
                onClick={() => { setShowHidden((v) => !v); setPage(1) }}
                className={
                  'inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1.5 rounded-md transition-colors ' +
                  (showHidden
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                    : 'bg-ink-50 dark:bg-ink-800 text-ink-600 dark:text-ink-300 hover:bg-ink-100')
                }
                title={showHidden ? 'Showing hidden — click to return to the main list' : 'Show only hidden applications'}
              >
                <EyeOff className="w-3.5 h-3.5" />
                {showHidden ? 'Hidden only' : 'Show hidden'}
              </button>
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
                  <th>Applicant</th>
                  <th>Program &amp; placement</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th>Pending notes</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => {
                  const noteCount = Number((a as any).pending_notes_count ?? 0)
                  const latestNote = (a as any).latest_pending_note as
                    | { note: string; created_by_name: string | null; created_at: string }
                    | null
                  const applicantLabel = `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim() || a.application_number
                  const photoUrl = applicationAdminService.photoUrl(
                    a.id,
                    (a as any).applicant_photo_id ?? null,
                  )
                  const initials = `${(a.first_name ?? '').charAt(0)}${(a.last_name ?? '').charAt(0)}`.toUpperCase() || '?'
                  return (
                    <tr
                      key={a.id}
                      onClick={() => navigate(`/admin/admissions/applications/${a.id}`)}
                      className="cursor-pointer hover:bg-ink-50/60 dark:hover:bg-ink-800/40 transition-colors"
                    >
                      <td>
                        <div className="flex items-center gap-2.5 min-w-[220px]">
                          <ApplicantAvatar photoUrl={photoUrl} initials={initials} />
                          <div className="min-w-0">
                            <p className="font-semibold text-ink-900 dark:text-ink-100 truncate text-[13px]">
                              {a.first_name} {a.last_name}
                            </p>
                            <p className="text-[11px] text-ink-500 truncate">{a.email}</p>
                            <p className="text-[10.5px] text-ink-400 font-mono mt-0.5">{a.application_number}</p>
                          </div>
                        </div>
                      </td>
                      <td className="min-w-[220px]">
                        <p className="text-[12.5px] font-medium text-ink-900 dark:text-ink-100 truncate">
                          {(a as any).program_name ?? a.department_name ?? `#${a.department_id}`}
                        </p>
                        <p className="text-[11px] text-ink-500 truncate">
                          {(a as any).campus_name ?? '—'}
                          {(a as any).mode_of_study ? ` · ${(a as any).mode_of_study}` : ''}
                          {a.intake ? ` · ${a.intake}` : ''}
                        </p>
                      </td>
                      <td><span className={STATUS_TONE[a.status] ?? 'chip-soft'}>{STATUS_LABEL[a.status] ?? a.status}</span></td>
                      <td className="text-[12px] text-ink-600 whitespace-nowrap">{fmt(a.submitted_at ?? a.created_at)}</td>
                      <td onClick={(e) => e.stopPropagation()} className="max-w-[260px]">
                        <button
                          type="button"
                          onClick={() => { setNotesAppId(a.id); setNotesAppLabel(applicantLabel) }}
                          className={
                            'flex items-start gap-1.5 text-left transition-colors ' +
                            (noteCount > 0
                              ? 'text-amber-700 dark:text-amber-300 hover:text-amber-900'
                              : 'text-ink-400 hover:text-ink-700 dark:hover:text-ink-200')
                          }
                          title={noteCount > 0 ? `${noteCount} shared note(s)` : 'Add a shared note'}
                        >
                          <StickyNote className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          {noteCount > 0 && latestNote ? (
                            <span className="min-w-0">
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide">
                                <span className="chip-warning !py-0 !px-1.5 text-[10px]">{noteCount}</span>
                                {latestNote.created_by_name ?? 'Staff'}
                              </span>
                              <span className="block text-[11.5px] text-ink-600 dark:text-ink-300 leading-snug line-clamp-2">
                                {latestNote.note}
                              </span>
                            </span>
                          ) : (
                            <span className="text-[11.5px] italic">Add note</span>
                          )}
                        </button>
                      </td>
                      <td className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {(a as any).is_hidden ? (
                            <button
                              type="button"
                              title="Restore from hidden"
                              onClick={async () => {
                                try {
                                  await applicationAdminService.restore(a.id)
                                  toast.success('Restored')
                                  queryClient.invalidateQueries({ queryKey: ['admin', 'applications'] })
                                } catch (e: any) {
                                  toast.error(e.response?.data?.message ?? 'Failed to restore')
                                }
                              }}
                              className="icon-btn text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              title="Hide from the main queue"
                              onClick={async () => {
                                const reason = window.prompt('Optional reason for hiding this application?') ?? ''
                                try {
                                  await applicationAdminService.hide(a.id, { reason })
                                  toast.success('Hidden')
                                  queryClient.invalidateQueries({ queryKey: ['admin', 'applications'] })
                                } catch (e: any) {
                                  toast.error(e.response?.data?.message ?? 'Failed to hide')
                                }
                              }}
                              className="icon-btn text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                            >
                              <EyeOff className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <Link to={`/admin/admissions/applications/${a.id}`} className="btn-secondary btn-sm">
                            View <ChevronRight className="w-3 h-3" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pager page={page} last={last} onPage={setPage} />
        </>
      )}
          </section>
        </>
      )}

      <PendingNotesModal
        applicationId={notesAppId}
        applicantLabel={notesAppLabel}
        onClose={() => setNotesAppId(null)}
        onSaved={() => {
          // Refresh the list so badge counts/previews update.
          queryClient.invalidateQueries({ queryKey: ['admin', 'applications'] })
        }}
      />

      <BulkUploadModal
        open={showBulkUpload}
        onClose={() => setShowBulkUpload(false)}
        onDone={() => {
          queryClient.invalidateQueries({ queryKey: ['admin', 'applications'] })
        }}
      />
    </div>
  )
}

function BulkUploadModal({
  open, onClose, onDone,
}: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [file, setFile]       = useState<File | null>(null)
  const [uploading, setUp]    = useState(false)
  const [result, setResult]   = useState<{ inserted: number; errors: Array<{ row: number; message: string }> } | null>(null)

  useEffect(() => {
    if (!open) { setFile(null); setResult(null); setUp(false); }
  }, [open])

  if (!open) return null

  const handleUpload = async () => {
    if (!file) { toast.error('Pick a file first.'); return; }
    setUp(true)
    try {
      const r = await applicationAdminService.bulkUpload(file)
      setResult(r.data ?? { inserted: 0, errors: [] })
      if ((r.data?.inserted ?? 0) > 0) {
        toast.success(`Inserted ${r.data?.inserted} applicant(s)`)
        onDone()
      }
    } catch (e: any) {
      toast.error(e.response?.data?.message ?? 'Upload failed')
    } finally {
      setUp(false)
    }
  }

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-in fade-in">
        <div className="absolute inset-0 bg-ink-900/60 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-lg card overflow-hidden flex flex-col max-h-[85vh]">
          <div className="px-5 py-3.5 border-b hairline flex justify-between items-center">
            <div>
              <h2 className="text-[14px] font-semibold text-ink-900 dark:text-white flex items-center gap-2">
                <Upload className="w-4 h-4 text-brand" />
                Bulk applicant upload
              </h2>
              <p className="section-sub mt-0.5">
                Import a CSV of direct-entry applicants. Each row becomes a verified application ready for offer + enrollment.
              </p>
            </div>
            <button onClick={onClose} className="icon-btn"><X className="w-4 h-4" /></button>
          </div>

          <div className="px-5 py-4 space-y-3 flex-1 overflow-y-auto">
            <a
              href={applicationAdminService.bulkUploadTemplateUrl()}
              className="inline-flex items-center gap-1.5 text-[12.5px] text-brand hover:underline"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Download CSV template
            </a>

            <div>
              <label className="label">Choose CSV file</label>
              <input
                type="file"
                accept=".csv,text/csv"
                className="input"
                onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }}
              />
            </div>

            {result && (
              <div className="border hairline rounded-lg p-3 space-y-1.5 text-[12.5px]">
                <p className="font-semibold text-emerald-700">
                  Inserted: {result.inserted}
                </p>
                {result.errors.length > 0 && (
                  <div>
                    <p className="font-semibold text-red-700">Errors: {result.errors.length}</p>
                    <ul className="list-disc pl-5 mt-1 space-y-0.5 text-ink-600">
                      {result.errors.slice(0, 20).map((er, i) => (
                        <li key={i}>Row {er.row}: {er.message}</li>
                      ))}
                      {result.errors.length > 20 && <li>…and {result.errors.length - 20} more</li>}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="px-5 py-3 border-t hairline flex items-center justify-end gap-2">
            <button onClick={onClose} className="btn-secondary btn-sm">Close</button>
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="btn-primary btn-sm"
            >
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}

function PendingNotesModal({
  applicationId, applicantLabel, onClose, onSaved,
}: {
  applicationId: number | null
  applicantLabel: string
  onClose: () => void
  onSaved: () => void
}) {
  const [notes, setNotes]   = useState<ApplicationPendingNote[]>([])
  const [draft, setDraft]   = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving]   = useState(false)

  useEffect(() => {
    if (!applicationId) return
    let cancelled = false
    setLoading(true)
    setDraft('')
    applicationAdminService
      .listPendingNotes(applicationId)
      .then((res) => { if (!cancelled) setNotes(res.data?.notes ?? []) })
      .catch(() => { if (!cancelled) toast.error('Failed to load notes') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [applicationId])

  if (!applicationId) return null

  const handleAdd = async () => {
    const note = draft.trim()
    if (note.length < 3) {
      toast.error('Note must be at least 3 characters.')
      return
    }
    setSaving(true)
    try {
      const res = await applicationAdminService.addPendingNote(applicationId, { note })
      setNotes(res.data?.notes ?? [])
      setDraft('')
      onSaved()
      toast.success('Note added')
    } catch (e: any) {
      toast.error(e.response?.data?.message ?? 'Failed to add note')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-in fade-in">
        <div className="absolute inset-0 bg-ink-900/60 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-lg card overflow-hidden animate-in flex flex-col max-h-[85vh]">
          <div className="px-5 py-3.5 border-b hairline flex justify-between items-center">
            <div className="min-w-0">
              <h2 className="text-[14px] font-semibold text-ink-900 dark:text-white flex items-center gap-2">
                <StickyNote className="w-4 h-4 text-amber-600" />
                Shared pending notes
              </h2>
              <p className="section-sub mt-0.5 truncate">
                {applicantLabel} — visible to every registry staff member.
              </p>
            </div>
            <button onClick={onClose} className="icon-btn" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-5 py-3 flex-1 overflow-y-auto space-y-2.5">
            {loading ? (
              <div className="text-[12.5px] text-ink-500 py-6 text-center">Loading…</div>
            ) : notes.length === 0 ? (
              <div className="text-[12.5px] text-ink-500 py-6 text-center italic">
                No notes recorded yet. Add the first one below.
              </div>
            ) : (
              notes.map((n) => (
                <div key={n.id} className="border hairline rounded-lg p-2.5">
                  <p className="text-[12.5px] text-ink-900 dark:text-ink-100 whitespace-pre-wrap">{n.note}</p>
                  <p className="text-[10.5px] text-ink-500 mt-1.5 flex items-center justify-between">
                    <span>{n.created_by_name ?? 'Unknown'}</span>
                    <span>{fmtDateTime(n.created_at)}</span>
                  </p>
                </div>
              ))
            )}
          </div>

          <div className="px-5 py-3 border-t hairline space-y-2">
            <label className="label flex items-center gap-1.5">
              <MessageSquarePlus className="w-3.5 h-3.5" /> Add a shared note
            </label>
            <textarea
              className="input min-h-[72px] text-[12.5px]"
              placeholder="Explain why this candidate is being held (e.g. awaiting transcript verification)…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={1000}
              disabled={saving}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-ink-400">{draft.length}/1000</span>
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="btn-secondary btn-sm">Close</button>
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={saving || draft.trim().length < 3}
                  className="btn-primary btn-sm"
                >
                  {saving ? 'Saving…' : 'Add note'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}

function fmtDateTime(v: string | null | undefined) {
  if (!v) return '—'
  try {
    const d = new Date(v.replace(' ', 'T'))
    return isNaN(d.getTime()) ? v : d.toLocaleString()
  } catch { return v }
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

/** Avatar circle. Falls back to gradient initials when no photo is present
 *  and to initials again if the photo fails to load. */
function ApplicantAvatar({
  photoUrl, initials,
}: { photoUrl: string | null; initials: string }) {
  return (
    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500/15 to-primary-500/5 dark:from-primary-500/30 dark:to-primary-500/10 flex items-center justify-center text-primary-700 dark:text-primary-200 font-bold text-[12px] shrink-0 overflow-hidden ring-1 ring-primary-200/60 dark:ring-primary-900/40">
      {photoUrl ? (
        <>
          <img
            src={photoUrl}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => {
              const img = e.currentTarget as HTMLImageElement
              img.style.display = 'none'
              const span = img.nextElementSibling as HTMLElement | null
              if (span) span.style.removeProperty('display')
            }}
          />
          <span style={{ display: 'none' }}>{initials}</span>
        </>
      ) : (
        <span>{initials}</span>
      )}
    </div>
  )
}

/** Small pill above the stat tiles that tells the user which campus(es)
 *  the numbers reflect. Hidden for users with no campus restriction. */
function ScopeHint({ stats }: { stats: any }) {
  const user = useAuthStore((s) => s.user)
  if (!user) return null
  const assigned = (user.assigned_campuses ?? []) as Array<{ id: number; name: string }>
  if (assigned.length === 0) return null
  const names = assigned.map((c) => c.name).join(', ')
  const total = Number(stats?.total ?? 0)
  return (
    <div className="inline-flex items-center gap-2 self-start px-3 py-1.5 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-200 text-[11.5px] font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-primary-500" />
      Showing <strong>{total.toLocaleString()}</strong> application(s) for {names}
    </div>
  )
}
