import { useQuery } from '@tanstack/react-query'
import { Loader2, DollarSign, CheckCircle2, AlertCircle } from 'lucide-react'

/**
 * Payment History Panel
 *
 * Shows staff validation view: payment records from payment table
 * Displays: transaction codes, amounts, dates, payment methods
 *
 * Used alongside AdmissionFeesPanel to give staff complete payment visibility
 */
export default function PaymentHistoryPanel({
  studentId,
  applicationId,
  className = '',
}: {
  studentId?: string
  applicationId?: number
  className?: string
}) {
  const paymentsQ = useQuery({
    queryKey: ['payment-history', studentId, applicationId],
    queryFn: async ({ signal }) => {
      if (!studentId) return null

      const response = await fetch(
        `/api/admissions/applications/${applicationId}/payments?student_id=${studentId}`,
        { signal }
      )

      if (!response.ok) {
        if (response.status === 404) return null
        throw new Error('Failed to fetch payment history')
      }

      return response.json()
    },
    enabled: !!studentId && !!applicationId,
    retry: false,
  })

  const data = paymentsQ.data?.data
  const payments = data?.payments ?? []
  const totalPaid = data?.total_paid ?? 0
  const paymentCount = data?.payment_count ?? 0

  if (!studentId || !applicationId) {
    return null
  }

  if (paymentsQ.isLoading) {
    return (
      <section className={`card p-6 ${className}`}>
        <div className="flex items-center gap-3 text-ink-400 text-[13px]">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          Loading payment history…
        </div>
      </section>
    )
  }

  if (paymentsQ.isError || !data) {
    return null
  }

  // No payments yet
  if (payments.length === 0) {
    return (
      <section className={`card p-6 ${className}`}>
        <div className="flex items-start gap-4">
          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h3 className="text-[13.5px] font-semibold text-ink-900 dark:text-white">
              No payments recorded
            </h3>
            <p className="text-[12px] text-ink-500 mt-1">
              This applicant has not yet made any admission fee payments.
            </p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className={`card p-6 space-y-5 ${className}`}>
      {/* Header */}
      <div>
        <h2 className="text-[14px] font-semibold text-ink-900 dark:text-white flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-emerald-500" />
          Payment History
        </h2>
        <p className="text-[12px] text-ink-500 mt-1">
          All recorded payments from the payment system
        </p>
      </div>

      {/* Summary Card */}
      <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/30 bg-emerald-50 dark:bg-emerald-950/20 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">
              Total Paid
            </p>
            <p className="text-[28px] font-bold text-emerald-900 dark:text-emerald-300 mt-1">
              {new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'RWF',
                minimumFractionDigits: 0,
              }).format(totalPaid)}
            </p>
          </div>
          <div className="text-right">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
            <p className="text-[12px] font-medium text-emerald-700 dark:text-emerald-400 mt-2">
              {paymentCount} transaction{paymentCount !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Payment List */}
      <div className="space-y-2">
        <p className="text-[11px] font-semibold text-ink-500 uppercase tracking-wide px-1">
          Transaction Details
        </p>

        <div className="rounded-lg border border-ink-100 dark:border-ink-700 divide-y divide-ink-100 dark:divide-ink-700 overflow-hidden">
          {payments.map((payment: any, idx: number) => (
            <div key={idx} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-ink-50/50 dark:hover:bg-ink-800/30 transition-colors">
              {/* Left: Code & Method */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <code className="text-[11px] font-mono font-semibold text-ink-900 dark:text-ink-100 bg-ink-100 dark:bg-ink-700 px-2 py-0.5 rounded">
                    {payment.trans_code}
                  </code>
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                    {payment.payment_chanel}
                  </span>
                </div>
                <p className="text-[11px] text-ink-500">
                  {new Date(payment.date).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>

              {/* Right: Amount */}
              <div className="text-right">
                <p className="text-[13px] font-semibold text-emerald-600 dark:text-emerald-400">
                  +{new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'RWF',
                    minimumFractionDigits: 0,
                  }).format(payment.amount)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Info Box */}
      <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/30 p-4">
        <p className="text-[12px] text-blue-900 dark:text-blue-200 leading-relaxed">
          <strong>For staff validation:</strong> This panel shows all confirmed payments from Urubuto Pay and other payment channels. Cross-reference with the admission fees panel above to determine if the applicant has paid in full.
        </p>
      </div>
    </section>
  )
}
