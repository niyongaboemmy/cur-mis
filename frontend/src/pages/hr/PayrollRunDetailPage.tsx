import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Download, FileText, Pencil, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { PayrollStatusBadge, formatRwf, maskAccount } from '@/components/hr/PayrollStatusBadge'
import {
  downloadFile,
  errorMessage,
  payrollRunService,
  type RunHistory,
  type RunLine,
  type RunSummary,
} from '@/services/payrollRunService'
import { PERMISSIONS } from '@/constants/permissions'
import { usePermission } from '@/utils/permissions'

type SortKey = 'employee_name' | 'total_gross' | 'paye' | 'net_pay' | 'employer_cost'

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: 'employee_name', label: 'Employee', numeric: false },
  { key: 'total_gross', label: 'Total gross', numeric: true },
  { key: 'paye', label: 'PAYE', numeric: true },
  { key: 'net_pay', label: 'Net pay', numeric: true },
  { key: 'employer_cost', label: 'Employer cost', numeric: true },
]

const TOTAL_KEYS: (keyof RunLine)[] = ['total_gross', 'paye', 'rssb_employee_total', 'rama_employee', 'cbhi', 'deductions', 'net_pay', 'employer_cost']

export default function PayrollRunDetailPage() {
  const { id } = useParams()
  const runId = Number(id)
  const canPrepare = usePermission(PERMISSIONS.MANAGE_PAYROLL)
  const canApprove = usePermission(PERMISSIONS.APPROVE_PAYROLL)

  const [summary, setSummary] = useState<RunSummary | null>(null)
  const [lines, setLines] = useState<RunLine[]>([])
  const [history, setHistory] = useState<RunHistory | null>(null)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'employee_name', dir: 'asc' })
  const [editing, setEditing] = useState<RunLine | null>(null)

  const load = useCallback(async () => {
    try {
      const [s, l, h] = await Promise.all([
        payrollRunService.run(runId),
        payrollRunService.lines(runId),
        payrollRunService.history(runId),
      ])
      setSummary(s.data)
      setLines(l.data ?? [])
      setHistory(h.data)
    } catch (error) {
      toast.error(errorMessage(error, 'Could not load the run.'))
    }
  }, [runId])

  useEffect(() => {
    if (Number.isFinite(runId)) load()
  }, [runId, load])

  const run = summary?.run
  const editable = run ? run.status === 'DRAFT' || run.status === 'CALCULATED' : false

  /** Runs an action, shows the outcome, and reloads the run. */
  const act = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action()
      toast.success(success)
      await load()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const askReason = (question: string): string | null => {
    const reason = window.prompt(question)
    if (reason === null) return null
    if (reason.trim() === '') {
      toast.error('A reason is required.')
      return null
    }
    return reason.trim()
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = q ? lines.filter((l) => l.employee_name.toLowerCase().includes(q) || (l.bank_name ?? '').toLowerCase().includes(q)) : lines
    const sorted = [...filtered].sort((a, b) => {
      const av = a[sort.key]
      const bv = b[sort.key]
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
      return sort.dir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [lines, search, sort])

  const footer = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const key of TOTAL_KEYS) totals[key] = 0
    for (const l of visible) for (const key of TOTAL_KEYS) totals[key] += Number(l[key] ?? 0)
    return totals
  }, [visible])

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'employee_name' ? 'asc' : 'desc' }))

  if (!run) {
    return <div className="text-ink-500 text-[13px]">Loading the payroll run…</div>
  }

  const negative = lines.filter((l) => Number(l.net_pay) < 0).length
  const missingAccount = lines.filter((l) => !l.account_number).length

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[12px] text-ink-500"><Link to="/hr/payroll-runs" className="hover:underline">Payroll runs</Link> · {run.scheme_code} · {run.period_date.slice(0, 7)}</p>
          <h2 className="text-lg font-bold text-ink-900 dark:text-white flex items-center gap-3">
            {run.title} <PayrollStatusBadge status={run.status} />
          </h2>
          <p className="text-[12px] text-ink-500">
            Rates from the settings of {run.settings_effective_from}. Figures are stored; the snapshot never changes.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap text-[13px]">
          <button type="button" className="btn-secondary btn-sm gap-1.5"
            onClick={() => downloadFile(`/hr/payroll/runs/${runId}/export.xlsx`, `payroll-run-${runId}.xlsx`).catch(() => toast.error('Export failed.'))}>
            <Download className="w-3.5 h-3.5" /> Excel export
          </button>
          {canPrepare && editable && (
            <>
              <button type="button" className="btn-secondary btn-sm" onClick={() => act(() => payrollRunService.generate(runId), 'Lines added from contracts.')}>
                Add from contracts
              </button>
              <button type="button" className="btn-primary btn-sm" onClick={() => act(() => payrollRunService.calculate(runId), 'Run calculated.')}>
                Calculate
              </button>
            </>
          )}
          {canPrepare && run.status === 'CALCULATED' && (
            <button type="button" className="btn-primary btn-sm" onClick={() => act(() => payrollRunService.verify(runId), 'Run verified.')}>
              Verify
            </button>
          )}
          {canPrepare && run.status === 'VERIFIED' && (
            <button type="button" className="btn-secondary btn-sm"
              onClick={() => {
                const reason = askReason('Why is this run being sent back?')
                if (reason) act(() => payrollRunService.returnToPreparer(runId, reason), 'Sent back to the preparer.')
              }}>
              Send back
            </button>
          )}
          {canApprove && run.status === 'VERIFIED' && (
            <button type="button" className="btn-primary btn-sm"
              onClick={() => window.confirm('Approve this run? It will be locked.') && act(() => payrollRunService.approve(runId), 'Run approved and locked.')}>
              Approve
            </button>
          )}
          {canApprove && run.status === 'APPROVED' && (
            <button type="button" className="btn-primary btn-sm"
              onClick={() => {
                if (negative > 0 || missingAccount > 0) {
                  toast.error(`Fix ${missingAccount} missing account(s) and ${negative} negative net(s) first.`)
                  return
                }
                if (window.confirm('Mark this run as paid? It will be final.')) act(() => payrollRunService.pay(runId), 'Run marked paid.')
              }}>
              Mark paid
            </button>
          )}
          {canApprove && run.status === 'APPROVED' && (
            <button type="button" className="btn-secondary btn-sm"
              onClick={() => {
                const reason = askReason('Why does this run need to be reopened?')
                if (reason) act(() => payrollRunService.reopen(runId, reason), 'Run reopened.')
              }}>
              Reopen
            </button>
          )}
        </div>
      </div>

      {(negative > 0 || missingAccount > 0) && (
        <div className="card p-3 text-[13px] text-amber-800 dark:text-amber-300">
          {missingAccount > 0 && <span>{missingAccount} line(s) have no account number. </span>}
          {negative > 0 && <span>{negative} line(s) have a negative net pay.</span>}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card p-3"><p className="text-[12px] text-ink-500">People on the run</p><p className="text-xl font-bold">{lines.length}</p></div>
        <div className="card p-3"><p className="text-[12px] text-ink-500">Total gross</p><p className="text-xl font-bold">{formatRwf(summary?.totals.total_gross)}</p></div>
        <div className="card p-3"><p className="text-[12px] text-ink-500">Net pay</p><p className="text-xl font-bold">{formatRwf(summary?.totals.net_pay)}</p></div>
        <div className="card p-3"><p className="text-[12px] text-ink-500">Employer cost</p><p className="text-xl font-bold">{formatRwf(summary?.totals.employer_cost)}</p></div>
      </div>

      <div className="flex items-center gap-2">
        <input className="input w-64" placeholder="Search name or bank…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <span className="text-[12px] text-ink-500">{visible.length} shown</span>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-ink-500 border-b border-ink-100 dark:border-ink-800">
              {COLUMNS.map((c) => (
                <th key={c.key} className={`px-3 py-2 font-semibold cursor-pointer select-none ${c.numeric ? 'text-right' : ''}`} onClick={() => toggleSort(c.key)}>
                  {c.label}{sort.key === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
              <th className="px-3 py-2 font-semibold">Bank / account</th>
              <th className="px-3 py-2 font-semibold">Checks</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-ink-500">No lines yet.</td></tr>
            )}
            {visible.map((l) => (
              <tr key={l.id} className="border-b border-ink-50 dark:border-ink-900 align-top">
                <td className="px-3 py-2">
                  <div className="font-medium text-ink-900 dark:text-white">{l.employee_name}</div>
                  {l.line_ref && <div className="text-[11px] text-ink-400">{l.line_ref}</div>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatRwf(l.total_gross)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatRwf(l.paye)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatRwf(l.net_pay)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatRwf(l.employer_cost)}</td>
                <td className="px-3 py-2 text-ink-700 dark:text-ink-300">
                  {l.bank_name ?? '–'}<div className="text-[11px] font-mono">{maskAccount(l.account_number)}</div>
                </td>
                <td className="px-3 py-2">
                  {l.warnings.length > 0
                    ? l.warnings.map((w) => <span key={w} className="mr-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800">{w}</span>)
                    : <span className="text-ink-400">–</span>}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <button type="button" className="btn-ghost btn-sm" title="Payslip (PDF)"
                    onClick={() => downloadFile(`/hr/payroll/runs/${runId}/lines/${l.id}/payslip.pdf`, `payslip-${l.id}.pdf`).catch(() => toast.error('Payslip failed.'))}>
                    <FileText className="w-3.5 h-3.5" />
                  </button>
                  {canPrepare && editable && (
                    <>
                      <button type="button" className="btn-ghost btn-sm" title="Change this line" onClick={() => setEditing(l)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" className="btn-ghost btn-sm" title="Remove from the run"
                        onClick={() => {
                          const reason = askReason(`Why remove ${l.employee_name} from this run?`)
                          if (reason) act(() => payrollRunService.removeLine(runId, l.id, reason), 'Line removed.')
                        }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          {visible.length > 0 && (
            <tfoot>
              <tr className="font-semibold border-t border-ink-200 dark:border-ink-700">
                <td className="px-3 py-2">Totals ({visible.length})</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatRwf(footer.total_gross)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatRwf(footer.paye)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatRwf(footer.net_pay)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatRwf(footer.employer_cost)}</td>
                <td colSpan={4} className="px-3 py-2 text-[11px] font-normal text-ink-500">
                  RSSB {formatRwf(footer.rssb_employee_total)} · RAMA {formatRwf(footer.rama_employee)} · CBHI {formatRwf(footer.cbhi)} · Other {formatRwf(footer.deductions)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {canPrepare && editable && <AddLineForm runId={runId} schemeCode={run.scheme_code} onDone={load} />}
      {editing && (
        <EditLineForm
          runId={runId}
          line={editing}
          onClose={() => setEditing(null)}
          onDone={async () => {
            setEditing(null)
            await load()
          }}
        />
      )}

      {history && <HistoryPanel history={history} />}
    </div>
  )
}

function AddLineForm({ runId, schemeCode, onDone }: { runId: number; schemeCode: string; onDone: () => Promise<void> }) {
  const [employeeId, setEmployeeId] = useState('')
  const [lineRef, setLineRef] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unitRate, setUnitRate] = useState('')
  const [enteredGross, setEnteredGross] = useState('')
  const [targetNet, setTargetNet] = useState('')
  const [taxMethod, setTaxMethod] = useState('')
  const [deductions, setDeductions] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    const inputs: Record<string, unknown> = {}
    if (quantity) inputs.quantity = quantity
    if (unitRate) inputs.unit_rate = Number(unitRate)
    if (enteredGross) inputs.entered_gross = Number(enteredGross)
    if (targetNet) inputs.target_net = Number(targetNet)
    if (taxMethod) inputs.tax_method = taxMethod
    if (deductions) inputs.deductions = Number(deductions)
    setSaving(true)
    try {
      await payrollRunService.addLine(runId, { employee_id: Number(employeeId), line_ref: lineRef, inputs, reason })
      toast.success('Line added.')
      setEmployeeId(''); setLineRef(''); setQuantity(''); setUnitRate(''); setEnteredGross('')
      setTargetNet(''); setTaxMethod(''); setDeductions(''); setReason('')
      await onDone()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card p-4 space-y-3">
      <h3 className="text-[13px] font-semibold text-ink-900 dark:text-white">Add a line ({schemeCode})</h3>
      <p className="text-[12px] text-ink-500">Hours or days × unit rate, a typed gross, or a target net to gross up from. Tax method is optional; the scheme default applies if blank.</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
        <label className="text-ink-500">Employee ID<input className="input mt-1 w-full" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} /></label>
        <label className="text-ink-500">Module / ref<input className="input mt-1 w-full" value={lineRef} onChange={(e) => setLineRef(e.target.value)} /></label>
        <label className="text-ink-500">Quantity (hours or days)<input className="input mt-1 w-full" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></label>
        <label className="text-ink-500">Unit rate (RWF)<input className="input mt-1 w-full" value={unitRate} onChange={(e) => setUnitRate(e.target.value)} /></label>
        <label className="text-ink-500">Entered gross (RWF)<input className="input mt-1 w-full" value={enteredGross} onChange={(e) => setEnteredGross(e.target.value)} /></label>
        <label className="text-ink-500">Target net (gross-up)<input className="input mt-1 w-full" value={targetNet} onChange={(e) => setTargetNet(e.target.value)} /></label>
        <label className="text-ink-500">Tax method
          <select className="input mt-1 w-full" value={taxMethod} onChange={(e) => setTaxMethod(e.target.value)}>
            <option value="">Scheme default</option>
            <option value="PROGRESSIVE">Progressive</option>
            <option value="FLAT_SECONDARY">Flat 30% (secondary)</option>
            <option value="CASUAL_LABOUR">Casual labour</option>
            <option value="NONE">None</option>
          </select>
        </label>
        <label className="text-ink-500">Other deductions (RWF)<input className="input mt-1 w-full" value={deductions} onChange={(e) => setDeductions(e.target.value)} /></label>
      </div>
      <div className="flex gap-2 items-end">
        <label className="text-[12px] text-ink-500 flex-1">Reason (required)<input className="input mt-1 w-full" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        <button type="button" className="btn-primary btn-sm" disabled={saving || !employeeId || !reason.trim()} onClick={submit}>Add line</button>
      </div>
    </div>
  )
}

function EditLineForm({ runId, line, onClose, onDone }: { runId: number; line: RunLine; onClose: () => void; onDone: () => Promise<void> }) {
  const [arrears, setArrears] = useState(String(line.arrears ?? 0))
  const [deductions, setDeductions] = useState(String(line.deductions ?? 0))
  const [reason, setReason] = useState('')

  const submit = async () => {
    const changes: Record<string, unknown> = {}
    if (Number(arrears) !== Number(line.arrears ?? 0)) changes.arrears = Number(arrears)
    if (Number(deductions) !== Number(line.deductions ?? 0)) changes.deductions = Number(deductions)
    if (Object.keys(changes).length === 0) {
      onClose()
      return
    }
    try {
      await payrollRunService.updateLine(runId, line.id, { changes, reason })
      toast.success('Line changed. Recalculate the run.')
      await onDone()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <div className="card p-4 space-y-3 border-2 border-brand-300">
      <h3 className="text-[13px] font-semibold">Change {line.employee_name}</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[12px]">
        <label className="text-ink-500">Arrears (RWF)<input className="input mt-1 w-full" value={arrears} onChange={(e) => setArrears(e.target.value)} /></label>
        <label className="text-ink-500">Other deductions (RWF)<input className="input mt-1 w-full" value={deductions} onChange={(e) => setDeductions(e.target.value)} /></label>
        <label className="text-ink-500">Reason (required)<input className="input mt-1 w-full" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" className="btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-primary btn-sm" disabled={!reason.trim()} onClick={submit}>Save change</button>
      </div>
    </div>
  )
}

function HistoryPanel({ history }: { history: RunHistory }) {
  return (
    <details className="card p-4">
      <summary className="cursor-pointer text-[13px] font-semibold text-ink-900 dark:text-white">
        History: {history.adjustments.length} adjustment(s), {history.audit.length} event(s)
      </summary>
      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4 text-[12px]">
        <div>
          <p className="font-semibold text-ink-500 mb-1">Adjustments and reasons</p>
          <ul className="space-y-1">
            {history.adjustments.map((a) => (
              <li key={a.id}>
                <span className="font-mono">{a.component}</span>: {a.old_value ?? '–'} → {a.new_value ?? '–'}
                <span className="text-ink-500"> · {a.reason} · {a.created_at}</span>
              </li>
            ))}
            {history.adjustments.length === 0 && <li className="text-ink-500">None.</li>}
          </ul>
        </div>
        <div>
          <p className="font-semibold text-ink-500 mb-1">Events</p>
          <ul className="space-y-1">
            {history.audit.map((a) => (
              <li key={a.id}><span className="font-mono">{a.action}</span> · user {a.actor_user_id ?? '?'} · {a.created_at}</li>
            ))}
          </ul>
        </div>
      </div>
    </details>
  )
}
