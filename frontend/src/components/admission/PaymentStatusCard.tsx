import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { admissionBillingService, type AdmissionPaymentStatus } from '@/services/admissionService'

interface Props {
  applicationId: number
}

const money = (n: number) => `${Math.round(n).toLocaleString()} RWF`

/**
 * What the applicant has paid against what they owe, read from the payment
 * ledgers. The next step stays blocked until `sufficient` is true.
 */
export default function PaymentStatusCard({ applicationId }: Props) {
  const statusQ = useQuery({
    queryKey: ['admission-payment-status', applicationId],
    queryFn: ({ signal }) => admissionBillingService.paymentStatus(applicationId, signal),
    select: (res) => res.data as AdmissionPaymentStatus | undefined,
    refetchInterval: 15000,
  })

  const s = statusQ.data
  if (!s) {
    return null
  }

  const ok = s.billed && s.sufficient
  const tone = !s.billed
    ? 'border-ink-200 bg-ink-50 text-ink-700 dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-200'
    : ok
      ? 'border-green-500 bg-green-50 text-green-900 dark:bg-green-950/30 dark:text-green-100'
      : 'border-red-500 bg-red-50 text-red-900 dark:bg-red-950/30 dark:text-red-100'

  return (
    <div className={`rounded-2xl border-2 p-5 text-left space-y-4 ${tone}`}>
      <div className="flex items-start gap-3">
        {ok
          ? <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0" />
          : <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />}
        <div>
          <p className="text-[14px] font-black uppercase tracking-tight">
            {!s.billed ? 'Nothing billed yet' : ok ? 'Payment sufficient — next step can proceed' : 'Payment insufficient'}
          </p>
          <p className="text-[12px] mt-1">{s.message}</p>
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-3 text-[12px]">
        <div>
          <dt className="uppercase tracking-wide opacity-70">Total required</dt>
          <dd className="font-black text-[15px]">{money(s.required)}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-wide opacity-70">Total paid</dt>
          <dd className="font-black text-[15px]">{money(s.paid)}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-wide opacity-70">Balance</dt>
          <dd className="font-black text-[15px]">{money(s.balance)}</dd>
        </div>
      </dl>

      {s.bills.length > 0 && (
        <ul className="space-y-1 text-[12px]">
          {s.bills.map((b) => (
            <li key={b.id} className="flex justify-between gap-3">
              <span>{b.label}</span>
              <span>
                {money(b.paid)} of {money(b.due)}
                {b.balance > 0 ? ` — ${money(b.balance)} unpaid` : ' — paid'}
              </span>
            </li>
          ))}
        </ul>
      )}

      {s.payments.length > 0 ? (
        <div className="text-[12px]">
          <p className="uppercase tracking-wide opacity-70 mb-1">Payments recorded</p>
          <ul className="space-y-1">
            {s.payments.map((p, i) => (
              <li key={`${p.reference}-${i}`} className="flex justify-between gap-3">
                <span>
                  {p.label} · {p.source} · ref {p.reference}
                </span>
                <span>
                  {money(p.amount)} · {p.paid_at}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-[12px] opacity-80">No payments recorded against the admission fees.</p>
      )}

      {s.recorded_on_application.amount > 0 && !s.recorded_on_application.matches_ledger && (
        <p className="text-[11px] opacity-80">
          The application record shows {money(s.recorded_on_application.amount)} but the payment ledger shows{' '}
          {money(s.paid)}. The ledger is used for this check.
        </p>
      )}
    </div>
  )
}
