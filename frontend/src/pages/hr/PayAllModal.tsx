import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  PlayCircle, CheckSquare, Square, X, Loader2,
  Building2, Phone, CreditCard,
} from 'lucide-react'
import { hrService, type PaymentMethod, type PayrollRow } from '@/services/hrService'
import ModalPortal from '@/components/ui/ModalPortal'

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December']

type RowEx = PayrollRow & {
  payroll_status?: string
  bank?:           string | null
  bank_account?:   string | null
  phone?:          string | null
  department?:     string | null
}

export interface PayAllModalProps {
  periodYear:     number
  periodMonth:    number
  /** Set of payroll_ids that are already Processed for this period */
  alreadyPaidIds: Set<number>
  onClose:        () => void
  onDone:         () => void
}

export default function PayAllModal({
  periodYear, periodMonth, alreadyPaidIds, onClose, onDone,
}: PayAllModalProps) {
  const [method,    setMethod]    = useState<PaymentMethod>('Bank Transfer')
  const [reference, setReference] = useState('')
  const [selected,  setSelected]  = useState<Set<number>>(new Set())
  const [progress,  setProgress]  = useState<{ done: number; total: number } | null>(null)
  const [seeded,    setSeeded]    = useState(false)

  const { data: payrollRes, isLoading } = useQuery({
    queryKey: ['pay-all-payroll', periodYear, periodMonth],
    queryFn:  ({ signal }) =>
      hrService.payrollList({ period_year: periodYear, period_month: periodMonth, per_page: 200 }, signal),
  })

  const allRows = (payrollRes?.data?.data ?? []) as RowEx[]

  const eligible = useMemo(() =>
    allRows.filter(r =>
      r.payroll_id != null &&
      r.payroll_status === 'Approved' &&
      !alreadyPaidIds.has(r.payroll_id as number) &&
      (r.net_salary ?? 0) > 0
    ), [allRows, alreadyPaidIds])

  if (!seeded && eligible.length > 0) {
    setSelected(new Set(eligible.map(r => r.payroll_id as number)))
    setSeeded(true)
  }

  const allChecked = eligible.length > 0 && selected.size === eligible.length
  const toggleAll  = () =>
    setSelected(allChecked ? new Set() : new Set(eligible.map(r => r.payroll_id as number)))
  const toggle = (id: number) => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const selectedRows = eligible.filter(r => selected.has(r.payroll_id as number))
  const totalNet     = selectedRows.reduce((s, r) => s + Number(r.net_salary ?? 0), 0)
  const isProcessing = progress !== null

  /* per-row contact info based on selected method */
  const contactFor = (r: RowEx) => {
    if (method === 'Bank Transfer') {
      if (r.bank || r.bank_account) {
        return (
          <span className="inline-flex items-center gap-1 text-[11px] text-ink-500">
            <Building2 className="w-3 h-3 shrink-0 text-ink-400" />
            {r.bank ?? '—'}{r.bank_account ? ' · ' + r.bank_account : ''}
          </span>
        )
      }
      return <span className="text-[11px] text-ink-300">No bank info</span>
    }
    if (method === 'MoMo') {
      return r.phone
        ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-ink-500">
            <Phone className="w-3 h-3 shrink-0 text-ink-400" /> {r.phone}
          </span>
        )
        : <span className="text-[11px] text-amber-500">No phone on file</span>
    }
    return null  // Cash — nothing to show
  }

  const processAll = async () => {
    if (selectedRows.length === 0) return
    setProgress({ done: 0, total: selectedRows.length })
    let done = 0; let failed = 0
    for (const row of selectedRows) {
      try {
        let bankName: string | null = null
        let accountNumber: string | null = null
        if (method === 'Bank Transfer') {
          bankName      = row.bank      ?? null
          accountNumber = row.bank_account ?? null
        } else if (method === 'MoMo') {
          accountNumber = row.phone ?? null   // MoMo uses phone as account
        }
        await hrService.processPayment({
          payroll_id:     row.payroll_id as number,
          amount:         Number(row.net_salary),
          payment_method: method,
          bank_name:      bankName,
          account_number: accountNumber,
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

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-ink-800 rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100 dark:border-ink-700 shrink-0">
          <div>
            <h3 className="font-bold text-[15px] text-ink-900 dark:text-white flex items-center gap-2">
              <PlayCircle className="w-4 h-4 text-brand" />
              Pay All — {MONTHS[periodMonth - 1]} {periodYear}
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
            <label className="form-label flex items-center gap-1">
              <CreditCard className="w-3.5 h-3.5" /> Payment Method
            </label>
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
            <div className="py-10 text-center">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" />
            </div>
          ) : eligible.length === 0 ? (
            <div className="py-10 text-center text-ink-400 text-[13px]">
              No approved, unpaid payroll entries for this period.
            </div>
          ) : (
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-[10px] font-bold text-ink-400 uppercase tracking-wider border-b border-ink-100 dark:border-ink-700">
                  <th className="py-2 pr-3 w-8">
                    <button onClick={toggleAll} disabled={isProcessing}>
                      {allChecked
                        ? <CheckSquare className="w-4 h-4 text-brand" />
                        : <Square className="w-4 h-4 text-ink-400" />}
                    </button>
                  </th>
                  <th className="py-2 text-left">Employee</th>
                  <th className="py-2 text-left">
                    {method === 'Bank Transfer' ? 'Bank / Account' : method === 'MoMo' ? 'Phone (MoMo)' : 'Method'}
                  </th>
                  <th className="py-2 text-right">Net Salary (RWF)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50 dark:divide-ink-700/50">
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
                        <div className="font-semibold text-ink-900 dark:text-white leading-tight">{row.full_name}</div>
                        <div className="text-[11px] text-ink-400">{row.emp_code}{row.department ? ' · ' + row.department : ''}</div>
                      </td>
                      <td className="py-2.5">{contactFor(row)}</td>
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
              <span className="font-semibold text-ink-900 dark:text-white">{selectedRows.length}</span>
              {' '}of {eligible.length} selected
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
                  : <><PlayCircle className="w-3.5 h-3.5" /> Process {selectedRows.length} Payment{selectedRows.length !== 1 ? 's' : ''}</>
                }
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
    </ModalPortal>
  )
}
