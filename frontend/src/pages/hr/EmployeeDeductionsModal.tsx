import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  X, Plus, Pencil, Trash2, Loader2, Check,
  CreditCard, GraduationCap, Wrench, HelpCircle,
} from 'lucide-react'
import {
  hrService,
  type EmployeeDeduction,
  type EmployeeDeductionPayload,
  type DeductionType,
  type DeductionStatus,
} from '@/services/hrService'

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December']

const DEDUCTION_TYPES: { value: DeductionType; label: string; icon: React.ReactNode }[] = [
  { value: 'Loan',         label: 'Loan',         icon: <CreditCard className="w-3.5 h-3.5" /> },
  { value: 'School Fees',  label: 'School Fees',  icon: <GraduationCap className="w-3.5 h-3.5" /> },
  { value: 'Restoration',  label: 'Restoration',  icon: <Wrench className="w-3.5 h-3.5" /> },
  { value: 'Other',        label: 'Other',        icon: <HelpCircle className="w-3.5 h-3.5" /> },
]

const TYPE_COLORS: Record<DeductionType, string> = {
  'Loan':        'bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300',
  'School Fees': 'bg-sky-100 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300',
  'Restoration': 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300',
  'Other':       'bg-ink-100 dark:bg-ink-600 text-ink-600 dark:text-ink-300',
}

const STATUS_COLORS: Record<DeductionStatus, string> = {
  'Active':    'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300',
  'Completed': 'bg-ink-100 dark:bg-ink-600 text-ink-500 dark:text-ink-400',
  'Cancelled': 'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400',
}

const fmt = (v: number) =>
  v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

const curYear  = new Date().getFullYear()
const curMonth = new Date().getMonth() + 1
const yearOpts = Array.from({ length: 6 }, (_, i) => curYear - 1 + i)

/* ══════════════════════════════════════════════════════════════════════
   MAIN MODAL
   ══════════════════════════════════════════════════════════════════════ */
