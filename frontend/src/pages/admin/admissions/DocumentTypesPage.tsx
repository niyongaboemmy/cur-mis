import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Layers, Plus, Pencil, Trash2, Loader2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { documentTypeService } from '@/services/admissionService'
import type { DocumentType } from '@/types/admission'

export default function DocumentTypesPage() {
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
    onError:   (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  })

  const remove = useMutation({
    mutationFn: (id: number) => documentTypeService.remove(id),
    onSuccess: () => { toast.success('Removed'); qc.invalidateQueries({ queryKey: ['admin', 'doctypes'] }) },
    onError:   (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
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
        <button className="btn-primary btn-sm" onClick={() => setEditing({})}>
          <Plus className="w-3.5 h-3.5" /> New type
        </button>
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
  return (
    <Modal
      open
      onClose={onClose}
      title={doc.id ? 'Edit document type' : 'New document type'}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => onSave(form)} disabled={busy}>
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Save
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="label">Name</label>
          <input className="input" value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="label">Slug</label>
          <input className="input font-mono" value={form.slug ?? ''} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="id_card" />
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
