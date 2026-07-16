import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { GraduationCap, Plus, Pencil, Trash2, X, Info, Archive, ArchiveRestore } from 'lucide-react'
import toast from 'react-hot-toast'
import { pgIntlFeeStructureService, feeTypeService } from '@/services/financeService'
import { academicsMgmtService } from '@/services/academicsMgmtService'
import { academicService as academicSvc } from '@/services/academicService'
import type {
  PgIntlFeeStructure,
  CreatePgIntlFeeStructurePayload,
  PaymentPlan,
  FeeTypeRecord,
  SurchargeType,
} from '@/types/finance'
import { SURCHARGE_TYPES, SURCHARGE_TYPE_LABELS } from '@/types/finance'
import SearchableSelect from '@/components/ui/SearchableSelect'
import ModalPortal from '@/components/ui/ModalPortal'

// ── Types ─────────────────────────────────────────────────────────────────────

interface FormState {
  academic_year_id:   number
  department_id:      number | ''
  level_id:            number | ''
  fee_type:            string
  label:               string
  amount:              string
  currency:            string
  semester:            number | ''
  payment_plan:        PaymentPlan
  installment_count:   string
  nationality_region:  string
  surcharge_type:      SurchargeType
}

const EMPTY: FormState = {
  academic_year_id: 0,
  department_id: '',
  level_id: '',
  fee_type: '',
  label: '',
  amount: '',
  currency: 'USD',
  semester: '',
  payment_plan: 'full_year',
  installment_count: '',
  nationality_region: '',
  surcharge_type: 'none',
}

const SURCHARGE_COLORS: Record<SurchargeType, string> = {
  visa:      'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  insurance: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400',
  other:     'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  none:      'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400',
}

// ── PostgraduateInternationalFeesPage ──────────────────────────────────────────

