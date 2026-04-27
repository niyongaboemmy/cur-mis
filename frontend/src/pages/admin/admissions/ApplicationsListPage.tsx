import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Files, Search, ChevronRight, ArrowLeft, ArrowRight, Filter,
} from 'lucide-react'
import { applicationAdminService, intakeService } from '@/services/admissionService'
import { ApplicationStatus } from '@/types/admission'
import SearchableSelect from '@/components/ui/SearchableSelect'
import ApplicationsDashboard from './ApplicationsDashboard'

const STATUSES: { value: ApplicationStatus | ''; label: string }[] = [
  { value: '',                                     label: 'All statuses' },
  { value: ApplicationStatus.SUBMITTED,            label: 'Submitted' },
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
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<ApplicationStatus | ''>('')
  const [intake, setIntake] = useState('')
  const [q, setQ] = useState('')
  const [activeTab, setActiveTab] = useState<'list' | 'dashboard'>('list')

  const intakesQ = useQuery({ queryKey: ['admin', 'intakes'], queryFn: () => intakeService.list() })
  const intakes = intakesQ.data?.data ?? []

  const listQ = useQuery({
    queryKey: ['admin', 'applications', page, status, intake, q],
    queryFn: () => applicationAdminService.list({
      page, per_page: 15,
      status: status || undefined,
      intake: intake || undefined,
      q: q || undefined,
    }),
    placeholderData: (prev) => prev,
  })

  const rows = listQ.data?.data?.data ?? []
  const total = listQ.data?.data?.total ?? 0
  const last  = listQ.data?.data?.last_page ?? 1

  const statusOptions = STATUSES.filter(s => s.value !== '').map(s => ({
    value: s.value,
    label: s.label
  }))

  return (
    <div className="space-y-4">
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
        <section className="card p-0 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
          {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap border-b border-ink-100 p-4">
        <div className="flex items-center gap-2">
          <Files className="w-5 h-5 text-brand" />
          <div>
            <h2 className="section-title">Applications</h2>
            <p className="section-sub">{total.toLocaleString()} total</p>
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
                  <th>Intake</th>
                  <th>Status</th>
                  <th>Documents</th>
                  <th>Submitted</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td className="font-mono text-[12px]">{a.application_number}</td>
                    <td>
                      <p className="font-medium text-ink-900 dark:text-ink-100">{a.first_name} {a.last_name}</p>
                      <p className="text-[11.5px] text-ink-500">{a.email}</p>
                    </td>
                    <td>{a.department_name ?? `#${a.department_id}`}</td>
                    <td>{a.intake}</td>
                    <td><span className={STATUS_TONE[a.status] ?? 'chip-soft'}>{a.status}</span></td>
                    <td>{a.document_status}</td>
                    <td>{fmt(a.submitted_at ?? a.created_at)}</td>
                    <td className="text-right">
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
      )}
    </div>
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
