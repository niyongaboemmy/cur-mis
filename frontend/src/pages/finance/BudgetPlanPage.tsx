import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  LineChart,
  Download,
  Upload,
  FileSpreadsheet,
  Users,
  Plus,
  Pencil,
  Trash2,
  X,
  Loader2,
} from 'lucide-react'
import { budgetPlanService } from '@/services/financeService'
import { academicService as academicSvc } from '@/services/academicService'
import { PERMISSIONS } from '@/constants/permissions'
import { usePermission } from '@/utils/permissions'
import SearchableSelect from '@/components/ui/SearchableSelect'
import ModalPortal from '@/components/ui/ModalPortal'
import { formatRWF } from '@/utils/formatCurrency'
import {
  BUDGET_PLAN_SECTIONS,
  BUDGET_PLAN_ROW_TYPES,
} from '@/types/finance'
import type {
  BudgetPlan,
  BudgetPlanLineItem,
  BudgetPlanStudentExecution,
  SaveBudgetLineItemPayload,
} from '@/types/finance'

const SECTION_LABELS: Record<string, string> = {
  revenue: 'Revenue',
  staff_cost: 'Staff Cost',
  admin_cost: 'Administrative Cost',
  academic_cost: 'Academic Cost',
  ict_cost: 'ICT Cost',
  finance_cost: 'Finance Cost',
  capex: 'Capital Expenditure',
  financing: 'Financing',
  arrears: 'Arrears',
  cashflow: 'Cash Flow',
}

