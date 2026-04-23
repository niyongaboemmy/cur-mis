import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  Pencil, Plus, Trash2, Star, Loader2,
} from 'lucide-react'
import { applicantService } from '@/services/admissionService'
import Modal from '@/components/ui/Modal'
import type { AcademicRecord } from '@/types/admission'
import { Card, Field, SectionHeader, Loading } from '@/components/applicant/ApplicantPortalShared'

export default function ApplicantRecordsPage() {
  const qc = useQueryClient(); 
  const q  = useQuery({ queryKey: ['applicant', 'records'], queryFn: () => applicantService.listAcademicRecords() }); 
  const [editing, setEditing] = useState<Partial<AcademicRecord> | null>(null)

  const save = useMutation({ 
    mutationFn: async (d: Partial<AcademicRecord>) => { 
      if (d.id) await applicantService.updateAcademicRecord(d.id, d); 
      else await applicantService.addAcademicRecord(d as any) 
    }, 
    onSuccess: () => { 
      toast.success('Record saved'); 
      setEditing(null); 
      qc.invalidateQueries({ queryKey: ['applicant', 'records'] }) 
    }, 
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed') 
  })

  const remove = useMutation({ 
    mutationFn: (id: number) => applicantService.deleteAcademicRecord(id), 
    onSuccess: () => { 
      toast.success('Record removed'); 
      qc.invalidateQueries({ queryKey: ['applicant', 'records'] }) 
    } 
  })

  const setPrimary = useMutation({ 
    mutationFn: (id: number) => applicantService.setPrimaryRecord(id), 
    onSuccess: () => { 
      toast.success('Primary updated'); 
      qc.invalidateQueries({ queryKey: ['applicant', 'records'] }) 
    } 
  })

  const rows = q.data?.data ?? []

  return (
    <div className="max-w-5xl mx-auto">
      <Card>
        <div className="flex items-start justify-between gap-4">
          <SectionHeader title="Academic records" sub="Every school you've attended. The one marked primary is used for merit scoring." />
          <button className="btn-primary btn-sm" onClick={() => setEditing({})}><Plus className="w-3.5 h-3.5" /> Add record</button>
        </div>
        {q.isLoading ? <Loading /> : rows.length === 0 ? <p className="mt-4 text-[13px] text-ink-500 text-center py-12">No academic records yet.</p> : (
          <ul className="space-y-2 mt-4">
            {rows.map((r) => (
              <li key={r.id} className="rounded-md border border-ink-100 dark:border-ink-700 p-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-ink-900 dark:text-white">
                    {r.institution_name}
                    {r.is_primary ? <span className="chip-primary ml-2"><Star className="w-3 h-3" /> Primary</span> : null}
                  </p>
                  <p className="text-[12.5px] text-ink-500">{r.qualification} · {r.grade} · {r.year_completed}{r.combination ? ` · ${r.combination}` : ''}</p>
                </div>
                <div className="flex gap-1">
                  {!r.is_primary && (
                    <button className="btn-secondary btn-sm" onClick={() => setPrimary.mutate(r.id)} disabled={setPrimary.isPending}>
                      <Star className="w-3 h-3" /> Make primary
                    </button>
                  )}
                  <button className="icon-btn" onClick={() => setEditing(r)}><Pencil className="w-3.5 h-3.5" /></button>
                  <button 
                    className="icon-btn text-red-500 hover:bg-red-50" 
                    disabled={remove.isPending && remove.variables === r.id} 
                    onClick={() => confirm('Delete this record?') && remove.mutate(r.id)}
                  >
                    {remove.isPending && remove.variables === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {editing !== null && (
        <RecordModal rec={editing} busy={save.isPending} onClose={() => setEditing(null)} onSave={(d) => save.mutate(d)} />
      )}
    </div>
  )
}

function RecordModal({ rec, onClose, onSave, busy }: { rec: Partial<AcademicRecord>; onClose: () => void; onSave: (d: Partial<AcademicRecord>) => void; busy: boolean }) {
  const [form, setForm] = useState<Partial<AcademicRecord>>({ 
    institution_name: rec.institution_name ?? '', 
    qualification: rec.qualification ?? '', 
    grade: rec.grade ?? '', 
    combination: rec.combination ?? '', 
    year_completed: rec.year_completed ?? new Date().getFullYear(), 
    is_primary: rec.is_primary ?? 0, 
    id: rec.id 
  })
  return (
    <Modal open onClose={onClose} title={rec.id ? 'Edit academic record' : 'Add academic record'} footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={() => onSave(form)} disabled={busy}>{busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save</button></>}>
      <div className="space-y-3">
        <Field label="Institution name">
          <input className="input" value={form.institution_name ?? ''} onChange={(e) => setForm({ ...form, institution_name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Qualification">
            <input className="input" value={form.qualification ?? ''} onChange={(e) => setForm({ ...form, qualification: e.target.value })} />
          </Field>
          <Field label="Grade">
            <input className="input" value={form.grade ?? ''} onChange={(e) => setForm({ ...form, grade: e.target.value })} />
          </Field>
          <Field label="Combination (A-level)">
            <input className="input" value={form.combination ?? ''} onChange={(e) => setForm({ ...form, combination: e.target.value })} />
          </Field>
          <Field label="Year completed">
            <input type="number" className="input" value={form.year_completed ?? ''} onChange={(e) => setForm({ ...form, year_completed: Number(e.target.value) })} />
          </Field>
        </div>
      </div>
    </Modal>
  )
}
