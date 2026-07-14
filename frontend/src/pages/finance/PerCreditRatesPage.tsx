import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Layers, Plus, Pencil, Trash2, Search, Info, ToggleLeft, ToggleRight, X, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { academicService } from '@/services/academicService'
import { academicsMgmtService } from '@/services/academicsMgmtService'
import { api } from '@/services/api'
import { formatRWF } from '@/utils/formatCurrency'
import SearchableSelect from '@/components/ui/SearchableSelect'
import ModalPortal from '@/components/ui/ModalPortal'
import { useSystemStore } from '@/store/systemStore'

interface PerCreditRate {
  id: number
  academic_year_id: number
  faculty_id: number
  amount_per_credit: number
  is_active: 0 | 1
  academic_year_label: string
  faculty_name: string
}

interface FormState {
  academic_year_id: number | string
  faculty_id: number | string
  amount_per_credit: number | string
  is_active: boolean
}

const EMPTY: FormState = { academic_year_id: '', faculty_id: '', amount_per_credit: '', is_active: true }

// Service for per-credit rates
const perCreditRateService = {
  list: (params?: any) => api.get('/api/finance/per-credit-rates', { params }),
  create: (data: any) => api.post('/api/finance/per-credit-rates', data),
  update: (id: number, data: any) => api.put(`/api/finance/per-credit-rates/${id}`, data),
  delete: (id: number) => api.delete(`/api/finance/per-credit-rates/${id}`),
}

