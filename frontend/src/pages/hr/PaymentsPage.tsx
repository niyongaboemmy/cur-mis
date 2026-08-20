import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  ChevronLeft, ChevronRight, Loader2, Banknote,
  Trash2, X, Building2, Search, FileSpreadsheet, FileText,
  PlayCircle, CheckSquare, Square,
} from 'lucide-react'
import {
  hrService,
  type SalaryPayment,
  type PaymentMethod,
  type PayrollRow,
} from '@/services/hrService'
import { PERMISSIONS } from '@/constants'
import { usePermission } from '@/utils/permissions'
import ModalPortal from '@/components/ui/ModalPortal'

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

/* A payroll row extended with the backend-returned payroll_status */
type PayrollRowEx = PayrollRow & { payroll_status?: string; bank?: string; bank_account?: string }

/* ── CSV export ── */
function exportCSV(payments: SalaryPayment[], month: string, year: number) {
  const header = ['#','Employee','Period','Amount (RWF)','Method','Bank','Account','Reference','Paid At','Status']
  const body = payments.map((p, i) => [
    i + 1,
    p.full_name,
    MONTHS[(p.period_month ?? 1) - 1] + ' ' + p.period_year,
    Number(p.amount),
    p.payment_method,
    p.bank_name ?? '',
    p.account_number ?? '',
    p.reference ?? '',
    p.paid_at ? new Date(p.paid_at).toLocaleString('en-GB') : '',
    p.status,
  ])
  const csv = [header, ...body]
    .map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = 'salary-payments-' + month + '-' + year + '.csv'
  a.click()
  URL.revokeObjectURL(url)
}

/* ── PDF print ── */
function printPDF(payments: SalaryPayment[], month: string, year: number, total: number) {
  const processed = payments.filter(p => p.status === 'Processed')
  let rowsHtml = ''
  processed.forEach((p, i) => {
    const bank = (p.bank_name ?? '') + (p.account_number ? ' / ' + p.account_number : '')
    rowsHtml += '<tr>'
    rowsHtml += '<td>' + (i + 1) + '</td>'
    rowsHtml += '<td>' + p.full_name + '</td>'
    rowsHtml += '<td>' + p.payment_method + '</td>'
    rowsHtml += '<td>' + bank + '</td>'
    rowsHtml += '<td>' + (p.reference ?? '') + '</td>'
    rowsHtml += '<td style="text-align:right">' + Number(p.amount).toLocaleString() + '</td>'
    rowsHtml += '</tr>'
  })
  const parts: string[] = [
    '<!DOCTYPE html>',
    '<html><head>',
    '<meta charset="utf-8">',
    '<title>Salary Payments ' + month + ' ' + year + '</title>',
    '<style>',
    'body{font-family:Arial,sans-serif;font-size:12px;margin:24px;color:#111}',
    'h2{margin:0 0 4px}',
    'p.sub{color:#666;margin:0 0 16px;font-size:11px}',
    'table{width:100%;border-collapse:collapse}',
    'th{background:#f3f4f6;text-align:left;padding:6px 8px;font-size:10px;',
    'text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid #e5e7eb}',
    'td{padding:5px 8px;border-bottom:1px solid #e5e7eb}',
    'tfoot td{font-weight:bold;border-top:2px solid #e5e7eb;background:#f9fafb}',
    '@media print{button{display:none}}',
    '</style>',
    '</head>',
    '<body>',
    '<h2>Salary Payments</h2>',
    '<p class="sub">Period: ' + month + ' ' + year + ' &nbsp;|&nbsp; Generated: ' + new Date().toLocaleString('en-GB') + '</p>',
    '<table>',
    '<thead><tr>',
    '<th>#</th><th>Employee</th><th>Method</th><th>Bank / Account</th><th>Reference</th>',
    '<th style="text-align:right">Amount (RWF)</th>',
    '</tr></thead>',
    '<tbody>' + rowsHtml + '</tbody>',
    '<tfoot><tr>',
    '<td colspan="5">TOTAL PAID</td>',
    '<td style="text-align:right">' + total.toLocaleString() + '</td>',
    '</tr></tfoot>',
    '</table>',
    '<scr' + 'ipt>window.onload=function(){window.print()}</scr' + 'ipt>',
    '</body></html>',
  ]
  const html = parts.join('')
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  window.open(url, '_blank')
}

