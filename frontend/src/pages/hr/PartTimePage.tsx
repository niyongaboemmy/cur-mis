import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { PayrollStatusBadge } from '@/components/hr/PayrollStatusBadge'
import {
  downloadFile,
  errorMessage,
  payrollRunService,
  type PartTimeRow,
  type ReferenceData,
} from '@/services/payrollRunService'
import { PERMISSIONS } from '@/constants/permissions'
import { usePermission } from '@/utils/permissions'

const NEXT_LABEL: Record<string, string> = {
  REQUESTED: 'Record DVCA approval',
  DVCA_APPROVED: 'Issue invitation',
  INVITED: 'Record contract',
}

const EMPTY = {
  employee_id: '',
  module_code: '',
  module_title: '',
  programme: 'Day',
  credits: '',
  grade_code: '',
  period_start: '',
  period_end: '',
  students: '',
  home_institution: '',
  origin_place: '',
  from_outside_huye: false,
  accommodation_nights: '',
  transport_zone: '',
  transport_trips: '',
}

export default function PartTimePage() {
  const canPrepare = usePermission(PERMISSIONS.MANAGE_PAYROLL)
  const [rows, setRows] = useState<PartTimeRow[]>([])
  const [reference, setReference] = useState<ReferenceData | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [filter, setFilter] = useState('')

  const load = async () => {
    try {
      const [list, ref] = await Promise.all([payrollRunService.partTime(filter || undefined), payrollRunService.reference()])
      setRows(list.data ?? [])
      setReference(ref.data)
    } catch (error) {
      toast.error(errorMessage(error, 'Could not load part-time assignments.'))
    }
  }

  useEffect(() => {
    load()
  }, [filter])

  const request = async () => {
    try {
      const body: Record<string, unknown> = {
        ...form,
        employee_id: Number(form.employee_id),
        credits: Number(form.credits),
        students: form.students ? Number(form.students) : undefined,
        accommodation_nights: Number(form.accommodation_nights || 0),
        transport_trips: Number(form.transport_trips || 0),
        transport_zone: form.transport_zone || undefined,
      }
      await payrollRunService.requestModule(body)
      toast.success('Module requested.')
      setForm(EMPTY)
      await load()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const advance = async (row: PartTimeRow) => {
    try {
      await payrollRunService.advancePartTime(row.id)
      toast.success('Moved on.')
      await load()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const changeHours = async (row: PartTimeRow) => {
    const hours = window.prompt('Hours to pay', row.hours_paid ?? row.hours_default)
    if (hours === null) return
    const reason = window.prompt('Reason for the change (required)')
    if (!reason?.trim()) return
    try {
      await payrollRunService.overrideHours(row.id, hours, reason.trim())
      toast.success('Hours updated.')
      await load()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const sendToRun = async (row: PartTimeRow) => {
    const runId = window.prompt('Payroll run ID for this month (a PART_TIME run)')
    if (!runId) return
    try {
      await payrollRunService.sendPartTime(row.id, Number(runId))
      toast.success('Sent to payroll.')
      await load()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-ink-900 dark:text-white">Part-time teaching</h2>
          <p className="text-[13px] text-ink-500">Request, DVCA approval, invitation, contract, then the module goes to a part-time payroll run.</p>
        </div>
        <select className="input w-56" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="REQUESTED">Requested</option>
          <option value="DVCA_APPROVED">DVCA approved</option>
          <option value="INVITED">Invitation issued</option>
          <option value="CONTRACTED">Contracted</option>
          <option value="SENT_TO_PAYROLL">Sent to payroll</option>
        </select>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-ink-500 border-b border-ink-100 dark:border-ink-800">
              <th className="px-3 py-2 font-semibold">Lecturer</th>
              <th className="px-3 py-2 font-semibold">Module</th>
              <th className="px-3 py-2 font-semibold">Programme</th>
              <th className="px-3 py-2 font-semibold text-right">Hours</th>
              <th className="px-3 py-2 font-semibold">Teaching period</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-ink-500">No assignments.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-ink-50 dark:border-ink-900 align-top">
                <td className="px-3 py-2">{r.employee_lname} {r.employee_fname}</td>
                <td className="px-3 py-2">{r.module_title}<div className="text-[11px] text-ink-400">{r.module_code} · {r.grade_code}</div></td>
                <td className="px-3 py-2">{r.programme}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.hours_paid ?? r.hours_default}
                  {r.hours_paid && <div className="text-[11px] text-amber-700">overridden</div>}
                </td>
                <td className="px-3 py-2">{r.period_start} → {r.period_end}</td>
                <td className="px-3 py-2"><PayrollStatusBadge status={r.status} /></td>
                <td className="px-3 py-2 space-y-1">
                  {canPrepare && NEXT_LABEL[r.status] && (
                    <button type="button" className="btn-secondary btn-sm block" onClick={() => advance(r)}>{NEXT_LABEL[r.status]}</button>
                  )}
                  {canPrepare && r.status === 'CONTRACTED' && (
                    <button type="button" className="btn-primary btn-sm block" onClick={() => sendToRun(r)}>Send to payroll</button>
                  )}
                  {canPrepare && r.status !== 'SENT_TO_PAYROLL' && (
                    <button type="button" className="btn-ghost btn-sm block" onClick={() => changeHours(r)}>Change hours</button>
                  )}
                  {r.status !== 'REQUESTED' && r.status !== 'DVCA_APPROVED' && (
                    <button type="button" className="btn-ghost btn-sm block"
                      onClick={() => downloadFile(`/hr/payroll/part-time/${r.id}/documents/invitation`, `invitation-${r.id}.pdf`).catch(() => toast.error('Invitation could not be produced.'))}>
                      Invitation (PDF)
                    </button>
                  )}
                  {(r.status === 'CONTRACTED' || r.status === 'SENT_TO_PAYROLL') && (
                    <button type="button" className="btn-ghost btn-sm block"
                      onClick={() => downloadFile(`/hr/payroll/part-time/${r.id}/documents/contract`, `contract-${r.id}.pdf`).catch(() => toast.error('Contract could not be produced.'))}>
                      Contract (PDF)
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canPrepare && reference && (
        <div className="card p-4 space-y-3">
          <h3 className="text-[13px] font-semibold">Request a module</h3>
          <p className="text-[12px] text-ink-500">Hours are credits × 4 unless you change them later with a reason. The requester cannot approve their own module.</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
            <label className="text-ink-500">Lecturer employee ID<input className="input mt-1 w-full" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} /></label>
            <label className="text-ink-500">Module code<input className="input mt-1 w-full" value={form.module_code} onChange={(e) => setForm({ ...form, module_code: e.target.value })} /></label>
            <label className="text-ink-500 md:col-span-2">Module title<input className="input mt-1 w-full" value={form.module_title} onChange={(e) => setForm({ ...form, module_title: e.target.value })} /></label>
            <label className="text-ink-500">Programme
              <select className="input mt-1 w-full" value={form.programme} onChange={(e) => setForm({ ...form, programme: e.target.value })}>
                <option value="Day">Day</option><option value="Weekend">Weekend</option><option value="Holiday">Holiday</option>
              </select>
            </label>
            <label className="text-ink-500">Credits<input className="input mt-1 w-full" value={form.credits} onChange={(e) => setForm({ ...form, credits: e.target.value })} /></label>
            <label className="text-ink-500">Grade
              <select className="input mt-1 w-full" value={form.grade_code} onChange={(e) => setForm({ ...form, grade_code: e.target.value })}>
                <option value="">Choose…</option>
                {reference.hourly_rates.map((g) => <option key={g.grade_code} value={g.grade_code}>{g.grade_name} ({Number(g.rate_per_hour).toLocaleString()})</option>)}
              </select>
            </label>
            <label className="text-ink-500">Teaching starts<input type="date" className="input mt-1 w-full" value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} /></label>
            <label className="text-ink-500">Teaching ends<input type="date" className="input mt-1 w-full" value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} /></label>
            <label className="text-ink-500">Students<input className="input mt-1 w-full" value={form.students} onChange={(e) => setForm({ ...form, students: e.target.value })} /></label>
            <label className="text-ink-500">Home institution<input className="input mt-1 w-full" value={form.home_institution} onChange={(e) => setForm({ ...form, home_institution: e.target.value })} /></label>
            <label className="text-ink-500">Place of origin<input className="input mt-1 w-full" value={form.origin_place} onChange={(e) => setForm({ ...form, origin_place: e.target.value })} /></label>
            <label className="text-ink-500 flex items-center gap-2 mt-5">
              <input type="checkbox" checked={form.from_outside_huye} onChange={(e) => setForm({ ...form, from_outside_huye: e.target.checked })} />
              From outside Huye
            </label>
            <label className="text-ink-500">Nights of accommodation<input className="input mt-1 w-full" value={form.accommodation_nights} onChange={(e) => setForm({ ...form, accommodation_nights: e.target.value })} /></label>
            <label className="text-ink-500">Transport zone
              <select className="input mt-1 w-full" value={form.transport_zone} onChange={(e) => setForm({ ...form, transport_zone: e.target.value })}>
                <option value="">None</option><option value="KIGALI">From Kigali</option><option value="OTHER">From elsewhere</option>
              </select>
            </label>
            <label className="text-ink-500">Trips<input className="input mt-1 w-full" value={form.transport_trips} onChange={(e) => setForm({ ...form, transport_trips: e.target.value })} /></label>
          </div>
          <div className="flex justify-end">
            <button type="button" className="btn-primary btn-sm"
              disabled={!form.employee_id || !form.module_code || !form.module_title || !form.credits || !form.grade_code || !form.period_start || !form.period_end}
              onClick={request}>
              Request module
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