export default function PerCreditRatesPage() {
  const qc = useQueryClient()
  const selectedYearLabel = useSystemStore((s) => s.selectedYearLabel)
  const basics = useSystemStore((s) => s.basics)

  const [search, setSearch] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [selectedYearId, setSelectedYearId] = useState<number | string>('')
  const [form, setForm] = useState<FormState>(EMPTY)

  // Sync with global academic year
  useEffect(() => {
    if (selectedYearLabel) {
      const year = basics?.years?.find((y: any) => y.label === selectedYearLabel)
      if (year) setSelectedYearId(year.id)
    } else {
      const active = basics?.active_year as any
      if (active?.id) setSelectedYearId(active.id)
    }
  }, [selectedYearLabel, basics?.years])

  // Fetch academic years
  const yearsQ = useQuery({
    queryKey: ['academic-years'],
    queryFn: () => academicService.listYears(),
  })
  const years = yearsQ.data?.data ?? []
  const yearOptions = years.map((y: any) => ({ value: y.id, label: y.label }))

  // Fetch faculties
  const facultiesQ = useQuery({
    queryKey: ['academics', 'faculties'],
    queryFn: () => academicsMgmtService.list<any>('faculties', { per_page: 100 }),
  })
  const faculties = facultiesQ.data?.data?.data ?? []
  const facultyOptions = faculties
    .filter((f: any) => f.fac_id && f.fac_name)
    .map((f: any) => ({ value: f.fac_id, label: f.fac_name }))

  // Fetch per-credit rates
  const ratesQ = useQuery({
    queryKey: ['finance', 'per-credit-rates', selectedYearId],
    queryFn: () =>
      perCreditRateService.list(selectedYearId ? { academic_year_id: selectedYearId } : {}),
    enabled: !!selectedYearId,
  })
  const allRates = (ratesQ.data?.data as PerCreditRate[]) ?? []
  const filtered = allRates.filter(
    (r) =>
      String(r.faculty_name || '').toLowerCase().includes(search.toLowerCase()) ||
      String(r.amount_per_credit || '').includes(search),
  )

  // Mutations
  const saveMut = useMutation<any, any, FormState>({
    mutationFn: (f: FormState) => {
      const payload = {
        academic_year_id: Number(f.academic_year_id),
        faculty_id: Number(f.faculty_id),
        amount_per_credit: Number(f.amount_per_credit),
        is_active: f.is_active ? 1 : 0,
      }
      if (isEditing && editingId !== null) {
        return perCreditRateService.update(editingId, payload)
      }
      return perCreditRateService.create(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance', 'per-credit-rates'] })
      toast.success(isEditing ? 'Per-credit rate updated' : 'Per-credit rate created')
      closeModal()
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Save failed'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => perCreditRateService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance', 'per-credit-rates'] })
      toast.success('Per-credit rate deleted')
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Delete failed'),
  })

  // Helpers
  function openCreate() {
    setForm({ ...EMPTY, academic_year_id: selectedYearId })
    setIsEditing(false)
    setEditingId(null)
    setIsOpen(true)
  }

  function openEdit(r: PerCreditRate) {
    setForm({
      academic_year_id: r.academic_year_id,
      faculty_id: r.faculty_id,
      amount_per_credit: r.amount_per_credit,
      is_active: r.is_active === 1,
    })
    setIsEditing(true)
    setEditingId(r.id)
    setIsOpen(true)
  }

  function closeModal() {
    setIsOpen(false)
    setEditingId(null)
    setForm(EMPTY)
  }

  function handleDelete(r: PerCreditRate) {
    if (!confirm(`Delete per-credit rate for ${r.faculty_name}? This cannot be undone.`)) return
    deleteMut.mutate(r.id)
  }

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  return (
    <div className="space-y-4 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-ink-900 p-5 rounded-xl border border-ink-200 dark:border-ink-800 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-brand/10 text-brand rounded-lg">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-ink-900 dark:text-ink-50">Per-Credit Rates</h1>
            <p className="text-xs text-ink-500">
              Set retake and part-time module charges per faculty and academic year.
            </p>
          </div>
        </div>
        <button onClick={openCreate} className="btn btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" />
          New Rate
        </button>
      </div>

      {/* Year filter */}
      <div className="card p-3 flex gap-3 items-end flex-wrap">
        <div className="min-w-[200px]">
          <label className="block text-xs text-ink-500 mb-1">Academic Year</label>
          <SearchableSelect
            options={yearOptions}
            value={selectedYearId}
            onChange={(v) => setSelectedYearId(v)}
            placeholder="Select year…"
          />
        </div>
      </div>

      {/* Modal */}
      {isOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-sm">
            <div className="flex min-h-full items-start justify-center p-4 pt-16">
              <div className="bg-white dark:bg-ink-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                {/* Modal header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-ink-100 dark:border-ink-700">
                  <h3 className="text-base font-semibold text-ink-900 dark:text-white">
                    {isEditing ? 'Edit Per-Credit Rate' : 'New Per-Credit Rate'}
                  </h3>
                  <button
                    onClick={closeModal}
                    className="btn-ghost btn-sm p-1.5 rounded-full"
                    aria-label="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Modal body */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    saveMut.mutate(form)
                  }}
                  className="p-6 space-y-4"
                >
                  {/* Academic Year */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">
                      Academic Year *
                    </label>
                    <SearchableSelect
                      options={yearOptions}
                      value={form.academic_year_id}
                      onChange={(v) => set('academic_year_id', v)}
                      placeholder="Select year…"
                    />
                  </div>

                  {/* Faculty */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">
                      Faculty *
                    </label>
                    <SearchableSelect
                      options={facultyOptions}
                      value={form.faculty_id}
                      onChange={(v) => set('faculty_id', v)}
                      placeholder="Select faculty…"
                    />
                  </div>

                  {/* Amount per credit */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">
                      Amount per Credit (RWF) *
                    </label>
                    <input
                      required
                      type="number"
                      min={0}
                      step="0.01"
                      className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700"
                      placeholder="e.g. 4000"
                      value={form.amount_per_credit}
                      onChange={(e) => set('amount_per_credit', e.target.value)}
                    />
                    {form.amount_per_credit && Number(form.amount_per_credit) > 0 && (
                      <p className="text-[11px] text-ink-400 mt-1">
                        = {formatRWF(Number(form.amount_per_credit))} per credit
                      </p>
                    )}
                  </div>

                  {/* Status */}
                  {isEditing && (
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">
                        Status
                      </label>
                      <button
                        type="button"
                        onClick={() => set('is_active', !form.is_active)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors border w-full justify-center ${
                          form.is_active
                            ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800'
                            : 'bg-ink-50 text-ink-500 border-ink-200 dark:bg-ink-900 dark:text-ink-400 dark:border-ink-700'
                        }`}
                      >
                        {form.is_active ? (
                          <ToggleRight className="w-4 h-4" />
                        ) : (
                          <ToggleLeft className="w-4 h-4" />
                        )}
                        {form.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </div>
                  )}

                  {/* Footer */}
                  <div className="flex justify-end gap-3 pt-2 border-t border-ink-100 dark:border-ink-700">
                    <button type="button" onClick={closeModal} className="btn btn-secondary text-sm px-5">
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary text-sm px-7"
                      disabled={saveMut.isPending}
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
        {/* Search bar */}
        <div className="p-4 border-b border-ink-100 dark:border-ink-800">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search rates…"
              className="w-full pl-9 pr-4 py-2 bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {!selectedYearId && !ratesQ.isLoading && (
          <p className="text-center py-10 text-ink-400 text-sm">Select an academic year to view per-credit rates.</p>
        )}
        {ratesQ.isLoading && selectedYearId && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-brand" />
          </div>
        )}
        {selectedYearId && !ratesQ.isLoading && allRates.length === 0 && (
          <p className="text-center py-10 text-ink-400 text-sm">
            No per-credit rates configured for this year yet.
          </p>
        )}

        {filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-ink-50/60 dark:bg-ink-800/60 border-b border-ink-200 dark:border-ink-800">
                  <th className="px-5 py-3 font-semibold text-ink-500 text-xs uppercase tracking-wide">Faculty</th>
                  <th className="px-5 py-3 font-semibold text-ink-500 text-xs uppercase tracking-wide text-right">
                    Amount/Credit (RWF)
                  </th>
                  <th className="px-5 py-3 font-semibold text-ink-500 text-xs uppercase tracking-wide text-center">
                    Status
                  </th>
                  <th className="px-5 py-3 font-semibold text-ink-500 text-xs uppercase tracking-wide text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-ink-50/40 dark:hover:bg-ink-800/40 transition-colors group">
                    <td className="px-5 py-3.5 font-semibold text-ink-900 dark:text-ink-50">{r.faculty_name}</td>
                    <td className="px-5 py-3.5 text-right font-mono font-semibold">
                      {formatRWF(r.amount_per_credit)}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          r.is_active
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                            : 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400'
                        }`}
                      >
                        {r.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEdit(r)}
                          className="p-1.5 text-brand hover:bg-brand/10 rounded-md transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(r)}
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
          Per-credit rates are applied to retake and part-time modules per faculty. Set one rate per faculty per
          academic year. These rates are used when billing students for additional credits outside the standard program.
        </p>
      </div>
    </div>
  )
}
