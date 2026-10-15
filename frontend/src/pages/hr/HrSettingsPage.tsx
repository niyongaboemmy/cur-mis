import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  Settings2, Save, Loader2, RefreshCw, Info,
  Plus, Trash2, Pencil, Check, X, ToggleLeft, ToggleRight,
} from 'lucide-react'
import {
  hrService, type PayrollConfig, type CustomDeduction, type CustomDeductionPayload, type PayrollRules,
} from '@/services/hrService'
import type { HrEmployee } from '@/types/academic'
import { computePayroll } from '@/utils/payrollCalc'

const fmt = (v: number, d = 0) =>
  v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })

/* Builds the rule set the payroll calculator uses from the settings on this page,
   so the live preview gives the same figures as a payslip. Rates are stored as
   percentages; the calculator works in fractions. */
function rulesFromConfig(
  form: PayrollConfig,
  roles: PayrollRules['responsibility_roles'],
): PayrollRules {
  const rate = (key: string) => Number((form as unknown as Record<string, unknown>)[key] ?? 0) / 100
  const amount = (key: string) => Number((form as unknown as Record<string, unknown>)[key] ?? 0)
  return {
    rates: {
      pension_employee:      rate('rssb_employee_rate'),
      pension_employer:      rate('rssb_employer_rate'),
      occupational_employer: rate('occupational_employer_rate'),
      maternity_employee:    rate('maternity_employee_rate'),
      maternity_employer:    rate('maternity_employer_rate'),
      rama_employee:         rate('rama_employee_rate'),
      rama_employer:         rate('rama_employer_rate'),
      cbhi_employee:         rate('cbhi_employee_rate'),
      cbhi_employer:         rate('cbhi_employer_rate'),
    },
    paye_bands: [
      { upper: amount('paye_band_1_upper'), rate: rate('paye_band_1_rate') },
      { upper: amount('paye_band_2_upper'), rate: rate('paye_band_2_rate') },
      { upper: amount('paye_band_3_upper'), rate: rate('paye_band_3_rate') },
      { upper: null,                        rate: rate('paye_band_4_rate') },
    ],
    responsibility_roles: roles,
  }
}

/* First message from a failed save: field errors from the server, else the message. */
function saveErrorMessage(e: any): string {
  const data = e?.response?.data
  if (data?.errors && typeof data.errors === 'object') {
    const first = Object.values(data.errors)[0]
    if (typeof first === 'string') return first
  }
  return data?.message ?? 'Save failed'
}

/* ══════════════════════════════════════════════════════════════════════
   HR PAYROLL SETTINGS PAGE
   Every number here is used by the CUR payroll calculation. The formulas
   themselves are fixed in the backend (PayrollCalculator).
   ══════════════════════════════════════════════════════════════════════ */