const METHOD_COLORS: Record<string, string> = {
  'Bank Transfer': 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
  'Cash':          'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  'MoMo':          'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
}

/* ══════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════════════════════════════════ */
export default function PaymentsPage() {
  const [sp, setSp]   = useSearchParams()
  const canManage = usePermission(PERMISSIONS.MANAGE_HR_EMPLOYEES)
  const qc            = useQueryClient()

  const periodYear  = parseInt(sp.get('period_year')  || String(CUR_Y))
  const periodMonth = parseInt(sp.get('period_month') || String(CUR_M))
  const [search, setSearch]   = useState('')
  const [cancelling, setCancelling] = useState<SalaryPayment | null>(null)
  const [payAllOpen, setPayAllOpen] = useState(false)

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

        <div className="flex items-center gap-2 flex-wrap">
          {/* Pay All */}
         

          {/* Download */}
          <button
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[12px] font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors"
            onClick={() => exportCSV(filtered, MONTHS[periodMonth - 1], periodYear)}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
          </button>
          <button
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 text-[12px] font-semibold hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-colors"
            onClick={() => printPDF(filtered, MONTHS[periodMonth - 1], periodYear, total)}
          >
            <FileText className="w-3.5 h-3.5" /> PDF
          </button>

          {/* Period nav */}
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
                  className={'hover:bg-ink-50/40 dark:hover:bg-ink-700/20 transition-colors ' + (p.status === 'Cancelled' ? 'opacity-50 line-through' : '')}
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
                    <span className={'inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ' + (METHOD_COLORS[p.payment_method] ?? 'bg-ink-100 text-ink-600')}>
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
                          <div className="text-[11px] text-ink-400 pl-4">{p.account_number}</div>
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
                    <span className={'inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ' + (
                      p.status === 'Processed'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                        : 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400'
                    )}>
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

            {processed.length > 0 && !isLoading && (
              <tfoot>
                <tr className="bg-emerald-50 dark:bg-emerald-500/10 border-t-2 border-emerald-200 dark:border-emerald-700 font-bold text-[12.5px]">
                  <td colSpan={2} className="px-3 py-3 text-ink-500 text-[11px] uppercase tracking-wider">TOTAL PAID</td>
                  <td className="px-3 py-3 text-right tabular-nums text-emerald-800 dark:text-emerald-200 text-[14px]">{fmt(total)}</td>
                  <td colSpan={canManage ? 6 : 5} className="px-3 py-3 text-[11px] text-ink-400">
                    RWF — {processed.length} disbursement{processed.length !== 1 ? 's' : ''}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Modals */}
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

      {payAllOpen && (
        <PayAllModal
          periodYear={periodYear}
          periodMonth={periodMonth}
          alreadyPaidIds={new Set(payments.filter(p => p.status === 'Processed').map(p => p.payroll_id))}
          onClose={() => setPayAllOpen(false)}
          onDone={() => {
            setPayAllOpen(false)
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

/* ══════════════════════════════════════════════════════════════════════
   PAY ALL MODAL
   Shows all Approved payroll entries not yet paid. Checkboxes let
   the manager exclude individual employees before bulk-processing.
   ══════════════════════════════════════════════════════════════════════ */
function PayAllModal({
  periodYear, periodMonth, alreadyPaidIds, onClose, onDone,
}: {
  periodYear:      number
  periodMonth:     number
  alreadyPaidIds:  Set<number>
  onClose:         () => void
  onDone:          () => void
}) {
  const [method,    setMethod]    = useState<PaymentMethod>('Bank Transfer')
  const [reference, setReference] = useState('')
  const [selected,  setSelected]  = useState<Set<number>>(new Set())
  const [progress,  setProgress]  = useState<{ done: number; total: number } | null>(null)
  const [seeded,    setSeeded]    = useState(false)

  /* Load all payroll entries for the period */
  const { data: payrollRes, isLoading } = useQuery({
    queryKey: ['pay-all-payroll', periodYear, periodMonth],
    queryFn:  ({ signal }) =>
      hrService.payrollList({ period_year: periodYear, period_month: periodMonth, per_page: 200 }, signal),
  })

  const allRows = (payrollRes?.data?.data ?? []) as PayrollRowEx[]

  /* Eligible: have an Approved payroll and not already paid this period */
  const eligible = useMemo(() => allRows.filter(r =>
    r.payroll_id != null &&
    (r as PayrollRowEx).payroll_status === 'Approved' &&
    !alreadyPaidIds.has(r.payroll_id as number) &&
    (r.net_salary ?? 0) > 0
  ), [allRows, alreadyPaidIds])

  /* Pre-select all on first load */
  if (!seeded && eligible.length > 0) {
    setSelected(new Set(eligible.map(r => r.payroll_id as number)))
    setSeeded(true)
  }

  const allChecked = eligible.length > 0 && selected.size === eligible.length
  const toggleAll  = () => setSelected(allChecked ? new Set() : new Set(eligible.map(r => r.payroll_id as number)))
  const toggle     = (id: number) => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const selectedRows = eligible.filter(r => selected.has(r.payroll_id as number))
  const totalNet     = selectedRows.reduce((s, r) => s + Number(r.net_salary ?? 0), 0)

  const processAll = async () => {
    if (selectedRows.length === 0) return
    setProgress({ done: 0, total: selectedRows.length })
    let done = 0
    let failed = 0
    for (const row of selectedRows) {
      try {
        await hrService.processPayment({
          payroll_id:     row.payroll_id as number,
          amount:         Number(row.net_salary),
          payment_method: method,
          bank_name:      method === 'Bank Transfer' ? ((row as any).bank ?? null) : null,
          account_number: method === 'Bank Transfer' ? ((row as any).bank_account ?? null) : null,
          reference:      reference || null,
        })
        done++
      } catch {
        failed++
      }
      setProgress({ done: done + failed, total: selectedRows.length })
    }
    if (failed === 0) {
      toast.success(done + ' salary payment' + (done !== 1 ? 's' : '') + ' processed.')
    } else {
      toast.error(done + ' processed, ' + failed + ' failed.')
    }
    onDone()
  }

  const isProcessing = progress !== null

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-ink-800 rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100 dark:border-ink-700 shrink-0">
          <div>
            <h3 className="font-bold text-[15px] text-ink-900 dark:text-white flex items-center gap-2">
              <PlayCircle className="w-4 h-4 text-brand" /> Pay All — {MONTHS[periodMonth - 1]} {periodYear}
            </h3>
            <p className="text-[12px] text-ink-400 mt-0.5">
              Uncheck employees you do NOT want to pay, then click Process.
            </p>
          </div>
          {!isProcessing && (
            <button className="icon-btn" onClick={onClose}><X className="w-4 h-4" /></button>
          )}
        </div>

        {/* Payment options */}
        <div className="px-5 pt-3 pb-3 border-b border-ink-100 dark:border-ink-700 shrink-0 flex flex-wrap gap-3">
          <div className="flex-1 min-w-[160px]">
            <label className="form-label">Payment Method</label>
            <select
              className="input text-[13px]"
              value={method}
              onChange={e => setMethod(e.target.value as PaymentMethod)}
              disabled={isProcessing}
            >
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Cash">Cash</option>
              <option value="MoMo">MoMo</option>
            </select>
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="form-label">Reference <span className="text-ink-400 font-normal">(optional)</span></label>
            <input
              className="input text-[13px]"
              placeholder="e.g. batch-2025-01"
              value={reference}
              onChange={e => setReference(e.target.value)}
              disabled={isProcessing}
            />
          </div>
        </div>

        {/* Employee list */}
        <div className="overflow-y-auto flex-1 px-5 py-2">
          {isLoading ? (
            <div className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" /></div>
          ) : eligible.length === 0 ? (
            <div className="py-10 text-center text-ink-400 text-[13px]">
              No approved, unpaid payroll entries for this period.
            </div>
          ) : (
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-[10px] font-bold text-ink-400 uppercase tracking-wider border-b border-ink-100 dark:border-ink-700">
                  <th className="py-2 pr-3 w-8">
                    <button onClick={toggleAll} className="flex items-center" disabled={isProcessing}>
                      {allChecked
                        ? <CheckSquare className="w-4 h-4 text-brand" />
                        : <Square className="w-4 h-4 text-ink-400" />}
                    </button>
                  </th>
                  <th className="py-2 text-left">Employee</th>
                  <th className="py-2 text-left">Department</th>
                  <th className="py-2 text-right">Net Salary (RWF)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50 dark:divide-ink-700">
                {eligible.map(row => {
                  const id      = row.payroll_id as number
                  const checked = selected.has(id)
                  return (
                    <tr
                      key={id}
                      className={'cursor-pointer hover:bg-ink-50/50 dark:hover:bg-ink-700/20 transition-colors ' + (!checked ? 'opacity-40' : '')}
                      onClick={() => !isProcessing && toggle(id)}
                    >
                      <td className="py-2.5 pr-3">
                        {checked
                          ? <CheckSquare className="w-4 h-4 text-brand" />
                          : <Square className="w-4 h-4 text-ink-400" />}
                      </td>
                      <td className="py-2.5">
                        <div className="font-semibold text-ink-900 dark:text-white">{row.full_name}</div>
                        <div className="text-[11px] text-ink-400">{row.emp_code}</div>
                      </td>
                      <td className="py-2.5 text-ink-500 text-[11px]">{(row as any).department ?? '—'}</td>
                      <td className="py-2.5 text-right font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                        {Number(row.net_salary ?? 0).toLocaleString()}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-ink-100 dark:border-ink-700 shrink-0">
          {/* Progress bar */}
          {isProcessing && progress && (
            <div className="mb-3">
              <div className="flex items-center justify-between text-[12px] text-ink-500 mb-1">
                <span>Processing payments…</span>
                <span>{progress.done} / {progress.total}</span>
              </div>
              <div className="h-2 bg-ink-100 dark:bg-ink-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand transition-all duration-300 rounded-full"
                  style={{ width: (progress.done / progress.total * 100) + '%' }}
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-4">
            <div className="text-[12px] text-ink-500">
              <span className="font-semibold text-ink-900 dark:text-white">{selectedRows.length}</span> of {eligible.length} selected
              {selectedRows.length > 0 && (
                <span className="ml-2 text-emerald-700 dark:text-emerald-400 font-semibold">
                  · {totalNet.toLocaleString()} RWF
                </span>
              )}
            </div>
            <div className="flex gap-2">
              {!isProcessing && (
                <button className="btn-secondary text-[13px]" onClick={onClose}>Cancel</button>
              )}
              <button
                className="btn-primary text-[13px] flex items-center gap-1.5 disabled:opacity-50"
                disabled={selectedRows.length === 0 || isProcessing}
                onClick={processAll}
              >
                {isProcessing
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing…</>
                  : <><PlayCircle className="w-3.5 h-3.5" /> Process {selectedRows.length} Payment{selectedRows.length !== 1 ? 's' : ''}</>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    </ModalPortal>
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
      toast.success('Payment of ' + payment.amount.toLocaleString() + ' RWF cancelled. Payroll reverted to Approved.')
      onDone()
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Cancel failed'),
  })

  return (
    <ModalPortal>
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
    </ModalPortal>
  )
}
