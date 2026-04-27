import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, XCircle, Loader2, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { paymentService } from '@/services/financeService'
import type { FeePayment } from '@/types/finance'
import { PAYMENT_METHOD_LABELS, FEE_TYPE_LABELS } from '@/types/finance'
import { formatRWF } from '@/utils/formatCurrency'
import Pagination from '@/components/ui/Pagination'

const PER_PAGE = 20

export default function PaymentApprovalsPage() {
  const qc = useQueryClient()
  const [filterStatus, setFilterStatus] = useState<'pending' | 'confirmed' | 'rejected'>('pending')
  const [page, setPage] = useState(1)
  const [rejectingId, setRejectingId] = useState<number | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const paymentsQ = useQuery({
    queryKey: ['finance', 'payments', 'approvals', filterStatus, page],
    queryFn: () => paymentService.list({ status: filterStatus, page, per_page: PER_PAGE }),
    refetchInterval: filterStatus === 'pending' ? 15_000 : false,
  })

  const paginatedData = paymentsQ.data?.data as any
  const rows: FeePayment[] = paginatedData?.data ?? []
  const total    = paginatedData?.total ?? 0
  const lastPage = paginatedData?.last_page ?? 1
  const currentPg = paginatedData?.current_page ?? 1

  const approveMut = useMutation({
    mutationFn: (id: number) => paymentService.approve(id),
    onSuccess: () => {
      toast.success('Payment approved — invoice updated')
      qc.invalidateQueries({ queryKey: ['finance', 'payments'] })
      qc.invalidateQueries({ queryKey: ['finance', 'ledger'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Approval failed'),
  })

  const rejectMut = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => paymentService.reject(id, reason),
    onSuccess: () => {
      toast.success('Payment rejected')
      qc.invalidateQueries({ queryKey: ['finance', 'payments'] })
      setRejectingId(null)
      setRejectReason('')
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Rejection failed'),
  })

  const statusColor: Record<string, string> = {
    pending:   'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    confirmed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    rejected:  'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-ink-900 dark:text-white">Payment Approvals</h2>
          <p className="text-[13px] text-ink-500">Review and approve or reject submitted payments.</p>
        </div>

        {/* Status tabs */}
        <div className="flex gap-1 bg-ink-100 dark:bg-ink-700/50 rounded-lg p-1">
          {(['pending', 'confirmed', 'rejected'] as const).map(s => (
            <button
              key={s}
              onClick={() => { setFilterStatus(s); setPage(1) }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md capitalize transition-all ${
                filterStatus === s
                  ? 'bg-white dark:bg-ink-800 shadow-sm text-ink-900 dark:text-white'
                  : 'text-ink-500 hover:text-ink-700'
              }`}
            >
              {s}
              {s === 'pending' && total > 0 && filterStatus === 'pending' && (
                <span className="ml-1.5 bg-red-500 text-white text-[9px] font-bold px-1 rounded-full">{total}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {paymentsQ.isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-brand" />
          </div>
        )}
        {!paymentsQ.isLoading && rows.length === 0 && (
          <div className="flex flex-col items-center py-12 text-ink-400">
            <CheckCircle className="w-8 h-8 mb-2 text-green-400" />
            <p className="text-sm">No {filterStatus} payments</p>
          </div>
        )}
        {rows.length > 0 && (
          <>
            <table className="w-full text-sm">
              <thead className="bg-ink-50 dark:bg-ink-700/50 text-ink-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-2.5 text-left">Receipt #</th>
                  <th className="px-4 py-2.5 text-left">Student</th>
                  <th className="px-4 py-2.5 text-left">Invoice</th>
                  <th className="px-4 py-2.5 text-left">Method</th>
                  <th className="px-4 py-2.5 text-right">Amount</th>
                  <th className="px-4 py-2.5 text-left">Date</th>
                  <th className="px-4 py-2.5 text-center">Status</th>
                  {filterStatus === 'pending' && <th className="px-4 py-2.5 text-center">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                {rows.map((p: FeePayment) => (
                  <tr key={p.id} className="hover:bg-ink-50/50 dark:hover:bg-ink-700/30">
                    <td className="px-4 py-3 font-mono text-xs text-brand">{p.receipt_number}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{p.student_fname} {p.student_lname}</p>
                      <p className="text-xs text-ink-400 font-mono">{p.student_id}</p>
                    </td>
                    <td className="px-4 py-3 text-ink-500 text-xs">
                      {p.fee_type ? FEE_TYPE_LABELS[p.fee_type] : p.invoice_number}
                    </td>
                    <td className="px-4 py-3">
                      {PAYMENT_METHOD_LABELS[p.payment_method] ?? p.payment_method}
                      {p.reference_number && (
                        <p className="text-[10px] text-ink-400 font-mono">{p.reference_number}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-ink-900 dark:text-white">
                      {formatRWF(p.amount)}
                    </td>
                    <td className="px-4 py-3 text-ink-500 text-xs">
                      {p.paid_at ? new Date(p.paid_at).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusColor[p.status]}`}>
                        {p.status}
                      </span>
                      {p.status === 'rejected' && p.rejection_reason && (
                        <p className="text-[10px] text-red-500 mt-0.5 max-w-[120px] truncate">{p.rejection_reason}</p>
                      )}
                    </td>
                    {filterStatus === 'pending' && (
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-green-700 bg-green-100 hover:bg-green-200 rounded-md transition-colors disabled:opacity-50"
                            onClick={() => approveMut.mutate(p.id)}
                            disabled={approveMut.isPending}
                          >
                            {approveMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                            Approve
                          </button>
                          <button
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-red-700 bg-red-100 hover:bg-red-200 rounded-md transition-colors"
                            onClick={() => { setRejectingId(p.id); setRejectReason('') }}
                          >
                            <XCircle className="w-3 h-3" />
                            Reject
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            {lastPage > 1 && (
              <div className="px-4 py-3 border-t border-ink-100 dark:border-ink-700">
                <Pagination currentPage={currentPg} lastPage={lastPage} total={total} perPage={PER_PAGE} onPageChange={setPage} />
              </div>
            )}
          </>
        )}
      </div>

      {/* Reject reason modal */}
      {rejectingId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-ink-800 rounded-2xl shadow-2xl border border-ink-100 dark:border-ink-700 w-full max-w-sm p-6 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-ink-900 dark:text-white">Reject Payment</h3>
                <p className="text-[13px] text-ink-500 mt-1">Please provide a reason for rejection. This will be recorded and the student will be notified.</p>
              </div>
            </div>
            
            <div>
              <label className="block text-[11px] uppercase tracking-wider font-bold text-ink-400 mb-1.5">Rejection Reason</label>
              <textarea
                className="input w-full resize-none text-sm bg-ink-50 dark:bg-ink-900"
                rows={3}
                placeholder="e.g. Payment reference not found in bank records..."
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
              />
            </div>

            <div className="flex gap-2 justify-end pt-2 border-t border-ink-100 dark:border-ink-700">
              <button className="btn-ghost" onClick={() => setRejectingId(null)}>Cancel</button>
              <button
                className="btn-primary bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700 text-white rounded-xl px-4 flex items-center gap-2 disabled:opacity-50 transition-transform active:scale-95"
                disabled={!rejectReason.trim() || rejectMut.isPending}
                onClick={() => rejectMut.mutate({ id: rejectingId, reason: rejectReason })}
              >
                {rejectMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
