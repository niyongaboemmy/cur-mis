import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, Plus, Search, X, ChevronLeft, ChevronRight,
  CheckCircle2, XCircle, FileText, Pencil, Trash2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  finesService,
  type Fine, type FineType, type FineStatus, type CreateFinePayload,
} from '@/services/financeService'
import ModalPortal from '@/components/ui/ModalPortal'
import { PERMISSIONS } from '@/constants'
import { usePermission } from '@/utils/permissions'

// ── Constants ─────────────────────────────────────────────────────────────────

const FINE_TYPES: { value: FineType; label: string }[] = [
  { value: 'LATE_SUBMISSION',   label: 'Late Submission'     },
  { value: 'LOST_ID_CARD',      label: 'Lost ID Card'        },
  { value: 'LIBRARY_FINE',      label: 'Library Fine'        },
  { value: 'LATE_REGISTRATION', label: 'Late Registration'   },
  { value: 'ACADEMIC_DOCUMENT', label: 'Academic Document'   },
  { value: 'OTHER',             label: 'Other'               },
]

const STATUS_COLORS: Record<FineStatus, string> = {
  pending:  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  invoiced: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  waived:   'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400',
  paid:     'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
}

function fmtAmt(n: number | string) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 0 }) + ' RWF'
}

// ── Form state ─────────────────────────────────────────────────────────────────

interface FormState {
  student_id: string
  fine_type:  FineType
  reason:     string
  amount:     string
  notes:      string
}
const EMPTY_FORM: FormState = {
  student_id: '', fine_type: 'OTHER', reason: '', amount: '', notes: '',
}

// ── FinesManagementPage ───────────────────────────────────────────────────────

