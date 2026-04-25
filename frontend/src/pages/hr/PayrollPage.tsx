import { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  Search, Loader2, ChevronLeft, ChevronRight,
  Pencil, Eye, X, Settings2, Info,
  Mail, Phone, CalendarDays, Briefcase, BadgeCheck, User,
  Building2, CreditCard, UserCheck, TrendingDown, Wallet,
  UserPlus, Trash2, Save,
} from 'lucide-react'
import {
  hrService,
  type PayrollRow,
  type PayrollEntry,
  type PayrollListParams,
} from '@/services/hrService'
import { useDebounce } from '@/hooks/useDebounce'
import { useAuthStore } from '@/store/authStore'
import { PERMISSIONS } from '@/constants'

/* ══════════════════════════════════════════════════════════════════════
   PAYE FORMULA  (Rwanda Income Tax brackets — configurable)
   ══════════════════════════════════════════════════════════════════════ */

export interface FormulaConfig {
  b1: number   // bracket 1 ceiling  (≤ b1 → 0%)
  b2: number   // bracket 2 ceiling
  b3: number   // bracket 3 ceiling
  r1: number   // rate bracket 2  (0–1, e.g. 0.10 = 10%)
  r2: number   // rate bracket 3
  r3: number   // rate bracket 4+
}

const DEFAULT_FORMULA: FormulaConfig = {
  b1: 60_000, b2: 100_000, b3: 200_000,
  r1: 0.10,   r2: 0.20,    r3: 0.30,
}

const FORMULA_KEY = 'cur-mis-paye-formula'

function loadFormula(): FormulaConfig {
  try {
    const raw = localStorage.getItem(FORMULA_KEY)
    return raw ? { ...DEFAULT_FORMULA, ...JSON.parse(raw) } : DEFAULT_FORMULA
  } catch { return DEFAULT_FORMULA }
}

function saveFormula(f: FormulaConfig) {
  localStorage.setItem(FORMULA_KEY, JSON.stringify(f))
}

/** Precise (unrounded) PAYE from gross using progressive brackets. */
function calcPaye(gross: number, f: FormulaConfig): number {
  if (gross <= 0)    return 0
  if (gross <= f.b1) return 0
  const cum1 = (f.b2 - f.b1) * f.r1
  if (gross <= f.b2) return (gross - f.b1) * f.r1
  const cum2 = cum1 + (f.b3 - f.b2) * f.r2
  if (gross <= f.b3) return cum1 + (gross - f.b2) * f.r2
  return cum2 + (gross - f.b3) * f.r3
}

/* ══════════════════════════════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════════════════════════════ */

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December']
const SHORT_M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const now   = new Date()
const CUR_Y = now.getFullYear()
const CUR_M = now.getMonth() + 1
const PER_PAGE = 30

const yearOpts  = Array.from({ length: 5 }, (_, i) => CUR_Y - i)
const monthOpts = MONTHS.map((m, i) => ({ v: i + 1, label: m }))

const n0 = (v: number | string | null | undefined) =>
  v == null || v === '' ? 0 : Number(v)

const fmt = (v: number, decimals = 0) =>
  v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })

