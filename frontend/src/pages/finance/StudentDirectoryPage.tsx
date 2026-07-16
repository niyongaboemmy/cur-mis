import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Users, Search, ArrowUpDown } from 'lucide-react'
import { financeStudentDirectoryService } from '@/services/financeService'
import { academicService as academicSvc } from '@/services/academicService'
import type { FinanceStudentDirectoryRow, FinanceStudentFeeStatus } from '@/types/finance'
import SearchableSelect from '@/components/ui/SearchableSelect'
import Pagination from '@/components/ui/Pagination'
import { useDebounce } from '@/hooks/useDebounce'

// ── Constants ─────────────────────────────────────────────────────────────────

const SORTABLE_COLUMNS: { key: string; label: string }[] = [
  { key: 'fname', label: 'First Name' },
  { key: 'lname', label: 'Last Name' },
  { key: 'regnumber', label: 'Reg Number' },
  { key: 'email', label: 'Email' },
  { key: 'gender', label: 'Gender' },
  { key: 'nationality', label: 'Nationality' },
]

const FEE_STATUS_STYLES: Record<string, string> = {
  no_invoices: 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400',
  paid:        'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  partial:     'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  unpaid:      'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
}

const FEE_STATUS_LABELS: Record<string, string> = {
  no_invoices: 'No Invoices',
  paid:        'Paid',
  partial:     'Partial',
  unpaid:      'Unpaid',
}

