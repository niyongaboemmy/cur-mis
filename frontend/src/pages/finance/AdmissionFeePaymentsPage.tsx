import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, ChevronLeft, ChevronRight, Search, CheckCircle2, Clock } from 'lucide-react'
import { admissionFeePaymentsService } from '@/services/financeService'
import { academicService } from '@/services/academicService'
import type { AcademicYear } from '@/types/academic'

const fmt = (n?: number | null) =>
  n == null ? '—' : `RWF ${Number(n).toLocaleString()}`

const fmtDate = (s?: string | null) =>
  s ? new Date(s.replace(' ', 'T')).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

/**
 * Admission-fee payments (Registration, CURSU …) across all applicants.
 * Shown here from the moment the money arrives, not only once the applicant
 * has been enrolled and the ledger copy has run.
 */
export default function AdmissionFeePaymentsPage() {
  const [yearId, setYearId] = useState<number>(0)
  const [page, setPage] = useState(1)

  const yearsQ = useQuery({
    queryKey: ['academic', 'years'],
    queryFn: ({ signal }) => academicService.listYears(signal),
  })
  const years: AcademicYear[] = yearsQ.data?.data ?? []

  const { data: res, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['finance', 'admission-fee-payments', yearId, page],
    queryFn: ({ signal }) =>
      admissionFeePaymentsService.list({ academic_year_id: yearId || undefined, page, per_page: 50 }, signal),
    placeholderData: (prev) => prev,
    // New payments arrive from the gateway while finance has the page open.
    refetchInterval: 15000,
  })

  const report = res?.data
  const rows = report?.rows ?? []
  const summary = report?.summary
  const pagination = report?.pagination

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-ink-900 dark:text-ink-100">Admission Fee Payments</h2>
          <p className="text-xs text-ink-500 dark:text-ink-400 mt-0.5">
            Registration and CURSU payments made by applicants. Shown as soon as they are received,
            whether or not the applicant has been enrolled yet.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="btn-ghost flex items-center gap-1.5 text-xs px-3 py-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: 'Payments', value: summary.count.toLocaleString() },
            { label: 'Applicants', value: summary.applicants.toLocaleString() },
            { label: 'Total Received', value: fmt(summary.total_amount) },
          ].map((c) => (
            <div key={c.label} className="card p-3 space-y-0.5">
              <p className="text-[10px] font-medium text-ink-400 dark:text-ink-500 uppercase tracking-wide">{c.label}</p>
              <p className="text-lg font-bold text-ink-900 dark:text-ink-100">{c.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="card p-3 flex items-center gap-3 flex-wrap">
        <select
          value={yearId}
          onChange={(e) => { setYearId(Number(e.target.value)); setPage(1) }}
          className="input text-sm py-1.5 pr-8 min-w-[160px]"
        >
          <option value={0}>All Academic Years</option>
          {years.map((y) => (
            <option key={y.id} value={y.id}>{y.label}</option>
          ))}
        </select>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-200 dark:border-ink-700 bg-ink-50 dark:bg-ink-800/50">
                {['Date Paid', 'Application #', 'Applicant', 'Fee', 'Amount', 'Reference', 'Receipt', 'Channel', 'Bill Status', 'Student ID'].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold text-ink-500 dark:text-ink-400 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-sm text-ink-400">Loading…</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center">
                    <div className="flex flex-col items-center gap-2 text-ink-400 dark:text-ink-500">
                      <Search className="w-8 h-8 opacity-30" />
                      <p className="text-sm font-medium">No admission fee payments yet</p>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="hover:bg-ink-50/60 dark:hover:bg-ink-800/40 transition-colors">
                    <td className="px-3 py-2.5 text-xs text-ink-500 whitespace-nowrap">{fmtDate(row.paid_at)}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-ink-700 dark:text-ink-300 whitespace-nowrap">{row.application_number}</td>
                    <td className="px-3 py-2.5">
                      <p className="text-sm font-medium text-ink-800 dark:text-ink-200 whitespace-nowrap">{row.applicant_name}</p>
                      <p className="text-[11px] text-ink-400">{row.email}</p>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-ink-600 dark:text-ink-300 whitespace-nowrap">{row.label}</td>
                    <td className="px-3 py-2.5 text-sm font-semibold text-ink-800 dark:text-ink-200 whitespace-nowrap">{fmt(row.amount)}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-ink-600 dark:text-ink-300 whitespace-nowrap">{row.reference_number}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-ink-500 whitespace-nowrap">{row.receipt_number || '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-ink-500 whitespace-nowrap">
                      {row.source === 'GATEWAY' ? 'Urubuto Pay' : row.source === 'MANUAL' ? 'Offline' : row.source || '—'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {row.bill_status === 'paid' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
                          <CheckCircle2 className="w-3 h-3" /> Paid
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                          <Clock className="w-3 h-3" /> {row.bill_status === 'partial' ? 'Part paid' : 'Outstanding'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-ink-600 dark:text-ink-300 whitespace-nowrap">
                      {row.enrolled_student_id ?? <span className="text-ink-300 dark:text-ink-600">Not enrolled</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pagination && pagination.last_page > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-ink-100 dark:border-ink-800">
            <p className="text-xs text-ink-500">
              Page {pagination.current_page} of {pagination.last_page} · {pagination.total} records
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded border border-ink-200 dark:border-ink-700 text-ink-500 hover:bg-ink-50 dark:hover:bg-ink-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pagination.last_page, p + 1))}
                disabled={page >= pagination.last_page}
                className="p-1.5 rounded border border-ink-200 dark:border-ink-700 text-ink-500 hover:bg-ink-50 dark:hover:bg-ink-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
