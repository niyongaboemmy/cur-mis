import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, X, Banknote, AlertCircle } from 'lucide-react'
import { ledgerService } from '@/services/financeService'
import type { FeeInvoice } from '@/types/finance'
import { FEE_TYPE_LABELS } from '@/types/finance'
import { formatRWF } from '@/utils/formatCurrency'
import RecordPaymentModal from '@/pages/finance/RecordPaymentModal'
import InvoiceStatusBadge from '@/components/finance/InvoiceStatusBadge'

interface Props {
  studentId:      string
  studentName:    string
  academicYearId: number
  onClose: () => void
  onDone:  () => void
}

export default function RecordPaymentStudentModal({
  studentId, studentName, academicYearId, onClose, onDone,
}: Props) {
  const [selectedInvoice, setSelectedInvoice] = useState<FeeInvoice | null>(null)

  const ledgerQ = useQuery({
    queryKey: ['finance', 'ledger', studentId, academicYearId],
    queryFn: () => ledgerService.getStudentLedger(studentId, { academic_year_id: academicYearId }),
  })

  const invoices: FeeInvoice[] = (ledgerQ.data?.data?.invoices ?? []).filter(
    (inv: FeeInvoice) =>
      inv.status !== 'paid' && inv.status !== 'waived' && inv.fee_type !== 'BURSARY_CREDIT',
  )

  // If user picked an invoice, hand off to the existing full-featured modal
  if (selectedInvoice) {
    return (
      <RecordPaymentModal
        invoice={selectedInvoice}
        onClose={() => setSelectedInvoice(null)}
        onDone={onDone}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-300 overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-ink-100 dark:border-ink-800">
            <div>
              <h3 className="text-base font-bold text-ink-900 dark:text-white">Record Payment</h3>
              <p className="text-xs text-ink-500 mt-0.5">{studentName} · <span className="font-mono">{studentId}</span></p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-ink-100 dark:hover:bg-ink-800 text-ink-400 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6">
            {ledgerQ.isLoading && (
              <div className="flex items-center justify-center py-10 gap-2 text-ink-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Loading invoices…</span>
              </div>
            )}

            {!ledgerQ.isLoading && invoices.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-10 text-ink-400 text-center">
                <AlertCircle className="w-8 h-8 opacity-40" />
                <p className="text-sm">No open invoices found for this student in the selected year.</p>
                <button className="btn-ghost btn-sm mt-1" onClick={onClose}>Close</button>
              </div>
            )}

            {!ledgerQ.isLoading && invoices.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs text-ink-500 font-medium uppercase tracking-wide mb-4">
                  Select an invoice to pay
                </p>
                {invoices.map((inv) => {
                  const balance =
                    Number(inv.amount_due) -
                    Number(inv.amount_paid) -
                    Number(inv.bursary_applied ?? 0)
                  return (
                    <button
                      key={inv.id}
                      onClick={() => setSelectedInvoice(inv)}
                      className="w-full text-left flex items-center gap-4 p-4 rounded-xl border border-ink-100 dark:border-ink-800 hover:border-brand hover:bg-brand/5 dark:hover:border-brand/60 transition-all group"
                    >
                      <div className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center text-brand shrink-0">
                        <Banknote className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-ink-800 dark:text-ink-100">
                          {FEE_TYPE_LABELS[inv.fee_type] ?? inv.fee_type}
                        </p>
                        <p className="text-[11px] text-ink-400 font-mono truncate">{inv.invoice_number}</p>
                      </div>
                      <div className="text-right shrink-0 space-y-1">
                        <InvoiceStatusBadge status={inv.status} />
                        <p className="text-sm font-bold text-red-600">{formatRWF(balance)}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