export default function FinesManagementPage() {
  const canManage = usePermission(PERMISSIONS.MANAGE_FINES)
  const qc = useQueryClient()

  // Filters
  const [search,   setSearch]   = useState('')
  const [status,   setStatus]   = useState<FineStatus | ''>('')
  const [fineType, setFineType] = useState<FineType | ''>('')
  const [page,     setPage]     = useState(1)

  // Create / edit modal
  const [isOpen,     setIsOpen]     = useState(false)
  const [isEditing,  setIsEditing]  = useState(false)
  const [editingId,  setEditingId]  = useState<number | null>(null)
  const [form,       setForm]       = useState<FormState>(EMPTY_FORM)

  // Waive modal
  const [waiveId,     setWaiveId]     = useState<number | null>(null)
  const [waiveReason, setWaiveReason] = useState('')

  // ── Data ──────────────────────────────────────────────────────────────────

  const { data: res, isLoading } = useQuery({
    queryKey: ['fines', 'list', { search, status, fineType, page }],
    queryFn:  ({ signal }) =>
      finesService.list({
        search:    search || undefined,
        status:    (status as FineStatus)    || undefined,
        fine_type: (fineType as FineType)   || undefined,
        page,
        per_page: 20,
      }, signal),
    placeholderData: (prev) => prev,
  })

  const fines:   Fine[]  = res?.data?.data    ?? []
  const total:   number  = res?.data?.total   ?? 0
  const lastPage: number = res?.data?.last_page ?? 1
  const summary          = res?.data?.summary

  // ── Mutations ─────────────────────────────────────────────────────────────

  const saveMut = useMutation<any, any, FormState>({
    mutationFn: (f: FormState) => {
      if (isEditing && editingId !== null) {
        return finesService.update(editingId, {
          fine_type: f.fine_type,
          reason:    f.reason,
          notes:     f.notes,
        })
      }
      const payload: CreateFinePayload = {
        student_id: f.student_id.trim(),
        fine_type:  f.fine_type,
        reason:     f.reason.trim(),
        amount:     parseFloat(f.amount),
        notes:      f.notes.trim() || undefined,
      }
      return finesService.create(payload)
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['fines'] })
      toast.success(
        isEditing
          ? 'Fine updated'
          : `Fine issued — Invoice ${(res as any)?.data?.invoice_number ?? ''}`,
      )
      closeModal()
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Save failed'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => finesService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fines'] })
      toast.success('Fine deleted')
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Delete failed'),
  })

  const waiveMut = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      finesService.waive(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fines'] })
      toast.success('Fine waived')
      setWaiveId(null)
      setWaiveReason('')
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Waive failed'),
  })

  // ── Helpers ───────────────────────────────────────────────────────────────

  function openCreate() {
    setForm(EMPTY_FORM)
    setIsEditing(false)
    setEditingId(null)
    setIsOpen(true)
  }

  function openEdit(fine: Fine) {
    setForm({
      student_id: fine.student_id,
      fine_type:  fine.fine_type,
      reason:     fine.reason,
      amount:     String(fine.amount),
      notes:      fine.notes ?? '',
    })
    setIsEditing(true)
    setEditingId(fine.id)
    setIsOpen(true)
  }

  function closeModal() {
    setIsOpen(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  function handleDelete(fine: Fine) {
    if (fine.status !== 'pending') {
      toast.error('Only pending fines can be deleted.')
      return
    }
    if (!confirm(`Delete fine for ${fine.student_id}? This cannot be undone.`)) return
    deleteMut.mutate(fine.id)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 pb-12">

      {/* Header + summary */}
      <div className="bg-white dark:bg-ink-900 p-5 rounded-xl border border-ink-200 dark:border-ink-800 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-red-500/10 text-red-500 rounded-lg">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-ink-900 dark:text-ink-50">Fines Management</h1>
              <p className="text-xs text-ink-500">Issue and track student fines for academic document penalties.</p>
            </div>
          </div>
          {canManage && (
            <button onClick={openCreate} className="btn btn-primary flex items-center gap-2 text-sm">
              <Plus className="w-4 h-4" />
              Issue Fine
            </button>
          )}
        </div>

        {/* Summary pills */}
        {summary && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Pending',   count: summary.pending_count,  amount: summary.pending_amount,   color: 'amber'  },
              { label: 'Invoiced',  count: summary.invoiced_count, amount: summary.invoiced_amount,  color: 'blue'   },
              { label: 'Collected', count: summary.paid_count,     amount: summary.collected_amount, color: 'green'  },
              { label: 'Waived',    count: summary.waived_count,   amount: 0,                        color: 'ink'    },
            ].map((s) => (
              <div key={s.label} className="p-3 rounded-lg bg-ink-50 dark:bg-ink-800 border border-ink-100 dark:border-ink-700">
                <p className="text-xs text-ink-500 font-medium">{s.label}</p>
                <p className="text-lg font-bold text-ink-900 dark:text-ink-50 mt-0.5">{s.count}</p>
                {s.amount > 0 && (
                  <p className="text-xs text-ink-400 mt-0.5">{fmtAmt(s.amount)}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Issue Fine Modal */}
      {isOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-sm">
            <div className="flex min-h-full items-start justify-center p-4 pt-16">
              <div className="bg-white dark:bg-ink-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-ink-100 dark:border-ink-700">
                  <h3 className="text-base font-semibold text-ink-900 dark:text-white">
                    {isEditing ? 'Edit Fine' : 'Issue Fine'}
                  </h3>
                  <button onClick={closeModal} className="p-1.5 rounded-full text-ink-400 hover:text-ink-600 hover:bg-ink-100 dark:hover:bg-ink-700" aria-label="Close">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form
                  onSubmit={(e) => { e.preventDefault(); saveMut.mutate(form) }}
                  className="p-6 space-y-4"
                >
                  {/* Student ID */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">
                      Student Registration Number *
                    </label>
                    <input
                      required
                      type="text"
                      disabled={isEditing}
                      className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm border border-ink-200 dark:border-ink-700 focus:outline-none focus:ring-2 focus:ring-brand/40 disabled:opacity-50 disabled:cursor-not-allowed"
                      placeholder="e.g. 2022/BSC/001"
                      value={form.student_id}
                      onChange={(e) => set('student_id', e.target.value)}
                    />
                  </div>

                  {/* Fine type */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Fine Type *</label>
                    <select
                      required
                      className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm border border-ink-200 dark:border-ink-700 focus:outline-none focus:ring-2 focus:ring-brand/40"
                      value={form.fine_type}
                      onChange={(e) => set('fine_type', e.target.value as FineType)}
                    >
                      {FINE_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Reason */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Reason *</label>
                    <textarea
                      required
                      rows={3}
                      className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm border border-ink-200 dark:border-ink-700 focus:outline-none focus:ring-2 focus:ring-brand/40 resize-none"
                      placeholder="Describe the reason for this fine…"
                      value={form.reason}
                      onChange={(e) => set('reason', e.target.value)}
                    />
                  </div>

                  {/* Amount */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">
                      Amount (RWF) *{isEditing && <span className="ml-1 text-ink-400 font-normal">(immutable after invoice)</span>}
                    </label>
                    <input
                      required
                      type="number"
                      min="1"
                      step="1"
                      disabled={isEditing}
                      className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm border border-ink-200 dark:border-ink-700 focus:outline-none focus:ring-2 focus:ring-brand/40 disabled:opacity-50 disabled:cursor-not-allowed"
                      placeholder="e.g. 5000"
                      value={form.amount}
                      onChange={(e) => set('amount', e.target.value)}
                    />
                  </div>

                  {/* Notes */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">Notes (optional)</label>
                    <textarea
                      rows={2}
                      className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm border border-ink-200 dark:border-ink-700 focus:outline-none focus:ring-2 focus:ring-brand/40 resize-none"
                      placeholder="Internal notes…"
                      value={form.notes}
                      onChange={(e) => set('notes', e.target.value)}
                    />
                  </div>

                  {!isEditing && (
                    <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-xs text-amber-700 dark:text-amber-300">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span>A FINE invoice will be automatically generated and added to the student's account.</span>
                    </div>
                  )}

                  <div className="flex justify-end gap-3 pt-2 border-t border-ink-100 dark:border-ink-700">
                    <button type="button" onClick={closeModal} className="btn btn-secondary text-sm px-5">
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saveMut.isPending}
                      className="btn btn-primary text-sm px-7"
                    >
                      {saveMut.isPending ? 'Saving…' : isEditing ? 'Update' : 'Issue Fine'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Waive Modal */}
      {waiveId !== null && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-sm">
            <div className="flex min-h-full items-center justify-center p-4">
              <div className="bg-white dark:bg-ink-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-ink-100 dark:border-ink-700">
                  <h3 className="text-base font-semibold text-ink-900 dark:text-white">Waive Fine</h3>
                </div>
                <div className="p-6 space-y-4">
                  <p className="text-sm text-ink-600 dark:text-ink-400">
                    This will waive the fine and mark the linked invoice as waived. Provide a reason:
                  </p>
                  <textarea
                    rows={3}
                    className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-900 rounded-lg text-sm border border-ink-200 dark:border-ink-700 focus:outline-none focus:ring-2 focus:ring-brand/40 resize-none"
                    placeholder="Reason for waiving…"
                    value={waiveReason}
                    onChange={(e) => setWaiveReason(e.target.value)}
                  />
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => { setWaiveId(null); setWaiveReason('') }}
                      className="btn btn-secondary text-sm px-5"
                    >
                      Cancel
                    </button>
                    <button
                      disabled={waiveMut.isPending}
                      onClick={() => waiveMut.mutate({ id: waiveId!, reason: waiveReason })}
                      className="btn btn-primary bg-amber-500 hover:bg-amber-600 text-sm px-6"
                    >
                      {waiveMut.isPending ? 'Waiving…' : 'Confirm Waive'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-ink-100 dark:border-ink-800 flex flex-wrap gap-3 items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search student or reason…"
              className="w-full pl-9 pr-4 py-2 bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            />
          </div>

          {/* Status filter */}
          <select
            className="px-3 py-2 bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
            value={status}
            onChange={(e) => { setStatus(e.target.value as FineStatus | ''); setPage(1) }}
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="invoiced">Invoiced</option>
            <option value="paid">Paid</option>
            <option value="waived">Waived</option>
          </select>

          {/* Type filter */}
          <select
            className="px-3 py-2 bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
            value={fineType}
            onChange={(e) => { setFineType(e.target.value as FineType | ''); setPage(1) }}
          >
            <option value="">All types</option>
            {FINE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-ink-50/60 dark:bg-ink-800/60 border-b border-ink-200 dark:border-ink-800">
                <th className="px-5 py-3 font-semibold text-ink-500 text-xs uppercase tracking-wide">Student</th>
                <th className="px-5 py-3 font-semibold text-ink-500 text-xs uppercase tracking-wide">Type</th>
                <th className="px-5 py-3 font-semibold text-ink-500 text-xs uppercase tracking-wide">Reason</th>
                <th className="px-5 py-3 font-semibold text-ink-500 text-xs uppercase tracking-wide text-right">Amount</th>
                <th className="px-5 py-3 font-semibold text-ink-500 text-xs uppercase tracking-wide text-center">Status</th>
                <th className="px-5 py-3 font-semibold text-ink-500 text-xs uppercase tracking-wide">Invoice</th>
                <th className="px-5 py-3 font-semibold text-ink-500 text-xs uppercase tracking-wide">Date</th>
                <th className="px-5 py-3 font-semibold text-ink-500 text-xs uppercase tracking-wide text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={8} className="px-5 py-4">
                        <div className="h-4 bg-ink-100 dark:bg-ink-800 rounded w-full" />
                      </td>
                    </tr>
                  ))
                : fines.length === 0
                ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center text-ink-400 italic text-sm">
                      No fines found matching your filters.
                    </td>
                  </tr>
                )
                : fines.map((fine) => {
                    const typeLabel = FINE_TYPES.find((t) => t.value === fine.fine_type)?.label ?? fine.fine_type
                    return (
                      <tr key={fine.id} className="hover:bg-ink-50/40 dark:hover:bg-ink-800/40 transition-colors group">
                        <td className="px-5 py-3.5">
                          <p className="font-semibold text-ink-900 dark:text-ink-50 text-xs">{fine.student_name}</p>
                          <p className="text-ink-400 text-xs font-mono">{fine.student_id}</p>
                        </td>
                        <td className="px-5 py-3.5 text-xs text-ink-700 dark:text-ink-300">{typeLabel}</td>
                        <td className="px-5 py-3.5 max-w-xs">
                          <p className="text-xs text-ink-600 dark:text-ink-400 truncate" title={fine.reason}>{fine.reason}</p>
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono font-bold text-sm text-ink-900 dark:text-ink-50">
                          {fmtAmt(fine.amount)}
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${STATUS_COLORS[fine.status]}`}>
                            {fine.status}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          {fine.invoice_number
                            ? <span className="text-xs font-mono text-brand dark:text-gold-400">{fine.invoice_number}</span>
                            : <span className="text-ink-300 dark:text-ink-600 text-xs">—</span>
                          }
                        </td>
                        <td className="px-5 py-3.5 text-xs text-ink-400">
                          {new Date(fine.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          {canManage && (
                          <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {fine.status !== 'waived' && fine.status !== 'paid' && (
                              <>
                                <button
                                  onClick={() => openEdit(fine)}
                                  className="p-1.5 text-brand hover:bg-brand/10 rounded-md transition-colors"
                                  title="Edit"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => { setWaiveId(fine.id); setWaiveReason('') }}
                                  className="p-1.5 text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-md transition-colors"
                                  title="Waive"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                            {fine.status === 'pending' && (
                              <button
                                onClick={() => handleDelete(fine)}
                                disabled={deleteMut.isPending}
                                className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors disabled:opacity-40"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {fine.invoice_number && (
                              <span
                                className="p-1.5 text-ink-400 cursor-default"
                                title={`Invoice: ${fine.invoice_number}`}
                              >
                                <FileText className="w-3.5 h-3.5" />
                              </span>
                            )}
                            {fine.status === 'waived' && (
                              <XCircle className="w-4 h-4 text-ink-300 dark:text-ink-600" />
                            )}
                          </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {lastPage > 1 && (
          <div className="px-5 py-3 border-t border-ink-100 dark:border-ink-800 flex items-center justify-between">
            <p className="text-xs text-ink-400">
              {total} fine{total !== 1 ? 's' : ''} total
            </p>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="p-1.5 rounded text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-ink-500">Page {page} of {lastPage}</span>
              <button
                disabled={page >= lastPage}
                onClick={() => setPage((p) => p + 1)}
                className="p-1.5 rounded text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
