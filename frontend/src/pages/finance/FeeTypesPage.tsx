import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Tag, Plus, Pencil, Trash2, Search, Info, ToggleLeft, ToggleRight, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { feeTypeService } from '@/services/financeService'
import type { FeeTypeRecord, CreateFeeTypePayload, UpdateFeeTypePayload } from '@/types/finance'
import ModalPortal from '@/components/ui/ModalPortal'

// ── Types ─────────────────────────────────────────────────────────────────────

interface FormState {
  code:        string
  label:       string
  description: string
  is_active:   boolean
  sort_order:  number
}

const EMPTY: FormState = { code: '', label: '', description: '', is_active: true, sort_order: 0 }

// ── FeeTypesPage ──────────────────────────────────────────────────────────────

export default function FeeTypesPage() {
  const qc = useQueryClient()
  const [search, setSearch]         = useState('')
  const [isOpen, setIsOpen]         = useState(false)
  const [isEditing, setIsEditing]   = useState(false)
  const [editingId, setEditingId]   = useState<number | null>(null)
  const [form, setForm]             = useState<FormState>(EMPTY)

  // ── Data ──────────────────────────────────────────────────────────────────

  const { data: res, isLoading } = useQuery({
    queryKey: ['finance', 'fee-types'],
    queryFn: ({ signal }) => feeTypeService.list(signal),
  })
  const allTypes: FeeTypeRecord[] = res?.data ?? []
  const filtered = allTypes.filter(
    (t) =>
      String(t.code || '').toLowerCase().includes(search.toLowerCase()) ||
      String(t.label || '').toLowerCase().includes(search.toLowerCase()) ||
      String(t.description || '').toLowerCase().includes(search.toLowerCase()),
  )

  // ── Mutations ─────────────────────────────────────────────────────────────

  const saveMut = useMutation<any, any, FormState>({
    mutationFn: (f: FormState) => {
      if (isEditing && editingId !== null) {
        const payload: UpdateFeeTypePayload = {
          label:       f.label.trim(),
          description: f.description.trim() || null,
          is_active:   f.is_active ? 1 : 0,
          sort_order:  f.sort_order,
        }
        return feeTypeService.update(editingId, payload)
      }
      const payload: CreateFeeTypePayload = {
        code:        f.code.trim().toUpperCase(),
        label:       f.label.trim(),
        description: f.description.trim() || undefined,
        is_active:   f.is_active ? 1 : 0,
        sort_order:  f.sort_order,
      }
      return feeTypeService.create(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance', 'fee-types'] })
      toast.success(isEditing ? 'Fee type updated' : 'Fee type created')
      closeModal()
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? 'Save failed'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => feeTypeService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance', 'fee-types'] })
      toast.success('Fee type deleted')
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? 'Delete failed'),
  })

  // ── Helpers ───────────────────────────────────────────────────────────────

  function openCreate() {
    setForm(EMPTY)
    setIsEditing(false)
    setEditingId(null)
    setIsOpen(true)
  }

  function openEdit(t: FeeTypeRecord) {
    setForm({
      code:        t.code,
      label:       t.label,
      description: t.description ?? '',
      is_active:   t.is_active === 1,
      sort_order:  t.sort_order,
    })
    setIsEditing(true)
    setEditingId(t.id)
    setIsOpen(true)
  }

  function closeModal() {
    setIsOpen(false)
    setEditingId(null)
    setForm(EMPTY)
  }

  function handleDelete(t: FeeTypeRecord) {
    const inUse = t.structure_count + t.invoice_count
    if (inUse > 0) {
      toast.error(`Cannot delete '${t.code}': referenced by ${inUse} record(s).`)
      return
    }
    if (!confirm(`Delete fee type '${t.code}'? This cannot be undone.`)) return
    deleteMut.mutate(t.id)
  }

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 pb-12">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-ink-900 p-5 rounded-xl border border-ink-200 dark:border-ink-800 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-brand/10 text-brand rounded-lg">
            <Tag className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-ink-900 dark:text-ink-50">Fee Types</h1>
            <p className="text-xs text-ink-500">Manage categories used to classify fees across the system.</p>
          </div>
        </div>
        <button onClick={openCreate} className="btn btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" />
          New Fee Type
        </button>
      </div>

      {/* Modal */}
      {isOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-sm">
            <div className="flex min-h-full items-start justify-center p-4 pt-16">
              <div className="bg-white dark:bg-ink-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">

                {/* Modal header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-ink-100 dark:border-ink-700">
                  <h3 className="text-base font-semibold text-ink-900 dark:text-white">
                    {isEditing ? 'Edit Fee Type' : 'New Fee Type'}
                  </h3>
                  <button onClick={closeModal} className="btn-ghost btn-sm p-1.5 rounded-full" aria-label="Close">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Modal body */}
                <form
                  onSubmit={(e) => { e.preventDefault(); saveMut.mutate(form) }}
                  className="p-6 space-y-4"
                >
                  {/* Code */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">
                      Code *{isEditing && <span className="ml-1 text-ink-400 font-normal">(immutable)</span>}
                    </label>
                    <input
                      required
                      type="text"
                      disabled={isEditing}
                      className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand/40 disabled:opacity-50 disabled:cursor-not-allowed border border-ink-200 dark:border-ink-700"
                      placeholder="e.g. LABORATORY_FEE"
                      value={form.code}
                      onChange={(e) =>
                        set('code', e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))
                      }
                    />
                    {!isEditing && (
                      <p className="text-[11px] text-ink-400">Uppercase letters, digits, underscores only. Cannot be changed after creation.</p>
                    )}
                  </div>

                  {/* Label */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Label *</label>
                    <input
                      required
                      autoFocus={isEditing}
                      type="text"
                      className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700"
                      placeholder="e.g. Laboratory Fee"
                      value={form.label}
                      onChange={(e) => set('label', e.target.value)}
                    />
                  </div>

                  {/* Description */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Description</label>
                    <textarea
                      rows={2}
                      className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 resize-none border border-ink-200 dark:border-ink-700"
                      placeholder="Optional — purpose of this fee type"
                      value={form.description}
                      onChange={(e) => set('description', e.target.value)}
                    />
                  </div>

                  {/* Sort Order + Active */}
                  <div className="flex gap-4 items-end">
                    <div className="space-y-1 flex-1">
                      <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Sort Order</label>
                      <input
                        type="number"
                        min={0}
                        className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 border border-ink-200 dark:border-ink-700"
                        value={form.sort_order}
                        onChange={(e) => set('sort_order', parseInt(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Status</label>
                      <button
                        type="button"
                        onClick={() => set('is_active', !form.is_active)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${
                          form.is_active
                            ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800'
                            : 'bg-ink-50 text-ink-500 border-ink-200 dark:bg-ink-900 dark:text-ink-400 dark:border-ink-700'
                        }`}
                      >
                        {form.is_active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                        {form.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </div>
                  </div>

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
              placeholder="Search fee types…"
              className="w-full pl-9 pr-4 py-2 bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-ink-50/60 dark:bg-ink-800/60 border-b border-ink-200 dark:border-ink-800">
                <th className="px-5 py-3 font-semibold text-ink-500 text-xs uppercase tracking-wide">#</th>
                <th className="px-5 py-3 font-semibold text-ink-500 text-xs uppercase tracking-wide">Code</th>
                <th className="px-5 py-3 font-semibold text-ink-500 text-xs uppercase tracking-wide">Label</th>
                <th className="px-5 py-3 font-semibold text-ink-500 text-xs uppercase tracking-wide hidden md:table-cell">Description</th>
                <th className="px-5 py-3 font-semibold text-ink-500 text-xs uppercase tracking-wide text-center">Status</th>
                <th className="px-5 py-3 font-semibold text-ink-500 text-xs uppercase tracking-wide text-center">In Use</th>
                <th className="px-5 py-3 font-semibold text-ink-500 text-xs uppercase tracking-wide text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={7} className="px-5 py-4">
                        <div className="h-4 bg-ink-100 dark:bg-ink-800 rounded w-full" />
                      </td>
                    </tr>
                  ))
                : filtered.length === 0
                ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-ink-400 italic text-sm">
                      No fee types found.
                    </td>
                  </tr>
                )
                : filtered.map((t, idx) => {
                    const inUse = t.structure_count + t.invoice_count
                    return (
                      <tr
                        key={t.id}
                        className="hover:bg-ink-50/40 dark:hover:bg-ink-800/40 transition-colors group"
                      >
                        <td className="px-5 py-3.5 text-ink-400 text-xs font-mono">{idx + 1}</td>
                        <td className="px-5 py-3.5">
                          <span className="font-mono font-bold text-xs text-brand dark:text-gold-400 bg-brand/5 dark:bg-gold-400/10 px-2 py-0.5 rounded">
                            {t.code}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 font-semibold text-ink-900 dark:text-ink-50">{t.label}</td>
                        <td className="px-5 py-3.5 text-ink-500 hidden md:table-cell max-w-xs truncate">
                          {t.description || <span className="text-ink-300 dark:text-ink-600">—</span>}
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            t.is_active
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                              : 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400'
                          }`}>
                            {t.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            inUse > 0
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'
                              : 'bg-ink-100 text-ink-400 dark:bg-ink-800 dark:text-ink-500'
                          }`}>
                            {inUse} record{inUse !== 1 ? 's' : ''}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => openEdit(t)}
                              className="p-1.5 text-brand hover:bg-brand/10 rounded-md transition-colors"
                              title="Edit"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(t)}
                              disabled={inUse > 0}
                              className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                              title={inUse > 0 ? 'In use — cannot delete' : 'Delete'}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 rounded-xl text-sm border border-amber-200 dark:border-amber-800">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <p>
          Fee type <strong>codes are permanent</strong> — they are stored in fee structures, invoices, and payment records.
          Only the label, description, status, and sort order can be changed after creation.
          A fee type cannot be deleted while it is referenced by any existing records.
        </p>
      </div>
    </div>
  )
}
