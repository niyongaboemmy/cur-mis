import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  AlertCircle, BadgeCheck, CheckCircle2, Copy, CreditCard, ExternalLink,
  Loader2, Receipt, ReceiptText, ShieldCheck, Wallet, BanknoteIcon, Upload, Lock, LockOpen, FileText, X,
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import BordereauPaymentForm from './BordereauPaymentForm'
import {
  admissionBillingService, applicantService,
  type AdmissionBill, type AdmissionBillingOverview,
} from '@/services/admissionService'

/**
 * AdmissionFeesPanel
 *
 * The stage between "you have been admitted" and "here is your registration
 * number": the Registration and CURSU fees, what has been paid against them,
 * and the buttons that move it forward.
 *
 * One component serves both ends deliberately — the applicant and the validator
 * must be looking at the same numbers, and two implementations of "what is
 * still owed" is how they stop agreeing. `mode` decides which API it reads and
 * which actions it offers:
 *
 *   applicant → read own bills, pay each one
 *   validator → read anyone's, raise the bills, pay on the applicant's behalf,
 *               and confirm a settlement that arrived off-gateway
 *
 * While anything is outstanding it polls, so the confirmation the gateway sends
 * server-to-server appears on both screens without either party refreshing.
 */
export default function AdmissionFeesPanel({
  mode,
  applicationId,
  canManage = true,
  className = '',
}: {
  mode: 'applicant' | 'validator'
  /** Required in validator mode; ignored for the applicant, who reads their own. */
  applicationId?: number
  /** Validator only — hides the billing actions for read-only staff. */
  canManage?: boolean
  className?: string
}) {
  const qc = useQueryClient()
  const isValidator = mode === 'validator'
  const queryKey = isValidator
    ? ['admission-bills', 'admin', applicationId]
    : ['admission-bills', 'applicant']

  const [confirming, setConfirming] = useState<AdmissionBill | null>(null)
  const [openedCheckout, setOpenedCheckout] = useState(false)
  const [showBordereauForm, setShowBordereauForm] = useState(false)
  const [showBankSlipModal, setShowBankSlipModal] = useState(false)

  const billsQ = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      isValidator
        ? admissionBillingService.list(applicationId as number, signal)
        : applicantService.getAdmissionBills(signal),
    enabled: isValidator ? Boolean(applicationId) : true,
    retry: false,
    // Poll while money is still owed, and keep polling briefly after it is
    // settled so the registration number appears the moment enrollment mints it.
    refetchInterval: (query) => {
      const d = query.state.data?.data as AdmissionBillingOverview | undefined
      if (!d) return false
      if (d.summary.balance > 0 && d.is_billed) return openedCheckout ? 4000 : 10000
      if (d.fully_paid && !d.registration_number) return 4000
      return false
    },
    refetchIntervalInBackground: true,
  })

  const data = billsQ.data?.data
  const bills = data?.bills ?? []
  const summary = data?.summary

  // Announce the two transitions that matter, once each.
  const [seenPaid, setSeenPaid] = useState(false)
  const [seenReg, setSeenReg] = useState(false)
  useEffect(() => {
    if (data?.fully_paid && !seenPaid) {
      setSeenPaid(true)
      if (bills.length) toast.success('All admission fees are settled.')
    }
    if (data?.registration_number && !seenReg) {
      setSeenReg(true)
      if (seenPaid) toast.success(`Registration number issued: ${data.registration_number}`)
    }
  }, [data?.fully_paid, data?.registration_number, seenPaid, seenReg, bills.length])

  const raiseBills = useMutation({
    mutationFn: () => admissionBillingService.bill(applicationId as number),
    onSuccess: (res) => {
      toast.success(res.message ?? 'Admission fees billed.')
      qc.invalidateQueries({ queryKey })
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message || 'Could not raise the admission fees.'),
  })

  const payNow = async () => {
    if (!data?.merchant_code || !data?.payer_code) {
      toast.error('Payment information not ready — please try again.')
      billsQ.refetch()
      return
    }

    const form = document.createElement('form')
    form.method = 'POST'
    form.action = 'https://urubutopay.rw/pay-now?origin=internal'
    form.target = '_blank'

    const merchantInput = document.createElement('input')
    merchantInput.type = 'hidden'
    merchantInput.name = 'merchant_code'
    merchantInput.value = data.merchant_code

    const payerInput = document.createElement('input')
    payerInput.type = 'hidden'
    payerInput.name = 'payer_code'
    payerInput.value = data.payer_code

    form.appendChild(merchantInput)
    form.appendChild(payerInput)
    document.body.appendChild(form)
    form.submit()
    document.body.removeChild(form)

    setOpenedCheckout(true)
    toast.success(
      isValidator
        ? 'Urubuto Pay opened. This page updates itself once the payment is confirmed.'
        : 'Complete your payment in the Urubuto Pay tab, then come back here.',
    )
    billsQ.refetch()
  }

  const copy = (label: string, value?: string | null) => {
    if (!value) return
    navigator.clipboard?.writeText(value).then(
      () => toast.success(`${label} copied`),
      () => toast.error('Could not copy'),
    )
  }

  const unpriced = useMemo(
    () => (data?.billable ?? []).filter((b) => b.amount === null),
    [data?.billable],
  )

  if (billsQ.isLoading) {
    return (
      <section className={`card p-6 ${className}`}>
        <div className="flex items-center gap-3 text-ink-400 text-[13px]">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" /> Loading admission fees…
        </div>
      </section>
    )
  }

  if (billsQ.isError || !data) {
    // The applicant endpoint 404s when there is no application at all; nothing
    // useful to show either end in that case.
    return null
  }

  // Nothing billed yet. The applicant is told to wait; the validator is shown
  // the price and the button that raises it.
  if (!data.is_billed) {
    if (!isValidator) {
      return (
        <section className={`card p-6 ${className}`}>
          <Header
            title="Admission fees"
            sub="Your Registration and CURSU fees will appear here as soon as the admissions office raises them. You will be emailed when they do."
          />
        </section>
      )
    }

    return (
      <section className={`card p-6 space-y-5 ${className}`}>
        <Header
          title="Admission fees"
          sub="Nothing has been billed yet. These are the amounts Finance has published for this applicant’s year, programme and level."
        />

        <div className="rounded-xl border border-ink-100 dark:border-ink-800 divide-y divide-ink-100 dark:divide-ink-800">
          {(data.billable ?? []).map((line) => (
            <div key={line.fee_type} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold text-ink-900 dark:text-white truncate">
                  {line.label}
                </p>
                {line.reason && (
                  <p className="text-[12px] text-amber-600 dark:text-amber-400 mt-0.5">{line.reason}</p>
                )}
              </div>
              <p className="text-[14px] font-bold shrink-0 tabular-nums">
                {line.amount === null
                  ? <span className="text-ink-400">—</span>
                  : `${fmt(line.amount)} ${line.currency}`}
              </p>
            </div>
          ))}
        </div>

        {canManage && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              className="btn-primary"
              disabled={raiseBills.isPending || (data.billable ?? []).every((b) => b.amount === null)}
              onClick={() => raiseBills.mutate()}
            >
              {raiseBills.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Billing…</>
                : <><ReceiptText className="w-4 h-4" /> Bill applicant</>}
            </button>
            <p className="text-[12px] text-ink-500 dark:text-ink-400">
              The applicant is emailed and notified, and can pay straight away.
            </p>
          </div>
        )}

        {unpriced.length > 0 && (
          <Note tone="amber">
            {unpriced.map((u) => u.label).join(' and ')} {unpriced.length === 1 ? 'has' : 'have'} no
            published fee structure for this applicant, so {unpriced.length === 1 ? 'it' : 'they'} cannot be
            billed. Publish {unpriced.length === 1 ? 'a price' : 'prices'} under Finance → Fee Structures first.
          </Note>
        )}
      </section>
    )
  }

  return (
    <section className={`card p-6 space-y-5 ${className}`}>
      {/* Unpaid Amount Alert for Applicants */}
      {!isValidator && summary && summary.balance > 0 && (
        <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p className="text-[13px] font-semibold text-amber-900 dark:text-amber-100">
                Admission Fee Outstanding
              </p>
              <p className="text-[12px] text-amber-700 dark:text-amber-200 mt-1">
                You have an unpaid balance. Complete payment below to receive your registration number and proceed to enrollment.
              </p>
            </div>
            <p className="text-[24px] font-black tabular-nums text-amber-600 dark:text-amber-400 shrink-0">
              {fmt(summary.balance)} RWF
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <Header
          title="Admission fees"
          sub={
            isValidator
              ? 'Settled through Urubuto Pay on the application number. The registration number is issued automatically once the balance reaches zero.'
              : 'Pay these to receive your registration number. Your registration number is issued automatically once the last payment is confirmed — you do not need to press anything else.'
          }
        />
        <div className="text-right shrink-0">
          <p className="text-[11px] font-bold uppercase tracking-widest text-ink-400">
            {summary && summary.balance > 0 ? 'Balance' : 'Total paid'}
          </p>
          <p className={`text-[22px] font-black tabular-nums ${
            summary && summary.balance > 0
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-emerald-600 dark:text-emerald-400'
          }`}>
            {fmt(summary && summary.balance > 0 ? summary.balance : summary?.total_paid ?? 0)} RWF
          </p>
        </div>
      </div>

      {/* Payer details — the applicant may be typing these into a USSD prompt. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <DetailRow
          label="Payer code"
          hint="Your application number"
          value={data.payer_code}
          onCopy={() => copy('Payer code', data.payer_code)}
        />
        <DetailRow
          label="Merchant code"
          value={data.merchant_code || '—'}
          onCopy={() => copy('Merchant code', data.merchant_code)}
        />
      </div>

      {/* The bills */}
      <div className="rounded-xl border border-ink-100 dark:border-ink-800 divide-y divide-ink-100 dark:divide-ink-800 overflow-hidden">
        {bills.map((bill) => (
          <div key={bill.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-[13.5px] font-semibold text-ink-900 dark:text-white">{bill.label}</p>
                <StatusChip status={bill.status} />
              </div>
              <p className="text-[12px] text-ink-500 dark:text-ink-400 mt-0.5 tabular-nums">
                {fmt(bill.amount_due)} {bill.currency}
                {bill.amount_paid > 0 && bill.status !== 'paid' && (
                  <> · {fmt(bill.amount_paid)} paid · <span className="text-amber-600 dark:text-amber-400 font-semibold">{fmt(bill.balance)} left</span></>
                )}
                {bill.status === 'paid' && bill.transaction_id && (
                  <> · Ref <span className="font-mono">{bill.transaction_id}</span></>
                )}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0 w-full">
              {bill.status === 'paid' ? (
                <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" /> Paid
                </span>
              ) : (
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  {/* Pay via Urubuto - Primary button for applicants */}
                  {!isValidator && (
                    <button
                      className="btn-primary font-semibold"
                      onClick={() => payNow()}
                      title="Pay via Urubuto (MTN MoMo / Airtel Money)"
                    >
                      <CreditCard className="w-4 h-4" />
                      Pay {fmt(bill.balance)} RWF
                    </button>
                  )}

                  {/* Validator: Open payment page */}
                  {isValidator && (
                    <button className="btn-primary" onClick={() => payNow()}>
                      <CreditCard className="w-4 h-4" />
                      Open payment page
                    </button>
                  )}

                  {/* Bank Slip Button (Applicant Only) */}
                  {!isValidator && (
                    <button
                      className="btn-secondary"
                      onClick={() => setShowBankSlipModal(true)}
                      title="Upload or manage bank slip payment"
                    >
                      <FileText className="w-4 h-4" />
                      Bank Slip
                    </button>
                  )}

                  {/* Bordereau Button (Student Only) */}
                  {!isValidator && (
                    <button
                      className="btn-secondary"
                      onClick={() => setShowBordereauForm(true)}
                      title="Paid via bank transfer? Submit your receipt number for verification"
                    >
                      <BanknoteIcon className="w-4 h-4" />
                      Bordereau
                    </button>
                  )}

                  {/* Upload Slip Button (Student Only) */}
                  {!isValidator && (
                    <label className="btn-secondary cursor-pointer">
                      <Upload className="w-4 h-4" />
                      Upload Slip
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files?.[0]) {
                            toast.success('Payment slip uploaded. Finance will review within 24 hours.')
                          }
                        }}
                      />
                    </label>
                  )}

                  {/* Confirm Offline Button (Finance Only) */}
                  {isValidator && canManage && (
                    <button
                      className="btn-secondary"
                      onClick={() => setConfirming(bill)}
                      title="Record a bank transfer or cash payment already received"
                    >
                      <ShieldCheck className="w-4 h-4" /> Confirm offline
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Where this leaves the applicant */}
      {summary && summary.balance > 0 ? (
        <Note tone="amber" icon={<Wallet className="w-5 h-5" />}>
          {isValidator
            ? 'The registration number is withheld until this balance reaches zero. Payments confirmed by Urubuto Pay appear here within seconds — no refresh needed.'
            : 'Pay each fee above with Urubuto Pay (MTN MoMo / Airtel Money). This page confirms itself as soon as the payment lands.'}
        </Note>
      ) : data.registration_number ? (
        <Note tone="emerald" icon={<BadgeCheck className="w-5 h-5" />}>
          All admission fees are settled. Registration number{' '}
          <span className="font-mono font-bold">{data.registration_number}</span>
          {isValidator ? ' has been issued.' : ' — welcome to the Catholic University of Rwanda.'}
        </Note>
      ) : data.auto_enroll ? (
        <Note tone="emerald" icon={<Loader2 className="w-5 h-5 animate-spin" />}>
          All admission fees are settled. The registration number is being generated and will appear
          here in a moment.
        </Note>
      ) : (
        <Note tone="emerald" icon={<CheckCircle2 className="w-5 h-5" />}>
          All admission fees are settled — this applicant is ready for a registration number.
        </Note>
      )}

      {/* Continue Button - Active only when payment approved */}
      {!isValidator && summary && summary.balance === 0 && (
        <div className="flex gap-3 pt-4">
          <button
            onClick={() => window.history.back()}
            className="btn-secondary flex-1"
          >
            ← Previous
          </button>
          <button
            onClick={() => {
              window.location.href = mode === 'applicant' ? '/applicant' : '/dashboard'
            }}
            className="btn-primary flex-1 inline-flex items-center justify-center gap-2"
          >
            <LockOpen className="w-4 h-4" />
            Continue to Next Step
          </button>
        </div>
      )}

      {/* Locked State - Show when payment not complete */}
      {!isValidator && summary && summary.balance > 0 && (
        <div className="flex gap-3 pt-4">
          <button
            onClick={() => window.history.back()}
            className="btn-secondary flex-1"
          >
            ← Previous
          </button>
          <button
            disabled
            className="btn-secondary flex-1 opacity-50 cursor-not-allowed inline-flex items-center justify-center gap-2"
          >
            <Lock className="w-4 h-4" />
            Complete Payment to Continue
          </button>
        </div>
      )}

      {/* Receipts */}
      {data.payments.length > 0 && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-ink-400 mb-2 flex items-center gap-1.5">
            <Receipt className="w-3.5 h-3.5" /> Payments received
          </p>
          <div className="overflow-x-auto">
            <table className="data-table min-w-[520px]">
              <thead>
                <tr>
                  <th className="py-1.5">Date</th>
                  <th>Fee</th>
                  <th className="text-right">Amount</th>
                  <th>Reference</th>
                  <th>Receipt</th>
                  <th>Channel</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((p) => (
                  <tr key={p.id}>
                    <td className="py-1.5 whitespace-nowrap">{p.paid_at?.slice(0, 16).replace('T', ' ')}</td>
                    <td>{p.label || p.fee_type}</td>
                    <td className="text-right tabular-nums font-semibold">{fmt(p.amount)} {p.currency}</td>
                    <td className="font-mono text-[11.5px]">{p.reference_number}</td>
                    <td className="font-mono text-[11.5px]">{p.receipt_number}</td>
                    <td>
                      <span className={p.source === 'GATEWAY' ? 'chip-primary' : 'chip-soft'}>
                        {p.source === 'GATEWAY' ? 'Urubuto Pay' : 'Offline'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isValidator && canManage && summary && summary.balance > 0 && (
        <button
          className="text-link text-[12.5px] inline-flex items-center gap-1.5"
          disabled={raiseBills.isPending}
          onClick={() => raiseBills.mutate()}
        >
          <ReceiptText className="w-3.5 h-3.5" />
          Re-price unpaid fees from the current fee structures
        </button>
      )}

      {confirming && (
        <ConfirmOfflinePaymentModal
          bill={confirming}
          applicationId={applicationId as number}
          onClose={() => setConfirming(null)}
          onDone={() => {
            setConfirming(null)
            qc.invalidateQueries({ queryKey })
          }}
        />
      )}

      {!isValidator && summary && (
        <BordereauPaymentForm
          applicationId={applicationId as number}
          requiredAmount={summary.balance > 0 ? summary.balance : summary.total_paid}
          isOpen={showBordereauForm}
          onClose={() => setShowBordereauForm(false)}
          onApproved={() => {
            setShowBordereauForm(false)
            qc.invalidateQueries({ queryKey })
          }}
        />
      )}

      {/* Bank Slip Modal */}
      {showBankSlipModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70 backdrop-blur-sm p-4">
          <div className="w-[60%] h-[90vh] max-h-[90vh] bg-white dark:bg-ink-800 rounded-xl shadow-2xl flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-ink-100 dark:border-ink-700 shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-green-600" />
                <h2 className="text-sm font-semibold text-ink-800 dark:text-white">Bank Slip Management</h2>
              </div>
              <button
                onClick={() => setShowBankSlipModal(false)}
                className="p-1.5 hover:bg-ink-100 dark:hover:bg-ink-700 rounded-lg transition-colors"
                title="Close modal"
              >
                <X className="w-4 h-4 text-ink-500 dark:text-ink-400" />
              </button>
            </div>

            {/* Modal Body - iFrame */}
            <div className="flex-1 overflow-hidden bg-white dark:bg-ink-900">
              <iframe
                src="https://cur.ac.rw/umis/finance/bank_slip/index.php"
                className="w-full h-full border-none"
                title="Bank Slip Portal"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */

function ConfirmOfflinePaymentModal({
  bill, applicationId, onClose, onDone,
}: {
  bill: AdmissionBill
  applicationId: number
  onClose: () => void
  onDone: () => void
}) {
  const [amount, setAmount] = useState(String(bill.balance))
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')

  const confirm = useMutation({
    mutationFn: () =>
      admissionBillingService.confirmPayment(applicationId, bill.id, {
        amount: Number(amount),
        reference: reference.trim(),
        notes: notes.trim() || undefined,
      }),
    onSuccess: (res) => {
      toast.success(res.message ?? 'Payment recorded.')
      onDone()
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message || 'Could not record the payment.'),
  })

  return (
    <Modal open onClose={onClose} title={`Confirm offline payment — ${bill.label}`} size="md">
      <div className="space-y-4">
        <Note tone="amber" icon={<AlertCircle className="w-5 h-5" />}>
          Use this only for money that has actually reached the institution outside Urubuto Pay —
          a bank transfer or a cash payment at the finance desk. It is recorded against your account
          and cannot be undone from here.
        </Note>

        <div>
          <label className="label">Amount ({bill.currency})</label>
          <input
            type="number"
            className="input"
            value={amount}
            min={1}
            max={bill.balance}
            onChange={(e) => setAmount(e.target.value)}
          />
          <p className="text-[12px] text-ink-500 mt-1 tabular-nums">
            {fmt(bill.balance)} {bill.currency} still owed on this fee.
          </p>
        </div>

        <div>
          <label className="label">Bank / receipt reference</label>
          <input
            type="text"
            className="input"
            placeholder="e.g. BK-2026-0098213"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
          <p className="text-[12px] text-ink-500 mt-1">
            Must be unique — the same reference cannot be booked twice.
          </p>
        </div>

        <div>
          <label className="label">Notes (optional)</label>
          <input
            type="text"
            className="input"
            placeholder="Anything the finance office should know"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            disabled={confirm.isPending || !reference.trim() || Number(amount) <= 0}
            onClick={() => confirm.mutate()}
          >
            {confirm.isPending
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Recording…</>
              : <><ShieldCheck className="w-4 h-4" /> Record payment</>}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function Header({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="min-w-0">
      <h3 className="section-title flex items-center gap-2">
        <Wallet className="w-4 h-4 text-brand" /> {title}
      </h3>
      <p className="section-sub mt-1 max-w-2xl">{sub}</p>
    </div>
  )
}

function DetailRow({
  label, value, hint, onCopy,
}: {
  label: string
  value: string
  hint?: string
  onCopy?: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-ink-50/70 dark:bg-ink-900/40 border border-ink-100 dark:border-ink-800 px-3 py-2">
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-widest text-ink-400">{label}</p>
        <p className="text-[13px] font-mono font-semibold text-ink-900 dark:text-white truncate">{value}</p>
        {hint && <p className="text-[11.5px] text-ink-400">{hint}</p>}
      </div>
      {onCopy && (
        <button className="btn-ghost btn-sm shrink-0" onClick={onCopy} title={`Copy ${label.toLowerCase()}`}>
          <Copy className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

function StatusChip({ status }: { status: AdmissionBill['status'] }) {
  if (status === 'paid') return <span className="chip-success">Paid</span>
  if (status === 'partial') return <span className="chip-warning">Part paid</span>
  if (status === 'cancelled') return <span className="chip-soft">Cancelled</span>
  return <span className="chip-danger">Unpaid</span>
}

function Note({
  tone, icon, children,
}: {
  tone: 'amber' | 'emerald'
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  const tones = {
    amber: 'bg-amber-50/70 dark:bg-amber-900/10 border-amber-200 dark:border-amber-900/40 text-amber-900 dark:text-amber-200',
    emerald: 'bg-emerald-50/70 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-900/40 text-emerald-900 dark:text-emerald-200',
  }
  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-[13px] leading-snug ${tones[tone]}`}>
      {icon && <span className="shrink-0 mt-0.5">{icon}</span>}
      <div>{children}</div>
    </div>
  )
}

/** External-link affordance kept next to the checkout buttons for screen readers. */
export function CheckoutHint() {
  return (
    <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-400">
      <ExternalLink className="w-3 h-3" /> opens Urubuto Pay in a new tab
    </span>
  )
}

const fmt = (n: number) => new Intl.NumberFormat('en-US').format(Math.round(n))