export default function EmployeeDeductionsModal({
  empId,
  empName,
  onClose,
}: {
  empId: number
  empName: string
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [adding,  setAdding]  = useState(false)
  const [editDed, setEditDed] = useState<EmployeeDeduction | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['employee-deductions', empId],
    queryFn:  ({ signal }) => hrService.listEmployeeDeductions(empId, signal),
  })

  const deductions: EmployeeDeduction[] = data?.data ?? []
  const activeTotal = deductions
    .filter(d => d.status === 'Active')
    .reduce((s, d) => s + Number(d.monthly_amount), 0)

  const deleteMut = useMutation({
    mutationFn: (id: number) => hrService.deleteEmployeeDeduction(empId, id),
    onSuccess: () => {
      toast.success('Deduction removed.')
      qc.invalidateQueries({ queryKey: ['employee-deductions', empId] })
      qc.invalidateQueries({ queryKey: ['hr-payroll'] })
    },
    onError: () => toast.error('Failed to remove deduction.'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-ink-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100 dark:border-ink-700 shrink-0">
          <div>
            <h3 className="font-bold text-[15px] text-ink-900 dark:text-white">
              Employee Deductions
            </h3>
            <p className="text-[12px] text-ink-500 mt-0.5">{empName}</p>
          </div>
          <div className="flex items-center gap-2">
            {!adding && !editDed && (
              <button className="btn-primary btn-sm gap-1.5" onClick={() => setAdding(true)}>
                <Plus className="w-3.5 h-3.5" /> Add Deduction
              </button>
            )}
            <button className="icon-btn" onClick={onClose}><X className="w-4 h-4" /></button>
          </div>
        </div>

        {/* Summary bar */}
        {activeTotal > 0 && (
          <div className="px-5 py-2.5 bg-violet-50 dark:bg-violet-500/10 border-b border-violet-100 dark:border-violet-800 flex items-center justify-between text-[12px] shrink-0">
            <span className="text-violet-700 dark:text-violet-300 font-medium">
              Total active monthly deductions
            </span>
            <span className="font-bold text-violet-800 dark:text-violet-200 tabular-nums">
              {fmt(activeTotal)} RWF / month
            </span>
          </div>
        )}

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-3">
          {/* Add form */}
          {adding && (
            <DeductionForm
              empId={empId}
              pending={false}
              onSaved={() => {
                setAdding(false)
                qc.invalidateQueries({ queryKey: ['employee-deductions', empId] })
                qc.invalidateQueries({ queryKey: ['hr-payroll'] })
              }}
              onCancel={() => setAdding(false)}
            />
          )}

          {/* Edit form */}
          {editDed && (
            <DeductionForm
              empId={empId}
              initial={editDed}
              pending={false}
              onSaved={() => {
                setEditDed(null)
                qc.invalidateQueries({ queryKey: ['employee-deductions', empId] })
                qc.invalidateQueries({ queryKey: ['hr-payroll'] })
              }}
              onCancel={() => setEditDed(null)}
            />
          )}

          {/* List */}
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-brand" />
            </div>
          ) : deductions.length === 0 && !adding ? (
            <div className="text-center py-10 text-ink-400 text-[13px]">
              No deductions assigned.{' '}
              <button className="text-brand underline" onClick={() => setAdding(true)}>
                Add one
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {deductions.map(d => (
                <div
                  key={d.id}
                  className={`rounded-lg border px-4 py-3 flex items-start gap-3 ${
                    d.status !== 'Active'
                      ? 'border-ink-100 dark:border-ink-700 opacity-60'
                      : 'border-ink-200 dark:border-ink-700'
                  }`}
                >
                  {/* Type badge */}
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold shrink-0 mt-0.5 ${TYPE_COLORS[d.deduction_type as DeductionType]}`}>
                    {DEDUCTION_TYPES.find(t => t.value === d.deduction_type)?.icon}
                    {d.deduction_type}
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-[13px] text-ink-900 dark:text-white">{d.label}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${STATUS_COLORS[d.status]}`}>
                        {d.status}
                      </span>
                    </div>
                    {d.notes && (
                      <p className="text-[11px] text-ink-400 mt-0.5">{d.notes}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1 flex-wrap text-[11px] text-ink-500">
                      <span>
                        From: <span className="font-medium">{MONTHS[d.start_month - 1]} {d.start_year}</span>
                      </span>
                      {(d.end_year || d.end_month) && (
                        <span>
                          To: <span className="font-medium">{MONTHS[(d.end_month ?? 1) - 1]} {d.end_year}</span>
                        </span>
                      )}
                      {d.total_amount && (
                        <span>
                          Total: <span className="font-medium tabular-nums">{fmt(Number(d.total_amount))} RWF</span>
                        </span>
                      )}
                      {Number(d.paid_amount) > 0 && (
                        <span>
                          Paid: <span className="font-medium tabular-nums text-emerald-600">{fmt(Number(d.paid_amount))} RWF</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Monthly amount */}
                  <div className="text-right shrink-0">
                    <div className="font-bold text-[14px] text-ink-900 dark:text-white tabular-nums">
                      {fmt(Number(d.monthly_amount))}
                    </div>
                    <div className="text-[10px] text-ink-400">RWF/month</div>
                  </div>

                  {/* Actions */}
                  {!adding && !editDed && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        className="icon-btn"
                        title="Edit"
                        onClick={() => setEditDed(d)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        className="icon-btn text-red-500 hover:text-red-600"
                        title="Remove"
                        onClick={() => {
                          if (confirm(`Remove deduction "${d.label}"?`)) {
                            deleteMut.mutate(d.id)
                          }
                        }}
                        disabled={deleteMut.isPending}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-ink-100 dark:border-ink-700 shrink-0 flex justify-end">
          <button className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   DEDUCTION FORM  (add / edit)
   ══════════════════════════════════════════════════════════════════════ */
function DeductionForm({
  empId, initial, pending: _pending, onSaved, onCancel,
}: {
  empId: number
  initial?: EmployeeDeduction
  pending: boolean
  onSaved: () => void
  onCancel: () => void
}) {
  const [type,        setType]        = useState<DeductionType>(initial?.deduction_type ?? 'Loan')
  const [label,       setLabel]       = useState(initial?.label ?? '')
  const [amount,      setAmount]      = useState(String(initial ? Number(initial.monthly_amount) : ''))
  const [totalAmt,    setTotalAmt]    = useState(String(initial?.total_amount ?? ''))
  const [paidAmt,     setPaidAmt]     = useState(String(initial ? Number(initial.paid_amount) : 0))
  const [notes,       setNotes]       = useState(initial?.notes ?? '')
  const [startYear,   setStartYear]   = useState(initial?.start_year  ?? curYear)
  const [startMonth,  setStartMonth]  = useState(initial?.start_month ?? curMonth)
  const [hasEnd,      setHasEnd]      = useState(!!(initial?.end_year))
  const [endYear,     setEndYear]     = useState(initial?.end_year  ?? curYear)
  const [endMonth,    setEndMonth]    = useState(initial?.end_month ?? curMonth)
  const [status,      setStatus]      = useState<DeductionStatus>(initial?.status ?? 'Active')

  const addMut = useMutation({
    mutationFn: (payload: EmployeeDeductionPayload) =>
      hrService.addEmployeeDeduction(empId, payload),
    onSuccess: () => { toast.success('Deduction added.'); onSaved() },
    onError:   () => toast.error('Failed to add deduction.'),
  })

  const updMut = useMutation({
    mutationFn: (payload: EmployeeDeductionPayload) =>
      hrService.updateEmployeeDeduction(empId, initial!.id, payload),
    onSuccess: () => { toast.success('Deduction updated.'); onSaved() },
    onError:   () => toast.error('Failed to update deduction.'),
  })

  const pending = addMut.isPending || updMut.isPending

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!label.trim()) return
    const monthlyAmt = parseFloat(amount) || 0
    if (monthlyAmt <= 0) { toast.error('Monthly amount must be greater than 0.'); return }

    const payload: EmployeeDeductionPayload = {
      deduction_type: type,
      label: label.trim(),
      monthly_amount: monthlyAmt,
      total_amount:   totalAmt !== '' ? parseFloat(totalAmt) || null : null,
      paid_amount:    parseFloat(paidAmt) || 0,
      notes:          notes.trim(),
      start_year:     startYear,
      start_month:    startMonth,
      end_year:       hasEnd ? endYear  : null,
      end_month:      hasEnd ? endMonth : null,
      status,
    }

    if (initial) {
      updMut.mutate(payload)
    } else {
      addMut.mutate(payload)
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-lg border border-brand/30 bg-brand/5 dark:bg-brand/10 p-4 space-y-4"
    >
      <p className="text-[11px] font-bold text-brand uppercase tracking-wider">
        {initial ? 'Edit Deduction' : 'New Deduction'}
      </p>

      {/* Type selector */}
      <div>
        <label className="form-label">Type</label>
        <div className="flex gap-2 flex-wrap">
          {DEDUCTION_TYPES.map(t => (
            <button
              key={t.value}
              type="button"
              onClick={() => setType(t.value)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-colors ${
                type === t.value
                  ? 'bg-brand text-white border-brand'
                  : 'border-ink-200 dark:border-ink-600 text-ink-600 dark:text-ink-300 hover:border-brand hover:text-brand'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Label */}
        <div className="sm:col-span-2">
          <label className="form-label">Label / Description <span className="text-red-500">*</span></label>
          <input
            autoFocus required
            className="input text-[13px]"
            placeholder="e.g. Staff Housing Loan – BPR Bank"
            value={label}
            onChange={e => setLabel(e.target.value)}
          />
        </div>

        {/* Monthly amount */}
        <div>
          <label className="form-label">Monthly Amount (RWF) <span className="text-red-500">*</span></label>
          <input
            type="number" min="1" step="1" required
            className="input text-[13px] tabular-nums"
            placeholder="e.g. 50000"
            value={amount}
            onChange={e => setAmount(e.target.value)}
          />
        </div>

        {/* Total amount (optional) */}
        <div>
          <label className="form-label">
            Total Obligation (RWF)
            <span className="text-ink-400 font-normal ml-1">(optional)</span>
          </label>
          <input
            type="number" min="0" step="1"
            className="input text-[13px] tabular-nums"
            placeholder="Leave blank if indefinite"
            value={totalAmt}
            onChange={e => setTotalAmt(e.target.value)}
          />
        </div>

        {/* Paid amount (edit only) */}
        {initial && (
          <div>
            <label className="form-label">Paid to Date (RWF)</label>
            <input
              type="number" min="0" step="1"
              className="input text-[13px] tabular-nums"
              value={paidAmt}
              onChange={e => setPaidAmt(e.target.value)}
            />
          </div>
        )}

        {/* Status (edit only) */}
        {initial && (
          <div>
            <label className="form-label">Status</label>
            <select
              className="input text-[13px]"
              value={status}
              onChange={e => setStatus(e.target.value as DeductionStatus)}
            >
              <option value="Active">Active</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
        )}

        {/* Start period */}
        <div>
          <label className="form-label">Start Month</label>
          <div className="flex gap-2">
            <select
              className="input text-[13px] flex-1"
              value={startMonth}
              onChange={e => setStartMonth(Number(e.target.value))}
            >
              {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
            <select
              className="input text-[13px] w-24"
              value={startYear}
              onChange={e => setStartYear(Number(e.target.value))}
            >
              {yearOpts.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {/* End period */}
        <div>
          <label className="form-label flex items-center gap-2">
            End Month
            <label className="flex items-center gap-1 font-normal text-ink-400 cursor-pointer">
              <input
                type="checkbox"
                checked={hasEnd}
                onChange={e => setHasEnd(e.target.checked)}
                className="rounded"
              />
              <span className="text-[11px]">Set end date</span>
            </label>
          </label>
          {hasEnd ? (
            <div className="flex gap-2">
              <select
                className="input text-[13px] flex-1"
                value={endMonth}
                onChange={e => setEndMonth(Number(e.target.value))}
              >
                {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
              <select
                className="input text-[13px] w-24"
                value={endYear}
                onChange={e => setEndYear(Number(e.target.value))}
              >
                {yearOpts.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          ) : (
            <div className="input text-[13px] text-ink-400 bg-ink-50 dark:bg-ink-700/20 cursor-not-allowed">
              Open-ended
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="sm:col-span-2">
          <label className="form-label">Notes <span className="text-ink-400 font-normal">(optional)</span></label>
          <input
            className="input text-[13px]"
            placeholder="Additional details…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary btn-sm" onClick={onCancel}>
          <X className="w-3.5 h-3.5" /> Cancel
        </button>
        <button type="submit" className="btn-primary btn-sm" disabled={pending}>
          {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          {initial ? 'Update' : 'Add'}
        </button>
      </div>
    </form>
  )
}
