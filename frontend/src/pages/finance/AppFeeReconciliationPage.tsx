import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  RefreshCw, Download, Play, CheckCircle2, Clock, UserX,
  ChevronLeft, ChevronRight, Search, Info,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { appFeeReconciliationService } from '@/services/financeService'
import { academicService } from '@/services/academicService'
import type { AppFeeReconciliationRow } from '@/services/financeService'
import type { AcademicYear } from '@/types/academic'

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n?: number | null) =>
  n == null ? '—' : `RWF ${Number(n).toLocaleString()}`

const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

type StatusFilter = 'all' | 'credited' | 'pending' | 'not_enrolled'

const STATUS_OPTIONS: { value: StatusFilter; label: string; colour: string }[] = [
  { value: 'all',          label: 'All',          colour: 'bg-ink-100 text-ink-700 dark:bg-ink-700 dark:text-ink-200' },
  { value: 'credited',     label: 'Credited',     colour: 'bg-green-100  text-green-700  dark:bg-green-900/40  dark:text-green-300' },
  { value: 'pending',      label: 'Pending',      colour: 'bg-amber-100  text-amber-700  dark:bg-amber-900/40  dark:text-amber-300' },
  { value: 'not_enrolled', label: 'Not Enrolled', colour: 'bg-blue-100   text-blue-700   dark:bg-blue-900/40   dark:text-blue-300' },
]

function RowStatusBadge({ row }: { row: AppFeeReconciliationRow }) {
  if (row.transfer_payment_id) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
        <CheckCircle2 className="w-3 h-3" /> Credited
      </span>
    )
  }
  if (row.enrolled_student_id) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
        <Clock className="w-3 h-3" /> Pending
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
      <UserX className="w-3 h-3" /> Not Enrolled
    </span>
  )
}

// ── AppFeeReconciliationPage ───────────────────────────────────────────────────

