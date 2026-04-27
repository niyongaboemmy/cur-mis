import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { feeStructureService } from '@/services/financeService'
import { academicsMgmtService } from '@/services/academicsMgmtService'
import { academicService as academicSvc } from '@/services/academicService'
import type { FeeStructure, CreateFeeStructurePayload } from '@/types/finance'
import { FEE_TYPE_LABELS } from '@/types/finance'
import SearchableSelect from '@/components/ui/SearchableSelect'
import Pagination from '@/components/ui/Pagination'
import { useSystemStore } from '@/store/systemStore'

import { formatRWF } from '@/utils/formatCurrency'

const FEE_TYPES: [string, string][] = Object.entries(FEE_TYPE_LABELS).filter(
  ([k]) => !['ARREARS', 'BURSARY_CREDIT'].includes(k)
)

const PER_PAGE = 15

export default function FeeStructuresPage() {
  const qc = useQueryClient()
  const basics = useSystemStore((s) => s.basics)
  const selectedYearLabel = useSystemStore((s) => s.selectedYearLabel)

  const [yearId, setYearId]   = useState<number | string>('')
  const [page, setPage]       = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing]  = useState<FeeStructure | null>(null)

  // Sync with global academic year
  useEffect(() => {
    if (selectedYearLabel) {
      const year = basics?.years?.find((y) => y.label === selectedYearLabel);
      if (year) {
        setYearId(year.id);
      }
    } else {
      // Fallback to active year if "All years" is selected but we need a default
      const active = basics?.active_year as any;
      if (active?.id) setYearId(active.id);
    }
  }, [selectedYearLabel, basics?.years]);


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

  const structuresQ = useQuery({
    queryKey: ['finance', 'structures', yearId],
    queryFn: () => feeStructureService.list(yearId ? { academic_year_id: Number(yearId) } : {}),
    enabled: !!yearId,
  })
  const allRows: FeeStructure[] = structuresQ.data?.data ?? []

  // Client-side pagination (structures per year is usually small)
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

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-ink-900 dark:text-white">Fee Structures</h2>
          <p className="text-[13px] text-ink-500">Configure fee amounts per type, department, level and academic year.</p>
        </div>
        <button className="btn-primary btn-sm" onClick={() => { setEditing(null); setShowForm(true) }}>
          <Plus className="w-3.5 h-3.5" /> New structure
        </button>
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
                      <td className="px-4 py-2.5 text-ink-500">{(FEE_TYPE_LABELS as Record<string, string>)[row.fee_type] ?? row.fee_type}</td>
                      <td className="px-4 py-2.5 text-ink-500">{row.department_name ?? <span className="italic text-ink-300">All</span>}</td>
                      <td className="px-4 py-2.5 text-ink-500">{row.level_name ?? <span className="italic text-ink-300">All</span>}</td>
                      <td className="px-4 py-2.5 text-ink-500">{row.semester ?? '—'}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold">{formatRWF(row.amount)}</td>
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
          initial={editing}
          defaultYearId={yearId ? Number(yearId) : undefined}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false)
            qc.invalidateQueries({ queryKey: ['finance', 'structures'] })
          }}
        />
      )}
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

interface ModalProps {
  years:        any[]
  departments:  any[]
  levels:       any[]
  initial:      FeeStructure | null
  defaultYearId?: number
  onClose:      () => void
  onSaved:      () => void
}

function FeeStructureModal({ years, departments, levels, initial, defaultYearId, onClose, onSaved }: ModalProps) {
  const [form, setForm] = useState<CreateFeeStructurePayload & { is_active: 0 | 1 }>({
    academic_year_id: initial?.academic_year_id ?? defaultYearId ?? 0,
    department_id:    initial?.department_id ?? null,
    level_id:         initial?.level_id ?? null,
    fee_type:         (initial?.fee_type ?? 'TUITION') as string,
    label:            initial?.label ?? '',
    amount:           initial?.amount ?? 0,
    semester:         initial?.semester ?? null,
    is_active:        (initial?.is_active ?? 1) as 0 | 1,
  })

  const yearOptions = years.map((y: any) => ({ value: y.id, label: y.label }))
  const deptOptions = departments.map((d: any) => ({ value: d.dep_id, label: d.dep_name }))
  const levelOptions = levels.map((l: any) => ({ value: l.id, label: l.name }))
  const feeTypeOptions = FEE_TYPES.map(([k, v]) => ({ value: k, label: v }))

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

  const set = (k: keyof typeof form, v: any) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="bg-white dark:bg-ink-800 rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
          <h3 className="text-base font-semibold">{initial ? 'Edit' : 'New'} Fee Structure</h3>

          <div className="space-y-3 text-sm">
            <Field label="Academic Year *">
              <SearchableSelect
                options={yearOptions}
                value={form.academic_year_id}
                onChange={v => set('academic_year_id', Number(v))}
                placeholder="Select year…"
              />
            </Field>

            <Field label="Fee Type *">
              <SearchableSelect
                options={feeTypeOptions}
                value={form.fee_type}
                onChange={v => set('fee_type', String(v))}
                placeholder="Select fee type…"
              />
            </Field>

            <Field label="Label *">
              <input className="input input-sm w-full" value={form.label} onChange={e => set('label', e.target.value)} placeholder="e.g. Tuition Y1 S1" />
            </Field>

            <Field label="Amount (RWF) *">
              <input type="number" className="input input-sm w-full" value={form.amount} onChange={e => set('amount', Number(e.target.value))} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Department (optional)">
                <SearchableSelect
                  options={deptOptions}
                  value={form.department_id ?? ''}
                  onChange={v => set('department_id', v ? Number(v) : null)}
                  placeholder="All departments"
                  allLabel="All departments"
                />
              </Field>

              <Field label="Level (optional)">
                <SearchableSelect
                  options={levelOptions}
                  value={form.level_id ?? ''}
                  onChange={v => set('level_id', v ? Number(v) : null)}
                  placeholder="All levels"
                  allLabel="All levels"
                />
              </Field>
            </div>

            <Field label="Semester (optional)">
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

            {initial && (
              <Field label="Active">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <div className="relative">
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={form.is_active === 1}
                      onChange={e => set('is_active', e.target.checked ? 1 : 0)}
                    />
                    <div className={`w-9 h-5 rounded-full transition-colors ${
                      form.is_active === 1
                        ? 'bg-green-500'
                        : 'bg-ink-300 dark:bg-ink-600'
                    }`} />
                    <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                      form.is_active === 1 ? 'translate-x-4' : 'translate-x-0'
                    }`} />
                  </div>
                  <span className={`text-sm font-medium ${
                    form.is_active === 1 ? 'text-green-600' : 'text-ink-400'
                  }`}>
                    {form.is_active === 1 ? 'Active' : 'Inactive'}
                  </span>
                </label>
              </Field>
            )}
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <button className="btn-ghost btn-sm" onClick={onClose}>Cancel</button>
            <button
              className="btn-primary btn-sm"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !form.academic_year_id || !form.label || !form.amount}
            >
              {mutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {initial ? 'Save changes' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
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
