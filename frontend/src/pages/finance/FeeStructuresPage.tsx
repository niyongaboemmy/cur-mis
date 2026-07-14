import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Loader2, X, CalendarDays, Layers, SplitSquareHorizontal, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import { feeStructureService, feeTypeService } from '@/services/financeService'
import { academicsMgmtService } from '@/services/academicsMgmtService'
import { academicService as academicSvc } from '@/services/academicService'
import type { FeeStructure, CreateFeeStructurePayload, PaymentPlan, FeeTypeRecord } from '@/types/finance'
import SearchableSelect from '@/components/ui/SearchableSelect'
import Pagination from '@/components/ui/Pagination'
import { useSystemStore } from '@/store/systemStore'
import { formatRWF } from '@/utils/formatCurrency'
import ModalPortal from '@/components/ui/ModalPortal'

const PER_PAGE = 15

export default function FeeStructuresPage() {
  const qc = useQueryClient()
  const basics = useSystemStore((s) => s.basics)
  const selectedYearLabel = useSystemStore((s) => s.selectedYearLabel)

  const [yearId, setYearId]         = useState<number | string>('')
  const [page, setPage]             = useState(1)
  const [showForm, setShowForm]     = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [editing, setEditing]       = useState<FeeStructure | null>(null)

  useEffect(() => {
    if (selectedYearLabel) {
      const year = basics?.years?.find((y) => y.label === selectedYearLabel)
      if (year) setYearId(year.id)
    } else {
      const active = basics?.active_year as any
      if (active?.id) setYearId(active.id)
    }
  }, [selectedYearLabel, basics?.years])

  const yearsQ = useQuery({
    queryKey: ['academic-years'],
    queryFn: () => academicSvc.listYears(),
  })
  const years = yearsQ.data?.data ?? []
  const yearOptions = years.map((y: any) => ({ value: y.id, label: y.label }))

  const deptsQ = useQuery({
    queryKey: ['academics', 'departments'],
    queryFn: () => academicsMgmtService.list<any>('departments', { per_page: 100 }),
  })
  const departments = deptsQ.data?.data?.data ?? []

  const levelsQ = useQuery({
    queryKey: ['academics', 'levels'],
    queryFn: () => academicsMgmtService.list<any>('levels', { per_page: 20 }),
  })
  const levels = levelsQ.data?.data?.data ?? []

  const feeTypesQ = useQuery({
    queryKey: ['finance', 'fee-types'],
    queryFn: ({ signal }) => feeTypeService.list(signal),
  })
  const feeTypes: FeeTypeRecord[] = feeTypesQ.data?.data ?? []
  const feeTypeOptions = feeTypes
    .filter((t) => t.is_active && !['ARREARS', 'BURSARY_CREDIT'].includes(t.code))
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label))
    .map((t) => ({ value: t.code, label: t.label }))

  const structuresQ = useQuery({
    queryKey: ['finance', 'structures', yearId],
    queryFn: () => feeStructureService.list(yearId ? { academic_year_id: Number(yearId) } : {}),
    enabled: !!yearId,
  })
  const allRows: FeeStructure[] = structuresQ.data?.data ?? []

  const totalRows = allRows.length
  const lastPage  = Math.max(1, Math.ceil(totalRows / PER_PAGE))
  const rows      = allRows.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  const deleteMutation = useMutation({
    mutationFn: (id: number) => feeStructureService.delete(id),
    onSuccess: () => {
      toast.success('Fee structure deleted')
      qc.invalidateQueries({ queryKey: ['finance', 'structures'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Delete failed'),
  })

  const bulkImportMutation = useMutation({
    mutationFn: (rows: any[]) => feeStructureService.bulkImport({ rows }),
    onSuccess: (result: any) => {
      toast.success(`Bulk import complete: ${result.data.created} created, ${result.data.failed?.length ?? 0} failed`)
      qc.invalidateQueries({ queryKey: ['finance', 'structures'] })
      setShowImportModal(false)
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Import failed'),
  })

  const planLabel = (row: FeeStructure) => {
    const plan = row.payment_plan ?? 'full_year'
    if (plan === 'per_semester') return '2× semester'
    if (plan === 'per_installment') return `${row.installment_count ?? '?'}× install.`
    return 'Full year'
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-ink-900 dark:text-white">Fee Structures</h2>
          <p className="text-[13px] text-ink-500">Configure fee amounts per type, department, level and academic year.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary btn-sm" onClick={() => setShowImportModal(true)}>
            <Upload className="w-3.5 h-3.5" /> Import CSV
          </button>
          <button className="btn-primary btn-sm" onClick={() => { setEditing(null); setShowForm(true) }}>
            <Plus className="w-3.5 h-3.5" /> New structure
          </button>
        </div>
      </div>

      {/* Year filter */}
      <div className="card p-3 flex gap-3 items-end flex-wrap">
        <div className="min-w-[200px]">
          <label className="block text-xs text-ink-500 mb-1">Academic Year</label>
          <SearchableSelect
            options={yearOptions}
            value={yearId}
            onChange={v => { setYearId(v); setPage(1) }}
            placeholder="Select year…"
          />
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {structuresQ.isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-brand" />
          </div>
        )}
        {!yearId && !structuresQ.isLoading && (
          <p className="text-center py-10 text-ink-400 text-sm">Select an academic year to view fee structures.</p>
        )}
        {yearId && !structuresQ.isLoading && allRows.length === 0 && (
          <p className="text-center py-10 text-ink-400 text-sm">No fee structures configured for this year yet.</p>
        )}
        {rows.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ink-50 dark:bg-ink-700/50 text-ink-500 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-2.5 text-left">Label</th>
                    <th className="px-4 py-2.5 text-left">Type</th>
                    <th className="px-4 py-2.5 text-left">Department</th>
                    <th className="px-4 py-2.5 text-left">Level</th>
                    <th className="px-4 py-2.5 text-left">Semester</th>
                    <th className="px-4 py-2.5 text-right">Amount (RWF)</th>
                    <th className="px-4 py-2.5 text-left">Payment Plan</th>
                    <th className="px-4 py-2.5 text-center">Active</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                  {rows.map((row: FeeStructure) => (
                    <tr
                      key={row.id}
                      className="hover:bg-ink-50/50 dark:hover:bg-ink-700/30 cursor-pointer"
                      onClick={() => { setEditing(row); setShowForm(true) }}
                    >
                      <td className="px-4 py-2.5 font-medium">{row.label}</td>
                      <td className="px-4 py-2.5 text-ink-500">{feeTypes.find((t) => t.code === row.fee_type)?.label ?? row.fee_type}</td>
                      <td className="px-4 py-2.5 text-ink-500">
                        {row.dept_ids
                          ? (() => {
                              const ids = row.dept_ids.split(',').filter(Boolean)
                              if (ids.length === 1) return row.department_name ?? ids[0]
                              return <span className="text-xs bg-brand/10 text-brand px-1.5 py-0.5 rounded font-medium">{ids.length} depts</span>
                            })()
                          : row.department_name ?? <span className="italic text-ink-300">All</span>}
                      </td>
                      <td className="px-4 py-2.5 text-ink-500">{row.level_name ?? <span className="italic text-ink-300">All</span>}</td>
                      <td className="px-4 py-2.5 text-ink-500">{row.semester ? `S${row.semester}` : '—'}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold">{formatRWF(row.amount)}</td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs text-ink-500">{planLabel(row)}</span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`inline-block w-2 h-2 rounded-full ${row.is_active ? 'bg-green-500' : 'bg-ink-300'}`} />
                      </td>
                      <td className="px-4 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1 justify-end">
                          <button className="btn-ghost btn-xs" onClick={() => { setEditing(row); setShowForm(true) }}>
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            className="btn-ghost btn-xs text-red-500"
                            onClick={() => { if (confirm('Delete this fee structure?')) deleteMutation.mutate(row.id) }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {lastPage > 1 && (
              <div className="px-4 py-3 border-t border-ink-100 dark:border-ink-700">
                <Pagination
                  currentPage={page}
                  lastPage={lastPage}
                  total={totalRows}
                  perPage={PER_PAGE}
                  onPageChange={setPage}
                />
              </div>
            )}
          </>
        )}
      </div>

      {showForm && (
        <FeeStructureModal
          years={years}
          departments={departments}
          levels={levels}
          feeTypeOptions={feeTypeOptions}
          initial={editing}
          defaultYearId={yearId ? Number(yearId) : undefined}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false)
            qc.invalidateQueries({ queryKey: ['finance', 'structures'] })
          }}
        />
      )}

      {showImportModal && (
        <BulkImportModal
          onClose={() => setShowImportModal(false)}
          onImport={(rows) => bulkImportMutation.mutate(rows)}
          isLoading={bulkImportMutation.isPending}
        />
      )}
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

interface ModalProps {
  years:           any[]
  departments:     any[]
  levels:          any[]
  feeTypeOptions:  { value: string; label: string }[]
  initial:         FeeStructure | null
  defaultYearId?: number
  onClose:       () => void
  onSaved:       () => void
}

const PLAN_OPTIONS: { value: PaymentPlan; label: string; desc: string; icon: React.ReactNode }[] = [
  {
    value: 'full_year',
    label: 'Full Year',
    desc: 'One payment covers the entire academic year.',
    icon: <CalendarDays className="w-4 h-4" />,
  },
  {
    value: 'per_semester',
    label: 'Per Semester',
    desc: 'Amount split equally across 2 semesters.',
    icon: <Layers className="w-4 h-4" />,
  },
  {
    value: 'per_installment',
    label: 'Installments',
    desc: 'Custom number of payment installments.',
    icon: <SplitSquareHorizontal className="w-4 h-4" />,
  },
]

function planBreakdown(plan: PaymentPlan, amount: number, count: number) {
  if (plan === 'full_year') {
    return [{ label: 'Full year payment', amount }]
  }
  if (plan === 'per_semester') {
    const half = Math.round(amount / 2)
    return [
      { label: 'Semester 1', amount: half },
      { label: 'Semester 2', amount: amount - half },
    ]
  }
  if (plan === 'per_installment' && count >= 2) {
    const base = Math.floor(amount / count)
    const remainder = amount - base * (count - 1)
    return Array.from({ length: count }, (_, i) => ({
      label: `Installment ${i + 1}`,
      amount: i === count - 1 ? remainder : base,
    }))
  }
  return [{ label: 'Full year payment', amount }]
}

function FeeStructureModal({ years, departments, levels, feeTypeOptions, initial, defaultYearId, onClose, onSaved }: ModalProps) {
  const parseInitialDepts = (): number[] => {
    if (initial?.dept_ids) return initial.dept_ids.split(',').map(Number).filter(Boolean)
    if (initial?.department_id) return [initial.department_id]
    return []
  }

  const [selectedDepts, setSelectedDepts] = useState<number[]>(parseInitialDepts)
  const [form, setForm] = useState<CreateFeeStructurePayload & { is_active: 0 | 1 }>({
    academic_year_id:  initial?.academic_year_id ?? defaultYearId ?? 0,
    department_id:     initial?.department_id ?? null,
    department_ids:    parseInitialDepts(),
    level_id:          initial?.level_id ?? null,
    fee_type:          (initial?.fee_type ?? 'TUITION') as string,
    label:             initial?.label ?? '',
    amount:            initial?.amount ?? 0,
    semester:          initial?.semester ?? null,
    payment_plan:      initial?.payment_plan ?? 'full_year',
    installment_count: initial?.installment_count ?? 4,
    is_active:         (initial?.is_active ?? 1) as 0 | 1,
  })

  const toggleDept = (deptId: number) => {
    const next = selectedDepts.includes(deptId)
      ? selectedDepts.filter(d => d !== deptId)
      : [...selectedDepts, deptId]
    setSelectedDepts(next)
    setForm(f => ({ ...f, department_ids: next, department_id: next[0] ?? null }))
  }

  const toggleAllDepts = () => {
    if (selectedDepts.length === departments.length) {
      setSelectedDepts([])
      setForm(f => ({ ...f, department_ids: [], department_id: null }))
    } else {
      const allIds = departments.map((d: any) => d.dep_id)
      setSelectedDepts(allIds)
      setForm(f => ({ ...f, department_ids: allIds, department_id: allIds[0] ?? null }))
    }
  }

  const set = (k: keyof typeof form, v: any) => setForm(f => ({ ...f, [k]: v }))

  const yearOptions  = years.map((y: any) => ({ value: y.id, label: y.label }))
  const levelOptions = levels.map((l: any) => ({ value: l.id, label: l.name }))

  const activePlan    = form.payment_plan ?? 'full_year'
  const installCount  = Math.max(2, Math.min(12, form.installment_count ?? 4))
  const breakdown     = planBreakdown(activePlan, form.amount, installCount)

  const mutation = useMutation({
    mutationFn: (): Promise<any> =>
      initial
        ? feeStructureService.update(initial.id, { ...form })
        : feeStructureService.create(form),
    onSuccess: () => {
      toast.success(initial ? 'Fee structure updated' : 'Fee structure created')
      onSaved()
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Save failed'),
  })

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-sm">
      <div className="flex min-h-full items-start justify-center p-4 pt-10">
        <div className="bg-white dark:bg-ink-800 rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-ink-100 dark:border-ink-700">
            <div>
              <h3 className="text-base font-semibold text-ink-900 dark:text-white">
                {initial ? 'Edit Fee Structure' : 'New Fee Structure'}
              </h3>
              <p className="text-xs text-ink-400 mt-0.5">
                Define how a fee is charged and how students can pay it.
              </p>
            </div>
            <button
              onClick={onClose}
              className="btn-ghost btn-sm p-1.5 rounded-full"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* ── Left: Basic Details ── */}
            <div className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Basic Details</p>

              <Field label="Academic Year *">
                <SearchableSelect
                  options={yearOptions}
                  value={form.academic_year_id}
                  onChange={v => set('academic_year_id', Number(v))}
                  placeholder="Select year…"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Fee Type *">
                  <SearchableSelect
                    options={feeTypeOptions}
                    value={form.fee_type}
                    onChange={v => set('fee_type', String(v))}
                    placeholder="Select type…"
                  />
                </Field>
                <Field label="Semester">
                  <SearchableSelect
                    options={[
                      { value: 1, label: 'Semester 1' },
                      { value: 2, label: 'Semester 2' },
                    ]}
                    value={form.semester ?? ''}
                    onChange={v => set('semester', v ? Number(v) : null)}
                    placeholder="Full year"
                    allLabel="Full year"
                  />
                </Field>
              </div>

              <Field label="Label *">
                <input
                  className="input input-sm w-full"
                  value={form.label}
                  onChange={e => set('label', e.target.value)}
                  placeholder="e.g. Tuition Y1 S1"
                />
              </Field>

              <Field label="Annual Amount (RWF) *">
                <input
                  type="number"
                  className="input input-sm w-full font-mono"
                  value={form.amount}
                  onChange={e => set('amount', Number(e.target.value))}
                  min={0}
                />
                {form.amount > 0 && (
                  <p className="text-[11px] text-ink-400 mt-1">
                    = {formatRWF(form.amount)} total per student
                  </p>
                )}
              </Field>

              <Field label="Level">
                <SearchableSelect
                  options={levelOptions}
                  value={form.level_id ?? ''}
                  onChange={v => set('level_id', v ? Number(v) : null)}
                  placeholder="All levels"
                  allLabel="All levels"
                />
              </Field>

              {initial && (
                <Field label="Status">
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <div className="relative">
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={form.is_active === 1}
                        onChange={e => set('is_active', e.target.checked ? 1 : 0)}
                      />
                      <div className={`w-10 h-5 rounded-full transition-colors ${
                        form.is_active === 1 ? 'bg-green-500' : 'bg-ink-300 dark:bg-ink-600'
                      }`} />
                      <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                        form.is_active === 1 ? 'translate-x-5' : 'translate-x-0'
                      }`} />
                    </div>
                    <span className={`text-sm font-medium ${form.is_active === 1 ? 'text-green-600' : 'text-ink-400'}`}>
                      {form.is_active === 1 ? 'Active' : 'Inactive'}
                    </span>
                  </label>
                </Field>
              )}
            </div>

            {/* ── Right: Scope + Payment Plan ── */}
            <div className="space-y-4">
              {/* Departments */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                    Departments
                    <span className="normal-case font-normal ml-1 text-ink-300">(leave empty = all)</span>
                  </label>
                  {departments.length > 0 && (
                    <button
                      type="button"
                      className="text-[11px] text-brand hover:underline"
                      onClick={toggleAllDepts}
                    >
                      {selectedDepts.length === departments.length ? 'Deselect all' : 'Select all'}
                    </button>
                  )}
                </div>
                <div className="border border-ink-200 dark:border-ink-600 rounded-xl p-2 max-h-44 overflow-y-auto space-y-0.5 bg-ink-50/50 dark:bg-ink-900/30">
                  {departments.length === 0 && (
                    <p className="text-xs text-ink-400 py-1 px-1">No departments loaded</p>
                  )}
                  {departments.map((d: any) => (
                    <label
                      key={d.dep_id}
                      className={`flex items-center gap-2.5 cursor-pointer rounded-lg px-2 py-1.5 transition-colors ${
                        selectedDepts.includes(d.dep_id)
                          ? 'bg-brand/10 dark:bg-brand/20'
                          : 'hover:bg-ink-100 dark:hover:bg-ink-700/40'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="rounded accent-brand"
                        checked={selectedDepts.includes(d.dep_id)}
                        onChange={() => toggleDept(d.dep_id)}
                      />
                      <span className="text-xs leading-none">{d.dep_name}</span>
                    </label>
                  ))}
                </div>
                {selectedDepts.length > 0 && (
                  <p className="text-[11px] text-brand mt-1.5 font-medium">
                    {selectedDepts.length} department{selectedDepts.length !== 1 ? 's' : ''} selected
                  </p>
                )}
              </div>

              {/* Payment Plan */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400 mb-2">
                  Payment Plan
                  <span className="normal-case font-normal ml-1 text-ink-300">(how students may pay)</span>
                </p>

                <div className="grid grid-cols-3 gap-2 mb-3">
                  {PLAN_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => set('payment_plan', opt.value)}
                      className={`flex flex-col items-center gap-1.5 rounded-xl border-2 px-3 py-3 text-xs font-medium transition-all ${
                        activePlan === opt.value
                          ? 'border-brand bg-brand/10 text-brand dark:bg-brand/20'
                          : 'border-ink-200 dark:border-ink-600 text-ink-500 hover:border-ink-300 dark:hover:border-ink-500'
                      }`}
                    >
                      {opt.icon}
                      <span>{opt.label}</span>
                    </button>
                  ))}
                </div>

                <p className="text-xs text-ink-400 mb-3">
                  {PLAN_OPTIONS.find(o => o.value === activePlan)?.desc}
                </p>

                {activePlan === 'per_installment' && (
                  <div className="mb-3">
                    <label className="block text-xs text-ink-500 mb-1">Number of installments per year</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={2}
                        max={12}
                        className="input input-sm w-24 font-mono"
                        value={installCount}
                        onChange={e => set('installment_count', Math.max(2, Math.min(12, Number(e.target.value))))}
                      />
                      <span className="text-xs text-ink-400">payments / year (2–12)</span>
                    </div>
                  </div>
                )}

                {/* Breakdown preview */}
                {form.amount > 0 && (
                  <div className="rounded-xl border border-ink-200 dark:border-ink-600 overflow-hidden">
                    <div className="bg-ink-50 dark:bg-ink-700/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
                      Payment schedule — {formatRWF(form.amount)} total
                    </div>
                    <div className="divide-y divide-ink-100 dark:divide-ink-700">
                      {breakdown.map((item, i) => (
                        <div key={i} className="flex items-center justify-between px-3 py-2">
                          <span className="text-xs text-ink-500">{item.label}</span>
                          <span className="text-xs font-mono font-semibold text-ink-800 dark:text-ink-100">
                            {formatRWF(item.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                    {activePlan !== 'full_year' && (
                      <div className="bg-brand/5 px-3 py-2 text-[11px] text-brand font-medium">
                        Each payment: {formatRWF(breakdown[0]?.amount ?? 0)}
                        {activePlan === 'per_semester' && ' · Paid once per semester'}
                        {activePlan === 'per_installment' && ` · ${installCount} installments per year`}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-ink-100 dark:border-ink-700 bg-ink-50/50 dark:bg-ink-900/20">
            <button className="btn-ghost btn-sm" onClick={onClose}>Cancel</button>
            <button
              className="btn-primary btn-sm min-w-[110px]"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !form.academic_year_id || !form.label || !form.amount}
            >
              {mutation.isPending
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
                : initial ? 'Save changes' : 'Create structure'
              }
            </button>
          </div>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-ink-500 mb-1">{label}</label>
      {children}
    </div>
  )
}

function BulkImportModal({ onClose, onImport, isLoading }: { onClose: () => void; onImport: (rows: any[]) => void; isLoading: boolean }) {
  const [importFile, setImportFile] = useState<File | null>(null)
  const [parsedRows, setParsedRows] = useState<any[]>([])
  const [errors, setErrors] = useState<any[]>([])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImportFile(file)
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const text = evt.target?.result as string
        const lines = text.split('\n').map(l => l.trim()).filter(l => l)
        if (lines.length < 2) {
          setErrors(['CSV must have at least a header and one data row'])
          setParsedRows([])
          return
        }

        const headers = lines[0].split(',').map(h => h.trim())
        const rows = lines.slice(1).map((line) => {
          const values = line.split(',').map(v => v.trim())
          const row: any = {}
          headers.forEach((h, i) => {
            row[h] = values[i] ?? ''
          })
          return row
        })

        setParsedRows(rows)
        setErrors([])
      } catch (e: any) {
        setErrors([e.message || 'Failed to parse CSV'])
        setParsedRows([])
      }
    }
    reader.readAsText(file)
  }

  return (
    <ModalPortal>
      <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={onClose}>
        <div className="bg-white dark:bg-ink-800 rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div className="p-6 border-b border-ink-100 dark:border-ink-700 flex items-center justify-between">
            <h3 className="font-bold text-ink-900 dark:text-white">Bulk Import Fee Structures</h3>
            <button onClick={onClose} className="text-ink-400 hover:text-ink-600 dark:hover:text-ink-200">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            <div>
              <p className="text-sm text-ink-600 dark:text-ink-300 mb-3">
                Upload a CSV file with the following columns:
              </p>
              <div className="text-xs font-mono bg-ink-50 dark:bg-ink-900 p-3 rounded overflow-x-auto">
                academic_year_label, department_name, level_name, fee_type_code, label, amount, semester, payment_plan, installment_count
              </div>
            </div>

            <div className="border-2 border-dashed border-ink-200 dark:border-ink-600 rounded-lg p-6 text-center">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="hidden"
                id="csv-upload"
                disabled={isLoading}
              />
              <label htmlFor="csv-upload" className="cursor-pointer">
                <Upload className="w-8 h-8 mx-auto mb-2 text-ink-400" />
                <p className="text-sm font-medium text-ink-900 dark:text-white">
                  {importFile ? importFile.name : 'Click to select CSV or drag and drop'}
                </p>
              </label>
            </div>

            {errors.length > 0 && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3">
                {errors.map((err, i) => (
                  <p key={i} className="text-xs text-red-700 dark:text-red-400">{err}</p>
                ))}
              </div>
            )}

            {parsedRows.length > 0 && (
              <div>
                <p className="text-sm text-ink-600 dark:text-ink-300 mb-2">
                  {parsedRows.length} row{parsedRows.length !== 1 ? 's' : ''} ready to import
                </p>
                <div className="overflow-x-auto max-h-[200px] border border-ink-100 dark:border-ink-700 rounded">
                  <table className="w-full text-xs">
                    <thead className="bg-ink-50 dark:bg-ink-900 sticky top-0">
                      <tr>
                        <th className="px-2 py-1 text-left text-ink-500">Department</th>
                        <th className="px-2 py-1 text-left text-ink-500">Fee Type</th>
                        <th className="px-2 py-1 text-right text-ink-500">Amount</th>
                        <th className="px-2 py-1 text-left text-ink-500">Semester</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                      {parsedRows.slice(0, 10).map((row) => (
                        <tr key={`${row.department_name}-${row.fee_type_code}`}>
                          <td className="px-2 py-1 truncate">{row.department_name}</td>
                          <td className="px-2 py-1 truncate">{row.fee_type_code}</td>
                          <td className="px-2 py-1 text-right font-mono">{row.amount}</td>
                          <td className="px-2 py-1">{row.semester || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div className="p-6 border-t border-ink-100 dark:border-ink-700 flex gap-2 justify-end">
            <button className="btn-ghost btn-sm" onClick={onClose} disabled={isLoading}>
              Cancel
            </button>
            <button
              className="btn-primary btn-sm min-w-[110px]"
              onClick={() => onImport(parsedRows)}
              disabled={isLoading || parsedRows.length === 0 || errors.length > 0}
            >
              {isLoading
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Importing…</>
                : `Import ${parsedRows.length} rows`
              }
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
