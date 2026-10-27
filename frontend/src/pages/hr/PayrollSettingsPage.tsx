import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { errorMessage, payrollRunService, type ReferenceData } from '@/services/payrollRunService'
import { PERMISSIONS } from '@/constants/permissions'
import { usePermission } from '@/utils/permissions'

/** Rates and the scheme-level figures shown in the versions table. */
const RATE_LABELS: [string, string][] = [
  ['pension_ee', 'Pension (employee) %'],
  ['pension_er', 'Pension (employer) %'],
  ['hazard_er', 'Occupational hazard %'],
  ['maternity_ee', 'Maternity (employee) %'],
  ['maternity_er', 'Maternity (employer) %'],
  ['rama_ee', 'RAMA (employee) %'],
  ['rama_er', 'RAMA (employer) %'],
  ['cbhi_ee', 'CBHI %'],
]

export default function PayrollSettingsPage() {
  const canChange = usePermission(PERMISSIONS.APPROVE_PAYROLL)
  const [reference, setReference] = useState<ReferenceData | null>(null)

  const [effectiveFrom, setEffectiveFrom] = useState('')
  const [note, setNote] = useState('')
  const [json, setJson] = useState('')

  const [roleCode, setRoleCode] = useState('')
  const [roleName, setRoleName] = useState('')
  const [roleAmount, setRoleAmount] = useState('')
  const [roleFrom, setRoleFrom] = useState('')

  const [gradeCode, setGradeCode] = useState('')
  const [gradeName, setGradeName] = useState('')
  const [gradeRate, setGradeRate] = useState('')
  const [gradeFrom, setGradeFrom] = useState('')

  const load = async () => {
    try {
      const res = await payrollRunService.reference()
      setReference(res.data)
      const latest = res.data?.settings_versions[0]
      if (latest) setJson(JSON.stringify(latest.settings, null, 2))
    } catch (error) {
      toast.error(errorMessage(error, 'Could not load the settings.'))
    }
  }

  useEffect(() => {
    load()
  }, [])

  /** The latest amount for each responsibility role. */
  const roles = useMemo(() => {
    const seen = new Map<string, ReferenceData['responsibility_roles'][number]>()
    for (const r of reference?.responsibility_roles ?? []) if (!seen.has(r.role_code)) seen.set(r.role_code, r)
    return [...seen.values()]
  }, [reference])

  const grades = useMemo(() => {
    const seen = new Map<string, ReferenceData['hourly_rates'][number]>()
    for (const g of reference?.hourly_rates ?? []) if (!seen.has(g.grade_code)) seen.set(g.grade_code, g)
    return [...seen.values()]
  }, [reference])

  const submitVersion = async () => {
    let settings: Record<string, unknown>
    try {
      settings = JSON.parse(json)
    } catch {
      toast.error('The settings are not valid JSON.')
      return
    }
    try {
      await payrollRunService.addSettings({ effective_from: effectiveFrom, settings, note })
      toast.success('Settings version added. It applies to runs for periods from that date.')
      setNote('')
      await load()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const submitRole = async () => {
    try {
      await payrollRunService.addRole({ role_code: roleCode, role_name: roleName, amount: Number(roleAmount), effective_from: roleFrom })
      toast.success('Responsibility amount added.')
      await load()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const submitGrade = async () => {
    try {
      await payrollRunService.addHourly({ grade_code: gradeCode, grade_name: gradeName, rate: Number(gradeRate), effective_from: gradeFrom })
      toast.success('Hourly rate added.')
      await load()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h2 className="text-lg font-bold text-ink-900 dark:text-white">Rates and settings</h2>
        <p className="text-[13px] text-ink-500">
          Changes take effect from a date you choose and never alter a run that already exists. Every change is recorded with who made it.
          {!canChange && ' You can view these settings; changing them needs the approval permission.'}
        </p>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-ink-500 border-b border-ink-100 dark:border-ink-800">
              <th className="px-3 py-2 font-semibold">In force from</th>
              {RATE_LABELS.map(([, label]) => <th key={label} className="px-3 py-2 font-semibold text-right">{label}</th>)}
              <th className="px-3 py-2 font-semibold">Note</th>
            </tr>
          </thead>
          <tbody>
            {(reference?.settings_versions ?? []).map((v) => {
              const rates = (v.settings.rates ?? {}) as Record<string, string>
              return (
                <tr key={v.id} className="border-b border-ink-50 dark:border-ink-900">
                  <td className="px-3 py-2 font-medium">{v.effective_from}</td>
                  {RATE_LABELS.map(([key]) => <td key={key} className="px-3 py-2 text-right tabular-nums">{rates[key] ?? '–'}</td>)}
                  <td className="px-3 py-2 text-ink-500">{v.note ?? ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {canChange && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="card p-4 space-y-2 lg:col-span-2">
            <h3 className="text-[13px] font-semibold">Add a settings version</h3>
            <p className="text-[12px] text-ink-500">Starts from the latest version. Edit the figures, choose the date, and add a note.</p>
            <div className="grid grid-cols-2 gap-3 text-[12px]">
              <label className="text-ink-500">Takes effect on<input type="date" className="input mt-1 w-full" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} /></label>
              <label className="text-ink-500">Note<input className="input mt-1 w-full" value={note} onChange={(e) => setNote(e.target.value)} /></label>
            </div>
            <textarea className="input w-full font-mono text-[12px] h-72" value={json} onChange={(e) => setJson(e.target.value)} />
            <div className="flex justify-end">
              <button type="button" className="btn-primary btn-sm" disabled={!effectiveFrom} onClick={submitVersion}>Add version</button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="card p-4 space-y-2">
              <h3 className="text-[13px] font-semibold">Responsibility amount</h3>
              <select className="input w-full" value={roleCode} onChange={(e) => {
                setRoleCode(e.target.value)
                setRoleName(roles.find((r) => r.role_code === e.target.value)?.role_name ?? '')
              }}>
                <option value="">Choose a role…</option>
                {roles.map((r) => <option key={r.role_code} value={r.role_code}>{r.role_name} · {Number(r.monthly_amount).toLocaleString()}</option>)}
              </select>
              <input className="input w-full" type="number" min={0} placeholder="Monthly RWF" value={roleAmount} onChange={(e) => setRoleAmount(e.target.value)} />
              <input type="date" className="input w-full" value={roleFrom} onChange={(e) => setRoleFrom(e.target.value)} />
              <button type="button" className="btn-secondary btn-sm w-full" disabled={!roleCode || !roleAmount || !roleFrom} onClick={submitRole}>Add amount</button>
            </div>

            <div className="card p-4 space-y-2">
              <h3 className="text-[13px] font-semibold">Hourly rate</h3>
              <select className="input w-full" value={gradeCode} onChange={(e) => {
                setGradeCode(e.target.value)
                setGradeName(grades.find((g) => g.grade_code === e.target.value)?.grade_name ?? '')
              }}>
                <option value="">Choose a grade…</option>
                {grades.map((g) => <option key={g.grade_code} value={g.grade_code}>{g.grade_name} · {Number(g.rate_per_hour).toLocaleString()}</option>)}
              </select>
              <input className="input w-full" type="number" min={1} placeholder="RWF per hour" value={gradeRate} onChange={(e) => setGradeRate(e.target.value)} />
              <input type="date" className="input w-full" value={gradeFrom} onChange={(e) => setGradeFrom(e.target.value)} />
              <button type="button" className="btn-secondary btn-sm w-full" disabled={!gradeCode || !gradeRate || !gradeFrom} onClick={submitGrade}>Add rate</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
