import { useState, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Loader2, Download, Printer, Plus,
  Pencil, Trash2, X, Calculator,
} from 'lucide-react'
import {
  hrService,
  type PayrollEntry,
} from '@/services/hrService'
import type { HrEmployee } from '@/types/academic'
import { useAuthStore } from '@/store/authStore'
import { PERMISSIONS } from '@/constants'

/* ── helpers ─────────────────────────────────────────────────────────── */

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December']
const SHORT_M = ['Jan','Feb','Mar','Apr','May','Jun',
                 'Jul','Aug','Sep','Oct','Nov','Dec']

const now   = new Date()
const CUR_Y = now.getFullYear()
const CUR_M = now.getMonth() + 1

const yearOptions  = Array.from({ length: 5 }, (_, i) => CUR_Y - i).map(y => ({ value: String(y), label: String(y) }))
const monthOptions = MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))

const fmt = (v: number | string | null | undefined) =>
  v == null || v === '' ? '—' : Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

function periodLabel(year: number, month: number) {
  return `${SHORT_M[month - 1]}-${String(year).slice(-2)}`
}

/* ─────────────────────────────────────────────────────────────────────── */

export default function PayrollSlipPage() {
  const { id } = useParams<{ id: string }>()
  const empId  = parseInt(id ?? '0')
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const canManage =
    user?.role === 'superadmin' ||
    (user?.permissions || []).includes(PERMISSIONS.MANAGE_HR_EMPLOYEES)

  /* date range */
  const [fromYear,  setFromYear]  = useState<number>(CUR_Y)
  const [fromMonth, setFromMonth] = useState<number>(1)
  const [toYear,    setToYear]    = useState<number>(CUR_Y)
  const [toMonth,   setToMonth]   = useState<number>(CUR_M)

  const [editing,   setEditing]   = useState<PayrollEntry | null>(null)
  const [addOpen,   setAddOpen]   = useState(false)

  const printRef = useRef<HTMLDivElement>(null)

  /* data */
  const { data, isLoading } = useQuery({
    queryKey: ['hr-payroll-slips', empId, fromYear, fromMonth, toYear, toMonth],
    queryFn: () => hrService.payrollSlips(empId, {
      from_year: fromYear, from_month: fromMonth,
      to_year: toYear,     to_month: toMonth,
    }),
    enabled: empId > 0,
  })

  const employee: HrEmployee | undefined = data?.data?.employee
  const slips: PayrollEntry[]            = data?.data?.slips ?? []

  /* totals */
  const totals = slips.reduce((acc, s) => ({
    basic_salary:        acc.basic_salary        + Number(s.basic_salary),
    housing_allowance:   acc.housing_allowance   + Number(s.housing_allowance),
    transport_allowance: acc.transport_allowance + Number(s.transport_allowance),
    other_allowances:    acc.other_allowances    + Number(s.other_allowances),
    gross_salary:        acc.gross_salary        + Number(s.gross_salary),
    paye:                acc.paye                + Number(s.paye),
    rssb:                acc.rssb                + Number(s.rssb),
    cbhi:                acc.cbhi                + Number(s.cbhi),
    net_salary:          acc.net_salary          + Number(s.net_salary),
  }), { basic_salary:0, housing_allowance:0, transport_allowance:0, other_allowances:0,
        gross_salary:0, paye:0, rssb:0, cbhi:0, net_salary:0 })

  /* ── CSV download ─────────────────────────────────────────────────── */
  const downloadCSV = () => {
    const header = ['No','Month','Basic Salary','Housing Allowance','Transport Allowance',
                    'Other Allowances','Gross Salary','PAYE(TPR)','RSSB','CBHI','Net Salary']
    const rows = slips.map((s, i) => [
      i + 1,
      `${SHORT_M[(s.period_month ?? 1) - 1]}-${String(s.period_year).slice(-2)}`,
      s.basic_salary, s.housing_allowance, s.transport_allowance, s.other_allowances,
      s.gross_salary, s.paye, s.rssb, s.cbhi, s.net_salary,
    ])
    const csv = [header, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `payslip_${employee?.emp_code ?? empId}_${fromYear}-${fromMonth}_to_${toYear}-${toMonth}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  /* ── PDF print ────────────────────────────────────────────────────── */
  const printPDF = () => {
    if (!employee || slips.length === 0) return
    const rows = slips.map((s, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${SHORT_M[(s.period_month ?? 1) - 1]}-${String(s.period_year).slice(-2)}</td>
        <td class="num">${Number(s.basic_salary).toLocaleString()}</td>
        <td class="num">${Number(s.housing_allowance).toLocaleString()}</td>
        <td class="num">${Number(s.transport_allowance).toLocaleString()}</td>
        <td class="num">${Number(s.other_allowances).toLocaleString()}</td>
        <td class="num"><strong>${Number(s.gross_salary).toLocaleString()}</strong></td>
        <td class="num">${Number(s.paye).toLocaleString()}</td>
        <td class="num">${Number(s.rssb).toLocaleString()}</td>
        <td class="num">${Number(s.cbhi).toLocaleString()}</td>
        <td class="num"><strong>${Number(s.net_salary).toLocaleString()}</strong></td>
      </tr>
    `).join('')

    const totRow = `
      <tr class="total-row">
        <td colspan="2"><strong>TOTAL</strong></td>
        <td class="num"><strong>${totals.basic_salary.toLocaleString()}</strong></td>
        <td class="num"><strong>${totals.housing_allowance.toLocaleString()}</strong></td>
        <td class="num"><strong>${totals.transport_allowance.toLocaleString()}</strong></td>
        <td class="num"><strong>${totals.other_allowances.toLocaleString()}</strong></td>
        <td class="num"><strong>${totals.gross_salary.toLocaleString()}</strong></td>
        <td class="num"><strong>${totals.paye.toLocaleString()}</strong></td>
        <td class="num"><strong>${totals.rssb.toLocaleString()}</strong></td>
        <td class="num"><strong>${totals.cbhi.toLocaleString()}</strong></td>
        <td class="num"><strong>${totals.net_salary.toLocaleString()}</strong></td>
      </tr>
    `

    const html = `<!DOCTYPE html><html><head><title>Payslip — ${employee.full_name}</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 11px; color: #111; margin: 20px; }
      .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
      .header h1 { font-size: 16px; margin: 0 0 4px; letter-spacing: 1px; }
      .header p  { margin: 2px 0; font-size: 10px; }
      .payslip-title { font-weight: bold; font-size: 13px; margin-bottom: 14px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #bbb; padding: 4px 6px; text-align: left; }
      th { background: #eee; font-weight: bold; font-size: 10px; text-transform: uppercase; }
      .num { text-align: right; }
      .total-row td { background: #f5f5f5; font-weight: bold; }
      .footer { margin-top: 30px; display: flex; justify-content: space-between; }
      .footer div { width: 45%; }
      .sig-line { margin-top: 40px; border-top: 1px solid #333; padding-top: 4px; font-size: 10px; }
      @media print { body { margin: 0; } }
    </style></head><body>
    <div class="header">
      <h1>CATHOLIC UNIVERSITY OF RWANDA</h1>
      <p>P.o Box 49 Butare/Huye – RWANDA</p>
      <p>Registry: 250 733 214 677 · Administration: 250 733 214 678</p>
      <p>email: catholic.university.rwanda@gmail.com · website: www.cur.ac.rw</p>
    </div>
    <div class="payslip-title">PAYSILP: ${employee.full_name}</div>
    <p style="font-size:10px;margin-bottom:8px;">Period: ${SHORT_M[fromMonth-1]}-${String(fromYear).slice(-2)} to ${SHORT_M[toMonth-1]}-${String(toYear).slice(-2)}</p>
    <table>
      <thead><tr>
        <th>No</th><th>Months</th><th>Basic Salary</th><th>Housing Allow.</th>
        <th>Transport Allow.</th><th>Other Allowances</th><th>Gross Salary</th>
        <th>PAYE(TPR)</th><th>RSSB</th><th>CBHI</th><th>Net Salary</th>
      </tr></thead>
      <tbody>${rows}${totRow}</tbody>
    </table>
    <div class="footer">
      <div>
        <p>Done at HUYE, ${new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'2-digit', year:'numeric' }).replace(/\//g,'.')}</p>
        <div class="sig-line">Prepared by:<br/><strong>${employee.full_name}</strong></div>
        <p style="margin-top:4px;font-size:10px;">Director of HR</p>
      </div>
      <div style="text-align:right">
        <div class="sig-line" style="text-align:right">Approved by:</div>
        <p style="margin-top:4px;font-size:10px;text-align:right">Director of Administration and Finance</p>
      </div>
    </div>
    <script>window.onload=function(){window.print();}</script>
    </body></html>`

    const win = window.open('', '_blank', 'width=900,height=700')
    if (win) { win.document.write(html); win.document.close() }
  }

  /* ── delete ───────────────────────────────────────────────────────── */
  const qc = useQueryClient()
  const del = useMutation({
    mutationFn: (id: number) => hrService.payrollDelete(id),
    onSuccess: () => {
      toast.success('Entry deleted.')
      qc.invalidateQueries({ queryKey: ['hr-payroll-slips'] })
      qc.invalidateQueries({ queryKey: ['hr-payroll'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Delete failed'),
  })

  /* ─────────────────────────────────────────────────────────────────── */
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-6 h-6 animate-spin text-brand" />
      </div>
    )
  }

  if (!employee) {
    return (
      <div className="text-center py-20 text-ink-400">
        Employee not found.{' '}
        <Link to="/hr/payroll" className="text-brand hover:underline">Go back</Link>
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-in" ref={printRef}>
      {/* ── Top bar ── */}
      <div className="flex items-center gap-4 flex-wrap justify-between">
        <div className="flex items-center gap-3">
          <Link to="/hr/payroll" className="icon-btn">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h2 className="text-lg font-bold text-ink-900 dark:text-white">{employee.full_name}</h2>
            <p className="text-[12.5px] text-ink-500">
              {employee.emp_code} · {employee.department} · {employee.position}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canManage && (
            <button className="btn-primary btn-sm" onClick={() => setAddOpen(true)}>
              <Plus className="w-3.5 h-3.5" /> Add Entry
            </button>
          )}
          <button className="btn-secondary btn-sm" onClick={downloadCSV} disabled={slips.length === 0} title="Export to CSV / Excel">
            <Download className="w-3.5 h-3.5" /> Excel
          </button>
          <button className="btn-secondary btn-sm" onClick={printPDF} disabled={slips.length === 0} title="Download PDF">
            <Printer className="w-3.5 h-3.5" /> PDF
          </button>
        </div>
      </div>

      {/* ── Employee info card ── */}
      <div className="card p-4 flex flex-wrap gap-6">
        <div>
          <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wider">Contract</p>
          <p className="text-[13px] font-semibold text-ink-800 dark:text-ink-200 mt-0.5">{employee.contract_type}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wider">Status</p>
          <p className="text-[13px] font-semibold text-ink-800 dark:text-ink-200 mt-0.5">{employee.status}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wider">Email</p>
          <p className="text-[13px] text-ink-600 dark:text-ink-300 mt-0.5">{employee.email ?? '—'}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wider">Start Date</p>
          <p className="text-[13px] text-ink-600 dark:text-ink-300 mt-0.5">{employee.start_date ?? '—'}</p>
        </div>
      </div>

      {/* ── Date range filter ── */}
      <div className="card p-4">
        <p className="text-[11px] font-bold text-ink-400 uppercase tracking-wider mb-3">Filter period</p>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-[12px] text-ink-500 shrink-0">From</label>
            <select className="input text-[13px] py-1.5 w-32" value={fromMonth} onChange={e => setFromMonth(parseInt(e.target.value))}>
              {monthOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select className="input text-[13px] py-1.5 w-24" value={fromYear} onChange={e => setFromYear(parseInt(e.target.value))}>
              {yearOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <span className="text-ink-400">→</span>
          <div className="flex items-center gap-2">
            <label className="text-[12px] text-ink-500 shrink-0">To</label>
            <select className="input text-[13px] py-1.5 w-32" value={toMonth} onChange={e => setToMonth(parseInt(e.target.value))}>
              {monthOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select className="input text-[13px] py-1.5 w-24" value={toYear} onChange={e => setToYear(parseInt(e.target.value))}>
              {yearOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── Payslip table ── */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-ink-100 dark:border-ink-700 flex items-center justify-between">
          <span className="font-semibold text-ink-800 dark:text-ink-200 text-[13px]">
            Payslip history
          </span>
          <span className="text-[12px] text-ink-400">{slips.length} {slips.length === 1 ? 'entry' : 'entries'}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[12px] text-left">
            <thead>
              <tr className="bg-ink-50 dark:bg-ink-800/50 border-b border-ink-100 dark:border-ink-700">
                {['No','Month','Basic Salary','Housing Allow.','Transport Allow.','Other Allow.',
                  'Gross Salary','PAYE(TPR)','RSSB','CBHI','Net Salary',''].map(h => (
                  <th key={h} className="px-3 py-2.5 font-bold text-ink-400 uppercase tracking-wider text-[10px] whitespace-nowrap text-right first:text-left last:text-center">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
              {slips.length === 0 ? (
                <tr>
                  <td colSpan={12} className="p-10 text-center text-ink-400">
                    No payslip entries for this period.
                    {canManage && (
                      <button className="ml-2 text-brand hover:underline" onClick={() => setAddOpen(true)}>
                        Add first entry
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                <>
                  {slips.map((slip, i) => (
                    <tr key={slip.id} className="hover:bg-ink-50/50 dark:hover:bg-ink-700/20">
                      <td className="px-3 py-3 text-ink-500">{i + 1}</td>
                      <td className="px-3 py-3 font-semibold text-ink-800 dark:text-ink-200">
                        {periodLabel(slip.period_year, slip.period_month)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{fmt(slip.basic_salary)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{fmt(slip.housing_allowance)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{fmt(slip.transport_allowance)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{fmt(slip.other_allowances)}</td>
                      <td className="px-3 py-3 text-right tabular-nums font-bold text-ink-900 dark:text-white">{fmt(slip.gross_salary)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-red-600 dark:text-red-400">{fmt(slip.paye)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-orange-600 dark:text-orange-400">{fmt(slip.rssb)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-sky-600 dark:text-sky-400">{fmt(slip.cbhi)}</td>
                      <td className="px-3 py-3 text-right tabular-nums font-bold text-emerald-700 dark:text-emerald-400">{fmt(slip.net_salary)}</td>
                      <td className="px-3 py-3">
                        {canManage && (
                          <div className="flex items-center justify-center gap-1">
                            <button className="icon-btn" onClick={() => setEditing(slip)}>
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button className="icon-btn text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                              onClick={() => confirm('Delete this payroll entry?') && del.mutate(slip.id!)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}

                  {/* Totals row */}
                  <tr className="bg-ink-50 dark:bg-ink-800/40 font-bold border-t-2 border-ink-200 dark:border-ink-600">
                    <td className="px-3 py-3" colSpan={2}>Total</td>
                    <td className="px-3 py-3 text-right tabular-nums">{fmt(totals.basic_salary)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{fmt(totals.housing_allowance)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{fmt(totals.transport_allowance)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{fmt(totals.other_allowances)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-ink-900 dark:text-white">{fmt(totals.gross_salary)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-red-700 dark:text-red-300">{fmt(totals.paye)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-orange-700 dark:text-orange-300">{fmt(totals.rssb)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-sky-700 dark:text-sky-300">{fmt(totals.cbhi)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-emerald-700 dark:text-emerald-300">{fmt(totals.net_salary)}</td>
                    <td />
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit modal */}
      {(addOpen || editing) && (
        <PayrollEntryModal
          empId={empId}
          entry={editing ?? undefined}
          onClose={() => { setEditing(null); setAddOpen(false) }}
        />
      )}
    </div>
  )
}

/* ── Entry modal (add / edit) ───────────────────────────────────────── */
function PayrollEntryModal({
  empId,
  entry,
  onClose,
}: {
  empId: number
  entry?: PayrollEntry
  onClose: () => void
}) {
  const qc = useQueryClient()

  const [form, setForm] = useState<PayrollEntry>({
    emp_id:              empId,
    period_year:         entry?.period_year  ?? CUR_Y,
    period_month:        entry?.period_month ?? CUR_M,
    basic_salary:        Number(entry?.basic_salary        ?? 0),
    housing_allowance:   Number(entry?.housing_allowance   ?? 0),
    transport_allowance: Number(entry?.transport_allowance ?? 0),
    other_allowances:    Number(entry?.other_allowances    ?? 0),
    gross_salary:        Number(entry?.gross_salary        ?? 0),
    paye:                Number(entry?.paye                ?? 0),
    rssb:                Number(entry?.rssb                ?? 0),
    cbhi:                Number(entry?.cbhi                ?? 0),
    net_salary:          Number(entry?.net_salary          ?? 0),
    notes:               entry?.notes ?? '',
  })

  const gross = form.basic_salary + form.housing_allowance + form.transport_allowance + form.other_allowances
  const net   = Math.max(0, gross - form.paye - form.rssb - form.cbhi)

  const save = useMutation({
    mutationFn: () => hrService.payrollUpsert({ ...form, gross_salary: gross, net_salary: net }),
    onSuccess: () => {
      toast.success(entry ? 'Entry updated.' : 'Entry added.')
      qc.invalidateQueries({ queryKey: ['hr-payroll-slips'] })
      qc.invalidateQueries({ queryKey: ['hr-payroll'] })
      onClose()
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Save failed'),
  })

  const n = (field: keyof PayrollEntry) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [field]: parseFloat(e.target.value) || 0 }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-ink-800 rounded-xl shadow-2xl w-full max-w-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100 dark:border-ink-700">
          <h3 className="font-bold text-ink-900 dark:text-white text-[15px]">
            {entry ? 'Edit Entry' : 'Add Payroll Entry'}
          </h3>
          <button className="icon-btn" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Period */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Month">
              <select className="input text-[13px]" value={form.period_month}
                onChange={e => setForm(f => ({ ...f, period_month: parseInt(e.target.value) }))}>
                {monthOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="Year">
              <select className="input text-[13px]" value={form.period_year}
                onChange={e => setForm(f => ({ ...f, period_year: parseInt(e.target.value) }))}>
                {yearOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
          </div>

          <hr className="border-ink-100 dark:border-ink-700" />
          <p className="text-[11px] font-bold text-ink-400 uppercase tracking-wider">Salary components</p>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Basic Salary"><NumInput value={form.basic_salary} onChange={n('basic_salary')} /></Field>
            <Field label="Housing Allowance"><NumInput value={form.housing_allowance} onChange={n('housing_allowance')} /></Field>
            <Field label="Transport Allowance"><NumInput value={form.transport_allowance} onChange={n('transport_allowance')} /></Field>
            <Field label="Other Allowances"><NumInput value={form.other_allowances} onChange={n('other_allowances')} /></Field>
          </div>

          <div className="rounded-lg bg-ink-50 dark:bg-ink-700/30 px-4 py-2.5 flex items-center justify-between">
            <span className="text-[12px] font-semibold text-ink-600 dark:text-ink-300 flex items-center gap-1.5">
              <Calculator className="w-3.5 h-3.5" /> Gross Salary
            </span>
            <span className="text-[14px] font-bold text-ink-900 dark:text-white tabular-nums">
              {gross.toLocaleString('en-US')}
            </span>
          </div>

          <hr className="border-ink-100 dark:border-ink-700" />
          <p className="text-[11px] font-bold text-ink-400 uppercase tracking-wider">Deductions</p>

          <div className="grid grid-cols-3 gap-3">
            <Field label="PAYE (TPR)"><NumInput value={form.paye} onChange={n('paye')} /></Field>
            <Field label="RSSB"><NumInput value={form.rssb} onChange={n('rssb')} /></Field>
            <Field label="CBHI"><NumInput value={form.cbhi} onChange={n('cbhi')} /></Field>
          </div>

          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-500/10 px-4 py-2.5 flex items-center justify-between">
            <span className="text-[12px] font-semibold text-emerald-700 dark:text-emerald-300">Net Salary</span>
            <span className="text-[14px] font-bold text-emerald-800 dark:text-emerald-200 tabular-nums">
              {net.toLocaleString('en-US')}
            </span>
          </div>

          <Field label="Notes (optional)">
            <input className="input text-[13px]" value={form.notes ?? ''}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </Field>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-ink-100 dark:border-ink-700">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── helpers ─────────────────────────────────────────────────────────── */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-bold text-ink-500 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  )
}

function NumInput({ value, onChange }: { value: number; onChange: React.ChangeEventHandler<HTMLInputElement> }) {
  return (
    <input type="number" min="0" step="1" className="input text-[13px] text-right"
      value={value || ''} onChange={onChange} />
  )
}
