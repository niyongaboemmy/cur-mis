import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  ClipboardCheck, Plus, Trash2, Loader2, ArrowUp, ArrowDown, Pencil,
  GraduationCap, BookOpen, Award, Info,
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import {
  programmeDocumentRequirementService,
  type ProgrammeDocumentRequirement,
  type ProgrammeCategoryKey,
} from '@/services/admissionService'
import type { DocumentType } from '@/types/admission'
import { PERMISSIONS } from '@/constants'
import { usePermission } from '@/utils/permissions'

/** A 422 carries per-field detail in `errors`; the bare `message` is only
 *  "Validation failed.", which tells the user nothing about what to change. */
function apiErrorMessage(e: any, fallback = 'Failed'): string {
  const data = e?.response?.data
  const fields = data?.errors
  if (fields && typeof fields === 'object') {
    const detail = Object.values(fields).flat().filter(Boolean).join(' ')
    if (detail) return detail
  }
  return data?.message ?? fallback
}

const CATEGORY_ICON: Record<ProgrammeCategoryKey, typeof GraduationCap> = {
  undergraduate: GraduationCap,
  postgraduate:  BookOpen,
  masters:       Award,
}

const QUERY_KEY = ['admin', 'programme-doc-requirements']

/**
 * Admin editor for the required-documents checklist per programme
 * category. Whatever is configured here is what the student Documents tab
 * compares uploads against, and what a "missing documents" notice lists.
 */
