import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Layers, Plus, Pencil, Trash2, Loader2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { documentTypeService } from '@/services/admissionService'
import type { DocumentType } from '@/types/admission'
import { PERMISSIONS } from '@/constants'
import { usePermission } from '@/utils/permissions'

/** The slug is a machine key the rest of the system looks documents up by.
 *  Mirrors DocumentTypeController::normaliseSlug() so what the user sees in
 *  the field is exactly what the server will store. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '')
}

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

export default function DocumentTypesPage() {
  const canManage = usePermission(PERMISSIONS.MANAGE_ADMISSION_REQUIREMENTS)
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Partial<DocumentType> | null>(null)

  const listQ = useQuery({ queryKey: ['admin', 'doctypes'], queryFn: () => documentTypeService.list() })
  const rows = listQ.data?.data ?? []

  const save = useMutation({
    mutationFn: async (d: Partial<DocumentType>) => {
      if (d.id) await documentTypeService.update(d.id, d)
      else      await documentTypeService.create(d)
    },
    onSuccess: () => { toast.success('Saved'); setEditing(null); qc.invalidateQueries({ queryKey: ['admin', 'doctypes'] }) },
    onError:   (e: any) => toast.error(apiErrorMessage(e)),
  })

  const remove = useMutation({
    mutationFn: (id: number) => documentTypeService.remove(id),
    onSuccess: () => { toast.success('Removed'); qc.invalidateQueries({ queryKey: ['admin', 'doctypes'] }) },
    onError:   (e: any) => toast.error(apiErrorMessage(e)),
  })

  return (
    <section className="card p-0 overflow-hidden">
      <div className="flex items-center gap-3 p-4 border-b border-ink-100">
        <Layers className="w-5 h-5 text-brand" />
        <div>
          <h2 className="section-title">Document types</h2>
          <p className="section-sub">Global catalogue of possible admission documents.</p>
        </div>
        <div className="flex-1" />
        {canManage && (
          <button className="btn-primary btn-sm" onClick={() => setEditing({})}>
            <Plus className="w-3.5 h-3.5" /> New type
          </button>
        )}
      </div>

      {listQ.isLoading ? (
        <p className="p-8 text-center text-ink-500 text-[13px]">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="p-10 text-center text-ink-500 text-[13px]">No document types yet.</p>
      ) : (
        <table className="data-table">
          <thead><tr><th>Name</th><th>Slug</th><th>Active</th><th>Order</th><th className="text-right">Actions</th></tr></thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id}>
                <td className="font-medium text-ink-900 dark:text-ink-100">{d.name}</td>
                <td className="font-mono text-[12px]">{d.slug}</td>
                <td>{d.is_active ? <span className="chip-success">Yes</span> : <span className="chip-soft">No</span>}</td>
                <td>{d.sort_order ?? 0}</td>
                <td className="text-right">
                  {canManage && (
                    <div className="inline-flex gap-1">
                      <button className="icon-btn" onClick={() => setEditing(d)}><Pencil className="w-3.5 h-3.5" /></button>
                      <button
                        className="icon-btn text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={() => confirm(`Delete "${d.name}"?`) && remove.mutate(d.id)}
                        disabled={remove.isPending && remove.variables === d.id}
                      >
                        {remove.isPending && remove.variables === d.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing !== null && (
        <EditModal
          doc={editing}
          onClose={() => setEditing(null)}
          onSave={(d) => save.mutate(d)}
          busy={save.isPending}
        />
      )}
    </section>
  )
}

function EditModal({
  doc, onClose, onSave, busy,
}: {
  doc: Partial<DocumentType>
  onClose: () => void
  onSave: (d: Partial<DocumentType>) => void
  busy: boolean
}) {
  const [form, setForm] = useState<Partial<DocumentType>>({
    name: doc.name ?? '', slug: doc.slug ?? '', description: doc.description ?? '',
    is_active: doc.is_active ?? 1, sort_order: doc.sort_order ?? 0, id: doc.id,
    allowed_extensions: doc.allowed_extensions ?? 'pdf,jpg,jpeg,png',
  })

  // Typing a name fills the slug in, until the user edits the slug themselves —
  // after that it is theirs and we stop overwriting it. An existing type counts
  // as already-edited: its slug is a key other records point at.
  const [slugTouched, setSlugTouched] = useState(Boolean(doc.id || doc.slug))

  const onNameChange = (name: string) =>
    setForm((f) => ({ ...f, name, slug: slugTouched ? f.slug : slugify(name) }))

  const onSlugChange = (raw: string) => {
    setSlugTouched(true)
    // Sanitise as typed rather than rejecting on save: the field then cannot
    // hold a value the server would refuse.
    setForm((f) => ({ ...f, slug: raw.toLowerCase().replace(/[^a-z0-9_-]+/g, '_') }))
  }

  const nameTooShort = (form.name ?? '').trim().length > 0 && (form.name ?? '').trim().length < 3
  const canSave =
    (form.name ?? '').trim().length >= 3 &&
    (form.slug ?? '').length > 0 &&
    (form.allowed_extensions ?? '').trim().length > 0

  return (
    <Modal
      open
      onClose={onClose}
      title={doc.id ? 'Edit document type' : 'New document type'}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => onSave(form)} disabled={busy || !canSave}>
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Save
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="label">Name</label>
          <input className="input" value={form.name ?? ''} onChange={(e) => onNameChange(e.target.value)} />
          {nameTooShort && (
            <p className="mt-1 text-[11px] text-red-600">Name must be at least 3 characters.</p>
          )}
        </div>
        <div>
          <label className="label">Slug</label>
          <input className="input font-mono" value={form.slug ?? ''} onChange={(e) => onSlugChange(e.target.value)} placeholder="id_card" />
          <p className="mt-1 text-[11px] text-ink-500">
            {doc.id
              ? 'The key other records use to find this document type — changing it can orphan existing requirements.'
              : 'Filled in from the name. Lowercase letters, numbers, _ and - only.'}
          </p>
        </div>
        <div>
          <label className="label">Description</label>
          <textarea className="input min-h-[80px]" value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div>
          <label className="label">Allowed Extensions (comma separated)</label>
          <input className="input" value={form.allowed_extensions ?? ''} onChange={(e) => setForm({ ...form, allowed_extensions: e.target.value })} placeholder="pdf, jpg, png" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Sort order</label>
            <input type="number" className="input" value={form.sort_order ?? 0} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label">Active</label>
            <select className="input" value={form.is_active ? '1' : '0'} onChange={(e) => setForm({ ...form, is_active: e.target.value === '1' ? 1 : 0 })}>
              <option value="1">Yes</option>
              <option value="0">No</option>
            </select>
          </div>
        </div>
      </div>
    </Modal>
  )
}
