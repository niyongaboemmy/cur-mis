import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { formatRwf } from '@/components/hr/PayrollStatusBadge'
import { errorMessage, payrollRunService, type ContractRow, type ReferenceData } from '@/services/payrollRunService'
import { PERMISSIONS } from '@/constants/permissions'
import { usePermission } from '@/utils/permissions'

const EMPTY = {
  scheme_code: '',
  start_date: '',
  end_date: '',
  basic_salary: '',
  topup_rate: '',
  housing_divisor: '',
  transport_divisor: '',
  responsibility_roles: '',
  tax_method: '',
  tax_method_reason: '',
}

export default function EmployeePayrollProfilePage() {
  const navigate = useNavigate()
  const params = useParams()
  const canPrepare = usePermission(PERMISSIONS.MANAGE_PAYROLL)
  const [employeeInput, setEmployeeInput] = useState(params.employeeId ?? '')
  const employeeId = Number(params.employeeId ?? 0)
  const [contracts, setContracts] = useState<ContractRow[]>([])
  const [reference, setReference] = useState<ReferenceData | null>(null)
  const [form, setForm] = useState(EMPTY)

  useEffect(() => {
    payrollRunService.reference().then((r) => setReference(r.data)).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!employeeId) return
    payrollRunService.contracts(employeeId)
      .then((r) => setContracts(r.data ?? []))
      .catch((error) => toast.error(errorMessage(error, 'Could not load contracts.')))
  }, [employeeId])

  const save = async () => {
    try {
      const body: Record<string, unknown> = { ...form }
      for (const key of Object.keys(body)) if (body[key] === '') delete body[key]
      if (body.basic_salary !== undefined) body.basic_salary = Number(body.basic_salary)
      if (body.housing_divisor !== undefined) body.housing_divisor = Number(body.housing_divisor)
      if (body.transport_divisor !== undefined) body.transport_divisor = Number(body.transport_divisor)
      await payrollRunService.addContract(employeeId, body)
      toast.success('Contract added.')
      setForm(EMPTY)
      const fresh = await payrollRunService.contracts(employeeId)
      setContracts(fresh.data ?? [])
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const end = async (contract: ContractRow) => {
    const date = window.prompt('End date (YYYY-MM-DD)', new Date().toISOString().slice(0, 10))
    if (!date) return
    try {
      await payrollRunService.endContract(contract.id, date)
      toast.success('Contract ended.')
      const fresh = await payrollRunService.contracts(employeeId)
      setContracts(fresh.data ?? [])
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-ink-900 dark:text-white">Employee payroll profile</h2>
          <p className="text-[13px] text-ink-500">Salary history by contract. A salary change ends the old contract and starts a new one.</p>
        </div>
        <form className="flex gap-2 items-end" onSubmit={(e) => { e.preventDefault(); navigate(`/hr/payroll-profile/${employeeInput}`) }}>
          <label className="text-[12px] text-ink-500">Employee ID<input className="input mt-1 w-32" value={employeeInput} onChange={(e) => setEmployeeInput(e.target.value)} /></label>
          <button type="submit" className="btn-secondary btn-sm">Open</button>
        </form>
      </div>

      {!employeeId && <p className="text-[13px] text-ink-500">Enter an employee ID to see their contracts.</p>}

      {employeeId > 0 && (
        <>
          <div className="card overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-ink-500 border-b border-ink-100 dark:border-ink-800">
                  <th className="px-3 py-2 font-semibold">Scheme</th>
                  <th className="px-3 py-2 font-semibold">From</th>
                  <th className="px-3 py-2 font-semibold">To</th>
                  <th className="px-3 py-2 font-semibold text-right">Basic salary</th>
                  <th className="px-3 py-2 font-semibold">Roles</th>
                  <th className="px-3 py-2 font-semibold">Tax</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {contracts.length === 0 && (
                  <tr><td colSpan={8} className="px-3 py-6 text-center text-ink-500">No contracts yet.</td></tr>
                )}
                {contracts.map((c) => (
                  <tr key={c.id} className="border-b border-ink-50 dark:border-ink-900">
                    <td className="px-3 py-2">{c.scheme_code}</td>
                    <td className="px-3 py-2">{c.start_date}</td>
                    <td className="px-3 py-2">{c.end_date ?? 'open'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatRwf(c.basic_salary)}</td>
                    <td className="px-3 py-2">{c.responsibility_roles ?? '–'}</td>
                    <td className="px-3 py-2">{c.tax_method ? `${c.tax_method}` : 'scheme default'}{c.tax_method_reason ? ` (${c.tax_method_reason})` : ''}</td>
                    <td className="px-3 py-2">{c.status}</td>
                    <td className="px-3 py-2">
                      {canPrepare && !c.end_date && <button type="button" className="btn-ghost btn-sm" onClick={() => end(c)}>End</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {canPrepare && (
            <div className="card p-4 space-y-3">
              <h3 className="text-[13px] font-semibold">New contract</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
                <label className="text-ink-500">Scheme
                  <select className="input mt-1 w-full" value={form.scheme_code} onChange={(e) => setForm({ ...form, scheme_code: e.target.value })}>
                    <option value="">Choose…</option>
                    {reference?.pay_schemes.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
                  </select>
                </label>
                <label className="text-ink-500">Start<input type="date" className="input mt-1 w-full" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></label>
                <label className="text-ink-500">End (optional)<input type="date" className="input mt-1 w-full" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></label>
                <label className="text-ink-500">Basic salary (RWF)<input className="input mt-1 w-full" value={form.basic_salary} onChange={(e) => setForm({ ...form, basic_salary: e.target.value })} /></label>
                <label className="text-ink-500">Top-up % (blank = default)<input className="input mt-1 w-full" value={form.topup_rate} onChange={(e) => setForm({ ...form, topup_rate: e.target.value })} /></label>
                <label className="text-ink-500">Housing divisor (0 = none)<input className="input mt-1 w-full" value={form.housing_divisor} onChange={(e) => setForm({ ...form, housing_divisor: e.target.value })} /></label>
                <label className="text-ink-500">Transport divisor (0 = none)<input className="input mt-1 w-full" value={form.transport_divisor} onChange={(e) => setForm({ ...form, transport_divisor: e.target.value })} /></label>
                <label className="text-ink-500">Responsibility roles<input className="input mt-1 w-full" placeholder="dean,internal_auditor" value={form.responsibility_roles} onChange={(e) => setForm({ ...form, responsibility_roles: e.target.value })} /></label>
                <label className="text-ink-500">Tax method override
                  <select className="input mt-1 w-full" value={form.tax_method} onChange={(e) => setForm({ ...form, tax_method: e.target.value })}>
                    <option value="">Scheme default</option>
                    <option value="PROGRESSIVE">Progressive</option>
                    <option value="FLAT_SECONDARY">Flat 30%</option>
                    <option value="CASUAL_LABOUR">Casual labour</option>
                    <option value="NONE">None</option>
                  </select>
                </label>
                <label className="text-ink-500 md:col-span-2">Reason for tax override<input className="input mt-1 w-full" value={form.tax_method_reason} onChange={(e) => setForm({ ...form, tax_method_reason: e.target.value })} /></label>
              </div>
              <div className="flex justify-end">
                <button type="button" className="btn-primary btn-sm" disabled={!form.scheme_code || !form.start_date || !form.basic_salary} onClick={save}>Add contract</button>
              </div>
              <p className="text-[12px] text-ink-500">
                Runs for this person are <Link to="/hr/payroll-runs" className="underline">here</Link>. Lines are added from contracts when a run is generated.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
