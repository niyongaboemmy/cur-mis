import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Settings2, Save, Loader2, RefreshCw, Info } from 'lucide-react'
import { hrService, type PayrollConfig } from '@/services/hrService'

/* ── PAYE helper (Rwanda progressive brackets) ── */
function calcPaye(gross: number): number {
  if (gross <= 60_000)  return 0
  const b1 = (Math.min(gross, 100_000) - 60_000) * 0.10
  if (gross <= 100_000) return b1
  const b2 = b1 + (Math.min(gross, 200_000) - 100_000) * 0.20
  if (gross <= 200_000) return b2
  return b2 + (gross - 200_000) * 0.30
}

const fmt = (v: number, d = 0) =>
  v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })

const DEFAULTS: PayrollConfig = {
  rssb_employee_rate: 6,
  rssb_employer_rate: 6,
  maternity_employee_rate: 0.3,
  maternity_employer_rate: 0.3,
  cbhi_employee_rate: 5,
  cbhi_employer_rate: 5,
}

/* ══════════════════════════════════════════════════════════════════════
   HR SETTINGS PAGE — Payroll deduction rate configuration
   ══════════════════════════════════════════════════════════════════════ */
export default function HrSettingsPage() {
  const qc = useQueryClient()

  const { data: res, isLoading } = useQuery({
    queryKey: ['hr-payroll-config'],
    queryFn:  ({ signal }) => hrService.getPayrollConfig(signal),
  })

  const config = res?.data ?? DEFAULTS

  const [form, setForm] = useState<PayrollConfig>(DEFAULTS)
  const [preview, setPreview] = useState(500_000)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (res?.data) {
      setForm({ ...res.data })
      setDirty(false)
    }
  }, [res?.data])

  const setRate = (key: keyof PayrollConfig) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))
    setDirty(true)
  }

  const save = useMutation({
    mutationFn: () => hrService.updatePayrollConfig(form),
    onSuccess: () => {
      toast.success('Payroll configuration saved.')
      qc.invalidateQueries({ queryKey: ['hr-payroll-config'] })
      setDirty(false)
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Save failed'),
  })

  const reset = () => {
    if (config) { setForm({ ...config }); setDirty(false) }
  }

  /* Live preview calculations */
  const g            = preview
  const paye         = calcPaye(g)
  const rssbEmp      = g * (form.rssb_employee_rate / 100)
  const maternityEmp = g * (form.maternity_employee_rate / 100)
  const cbhiEmp      = g * (form.cbhi_employee_rate / 100)
  const totalEmpDed  = paye + rssbEmp + maternityEmp + cbhiEmp
  const netEmp       = g - totalEmpDed

  const rssbEmpr      = g * (form.rssb_employer_rate / 100)
  const maternityEmpr = g * (form.maternity_employer_rate / 100)
  const cbhiEmpr      = g * (form.cbhi_employer_rate / 100)
  const totalCost     = g + rssbEmpr + maternityEmpr + cbhiEmpr

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-brand" />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-ink-900 dark:text-white flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-brand" /> HR Payroll Settings
          </h2>
          <p className="text-[13px] text-ink-500">
            Configure deduction rates applied to all payroll calculations
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
          <p className="text-[11px] text-ink-400 mt-0.5">Deducted from employee's gross salary</p>
        </div>
        <div className="divide-y divide-ink-100 dark:divide-ink-700">
          <RateRow
            label="RSSB Pension"
            description="Rwanda Social Security Board — employee share"
            value={form.rssb_employee_rate}
            onChange={setRate('rssb_employee_rate')}
          />
          <RateRow
            label="Maternity Fund"
            description="Employee maternity contribution"
            value={form.maternity_employee_rate}
            onChange={setRate('maternity_employee_rate')}
          />
          <RateRow
            label="CBHI"
            description="Community Based Health Insurance"
            value={form.cbhi_employee_rate}
            onChange={setRate('cbhi_employee_rate')}
          />
        </div>
        <div className="px-5 py-3 bg-ink-50 dark:bg-ink-700/30 text-[11px] text-ink-500 font-mono">
          Total employee deduction (excl. PAYE):{' '}
          <span className="font-bold text-ink-700 dark:text-ink-300">
            {(form.rssb_employee_rate + form.maternity_employee_rate + form.cbhi_employee_rate).toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Employer Contribution Rates */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-ink-100 dark:border-ink-700 bg-ink-50 dark:bg-ink-700/30">
          <h3 className="font-bold text-[13px] text-ink-800 dark:text-ink-200">Employer Contribution Rates</h3>
          <p className="text-[11px] text-ink-400 mt-0.5">Paid by the institution on top of gross salary</p>
        </div>
        <div className="divide-y divide-ink-100 dark:divide-ink-700">
          <RateRow
            label="RSSB Pension"
            description="Rwanda Social Security Board — employer share"
            value={form.rssb_employer_rate}
            onChange={setRate('rssb_employer_rate')}
          />
          <RateRow
            label="Maternity Fund"
            description="Employer maternity contribution"
            value={form.maternity_employer_rate}
            onChange={setRate('maternity_employer_rate')}
          />
          <RateRow
            label="CBHI"
            description="Community Based Health Insurance — employer share"
            value={form.cbhi_employer_rate}
            onChange={setRate('cbhi_employer_rate')}
          />
        </div>
        <div className="px-5 py-3 bg-ink-50 dark:bg-ink-700/30 text-[11px] text-ink-500 font-mono">
          Total employer contribution:{' '}
          <span className="font-bold text-ink-700 dark:text-ink-300">
            {(form.rssb_employer_rate + form.maternity_employer_rate + form.cbhi_employer_rate).toFixed(1)}%
          </span>
          {' '}of gross
        </div>
      </div>

      {/* Live Preview */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-ink-100 dark:border-ink-700 bg-ink-50 dark:bg-ink-700/30 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-[13px] text-ink-800 dark:text-ink-200 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-brand" /> Live Preview
            </h3>
            <p className="text-[11px] text-ink-400 mt-0.5">Sample payslip using current rate configuration</p>
          </div>
          {/* Sample salary input */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-ink-400">Gross:</span>
            <input
              type="number" min="0" step="50000"
              className="input py-1 text-[12px] text-right w-32 tabular-nums"
              value={preview}
              onChange={e => setPreview(parseFloat(e.target.value) || 0)}
            />
            <span className="text-[11px] text-ink-400">RWF</span>
          </div>
        </div>

        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Employee side */}
          <div>
            <p className="text-[11px] font-bold text-ink-400 uppercase tracking-wider mb-2">Employee Receives</p>
            <div className="rounded-lg border border-ink-100 dark:border-ink-700 overflow-hidden">
              <PreviewRow label="Gross Salary"     value={g}          accent="font-bold" />
              <PreviewRow label="PAYE (progressive)" value={-paye}    accent="text-red-600 dark:text-red-400" />
              <PreviewRow label={`RSSB (${form.rssb_employee_rate}%)`} value={-rssbEmp} accent="text-orange-600 dark:text-orange-400" />
              <PreviewRow label={`Maternity (${form.maternity_employee_rate}%)`} value={-maternityEmp} accent="text-orange-600 dark:text-orange-400" />
              <PreviewRow label={`CBHI (${form.cbhi_employee_rate}%)`} value={-cbhiEmp} accent="text-sky-600 dark:text-sky-400" />
              <div className="flex items-center justify-between px-4 py-3 bg-emerald-50 dark:bg-emerald-500/10 border-t border-emerald-200 dark:border-emerald-700">
                <span className="text-[12px] font-bold text-emerald-700 dark:text-emerald-300">Net Salary</span>
                <span className="font-bold text-[14px] text-emerald-800 dark:text-emerald-200 tabular-nums">{fmt(Math.max(0, netEmp))}</span>
              </div>
            </div>
          </div>

          {/* Employer side */}
          <div>
            <p className="text-[11px] font-bold text-ink-400 uppercase tracking-wider mb-2">Employer Total Cost</p>
            <div className="rounded-lg border border-ink-100 dark:border-ink-700 overflow-hidden">
              <PreviewRow label="Gross Salary"     value={g}          accent="font-bold" />
              <PreviewRow label={`RSSB (${form.rssb_employer_rate}%)`}        value={rssbEmpr}      accent="text-orange-600 dark:text-orange-400" prefix="+" />
              <PreviewRow label={`Maternity (${form.maternity_employer_rate}%)`} value={maternityEmpr} accent="text-orange-600 dark:text-orange-400" prefix="+" />
              <PreviewRow label={`CBHI (${form.cbhi_employer_rate}%)`}        value={cbhiEmpr}      accent="text-sky-600 dark:text-sky-400" prefix="+" />
              <div className="flex items-center justify-between px-4 py-3 bg-blue-50 dark:bg-blue-500/10 border-t border-blue-200 dark:border-blue-700">
                <span className="text-[12px] font-bold text-blue-700 dark:text-blue-300">Total Cost</span>
                <span className="font-bold text-[14px] text-blue-800 dark:text-blue-200 tabular-nums">{fmt(totalCost)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Rate Row Component ── */
function RateRow({
  label, description, value, onChange,
}: {
  label: string
  description: string
  value: number
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <div className="flex items-center justify-between px-5 py-3">
      <div>
        <p className="text-[13px] font-semibold text-ink-800 dark:text-ink-200">{label}</p>
        <p className="text-[11px] text-ink-400">{description}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <input
          type="number"
          min="0" max="100" step="0.1"
          className="input py-1 text-[13px] text-right w-20 tabular-nums"
          value={value}
          onChange={onChange}
        />
        <span className="text-[13px] text-ink-500 w-4">%</span>
      </div>
    </div>
  )
}

/* ── Preview Row Component ── */
function PreviewRow({
  label, value, accent, prefix = '',
}: {
  label: string
  value: number
  accent?: string
  prefix?: string
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
