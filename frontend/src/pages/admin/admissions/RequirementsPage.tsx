import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ListChecks, Plus, Trash2, Loader2, Copy } from 'lucide-react'
import { admissionRequirementService, documentTypeService, portalService } from '@/services/admissionService'
import { academicService } from '@/services/academicService'
import Modal from '@/components/ui/Modal'

export default function RequirementsPage() {
  const qc = useQueryClient()

  const facultiesQ = useQuery({ queryKey: ['portal', 'faculties'], queryFn: () => portalService.getFaculties() })
  const yearsQ     = useQuery({ queryKey: ['academic', 'years'],   queryFn: () => academicService.listYears() })
  const docTypesQ  = useQuery({ queryKey: ['admin', 'doctypes'],   queryFn: () => documentTypeService.list() })

  const [facultyId, setFacultyId] = useState<number | ''>('')
  const [yearId,    setYearId]    = useState<number | ''>('')
  const canQuery = !!facultyId && !!yearId

  const listQ = useQuery({
    queryKey: ['admin', 'requirements', facultyId, yearId],
    queryFn:  () => admissionRequirementService.getForFacultyYear(Number(facultyId), Number(yearId)),
    enabled:  canQuery,
  })

  const create = useMutation({
    mutationFn: (d: { document_type_id: number; is_required: 0 | 1; notes?: string }) =>
      admissionRequirementService.create({
        faculty_id: Number(facultyId),
        academic_year_id: Number(yearId),
        ...d,
      }),
    onSuccess: () => { toast.success('Requirement added'); qc.invalidateQueries({ queryKey: ['admin', 'requirements'] }) },
    onError:   (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  })

  const remove = useMutation({
    mutationFn: (id: number) => admissionRequirementService.remove(id),
    onSuccess: () => { toast.success('Requirement removed'); qc.invalidateQueries({ queryKey: ['admin', 'requirements'] }) },
    onError:   (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  })

  const rows      = listQ.data?.data?.requirements ?? []
  const docTypes  = docTypesQ.data?.data ?? []
  const faculties = facultiesQ.data?.data ?? []
  const years     = yearsQ.data?.data ?? []

  // Copy modal
  const [copyOpen, setCopyOpen] = useState(false)
  const [copyForm, setCopyForm] = useState({ from_year_id: '', to_year_id: '' })
  const copy = useMutation({
    mutationFn: () => admissionRequirementService.copyToYear({
      from_year_id: Number(copyForm.from_year_id),
      to_year_id:   Number(copyForm.to_year_id),
      faculty_id:   facultyId ? Number(facultyId) : undefined,
    }),
    onSuccess: () => {
      toast.success('Requirements copied')
      setCopyOpen(false)
      qc.invalidateQueries({ queryKey: ['admin', 'requirements'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  })

  return (
    <section className="card p-5">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <ListChecks className="w-5 h-5 text-brand" />
        <div>
          <h2 className="section-title">Admission requirements</h2>
          <p className="section-sub">Per-faculty, per-academic-year document checklist.</p>
        </div>
        <div className="flex-1" />
        <button className="btn-secondary btn-sm" onClick={() => setCopyOpen(true)}>
          <Copy className="w-3 h-3" /> Copy to year
        </button>
      </div>

      {/* Selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div>
          <label className="label">Faculty</label>
          <select className="input" value={facultyId} onChange={(e) => setFacultyId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">— pick faculty —</option>
            {faculties.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Academic year</label>
          <select className="input" value={yearId} onChange={(e) => setYearId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">— pick year —</option>
            {years.map((y) => <option key={y.id} value={y.id}>{y.label}{y.is_current ? ' · current' : ''}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      {!canQuery ? (
        <p className="rounded-md border border-dashed border-ink-200 p-6 text-center text-ink-500 text-[13px]">
          Pick a faculty and year to see the checklist.
        </p>
      ) : listQ.isLoading ? (
        <p className="text-[13px] text-ink-500 p-4">Loading…</p>
      ) : (
        <>
          {/* Existing requirements */}
          {rows.length === 0 ? (
            <p className="rounded-md border border-dashed border-ink-200 p-6 text-center text-ink-500 text-[13px]">
              No requirements for this faculty/year yet. Add one below.
            </p>
          ) : (
            <table className="data-table mb-5">
              <thead><tr><th>Document</th><th>Required?</th><th>Notes</th><th className="text-right">Actions</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="font-medium text-ink-900 dark:text-ink-100">{r.document_type_name ?? `#${r.document_type_id}`}</td>
                    <td>{r.is_required ? <span className="chip-primary">Required</span> : <span className="chip-soft">Optional</span>}</td>
                    <td className="text-ink-500 text-[12.5px]">{r.notes || '—'}</td>
                    <td className="text-right">
                      <button
                        className="icon-btn text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={() => remove.mutate(r.id)}
                        disabled={remove.isPending && remove.variables === r.id}
                      >
                        {remove.isPending && remove.variables === r.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Add new */}
          <div className="rounded-md border border-ink-100 p-4 bg-ink-50">
            <p className="text-[13px] font-semibold mb-3 flex items-center gap-1.5"><Plus className="w-3.5 h-3.5 text-brand" /> Add requirement</p>
            <AddRow docTypes={docTypes} onAdd={(v) => create.mutate(v)} busy={create.isPending} />
          </div>
        </>
      )}

      {/* Copy modal */}
      <Modal
        open={copyOpen}
        onClose={() => setCopyOpen(false)}
        title="Copy requirements to another year"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setCopyOpen(false)}>Cancel</button>
            <button className="btn-primary" onClick={() => copy.mutate()} disabled={copy.isPending}>
              {copy.isPending && <Loader2 className="w-3 h-3 animate-spin" />} Copy
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-[12.5px] text-ink-500">
            Copies the requirements {facultyId ? 'for this faculty' : 'for all faculties'} from one academic year to another.
          </p>
          <div>
            <label className="label">From year</label>
            <select className="input" value={copyForm.from_year_id} onChange={(e) => setCopyForm({ ...copyForm, from_year_id: e.target.value })}>
              <option value="">—</option>
              {years.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">To year</label>
            <select className="input" value={copyForm.to_year_id} onChange={(e) => setCopyForm({ ...copyForm, to_year_id: e.target.value })}>
              <option value="">—</option>
              {years.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
            </select>
          </div>
        </div>
      </Modal>
    </section>
  )
}

function AddRow({
  docTypes, onAdd, busy,
}: {
  docTypes: any[]
  onAdd: (d: { document_type_id: number; is_required: 0 | 1; notes?: string }) => void
  busy: boolean
}) {
  const [docId, setDocId] = useState('')
  const [req, setReq]     = useState(true)
  const [notes, setNotes] = useState('')
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_2fr_auto] gap-2 items-end">
      <div>
        <label className="label">Document type</label>
        <select className="input" value={docId} onChange={(e) => setDocId(e.target.value)}>
          <option value="">—</option>
          {docTypes.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Required?</label>
        <select className="input" value={req ? '1' : '0'} onChange={(e) => setReq(e.target.value === '1')}>
          <option value="1">Required</option>
          <option value="0">Optional</option>
        </select>
      </div>
      <div>
        <label className="label">Notes (optional)</label>
        <input className="input" placeholder="e.g. Must be certified" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <button
        className="btn-primary"
        disabled={!docId || busy}
        onClick={() => {
          onAdd({ document_type_id: Number(docId), is_required: req ? 1 : 0, notes: notes || undefined })
          setDocId(''); setNotes(''); setReq(true)
        }}
      >
        {busy && <Loader2 className="w-3 h-3 animate-spin" />} Add
      </button>
    </div>
  )
}