export default function AppFeeReconciliationPage() {
  const qc = useQueryClient()

  const [yearId,  setYearId]  = useState<number>(0)
  const [status,  setStatus]  = useState<StatusFilter>('all')
  const [page,    setPage]    = useState(1)

  // Academic years for filter dropdown
  const yearsQ = useQuery({
    queryKey: ['academic', 'years'],
    queryFn:  ({ signal }) => academicService.listYears(signal),
  })
  const years: AcademicYear[] = yearsQ.data?.data ?? []

  // Main reconciliation data
  const { data: res, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['finance', 'app-fee-reconciliation', yearId, status, page],
    queryFn:  ({ signal }) =>
      appFeeReconciliationService.list({ academic_year_id: yearId || undefined, status, page, per_page: 50 }, signal),
    placeholderData: (prev) => prev,
  })

  const report     = res?.data
  const rows       = report?.rows ?? []
  const summary    = report?.summary
  const pagination = report?.pagination

  // Batch run pending credits
  const runMut = useMutation({
    mutationFn: () => appFeeReconciliationService.runPending({ academic_year_id: yearId }),
    onSuccess: (r) => {
      const d = r.data!
      toast.success(`Done — ${d.credited} credited, ${d.skipped} skipped${d.errors ? `, ${d.errors} errors` : ''}.`)
      qc.invalidateQueries({ queryKey: ['finance', 'app-fee-reconciliation'] })
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message ?? 'Batch run failed.')
    },
  })

  // CSV export
  const exportCsv = () => {
    if (!rows.length) { toast.error('No data to export.'); return }
    const headers = ['Application #','Applicant','Email','App Fee (RWF)','Tx Ref','Paid At','Student ID','Invoice Type','Invoice Due','Invoice Paid','Invoice Status','Transfer ID','Transferred (RWF)','Transferred At']
    const csvRows = rows.map((r) => [
      r.application_number, r.applicant_name, r.email,
      r.application_fee_amount, r.application_tx_ref, r.application_paid_at,
      r.enrolled_student_id ?? '',
      r.invoice_fee_type ?? '', r.invoice_amount_due ?? '', r.invoice_amount_paid ?? '', r.invoice_status ?? '',
      r.transfer_payment_id ?? '', r.transferred_amount ?? '', r.transferred_at ?? '',
    ].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    const blob = new Blob([[headers.join(','), ...csvRows].join('\n')], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `app-fee-reconciliation-${new Date().toISOString().slice(0,10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-ink-900 dark:text-ink-100">
            Application Fee Reconciliation
          </h2>
          <p className="text-xs text-ink-500 dark:text-ink-400 mt-0.5">
            Track application payments and verify they are credited to student billing accounts.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="btn-ghost flex items-center gap-1.5 text-xs px-3 py-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={exportCsv}
            className="btn-ghost flex items-center gap-1.5 text-xs px-3 py-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
          {(summary?.pending_count ?? 0) > 0 && (
            <button
              onClick={() => {
                if (!yearId) { toast.error('Select an academic year before running batch credit.'); return }
                runMut.mutate()
              }}
              disabled={runMut.isPending}
              className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5"
            >
              <Play className="w-3.5 h-3.5" />
              {runMut.isPending
                ? 'Running…'
                : `Credit ${summary?.pending_count ?? ''} Pending`}
            </button>
          )}
        </div>
      </div>

      {/* Note when table is missing */}
      {report?.note && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {report.note}
        </div>
      )}

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Applications Paid', value: summary.total_applications, mono: false },
            { label: 'Total Collected',   value: fmt(summary.total_amount_collected), mono: true },
            { label: 'Credited',          value: summary.credited_count, mono: false, colour: 'text-green-600 dark:text-green-400' },
            { label: 'Credited Amount',   value: fmt(summary.credited_amount), mono: true, colour: 'text-green-600 dark:text-green-400' },
            { label: 'Pending Credit',    value: summary.pending_count, mono: false, colour: 'text-amber-600 dark:text-amber-400' },
            { label: 'Not Enrolled',      value: summary.not_enrolled_count, mono: false, colour: 'text-blue-600 dark:text-blue-400' },
          ].map((c) => (
            <div key={c.label} className="card p-3 space-y-0.5">
              <p className="text-[10px] font-medium text-ink-400 dark:text-ink-500 uppercase tracking-wide">{c.label}</p>
              <p className={`text-lg font-bold ${c.colour ?? 'text-ink-900 dark:text-ink-100'}`}>
                {c.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="card p-3 flex items-center gap-3 flex-wrap">
        {/* Year filter */}
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

        {/* Status filter pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {STATUS_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => { setStatus(o.value); setPage(1) }}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all border ${
                status === o.value
                  ? o.colour + ' border-transparent shadow-sm'
                  : 'border-ink-200 dark:border-ink-700 text-ink-500 dark:text-ink-400 hover:bg-ink-50 dark:hover:bg-ink-800'
              }`}
            >
              {o.label}
              {o.value !== 'all' && summary && (
                <span className="ml-1 opacity-70">
                  ({
                    o.value === 'credited'     ? summary.credited_count     :
                    o.value === 'pending'      ? summary.pending_count      :
                    o.value === 'not_enrolled' ? summary.not_enrolled_count : ''
                  })
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-200 dark:border-ink-700 bg-ink-50 dark:bg-ink-800/50">
                {['Date Paid','Application #','Applicant','App Fee','Tx Reference','Student ID','Invoice Type','Inv. Due','Inv. Paid','Status'].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold text-ink-500 dark:text-ink-400 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-sm text-ink-400">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center">
                    <div className="flex flex-col items-center gap-2 text-ink-400 dark:text-ink-500">
                      <Search className="w-8 h-8 opacity-30" />
                      <p className="text-sm font-medium">No records found</p>
                      <p className="text-xs">Try adjusting the filters above.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.application_id}
                    className="hover:bg-ink-50/60 dark:hover:bg-ink-800/40 transition-colors"
                  >
                    <td className="px-3 py-2.5 text-xs text-ink-500 whitespace-nowrap">
                      {fmtDate(row.application_paid_at)}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-ink-700 dark:text-ink-300 whitespace-nowrap">
                      {row.application_number}
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="text-sm font-medium text-ink-800 dark:text-ink-200 whitespace-nowrap">
                        {row.applicant_name}
                      </p>
                      <p className="text-[11px] text-ink-400">{row.email}</p>
                    </td>
                    <td className="px-3 py-2.5 text-sm font-semibold text-ink-800 dark:text-ink-200 whitespace-nowrap">
                      {fmt(row.application_fee_amount)}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-brand dark:text-gold-400 whitespace-nowrap">
                      {row.application_tx_ref ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-ink-600 dark:text-ink-300 whitespace-nowrap">
                      {row.enrolled_student_id ?? <span className="text-ink-300 dark:text-ink-600">Not enrolled</span>}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-ink-600 dark:text-ink-300 whitespace-nowrap">
                      {row.invoice_fee_type ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 text-sm text-ink-700 dark:text-ink-300 whitespace-nowrap">
                      {fmt(row.invoice_amount_due)}
                    </td>
                    <td className="px-3 py-2.5 text-sm font-medium whitespace-nowrap">
                      {row.invoice_amount_paid != null
                        ? <span className="text-green-600 dark:text-green-400">{fmt(row.invoice_amount_paid)}</span>
                        : <span className="text-ink-300 dark:text-ink-600">—</span>
                      }
                    </td>
                    <td className="px-3 py-2.5">
                      <RowStatusBadge row={row} />
                      {row.transfer_receipt && (
                        <p className="text-[10px] text-ink-400 mt-0.5 font-mono">{row.transfer_receipt}</p>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
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
