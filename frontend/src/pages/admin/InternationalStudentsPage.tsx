import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import {
  Globe2,
  AlertTriangle,
  CalendarClock,
  Check,
  X,
  Search,
  Download,
  Users,
  ShieldAlert,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { studentService } from '@/services/studentService'
import {
  COUNTRY_BY_NAME,
  COUNTRY_BY_NATIONALITY,
  countryFlag,
} from '@/data/countries'

/** Renders a flag emoji + country/nationality name, with fallbacks. */
function countryCell(value: string | null | undefined): React.ReactNode {
  if (!value) return <span className="text-ink-400">—</span>
  const v = value.trim().toLowerCase()
  const country = COUNTRY_BY_NAME[v] ?? COUNTRY_BY_NATIONALITY[v]
  if (!country) return value
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className="text-[16px] leading-none">{countryFlag(country.code)}</span>
      <span>{country.name}</span>
    </span>
  )
}

type ExpiryStatus = '' | 'active' | 'expiring' | 'expired' | 'missing'
type VisaUploaded = '' | 'yes' | 'no'

export default function InternationalStudentsPage() {
  const navigate = useNavigate()

  // Local UI state. `q` is debounced indirectly by React-Query's
  // keepPreviousData so typing doesn't blank the table between fetches.
  const [page, setPage]               = useState(1)
  const [perPage, setPerPage]         = useState(25)
  const [q, setQ]                     = useState('')
  const [program, setProgram]         = useState<string | number>('')
  const [country, setCountry]         = useState<string>('')
  const [expiryStatus, setExpiry]     = useState<ExpiryStatus>('')
  const [hasVisaDoc, setHasVisaDoc]   = useState<VisaUploaded>('')

  // Reset to page 1 whenever any filter changes.
  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v)
    setPage(1)
  }

  const listQ = useQuery({
    queryKey: ['students', 'international', { page, perPage, q, program, country, expiryStatus, hasVisaDoc }],
    queryFn: () =>
      studentService.listInternational({
        page,
        per_page:          perPage,
        q:                 q || undefined,
        program:           program || undefined,
        country:           country || undefined,
        expiry_status:     expiryStatus || undefined,
        has_visa_document: hasVisaDoc || undefined,
      }),
    placeholderData: keepPreviousData,
  })

  const data       = listQ.data?.data
  const rows       = data?.data ?? []
  const facets     = data?.facets ?? { program: [], country: [] }
  const summary    = data?.summary
  const total      = data?.total ?? 0
  const lastPage   = data?.last_page ?? 1

  const hasFilters = useMemo(
    () => !!(q || program || country || expiryStatus || hasVisaDoc),
    [q, program, country, expiryStatus, hasVisaDoc],
  )

  const exportUrl = studentService.internationalExportUrl({
    q:                 q || undefined,
    program:           program || undefined,
    country:           country || undefined,
    expiry_status:     expiryStatus || undefined,
    has_visa_document: hasVisaDoc || undefined,
  })

  const clearFilters = () => {
    setQ(''); setProgram(''); setCountry(''); setExpiry(''); setHasVisaDoc('')
    setPage(1)
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] font-bold text-brand mb-1">Registry</p>
          <h1 className="text-[26px] sm:text-[30px] font-black text-ink-900 dark:text-white tracking-tight leading-tight flex items-center gap-2">
            <Globe2 className="w-6 h-6 text-brand" />
            International students
          </h1>
          <p className="text-[13px] text-ink-500 mt-1">
            Click a row to open the student profile and manage their visa info.
          </p>
        </div>
        <a
          href={exportUrl}
          target="_blank"
          rel="noreferrer"
          className="btn-secondary btn-sm flex items-center gap-1.5 shrink-0"
          title="Download a CSV of every student matching the current filters"
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          Export CSV
          <Download className="w-3.5 h-3.5" />
        </a>
      </header>

      {/* Summary cards — counts for the CURRENT filter set */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard
          tone="brand"
          icon={Users}
          label="Matching"
          value={summary?.total ?? 0}
        />
        <SummaryCard
          tone="emerald"
          icon={Check}
          label="With visa uploaded"
          value={summary?.with_visa_document ?? 0}
        />
        <SummaryCard
          tone="amber"
          icon={CalendarClock}
          label="Expiring ≤ 7d"
          value={summary?.expiring_this_week ?? 0}
        />
        <SummaryCard
          tone="rose"
          icon={ShieldAlert}
          label="Expired"
          value={summary?.expired ?? 0}
        />
      </div>

      {/* Filter bar */}
      <section className="card p-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="label">Search</label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              className="input pl-8 w-full"
              placeholder="Name, registration #, email…"
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1) }}
            />
          </div>
        </div>

        <div className="min-w-[180px]">
          <label className="label">Program</label>
          <select
            className="input"
            value={String(program)}
            onChange={(e) => resetPage(setProgram)(e.target.value)}
          >
            <option value="">All programs</option>
            {facets.program.map((p) => (
              <option key={String(p.value)} value={String(p.value)}>{p.label}</option>
            ))}
          </select>
        </div>

        <div className="min-w-[180px]">
          <label className="label">Country</label>
          <select
            className="input"
            value={country}
            onChange={(e) => resetPage(setCountry)(e.target.value)}
          >
            <option value="">All countries</option>
            {facets.country.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        <div className="min-w-[160px]">
          <label className="label">Visa status</label>
          <select
            className="input"
            value={expiryStatus}
            onChange={(e) => resetPage(setExpiry)(e.target.value as ExpiryStatus)}
          >
            <option value="">Any</option>
            <option value="active">Valid (&gt; 7d)</option>
            <option value="expiring">Expiring this week</option>
            <option value="expired">Expired</option>
            <option value="missing">No date recorded</option>
          </select>
        </div>

        <div className="min-w-[150px]">
          <label className="label">Visa uploaded</label>
          <select
            className="input"
            value={hasVisaDoc}
            onChange={(e) => resetPage(setHasVisaDoc)(e.target.value as VisaUploaded)}
          >
            <option value="">Any</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>

        {hasFilters && (
          <button
            type="button"
            className="btn-ghost btn-sm flex items-center gap-1 shrink-0"
            onClick={clearFilters}
          >
            <X className="w-3.5 h-3.5" />
            Clear
          </button>
        )}
      </section>

      {/* Table */}
      <section className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Reg</th>
                <th>Full name</th>
                <th>Country</th>
                <th>Program</th>
                <th>Visa obtained date</th>
                <th>Visa expiration date</th>
                <th className="text-center">Visa uploaded</th>
              </tr>
            </thead>
            <tbody>
              {listQ.isLoading ? (
                <tr><td colSpan={7} className="text-center text-ink-500 py-10">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-ink-500 py-10 italic">
                  {hasFilters ? 'No students match the current filters.' : 'No international students yet.'}
                </td></tr>
              ) : (
                rows.map((s) => {
                  const expiringSoon =
                    s.days_to_expiry != null && s.days_to_expiry <= 7 && s.days_to_expiry >= 0
                  const expired = s.days_to_expiry != null && s.days_to_expiry < 0
                  const uploaded = !!s.visa_document_file_id
                  return (
                    <tr
                      key={s.id}
                      onClick={() => navigate(`/students/${s.id}`)}
                      className="cursor-pointer hover:bg-ink-50/60 dark:hover:bg-ink-800/40 transition-colors"
                    >
                      <td className="font-mono text-[12px] text-ink-700 dark:text-ink-200">
                        {s.regnumber ?? '—'}
                      </td>
                      <td>
                        <p className="font-medium text-ink-900 dark:text-ink-100">
                          {s.fname} {s.lname}
                        </p>
                        {s.email && (
                          <p className="text-[11px] text-ink-500">{s.email}</p>
                        )}
                      </td>
                      <td>{countryCell(s.country_of_origin ?? s.nationality)}</td>
                      <td className="text-[12.5px]">
                        {s.program_name ?? <span className="text-ink-400">—</span>}
                      </td>
                      <td>{s.visa_issue_date ?? <span className="text-ink-400">—</span>}</td>
                      <td>
                        {s.visa_expiry_date ? (
                          <span className="inline-flex items-center gap-2">
                            <span>{s.visa_expiry_date}</span>
                            {expired ? (
                              <span className="chip-danger inline-flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                Expired
                              </span>
                            ) : expiringSoon ? (
                              <span className="chip-warning inline-flex items-center gap-1">
                                <CalendarClock className="w-3 h-3" />
                                {s.days_to_expiry}d
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="text-ink-400">—</span>
                        )}
                      </td>
                      <td className="text-center">
                        {uploaded ? (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 text-[11px] font-bold"
                            title={s.visa_document_original_name ?? 'Uploaded'}
                          >
                            <Check className="w-3 h-3" /> Yes
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300 text-[11px] font-bold">
                            <X className="w-3 h-3" /> No
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        <div className="flex items-center justify-between gap-4 flex-wrap px-4 py-3 border-t hairline text-[12px] text-ink-500">
          <div className="flex items-center gap-3">
            <span>
              Showing{' '}
              <strong className="text-ink-900 dark:text-white">
                {rows.length === 0 ? 0 : (page - 1) * perPage + 1}–
                {Math.min(page * perPage, total)}
              </strong>{' '}
              of <strong className="text-ink-900 dark:text-white">{total}</strong>
            </span>
            <label className="flex items-center gap-1.5">
              Per page
              <select
                className="input py-1 px-2 w-auto text-[12px]"
                value={perPage}
                onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1) }}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-secondary btn-sm flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || listQ.isFetching}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Prev
            </button>
            <span className="px-2 text-ink-700 dark:text-ink-200 font-medium">
              {page} / {lastPage}
            </span>
            <button
              type="button"
              className="btn-secondary btn-sm flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
              disabled={page >= lastPage || listQ.isFetching}
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

function SummaryCard({
  tone,
  icon: Icon,
  label,
  value,
}: {
  tone: 'brand' | 'emerald' | 'amber' | 'rose'
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
}) {
  const tones = {
    brand:   'bg-brand/10 text-brand',
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    amber:   'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    rose:    'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  } as const
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${tones[tone]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-400">{label}</p>
        <p className="text-[20px] font-black text-ink-900 dark:text-white leading-tight">
          {value.toLocaleString()}
        </p>
      </div>
    </div>
  )
}