export default function HrSettingsPage() {
  const qc = useQueryClient()

  const { data: res, isLoading } = useQuery({
    queryKey: ['hr-payroll-config'],
    queryFn:  ({ signal }) => hrService.getPayrollConfig(signal),
  })

  const { data: rulesRes } = useQuery({
    queryKey: ['hr-payroll-rules'],
    queryFn:  ({ signal }) => hrService.getPayrollRules(signal),
    staleTime: 5 * 60 * 1000,
  })

  const { data: dedRes } = useQuery({
    queryKey: ['hr-custom-deductions'],
    queryFn:  ({ signal }) => hrService.listCustomDeductions(signal),
  })

  const roles = rulesRes?.data?.responsibility_roles ?? []
  const customDeductions: CustomDeduction[] = dedRes?.data ?? []

  const [form, setForm] = useState<PayrollConfig | null>(null)
  const [basic, setBasic] = useState(500_000)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (res?.data) {
      setForm({ ...res.data })
      setDirty(false)
    }
  }, [res?.data])

  const setValue = (key: string, value: number) => {
    setForm(prev => (prev ? ({ ...prev, [key]: value } as PayrollConfig) : prev))
    setDirty(true)
  }
  const numField = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValue(key, parseFloat(e.target.value) || 0)

  const save = useMutation({
    mutationFn: () => hrService.updatePayrollConfig(form ?? {}),
    onSuccess: () => {
      toast.success('Payroll settings saved.')
      qc.invalidateQueries({ queryKey: ['hr-payroll-config'] })
      qc.invalidateQueries({ queryKey: ['hr-payroll-rules'] })
      setDirty(false)
    },
    onError: (e: any) => toast.error(saveErrorMessage(e)),
  })

  const reset = () => {
    if (res?.data) { setForm({ ...res.data }); setDirty(false) }
  }

  if (isLoading || !form) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-brand" />
      </div>
    )
  }

  /* Live preview: the same calculation a payslip uses, with no allowances or deductions */
  const calc = computePayroll(
    { basicSalary: basic, responsibilityAmount: 0, arrears: 0, otherDeductions: 0 },
    rulesFromConfig(form, roles),
  )

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-ink-900 dark:text-white flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-brand" /> Payroll Settings
          </h2>
          <p className="text-[12px] text-ink-500 mt-0.5">
            Rates, PAYE bands and allowance amounts used for every payroll calculation.
          </p>
        </div>
        <div className="flex gap-2">
          {dirty && (
            <button className="btn-secondary btn-sm gap-1.5" onClick={reset}>
              <RefreshCw className="w-3.5 h-3.5" /> Reset
            </button>
          )}
          <button
            className="btn-primary btn-sm gap-1.5"
            onClick={() => save.mutate()}
            disabled={save.isPending || !dirty}
          >
            {save.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save Changes
          </button>
        </div>
      </div>

      {/* Employee Contribution Rates */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-ink-100 dark:border-ink-700 bg-ink-50 dark:bg-ink-700/30">
          <h3 className="font-bold text-[13px] text-ink-800 dark:text-ink-200">Employee Contribution Rates</h3>
          <p className="text-[11px] text-ink-400 mt-0.5">
            Pension and maternity use gross salary less transport; CBHI uses net salary.
          </p>
        </div>
        <div className="divide-y divide-ink-100 dark:divide-ink-700">
          <RateRow label="RSSB Pension"  description="Rwanda Social Security Board — employee share" value={form.rssb_employee_rate}   onChange={numField('rssb_employee_rate')} />
          <RateRow label="Maternity Fund" description="Employee maternity contribution"              value={form.maternity_employee_rate} onChange={numField('maternity_employee_rate')} />
          <RateRow label="RAMA"          description="Mutuelle de santé — employee share"           value={form.rama_employee_rate}      onChange={numField('rama_employee_rate')} />
          <RateRow label="CBHI"          description="Community Based Health Insurance (on net salary)" value={form.cbhi_employee_rate} onChange={numField('cbhi_employee_rate')} />
        </div>
      </div>

      {/* Employer Contribution Rates */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-ink-100 dark:border-ink-700 bg-ink-50 dark:bg-ink-700/30">
          <h3 className="font-bold text-[13px] text-ink-800 dark:text-ink-200">Employer (CUR) Contribution Rates</h3>
          <p className="text-[11px] text-ink-400 mt-0.5">Paid by the institution on top of gross salary</p>
        </div>
        <div className="divide-y divide-ink-100 dark:divide-ink-700">
          <RateRow label="RSSB Pension"           description="Rwanda Social Security Board — employer share" value={form.rssb_employer_rate}         onChange={numField('rssb_employer_rate')} />
          <RateRow label="Occupational hazard"    description="Employer only, on maternity base"               value={form.occupational_employer_rate} onChange={numField('occupational_employer_rate')} />
          <RateRow label="Maternity Fund"         description="Employer maternity contribution"                value={form.maternity_employer_rate}    onChange={numField('maternity_employer_rate')} />
          <RateRow label="RAMA"                   description="Mutuelle de santé — employer share"             value={form.rama_employer_rate}         onChange={numField('rama_employer_rate')} />
          <RateRow label="CBHI"                   description="Community Based Health Insurance — employer share (on gross)" value={form.cbhi_employer_rate} onChange={numField('cbhi_employer_rate')} />
        </div>
      </div>

      {/* PAYE bands */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-ink-100 dark:border-ink-700 bg-ink-50 dark:bg-ink-700/30">
          <h3 className="font-bold text-[13px] text-ink-800 dark:text-ink-200">PAYE Bands (monthly)</h3>
          <p className="text-[11px] text-ink-400 mt-0.5">
            Each rate applies only to the part of gross salary inside its band.
          </p>
        </div>
        <div className="divide-y divide-ink-100 dark:divide-ink-700">
          <BandRow label="Band 1" upper={form.paye_band_1_upper} onUpper={numField('paye_band_1_upper')}
                   rate={form.paye_band_1_rate} onRate={numField('paye_band_1_rate')} />
          <BandRow label="Band 2" upper={form.paye_band_2_upper} onUpper={numField('paye_band_2_upper')}
                   rate={form.paye_band_2_rate} onRate={numField('paye_band_2_rate')} />
          <BandRow label="Band 3" upper={form.paye_band_3_upper} onUpper={numField('paye_band_3_upper')}
                   rate={form.paye_band_3_rate} onRate={numField('paye_band_3_rate')} />
          <BandRow label="Above band 3" upper={null} rate={form.paye_band_4_rate} onRate={numField('paye_band_4_rate')} />
        </div>
      </div>

      {/* Responsibility allowances */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-ink-100 dark:border-ink-700 bg-ink-50 dark:bg-ink-700/30">
          <h3 className="font-bold text-[13px] text-ink-800 dark:text-ink-200">Responsibility Allowances</h3>
          <p className="text-[11px] text-ink-400 mt-0.5">Monthly amount for each role (RWF)</p>
        </div>
        <div className="divide-y divide-ink-100 dark:divide-ink-700">
          {roles.map(role => (
            <div key={role.code} className="flex items-center justify-between px-5 py-3">
              <p className="text-[13px] font-semibold text-ink-800 dark:text-ink-200">{role.label}</p>
              <input type="number" min="0" step="1000"
                className="input py-1 text-[13px] text-right w-36 tabular-nums"
                value={Number((form as unknown as Record<string, unknown>)[`resp_${role.code}`] ?? 0)}
                onChange={numField(`resp_${role.code}`)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Custom Deductions */}
      <CustomDeductionsSection deductions={customDeductions} />

      {/* Live Preview */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-ink-100 dark:border-ink-700 bg-ink-50 dark:bg-ink-700/30 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-bold text-[13px] text-ink-800 dark:text-ink-200 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-brand" /> Live Preview
            </h3>
            <p className="text-[11px] text-ink-400 mt-0.5">Sample payslip using the settings above (unsaved changes included)</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-ink-400">Basic salary:</span>
            <input
              type="number" min="0" step="50000"
              className="input py-1 text-[12px] text-right w-32 tabular-nums"
              value={basic}
              onChange={e => setBasic(parseFloat(e.target.value) || 0)}
            />
            <span className="text-[11px] text-ink-400">RWF</span>
          </div>
        </div>

        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Employee side */}
          <div>
            <p className="text-[11px] font-bold text-ink-400 uppercase tracking-wider mb-2">Employee Receives</p>
            <div className="rounded-lg border border-ink-100 dark:border-ink-700 overflow-hidden">
              <PreviewRow label="Gross Salary"        value={calc.gross}            accent="font-bold" />
              <PreviewRow label="PAYE"                value={-calc.paye}            accent="text-red-600 dark:text-red-400" />
              <PreviewRow label="RSSB Pension"        value={-calc.pension_employee} accent="text-orange-600 dark:text-orange-400" />
              <PreviewRow label="Maternity"           value={-calc.maternity_employee} accent="text-orange-600 dark:text-orange-400" />
              <PreviewRow label="RAMA"                value={-calc.rama_employee}   accent="text-orange-600 dark:text-orange-400" />
              <PreviewRow label="CBHI"                value={-calc.cbhi}            accent="text-sky-600 dark:text-sky-400" />
              <div className="flex items-center justify-between px-4 py-3 bg-emerald-50 dark:bg-emerald-500/10 border-t border-emerald-200 dark:border-emerald-700">
                <span className="text-[12px] font-bold text-emerald-700 dark:text-emerald-300">Net Salary</span>
                <span className="font-bold text-[14px] text-emerald-800 dark:text-emerald-200 tabular-nums">{fmt(calc.net_pay)}</span>
              </div>
            </div>
          </div>

          {/* Employer side */}
          <div>
            <p className="text-[11px] font-bold text-ink-400 uppercase tracking-wider mb-2">CUR Total Cost</p>
            <div className="rounded-lg border border-ink-100 dark:border-ink-700 overflow-hidden">
              <PreviewRow label="Gross Salary"         value={calc.gross}                  accent="font-bold" />
              <PreviewRow label="RSSB Pension"         value={calc.pension_employer}       prefix="+" accent="text-orange-600 dark:text-orange-400" />
              <PreviewRow label="Occupational hazard"  value={calc.occupational_employer}  prefix="+" accent="text-orange-600 dark:text-orange-400" />
              <PreviewRow label="Maternity"            value={calc.maternity_employer}     prefix="+" accent="text-orange-600 dark:text-orange-400" />
              <PreviewRow label="RAMA"                 value={calc.rama_employer}          prefix="+" accent="text-orange-600 dark:text-orange-400" />
              <PreviewRow label="CBHI"                 value={calc.cbhi_employer}          prefix="+" accent="text-sky-600 dark:text-sky-400" />
              <div className="flex items-center justify-between px-4 py-3 bg-blue-50 dark:bg-blue-500/10 border-t border-blue-200 dark:border-blue-700">
                <span className="text-[12px] font-bold text-blue-700 dark:text-blue-300">Total Cost</span>
                <span className="font-bold text-[14px] text-blue-800 dark:text-blue-200 tabular-nums">{fmt(calc.employer_cost)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── PAYE Band Row Component ── */
function BandRow({ label, upper, onUpper, rate, onRate }: {
  label: string; upper: number | null; onUpper?: (e: React.ChangeEvent<HTMLInputElement>) => void
  rate: number; onRate: (e: React.ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-3">
      <p className="text-[13px] font-semibold text-ink-800 dark:text-ink-200">{label}</p>
      <div className="flex items-center gap-3 flex-wrap">
        {upper !== null && onUpper ? (
          <label className="flex items-center gap-2 text-[11px] text-ink-500">
            Up to
            <input type="number" min="0" step="1000"
              className="input py-1 text-[13px] text-right w-32 tabular-nums"
              value={upper} onChange={onUpper}
            />
            RWF
          </label>
        ) : (
          <span className="text-[11px] text-ink-400">No upper limit</span>
        )}
        <label className="flex items-center gap-2 text-[11px] text-ink-500">
          Rate
          <input type="number" min="0" max="100" step="0.1"
            className="input py-1 text-[13px] text-right w-20 tabular-nums"
            value={rate} onChange={onRate}
          />
          %
        </label>
      </div>
    </div>
  )
}

/* ── Automatic Deductions Section ── */
function CustomDeductionsSection({ deductions }: { deductions: CustomDeduction[] }) {
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['hr-custom-deductions'] })
    qc.invalidateQueries({ queryKey: ['hr-payroll-config'] })
  }

  const addMut = useMutation({
    mutationFn: (d: CustomDeductionPayload) => hrService.addCustomDeduction(d),
    onSuccess: () => {
      toast.success('Deduction added. Pending payroll updated.')
      refresh()
      setAdding(false)
    },
    onError: (e) => toast.error(saveErrorMessage(e)),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: CustomDeductionPayload }) =>
      hrService.updateCustomDeduction(id, data),
    onSuccess: () => {
      toast.success('Deduction updated. Pending payroll updated.')
      refresh()
      setEditId(null)
    },
    onError: (e) => toast.error(saveErrorMessage(e)),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => hrService.deleteCustomDeduction(id),
    onSuccess: () => {
      toast.success('Deduction removed. Pending payroll updated.')
      refresh()
    },
    onError: (e) => toast.error(saveErrorMessage(e)),
  })

  const toggleMut = useMutation({
    mutationFn: (d: CustomDeduction) =>
      hrService.updateCustomDeduction(d.id, { ...toPayload(d), is_active: d.is_active ? 0 : 1 }),
    onSuccess: () => refresh(),
    onError: (e) => toast.error(saveErrorMessage(e)),
  })

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-3 border-b border-ink-100 dark:border-ink-700 bg-ink-50 dark:bg-ink-700/30 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-[13px] text-ink-800 dark:text-ink-200">Additional Deductions</h3>
          <p className="text-[11px] text-ink-400 mt-0.5">
            Fixed amounts in RWF (RADIANT, other insurers, etc.) taken automatically from each payslip's net pay, for all staff or selected staff
          </p>
        </div>
        {!adding && (
          <button className="btn-primary btn-sm" onClick={() => setAdding(true)}>
            <Plus className="w-3.5 h-3.5" /> Add item
          </button>
        )}
      </div>

      {deductions.length === 0 && !adding && (
        <div className="px-5 py-8 text-center text-ink-400 text-[13px]">
          No additional deductions defined.{' '}
          <button className="text-brand underline" onClick={() => setAdding(true)}>Add one</button>
        </div>
      )}

      <div className="divide-y divide-ink-100 dark:divide-ink-700">
        {deductions.map(d =>
          editId === d.id
            ? <DeductionForm
                key={d.id}
                initial={d}
                pending={updateMut.isPending}
                onSave={(payload) => updateMut.mutate({ id: d.id, data: { ...payload, is_active: d.is_active } })}
                onCancel={() => setEditId(null)}
              />
            : (
              <div key={d.id} className={`flex flex-wrap items-center gap-3 px-5 py-3 ${!d.is_active ? 'opacity-50' : ''}`}>
                <button
                  onClick={() => toggleMut.mutate(d)}
                  disabled={toggleMut.isPending}
                  className="shrink-0 text-ink-400 hover:text-brand transition-colors"
                  title={d.is_active ? 'Disable' : 'Enable'}
                >
                  {d.is_active
                    ? <ToggleRight className="w-5 h-5 text-brand" />
                    : <ToggleLeft className="w-5 h-5" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-ink-800 dark:text-ink-200">{d.label}</p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    <span className="px-1.5 py-0.5 rounded bg-ink-100 dark:bg-ink-700 text-ink-600 dark:text-ink-300 text-[10px] font-semibold">{d.category}</span>
                    <span className="px-1.5 py-0.5 rounded bg-ink-100 dark:bg-ink-700 text-ink-600 dark:text-ink-300 text-[10px] font-semibold">
                      {d.amount_type === 'fixed' ? 'Fixed amount, from net pay' : (d.base === 'net' ? 'Percent of net salary' : 'Percent of gross salary')}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-ink-100 dark:bg-ink-700 text-ink-600 dark:text-ink-300 text-[10px] font-semibold">
                      {d.scope === 'all' ? 'All staff' : `${d.employee_ids.length} selected staff`}
                    </span>
                  </div>
                  {d.description && <p className="text-[11px] text-ink-400 mt-1">{d.description}</p>}
                </div>
                <div className="flex items-center gap-4 text-[12px] tabular-nums shrink-0">
                  {d.amount_type === 'fixed'
                    ? <>
                        <span className="text-ink-500">Emp: <span className="font-bold text-ink-800 dark:text-ink-100">{fmt(Number(d.employee_amount))} RWF</span></span>
                        <span className="text-ink-500">Empr: <span className="font-bold text-ink-800 dark:text-ink-100">{fmt(Number(d.employer_amount))} RWF</span></span>
                      </>
                    : <>
                        <span className="text-ink-500">Emp: <span className="font-bold text-ink-800 dark:text-ink-100">{Number(d.employee_rate)}%</span></span>
                        <span className="text-ink-500">Empr: <span className="font-bold text-ink-800 dark:text-ink-100">{Number(d.employer_rate)}%</span></span>
                      </>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => setEditId(d.id)} className="icon-btn" title="Edit">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => { if (confirm('Remove this deduction from all payslips it applies to?')) deleteMut.mutate(d.id) }}
                    className="icon-btn text-red-500 hover:text-red-600"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
        )}

        {adding && (
          <DeductionForm
            pending={addMut.isPending}
            onSave={(payload) => addMut.mutate(payload)}
            onCancel={() => setAdding(false)}
          />
        )}
      </div>
    </div>
  )
}

/** Turns a saved deduction into the request body. */
function toPayload(d: CustomDeduction): CustomDeductionPayload {
  return {
    label:         d.label,
    description:   d.description ?? '',
    category:        d.category,
    amount_type:     d.amount_type,
    employee_rate:   Number(d.employee_rate),
    employer_rate:   Number(d.employer_rate),
    employee_amount: Number(d.employee_amount),
    employer_amount: Number(d.employer_amount),
    base:            d.base,
    scope:           d.scope,
    employee_ids:    d.employee_ids ?? [],
  }
}

type DedFormVals = CustomDeductionPayload

function DeductionForm({
  initial, pending, onSave, onCancel,
}: {
  initial?: CustomDeduction
  pending: boolean
  onSave: (vals: DedFormVals) => void
  onCancel: () => void
}) {
  const [label,       setLabel]       = useState(initial?.label ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [category,    setCategory]    = useState<'Insurance' | 'Other'>(initial?.category ?? 'Insurance')
  // New items are fixed amounts. An older percentage item keeps its percentage unless HR switches it.
  const [amountType,  setAmountType]  = useState<'fixed' | 'percent'>(initial?.amount_type ?? 'fixed')
  const [base,        setBase]        = useState<'gross' | 'net'>(initial?.base ?? 'gross')
  const [scope,       setScope]       = useState<'all' | 'individual'>(initial?.scope ?? 'all')
  const [employeeIds, setEmployeeIds] = useState<number[]>(initial?.employee_ids ?? [])
  const [empAmount,   setEmpAmount]   = useState(String(initial ? Number(initial.employee_amount) : 0))
  const [emprAmount,  setEmprAmount]  = useState(String(initial ? Number(initial.employer_amount) : 0))
  const [empRate,     setEmpRate]     = useState(String(initial ? Number(initial.employee_rate) : 0))
  const [emprRate,    setEmprRate]    = useState(String(initial ? Number(initial.employer_rate) : 0))
  const [staffQuery,  setStaffQuery]  = useState('')
  const isFixed = amountType === 'fixed'

  const staffQ = useQuery({
    queryKey: ['hr', 'employees', 'deduction-picker'],
    queryFn:  ({ signal }) => hrService.listEmployees({ per_page: 500, status: 'Active' }, signal),
    staleTime: 5 * 60 * 1000,
    enabled:  scope === 'individual',
  })
  const staff = (staffQ.data?.data?.data ?? []) as HrEmployee[]
  const visibleStaff = staff.filter(e =>
    `${e.first_name} ${e.last_name}`.toLowerCase().includes(staffQuery.trim().toLowerCase())
  )

  const toggleStaff = (id: number) =>
    setEmployeeIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!label.trim()) return
    if (scope === 'individual' && employeeIds.length === 0) {
      toast.error('Select at least one staff member, or choose All staff.')
      return
    }
    onSave({
      label:           label.trim(),
      description:     description.trim(),
      category,
      amount_type:     amountType,
      employee_rate:   isFixed ? 0 : (parseFloat(empRate) || 0),
      employer_rate:   isFixed ? 0 : (parseFloat(emprRate) || 0),
      employee_amount: isFixed ? (parseFloat(empAmount) || 0) : 0,
      employer_amount: isFixed ? (parseFloat(emprAmount) || 0) : 0,
      base:            isFixed ? 'net' : base,
      scope,
      employee_ids:    scope === 'individual' ? employeeIds : [],
    })
  }

  return (
    <form onSubmit={submit} className="px-5 py-3 bg-brand/5 dark:bg-brand/10 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="form-label">Label <span className="text-red-500">*</span></label>
          <input autoFocus required className="input text-[13px]" placeholder="e.g. RADIANT" value={label} onChange={e => setLabel(e.target.value)} />
        </div>
        <div>
          <label className="form-label">Description <span className="text-ink-400 font-normal">(optional)</span></label>
          <input className="input text-[13px]" placeholder="Short description" value={description} onChange={e => setDescription(e.target.value)} />
        </div>
        <div>
          <label className="form-label">Category</label>
          <select className="input text-[13px]" value={category} onChange={e => setCategory(e.target.value as 'Insurance' | 'Other')}>
            <option value="Insurance">Insurance (RADIANT, other insurer)</option>
            <option value="Other">Other deduction</option>
          </select>
        </div>
        {initial?.amount_type === 'percent' && (
          <div>
            <label className="form-label">Amount type</label>
            <select className="input text-[13px]" value={amountType} onChange={e => setAmountType(e.target.value as 'fixed' | 'percent')}>
              <option value="percent">Percentage (older item)</option>
              <option value="fixed">Fixed amount (RWF)</option>
            </select>
          </div>
        )}
        {isFixed ? (
          <>
            <div>
              <label className="form-label">Employee amount (RWF)</label>
              <div className="flex items-center gap-1.5">
                <input type="number" min="0" step="1" className="input text-[13px]" value={empAmount} onChange={e => setEmpAmount(e.target.value)} />
                <span className="text-ink-500 text-[13px] shrink-0">RWF</span>
              </div>
            </div>
            <div>
              <label className="form-label">Employer amount (RWF)</label>
              <div className="flex items-center gap-1.5">
                <input type="number" min="0" step="1" className="input text-[13px]" value={emprAmount} onChange={e => setEmprAmount(e.target.value)} />
                <span className="text-ink-500 text-[13px] shrink-0">RWF</span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="form-label">Calculated on</label>
              <select className="input text-[13px]" value={base} onChange={e => setBase(e.target.value as 'gross' | 'net')}>
                <option value="gross">Gross salary</option>
                <option value="net">Net salary (after PAYE, RSSB, RAMA)</option>
              </select>
            </div>
            <div>
              <label className="form-label">Employee rate (%)</label>
              <div className="flex items-center gap-1.5">
                <input type="number" min="0" max="100" step="0.01" className="input text-[13px]" value={empRate} onChange={e => setEmpRate(e.target.value)} />
                <span className="text-ink-500 text-[13px]">%</span>
              </div>
            </div>
            <div>
              <label className="form-label">Employer rate (%)</label>
              <div className="flex items-center gap-1.5">
                <input type="number" min="0" max="100" step="0.01" className="input text-[13px]" value={emprRate} onChange={e => setEmprRate(e.target.value)} />
                <span className="text-ink-500 text-[13px]">%</span>
              </div>
            </div>
          </>
        )}
      </div>

      <fieldset className="space-y-2">
        <legend className="form-label">Applies to</legend>
        <div className="flex flex-wrap gap-4 text-[13px]">
          <label className="flex items-center gap-2">
            <input type="radio" name="ded-scope" checked={scope === 'all'} onChange={() => setScope('all')} />
            All staff
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="ded-scope" checked={scope === 'individual'} onChange={() => setScope('individual')} />
            Selected staff only
          </label>
        </div>

        {scope === 'individual' && (
          <div className="rounded-lg border border-ink-200 dark:border-ink-600 bg-white dark:bg-ink-800 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <input
                className="input text-[13px] max-w-xs"
                placeholder="Search staff"
                value={staffQuery}
                onChange={e => setStaffQuery(e.target.value)}
              />
              <span className="text-[11px] text-ink-500 shrink-0">{employeeIds.length} selected</span>
            </div>
            {staffQ.isLoading && <p className="text-[12px] text-ink-400">Loading staff…</p>}
            <div className="max-h-56 overflow-y-auto divide-y divide-ink-100 dark:divide-ink-700">
              {visibleStaff.map(e => (
                <label key={e.id} className="flex items-center gap-2 py-1.5 text-[13px] cursor-pointer">
                  <input type="checkbox" checked={employeeIds.includes(Number(e.id))} onChange={() => toggleStaff(Number(e.id))} />
                  {e.first_name} {e.last_name}
                </label>
              ))}
              {!staffQ.isLoading && visibleStaff.length === 0 && (
                <p className="py-2 text-[12px] text-ink-400">No matching staff.</p>
              )}
            </div>
          </div>
        )}
      </fieldset>

      <p className="text-[11px] text-ink-500">
        {isFixed
          ? 'A fixed amount is taken from net pay on every payslip for the chosen staff. Pending payslips are recalculated when you save; approved and paid ones are not changed.'
          : 'Applied automatically to every payslip for the chosen staff. Pending payslips are recalculated when you save; approved and paid ones are not changed.'}
      </p>

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
/* ── Rate Row Component ── */
function RateRow({ label, description, value, onChange }: {
  label: string; description: string; value: number
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <div className="flex items-center justify-between px-5 py-3">
      <div>
        <p className="text-[13px] font-semibold text-ink-800 dark:text-ink-200">{label}</p>
        <p className="text-[11px] text-ink-400">{description}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <input type="number" min="0" max="100" step="0.1"
          className="input py-1 text-[13px] text-right w-20 tabular-nums"
          value={value} onChange={onChange}
        />
        <span className="text-[13px] text-ink-500 w-4">%</span>
      </div>
    </div>
  )
}

/* ── Preview Row Component ── */
function PreviewRow({ label, value, accent, prefix = '' }: {
  label: string; value: number; accent?: string; prefix?: string
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-ink-100 dark:border-ink-700 last:border-0">
      <span className="text-[12px] text-ink-500">{label}</span>
      <span className={`tabular-nums text-[12px] font-medium ${accent ?? 'text-ink-700 dark:text-ink-300'}`}>
        {prefix}{Math.abs(value) > 0 ? fmt(Math.abs(value)) : '0'}
      </span>
    </div>
  )
}