export default function PostgraduateInternationalFeesPage() {
  const qc = useQueryClient()
  const [yearId, setYearId]       = useState<number | ''>('')
  const [isOpen, setIsOpen]       = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm]           = useState<FormState>(EMPTY)

  // ── Data ──────────────────────────────────────────────────────────────────

  const yearsQ = useQuery({
    queryKey: ['academic', 'years'],
    queryFn: ({ signal }) => academicSvc.listYears(signal),
  })
  const years = yearsQ.data?.data ?? []

  // Reuse existing departements.program_level rather than duplicating that data —
  // only postgraduate departments are relevant for this fee type.
  const deptsQ = useQuery({
    queryKey: ['academics', 'departments'],
    queryFn: () => academicsMgmtService.list<any>('departments', { per_page: 200 }),
  })
  const pgDepartments = (deptsQ.data?.data?.data ?? []).filter(
    (d: any) => d.program_level === 'postgraduate',
  )

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

  const { data: res, isLoading } = useQuery({
    queryKey: ['finance', 'pg-intl-structures', yearId],
    queryFn: ({ signal }) =>
      pgIntlFeeStructureService.list(yearId ? { academic_year_id: Number(yearId) } : {}, signal),
  })
  const rows: PgIntlFeeStructure[] = res?.data ?? []

  // ── Mutations ─────────────────────────────────────────────────────────────

  const saveMut = useMutation<any, any, FormState>({
    mutationFn: (f: FormState) => {
      const payload: CreatePgIntlFeeStructurePayload = {
        academic_year_id:   f.academic_year_id,
        department_id:      f.department_id === '' ? null : Number(f.department_id),
        level_id:            f.level_id === '' ? null : Number(f.level_id),
        fee_type:            f.fee_type,
        label:               f.label.trim(),
        amount:              Number(f.amount),
        currency:            f.currency.trim().toUpperCase() || 'USD',
        semester:            f.semester === '' ? null : (Number(f.semester) as any),
        payment_plan:        f.payment_plan,
        installment_count:   f.installment_count === '' ? null : Number(f.installment_count),
        nationality_region:  f.nationality_region.trim() || null,
        surcharge_type:      f.surcharge_type,
      }
      if (isEditing && editingId !== null) {
        return pgIntlFeeStructureService.update(editingId, payload)
      }
      return pgIntlFeeStructureService.create(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance', 'pg-intl-structures'] })
      toast.success(isEditing ? 'Fee structure updated' : 'Fee structure created')
      closeModal()
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Save failed'),
  })

  const archiveMut = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: 0 | 1 }) =>
      pgIntlFeeStructureService.update(id, { is_active }),
    onSuccess: (_d, vars) => {
      toast.success(vars.is_active ? 'Fee structure restored' : 'Fee structure archived')
      qc.invalidateQueries({ queryKey: ['finance', 'pg-intl-structures'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Update failed'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => pgIntlFeeStructureService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance', 'pg-intl-structures'] })
      toast.success('Fee structure deleted')
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Delete failed'),
  })

  // ── Helpers ───────────────────────────────────────────────────────────────

  function openCreate() {
    setForm({ ...EMPTY, academic_year_id: yearId ? Number(yearId) : (years[0]?.id ?? 0) })
    setIsEditing(false)
    setEditingId(null)
    setIsOpen(true)
  }

  function openEdit(row: PgIntlFeeStructure) {
    setForm({
      academic_year_id:   row.academic_year_id,
      department_id:      row.department_id ?? '',
      level_id:            row.level_id ?? '',
      fee_type:            row.fee_type,
      label:               row.label,
      amount:              String(row.amount),
      currency:            row.currency,
      semester:            row.semester ?? '',
      payment_plan:        row.payment_plan,
      installment_count:   row.installment_count != null ? String(row.installment_count) : '',
      nationality_region:  row.nationality_region ?? '',
      surcharge_type:      row.surcharge_type,
    })
    setIsEditing(true)
    setEditingId(row.id)
    setIsOpen(true)
  }

  function closeModal() {
    setIsOpen(false)
    setEditingId(null)
    setForm(EMPTY)
  }

  function handleDelete(row: PgIntlFeeStructure) {
    if (!confirm(`Delete fee structure '${row.label}'? This cannot be undone.`)) return
    deleteMut.mutate(row.id)
  }

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  const canSubmit =
    form.academic_year_id > 0 && form.fee_type !== '' && form.label.trim() !== '' && form.amount !== ''

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 pb-12">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-ink-900 p-5 rounded-xl border border-ink-200 dark:border-ink-800 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-brand/10 text-brand rounded-lg">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-ink-900 dark:text-ink-50">Postgraduate Fees — International Students</h1>
            <p className="text-xs text-ink-500">Kept separate from the regular fee schedule. Amounts are fixed quoted rates per academic year (no live FX conversion).</p>
          </div>
        </div>
        <button onClick={openCreate} className="btn btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" />
          New Fee
        </button>
      </div>

      {/* Filter bar */}
      <div className="bg-white dark:bg-ink-900 p-4 rounded-xl border border-ink-200 dark:border-ink-800 shadow-sm">
        <div className="max-w-xs space-y-1">
          <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Academic Year</label>
          <SearchableSelect
            options={years.map((y: any) => ({ value: y.id, label: y.label }))}
            value={yearId}
            onChange={(v) => setYearId(v === '' ? '' : Number(v))}
            placeholder="All academic years"
            allLabel="All academic years"
          />
        </div>
      </div>

      {/* Modal */}
      {isOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-sm">
            <div className="flex min-h-full items-start justify-center p-4 pt-16">
              <div className="bg-white dark:bg-ink-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">

                <div className="flex items-center justify-between px-6 py-4 border-b border-ink-100 dark:border-ink-700">
                  <h3 className="text-base font-semibold text-ink-900 dark:text-white">
                    {isEditing ? 'Edit Fee Structure' : 'New Fee Structure'}
                  </h3>
                  <button onClick={closeModal} className="btn-ghost btn-sm p-1.5 rounded-full" aria-label="Close">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form
                  onSubmit={(e) => { e.preventDefault(); if (canSubmit) saveMut.mutate(form) }}
                  className="p-6 space-y-4 max-h-[70vh] overflow-y-auto"
                >
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Academic Year *</label>
                    <SearchableSelect
                      options={years.map((y: any) => ({ value: y.id, label: y.label }))}
                      value={form.academic_year_id}
                      onChange={(v) => set('academic_year_id', Number(v))}
                      placeholder="Select academic year"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Postgraduate Department</label>
                      <SearchableSelect
                        options={pgDepartments.map((d: any) => ({ value: d.dep_id, label: d.dep_name }))}
                        value={form.department_id}
                        onChange={(v) => set('department_id', v === '' ? '' : Number(v))}
                        placeholder="All departments"
                        allLabel="All departments"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Level</label>
                      <SearchableSelect
                        options={levels.map((l: any) => ({ value: l.id, label: l.name }))}
                        value={form.level_id}
                        onChange={(v) => set('level_id', v === '' ? '' : Number(v))}
                        placeholder="All levels"
                        allLabel="All levels"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Fee Type *</label>
                      <select
                        required
                        className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700"
                        value={form.fee_type}
                        onChange={(e) => set('fee_type', e.target.value)}
                      >
                        <option value="">Select fee type</option>
                        {feeTypeOptions.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Surcharge Type</label>
                      <select
                        className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700"
                        value={form.surcharge_type}
                        onChange={(e) => set('surcharge_type', e.target.value as SurchargeType)}
                      >
                        {SURCHARGE_TYPES.map((s) => (
                          <option key={s} value={s}>{SURCHARGE_TYPE_LABELS[s]}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Label *</label>
                    <input
                      required
                      type="text"
                      className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700"
                      placeholder="e.g. MSc Tuition — International"
                      value={form.label}
                      onChange={(e) => set('label', e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Amount *</label>
                      <input
                        required
                        type="number"
                        min="0"
                        step="0.01"
                        className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700"
                        value={form.amount}
                        onChange={(e) => set('amount', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Currency</label>
                      <input
                        type="text"
                        maxLength={10}
                        className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700 uppercase"
                        placeholder="USD"
                        value={form.currency}
                        onChange={(e) => set('currency', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Nationality / Region</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700"
                      placeholder="e.g. East Africa, SADC — leave blank for all"
                      value={form.nationality_region}
                      onChange={(e) => set('nationality_region', e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Semester</label>
                      <select
                        className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700"
                        value={form.semester}
                        onChange={(e) => set('semester', e.target.value === '' ? '' : Number(e.target.value))}
                      >
                        <option value="">Full year</option>
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                          <option key={s} value={s}>Semester {s}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Payment Plan</label>
                      <select
                        className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700"
                        value={form.payment_plan}
                        onChange={(e) => set('payment_plan', e.target.value as PaymentPlan)}
                      >
                        <option value="full_year">Full year</option>
                        <option value="per_semester">Per semester</option>
                        <option value="per_installment">Per installment</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Installments</label>
                      <input
                        type="number"
                        min="1"
                        disabled={form.payment_plan !== 'per_installment'}
                        className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700 disabled:opacity-50"
                        value={form.installment_count}
                        onChange={(e) => set('installment_count', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-2 border-t border-ink-100 dark:border-ink-700">
                    <button type="button" onClick={closeModal} className="btn btn-secondary text-sm px-5">
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary text-sm px-7"
                      disabled={saveMut.isPending || !canSubmit}
                    >
                      {saveMut.isPending ? 'Saving…' : isEditing ? 'Update' : 'Create'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-4 bg-ink-100 dark:bg-ink-800 rounded w-full animate-pulse" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-ink-400 italic text-sm">
            No postgraduate international fee structures found{yearId ? ' for this academic year' : ''}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ink-50/60 dark:bg-ink-800/60 text-ink-500 dark:text-ink-400 text-xs">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Label</th>
                  <th className="text-left px-4 py-3 font-semibold">Department</th>
                  <th className="text-left px-4 py-3 font-semibold">Nationality/Region</th>
                  <th className="text-left px-4 py-3 font-semibold">Surcharge</th>
                  <th className="text-right px-4 py-3 font-semibold">Amount</th>
                  <th className="text-center px-4 py-3 font-semibold">Status</th>
                  <th className="text-right px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-ink-50/40 dark:hover:bg-ink-800/40 transition-colors group">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink-900 dark:text-ink-50">{row.label}</p>
                      <p className="text-xs text-ink-400">{row.fee_type} · {row.academic_year_label ?? `Year #${row.academic_year_id}`}</p>
                    </td>
                    <td className="px-4 py-3 text-ink-600 dark:text-ink-300">{row.department_name ?? 'All departments'}</td>
                    <td className="px-4 py-3 text-ink-600 dark:text-ink-300">{row.nationality_region ?? 'All'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${SURCHARGE_COLORS[row.surcharge_type]}`}>
                        {SURCHARGE_TYPE_LABELS[row.surcharge_type]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-ink-900 dark:text-ink-50">
                      {row.currency} {Number(row.amount).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        row.is_active
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                          : 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400'
                      }`}>
                        {row.is_active ? 'Active' : 'Archived'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEdit(row)}
                          className="p-1.5 text-brand hover:bg-brand/10 rounded-md transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => archiveMut.mutate({ id: row.id, is_active: row.is_active ? 0 : 1 })}
                          className="p-1.5 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-md transition-colors"
                          title={row.is_active ? 'Archive' : 'Restore'}
                        >
                          {row.is_active ? <Archive className="w-3.5 h-3.5" /> : <ArchiveRestore className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => handleDelete(row)}
                          className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                          title="Delete"
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
        )}
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 rounded-xl text-sm border border-amber-200 dark:border-amber-800">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <p>
          This table is kept deliberately separate from the regular Fee Rates schedule per the client's request.
          Amounts are stored and displayed as fixed quoted rates per academic year — pending Finance confirmation, live FX conversion is not applied.
        </p>
      </div>
    </div>
  )
}
