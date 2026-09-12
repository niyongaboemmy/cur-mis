import { useState, useMemo, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import {
  Files, Search, ChevronRight, ArrowLeft, ArrowRight, Filter,
  CheckCircle2, Clock, Sparkles, AlertCircle, GraduationCap, FileText,
  Download, FileSpreadsheet, StickyNote, X, MessageSquarePlus,
  EyeOff, RotateCcw, Upload, Banknote, Edit2, Archive,
} from 'lucide-react'
import { applicationAdminService, intakeService } from '@/services/admissionService'
import { ApplicationStatus, ApplicationPendingNote } from '@/types/admission'
import SearchableSelect from '@/components/ui/SearchableSelect'
import ModalPortal from '@/components/ui/ModalPortal'
import ApplicationsDashboard from './ApplicationsDashboard'
import { useAuthStore } from '@/store/authStore'
import SharedBulkUploadModal from '@/components/admin/BulkUploadModal'
import DateRangeFilter, { type DateRangeValue } from '@/components/ui/DateRangeFilter'
import ApplicationEditModal from '@/components/admin/ApplicationEditModal'
import OldMISModal from '@/components/admission/OldMISModal'

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

// UI pseudo-statuses: each stat tile sums more than one raw status (see
// `stats` below), so clicking a tile has to filter by the same combination
// the tile counted — not just one of the statuses in it. The backend
// expands these strings in StudentApplicationModel::paginateFiltered(), so
// they're real filter values even though they aren't in the SQL enum.
const PENDING_FILTER = 'pending' as const       // submitted OR documents_under_review — matches the "Pending" tile.
const IN_REVIEW_FILTER = 'in_review' as const   // documents_under_review OR documents_verified — matches the "In Review" tile.
const OFFERS_FILTER = 'offers_queue' as const   // offered OR offer_accepted — matches the "Offers" tile.
const ACTION_FILTER = 'action_needed' as const  // documents_rejected OR requested_changes — matches the "Action" tile.

const STATUSES: { value: string; label: string }[] = [
  { value: '',                                       label: 'All statuses' },
  // Pseudo-statuses surfaced first so the dropdown can reproduce every tile.
  { value: PENDING_FILTER,                           label: 'Pending (queue)' },
  { value: IN_REVIEW_FILTER,                         label: 'In review (queue)' },
  { value: OFFERS_FILTER,                            label: 'Offers (queue)' },
  { value: ACTION_FILTER,                            label: 'Action needed (queue)' },
  { value: ApplicationStatus.SUBMITTED,              label: 'Submitted only' },
  { value: ApplicationStatus.DOCUMENTS_UNDER_REVIEW, label: 'Docs under review' },
  { value: ApplicationStatus.DOCUMENTS_VERIFIED,     label: 'Docs verified' },
  { value: ApplicationStatus.DOCUMENTS_REJECTED,     label: 'Docs rejected' },
  { value: ApplicationStatus.REQUESTED_CHANGES,      label: 'Changes requested' },
  { value: ApplicationStatus.OFFERED,                label: 'Offered' },
  { value: ApplicationStatus.OFFER_ACCEPTED,         label: 'Fee paid' },
  { value: ApplicationStatus.OFFER_DECLINED,         label: 'Declined' },
  { value: ApplicationStatus.ENROLLED,               label: 'Enrolled' },
  { value: ApplicationStatus.WITHDRAWN,              label: 'Withdrawn' },
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
  // Bank Slip management modal state
  const [showBankSlipModal, setShowBankSlipModal] = useState(false)
  // Old MIS modal state
  const [showOldMISModal, setShowOldMISModal] = useState(false)
  // Default to the "pending" pseudo-status (submitted OR
  // documents_under_review) — that's the full active queue admins act
  // on first, not just the very first stage.
  const [status, setStatus] = useState<
    ApplicationStatus | typeof PENDING_FILTER | typeof IN_REVIEW_FILTER | typeof OFFERS_FILTER | typeof ACTION_FILTER | ''
  >(PENDING_FILTER)
  const [intake, setIntake] = useState('')
  // Campus is no longer set from this page (global topbar + role flag own
  // scope), but the state stays so the query key changes when a dashboard
  // tile drill-down or other affordance updates it.
  const [campusId] = useState<number | ''>('')
  const [mode, setMode] = useState('')
  const [q, setQ] = useState('')
  const [activeTab, setActiveTab] = useState<'list' | 'dashboard'>('list')
  // Submission date window, shared by the list, the stat tiles and the exports.
  const [dateRange, setDateRange] = useState<DateRangeValue>({ from: '', to: '' })
  // Edit modal state
  const [editingApp, setEditingApp] = useState<any>(null)

  const intakesQ = useQuery({ queryKey: ['admin', 'intakes'], queryFn: () => intakeService.list() })
  const intakes = intakesQ.data?.data ?? []

  const listQ = useQuery({
    queryKey: ['admin', 'applications', page, status, intake, campusId, mode, q, levelId, gender, paymentStatus, paidFirst, showHidden, dateRange.from, dateRange.to],
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
      submitted_from: dateRange.from || undefined,
      submitted_to:   dateRange.to   || undefined,
    }),
    placeholderData: (prev) => prev,
  })

  const rows = listQ.data?.data?.data ?? []
  const total = listQ.data?.data?.total ?? 0
  const last  = listQ.data?.data?.last_page ?? 1

  // Server-side aggregate stats (independent of pagination/filters)
  const statsQ = useQuery({
    queryKey: ['admin', 'applications', 'stats', dateRange.from, dateRange.to],
    queryFn: () => applicationAdminService.getStats({
      submitted_from: dateRange.from || undefined,
      submitted_to:   dateRange.to   || undefined,
    }),
  })

  const stats = useMemo(() => {
    const byStatus = (statsQ.data?.data?.by_status ?? []) as { status: string; cnt: number }[]
    const counts: Record<string, number> = {}
    for (const r of byStatus) counts[r.status] = Number(r.cnt) || 0
    const totalAll = statsQ.data?.data?.total ?? Object.values(counts).reduce((a, b) => a + b, 0)
    const submitted = counts.submitted ?? 0
    // "Pending" tile = full active review queue (matches the backend's
    // `pending` pseudo-status filter). Was just `counts.submitted` —
    // which was always 0 the moment an admin moved an application to
    // documents_under_review, even though the work wasn't done.
    const pending = submitted + (counts.documents_under_review ?? 0)
    const inReview = (counts.documents_under_review ?? 0) + (counts.documents_verified ?? 0)
    const offers = (counts.offered ?? 0) + (counts.offer_accepted ?? 0)
    const enrolled = counts.enrolled ?? 0
    const actionNeeded = (counts.documents_rejected ?? 0) + (counts.requested_changes ?? 0)
    return { totalAll, submitted, pending, inReview, offers, enrolled, actionNeeded }
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
    if (dateRange.from) params.set('submitted_from', dateRange.from)
    if (dateRange.to)   params.set('submitted_to', dateRange.to)
    return applicationAdminService.exportUrl(params.toString())
  }

  const statusOptions = STATUSES.filter(s => s.value !== '').map(s => ({
    value: s.value,
    label: s.label
  }))

  return (
    <div className="space-y-5 bg-gradient-to-br from-ink-50 via-white to-ink-50/50 dark:from-ink-950 dark:via-ink-900 dark:to-ink-900/50 -mx-6 px-6 py-6 min-h-screen">
      {/* Page header card */}
      <div className="card p-6 bg-white dark:bg-ink-900 shadow-sm border border-white dark:border-ink-800/50">
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div>
            <p className="text-[10.5px] uppercase tracking-[0.25em] font-bold text-brand mb-2">Admissions</p>
            <h1 className="text-[32px] sm:text-[36px] font-black text-ink-900 dark:text-white tracking-tight leading-tight">
              Applications
            </h1>
            <p className="text-[13px] text-ink-500 dark:text-ink-400 mt-2 max-w-lg">
              Review submissions, verify documents, and manage admission decisions across all intakes.
            </p>
          </div>
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => setShowBankSlipModal(true)}
              className="btn-secondary inline-flex items-center gap-2 whitespace-nowrap"
              title="Manage bank slip payments"
            >
              <Banknote className="w-4 h-4" /> Bank Slip
            </button>
            <button
              type="button"
              onClick={() => setShowBulkUpload(true)}
              className="btn-primary inline-flex items-center gap-2 whitespace-nowrap"
              title="Bulk import applicants from a CSV template"
            >
              <Upload className="w-4 h-4" /> Bulk upload
            </button>
          </div>
        </div>
      </div>

      {/* Tab Switcher card */}
      <div className="card p-4 bg-white dark:bg-ink-900 shadow-sm border border-white dark:border-ink-800/50">
        <div className="flex items-center gap-2 p-1.5 bg-ink-100 dark:bg-ink-800/50 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`px-6 py-2 text-[13px] font-semibold rounded-lg transition-all ${
            activeTab === 'dashboard'
              ? 'bg-white dark:bg-ink-900 text-brand shadow-md ring-1 ring-brand/20'
              : 'text-ink-600 dark:text-ink-400 hover:text-ink-800 dark:hover:text-ink-200'
          }`}
        >
          Dashboard
        </button>
        <button
          onClick={() => setActiveTab('list')}
          className={`px-6 py-2 text-[13px] font-semibold rounded-lg transition-all ${
            activeTab === 'list'
              ? 'bg-white dark:bg-ink-900 text-brand shadow-md ring-1 ring-brand/20'
              : 'text-ink-600 dark:text-ink-400 hover:text-ink-800 dark:hover:text-ink-200'
          }`}
        >
          Applications List
        </button>
        </div>
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
                {' '}application(s) appear to already have a student record but are not
                marked as enrolled. Please contact IT support so the records can be
                reconciled.
              </div>
            </div>
          )}

          <ScopeHint stats={statsQ.data?.data} />

          {/* Stats strip — clicking a tile applies the matching status filter. */}
          <div className="card p-5 bg-white dark:bg-ink-900 shadow-sm border border-white dark:border-ink-800/50">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            <StatTile
              icon={FileText} label="Total Applications" value={stats.totalAll}
              accent="bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
              active={status === ''}
              onClick={() => { setStatus(''); setPage(1) }}
            />
            <StatTile
              icon={CheckCircle2} label="Pending" value={stats.pending}
              accent="bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
              active={status === PENDING_FILTER}
              onClick={() => { setStatus(PENDING_FILTER); setPage(1) }}
            />
            <StatTile
              icon={Clock} label="In Review" value={stats.inReview}
              accent="bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
              active={status === IN_REVIEW_FILTER}
              onClick={() => { setStatus(IN_REVIEW_FILTER); setPage(1) }}
            />
            <StatTile
              icon={Sparkles} label="Offers" value={stats.offers}
              accent="bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
              highlight={stats.offers > 0}
              active={status === OFFERS_FILTER}
              onClick={() => { setStatus(OFFERS_FILTER); setPage(1) }}
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
              active={status === ACTION_FILTER}
              onClick={() => { setStatus(ACTION_FILTER); setPage(1) }}
            />
            </div>
          </div>

          <section className="card p-0 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300 bg-white dark:bg-ink-900 shadow-md border border-white dark:border-ink-800/50">
            {/* Toolbar Header */}
            <div className="flex items-center justify-between gap-4 border-b border-ink-100 dark:border-ink-800 px-5 py-4">
              <div className="flex items-center gap-2">
                <Files className="w-5 h-5 text-brand" />
                <div>
                  <h2 className="section-title">Applications</h2>
                  <p className="section-sub">{total.toLocaleString()} match{total === 1 ? '' : 'es'} current filters</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
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

            {/* Filters Row 1 - Primary filters */}
            <div className="flex items-end gap-3 border-b border-ink-100 dark:border-ink-800 px-5 py-4 bg-white dark:bg-ink-900/50">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-400 pointer-events-none" />
                <input
                  value={q}
                  onChange={(e) => { setQ(e.target.value); setPage(1) }}
                  placeholder="Search by name, email, or application number…"
                  className="input pl-9 w-full"
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
              <div className="relative w-48">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-400 pointer-events-none" />
                <select
                  className="input pl-9 w-full"
                  value={intake}
                  onChange={(e) => { setIntake(e.target.value); setPage(1) }}
                >
                  <option value="">All intakes</option>
                  {intakes.map((i: any) => (
                    <option key={i.id} value={i.name}>{i.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Filters Row 2 - Secondary filters */}
            <div className="flex items-end gap-2 flex-wrap bg-ink-50/60 dark:bg-ink-800/40 border-b border-ink-100 dark:border-ink-800 px-5 py-4">
              <div className="relative w-44">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-400 pointer-events-none" />
                <select
                  className="input pl-9 w-full"
                  value={levelId === '' ? '' : String(levelId)}
                  onChange={(e) => { setLevelId(e.target.value ? Number(e.target.value) : ''); setPage(1) }}
                  title="Filter by programme level"
                >
                  <option value="">All levels</option>
                  {levelOptions.map((l) => (
                    <option key={l.id} value={l.id}>{l.label} ({l.cnt})</option>
                  ))}
                </select>
              </div>
              <div className="relative w-40">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-400 pointer-events-none" />
                <select
                  className="input pl-9 w-full"
                  value={gender}
                  onChange={(e) => { setGender(e.target.value); setPage(1) }}
                  title="Filter by gender"
                >
                  <option value="">All genders</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                  <option value="O">Other</option>
                </select>
              </div>
              <div className="relative w-40">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-400 pointer-events-none" />
                <select
                  className="input pl-9 w-full"
                  value={paymentStatus}
                  onChange={(e) => { setPaymentStatus(e.target.value); setPage(1) }}
                  title="Filter by payment status"
                >
                  <option value="">All payments</option>
                  <option value="paid">Paid</option>
                  <option value="unpaid">Unpaid</option>
                </select>
              </div>
              <div className="relative w-40">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-400 pointer-events-none" />
                <select
                  className="input pl-9 w-full"
                  value={mode}
                  onChange={(e) => { setMode(e.target.value); setPage(1) }}
                  title="Filter by mode of study"
                >
                  <option value="">All modes</option>
                  {modeOptions.map((m) => (
                    <option key={m.label} value={m.label}>{m.label} ({m.cnt})</option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-[12px] font-medium text-ink-700 dark:text-ink-300 cursor-pointer select-none px-2 py-1.5 rounded-md hover:bg-white/40 dark:hover:bg-white/5 transition-colors">
                <input
                  type="checkbox"
                  className="accent-brand w-4 h-4"
                  checked={paidFirst}
                  onChange={(e) => { setPaidFirst(e.target.checked); setPage(1) }}
                  title="Show paid applications first"
                />
                Paid first
              </label>
              <button
                type="button"
                onClick={() => { setShowHidden((v) => !v); setPage(1) }}
                className={
                  'inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-md transition-colors ' +
                  (showHidden
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-900/60'
                    : 'bg-white dark:bg-ink-700 text-ink-700 dark:text-ink-300 border border-ink-200 dark:border-ink-600 hover:bg-ink-50 dark:hover:bg-ink-600')
                }
                title={showHidden ? 'Showing hidden — click to return to the main list' : 'Show only hidden applications'}
              >
                <EyeOff className="w-3.5 h-3.5" />
                {showHidden ? 'Hidden only' : 'Show hidden'}
              </button>

              <div className="flex-1" />
            </div>

            {/* Submission window — drives the list, the stat tiles and both
                exports, so everything on screen describes the same rows. */}
            <div className="px-5 py-3.5 border-t border-ink-100 dark:border-ink-800 flex items-end gap-6 flex-wrap">
              <div className="flex-1 min-w-[280px]">
                <DateRangeFilter
                  label="Submitted"
                  value={dateRange}
                  onChange={(v) => { setDateRange(v); setPage(1) }}
                />
              </div>
              <button
                onClick={() => setShowOldMISModal(true)}
                className="px-4 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors font-medium text-[13px] flex items-center gap-2 shrink-0 whitespace-nowrap"
                title="Open Old MIS Application"
              >
                <Archive className="w-4 h-4" />
                Old MIS Application
              </button>
            </div>

      {listQ.isLoading ? (
        <Skel />
      ) : rows.length === 0 ? (
        <div className="py-12 px-6 text-center">
          <Files className="w-12 h-12 text-ink-300 dark:text-ink-600 mx-auto mb-3" />
          <p className="text-ink-600 dark:text-ink-400 text-[13px] font-medium">No applications match your filters.</p>
          <p className="text-ink-500 dark:text-ink-500 text-[12px] mt-1">Try adjusting your search or filter criteria.</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr className="bg-ink-50 dark:bg-ink-800/50 border-b border-ink-200 dark:border-ink-700">
                  <th className="font-semibold text-ink-700 dark:text-ink-200 uppercase text-[11px] tracking-wider py-3">Applicant</th>
                  <th className="font-semibold text-ink-700 dark:text-ink-200 uppercase text-[11px] tracking-wider py-3">Program &amp; placement</th>
                  <th className="font-semibold text-ink-700 dark:text-ink-200 uppercase text-[11px] tracking-wider py-3">Status</th>
                  <th className="font-semibold text-ink-700 dark:text-ink-200 uppercase text-[11px] tracking-wider py-3">Submitted</th>
                  <th className="font-semibold text-ink-700 dark:text-ink-200 uppercase text-[11px] tracking-wider py-3">Pending notes</th>
                  <th className="font-semibold text-ink-700 dark:text-ink-200 uppercase text-[11px] tracking-wider py-3 text-right">Actions</th>
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
                          <button
                            type="button"
                            onClick={() => setEditingApp(a)}
                            title="Edit applicant information"
                            className="icon-btn text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
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

      <ApplicationEditModal
        open={!!editingApp}
        onClose={() => setEditingApp(null)}
        application={editingApp}
      />

      <PendingNotesModal
        applicationId={notesAppId}
        applicantLabel={notesAppLabel}
        onClose={() => setNotesAppId(null)}
        onSaved={() => {
          // Refresh the list so badge counts/previews update.
          queryClient.invalidateQueries({ queryKey: ['admin', 'applications'] })
        }}
      />

      <SharedBulkUploadModal
        open={showBulkUpload}
        onClose={() => setShowBulkUpload(false)}
        title="Bulk import applicants"
        description="Download the Excel-compatible CSV template, fill it in, then re-upload to preview. Each new row creates a verified application ready for offer + enrollment."
        templateUrl={applicationAdminService.bulkUploadTemplateUrl()}
        requiredFields={['first_name', 'last_name', 'email', 'intake', 'department']}
        fieldLabels={{
          first_name: 'First name',
          last_name: 'Last name',
          email: 'Email',
          phone: 'Phone',
          gender: 'Gender (M/F/O)',
          birthdate: 'Birthdate (YYYY-MM-DD)',
          nationality: 'Nationality',
          national_id: 'National ID',
          intake: 'Intake',
          department: 'Department (name or id)',
          program: 'Program (name or id)',
          campus: 'Campus (name or id)',
          mode_of_study: 'Mode of study',
          level: 'Level (name or id)',
          prev_school: 'Previous school',
          prev_qualification: 'Previous qualification',
          prev_grade: 'Previous grade',
          combination: 'Combination',
          graduation_year: 'Graduation year',
          sponsorship: 'Sponsorship',
          sponsor_name: 'Sponsor name',
          is_credit_transfer: 'Credit transfer? (0/1)',
          credit_transfer_from: 'Credit transfer from',
        }}
        onValidate={(file) => applicationAdminService.bulkValidate(file)}
        onUpload={(file, patches) =>
          applicationAdminService
            .bulkUpload(file, patches)
            .then((r) => ({ data: { inserted: r.data?.inserted ?? 0, errors: r.data?.errors ?? [] } }))
        }
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['admin', 'applications'] })
        }}
      />

      {/* Bank Slip Modal */}
      {showBankSlipModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-[90%] max-w-5xl h-[85vh] max-h-[85vh] bg-white dark:bg-ink-900 rounded-xl shadow-2xl flex flex-col animate-in zoom-in-95">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-ink-100 dark:border-ink-800 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-50 dark:bg-green-900/30">
                  <Banknote className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Bank Slip Management</h2>
                  <p className="text-xs text-ink-500 dark:text-ink-400 mt-0.5">Verify and manage payment slips</p>
                </div>
              </div>
              <button
                onClick={() => setShowBankSlipModal(false)}
                className="p-2 hover:bg-ink-100 dark:hover:bg-ink-800 rounded-lg transition-colors"
                title="Close modal"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-ink-500 dark:text-ink-400" />
              </button>
            </div>

            {/* Modal Body - iFrame */}
            <div className="flex-1 overflow-hidden bg-white dark:bg-ink-950">
              <iframe
                src="https://cur.ac.rw/umis/finance/bank_slip/index.php?tab=registrar"
                className="w-full h-full border-none"
                title="Bank Slip Portal"
              />
            </div>
          </div>
        </div>
      )}

      {/* Old MIS Modal */}
      <OldMISModal
        isOpen={showOldMISModal}
        onClose={() => setShowOldMISModal(false)}
      />
    </div>
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
        <div className="relative w-full max-w-lg card overflow-hidden animate-in flex flex-col max-h-[90vh] shadow-2xl">
          <div className="px-5 py-4 border-b border-ink-100 dark:border-ink-800 flex justify-between items-center shrink-0">
            <div className="min-w-0">
              <h2 className="text-[14px] font-semibold text-ink-900 dark:text-white flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/30">
                  <StickyNote className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
                Shared pending notes
              </h2>
              <p className="section-sub mt-1 truncate">
                {applicantLabel} — visible to registry staff
              </p>
            </div>
            <button onClick={onClose} className="icon-btn p-2 hover:bg-ink-100 dark:hover:bg-ink-800 rounded-lg transition-colors shrink-0" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-5 py-4 flex-1 overflow-y-auto space-y-3">
            {loading ? (
              <div className="text-[12.5px] text-ink-500 py-8 text-center">Loading notes…</div>
            ) : notes.length === 0 ? (
              <div className="text-[12.5px] text-ink-500 py-8 text-center">
                <MessageSquarePlus className="w-8 h-8 text-ink-300 dark:text-ink-600 mx-auto mb-2" />
                <p className="font-medium">No notes yet</p>
                <p className="text-[11px] mt-1">Add the first note below</p>
              </div>
            ) : (
              notes.map((n) => (
                <div key={n.id} className="border border-ink-200 dark:border-ink-700 rounded-lg p-3 bg-ink-50/50 dark:bg-ink-800/20">
                  <p className="text-[12.5px] text-ink-900 dark:text-ink-100 whitespace-pre-wrap leading-relaxed">{n.note}</p>
                  <p className="text-[10.5px] text-ink-500 dark:text-ink-400 mt-2.5 flex items-center justify-between">
                    <span className="font-medium">{n.created_by_name ?? 'Unknown'}</span>
                    <span>{fmtDateTime(n.created_at)}</span>
                  </p>
                </div>
              ))
            )}
          </div>

          <div className="px-5 py-4 border-t border-ink-100 dark:border-ink-800 space-y-3 shrink-0 bg-ink-50/50 dark:bg-ink-800/20">
            <label className="label flex items-center gap-2 text-[13px] font-medium text-ink-900 dark:text-white">
              <MessageSquarePlus className="w-4 h-4" /> Add a shared note
            </label>
            <textarea
              className="input min-h-[80px] text-[12.5px] resize-none"
              placeholder="Explain why this candidate is being held (e.g., awaiting transcript verification)…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={1000}
              disabled={saving}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-ink-400 dark:text-ink-500 font-medium">{draft.length}/1000</span>
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
      className={`p-3.5 rounded-lg border flex flex-col gap-2.5 text-left transition-all cursor-pointer ${
        active
          ? 'border-primary-400 dark:border-primary-500 bg-gradient-to-br from-primary-50 to-white dark:from-primary-900/30 dark:to-ink-900 shadow-lg ring-2 ring-primary-200/50 dark:ring-primary-900/50 hover:-translate-y-0.5'
          : highlight
            ? 'border-primary-200 dark:border-primary-800 bg-white dark:bg-ink-800/30 shadow-md hover:shadow-lg hover:-translate-y-0.5'
            : 'border-ink-100 dark:border-ink-700/50 bg-white dark:bg-ink-800/20 shadow-sm hover:shadow-md hover:border-ink-200 dark:hover:border-ink-600 hover:-translate-y-0.5'
      }`}
    >
      <span className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 ${accent}`}>
        <Icon className="w-4.5 h-4.5" />
      </span>
      <div className="min-w-0">
        <p className="text-[9.5px] uppercase tracking-widest font-bold text-ink-500 dark:text-ink-400 leading-none">{label}</p>
        <p className="text-[22px] font-black text-ink-900 dark:text-white leading-none mt-1">{value.toLocaleString()}</p>
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
    <div className="flex items-center justify-between px-5 py-4 border-t border-ink-100 dark:border-ink-800 bg-ink-50/50 dark:bg-ink-800/20">
      <span className="text-[12.5px] font-medium text-ink-600 dark:text-ink-400">Page <strong className="text-ink-900 dark:text-ink-100">{page}</strong> of <strong className="text-ink-900 dark:text-ink-100">{last}</strong></span>
      <div className="flex gap-2">
        <button className="btn-secondary btn-sm" onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1} title="Previous page">
          <ArrowLeft className="w-3.5 h-3.5" /> Prev
        </button>
        <button className="btn-secondary btn-sm" onClick={() => onPage(Math.min(last, page + 1))} disabled={page >= last} title="Next page">
          Next <ArrowRight className="w-3.5 h-3.5" />
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
