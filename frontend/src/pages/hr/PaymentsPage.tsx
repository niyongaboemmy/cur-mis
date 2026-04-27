import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  ChevronLeft, ChevronRight, Loader2, Banknote,
  Trash2, X, Building2, Phone, Search,
} from 'lucide-react'
import { hrService, type SalaryPayment } from '@/services/hrService'
import { useAuthStore } from '@/store/authStore'
import { PERMISSIONS } from '@/constants'

/* ── helpers ── */
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December']

const now   = new Date()
const CUR_Y = now.getFullYear()
const CUR_M = now.getMonth() + 1

const yearOpts  = Array.from({ length: 5 }, (_, i) => CUR_Y - i)
const monthOpts = MONTHS.map((m, i) => ({ v: i + 1, label: m }))

const fmt = (v: number) =>
  v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

const METHOD_COLORS: Record<string, string> = {
  'Bank Transfer': 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
  'Cash':          'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  'MoMo':          'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
}

/* ══════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════════════════════════════════ */
export default function PaymentsPage() {
  const [sp, setSp]       = useSearchParams()
  const { user }          = useAuthStore()
  const canManage         = user?.role === 'superadmin' || (user?.permissions ?? []).includes(PERMISSIONS.MANAGE_HR_EMPLOYEES)
  const qc                = useQueryClient()

  const periodYear  = parseInt(sp.get('period_year')  || String(CUR_Y))
  const periodMonth = parseInt(sp.get('period_month') || String(CUR_M))
  const [search, setSearch] = useState('')
  const [cancelling, setCancelling] = useState<SalaryPayment | null>(null)

  const setPeriod = (y: number, m: number) => {
    const c = new URLSearchParams(sp)
    c.set('period_year', String(y))
    c.set('period_month', String(m))
    setSp(c, { replace: true })
  }
  const prevMonth = () => { const d = new Date(periodYear, periodMonth - 2, 1); setPeriod(d.getFullYear(), d.getMonth() + 1) }
  const nextMonth = () => { const d = new Date(periodYear, periodMonth,     1); setPeriod(d.getFullYear(), d.getMonth() + 1) }

  const { data: res, isLoading } = useQuery({
    queryKey: ['hr-payments', periodYear, periodMonth],
    queryFn:  ({ signal }) => hrService.listPayments({ period_year: periodYear, period_month: periodMonth }, signal),
    placeholderData: prev => prev,
  })

  const payments: SalaryPayment[] = (res?.data ?? []) as SalaryPayment[]

  const filtered = search.trim()
    ? payments.filter(p => p.full_name.toLowerCase().includes(search.toLowerCase()) ||
        (p.reference ?? '').toLowerCase().includes(search.toLowerCase()))
    : payments

  const processed = filtered.filter(p => p.status === 'Processed')
  const total     = processed.reduce((s, p) => s + Number(p.amount), 0)

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-ink-900 dark:text-white flex items-center gap-2">
            <Banknote className="w-5 h-5 text-emerald-600" /> Salary Payments
          </h2>
          <p className="text-[13px] text-ink-500">
            Payment transactions · {MONTHS[periodMonth - 1]} {periodYear}
          </p>
        </div>

        {/* Period nav */}
        <div className="flex items-center gap-2">
          <button className="icon-btn" onClick={prevMonth}><ChevronLeft className="w-4 h-4" /></button>
          <select
            className="input py-1.5 text-[13px] w-36"
            value={periodMonth}
            onChange={e => setPeriod(periodYear, parseInt(e.target.value))}
          >
            {monthOpts.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
          <select
            className="input py-1.5 text-[13px] w-24"
            value={periodYear}
            onChange={e => setPeriod(parseInt(e.target.value), periodMonth)}
          >
            {yearOpts.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button className="icon-btn" onClick={nextMonth}><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="card p-4">
          <p className="text-[11px] font-bold text-ink-400 uppercase tracking-wider">Total Paid</p>
          <p className="text-[22px] font-bold text-emerald-700 dark:text-emerald-400 tabular-nums mt-1">{fmt(total)}</p>
          <p className="text-[11px] text-ink-400">RWF — {processed.length} payment{processed.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="card p-4">
          <p className="text-[11px] font-bold text-ink-400 uppercase tracking-wider">By Bank Transfer</p>
          <p className="text-[22px] font-bold text-blue-700 dark:text-blue-400 tabular-nums mt-1">
            {fmt(processed.filter(p => p.payment_method === 'Bank Transfer').reduce((s, p) => s + Number(p.amount), 0))}
          </p>
          <p className="text-[11px] text-ink-400">RWF</p>
        </div>
        <div className="card p-4">
          <p className="text-[11px] font-bold text-ink-400 uppercase tracking-wider">By Cash / MoMo</p>
          <p className="text-[22px] font-bold text-amber-700 dark:text-amber-400 tabular-nums mt-1">
            {fmt(processed.filter(p => p.payment_method !== 'Bank Transfer').reduce((s, p) => s + Number(p.amount), 0))}
          </p>
          <p className="text-[11px] text-ink-400">RWF</p>
        </div>
      </div>

      {/* Search + table */}
      <div className="card overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-ink-100 dark:border-ink-700">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" />
            <input
              className="input pl-9 py-1.5 text-[13px]"
              placeholder="Search employee or reference…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <span className="text-[12px] text-ink-400">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12.5px]">
            <thead>
              <tr className="bg-ink-50 dark:bg-ink-800/60 border-b border-ink-100 dark:border-ink-700 text-[10px] font-bold text-ink-400 uppercase tracking-wider">
                <th className="px-3 py-2.5 w-10 text-center">No</th>
                <th className="px-3 py-2.5">Employee</th>
                <th className="px-3 py-2.5 text-right">Amount (RWF)</th>
                <th className="px-3 py-2.5 text-center">Method</th>
                <th className="px-3 py-2.5">Bank / Account</th>
                <th className="px-3 py-2.5">Reference</th>
                <th className="px-3 py-2.5">Paid At</th>
                <th className="px-3 py-2.5 text-center">Status</th>
                {canManage && <th className="px-3 py-2.5 text-center">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
              {isLoading ? (
                <tr><td colSpan={canManage ? 9 : 8} className="py-14 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" />
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={canManage ? 9 : 8} className="py-14 text-center">
                  <div className="flex flex-col items-center gap-2 text-ink-400">
                    <Banknote className="w-10 h-10 opacity-30" />
                    <p className="text-[13px]">No payments for {MONTHS[periodMonth - 1]} {periodYear}</p>
                  </div>
                </td></tr>
              ) : filtered.map((p, idx) => (
                <tr
                  key={p.id}
                  className={`hover:bg-ink-50/40 dark:hover:bg-ink-700/20 transition-colors ${p.status === 'Cancelled' ? 'opacity-50 line-through' : ''}`}
                >
                  <td className="px-3 py-2.5 text-center text-ink-400 font-mono text-[11px]">{idx + 1}</td>

                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <PayAvatar name={p.full_name} />
                      <div>
                        <div className="font-semibold text-ink-900 dark:text-white leading-tight">{p.full_name}</div>
                        <div className="text-[11px] text-ink-400">
                          {MONTHS[(p.period_month ?? 1) - 1]} {p.period_year}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="px-3 py-2.5 text-right tabular-nums font-bold text-emerald-700 dark:text-emerald-400">
                    {fmt(Number(p.amount))}
                  </td>

                  <td className="px-3 py-2.5 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${METHOD_COLORS[p.payment_method] ?? 'bg-ink-100 text-ink-600'}`}>
                      {p.payment_method}
                    </span>
                  </td>

                  <td className="px-3 py-2.5">
                    {p.bank_name || p.account_number ? (
                      <div className="text-ink-700 dark:text-ink-300">
                        {p.bank_name && (
                          <div className="flex items-center gap-1 text-[11px]">
                            <Building2 className="w-3 h-3 shrink-0" /> {p.bank_name}
                          </div>
                        )}
                        {p.account_number && (
                          <div className="flex items-center gap-1 text-[11px] text-ink-400">
                            <Phone className="w-3 h-3 shrink-0" /> {p.account_number}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-ink-300">—</span>
                    )}
                  </td>

                  <td className="px-3 py-2.5 text-ink-600 dark:text-ink-400 text-[11px]">
                    {p.reference ?? <span className="text-ink-300">—</span>}
                  </td>

                  <td className="px-3 py-2.5 text-ink-500 text-[11px] whitespace-nowrap">
                    {p.paid_at
                      ? new Date(p.paid_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                      : '—'}
                  </td>

                  <td className="px-3 py-2.5 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
                      p.status === 'Processed'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                        : 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400'
                    }`}>
                      {p.status}
                    </span>
                  </td>

                  {canManage && (
                    <td className="px-3 py-2.5 text-center">
                      {p.status === 'Processed' && (
                        <button
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold bg-red-50 hover:bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 transition-colors"
                          onClick={() => setCancelling(p)}
                        >
                          <Trash2 className="w-3 h-3" /> Cancel
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>

            {/* Totals */}
            {processed.length > 0 && !isLoading && (
              <tfoot>
                <tr className="bg-emerald-50 dark:bg-emerald-500/10 border-t-2 border-emerald-200 dark:border-emerald-700 font-bold text-[12.5px]">
                  <td colSpan={2} className="px-3 py-3 text-ink-500 text-[11px] uppercase tracking-wider">TOTAL PAID</td>
                  <td className="px-3 py-3 text-right tabular-nums text-emerald-800 dark:text-emerald-200 text-[14px]">
                    {fmt(total)}
                  </td>
                  <td colSpan={canManage ? 6 : 5} className="px-3 py-3 text-[11px] text-ink-400">
                    RWF — {processed.length} disbursement{processed.length !== 1 ? 's' : ''}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Cancel confirmation modal */}
      {cancelling && (
        <CancelPaymentModal
          payment={cancelling}
          onClose={() => setCancelling(null)}
          onDone={() => {
            setCancelling(null)
            qc.invalidateQueries({ queryKey: ['hr-payments'] })
            qc.invalidateQueries({ queryKey: ['hr-payroll'] })
          }}
        />
      )}
    </div>
  )
}

/* ── Avatar ── */
function PayAvatar({ name }: { name: string }) {
  const initials = name.split(' ').slice(0, 2).map(n => n[0] ?? '').join('').toUpperCase()
  return (
    <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-[11px] font-bold flex items-center justify-center shrink-0">
      {initials}
    </div>
  )
}

/* ── Cancel Payment Modal ── */
function CancelPaymentModal({
  payment, onClose, onDone,
}: {
  payment: SalaryPayment
  onClose: () => void
  onDone:  () => void
}) {
  const cancel = useMutation({
    mutationFn: () => hrService.cancelPayment(payment.id),
    onSuccess: () => {
      toast.success(`Payment of ${payment.amount.toLocaleString()} RWF cancelled. Payroll reverted to Approved.`)
      onDone()
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Cancel failed'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-ink-800 rounded-xl shadow-2xl w-full max-w-sm">
        <div className="p-6 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center mx-auto">
            <X className="w-6 h-6 text-red-600 dark:text-red-400" />
          </div>
          <h3 className="font-bold text-[16px] text-ink-900 dark:text-white">Cancel Payment?</h3>
          <p className="text-[13px] text-ink-500">
            Cancel the <span className="font-semibold text-ink-700 dark:text-ink-200">{Number(payment.amount).toLocaleString()} RWF</span> payment
            for <span className="font-semibold text-ink-700 dark:text-ink-200">{payment.full_name}</span>.
            The payroll entry will be reverted to <strong>Approved</strong>.
          </p>
        </div>
        <div className="flex gap-2 px-5 py-4 border-t border-ink-100 dark:border-ink-700">
          <button className="btn-secondary flex-1" onClick={onClose}>Keep Payment</button>
          <button
            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold text-[13px] rounded-lg px-4 py-2 transition-colors flex items-center justify-center gap-1.5"
            onClick={() => cancel.mutate()}
            disabled={cancel.isPending}
          >
            {cancel.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Yes, Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
