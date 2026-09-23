import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  AlertCircle, ArrowRight, BadgeCheck, CheckCircle2, Copy, CreditCard, ExternalLink,
  Hash, Loader2, Receipt, ShieldCheck, Sparkles, Wallet,
} from 'lucide-react'
import { applicantService, type ApplicationFeeSummary } from '@/services/admissionService'

/**
 * ApplicationFeeProgress
 *
 * The applicant's view of the APPLICATION (processing) fee: what the published
 * fee structure says they owe, what has reached the account, and what is left.
 *
 * It exists because Urubuto Pay lets the payer name the amount. A 5,000 RWF fee
 * met with 100 used to render as "Amount Paid: 100.00 RWF" with nothing to say
 * it was short — so the balance is the loudest thing on the card whenever there
 * is one, and the card goes quiet and green once the fee is settled.
 *
 * It polls while money is still owed, so a payment confirmed server-to-server
 * by the gateway appears without the applicant refreshing anything.
 */
export default function ApplicationFeeProgress({
  applicationId,
  paymentSlip,
  className = '',
}: {
  /** The application being viewed — the card stays read-only if it is not the applicant's active one. */
  applicationId: number
  /** Rendered under the ledger when the application carries an uploaded slip. */
  paymentSlip?: React.ReactNode
  className?: string
}) {
  const qc = useQueryClient()
  const [opened, setOpened] = useState(false)
  const [devAmount, setDevAmount] = useState('')

  const statusQ = useQuery({
    queryKey: ['applicant', 'application-fee'],
    queryFn: ({ signal }) => applicantService.getPaymentStatus(signal),
    retry: false,
    // Keep watching while anything is owed — the gateway confirms out of band.
    refetchInterval: (query) => {
      const d = query.state.data?.data
      if (!d) return false
      return d.balance > 0 ? (opened ? 4000 : 15000) : false
    },
    refetchIntervalInBackground: true,
  })

  const checkoutQ = useQuery({
    queryKey: ['applicant', 'application-fee', 'checkout'],
    queryFn: ({ signal }) => applicantService.getPaymentCheckout(signal),
    retry: false,
    staleTime: 60_000,
  })

  const data = statusQ.data?.data
  const checkout = checkoutQ.data?.data
  const devMode = Boolean(data?.dev_mode ?? checkout?.dev_mode)

  // The payment endpoints are scoped to the applicant's active application. A
  // second, older application must not be shown another one's balance.
  const isThisApplication = !data || data.application_id === applicationId

  const simulate = useMutation({
    mutationFn: (amount?: number) => applicantService.simulatePayment(amount),
    onSuccess: (res) => {
      toast.success(res.message ?? 'Payment recorded.')
      setDevAmount('')
      qc.invalidateQueries({ queryKey: ['applicant'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Could not record the payment.'),
  })

  const payNow = () => {
    if (!checkout?.merchant_code || !checkout?.payer_code) {
      toast.error('Payment information is not ready — please try again.')
      checkoutQ.refetch()
      return
    }

    // POST rather than a link: the hosted checkout reads the merchant and payer
    // codes from the form body, the same way AdmissionFeesPanel opens it.
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = 'https://urubutopay.rw/pay-now?origin=internal'
    form.target = '_blank'
    for (const [name, value] of [
      ['merchant_code', checkout.merchant_code],
      ['payer_code', checkout.payer_code],
    ] as const) {
      const input = document.createElement('input')
      input.type = 'hidden'
      input.name = name
      input.value = value
      form.appendChild(input)
    }
    document.body.appendChild(form)
    form.submit()
    document.body.removeChild(form)

    setOpened(true)
    toast.success('Complete the payment in the Urubuto Pay tab, then come back here.')
    statusQ.refetch()
  }

  const copy = (label: string, value?: string | null) => {
    if (!value) return
    navigator.clipboard?.writeText(value).then(
      () => toast.success(`${label} copied`),
      () => toast.error('Could not copy'),
    )
  }

  if (statusQ.isLoading) {
    return (
      <section className={`card p-6 ${className}`}>
        <p className="text-[13px] text-ink-500 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Checking your application fee…
        </p>
      </section>
    )
  }

  if (!data || !isThisApplication) {
    return (
      <section className={`card p-6 space-y-4 ${className}`}>
        <CardHeader tone="neutral" title="Application fee" sub="Bank slip and transaction details." />
        <p className="text-[12.5px] text-ink-500">
          Fee details are shown on your active application.
        </p>
        {paymentSlip}
      </section>
    )
  }

  return (
    <FeeCard
      data={data}
      className={className}
      onPay={payNow}
      paying={checkoutQ.isFetching}
      copy={copy}
      merchantCode={checkout?.merchant_code ?? null}
      payerCode={checkout?.payer_code ?? data.application_number ?? null}
      checkoutUrl={checkout?.checkout_url ?? null}
      devMode={devMode}
      devAmount={devAmount}
      onDevAmount={setDevAmount}
      onSimulate={(amount) => simulate.mutate(amount)}
      simulating={simulate.isPending}
      paymentSlip={paymentSlip}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────

const money = (n: number, currency = 'RWF') =>
  `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n))} ${currency}`

const when = (v: string | null | undefined) => {
  if (!v) return '—'
  const d = new Date(v.replace(' ', 'T'))
  return isNaN(d.getTime())
    ? v
    : d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

type Tone = 'emerald' | 'amber' | 'neutral'

function CardHeader({ tone, title, sub }: { tone: Tone; title: string; sub: string }) {
  const ring = {
    emerald: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600',
    amber:   'bg-amber-50 dark:bg-amber-900/20 text-amber-600',
    neutral: 'bg-primary-50 dark:bg-primary-900/20 text-primary-600',
  }[tone]

  return (
    <div className="flex items-start gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${ring}`}>
        <CreditCard className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <h2 className="section-title">{title}</h2>
        <p className="section-sub">{sub}</p>
      </div>
    </div>
  )
}

function FeeCard({
  data, className, onPay, paying, copy, merchantCode, payerCode, checkoutUrl,
  devMode, devAmount, onDevAmount, onSimulate, simulating, paymentSlip,
}: {
  data: ApplicationFeeSummary & { dev_mode?: boolean; application_number?: string | null }
  className: string
  onPay: () => void
  paying: boolean
  copy: (label: string, value?: string | null) => void
  merchantCode: string | null
  payerCode: string | null
  checkoutUrl: string | null
  devMode: boolean
  devAmount: string
  onDevAmount: (v: string) => void
  onSimulate: (amount?: number) => void
  simulating: boolean
  paymentSlip?: React.ReactNode
}) {
  const settled = data.fully_paid
  const started = data.paid > 0

  const percent = useMemo(() => Math.max(settled ? 100 : 2, Math.min(100, data.percent)), [data.percent, settled])

  return (
    <section className={`card p-0 overflow-hidden ${className}`}>
      {/* ── Banner: the balance is the headline whenever there is one ────── */}
      <div
        className={
          settled
            ? 'relative p-6 sm:p-7 bg-gradient-to-br from-emerald-600 via-emerald-600 to-emerald-800 text-white'
            : started
              ? 'relative p-6 sm:p-7 bg-gradient-to-br from-amber-500 via-amber-600 to-orange-700 text-white'
              : 'relative p-6 sm:p-7 bg-gradient-to-br from-primary-700 via-primary-700 to-primary-900 text-white'
        }
      >
        <div className="pointer-events-none absolute -top-16 -right-16 w-56 h-56 rounded-full bg-white/10 blur-3xl" />

        <div className="relative flex items-start justify-between gap-5 flex-wrap">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.2em] font-bold text-white/70">
              {data.quote.label || 'Application Fee'}
            </p>
            <p className="text-[30px] sm:text-[34px] font-black tabular-nums leading-tight mt-1">
              {settled ? money(data.paid, data.currency) : money(data.balance, data.currency)}
            </p>
            <p className="text-[12.5px] text-white/80 mt-1">
              {settled
                ? data.status === 'overpaid'
                  ? 'Paid in full — an overpayment is on record and will be carried onto your admission fees.'
                  : 'Paid in full. Nothing further is owed on your application fee.'
                : started
                  ? `still to pay — you have paid ${money(data.paid, data.currency)} of ${money(data.required, data.currency)}.`
                  : `to pay — your application is processed once this fee is settled.`}
            </p>
          </div>

          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-md border border-white/25 text-[12px] font-bold shrink-0">
            {settled
              ? <><BadgeCheck className="w-4 h-4" /> {data.status === 'overpaid' ? 'Overpaid' : 'Paid'}</>
              : started
                ? <><AlertCircle className="w-4 h-4" /> Part paid</>
                : <><Wallet className="w-4 h-4" /> Not paid</>}
          </span>
        </div>

        {/* ── Progress ───────────────────────────────────────────────────── */}
        <div className="relative mt-6">
          <div className="flex items-center justify-between text-[11.5px] font-semibold text-white/80 mb-2">
            <span>{money(data.paid, data.currency)} paid</span>
            <span className="tabular-nums">{data.percent}%</span>
            <span>{money(data.required, data.currency)} total</span>
          </div>
          <div
            className="h-2.5 w-full rounded-full bg-white/20 overflow-hidden"
            role="progressbar"
            aria-valuenow={data.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Application fee paid"
          >
            <div
              className="h-full rounded-full bg-white transition-[width] duration-700 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* ── The three numbers ──────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Figure label="Fee required" value={money(data.required, data.currency)} tone="neutral" />
          <Figure label="Paid to date" value={money(data.paid, data.currency)} tone={started ? 'emerald' : 'neutral'} />
          <Figure
            label={data.status === 'overpaid' ? 'Overpaid by' : 'Remaining'}
            value={money(
              data.status === 'overpaid' ? data.paid - data.required : data.balance,
              data.currency,
            )}
            tone={settled ? 'emerald' : 'amber'}
            emphasise={!settled}
          />
        </div>

        {/* ── What to do about it ────────────────────────────────────────── */}
        {!settled && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold text-amber-900 dark:text-amber-100">
                  {started
                    ? `${money(data.balance, data.currency)} still outstanding`
                    : 'Your application fee has not been paid'}
                </p>
                <p className="text-[12px] text-amber-700 dark:text-amber-200 mt-1 leading-relaxed">
                  Urubuto Pay lets you pay any amount, so part payments are accepted and added up here.
                  {' '}Your application is only processed once the full {money(data.required, data.currency)} is received.
                </p>

                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <button onClick={onPay} disabled={paying} className="btn-primary">
                    {paying
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Preparing…</>
                      : <>
                          <CreditCard className="w-4 h-4" />
                          Pay {money(data.balance, data.currency)}
                          <ArrowRight className="w-4 h-4" />
                        </>}
                  </button>
                  {checkoutUrl && (
                    <a
                      href={checkoutUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-amber-700 dark:text-amber-300 hover:underline"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Open the checkout link
                    </a>
                  )}
                </div>

                {(merchantCode || payerCode) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                    <CodeChip label="Merchant code" value={merchantCode} onCopy={copy} />
                    <CodeChip label="Payer code" value={payerCode} onCopy={copy} />
                  </div>
                )}

                <p className="text-[11.5px] text-amber-600 dark:text-amber-300/80 mt-3 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                  This page updates itself the moment Urubuto Pay confirms your payment.
                </p>
              </div>
            </div>
          </div>
        )}

        {settled && (
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-4 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-[12.5px] text-emerald-800 dark:text-emerald-200 leading-relaxed">
              Your application fee is fully settled
              {data.last_paid_at ? <> on <span className="font-semibold">{when(data.last_paid_at)}</span></> : null}.
              Keep your receipt reference for your records.
            </p>
          </div>
        )}

        {/* ── The ledger ─────────────────────────────────────────────────── */}
        {data.payments.length > 0 && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-ink-400 mb-2">
              {data.payments.length === 1 ? 'Payment received' : `Payments received (${data.payments.length})`}
            </p>
            <ol className="rounded-xl border border-ink-100 dark:border-ink-800 divide-y divide-ink-100 dark:divide-ink-800">
              {data.payments.map((p, i) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 flex items-center justify-center shrink-0">
                    <Receipt className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold text-ink-900 dark:text-white">
                      {money(p.amount, p.currency)}
                      {data.payments.length > 1 && (
                        <span className="ml-2 text-[11px] font-semibold text-ink-400">
                          instalment {i + 1}
                        </span>
                      )}
                      {p.source === 'SIMULATED' && (
                        <span className="ml-2 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-ink-100 dark:bg-ink-800 text-ink-500">
                          simulated
                        </span>
                      )}
                    </p>
                    <p className="text-[11.5px] text-ink-500 truncate flex items-center gap-1.5">
                      <Hash className="w-3 h-3 shrink-0" />
                      <span className="truncate font-mono">{p.reference_number}</span>
                    </p>
                  </div>
                  <p className="text-[11.5px] text-ink-500 shrink-0 text-right">{when(p.paid_at)}</p>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* ── Where the price comes from ─────────────────────────────────── */}
        <p className="text-[11.5px] text-ink-400 flex items-start gap-1.5">
          <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            {priceProvenance(data)}
          </span>
        </p>

        {paymentSlip}

        {/* ── Dev only ───────────────────────────────────────────────────── */}
        {devMode && !settled && (
          <div className="rounded-xl border border-dashed border-ink-200 dark:border-ink-700 p-3 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-widest text-ink-400">Dev</span>
            <input
              type="number"
              min={1}
              value={devAmount}
              onChange={(e) => onDevAmount(e.target.value)}
              placeholder={`Part amount (max ${Math.round(data.balance)})`}
              className="input h-9 text-[12px] w-56"
            />
            <button
              className="btn-secondary h-9 text-[12px]"
              disabled={simulating}
              onClick={() => onSimulate(devAmount ? Number(devAmount) : undefined)}
            >
              {simulating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Simulate {devAmount ? 'part payment' : 'full payment'}
            </button>
          </div>
        )}
      </div>
    </section>
  )
}

/** Says which rule priced the fee, so a misconfigured mapping is visible rather than silent. */
function priceProvenance(data: ApplicationFeeSummary): string {
  switch (data.quote.source) {
    case 'fee_structure_match':
    case 'fee_structure_institution_wide':
      return `Priced from the published application fee structure for your academic year and programme (${money(data.required, data.currency)}).`
    case 'frozen_quote':
      return `Priced at ${money(data.required, data.currency)} — the fee quoted when you started paying, held for you even if the published price changes.`
    case 'mapped_setting':
      return `Priced from the application fee structure mapped by the finance office (${money(data.required, data.currency)}).`
    default:
      return `Priced at ${money(data.required, data.currency)} from the institutional application fee setting — no fee structure is published for your programme yet.`
  }
}

function Figure({
  label, value, tone, emphasise = false,
}: {
  label: string
  value: string
  tone: Tone
  emphasise?: boolean
}) {
  const text = {
    emerald: 'text-emerald-600 dark:text-emerald-400',
    amber:   'text-amber-600 dark:text-amber-400',
    neutral: 'text-ink-900 dark:text-white',
  }[tone]

  return (
    <div
      className={`rounded-xl border p-4 ${
        emphasise
          ? 'border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20'
          : 'border-ink-100 dark:border-ink-800'
      }`}
    >
      <p className="text-[11px] font-bold uppercase tracking-widest text-ink-400">{label}</p>
      <p className={`text-[19px] font-black tabular-nums mt-1 ${text}`}>{value}</p>
    </div>
  )
}

function CodeChip({
  label, value, onCopy,
}: {
  label: string
  value: string | null
  onCopy: (label: string, value?: string | null) => void
}) {
  if (!value) return null
  return (
    <button
      type="button"
      onClick={() => onCopy(label, value)}
      className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white dark:bg-ink-900 border border-amber-200 dark:border-amber-800 text-left hover:border-amber-400 transition-colors"
      title={`Copy ${label.toLowerCase()}`}
    >
      <span className="min-w-0">
        <span className="block text-[10px] font-bold uppercase tracking-widest text-ink-400">{label}</span>
        <span className="block text-[12.5px] font-mono font-bold text-ink-900 dark:text-white truncate">{value}</span>
      </span>
      <Copy className="w-3.5 h-3.5 text-ink-400 shrink-0" />
    </button>
  )
}
