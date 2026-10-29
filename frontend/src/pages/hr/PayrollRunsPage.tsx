import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { PayrollStatusBadge } from '@/components/hr/PayrollStatusBadge'
import {
  errorMessage,
  payrollRunService,
  type ReferenceData,
  type RunRow,
} from '@/services/payrollRunService'
import { PERMISSIONS } from '@/constants/permissions'
import { usePermission } from '@/utils/permissions'

const EMPTY = { scheme_code: '', period_date: '', title: '' }

export default function PayrollRunsPage() {
  const navigate = useNavigate()
  const canPrepare = usePermission(PERMISSIONS.MANAGE_PAYROLL)
  const [runs, setRuns] = useState<RunRow[]>([])
  const [reference, setReference] = useState<ReferenceData | null>(null)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [list, ref] = await Promise.all([payrollRunService.runs(), payrollRunService.reference()])
      setRuns(list.data ?? [])
      setReference(ref.data)
    } catch (error) {
      toast.error(errorMessage(error, 'Could not load payroll runs.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const create = async () => {
    if (!form.scheme_code || !form.period_date) {
      toast.error('Choose a scheme and a month.')
      return
    }
    setSaving(true)
    try {
      const res = await payrollRunService.create({
        ...form,
        title: form.title.trim() || `${form.scheme_code} ${form.period_date.slice(0, 7)}`,
      })
      toast.success('Payroll run created')
      setForm(EMPTY)
      if (res.data?.id) navigate(`/hr/payroll-runs/${res.data.id}`)
    } catch (error) {
      toast.error(errorMessage(error, 'Could not create the run.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-ink-900 dark:text-white">Payroll runs</h2>
          <p className="text-[13px] text-ink-500">One run per pay scheme per month. Each run keeps the rates in force when it was made.</p>
        </div>
        <div className="flex gap-2 flex-wrap text-[13px]">
          <Link to="/hr/part-time" className="btn-secondary btn-sm">Part-time</Link>
          <Link to="/hr/payroll-profile" className="btn-secondary btn-sm">Employee contracts</Link>
          <Link to="/hr/payroll-data-quality" className="btn-secondary btn-sm">Data quality</Link>
          <Link to="/hr/payroll-settings" className="btn-secondary btn-sm">Rates and settings</Link>
          <button type="button" className="btn-secondary btn-sm gap-1.5" onClick={load} disabled={loading}>
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      {canPrepare && reference && (
        <div className="card p-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <label className="text-[12px] text-ink-500">
            Scheme
            <select className="input mt-1 w-full" value={form.scheme_code} onChange={(e) => setForm({ ...form, scheme_code: e.target.value })}>
              <option value="">Choose…</option>
              {reference.pay_schemes.map((s) => (
                <option key={s.code} value={s.code}>{s.name}</option>
              ))}
            </select>
          </label>
          <label className="text-[12px] text-ink-500">
            Month
            <input type="date" className="input mt-1 w-full" value={form.period_date} onChange={(e) => setForm({ ...form, period_date: e.target.value })} />
          </label>
          <label className="text-[12px] text-ink-500 md:col-span-2">
            Title
            <input className="input mt-1 w-full" placeholder="e.g. Salary for June 2026" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </label>
          <button type="button" className="btn-primary gap-1.5" onClick={create} disabled={saving}>
            <Plus className="w-4 h-4" /> New run
          </button>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-ink-500 border-b border-ink-100 dark:border-ink-800">
              <th className="px-3 py-2 font-semibold">Month</th>
              <th className="px-3 py-2 font-semibold">Scheme</th>
              <th className="px-3 py-2 font-semibold">Title</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold">Paid on</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-ink-500">{loading ? 'Loading…' : 'No payroll runs yet.'}</td>
              </tr>
            )}
            {runs.map((run) => (
              <tr key={run.id} className="border-b border-ink-50 dark:border-ink-900">
                <td className="px-3 py-2">{run.period_date.slice(0, 7)}</td>
                <td className="px-3 py-2">{run.scheme_code}</td>
                <td className="px-3 py-2">
                  <Link to={`/hr/payroll-runs/${run.id}`} className="font-medium text-brand-700 dark:text-brand-300 hover:underline">
                    {run.title}
                  </Link>
                </td>
                <td className="px-3 py-2"><PayrollStatusBadge status={run.status} /></td>
                <td className="px-3 py-2 text-ink-600">{run.paid_at ? run.paid_at.slice(0, 10) : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