export default function BudgetPlanPage() {
  const qc = useQueryClient()
  const canManage = usePermission(PERMISSIONS.MANAGE_BUDGET_EXECUTION)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [yearId, setYearId] = useState<number | ''>('')
  const [showNewPlan, setShowNewPlan] = useState(false)
  const [editRow, setEditRow] = useState<BudgetPlanLineItem | 'new' | null>(null)
  const [deleteRow, setDeleteRow] = useState<BudgetPlanLineItem | null>(null)

  const yearsQ = useQuery({
    queryKey: ['academic', 'years'],
    queryFn: ({ signal }) => academicSvc.listYears(signal),
  })
  const years = yearsQ.data?.data ?? []

  const planQ = useQuery({
    queryKey: ['finance', 'budget-plan', yearId],
    queryFn: ({ signal }) => budgetPlanService.get(Number(yearId), signal),
    enabled: !!yearId,
    retry: false,
  })
  const plan = planQ.data?.data
  const planNotFound = !!yearId && planQ.isError && !planQ.isLoading

  const monthKeys = plan ? Object.keys(plan.month_names).map(Number).sort((a, b) => a - b) : []
  const hasExecution = plan?.line_items.some((li) => li.executed_total !== null) ?? false

  const invalidatePlan = () => qc.invalidateQueries({ queryKey: ['finance', 'budget-plan', yearId] })

  // ── Mutations ─────────────────────────────────────────────────────────────

  const createPlanMut = useMutation({
    mutationFn: (data: { title: string; student_count_budgeted: number | null }) =>
      budgetPlanService.create({ academic_year_id: Number(yearId), ...data }),
    onSuccess: () => {
      invalidatePlan()
      toast.success('Financial plan initialized')
      setShowNewPlan(false)
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to create plan'),
  })

  const saveRowMut = useMutation({
    mutationFn: (payload: SaveBudgetLineItemPayload): Promise<unknown> =>
      editRow && editRow !== 'new'
        ? budgetPlanService.updateLineItem(editRow.id, payload)
        : budgetPlanService.createLineItem(plan!.id, payload),
    onSuccess: () => {
      invalidatePlan()
      toast.success(editRow !== 'new' ? 'Row updated' : 'Row created')
      setEditRow(null)
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Save failed'),
  })

  const deleteRowMut = useMutation({
    mutationFn: (id: number) => budgetPlanService.deleteLineItem(id),
    onSuccess: () => {
      invalidatePlan()
      toast.success('Row deleted')
      setDeleteRow(null)
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Delete failed'),
  })

  const importMut = useMutation({
    mutationFn: (file: File) => budgetPlanService.import(Number(yearId), file),
    onSuccess: (res) => {
      invalidatePlan()
      const created = res.data?.created ?? 0
      const updated = res.data?.updated ?? 0
      toast.success(`Imported: ${created} created, ${updated} updated`)
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Import failed'),
  })

  function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) importMut.mutate(file)
    e.target.value = ''
  }

  return (
    <div className="space-y-4 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-ink-900 p-5 rounded-xl border border-ink-200 dark:border-ink-800 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-brand/10 text-brand rounded-lg">
            <LineChart className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-ink-900 dark:text-ink-50">Financial Plan</h1>
            <p className="text-xs text-ink-500">
              The university's full annual financial plan — revenue, staff/admin/academic/ICT/finance costs, capex and
              financing, by month. Not the same as Budget Execution, which tracks day-to-day expense-category spending.
            </p>
          </div>
        </div>
        {plan && (
          <div className="flex gap-2 flex-wrap">
            {canManage && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  onChange={handleFileChosen}
                />
                <button
                  className="btn-ghost btn-sm flex items-center gap-1.5"
                  onClick={() => yearId && budgetPlanService.downloadTemplate(Number(yearId))}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" /> Template
                </button>
                <button
                  className="btn-ghost btn-sm flex items-center gap-1.5"
                  disabled={importMut.isPending}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {importMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  Upload
                </button>
                <button
                  className="btn-primary btn-sm flex items-center gap-1.5"
                  onClick={() => setEditRow('new')}
                >
                  <Plus className="w-3.5 h-3.5" /> Add Row
                </button>
              </>
            )}
            <button
              className="btn-ghost btn-sm flex items-center gap-1.5"
              onClick={() => yearId && budgetPlanService.download(Number(yearId))}
            >
              <Download className="w-3.5 h-3.5" /> Excel
            </button>
          </div>
        )}
      </div>

      {/* Filter */}
      <div className="bg-white dark:bg-ink-900 p-4 rounded-xl border border-ink-200 dark:border-ink-800 shadow-sm grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Academic Year</label>
          <SearchableSelect
            options={years.map((y: any) => ({ value: y.id, label: y.label }))}
            value={yearId}
            onChange={(v) => setYearId(v === '' ? '' : Number(v))}
            placeholder="Select academic year"
          />
        </div>
      </div>

      {/* New plan modal */}
      {showNewPlan && yearId && (
        <NewPlanModal
          isPending={createPlanMut.isPending}
          onClose={() => setShowNewPlan(false)}
          onSave={(data) => createPlanMut.mutate(data)}
        />
      )}

      {/* Add/edit row modal */}
      {editRow && plan && (
        <LineItemModal
          row={editRow === 'new' ? null : editRow}
          monthNames={plan.month_names}
          isPending={saveRowMut.isPending}
          onClose={() => setEditRow(null)}
          onSave={(payload) => saveRowMut.mutate(payload)}
        />
      )}

      {/* Delete confirm */}
      {deleteRow && (
        <ConfirmDeleteModal
          label={deleteRow.label}
          isPending={deleteRowMut.isPending}
          onClose={() => setDeleteRow(null)}
          onConfirm={() => deleteRowMut.mutate(deleteRow.id)}
        />
      )}

      {/* Content */}
      {!yearId ? (
        <div className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 shadow-sm p-12 text-center text-ink-400 italic text-sm">
          Select an academic year to view the financial plan.
        </div>
      ) : planQ.isLoading ? (
        <LoadingCard />
      ) : !plan ? (
        <div className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 shadow-sm p-12 text-center space-y-3">
          <p className="text-ink-400 italic text-sm">
            {planNotFound ? 'No financial plan found for that academic year.' : 'Loading…'}
          </p>
          {canManage && planNotFound && (
            <div className="flex items-center justify-center gap-2">
              <button className="btn btn-primary text-sm px-5" onClick={() => setShowNewPlan(true)}>
                <Plus className="w-3.5 h-3.5 inline mr-1.5" /> Initialize New Plan
              </button>
              <button
                className="btn btn-secondary text-sm px-5"
                onClick={() => yearId && budgetPlanService.downloadTemplate(Number(yearId))}
              >
                <FileSpreadsheet className="w-3.5 h-3.5 inline mr-1.5" /> Download Blank Template
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          <BudgetTable
            plan={plan}
            monthKeys={monthKeys}
            hasExecution={hasExecution}
            canManage={canManage}
            onEdit={(row) => setEditRow(row)}
            onDelete={(row) => setDeleteRow(row)}
          />
          {plan.student_executions.length > 0 && (
            <StudentExecutionTable rows={plan.student_executions} />
          )}
        </>
      )}
    </div>
  )
}

function LoadingCard() {
  return (
    <div className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 shadow-sm p-6 space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-4 bg-ink-100 dark:bg-ink-800 rounded w-full animate-pulse" />
      ))}
    </div>
  )
}

function rowClasses(item: BudgetPlanLineItem): string {
  if (item.row_type === 'subtotal') return 'bg-ink-50 dark:bg-ink-800 font-bold'
  if (item.row_type === 'header') return 'font-semibold text-ink-500 dark:text-ink-400'
  return ''
}

function BudgetTable({
  plan,
  monthKeys,
  hasExecution,
  canManage,
  onEdit,
  onDelete,
}: {
  plan: BudgetPlan
  monthKeys: number[]
  hasExecution: boolean
  canManage: boolean
  onEdit: (row: BudgetPlanLineItem) => void
  onDelete: (row: BudgetPlanLineItem) => void
}) {
  return (
    <div className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-ink-100 dark:border-ink-800 bg-ink-50/60 dark:bg-ink-800/60 flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink-800 dark:text-ink-100">{plan.title}</h3>
        {plan.student_count_budgeted != null && (
          <span className="inline-flex items-center gap-1.5 text-xs text-ink-500">
            <Users className="w-3.5 h-3.5" /> {plan.student_count_budgeted.toLocaleString()} budgeted students
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-ink-50 dark:bg-ink-700/50 text-ink-500 text-xs uppercase font-bold">
            <tr>
              <th className="px-4 py-2.5 text-left sticky left-0 bg-ink-50 dark:bg-ink-700/50 z-10">Particulars</th>
              {monthKeys.map((m) => (
                <th key={m} className="px-3 py-2.5 text-right whitespace-nowrap">
                  {plan.month_names[m]}
                </th>
              ))}
              <th className="px-4 py-2.5 text-right whitespace-nowrap">General Total</th>
              {hasExecution && (
                <>
                  <th className="px-4 py-2.5 text-right whitespace-nowrap">Execution</th>
                  <th className="px-4 py-2.5 text-right whitespace-nowrap">Variance</th>
                  <th className="px-4 py-2.5 text-right whitespace-nowrap">% Realised</th>
                </>
              )}
              {canManage && <th className="px-4 py-2.5" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
            {plan.line_items.map((item: BudgetPlanLineItem) => (
              <tr key={item.id} className={`group ${rowClasses(item)}`}>
                <td className="px-4 py-2.5 sticky left-0 bg-white dark:bg-ink-900 whitespace-nowrap">
                  {item.label}
                </td>
                {monthKeys.map((m) => (
                  <td key={m} className="px-3 py-2.5 text-right font-mono text-ink-600 dark:text-ink-300 whitespace-nowrap">
                    {item.months[m] != null ? formatRWF(item.months[m]) : ''}
                  </td>
                ))}
                <td className="px-4 py-2.5 text-right font-mono whitespace-nowrap">
                  {item.general_total != null ? formatRWF(item.general_total) : ''}
                </td>
                {hasExecution && (
                  <>
                    <td className="px-4 py-2.5 text-right font-mono whitespace-nowrap">
                      {item.executed_total != null ? formatRWF(item.executed_total) : ''}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-mono whitespace-nowrap ${item.variance != null && item.variance < 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {item.variance != null ? formatRWF(item.variance) : ''}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono whitespace-nowrap">
                      {item.pct_realisation != null ? `${item.pct_realisation}%` : ''}
                    </td>
                  </>
                )}
                {canManage && (
                  <td className="px-4 py-2.5 text-right whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onEdit(item)}
                      className="p-1.5 text-brand hover:bg-brand/10 rounded-md transition-colors"
                      title="Edit row"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onDelete(item)}
                      className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                      title="Delete row"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StudentExecutionTable({ rows }: { rows: BudgetPlanStudentExecution[] }) {
  return (
    <div className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-ink-100 dark:border-ink-800 bg-ink-50/60 dark:bg-ink-800/60">
        <h3 className="text-sm font-bold text-ink-800 dark:text-ink-100">Student Numbers — Budgeted vs. Executed</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-ink-50 dark:bg-ink-700/50 text-ink-500 text-xs uppercase font-bold">
            <tr>
              <th className="px-4 py-2.5 text-left">Faculty</th>
              <th className="px-4 py-2.5 text-right">Budgeted</th>
              <th className="px-4 py-2.5 text-right">Executed</th>
              <th className="px-4 py-2.5 text-right">Variance</th>
              <th className="px-4 py-2.5 text-center">Rank</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
            {rows.map((r) => (
              <tr key={r.faculty_code}>
                <td className="px-4 py-2.5 font-medium text-ink-900 dark:text-white">{r.faculty_code}</td>
                <td className="px-4 py-2.5 text-right font-mono">{r.budgeted?.toLocaleString()}</td>
                <td className="px-4 py-2.5 text-right font-mono">{r.executed?.toLocaleString()}</td>
                <td className={`px-4 py-2.5 text-right font-mono ${r.executed - r.budgeted < 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {(r.executed - r.budgeted).toLocaleString()}
                </td>
                <td className="px-4 py-2.5 text-center">{r.rank ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Modals ────────────────────────────────────────────────────────────────────

function NewPlanModal({
  isPending,
  onClose,
  onSave,
}: {
  isPending: boolean
  onClose: () => void
  onSave: (data: { title: string; student_count_budgeted: number | null }) => void
}) {
  const [title, setTitle] = useState('')
  const [studentCount, setStudentCount] = useState('')

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-ink-800 rounded-xl shadow-xl w-full max-w-md">
          <div className="flex items-center justify-between px-6 py-4 border-b border-ink-100 dark:border-ink-700">
            <h3 className="text-base font-semibold text-ink-900 dark:text-white">Initialize New Financial Plan</h3>
            <button onClick={onClose} className="btn-ghost btn-xs" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-6 space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Title (optional)</label>
              <input
                type="text"
                className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Financial Budget for Academic year …"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Budgeted Number of Students (optional)</label>
              <input
                type="number"
                min={0}
                className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700"
                value={studentCount}
                onChange={(e) => setStudentCount(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-ink-100 dark:border-ink-700">
            <button className="btn btn-secondary text-sm px-5" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn btn-primary text-sm px-7"
              disabled={isPending}
              onClick={() =>
                onSave({
                  title,
                  student_count_budgeted: studentCount !== '' ? Number(studentCount) : null,
                })
              }
            >
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Create Plan'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}

function ConfirmDeleteModal({
  label,
  isPending,
  onClose,
  onConfirm,
}: {
  label: string
  isPending: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-ink-800 rounded-xl shadow-xl w-full max-w-sm">
          <div className="p-6 space-y-3">
            <h3 className="text-base font-semibold text-ink-900 dark:text-white">Delete Row?</h3>
            <p className="text-sm text-ink-500">
              This will permanently delete <span className="font-medium text-ink-800 dark:text-ink-200">"{label}"</span> and its monthly values.
            </p>
          </div>
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-ink-100 dark:border-ink-700">
            <button className="btn btn-secondary text-sm px-5" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn bg-red-600 hover:bg-red-700 text-white text-sm px-5"
              disabled={isPending}
              onClick={onConfirm}
            >
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}

function LineItemModal({
  row,
  monthNames,
  isPending,
  onClose,
  onSave,
}: {
  row: BudgetPlanLineItem | null
  monthNames: Record<string, string>
  isPending: boolean
  onClose: () => void
  onSave: (payload: SaveBudgetLineItemPayload) => void
}) {
  const [label, setLabel] = useState(row?.label ?? '')
  const [section, setSection] = useState<string>(row?.section ?? BUDGET_PLAN_SECTIONS[0])
  const [rowType, setRowType] = useState<string>(row?.row_type ?? 'data')
  const [generalTotal, setGeneralTotal] = useState(row?.general_total != null ? String(row.general_total) : '')
  const [executedTotal, setExecutedTotal] = useState(row?.executed_total != null ? String(row.executed_total) : '')
  const [months, setMonths] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {}
    for (const m of Object.keys(monthNames).map(Number)) {
      init[m] = row?.months[m] != null ? String(row.months[m]) : ''
    }
    return init
  })

  const monthKeys = Object.keys(monthNames).map(Number).sort((a, b) => a - b)
  const valid = label.trim().length > 0

  function submit() {
    const monthsPayload: Record<number, number | null> = {}
    for (const m of monthKeys) {
      monthsPayload[m] = months[m] !== '' ? Number(months[m]) : null
    }
    onSave({
      label: label.trim(),
      section,
      row_type: rowType,
      general_total: generalTotal !== '' ? Number(generalTotal) : null,
      executed_total: executedTotal !== '' ? Number(executedTotal) : null,
      months: monthsPayload,
    })
  }

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-ink-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between px-6 py-4 border-b border-ink-100 dark:border-ink-700 sticky top-0 bg-white dark:bg-ink-800 z-10">
            <h3 className="text-base font-semibold text-ink-900 dark:text-white">
              {row ? 'Edit Row' : 'Add Row'}
            </h3>
            <button onClick={onClose} className="btn-ghost btn-xs" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-3 space-y-1">
                <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Label</label>
                <input
                  type="text"
                  autoFocus
                  className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Faculty of Commerce"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Section</label>
                <select
                  className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700"
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                >
                  {BUDGET_PLAN_SECTIONS.map((s) => (
                    <option key={s} value={s}>{SECTION_LABELS[s] ?? s}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Row Type</label>
                <select
                  className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700"
                  value={rowType}
                  onChange={(e) => setRowType(e.target.value)}
                >
                  {BUDGET_PLAN_ROW_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">General Total</label>
                <input
                  type="number"
                  className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700"
                  value={generalTotal}
                  onChange={(e) => setGeneralTotal(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Executed Total (optional, for execution reporting)</label>
              <input
                type="number"
                className="w-full sm:w-1/3 px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700"
                value={executedTotal}
                onChange={(e) => setExecutedTotal(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Monthly Breakdown (optional)</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {monthKeys.map((m) => (
                  <div key={m} className="space-y-0.5">
                    <label className="text-[10px] text-ink-400">{monthNames[m]}</label>
                    <input
                      type="number"
                      className="w-full px-2 py-1.5 bg-ink-50 dark:bg-ink-900 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700"
                      value={months[m] ?? ''}
                      onChange={(e) => setMonths((prev) => ({ ...prev, [m]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-ink-100 dark:border-ink-700 sticky bottom-0 bg-white dark:bg-ink-800">
            <button className="btn btn-secondary text-sm px-5" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn btn-primary text-sm px-7"
              disabled={!valid || isPending}
              onClick={submit}
            >
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : row ? 'Save Changes' : 'Add Row'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