function feeStatusBadge(status: FinanceStudentFeeStatus | string) {
  const cls = FEE_STATUS_STYLES[status] ?? FEE_STATUS_STYLES.no_invoices
  const label = FEE_STATUS_LABELS[status] ?? status
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${cls}`}>
      {label}
    </span>
  )
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-RW', { maximumFractionDigits: 0 }).format(n)
}

// ── StudentDirectoryPage ────────────────────────────────────────────────────

export default function StudentDirectoryPage() {
  const [page, setPage]             = useState(1)
  const [perPage]                   = useState(20)
  const [search, setSearch]         = useState('')
  const [gender, setGender]         = useState<string>('')
  const [nationality, setNationality] = useState<string>('')
  const [yearId, setYearId]         = useState<number | ''>('')
  const [sortBy, setSortBy]         = useState('id')
  const [sortDir, setSortDir]       = useState<'ASC' | 'DESC'>('DESC')

  const debouncedSearch = useDebounce(search, 350)

  const yearsQ = useQuery({
    queryKey: ['academic', 'years'],
    queryFn: ({ signal }) => academicSvc.listYears(signal),
  })
  const years = yearsQ.data?.data ?? []

  const { data: res, isLoading } = useQuery({
    queryKey: [
      'finance', 'student-directory',
      page, perPage, debouncedSearch, gender, nationality, yearId, sortBy, sortDir,
    ],
    queryFn: ({ signal }) =>
      financeStudentDirectoryService.list(
        {
          page,
          per_page: perPage,
          search: debouncedSearch || undefined,
          gender: gender || undefined,
          nationality: nationality || undefined,
          academic_year_id: yearId ? Number(yearId) : undefined,
          sort_by: sortBy,
          sort_dir: sortDir,
        },
        signal,
      ),
    placeholderData: (prev) => prev,
  })

  const rows: FinanceStudentDirectoryRow[] = res?.data?.data ?? []
  const currentPage = res?.data?.current_page ?? page
  const lastPage    = res?.data?.last_page ?? 1
  const total       = res?.data?.total ?? 0

  function toggleSort(key: string) {
    if (sortBy === key) {
      setSortDir((d) => (d === 'ASC' ? 'DESC' : 'ASC'))
    } else {
      setSortBy(key)
      setSortDir('ASC')
    }
    setPage(1)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 pb-12">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-ink-900 p-5 rounded-xl border border-ink-200 dark:border-ink-800 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-brand/10 text-brand rounded-lg">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-ink-900 dark:text-ink-50">Student Directory</h1>
            <p className="text-xs text-ink-500">Read-only student list with fee/payment status, scoped to Finance.</p>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white dark:bg-ink-900 p-4 rounded-xl border border-ink-200 dark:border-ink-800 shadow-sm grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="space-y-1 sm:col-span-2">
          <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Search</label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="Name, reg number, or email"
              className="w-full pl-9 pr-3 py-2 bg-ink-50 dark:bg-ink-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Gender</label>
          <select
            value={gender}
            onChange={(e) => { setGender(e.target.value); setPage(1) }}
            className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700"
          >
            <option value="">All</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Nationality</label>
          <select
            value={nationality}
            onChange={(e) => { setNationality(e.target.value); setPage(1) }}
            className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700"
          >
            <option value="">All</option>
            <option value="rwandan">Rwandan</option>
            <option value="foreign">Foreign</option>
          </select>
        </div>
        <div className="space-y-1 sm:col-span-4 max-w-xs">
          <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Fee Status Year</label>
          <SearchableSelect
            options={years.map((y) => ({ value: y.id, label: y.label }))}
            value={yearId}
            onChange={(v) => { setYearId(v === '' ? '' : Number(v)); setPage(1) }}
            placeholder="All-time (across every academic year)"
            allLabel="All-time (across every academic year)"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 dark:border-ink-800 bg-ink-50/60 dark:bg-ink-800/60">
                {SORTABLE_COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => toggleSort(col.key)}
                    className="text-left px-4 py-3 text-xs font-semibold text-ink-500 dark:text-ink-400 cursor-pointer select-none hover:text-ink-800 dark:hover:text-ink-200 whitespace-nowrap"
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {sortBy === col.key && <ArrowUpDown className="w-3 h-3" />}
                    </span>
                  </th>
                ))}
                <th className="text-left px-4 py-3 text-xs font-semibold text-ink-500 dark:text-ink-400 whitespace-nowrap">Fee Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-ink-500 dark:text-ink-400 whitespace-nowrap">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={SORTABLE_COLUMNS.length + 2} className="px-4 py-3">
                      <div className="h-4 bg-ink-100 dark:bg-ink-800 rounded w-full animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={SORTABLE_COLUMNS.length + 2} className="px-4 py-12 text-center text-ink-400 italic">
                    No students found matching these filters.
                  </td>
                </tr>
              ) : (
                rows.map((s) => (
                  <tr key={s.id} className="hover:bg-ink-50/40 dark:hover:bg-ink-800/40 transition-colors">
                    <td className="px-4 py-3 font-medium text-ink-900 dark:text-ink-50 whitespace-nowrap">{s.fname}</td>
                    <td className="px-4 py-3 text-ink-700 dark:text-ink-300 whitespace-nowrap">{s.lname}</td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-500 whitespace-nowrap">
                      {s.regnumber ? (
                        <Link
                          to={`/finance/billing/${s.regnumber}`}
                          className="text-brand hover:underline"
                        >
                          {s.regnumber}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-500 whitespace-nowrap">{s.email ?? '—'}</td>
                    <td className="px-4 py-3 text-ink-500 whitespace-nowrap">{s.gender ?? '—'}</td>
                    <td className="px-4 py-3 text-ink-500 whitespace-nowrap">{s.nationality ?? '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{feeStatusBadge(s.fee_status?.status ?? 'no_invoices')}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs whitespace-nowrap">
                      {formatCurrency(s.fee_status?.balance ?? 0)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!isLoading && rows.length > 0 && (
          <div className="px-4 py-3 border-t border-ink-100 dark:border-ink-800">
            <Pagination
              currentPage={currentPage}
              lastPage={lastPage}
              total={total}
              perPage={perPage}
              onPageChange={setPage}
            />
          </div>
        )}
      </div>
    </div>
  )
}
