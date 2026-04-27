import { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  Search, Loader2, ChevronLeft, ChevronRight,
  Pencil, Eye, X, Settings2, Info,
  Mail, Phone, CalendarDays, Briefcase, BadgeCheck, User,
  Building2, CreditCard, UserCheck, TrendingDown, Wallet,
  UserPlus, Trash2, Save, Plus, CheckCircle, Copy, Banknote,
} from 'lucide-react'
import {
  hrService,
  type PayrollRow,
  type PayrollEntry,
  type PayrollListParams,
  type PaymentMethod,
  type PayrollConfig,
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

type DrawerRow = { row: PayrollRow; c: { effectiveGross: number; payeFormula: number; asPerHr: number; difference: number; toBeUsed: number; rssb: number; cbhi: number } }

/* ══════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════════════════════════════════ */

export default function PayrollPage() {
  const [sp, setSp]       = useSearchParams()
  const { user }          = useAuthStore()
  const canManage         = ['superadmin', 'admin'].includes(user?.role ?? '') || (user?.permissions ?? []).includes(PERMISSIONS.MANAGE_HR_EMPLOYEES)
  const qc                = useQueryClient()

  const [formula, setFormula]           = useState<FormulaConfig>(loadFormula)
  const [showFormulaModal, setShowFM]   = useState(false)
  const [showCopyModal, setShowCopy]    = useState(false)
  const [editing, setEditing]           = useState<PayrollRow | null>(null)
  const [drawerRow, setDrawerRow]       = useState<DrawerRow | null>(null)
  const [addingEmployee, setAddingEmp]  = useState(false)
  const [editingEmployee, setEditingEmp]= useState<PayrollRow | null>(null)
  const [deletingEmployee, setDelEmp]   = useState<PayrollRow | null>(null)
  const [deletingPayroll, setDelPayroll]= useState<PayrollRow | null>(null)
  const [payingPayroll, setPayingPayroll] = useState<PayrollRow | null>(null)

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

  const markPaidMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'Pending' | 'Paid' | 'Approved' }) =>
      hrService.payrollSetStatus(id, status),
    onSuccess: (_res, vars) => {
      toast.success(`Payroll marked as ${vars.status}.`)
      qc.invalidateQueries({ queryKey: ['hr-payroll'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to update status'),
  })

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
          {/* Copy to another period */}
          {canManage && (
            <button className="btn-secondary btn-sm gap-1.5" onClick={() => setShowCopy(true)}>
              <Copy className="w-3.5 h-3.5" /> Copy to Period
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
                <th className="px-3 py-2.5 text-center">Status</th>
                <th className="px-3 py-2.5 text-center">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
              {isLoading ? (
                <tr><td colSpan={9} className="py-14 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" />
                </td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="py-14 text-center text-ink-400">No employees found.</td></tr>
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

                    {/* Status */}
                    <td className="px-3 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                      {row.payroll_id ? (
                        <PayrollStatusBadge
                          status={(row as any).payroll_status ?? 'Pending'}
                          payrollId={row.payroll_id}
                          canManage={canManage}
                          onMark={(s) => markPaidMutation.mutate({ id: row.payroll_id!, status: s })}
                          onPay={() => setPayingPayroll(row)}
                        />
                      ) : (
                        <span className="text-ink-300 text-[11px]">—</span>
                      )}
                    </td>

                    {/* CRUD Actions */}
                    <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1 flex-wrap">
                        {canManage && !row.payroll_id && (
                          <button
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold bg-emerald-500 hover:bg-emerald-600 text-white transition-colors"
                            onClick={() => setEditing(row)}
                          >
                            <Plus className="w-3 h-3" /> Add
                          </button>
                        )}
                        {canManage && row.payroll_id && (
                          <button
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold bg-brand hover:bg-brand/90 text-white transition-colors"
                            onClick={() => setEditing(row)}
                          >
                            <Pencil className="w-3 h-3" /> Edit
                          </button>
                        )}
                        <Link
                          to={`/hr/payroll/${row.id}`}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold bg-ink-100 hover:bg-ink-200 dark:bg-ink-700 dark:hover:bg-ink-600 text-ink-700 dark:text-ink-200 transition-colors"
                        >
                          <Eye className="w-3 h-3" /> View
                        </Link>
                        {canManage && row.payroll_id && (
                          <button
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20 text-red-600 dark:text-red-400 transition-colors border border-red-200 dark:border-red-800"
                            onClick={() => setDelPayroll(row)}
                          >
                            <Trash2 className="w-3 h-3" /> Delete
                          </button>
                        )}
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
        onDeletePayroll={(row) => { setDrawerRow(null); setDelPayroll(row) }}
        onPay={(row) => { setDrawerRow(null); setPayingPayroll(row) }}
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

      {/* Delete employee confirmation */}
      {deletingEmployee && (
        <DeleteEmployeeModal
          row={deletingEmployee}
          onClose={() => setDelEmp(null)}
        />
      )}

      {/* Delete payroll entry confirmation */}
      {deletingPayroll && (
        <DeletePayrollModal
          row={deletingPayroll}
          periodYear={periodYear}
          periodMonth={periodMonth}
          onClose={() => setDelPayroll(null)}
        />
      )}

      {/* Copy payroll to another period */}
      {showCopyModal && (
        <CopyPeriodModal
          fromYear={periodYear}
          fromMonth={periodMonth}
          onClose={() => setShowCopy(false)}
        />
      )}

      {/* Process salary payment modal */}
      {payingPayroll && (
        <ProcessPaymentModal
          row={payingPayroll}
          periodYear={periodYear}
          periodMonth={periodMonth}
          onClose={() => setPayingPayroll(null)}
        />
      )}

    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   EDIT GROSS MODAL  — only gross is editable; PAYE auto-calculates
   ══════════════════════════════════════════════════════════════════════ */
const DEFAULT_CONFIG: PayrollConfig = {
  rssb_employee_rate: 6, rssb_employer_rate: 6,
  maternity_employee_rate: 0.3, maternity_employer_rate: 0.3,
  cbhi_employee_rate: 5, cbhi_employer_rate: 5,
}

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

  const { data: configRes } = useQuery({
    queryKey: ['hr-payroll-config'],
    queryFn:  ({ signal }) => hrService.getPayrollConfig(signal),
    staleTime: 5 * 60 * 1000,
  })
  const cfg = configRes?.data ?? DEFAULT_CONFIG

  const rssbRate    = (cfg.rssb_employee_rate + cfg.maternity_employee_rate) / 100
  const cbhiRate    = cfg.cbhi_employee_rate / 100

  const payeFormula = calcPaye(gross, formula)
  const rssb        = gross * rssbRate
  const maternity   = gross * (cfg.maternity_employee_rate / 100)
  const cbhi        = gross * cbhiRate
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
      rssb:                rssb - maternity,
      maternity,
      cbhi,
      net_salary:          net,
    } as PayrollEntry & { maternity: number }),
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
              <ComputedRow
                label={`RSSB (${cfg.rssb_employee_rate}% + ${cfg.maternity_employee_rate}% maternity)`}
                value={rssb}
                accent="text-orange-600 dark:text-orange-400"
              />
              <ComputedRow
                label={`CBHI (${cfg.cbhi_employee_rate}%)`}
                value={cbhi}
                accent="text-sky-600 dark:text-sky-400"
              />
              <div className="flex items-center justify-between px-4 py-2.5 bg-emerald-50 dark:bg-emerald-500/10">
                <span className="text-[12px] font-bold text-emerald-700 dark:text-emerald-300">Net Salary</span>
                <span className="font-bold text-[14px] text-emerald-800 dark:text-emerald-200 tabular-nums">{fmt(net)}</span>
              </div>
            </div>
          </div>

          {/* Deductions note */}
          <p className="text-[11px] text-ink-400 dark:text-ink-500 font-mono bg-ink-50 dark:bg-ink-700/20 rounded px-3 py-2">
            Net = Gross − PAYE − RSSB({cfg.rssb_employee_rate + cfg.maternity_employee_rate}%) − CBHI({cfg.cbhi_employee_rate}%)
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

function StaffDrawer({
  drawerRow, periodYear, periodMonth, canManage, onClose, onEdit, onEditEmployee, onDelete, onDeletePayroll, onPay,
}: {
  drawerRow: DrawerRow | null
  periodYear: number
  periodMonth: number
  canManage: boolean
  onClose: () => void
  onEdit: (row: PayrollRow) => void
  onEditEmployee: (row: PayrollRow) => void
  onDelete: (row: PayrollRow) => void
  onDeletePayroll: (row: PayrollRow) => void
  onPay: (row: PayrollRow) => void
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
              {/* Row 1: Edit Info + Edit Payroll / Add Payroll */}
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
                    <Pencil className="w-3.5 h-3.5" />
                    {row.payroll_id ? 'Edit Payroll' : 'Add Payroll'}
                  </button>
                </div>
              )}
              {/* Pay Salary button — shown when payroll exists and not yet Paid */}
              {canManage && row.payroll_id && (row as any).payroll_status !== 'Paid' && (
                <button
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[13px] transition-colors"
                  onClick={() => onPay(row)}
                >
                  <Banknote className="w-4 h-4" /> Pay Salary
                </button>
              )}
              {/* Row 2: View history + Delete payroll + Delete employee */}
              <div className="flex gap-2">
                <Link
                  to={`/hr/payroll/${row.id}`}
                  className="btn-secondary flex-1 gap-1.5 flex items-center justify-center text-[12px]"
                  onClick={onClose}
                >
                  <Eye className="w-3.5 h-3.5" /> History
                </Link>
                {canManage && row.payroll_id && (
                  <button
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors text-[12px] font-medium"
                    onClick={() => onDeletePayroll(row)}
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Del Payroll
                  </button>
                )}
                {canManage && (
                  <button
                    className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 hover:bg-red-100 transition-colors text-[12px] font-medium"
                    onClick={() => onDelete(row)}
                    title="Delete employee entirely"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Del Employee
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
   PAYROLL STATUS BADGE + TOGGLE
   ══════════════════════════════════════════════════════════════════════ */

function PayrollStatusBadge({
  status, payrollId, canManage, onMark, onPay,
}: {
  status: string
  payrollId: number
  canManage: boolean
  onMark: (s: 'Pending' | 'Paid' | 'Approved') => void
  onPay: () => void
}) {
  void payrollId
  if (!canManage) {
    return <StatusPill status={status} />
  }
  if (status === 'Paid') {
    return (
      <button
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-500/30 transition-colors"
        title="Click to revert to Approved"
        onClick={() => onMark('Approved')}
      >
        <CheckCircle className="w-3 h-3" /> Paid
      </button>
    )
  }
  return (
    <div className="flex items-center justify-center gap-1">
      <StatusPill status={status} />
      {(status === 'Pending' || status === 'Approved') && (
        <button
          className="ml-1 inline-flex items-center gap-0.5 text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline font-semibold"
          title="Process salary payment"
          onClick={onPay}
        >
          <Banknote className="w-3 h-3" /> Pay
        </button>
      )}
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === 'Paid'     ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' :
    status === 'Approved' ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300' :
                            'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {status}
    </span>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   COPY PAYROLL TO ANOTHER PERIOD MODAL
   ══════════════════════════════════════════════════════════════════════ */

function CopyPeriodModal({
  fromYear, fromMonth, onClose,
}: {
  fromYear: number
  fromMonth: number
  onClose: () => void
}) {
  const qc = useQueryClient()

  const initTarget = () => {
    const d = new Date(fromYear, fromMonth, 1)   // first day of next month
    return { year: d.getFullYear(), month: d.getMonth() + 1 }
  }
  const [target, setTarget] = useState(initTarget)

  const copy = useMutation({
    mutationFn: () => hrService.payrollCopyPeriod({
      from_year: fromYear, from_month: fromMonth,
      to_year: target.year, to_month: target.month,
    }),
    onSuccess: (res) => {
      const d = res.data
      toast.success(`Copied ${d?.copied ?? 0} payroll entries to ${d?.period ?? ''}. ${d?.skipped ?? 0} skipped (already exist).`)
      qc.invalidateQueries({ queryKey: ['hr-payroll'] })
      onClose()
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Copy failed'),
  })

  const yearOpts2  = Array.from({ length: 5 }, (_, i) => CUR_Y - 1 + i)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-ink-800 rounded-xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100 dark:border-ink-700">
          <div>
            <h3 className="font-bold text-[15px] text-ink-900 dark:text-white flex items-center gap-2">
              <Copy className="w-4 h-4 text-ink-400" /> Copy Payroll to Period
            </h3>
            <p className="text-[12px] text-ink-500">
              Duplicate all {MONTHS[fromMonth - 1]} {fromYear} payroll entries to another month
            </p>
          </div>
          <button className="icon-btn" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-ink-500 uppercase tracking-wider mb-2">
              Source Period
            </label>
            <div className="rounded-lg border border-ink-100 dark:border-ink-700 px-4 py-3 text-[13px] font-semibold text-ink-800 dark:text-ink-200 bg-ink-50 dark:bg-ink-700/30">
              {MONTHS[fromMonth - 1]} {fromYear}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-ink-500 uppercase tracking-wider mb-2">
              Destination Period
            </label>
            <div className="flex gap-2">
              <select
                className="input flex-1 py-2 text-[13px]"
                value={target.month}
                onChange={e => setTarget(t => ({ ...t, month: +e.target.value }))}
              >
                {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
              <select
                className="input w-24 py-2 text-[13px]"
                value={target.year}
                onChange={e => setTarget(t => ({ ...t, year: +e.target.value }))}
              >
                {yearOpts2.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          <div className="rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-700 px-4 py-3 text-[12px] text-amber-700 dark:text-amber-300">
            Employees that already have a payroll entry for the destination period will be skipped.
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-ink-100 dark:border-ink-700">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary gap-1.5"
            onClick={() => copy.mutate()}
            disabled={copy.isPending || (target.year === fromYear && target.month === fromMonth)}
          >
            {copy.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
            Copy Payroll
          </button>
        </div>
      </div>
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
    salary:       n0(row?.salary)   > 0 ? String(n0(row?.salary)) : '',
  })

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }))

  const save = useMutation({
    mutationFn: (): Promise<any> => isEdit
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

          <div>
            <label className="block text-[10px] font-bold text-ink-500 uppercase tracking-wider mb-1">
              Base Gross Salary (RWF)
              <span className="ml-1 text-[9px] font-normal text-ink-400 normal-case">saved permanently on employee record</span>
            </label>
            <input
              type="number" min="0" step="1"
              className="input text-right tabular-nums"
              value={form.salary}
              onChange={set('salary')}
              placeholder="e.g. 588,002"
            />
          </div>
        </div>

        {/* footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-ink-100 dark:border-ink-700 shrink-0">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary gap-1.5"
            onClick={() => save.mutate()}
            disabled={save.isPending || !form.first_name || !form.last_name}
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

/* ══════════════════════════════════════════════════════════════════════
   DELETE PAYROLL ENTRY MODAL
   ══════════════════════════════════════════════════════════════════════ */
function DeletePayrollModal({
  row, periodYear, periodMonth, onClose,
}: {
  row: PayrollRow
  periodYear: number
  periodMonth: number
  onClose: () => void
}) {
  const qc = useQueryClient()

  const del = useMutation({
    mutationFn: () => hrService.payrollDelete(row.payroll_id!),
    onSuccess: () => {
      toast.success('Payroll entry deleted.')
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
          <h3 className="font-bold text-[16px] text-ink-900 dark:text-white">Delete Payroll Entry?</h3>
          <p className="text-[13px] text-ink-500">
            Remove <span className="font-semibold text-ink-700 dark:text-ink-200">{row.full_name}</span>'s
            payroll for <span className="font-semibold">{MONTHS[periodMonth - 1]} {periodYear}</span>.
            The employee record stays; only this month's entry is deleted.
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
            Yes, Delete Entry
          </button>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   PROCESS PAYMENT MODAL
   Opens when HR clicks "Pay" on a payroll row.
   Records the disbursement and marks payroll as Paid.
   ══════════════════════════════════════════════════════════════════════ */
function ProcessPaymentModal({
  row, periodYear, periodMonth, onClose,
}: {
  row: PayrollRow
  periodYear: number
  periodMonth: number
  onClose: () => void
}) {
  const qc = useQueryClient()

  const netAmount = n0(row.net_salary) || Math.max(0, n0(row.gross_salary) - n0(row.paye))

  const [method,  setMethod]  = useState<PaymentMethod>('Bank Transfer')
  const [bankName,setBankName]= useState<string>((row as any).bank ?? '')
  const [account, setAccount] = useState<string>((row as any).bank_account ?? '')
  const [ref,     setRef]     = useState<string>('')
  const [notes,   setNotes]   = useState<string>('')
  const [amount,  setAmount]  = useState<number>(netAmount)

  const pay = useMutation({
    mutationFn: () => hrService.processPayment({
      payroll_id:     row.payroll_id!,
      amount,
      payment_method: method,
      bank_name:      bankName  || null,
      account_number: account   || null,
      reference:      ref       || null,
      notes:          notes     || null,
    }),
    onSuccess: () => {
      toast.success(`Payment of ${fmt(amount)} RWF processed for ${row.full_name}.`)
      qc.invalidateQueries({ queryKey: ['hr-payroll'] })
      onClose()
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Payment failed'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-ink-800 rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100 dark:border-ink-700 shrink-0">
          <div>
            <h3 className="font-bold text-[15px] text-ink-900 dark:text-white flex items-center gap-2">
              <Banknote className="w-4 h-4 text-emerald-600" /> Process Salary Payment
            </h3>
            <p className="text-[12px] text-ink-500">
              {row.full_name} · {MONTHS[periodMonth - 1]} {periodYear}
            </p>
          </div>
          <button className="icon-btn" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Summary pill */}
          <div className="flex items-center justify-between rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-700 px-4 py-3">
            <div>
              <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">Net Salary</p>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                Gross {fmt(n0(row.gross_salary))} – PAYE {fmt(n0(row.paye))}
              </p>
            </div>
            <span className="text-[20px] font-bold tabular-nums text-emerald-800 dark:text-emerald-200">
              {fmt(netAmount)} <span className="text-[12px] font-normal">RWF</span>
            </span>
          </div>

          {/* Payment amount */}
          <div>
            <label className="block text-[10px] font-bold text-ink-500 uppercase tracking-wider mb-1">
              Amount to Pay (RWF)
            </label>
            <input
              type="number" min="0" step="1"
              className="input text-right tabular-nums text-[15px] font-semibold"
              value={amount || ''}
              onChange={e => setAmount(parseFloat(e.target.value) || 0)}
            />
          </div>

          {/* Payment method */}
          <div>
            <label className="block text-[10px] font-bold text-ink-500 uppercase tracking-wider mb-1">
              Payment Method
            </label>
            <div className="flex gap-2">
              {(['Bank Transfer', 'Cash', 'MoMo'] as PaymentMethod[]).map(m => (
                <button
                  key={m}
                  onClick={() => setMethod(m)}
                  className={`flex-1 py-2 rounded-lg text-[12px] font-semibold border transition-colors ${
                    method === m
                      ? 'bg-brand border-brand text-white'
                      : 'bg-white dark:bg-ink-700 border-ink-200 dark:border-ink-600 text-ink-600 dark:text-ink-300 hover:border-brand hover:text-brand'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Bank fields — shown for Bank Transfer and MoMo */}
          {method !== 'Cash' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-ink-500 uppercase tracking-wider mb-1">
                  {method === 'MoMo' ? 'Provider' : 'Bank Name'}
                </label>
                <input
                  className="input text-[13px]"
                  value={bankName}
                  onChange={e => setBankName(e.target.value)}
                  placeholder={method === 'MoMo' ? 'e.g. MTN MoMo' : 'e.g. BK, Equity'}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-ink-500 uppercase tracking-wider mb-1">
                  {method === 'MoMo' ? 'Phone Number' : 'Account Number'}
                </label>
                <input
                  className="input text-[13px]"
                  value={account}
                  onChange={e => setAccount(e.target.value)}
                  placeholder={method === 'MoMo' ? '+250 7XX XXX XXX' : 'Account no.'}
                />
              </div>
            </div>
          )}

          {/* Reference */}
          <div>
            <label className="block text-[10px] font-bold text-ink-500 uppercase tracking-wider mb-1">
              Transaction Reference <span className="font-normal normal-case text-ink-400">(optional)</span>
            </label>
            <input
              className="input text-[13px]"
              value={ref}
              onChange={e => setRef(e.target.value)}
              placeholder="e.g. TXN-20260426-001"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[10px] font-bold text-ink-500 uppercase tracking-wider mb-1">
              Notes <span className="font-normal normal-case text-ink-400">(optional)</span>
            </label>
            <textarea
              className="input text-[13px] resize-none"
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any remarks about this payment…"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-ink-100 dark:border-ink-700 shrink-0">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[13px] rounded-lg px-5 py-2 transition-colors flex items-center gap-1.5 disabled:opacity-50"
            onClick={() => pay.mutate()}
            disabled={pay.isPending || amount <= 0 || !row.payroll_id}
          >
            {pay.isPending
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Banknote className="w-3.5 h-3.5" />}
            Confirm Payment
          </button>
        </div>
      </div>
    </div>
  )
}