export default function ProgrammeDocumentRequirementsPage() {
  const canManage = usePermission(PERMISSIONS.MANAGE_ADMISSION_REQUIREMENTS)
  const qc = useQueryClient()

  const listQ = useQuery({ queryKey: QUERY_KEY, queryFn: () => programmeDocumentRequirementService.list() })
  const categories = listQ.data?.data?.categories ?? []
  const rows       = listQ.data?.data?.requirements ?? []
  const types      = listQ.data?.data?.available_types ?? []

  const [tab, setTab] = useState<ProgrammeCategoryKey>('undergraduate')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<ProgrammeDocumentRequirement | null>(null)
  const [removing, setRemoving] = useState<ProgrammeDocumentRequirement | null>(null)

  const byCategory = useMemo(() => {
    const m: Record<string, ProgrammeDocumentRequirement[]> = {}
    for (const r of rows) (m[r.programme_category] ??= []).push(r)
    return m
  }, [rows])
  const current = byCategory[tab] ?? []

  // Types not yet on this category's checklist — what the "Add" picker offers.
  const addable = useMemo(() => {
    const used = new Set(current.map((r) => r.document_type_id))
    return types.filter((t) => !used.has(t.id))
  }, [types, current])

  const invalidate = () => qc.invalidateQueries({ queryKey: QUERY_KEY })

  const create = useMutation({
    mutationFn: (d: { document_type_id: number; is_required: boolean; notes: string }) =>
      programmeDocumentRequirementService.create({ programme_category: tab, ...d }),
    onSuccess: () => { toast.success('Document added to the checklist'); setAdding(false); invalidate() },
    onError:   (e: any) => toast.error(apiErrorMessage(e)),
  })

  const update = useMutation({
    mutationFn: ({ id, ...d }: { id: number; is_required?: boolean; is_active?: boolean; notes?: string | null }) =>
      programmeDocumentRequirementService.update(id, d),
    onSuccess: () => { setEditing(null); invalidate() },
    onError:   (e: any) => toast.error(apiErrorMessage(e)),
  })

  const reorder = useMutation({
    mutationFn: (ids: number[]) => programmeDocumentRequirementService.reorder(tab, ids),
    onSuccess: invalidate,
    onError:   (e: any) => toast.error(apiErrorMessage(e, 'Could not save the order')),
  })

  const remove = useMutation({
    mutationFn: (id: number) => programmeDocumentRequirementService.remove(id),
    onSuccess: () => { toast.success('Removed from the checklist'); setRemoving(null); invalidate() },
    onError:   (e: any) => toast.error(apiErrorMessage(e)),
  })

  const move = (index: number, dir: -1 | 1) => {
    const ids = current.map((r) => r.id)
    const j = index + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[index], ids[j]] = [ids[j], ids[index]]
    reorder.mutate(ids)
  }

  const requiredCount = current.filter((r) => r.is_active && r.is_required).length
  const optionalCount = current.filter((r) => r.is_active && !r.is_required).length

  return (
    <div className="space-y-4">
      <section className="card p-0 overflow-hidden">
        <div className="flex items-center gap-3 p-4 border-b border-ink-100 dark:border-ink-800">
          <ClipboardCheck className="w-5 h-5 text-brand" />
          <div>
            <h2 className="section-title">Required student documents</h2>
            <p className="section-sub">
              Per programme category. Used on the student Documents tab to detect what is provided and
              what is missing, and listed in the notice sent to the student.
            </p>
          </div>
          <div className="flex-1" />
          {canManage && (
            <button className="btn-primary btn-sm whitespace-nowrap" onClick={() => setAdding(true)} disabled={addable.length === 0}>
              <Plus className="w-3.5 h-3.5" /> Add document
            </button>
          )}
        </div>

        {/* Category tabs */}
        <div className="flex gap-1 px-4 pt-3 border-b border-ink-100 dark:border-ink-800 overflow-x-auto">
          {categories.map((c) => {
            const Icon = CATEGORY_ICON[c.key] ?? GraduationCap
            const n = (byCategory[c.key] ?? []).filter((r) => r.is_active).length
            const active = tab === c.key
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setTab(c.key)}
                className={`flex items-center gap-2 px-3 py-2 text-[13px] font-semibold border-b-2 -mb-px whitespace-nowrap transition ${
                  active
                    ? 'border-brand text-brand'
                    : 'border-transparent text-ink-500 hover:text-ink-800 dark:hover:text-ink-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                {c.label}
                <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${active ? 'bg-brand/10 text-brand' : 'bg-ink-100 dark:bg-ink-800 text-ink-500'}`}>
                  {n}
                </span>
              </button>
            )
          })}
        </div>

        {listQ.isLoading ? (
          <p className="p-8 text-center text-ink-500 text-[13px]">Loading…</p>
        ) : current.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-ink-600 dark:text-ink-300 text-[13.5px] font-medium">No documents on this checklist yet.</p>
            <p className="text-ink-500 text-[12.5px] mt-1">
              Students in this category will show as having nothing to provide until you add some.
            </p>
          </div>
        ) : (
          <>
            <div className="px-4 py-2 text-[12px] text-ink-500 flex items-center gap-2 bg-ink-50/60 dark:bg-ink-900/40">
              <Info className="w-3.5 h-3.5" />
              {requiredCount} required · {optionalCount} optional. Only <b className="mx-1">required</b> documents count
              as missing. Inactive rows are kept but ignored.
            </div>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="w-16">Order</th>
                    <th>Document</th>
                    <th>Guidance for the student</th>
                    <th>Rule</th>
                    <th>Active</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {current.map((r, i) => {
                    const typeGone = !r.document_type_active
                    return (
                      <tr key={r.id} className={!r.is_active ? 'opacity-60' : ''}>
                        <td>
                          <div className="inline-flex items-center gap-0.5">
                            <span className="w-5 text-[12px] text-ink-500">{i + 1}</span>
                            {canManage && (
                              <>
                                <button className="icon-btn" title="Move up" onClick={() => move(i, -1)} disabled={i === 0 || reorder.isPending}>
                                  <ArrowUp className="w-3.5 h-3.5" />
                                </button>
                                <button className="icon-btn" title="Move down" onClick={() => move(i, 1)} disabled={i === current.length - 1 || reorder.isPending}>
                                  <ArrowDown className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="font-medium text-ink-900 dark:text-ink-100">
                            {r.document_type_name ?? <span className="text-red-600">Deleted document type</span>}
                          </div>
                          <div className="font-mono text-[11px] text-ink-400">{r.document_type_slug}</div>
                          {typeGone && r.document_type_name && (
                            <div className="text-[11.5px] text-amber-600 mt-0.5">
                              This document type is inactive in the catalogue, so uploads can't satisfy it.
                            </div>
                          )}
                        </td>
                        <td className="text-[12.5px] text-ink-600 dark:text-ink-300 max-w-xs">
                          {r.notes || <span className="text-ink-400">—</span>}
                        </td>
                        <td>
                          {canManage ? (
                            <button
                              type="button"
                              className={r.is_required ? 'chip-danger' : 'chip-soft'}
                              title="Click to toggle required / optional"
                              onClick={() => update.mutate({ id: r.id, is_required: !r.is_required })}
                              disabled={update.isPending}
                            >
                              {r.is_required ? 'Required' : 'Optional'}
                            </button>
                          ) : r.is_required ? <span className="chip-danger">Required</span> : <span className="chip-soft">Optional</span>}
                        </td>
                        <td>
                          {canManage ? (
                            <label className="inline-flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                className="w-4 h-4 rounded"
                                checked={!!r.is_active}
                                onChange={(e) => update.mutate({ id: r.id, is_active: e.target.checked })}
                                disabled={update.isPending}
                              />
                              <span className="text-[12px] text-ink-500">{r.is_active ? 'Yes' : 'No'}</span>
                            </label>
                          ) : r.is_active ? <span className="chip-success">Yes</span> : <span className="chip-soft">No</span>}
                        </td>
                        <td className="text-right">
                          {canManage && (
                            <div className="inline-flex gap-1">
                              <button className="icon-btn" title="Edit guidance" onClick={() => setEditing(r)}>
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                className="icon-btn text-red-500 hover:text-red-600 hover:bg-red-50"
                                title="Remove from checklist"
                                onClick={() => setRemoving(r)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <p className="text-[12px] text-ink-500 px-1">
        Missing a document from the picker? Add it to the{' '}
        <Link to="/admin/admissions/document-types" className="text-brand font-semibold hover:underline">
          document types catalogue
        </Link>{' '}
        first — students upload against those types, and the checklist matches on them.
      </p>

      {adding && (
        <AddModal
          types={addable}
          busy={create.isPending}
          onClose={() => setAdding(false)}
          onSave={(d) => create.mutate(d)}
        />
      )}

      {editing && (
        <EditNotesModal
          row={editing}
          busy={update.isPending}
          onClose={() => setEditing(null)}
          onSave={(notes) => update.mutate({ id: editing.id, notes })}
        />
      )}

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing.id)}
        title="Remove from checklist?"
        message={`"${removing?.document_type_name ?? 'This document'}" will no longer be expected from ${tab} students. Existing uploads are not affected.`}
        confirmLabel="Remove"
        loading={remove.isPending}
      />
    </div>
  )
}

function AddModal({
  types, busy, onClose, onSave,
}: {
  types: DocumentType[]
  busy: boolean
  onClose: () => void
  onSave: (d: { document_type_id: number; is_required: boolean; notes: string }) => void
}) {
  const [typeId, setTypeId] = useState<number>(types[0]?.id ?? 0)
  const [required, setRequired] = useState(true)
  const [notes, setNotes] = useState('')
  const selected = types.find((t) => t.id === typeId)

  return (
    <Modal
      open
      onClose={onClose}
      title="Add document to checklist"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            disabled={busy || !typeId}
            onClick={() => onSave({ document_type_id: typeId, is_required: required, notes: notes.trim() })}
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Add
          </button>
        </>
      }
    >
      <div className="space-y-4 py-2">
        <div>
          <label className="label">Document type</label>
          <select className="input w-full" value={typeId} onChange={(e) => setTypeId(Number(e.target.value))}>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {selected?.description && (
            <p className="text-[12px] text-ink-500 mt-1">{selected.description}</p>
          )}
        </div>
        <label className="flex items-start gap-3 p-3 rounded-lg border border-ink-200 dark:border-ink-700 cursor-pointer">
          <input type="checkbox" className="w-4 h-4 mt-0.5 rounded" checked={required} onChange={(e) => setRequired(e.target.checked)} />
          <span>
            <span className="block text-[13px] font-medium text-ink-900 dark:text-white">Required</span>
            <span className="block text-[12px] text-ink-500">
              Reported as missing when the student hasn't uploaded it. Untick for documents that only some students need.
            </span>
          </span>
        </label>
        <div>
          <label className="label">Guidance for the student <span className="text-ink-400 font-normal">(optional)</span></label>
          <input
            className="input w-full"
            maxLength={255}
            placeholder='e.g. "Must be notarized" or "Not older than 6 months"'
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  )
}

function EditNotesModal({
  row, busy, onClose, onSave,
}: {
  row: ProgrammeDocumentRequirement
  busy: boolean
  onClose: () => void
  onSave: (notes: string) => void
}) {
  const [notes, setNotes] = useState(row.notes ?? '')
  return (
    <Modal
      open
      onClose={onClose}
      title={`Guidance — ${row.document_type_name ?? 'document'}`}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy} onClick={() => onSave(notes.trim())}>
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Save
          </button>
        </>
      }
    >
      <div className="py-2">
        <label className="label">Shown to the student next to this document</label>
        <input
          className="input w-full"
          maxLength={255}
          autoFocus
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder='e.g. "Must be notarized"'
        />
      </div>
    </Modal>
  )
}
