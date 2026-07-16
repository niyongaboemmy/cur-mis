import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'
import {
  Wallet,
  Download,
  FileText,
  SplitSquareHorizontal,
  Pencil,
  X,
  AlertTriangle,
  Loader2,
} from 'lucide-react'
import { budgetExecutionService, budgetService } from '@/services/financeService'
import { academicService as academicSvc } from '@/services/academicService'
import { academicsMgmtService } from '@/services/academicsMgmtService'
import { useAuthStore } from '@/store/authStore'
import { PERMISSIONS } from '@/constants/permissions'
import type { BudgetExecutionRow, SaveBudgetPayload } from '@/types/finance'
import SearchableSelect from '@/components/ui/SearchableSelect'
import ModalPortal from '@/components/ui/ModalPortal'
import { formatRWF } from '@/utils/formatCurrency'

export default function BudgetExecutionPage() {
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const perms = user?.permissions ?? []
  const canManage = user?.role === 'superadmin' || perms.includes(PERMISSIONS.MANAGE_BUDGET_EXECUTION)

  const [yearId, setYearId] = useState<number | ''>('')
  const [compareYearId, setCompareYearId] = useState<number | ''>('')
  const [departmentId, setDepartmentId] = useState<number | ''>('')
  const [compareMode, setCompareMode] = useState(false)
  const [editRow, setEditRow] = useState<BudgetExecutionRow | null>(null)

  // ── Reference data ────────────────────────────────────────────────────────

  const yearsQ = useQuery({
    queryKey: ['academic', 'years'],
    queryFn: ({ signal }) => academicSvc.listYears(signal),
  })
  const years = yearsQ.data?.data ?? []

  const deptsQ = useQuery({
    queryKey: ['academics', 'departments'],
    queryFn: () => academicsMgmtService.list<any>('departments', { per_page: 200 }),
  })
  const departments = deptsQ.data?.data?.data ?? []

  // ── Budget execution data ─────────────────────────────────────────────────

  const reportQ = useQuery({
    queryKey: ['finance', 'budget-execution', yearId, departmentId],
    queryFn: ({ signal }) =>
      budgetExecutionService.list(Number(yearId), departmentId ? Number(departmentId) : null, signal),
    enabled: !!yearId && !compareMode,
  })
  const rows: BudgetExecutionRow[] = reportQ.data?.data ?? []

  const compareQ = useQuery({
    queryKey: ['finance', 'budget-execution', 'compare', yearId, compareYearId, departmentId],
    queryFn: ({ signal }) =>
      budgetExecutionService.compare(
        Number(yearId),
        Number(compareYearId),
        departmentId ? Number(departmentId) : null,
        signal,
      ),
    enabled: !!yearId && !!compareYearId && compareMode,
  })
  const compareResult = compareQ.data?.data

  const yearLabel = years.find((y: any) => y.id === Number(yearId))?.label ?? ''
  const compareYearLabel = years.find((y: any) => y.id === Number(compareYearId))?.label ?? ''

  const totals = (list: BudgetExecutionRow[]) => ({
    planned: list.reduce((s, r) => s + Number(r.planned_budget), 0),
    spent: list.reduce((s, r) => s + Number(r.amount_spent), 0),
    balance: list.reduce((s, r) => s + Number(r.balance), 0),
  })
  const rowTotals = totals(rows)

  // ── Save budget mutation ──────────────────────────────────────────────────

  const saveMut = useMutation({
    mutationFn: (data: SaveBudgetPayload) => budgetService.save(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance', 'budget-execution'] })
      qc.invalidateQueries({ queryKey: ['finance', 'budgets'] })
      toast.success('Budget saved')
      setEditRow(null)
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Save failed'),
  })

  // ── Export ────────────────────────────────────────────────────────────────

  function exportExcel(list: BudgetExecutionRow[], label: string) {
    if (!list.length) {
      toast.error('Nothing to export')
      return
    }
    const headerRow = ['Category', 'Department', 'Planned Budget (RWF)', 'Amount Spent (RWF)', 'Balance (RWF)', 'Variance (RWF)', 'Status']
    const dataRows = list.map((r) => [
      r.category_name,
      r.department_name ?? 'All Departments',
      r.planned_budget,
      r.amount_spent,
      r.balance,
      r.variance,
      r.is_overspend ? 'OVER' : 'OK',
    ])
    const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Budget Execution')
    XLSX.writeFile(wb, `Budget-Execution-${label || 'Report'}.xlsx`)
    toast.success('Exported to Excel')
  }

  function exportPdf() {
    if (!yearId) {
      toast.error('Select an academic year first')
      return
    }
    budgetExecutionService.download('pdf', Number(yearId), departmentId ? Number(departmentId) : null)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-ink-900 p-5 rounded-xl border border-ink-200 dark:border-ink-800 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-brand/10 text-brand rounded-lg">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-ink-900 dark:text-ink-50">Budget Execution</h1>
            <p className="text-xs text-ink-500">Planned vs. actual spend per category and department, with overspend flags and year-over-year comparison.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            className={`btn-sm flex items-center gap-1.5 ${compareMode ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setCompareMode((m) => !m)}
          >
            <SplitSquareHorizontal className="w-3.5 h-3.5" />
            Compare Years
          </button>
          <button
            className="btn-ghost btn-sm flex items-center gap-1.5"
            onClick={() => exportExcel(compareMode ? (compareResult?.year_a.rows ?? []) : rows, compareMode ? yearLabel : yearLabel)}
          >
            <Download className="w-3.5 h-3.5" /> Excel
          </button>
          {!compareMode && (
            <button className="btn-ghost btn-sm flex items-center gap-1.5" onClick={exportPdf}>
              <FileText className="w-3.5 h-3.5" /> PDF
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-ink-900 p-4 rounded-xl border border-ink-200 dark:border-ink-800 shadow-sm grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">
            {compareMode ? 'Year A' : 'Academic Year'}
          </label>
          <SearchableSelect
            options={years.map((y: any) => ({ value: y.id, label: y.label }))}
            value={yearId}
            onChange={(v) => setYearId(v === '' ? '' : Number(v))}
            placeholder="Select academic year"
          />
        </div>
        {compareMode && (
          <div className="space-y-1">
            <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Year B</label>
            <SearchableSelect
              options={years.map((y: any) => ({ value: y.id, label: y.label }))}
              value={compareYearId}
              onChange={(v) => setCompareYearId(v === '' ? '' : Number(v))}
              placeholder="Select comparison year"
            />
          </div>
        )}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Department / Cost Center</label>
          <SearchableSelect
            options={departments.map((d: any) => ({ value: d.dep_id, label: d.dep_name }))}
            value={departmentId}
            onChange={(v) => setDepartmentId(v === '' ? '' : Number(v))}
            placeholder="All departments (institution-wide)"
            allLabel="All departments (institution-wide)"
          />
        </div>
      </div>

      {/* Edit budget modal */}
      {editRow && (
        <EditBudgetModal
          row={editRow}
          departmentId={departmentId ? Number(departmentId) : null}
          isPending={saveMut.isPending}
          onClose={() => setEditRow(null)}
          onSave={(amount) =>
            saveMut.mutate({
              academic_year_id: Number(yearId),
              category_id: editRow.category_id,
              amount,
              department_id: departmentId ? Number(departmentId) : null,
            })
          }
        />
      )}

      {/* Content */}
      {!yearId ? (
        <div className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 shadow-sm p-12 text-center text-ink-400 italic text-sm">
          Select an academic year to view the budget execution report.
        </div>
      ) : compareMode ? (
        !compareYearId ? (
          <div className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 shadow-sm p-12 text-center text-ink-400 italic text-sm">
            Select a second academic year to compare.
          </div>
        ) : compareQ.isLoading ? (
          <LoadingCard />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <BudgetTable
              title={compareResult?.year_a.label ?? yearLabel}
              rows={compareResult?.year_a.rows ?? []}
              canManage={false}
              onEdit={() => {}}
            />
            <BudgetTable
              title={compareResult?.year_b.label ?? compareYearLabel}
              rows={compareResult?.year_b.rows ?? []}
              canManage={false}
              onEdit={() => {}}
            />
          </div>
        )
      ) : reportQ.isLoading ? (
        <LoadingCard />
      ) : (
        <BudgetTable
          title={yearLabel}
          rows={rows}
          canManage={canManage}
          onEdit={(row) => setEditRow(row)}
          totals={rowTotals}
        />
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function LoadingCard() {
  return (
    <div className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 shadow-sm p-6 space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-4 bg-ink-100 dark:bg-ink-800 rounded w-full animate-pulse" />
      ))}
    </div>
  )
}

function BudgetTable({
  title,
  rows,
  canManage,
  onEdit,
  totals,
}: {
  title: string
  rows: BudgetExecutionRow[]
  canManage: boolean
  onEdit: (row: BudgetExecutionRow) => void
  totals?: { planned: number; spent: number; balance: number }
}) {
  return (
    <div className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-ink-100 dark:border-ink-800 bg-ink-50/60 dark:bg-ink-800/60">
        <h3 className="text-sm font-bold text-ink-800 dark:text-ink-100">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <div className="text-center py-10 text-ink-400 italic text-sm">No budget line items found.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 dark:bg-ink-700/50 text-ink-500 text-xs uppercase font-bold">
              <tr>
                <th className="px-4 py-2.5 text-left">Category</th>
                <th className="px-4 py-2.5 text-right">Planned</th>
                <th className="px-4 py-2.5 text-right">Spent</th>
                <th className="px-4 py-2.5 text-right">Balance</th>
                <th className="px-4 py-2.5 text-center">Status</th>
                {canManage && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
              {rows.map((r) => (
                <tr key={r.category_id} className={r.is_overspend ? 'bg-red-50/40 dark:bg-red-900/10' : ''}>
                  <td className="px-4 py-3 font-medium text-ink-900 dark:text-white">
                    {r.category_name}
                    {r.department_name && (
                      <span className="ml-2 text-[10px] font-normal text-ink-400">{r.department_name}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-ink-700 dark:text-ink-200">
                    {formatRWF(r.planned_budget)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-ink-600 dark:text-ink-300">
                    {formatRWF(r.amount_spent)}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono font-semibold ${r.balance < 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {formatRWF(r.balance)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {r.is_overspend ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">
                        <AlertTriangle className="w-3 h-3" /> OVER
                      </span>
                    ) : (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400">
                        OK
                      </span>
                    )}
                  </td>
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => onEdit(r)}
                        className="p-1.5 text-brand hover:bg-brand/10 rounded-md transition-colors"
                        title="Edit planned budget"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            {totals && (
              <tfoot className="border-t-2 border-ink-200 dark:border-ink-600">
                <tr className="bg-ink-50 dark:bg-ink-800 font-bold text-sm">
                  <td className="px-4 py-3 text-ink-700 dark:text-ink-200">Total</td>
                  <td className="px-4 py-3 text-right font-mono text-ink-700 dark:text-ink-200">{formatRWF(totals.planned)}</td>
                  <td className="px-4 py-3 text-right font-mono text-ink-600">{formatRWF(totals.spent)}</td>
                  <td className={`px-4 py-3 text-right font-mono ${totals.balance < 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {formatRWF(totals.balance)}
                  </td>
                  <td colSpan={canManage ? 2 : 1} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  )
}

function EditBudgetModal({
  row,
  departmentId,
  isPending,
  onClose,
  onSave,
}: {
  row: BudgetExecutionRow
  departmentId: number | null
  isPending: boolean
  onClose: () => void
  onSave: (amount: number) => void
}) {
  const [amount, setAmount] = useState(String(row.planned_budget))
  const parsed = parseFloat(amount)
  const valid = !isNaN(parsed) && parsed >= 0

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-ink-800 rounded-xl shadow-xl w-full max-w-sm">
          <div className="flex items-center justify-between px-6 py-4 border-b border-ink-100 dark:border-ink-700">
            <h3 className="text-base font-semibold text-ink-900 dark:text-white">Edit Planned Budget</h3>
            <button onClick={onClose} className="btn-ghost btn-xs" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-sm text-ink-500">
              {row.category_name}
              {row.department_name ? ` — ${row.department_name}` : departmentId ? '' : ' (institution-wide)'}
            </p>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Planned Budget (RWF)</label>
              <input
                type="number"
                min={0}
                step={1000}
                autoFocus
                className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              {!valid && <p className="text-red-500 text-[10px]">Must be a number ≥ 0</p>}
            </div>
          </div>
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-ink-100 dark:border-ink-700">
            <button className="btn btn-secondary text-sm px-5" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn btn-primary text-sm px-7"
              disabled={!valid || isPending}
              onClick={() => onSave(parsed)}
            >
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
