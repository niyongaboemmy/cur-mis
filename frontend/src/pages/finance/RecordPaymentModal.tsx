import { useState } from 'react'
import ModalPortal from '@/components/ui/ModalPortal'
import { useMutation } from '@tanstack/react-query'
import { CheckCircle2, ExternalLink, Loader2, ChevronRight, ChevronLeft, Wallet, CreditCard, Banknote } from 'lucide-react'
import toast from 'react-hot-toast'
import { paymentService } from '@/services/financeService'
import type { FeeInvoice, PaymentMethod } from '@/types/finance'
import { PAYMENT_METHOD_LABELS, BANK_SUB_METHOD_LABELS, MOMO_SUB_METHOD_LABELS } from '@/types/finance'
import SearchableSelect from '@/components/ui/SearchableSelect'
import { formatRWF } from '@/utils/formatCurrency'

interface Props {
  invoice: FeeInvoice
  onClose: () => void
  onDone:  () => void
}

type Step = 'amount' | 'method' | 'summary'

export default function RecordPaymentModal({ invoice, onClose, onDone }: Props) {
  const balance = Number(invoice.amount_due) - Number(invoice.amount_paid) - Number(invoice.bursary_applied)
  
  const [step, setStep] = useState<Step>('amount')
  const [form, setForm] = useState<{
    amount: number;
    payment_method: PaymentMethod;
    payment_sub_method?: string;
    reference_number: string;
    notes: string;
    paid_at: string;
  }>({
    amount:           balance > 0 ? balance : 0,
    payment_method:   'CASH' as PaymentMethod,
    reference_number: '',
    notes:            '',
    paid_at:          new Date().toISOString().slice(0, 16),
  })

  const [success, setSuccess] = useState<{ paymentId: number; receiptNumber: string } | null>(null)

  const set = (k: keyof typeof form, v: any) => setForm(f => ({ ...f, [k]: v }))

  const mutation = useMutation({
    mutationFn: () =>
      paymentService.record({
        invoice_id:       invoice.id,
        amount:           form.amount,
        payment_method:   form.payment_method,
        payment_sub_method: form.payment_sub_method,
        reference_number: form.reference_number || undefined,
        notes:            form.notes || undefined,
        paid_at:          form.paid_at ? form.paid_at + ':00' : undefined,
      }),
    onSuccess: (res) => {
      toast.success(`Payment recorded — Receipt ${res.data?.receipt_number}`)
      setSuccess({
        paymentId:     res.data?.payment_id ?? 0,
        receiptNumber: res.data?.receipt_number ?? '',
      })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Payment failed'),
  })

  // ── Step Indicator ──────────────────────────────────────────────────────────
  const StepIndicator = () => (
    <div className="flex items-center justify-between px-2 mb-6">
      {[
        { id: 'amount',  label: 'Amount', icon: Banknote },
        { id: 'method',  label: 'Method', icon: Wallet },
        { id: 'summary', label: 'Finish', icon: CheckCircle2 },
      ].map((s, i) => {
        const Icon = s.icon
        const isActive = step === s.id
        const isPast   = ['amount', 'method', 'summary'].indexOf(step) > i
        return (
          <div key={s.id} className="flex items-center group">
            <div className="flex flex-col items-center gap-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                isActive ? 'bg-brand text-white shadow-lg shadow-brand/20 scale-110' : 
                isPast ? 'bg-green-500 text-white' : 'bg-ink-100 text-ink-400'
              }`}>
                {isPast ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-tighter ${isActive ? 'text-brand' : 'text-ink-400'}`}>
                {s.label}
              </span>
            </div>
            {i < 2 && (
              <div className={`w-12 h-[2px] mx-2 -mt-4 transition-colors ${
                ['amount', 'method', 'summary'].indexOf(step) > i ? 'bg-green-500' : 'bg-ink-100'
              }`} />
            )}
          </div>
        )
      })}
    </div>
  )

  if (success) {
    return (
      <ModalPortal>
      <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm">
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-2xl shadow-2xl w-full max-w-sm p-8 space-y-6 text-center animate-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center gap-3">
              <div className="w-20 h-20 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center animate-bounce">
                <CheckCircle2 className="w-10 h-10 text-amber-600" />
              </div>
              <h3 className="text-xl font-bold text-ink-900 dark:text-white">Payment Submitted</h3>
              <p className="text-sm text-ink-500">The transaction has been recorded and is pending approval from the finance team.</p>
            </div>

            <div className="bg-ink-50 dark:bg-ink-800/50 rounded-xl p-4 border border-ink-100 dark:border-ink-700/50">
              <p className="text-[10px] uppercase font-bold text-ink-400 mb-1">Receipt Number</p>
              <p className="font-mono font-bold text-ink-900 dark:text-gold-400 text-lg tracking-wider">{success.receiptNumber}</p>
            </div>

            <div className="flex flex-col gap-2">
              <a
                href={`/finance/receipt/${success.paymentId}`}
                target="_blank"
                rel="noreferrer"
                className="btn-primary w-full py-2.5 rounded-xl shadow-lg shadow-brand/20 flex items-center justify-center gap-2"
              >
                <ExternalLink className="w-4 h-4" /> Download PDF Receipt
              </a>
              <button className="btn-ghost w-full text-ink-500 font-semibold" onClick={onDone}>
                Back to Student Ledger
              </button>
            </div>
          </div>
        </div>
      </div>
      </ModalPortal>
    )
  }

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
          
          <div className="p-6 pb-0">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-bold text-ink-900 dark:text-white">Record Payment</h3>
              <button className="text-ink-400 hover:text-ink-600 dark:hover:text-ink-200" onClick={onClose}>
                <ChevronLeft className="w-5 h-5" />
              </button>
            </div>
            <p className="text-[12px] text-ink-500 mb-6">Processing payment for <span className="font-bold text-ink-700 dark:text-ink-200">{invoice.invoice_number}</span></p>
            
            <StepIndicator />
          </div>

          <div className="p-6 pt-2">
            {/* ── STEP 1: AMOUNT ── */}
            {step === 'amount' && (
              <div className="space-y-6 animate-in slide-in-from-right-4 duration-200">
                <div className="bg-brand/5 dark:bg-brand/10 border border-brand/10 rounded-xl p-4 flex justify-between items-center">
                  <div>
                    <p className="text-[10px] uppercase font-bold text-brand opacity-70">Total Outstanding</p>
                    <p className="text-xl font-black text-brand">{formatRWF(balance)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase font-bold text-ink-400">Due Date</p>
                    <p className="text-xs font-semibold">{invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : 'Immediate'}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-ink-600 dark:text-ink-400 mb-2 uppercase tracking-tight">Payment Amount (RWF)</label>
                    <div className="relative">
                      <input
                        type="number"
                        className="input w-full text-2xl font-bold py-4 pr-12 focus:ring-4 focus:ring-brand/10"
                        value={form.amount}
                        max={balance}
                        onChange={e => set('amount', Number(e.target.value))}
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-400 font-bold">RWF</div>
                    </div>
                    {form.amount > balance && (
                      <p className="text-[11px] text-amber-600 mt-2 font-medium flex items-center gap-1 italic">
                        Note: Amount exceeds balance. Surplus will be credited to student account.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-ink-600 dark:text-ink-400 mb-2 uppercase tracking-tight">Transaction Date</label>
                    <input
                      type="datetime-local"
                      className="input w-full"
                      value={form.paid_at}
                      onChange={e => set('paid_at', e.target.value)}
                    />
                  </div>
                </div>

                <button 
                  className="btn-primary w-full py-4 rounded-xl font-bold text-base flex items-center justify-center gap-2 group"
                  onClick={() => setStep('method')}
                  disabled={form.amount <= 0}
                >
                  Continue to Method <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            )}

            {/* ── STEP 2: METHOD ── */}
            {step === 'method' && (
              <div className="space-y-6 animate-in slide-in-from-right-4 duration-200">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: 'CASH', icon: Banknote },
                    { id: 'BANK_TRANSFER', icon: CreditCard },
                    { id: 'MOBILE_MONEY', icon: Wallet },
                    { id: 'BURSARY', icon: CheckCircle2 },
                  ].map(m => (
                    <button
                      key={m.id}
                      onClick={() => {
                        set('payment_method', m.id as PaymentMethod)
                        setForm(f => ({ ...f, payment_sub_method: undefined }))
                      }}
                      className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${
                        form.payment_method === m.id 
                          ? 'border-brand bg-brand/5 text-brand shadow-inner' 
                          : 'border-ink-100 dark:border-ink-800 hover:border-ink-300 dark:hover:border-ink-700'
                      }`}
                    >
                      <m.icon className="w-6 h-6" />
                      <span className="text-[10px] font-bold uppercase tracking-tight">{PAYMENT_METHOD_LABELS[m.id as PaymentMethod]}</span>
                    </button>
                  ))}
                </div>

                <div className="space-y-4">
                  {form.payment_method === 'BANK_TRANSFER' && (
                    <div className="animate-in fade-in duration-300">
                      <label className="block text-xs font-bold text-ink-600 dark:text-ink-400 mb-2 uppercase tracking-tight">Select Bank</label>
                      <SearchableSelect
                        options={Object.entries(BANK_SUB_METHOD_LABELS).map(([k, v]) => ({ value: k, label: v }))}
                        value={form.payment_sub_method ?? ''}
                        onChange={v => set('payment_sub_method', String(v))}
                        placeholder="Choose bank…"
                      />
                    </div>
                  )}

                  {form.payment_method === 'MOBILE_MONEY' && (
                    <div className="animate-in fade-in duration-300">
                      <label className="block text-xs font-bold text-ink-600 dark:text-ink-400 mb-2 uppercase tracking-tight">Select Provider</label>
                      <SearchableSelect
                        options={Object.entries(MOMO_SUB_METHOD_LABELS).map(([k, v]) => ({ value: k, label: v }))}
                        value={form.payment_sub_method ?? ''}
                        onChange={v => set('payment_sub_method', String(v))}
                        placeholder="Choose provider…"
                      />
                    </div>
                  )}

                  {['BANK_TRANSFER', 'MOBILE_MONEY', 'BURSARY'].includes(form.payment_method) && (
                    <div className="animate-in fade-in duration-300">
                      <label className="block text-xs font-bold text-ink-600 dark:text-ink-400 mb-2 uppercase tracking-tight">Reference / Transaction ID</label>
                      <input
                        className="input w-full"
                        value={form.reference_number}
                        onChange={e => set('reference_number', e.target.value)}
                        placeholder="e.g. TXN-10045678"
                      />
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <button className="btn-ghost px-6" onClick={() => setStep('amount')}><ChevronLeft className="w-5 h-5" /></button>
                  <button 
                    className="btn-primary flex-1 py-4 rounded-xl font-bold text-base"
                    onClick={() => setStep('summary')}
                    disabled={(form.payment_method === 'BANK_TRANSFER' || form.payment_method === 'MOBILE_MONEY') && !form.payment_sub_method}
                  >
                    Review Payment
                  </button>
                </div>
              </div>
            )}

            {/* ── STEP 3: SUMMARY ── */}
            {step === 'summary' && (
              <div className="space-y-6 animate-in slide-in-from-right-4 duration-200">
                <div className="bg-ink-50 dark:bg-ink-800 rounded-2xl p-5 border border-ink-100 dark:border-ink-700/50 space-y-4">
                  <div className="flex justify-between items-center border-b border-ink-100 dark:border-ink-700 pb-3">
                    <span className="text-xs text-ink-500 font-bold uppercase">Payment Amount</span>
                    <span className="text-xl font-black text-ink-900 dark:text-white">{formatRWF(form.amount)}</span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-y-4">
                    <div>
                      <p className="text-[10px] text-ink-400 uppercase font-bold mb-0.5">Method</p>
                      <p className="text-sm font-bold text-ink-700 dark:text-ink-200">{PAYMENT_METHOD_LABELS[form.payment_method]}</p>
                    </div>
                    {form.payment_sub_method && (
                      <div>
                        <p className="text-[10px] text-ink-400 uppercase font-bold mb-0.5">Provider/Bank</p>
                        <p className="text-sm font-bold text-ink-700 dark:text-ink-200">
                          {form.payment_method === 'BANK_TRANSFER' 
                            ? BANK_SUB_METHOD_LABELS[form.payment_sub_method as keyof typeof BANK_SUB_METHOD_LABELS]
                            : MOMO_SUB_METHOD_LABELS[form.payment_sub_method as keyof typeof MOMO_SUB_METHOD_LABELS]}
                        </p>
                      </div>
                    )}
                    <div>
                      <p className="text-[10px] text-ink-400 uppercase font-bold mb-0.5">Date</p>
                      <p className="text-sm font-bold text-ink-700 dark:text-ink-200">{new Date(form.paid_at).toLocaleString()}</p>
                    </div>
                    {form.reference_number && (
                      <div>
                        <p className="text-[10px] text-ink-400 uppercase font-bold mb-0.5">Reference</p>
                        <p className="text-sm font-mono font-bold text-ink-700 dark:text-ink-200">{form.reference_number}</p>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-[10px] text-ink-400 uppercase font-bold mb-1.5">Additional Notes</label>
                    <textarea
                      className="input w-full bg-white dark:bg-ink-900 text-sm resize-none"
                      rows={2}
                      value={form.notes}
                      onChange={e => set('notes', e.target.value)}
                      placeholder="Add memo for this transaction…"
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <button className="btn-ghost px-6" onClick={() => setStep('method')}><ChevronLeft className="w-5 h-5" /></button>
                  <button 
                    className="btn-primary flex-1 py-4 rounded-xl font-bold text-base shadow-lg shadow-brand/20 flex items-center justify-center gap-2"
                    onClick={() => mutation.mutate()}
                    disabled={mutation.isPending}
                  >
                    {mutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirm & Finalize'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}