const fmtDiff = (v: number) => {
  if (Math.abs(v) < 0.005) return <span className="text-ink-300 dark:text-ink-600">–</span>
  return (
    <span className={v > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}>
      {v > 0 ? '+' : ''}{fmt(v, 2)}
    </span>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════════════════════════════════ */

export default function PayrollPage() {
  const [sp, setSp]       = useSearchParams()
  const { user }          = useAuthStore()
  const canManage         = user?.role === 'superadmin' || (user?.permissions ?? []).includes(PERMISSIONS.MANAGE_HR_EMPLOYEES)

  const [formula, setFormula]           = useState<FormulaConfig>(loadFormula)
  const [showFormulaModal, setShowFM]   = useState(false)
  const [editing, setEditing]           = useState<PayrollRow | null>(null)
  const [drawerRow, setDrawerRow]       = useState<{ row: PayrollRow; c: ReturnType<typeof computed>[number] } | null>(null)
  const [addingEmployee, setAddingEmp]  = useState(false)
  const [editingEmployee, setEditingEmp]= useState<PayrollRow | null>(null)
  const [deletingEmployee, setDelEmp]   = useState<PayrollRow | null>(null)

  /* period */
  const periodYear  = parseInt(sp.get('period_year')  || String(CUR_Y))
  const periodMonth = parseInt(sp.get('period_month') || String(CUR_M))

  const setPeriod = (y: number, m: number) => {
    const c = new URLSearchParams(sp)
    c.set('period_year', String(y)); c.set('period_month', String(m)); c.delete('page')
    setSp(c, { replace: true })
  }
  const prevMonth = () => { const d = new Date(periodYear, periodMonth - 2, 1); setPeriod(d.getFullYear(), d.getMonth() + 1) }
  const nextMonth = () => { const d = new Date(periodYear, periodMonth, 1);     setPeriod(d.getFullYear(), d.getMonth() + 1) }

  /* filters */
  const page = parseInt(sp.get('page') ?? '1')
  const [q, setQ]   = useState(sp.get('q') ?? '')
  const dq          = useDebounce(q, 300)
  const status      = sp.get('status') ?? ''

  const setF = (key: string, val: string) => {
    const c = new URLSearchParams(sp)
    val ? c.set(key, val) : c.delete(key); c.delete('page'); setSp(c, { replace: true })
  }

  const params: PayrollListParams = {
    page, per_page: PER_PAGE,
    q: dq || undefined,
    status: status || undefined,
    period_year: periodYear,
    period_month: periodMonth,
  }

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['hr-payroll', params],
    queryFn:  () => hrService.payrollList(params),
    placeholderData: prev => prev,
  })

  const resp     = data?.data
  const rows     = resp?.data     ?? []
  const total    = resp?.total    ?? 0
  const lastPage = resp?.last_page ?? 1

  const goPage = (p: number) => {
    const c = new URLSearchParams(sp); c.set('page', String(p)); setSp(c, { replace: true })
  }

  /* ── per-row computed columns ─────────────────────────────────────── */
  const computed = useMemo(() => rows.map((row: PayrollRow) => {
    const effectiveGross = n0(row.gross_salary) || n0(row.salary)
    const payeFormula    = calcPaye(effectiveGross, formula)          // precise
    const asPerHr        = n0(row.paye)                               // stored DB value
    const difference     = payeFormula - asPerHr                      // can be fractional
    const toBeUsed       = asPerHr                                    // what was recorded
    const rssb           = n0(row.rssb)
    const cbhi           = n0(row.cbhi)
    return { effectiveGross, payeFormula, asPerHr, difference, toBeUsed, rssb, cbhi }
  }), [rows, formula])

  /* ── totals ───────────────────────────────────────────────────────── */
  const totals = useMemo(() => computed.reduce((acc, c) => ({
    gross:      acc.gross      + c.effectiveGross,
    paye:       acc.paye       + c.payeFormula,
    asPerHr:    acc.asPerHr    + c.asPerHr,
    difference: acc.difference + c.difference,
    toBeUsed:   acc.toBeUsed   + c.toBeUsed,
  }), { gross: 0, paye: 0, asPerHr: 0, difference: 0, toBeUsed: 0 }), [computed])

  /* ── formula save callback ────────────────────────────────────────── */
  const onFormulaSave = useCallback((f: FormulaConfig) => {
    saveFormula(f)
    setFormula(f)
    setShowFM(false)
  }, [])

  /* ─────────────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-4 animate-fade-in">

      {/* ── header ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-ink-900 dark:text-white">Payroll</h2>
          <p className="text-[13px] text-ink-500">
            PAYE comparison · {MONTHS[periodMonth - 1]} {periodYear}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Add employee */}
          {canManage && (
            <button className="btn-primary btn-sm gap-1.5" onClick={() => setAddingEmp(true)}>
              <UserPlus className="w-3.5 h-3.5" /> Add Employee
            </button>
          )}
          {/* Formula settings */}
          {canManage && (
            <button className="btn-secondary btn-sm gap-1.5" onClick={() => setShowFM(true)}>
              <Settings2 className="w-3.5 h-3.5" /> Formula settings
            </button>
          )}
          {/* Period nav */}
          <button className="icon-btn" onClick={prevMonth}><ChevronLeft className="w-4 h-4" /></button>
          <select className="input py-1.5 text-[13px] w-36" value={periodMonth}
            onChange={e => setPeriod(periodYear, parseInt(e.target.value))}>
            {monthOpts.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
          <select className="input py-1.5 text-[13px] w-24" value={periodYear}
            onChange={e => setPeriod(parseInt(e.target.value), periodMonth)}>
            {yearOpts.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button className="icon-btn" onClick={nextMonth}><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

      {/* ── formula preview pill ── */}
      <div className="flex items-center gap-2 text-[11px] text-ink-400 dark:text-ink-500">
        <Info className="w-3.5 h-3.5 shrink-0" />
        <span className="font-mono">
          PAYE = IF(Gross ≤ {fmt(formula.b1)}, 0,
            IF(≤ {fmt(formula.b2)}, (G–{fmt(formula.b1)})×{(formula.r1*100).toFixed(0)}%,
            IF(≤ {fmt(formula.b3)}, {fmt((formula.b2-formula.b1)*formula.r1)}+(G–{fmt(formula.b2)})×{(formula.r2*100).toFixed(0)}%,
            {fmt((formula.b2-formula.b1)*formula.r1+(formula.b3-formula.b2)*formula.r2)}+(G–{fmt(formula.b3)})×{(formula.r3*100).toFixed(0)}%)))
        </span>
      </div>

      {/* ── filters ── */}
      <div className="card p-3 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" />
          <input className="input pl-9 py-2 text-[13px]" placeholder="Search name, code…"
            value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-ink-400 uppercase tracking-wider">Status</span>
          <select className="input py-1.5 text-[13px]" value={status} onChange={e => setF('status', e.target.value)}>
            <option value="">All</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
            <option value="Terminated">Terminated</option>
          </select>
        </div>
        {isFetching && !isLoading && <Loader2 className="w-4 h-4 animate-spin text-ink-300" />}
      </div>

      {/* ── payroll table ── */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-ink-100 dark:border-ink-700">
          <span className="font-semibold text-[13px] text-ink-800 dark:text-ink-200">
            {MONTHS[periodMonth - 1]} {periodYear}
          </span>
          <span className="text-[12px] text-ink-400">{total} employees</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12.5px]">
            <thead>
              <tr className="bg-ink-50 dark:bg-ink-800/60 border-b border-ink-100 dark:border-ink-700 text-[10px] font-bold text-ink-400 uppercase tracking-wider">
                <th className="px-3 py-2.5 text-center w-10">No</th>
                <th className="px-3 py-2.5">Employee</th>
                <th className="px-3 py-2.5 text-right">Gross Salary</th>
                <th className="px-3 py-2.5 text-right">
                  PAYE
                  <span className="ml-1 text-[9px] font-normal text-ink-300 normal-case">(formula)</span>
                </th>
                <th className="px-3 py-2.5 text-right">As per HR</th>
                <th className="px-3 py-2.5 text-right">Difference</th>
                <th className="px-3 py-2.5 text-right">To be used</th>
                <th className="px-3 py-2.5 text-center">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
              {isLoading ? (
                <tr><td colSpan={8} className="py-14 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" />
                </td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="py-14 text-center text-ink-400">No employees found.</td></tr>
              ) : rows.map((row: PayrollRow, idx: number) => {
                const c = computed[idx]
                return (
                  <tr
                    key={row.id}
                    className="hover:bg-ink-50/40 dark:hover:bg-ink-700/20 transition-colors cursor-pointer"
                    onClick={() => setDrawerRow({ row, c })}
                  >
                    {/* No */}
                    <td className="px-3 py-2.5 text-center text-ink-400 font-mono text-[11px]">
                      {(page - 1) * PER_PAGE + idx + 1}
                    </td>

                    {/* Employee */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Avatar name={row.full_name} />
                        <div>
                          <div className="font-semibold text-ink-900 dark:text-white leading-tight">{row.full_name}</div>
                          <div className="text-[11px] text-ink-400">{row.emp_code} · {row.department}</div>
                        </div>
                      </div>
                    </td>

                    {/* Gross Salary — click-to-edit */}
                    <td
                      className="px-3 py-2.5 text-right tabular-nums font-semibold text-ink-800 dark:text-ink-200"
                      onClick={canManage ? (e) => { e.stopPropagation(); setEditing(row) } : undefined}
                    >
                      <span className={canManage ? 'group/gross inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 cursor-pointer hover:bg-brand/10 hover:text-brand transition-colors' : ''}>
                        {c.effectiveGross > 0
                          ? fmt(c.effectiveGross)
                          : <span className="text-ink-300 font-normal">—</span>}
                        {canManage && (
                          <Pencil className="w-3 h-3 opacity-0 group-hover/gross:opacity-60 transition-opacity shrink-0" />
                        )}
                      </span>
                    </td>

                    {/* PAYE (formula) */}
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-700 dark:text-ink-300">
                      {c.effectiveGross > 0 ? fmt(Math.round(c.payeFormula)) : <span className="text-ink-300">—</span>}
                    </td>

                    {/* As per HR */}
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-600 dark:text-ink-400">
                      {row.payroll_id ? fmt(c.asPerHr) : <span className="text-ink-300">—</span>}
                    </td>

                    {/* Difference */}
                    <td className="px-3 py-2.5 text-right tabular-nums text-[12px]">
                      {row.payroll_id && c.effectiveGross > 0 ? fmtDiff(c.difference) : <span className="text-ink-300">—</span>}
                    </td>

                    {/* To be used */}
                    <td className="px-3 py-2.5 text-right tabular-nums font-bold text-emerald-700 dark:text-emerald-400">
                      {row.payroll_id ? fmt(c.toBeUsed) : <span className="text-ink-300 font-normal">—</span>}
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        {canManage && (
                          <button className="icon-btn" title="Edit gross salary"
                            onClick={() => setEditing(row)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <Link to={`/hr/payroll/${row.id}`} className="icon-btn" title="View payslip history">
                          <Eye className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>

            {/* ── Totals ── */}
            {rows.length > 0 && !isLoading && (
              <tfoot>
                <tr className="bg-ink-100 dark:bg-ink-700/50 border-t-2 border-ink-200 dark:border-ink-600 font-bold text-[12.5px]">
                  <td className="px-3 py-3 text-center text-ink-500 text-[11px] uppercase tracking-wider" colSpan={2}>
                    TOTAL
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-ink-900 dark:text-white">
                    {fmt(totals.gross)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-ink-700 dark:text-ink-300">
                    {fmt(Math.round(totals.paye))}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-ink-600 dark:text-ink-400">
                    {fmt(totals.asPerHr)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {fmtDiff(totals.difference)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                    {fmt(totals.toBeUsed)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Pagination */}
        {lastPage > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-ink-100 dark:border-ink-700">
            <span className="text-[12px] text-ink-400">Page {page} of {lastPage} · {total} records</span>
            <div className="flex items-center gap-1">
              <button className="icon-btn" disabled={page <= 1} onClick={() => goPage(page - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: Math.min(lastPage, 7) }, (_, i) => {
                const p = page <= 4 ? i + 1 : page - 3 + i
                if (p < 1 || p > lastPage) return null
                return (
                  <button key={p} onClick={() => goPage(p)}
                    className={`w-7 h-7 rounded text-[12px] font-medium transition-colors ${p === page ? 'bg-brand text-white' : 'hover:bg-ink-100 dark:hover:bg-ink-700 text-ink-600 dark:text-ink-300'}`}>
                    {p}
                  </button>
                )
              })}
              <button className="icon-btn" disabled={page >= lastPage} onClick={() => goPage(page + 1)}>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit gross modal */}
      {editing && (
        <EditGrossModal
          row={editing}
          periodYear={periodYear}
          periodMonth={periodMonth}
          formula={formula}
          onClose={() => setEditing(null)}
        />
      )}

      {/* Formula settings modal */}
      {showFormulaModal && (
        <FormulaModal
          current={formula}
          onSave={onFormulaSave}
          onClose={() => setShowFM(false)}
        />
      )}

      {/* Staff details drawer */}
      <StaffDrawer
        drawerRow={drawerRow}
        periodYear={periodYear}
        periodMonth={periodMonth}
        canManage={canManage}
        onClose={() => setDrawerRow(null)}
        onEdit={(row) => { setDrawerRow(null); setEditing(row) }}
        onEditEmployee={(row) => { setDrawerRow(null); setEditingEmp(row) }}
        onDelete={(row) => { setDrawerRow(null); setDelEmp(row) }}
      />

      {/* Add employee modal */}
      {addingEmployee && (
        <EmployeeFormModal
          onClose={() => setAddingEmp(false)}
        />
      )}

      {/* Edit employee modal */}
      {editingEmployee && (
        <EmployeeFormModal
          row={editingEmployee}
          onClose={() => setEditingEmp(null)}
        />
      )}

      {/* Delete confirmation */}
      {deletingEmployee && (
        <DeleteEmployeeModal
          row={deletingEmployee}
          onClose={() => setDelEmp(null)}
        />
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   EDIT GROSS MODAL  — only gross is editable; PAYE auto-calculates
   ══════════════════════════════════════════════════════════════════════ */
function EditGrossModal({
  row, periodYear, periodMonth, formula, onClose,
}: {
  row: PayrollRow
  periodYear: number
  periodMonth: number
  formula: FormulaConfig
  onClose: () => void
}) {
  const qc          = useQueryClient()
  const effectiveGross = n0(row.gross_salary) || n0(row.salary)
  const [gross, setGross] = useState(effectiveGross)

  const payeFormula = calcPaye(gross, formula)
  const rssb        = n0(row.rssb)
  const cbhi        = n0(row.cbhi)
  const net         = Math.max(0, gross - payeFormula - rssb - cbhi)

  const save = useMutation({
    mutationFn: () => hrService.payrollUpsert({
      emp_id:              row.id,
      period_year:         periodYear,
      period_month:        periodMonth,
      basic_salary:        n0(row.basic_salary) || gross,
      housing_allowance:   n0(row.housing_allowance),
      transport_allowance: n0(row.transport_allowance),
      other_allowances:    n0(row.other_allowances),
      gross_salary:        gross,
      paye:                payeFormula,
      rssb,
      cbhi,
      net_salary:          net,
    } as PayrollEntry),
    onSuccess: () => {
      toast.success('Payroll updated.')
      qc.invalidateQueries({ queryKey: ['hr-payroll'] })
      onClose()
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Save failed'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-ink-800 rounded-xl shadow-2xl w-full max-w-md">
        {/* header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100 dark:border-ink-700">
          <div>
            <h3 className="font-bold text-[15px] text-ink-900 dark:text-white">Edit Gross Salary</h3>
            <p className="text-[12px] text-ink-500">{row.full_name} · {row.emp_code} · {MONTHS[periodMonth - 1]} {periodYear}</p>
          </div>
          <button className="icon-btn" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>

        {/* body */}
        <div className="p-5 space-y-4">
          {/* Gross input */}
          <div>
            <label className="block text-[10px] font-bold text-ink-500 uppercase tracking-wider mb-1">
              Gross Salary (RWF)
            </label>
            <input
              type="number" min="0" step="1"
              className="input text-right text-[15px] font-semibold tabular-nums"
              value={gross || ''}
              onChange={e => setGross(parseFloat(e.target.value) || 0)}
              autoFocus
            />
          </div>

          {/* Computed breakdown */}
          <div className="rounded-lg border border-ink-100 dark:border-ink-700 overflow-hidden">
            <div className="bg-ink-50 dark:bg-ink-700/30 px-4 py-2 text-[10px] font-bold text-ink-400 uppercase tracking-wider">
              Calculated deductions
            </div>
            <div className="divide-y divide-ink-100 dark:divide-ink-700">
              <ComputedRow label="PAYE (TPR)" value={payeFormula} accent="text-red-600 dark:text-red-400" />
              {rssb > 0 && <ComputedRow label="RSSB (existing)" value={rssb} accent="text-orange-600 dark:text-orange-400" />}
              {cbhi > 0 && <ComputedRow label="CBHI (existing)" value={cbhi} accent="text-sky-600 dark:text-sky-400" />}
              <div className="flex items-center justify-between px-4 py-2.5 bg-emerald-50 dark:bg-emerald-500/10">
                <span className="text-[12px] font-bold text-emerald-700 dark:text-emerald-300">Net Salary</span>
                <span className="font-bold text-[14px] text-emerald-800 dark:text-emerald-200 tabular-nums">{fmt(net)}</span>
              </div>
            </div>
          </div>

          {/* Formula note */}
          <p className="text-[11px] text-ink-400 dark:text-ink-500 font-mono bg-ink-50 dark:bg-ink-700/20 rounded px-3 py-2">
            PAYE = {payeFormula > 0 ? fmt(payeFormula, 2) : '0'} (from Rwanda progressive tax formula)
          </p>
        </div>

        {/* footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-ink-100 dark:border-ink-700">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => save.mutate()} disabled={save.isPending || gross <= 0}>
            {save.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   FORMULA SETTINGS MODAL
   ══════════════════════════════════════════════════════════════════════ */
function FormulaModal({
  current, onSave, onClose,
}: {
  current: FormulaConfig
  onSave: (f: FormulaConfig) => void
  onClose: () => void
}) {
  const [f, setF] = useState({ ...current })
  const n = (k: keyof FormulaConfig) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF(prev => ({ ...prev, [k]: parseFloat(e.target.value) || 0 }))

  const cum1 = (f.b2 - f.b1) * f.r1
  const cum2 = cum1 + (f.b3 - f.b2) * f.r2

  const reset = () => setF({ ...DEFAULT_FORMULA })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-ink-800 rounded-xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100 dark:border-ink-700">
          <div>
            <h3 className="font-bold text-[15px] text-ink-900 dark:text-white flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-ink-400" /> PAYE Formula Settings
            </h3>
            <p className="text-[12px] text-ink-500">Configure Rwanda income tax progressive brackets</p>
          </div>
          <button className="icon-btn" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* Brackets table */}
          <div className="rounded-lg border border-ink-100 dark:border-ink-700 overflow-hidden">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="bg-ink-50 dark:bg-ink-700/30 text-[10px] font-bold text-ink-400 uppercase tracking-wider">
                  <th className="px-3 py-2 text-left">Bracket</th>
                  <th className="px-3 py-2 text-right">Ceiling (RWF)</th>
                  <th className="px-3 py-2 text-right">Rate (%)</th>
                  <th className="px-3 py-2 text-right">Cumulative tax at ceiling</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                {/* Bracket 1 — 0% */}
                <tr className="bg-white dark:bg-ink-800">
                  <td className="px-3 py-2.5 text-ink-600 dark:text-ink-300">0 → B1</td>
                  <td className="px-3 py-2.5 text-right">
                    <input type="number" min="0" step="1000" className="input py-1 text-[12px] text-right w-32"
                      value={f.b1} onChange={n('b1')} />
                  </td>
                  <td className="px-3 py-2.5 text-right text-ink-400">0%</td>
                  <td className="px-3 py-2.5 text-right text-ink-400 tabular-nums">0</td>
                </tr>

                {/* Bracket 2 */}
                <tr className="bg-white dark:bg-ink-800">
                  <td className="px-3 py-2.5 text-ink-600 dark:text-ink-300">B1 → B2</td>
                  <td className="px-3 py-2.5 text-right">
                    <input type="number" min="0" step="1000" className="input py-1 text-[12px] text-right w-32"
                      value={f.b2} onChange={n('b2')} />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <input type="number" min="0" max="100" step="1" className="input py-1 text-[12px] text-right w-16"
                        value={(f.r1 * 100).toFixed(0)} onChange={e => setF(prev => ({ ...prev, r1: (parseFloat(e.target.value) || 0) / 100 }))} />
                      <span className="text-ink-400">%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right text-ink-500 tabular-nums">{fmt(cum1, 0)}</td>
                </tr>

                {/* Bracket 3 */}
                <tr className="bg-white dark:bg-ink-800">
                  <td className="px-3 py-2.5 text-ink-600 dark:text-ink-300">B2 → B3</td>
                  <td className="px-3 py-2.5 text-right">
                    <input type="number" min="0" step="1000" className="input py-1 text-[12px] text-right w-32"
                      value={f.b3} onChange={n('b3')} />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <input type="number" min="0" max="100" step="1" className="input py-1 text-[12px] text-right w-16"
                        value={(f.r2 * 100).toFixed(0)} onChange={e => setF(prev => ({ ...prev, r2: (parseFloat(e.target.value) || 0) / 100 }))} />
                      <span className="text-ink-400">%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right text-ink-500 tabular-nums">{fmt(cum2, 0)}</td>
                </tr>

                {/* Bracket 4+ */}
                <tr className="bg-white dark:bg-ink-800">
                  <td className="px-3 py-2.5 text-ink-600 dark:text-ink-300">B3 → ∞</td>
                  <td className="px-3 py-2.5 text-right text-ink-400 text-[11px]">No limit</td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <input type="number" min="0" max="100" step="1" className="input py-1 text-[12px] text-right w-16"
                        value={(f.r3 * 100).toFixed(0)} onChange={e => setF(prev => ({ ...prev, r3: (parseFloat(e.target.value) || 0) / 100 }))} />
                      <span className="text-ink-400">%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right text-ink-400 text-[11px]">—</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Live preview */}
          <div>
            <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wider mb-2">Live preview</p>
            <div className="font-mono text-[11px] bg-ink-50 dark:bg-ink-700/20 rounded-lg p-3 space-y-1 text-ink-600 dark:text-ink-300">
              <p>IF(Gross ≤ {fmt(f.b1)}) → PAYE = 0</p>
              <p>IF(Gross ≤ {fmt(f.b2)}) → PAYE = (Gross – {fmt(f.b1)}) × {(f.r1*100).toFixed(0)}%</p>
              <p>IF(Gross ≤ {fmt(f.b3)}) → PAYE = {fmt(cum1, 0)} + (Gross – {fmt(f.b2)}) × {(f.r2*100).toFixed(0)}%</p>
              <p>IF(Gross  &gt; {fmt(f.b3)}) → PAYE = {fmt(cum2, 0)} + (Gross – {fmt(f.b3)}) × {(f.r3*100).toFixed(0)}%</p>
            </div>

            {/* Sample calculations */}
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[100_000, 341_834, 1_000_000].map(g => (
                <div key={g} className="rounded bg-ink-50 dark:bg-ink-700/20 px-3 py-2 text-center">
                  <div className="text-[10px] text-ink-400">Gross {fmt(g)}</div>
                  <div className="font-bold text-[13px] text-ink-800 dark:text-ink-200 tabular-nums">
                    PAYE {fmt(Math.round(calcPaye(g, f)))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-between gap-2 px-5 py-4 border-t border-ink-100 dark:border-ink-700">
          <button className="btn-ghost btn-sm text-ink-500" onClick={reset}>Reset to defaults</button>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={() => onSave(f)}>Apply formula</button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   STAFF DETAILS DRAWER
   ══════════════════════════════════════════════════════════════════════ */

type DrawerRow = { row: PayrollRow; c: { effectiveGross: number; payeFormula: number; asPerHr: number; difference: number; toBeUsed: number; rssb: number; cbhi: number } }

function StaffDrawer({
  drawerRow, periodYear, periodMonth, canManage, onClose, onEdit, onEditEmployee, onDelete,
}: {
  drawerRow: DrawerRow | null
  periodYear: number
  periodMonth: number
  canManage: boolean
  onClose: () => void
  onEdit: (row: PayrollRow) => void
  onEditEmployee: (row: PayrollRow) => void
  onDelete: (row: PayrollRow) => void
}) {
  const open = drawerRow !== null
  const row  = drawerRow?.row
  const c    = drawerRow?.c

  const genderLabel = row?.gender === 'M' ? 'Male' : row?.gender === 'F' ? 'Female' : row?.gender ?? '—'

  const net = c && row
    ? Math.max(0, c.effectiveGross - c.payeFormula - c.rssb - c.cbhi)
    : 0

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-ink-900/40 backdrop-blur-[2px] transition-opacity duration-300 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 z-50 h-full w-full max-w-sm bg-white dark:bg-ink-800 shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {row && c ? (
          <>
            {/* ── Drawer Header ── */}
            <div className="relative bg-gradient-to-br from-brand/10 to-brand/5 dark:from-brand/20 dark:to-brand/5 px-5 pt-5 pb-4 border-b border-ink-100 dark:border-ink-700">
              <button
                className="absolute top-3 right-3 icon-btn"
                onClick={onClose}
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-3">
                {/* Large avatar */}
                <div className="w-14 h-14 rounded-full bg-brand/20 dark:bg-brand/30 text-brand dark:text-brand-300 text-xl font-bold flex items-center justify-center shrink-0 ring-2 ring-brand/20">
                  {row.full_name.split(' ').slice(0, 2).map(n => n[0] ?? '').join('').toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-[15px] text-ink-900 dark:text-white leading-tight truncate">{row.full_name}</h3>
                  <p className="text-[12px] text-ink-500 mt-0.5">{row.emp_code}</p>
                  <span className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
                    row.status === 'Active'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                      : row.status === 'Terminated'
                      ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300'
                      : 'bg-ink-100 text-ink-500 dark:bg-ink-700 dark:text-ink-300'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      row.status === 'Active' ? 'bg-emerald-500' : row.status === 'Terminated' ? 'bg-red-500' : 'bg-ink-400'
                    }`} />
                    {row.status ?? 'Unknown'}
                  </span>
                </div>
              </div>
            </div>

            {/* ── Scrollable body ── */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

              {/* Employment info */}
              <section>
                <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wider mb-2">Employment</p>
                <div className="space-y-2">
                  <DrawerField icon={<Building2 className="w-3.5 h-3.5" />} label="Department" value={row.department ?? '—'} />
                  <DrawerField icon={<Briefcase className="w-3.5 h-3.5" />} label="Position" value={row.position ?? '—'} />
                  <DrawerField icon={<BadgeCheck className="w-3.5 h-3.5" />} label="Contract" value={row.contract_type ?? '—'} />
                  <DrawerField icon={<User className="w-3.5 h-3.5" />} label="Gender" value={genderLabel} />
                  <DrawerField icon={<CalendarDays className="w-3.5 h-3.5" />} label="Start Date" value={row.start_date ? new Date(row.start_date).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—'} />
                  {row.end_date && (
                    <DrawerField icon={<CalendarDays className="w-3.5 h-3.5" />} label="End Date" value={new Date(row.end_date).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })} />
                  )}
                </div>
              </section>

              {/* Contact */}
              {(row.email || row.phone) && (
                <section>
                  <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wider mb-2">Contact</p>
                  <div className="space-y-2">
                    {row.email && <DrawerField icon={<Mail className="w-3.5 h-3.5" />} label="Email" value={row.email} />}
                    {row.phone && <DrawerField icon={<Phone className="w-3.5 h-3.5" />} label="Phone" value={row.phone} />}
                  </div>
                </section>
              )}

              {/* Payroll summary for the period */}
              <section>
                <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wider mb-2">
                  Payroll · {MONTHS[periodMonth - 1]} {periodYear}
                </p>
                {c.effectiveGross > 0 ? (
                  <div className="rounded-xl border border-ink-100 dark:border-ink-700 overflow-hidden">
                    <PayrollSummaryRow
                      icon={<Wallet className="w-3.5 h-3.5" />}
                      label="Gross Salary"
                      value={fmt(c.effectiveGross)}
                      accent="text-ink-900 dark:text-white font-bold"
                    />
                    <PayrollSummaryRow
                      icon={<TrendingDown className="w-3.5 h-3.5" />}
                      label="PAYE (formula)"
                      value={`–${fmt(Math.round(c.payeFormula))}`}
                      accent="text-red-600 dark:text-red-400"
                    />
                    {c.rssb > 0 && (
                      <PayrollSummaryRow
                        icon={<TrendingDown className="w-3.5 h-3.5" />}
                        label="RSSB"
                        value={`–${fmt(c.rssb)}`}
                        accent="text-orange-600 dark:text-orange-400"
                      />
                    )}
                    {c.cbhi > 0 && (
                      <PayrollSummaryRow
                        icon={<TrendingDown className="w-3.5 h-3.5" />}
                        label="CBHI"
                        value={`–${fmt(c.cbhi)}`}
                        accent="text-sky-600 dark:text-sky-400"
                      />
                    )}
                    {row.payroll_id && (
                      <PayrollSummaryRow
                        icon={<CreditCard className="w-3.5 h-3.5" />}
                        label="As per HR"
                        value={fmt(c.asPerHr)}
                        accent="text-ink-600 dark:text-ink-300"
                      />
                    )}
                    <div className="flex items-center justify-between px-3 py-2.5 bg-emerald-50 dark:bg-emerald-500/10">
                      <div className="flex items-center gap-2">
                        <UserCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-[12px] font-bold text-emerald-700 dark:text-emerald-300">Net Salary</span>
                      </div>
                      <span className="font-bold text-[14px] text-emerald-800 dark:text-emerald-200 tabular-nums">{fmt(net)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-[12px] text-ink-400 italic">No payroll data for this period.</p>
                )}
              </section>
            </div>

            {/* ── Footer actions ── */}
            <div className="px-5 py-4 border-t border-ink-100 dark:border-ink-700 space-y-2">
              {canManage && (
                <div className="flex gap-2">
                  <button
                    className="btn-secondary flex-1 gap-1.5 text-[12px]"
                    onClick={() => onEditEmployee(row)}
                  >
                    <User className="w-3.5 h-3.5" /> Edit Info
                  </button>
                  <button
                    className="btn-primary flex-1 gap-1.5 text-[12px]"
                    onClick={() => onEdit(row)}
                  >
                    <Pencil className="w-3.5 h-3.5" /> Edit Payroll
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <Link
                  to={`/hr/payroll/${row.id}`}
                  className="btn-secondary flex-1 gap-1.5 flex items-center justify-center text-[12px]"
                  onClick={onClose}
                >
                  <Eye className="w-3.5 h-3.5" /> Payslip History
                </Link>
                {canManage && (
                  <button
                    className="btn-sm flex items-center gap-1.5 px-3 rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors text-[12px]"
                    onClick={() => onDelete(row)}
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </>
  )
}

function DrawerField({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-6 h-6 rounded-md bg-ink-100 dark:bg-ink-700/60 flex items-center justify-center text-ink-400 shrink-0">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[10px] text-ink-400 uppercase tracking-wider font-semibold leading-none">{label}</p>
        <p className="text-[13px] text-ink-800 dark:text-ink-200 font-medium mt-0.5 truncate">{value}</p>
      </div>
    </div>
  )
}

function PayrollSummaryRow({
  icon, label, value, accent,
}: { icon: React.ReactNode; label: string; value: string; accent: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-ink-100 dark:border-ink-700 last:border-0">
      <div className="flex items-center gap-2 text-ink-500">
        {icon}
        <span className="text-[12px]">{label}</span>
      </div>
      <span className={`tabular-nums text-[13px] ${accent}`}>{value}</span>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   MICRO COMPONENTS
   ══════════════════════════════════════════════════════════════════════ */

function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').slice(0, 2).map(n => n[0] ?? '').join('').toUpperCase()
  return (
    <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-[11px] font-bold flex items-center justify-center shrink-0">
      {initials}
    </div>
  )
}

function ComputedRow({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2">
      <span className="text-[12px] text-ink-600 dark:text-ink-400">{label}</span>
      <span className={`font-semibold tabular-nums text-[13px] ${accent}`}>{fmt(value, 2)}</span>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   EMPLOYEE FORM MODAL  (Create + Edit)
   ══════════════════════════════════════════════════════════════════════ */
function EmployeeFormModal({
  row, onClose,
}: {
  row?: PayrollRow
  onClose: () => void
}) {
  const qc      = useQueryClient()
  const isEdit  = !!row

  const [form, setForm] = useState({
    first_name:   (row?.full_name ?? '').split(' ')[0] ?? '',
    last_name:    (row?.full_name ?? '').split(' ').slice(1).join(' ') ?? '',
    gender:       row?.gender       ?? '',
    department:   row?.department   ?? '',
    position:     row?.position     ?? '',
    contract_type:row?.contract_type?? '',
    phone:        row?.phone        ?? '',
    emp_code:     row?.emp_code     ?? '',
    start_date:   row?.start_date   ?? '',
    status:       row?.status       ?? 'Active',
  })

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }))

  const save = useMutation({
    mutationFn: () => isEdit
      ? hrService.updateEmployee(row!.id, form as any)
      : hrService.createEmployee(form as any),
    onSuccess: () => {
      toast.success(isEdit ? 'Employee updated.' : 'Employee created.')
      qc.invalidateQueries({ queryKey: ['hr-payroll'] })
      onClose()
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Save failed'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-ink-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100 dark:border-ink-700 shrink-0">
          <div>
            <h3 className="font-bold text-[15px] text-ink-900 dark:text-white flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-brand" />
              {isEdit ? 'Edit Employee' : 'Add Employee'}
            </h3>
            {isEdit && <p className="text-[12px] text-ink-500">{row!.full_name} · {row!.emp_code}</p>}
          </div>
          <button className="icon-btn" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-ink-500 uppercase tracking-wider mb-1">First Name *</label>
              <input className="input" value={form.first_name} onChange={set('first_name')} placeholder="First name" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-ink-500 uppercase tracking-wider mb-1">Last Name *</label>
              <input className="input" value={form.last_name} onChange={set('last_name')} placeholder="Last name" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-ink-500 uppercase tracking-wider mb-1">Gender</label>
              <select className="input" value={form.gender} onChange={set('gender')}>
                <option value="">— Select —</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-ink-500 uppercase tracking-wider mb-1">Status</label>
              <select className="input" value={form.status} onChange={set('status')}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-ink-500 uppercase tracking-wider mb-1">Position *</label>
            <input className="input" value={form.position} onChange={set('position')} placeholder="e.g. Lecturer" />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-ink-500 uppercase tracking-wider mb-1">Department / Post</label>
            <input className="input" value={form.department} onChange={set('department')} placeholder="e.g. Computer Science" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-ink-500 uppercase tracking-wider mb-1">Phone</label>
              <input className="input" value={form.phone} onChange={set('phone')} placeholder="+250…" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-ink-500 uppercase tracking-wider mb-1">ID / Emp Code</label>
              <input className="input" value={form.emp_code} onChange={set('emp_code')} placeholder="ID card or code" />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-ink-500 uppercase tracking-wider mb-1">Start Date</label>
            <input type="date" className="input" value={form.start_date} onChange={set('start_date')} />
          </div>
        </div>

        {/* footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-ink-100 dark:border-ink-700 shrink-0">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary gap-1.5"
            onClick={() => save.mutate()}
            disabled={save.isPending || !form.first_name || !form.last_name || !form.position}
          >
            {save.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {isEdit ? 'Save Changes' : 'Create Employee'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   DELETE EMPLOYEE MODAL
   ══════════════════════════════════════════════════════════════════════ */
function DeleteEmployeeModal({ row, onClose }: { row: PayrollRow; onClose: () => void }) {
  const qc = useQueryClient()

  const del = useMutation({
    mutationFn: () => hrService.deleteEmployee(row.id),
    onSuccess: () => {
      toast.success('Employee deleted.')
      qc.invalidateQueries({ queryKey: ['hr-payroll'] })
      onClose()
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Delete failed'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-ink-800 rounded-xl shadow-2xl w-full max-w-sm">
        <div className="p-6 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center mx-auto">
            <Trash2 className="w-6 h-6 text-red-600 dark:text-red-400" />
          </div>
          <h3 className="font-bold text-[16px] text-ink-900 dark:text-white">Delete Employee?</h3>
          <p className="text-[13px] text-ink-500">
            <span className="font-semibold text-ink-700 dark:text-ink-200">{row.full_name}</span> will be permanently removed.
            This cannot be undone.
          </p>
        </div>
        <div className="flex gap-2 px-5 py-4 border-t border-ink-100 dark:border-ink-700">
          <button className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
          <button
            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold text-[13px] rounded-lg px-4 py-2 transition-colors flex items-center justify-center gap-1.5"
            onClick={() => del.mutate()}
            disabled={del.isPending}
          >
            {del.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Yes, Delete
          </button>
        </div>
      </div>
    </div>
  )
}
