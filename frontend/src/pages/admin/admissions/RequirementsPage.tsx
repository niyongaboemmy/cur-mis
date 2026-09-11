import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ListChecks, Plus, Trash2, Loader2, Eye, EyeOff } from 'lucide-react'
import { admissionRequirementService, documentTypeService, portalService } from '@/services/admissionService'
import { PERMISSIONS } from '@/constants'
import { usePermission } from '@/utils/permissions'

export default function RequirementsPage() {
  const canManage = usePermission(PERMISSIONS.MANAGE_ADMISSION_REQUIREMENTS)
  const qc = useQueryClient()

  const facultiesQ = useQuery({ queryKey: ['portal', 'faculties'], queryFn: () => portalService.getFaculties() })
  const docTypesQ  = useQuery({ queryKey: ['admin', 'doctypes'],   queryFn: () => documentTypeService.list() })

  const [facultyId, setFacultyId] = useState<number | ''>('')
  const canQuery = !!facultyId

  const listQ = useQuery({
    queryKey: ['admin', 'requirements', facultyId],
    queryFn:  () => admissionRequirementService.getForFaculty(Number(facultyId)),
    enabled:  canQuery,
  })

  const create = useMutation({
    mutationFn: (d: { document_type_id: number; is_required: 0 | 1; notes?: string }) =>
      admissionRequirementService.create({
        faculty_id: Number(facultyId),
        ...d,
        is_required: Boolean(d.is_required),
      }),
    onSuccess: () => { toast.success('Requirement added'); qc.invalidateQueries({ queryKey: ['admin', 'requirements'] }) },
    onError:   (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  })

  const remove = useMutation({
    mutationFn: (id: number) => admissionRequirementService.remove(id),
    onSuccess: () => { toast.success('Requirement removed'); qc.invalidateQueries({ queryKey: ['admin', 'requirements'] }) },
    onError:   (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  })

  const toggleActive = useMutation({
    mutationFn: (id: number) => admissionRequirementService.toggleActive(id),
    onSuccess: (res) => {
      toast.success(res.data?.is_active ? 'Requirement activated' : 'Requirement deactivated — hidden from applicants')
      qc.invalidateQueries({ queryKey: ['admin', 'requirements'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  })

  const rows      = listQ.data?.data?.requirements ?? []
  const docTypes  = docTypesQ.data?.data ?? []
  const faculties = facultiesQ.data?.data ?? []

  return (
    <section className="card p-5">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <ListChecks className="w-5 h-5 text-brand" />
        <div>
          <h2 className="section-title">Admission requirements</h2>
          <p className="section-sub">Per-faculty document checklist — applies to every academic year.</p>
        </div>
      </div>

      {/* Faculty selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div>
          <label className="label">Faculty</label>
          <select className="input" value={facultyId} onChange={(e) => setFacultyId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">— pick faculty —</option>
            {faculties.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      {!canQuery ? (
        <p className="rounded-md border border-dashed border-ink-200 p-6 text-center text-ink-500 text-[13px]">
          Pick a faculty to see the checklist.
        </p>
      ) : listQ.isLoading ? (
        <p className="text-[13px] text-ink-500 p-4">Loading…</p>
      ) : (
        <>
          {/* Existing requirements */}
          {rows.length === 0 ? (
            <p className="rounded-md border border-dashed border-ink-200 p-6 text-center text-ink-500 text-[13px]">
              No requirements for this faculty yet. Add one below.
            </p>
          ) : (
            <table className="data-table mb-5">
              <thead><tr><th>Document</th><th>Required?</th><th>Active?</th><th>Notes</th><th className="text-right">Actions</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const active = r.is_active === undefined ? true : Boolean(r.is_active)
                  return (
                    <tr key={r.id} className={active ? undefined : 'opacity-60'}>
                      <td className="font-medium text-ink-900 dark:text-ink-100">
                        {r.document_type_name ?? `#${r.document_type_id}`}
                        {r.document_type_active === 0 && (
                          <span className="ml-2 chip-soft text-[10px]">inactive type</span>
                        )}
                      </td>
                      <td>{r.is_required ? <span className="chip-primary">Required</span> : <span className="chip-soft">Optional</span>}</td>
                      <td>
                        {active
                          ? <span className="chip-success">Active</span>
                          : <span className="chip-soft" title="Hidden from the applicant upload checklist">Inactive</span>}
                      </td>
                      <td className="text-ink-500 text-[12.5px]">{r.notes || '—'}</td>
                      <td className="text-right">
                        {canManage && (
                          <div className="inline-flex items-center gap-1">
                            <button
                              className={active
                                ? 'icon-btn text-amber-600 hover:text-amber-700 hover:bg-amber-50'
                                : 'icon-btn text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50'}
                              title={active ? 'Deactivate — hide from applicants' : 'Activate — show to applicants'}
                              onClick={() => toggleActive.mutate(r.id)}
                              disabled={toggleActive.isPending && toggleActive.variables === r.id}
                            >
                              {toggleActive.isPending && toggleActive.variables === r.id
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : active ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              className="icon-btn text-red-500 hover:text-red-600 hover:bg-red-50"
                              title="Delete permanently"
                              onClick={() => remove.mutate(r.id)}
                              disabled={remove.isPending && remove.variables === r.id}
                            >
                              {remove.isPending && remove.variables === r.id
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          {/* Add new */}
          {canManage && (
            <div className="rounded-md border border-ink-100 p-4 bg-ink-50">
              <p className="text-[13px] font-semibold mb-3 flex items-center gap-1.5"><Plus className="w-3.5 h-3.5 text-brand" /> Add requirement</p>
              <AddRow docTypes={docTypes} onAdd={(v) => create.mutate(v)} busy={create.isPending} />
            </div>
          )}
        </>
      )}
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
