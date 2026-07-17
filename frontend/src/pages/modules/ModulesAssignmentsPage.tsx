import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '@/components/ui/Modal'
import {
  moduleAssignmentService,
  moduleCatalogService,
} from '@/services/modulesService'
import { academicService } from '@/services/academicService'
import { hrService } from '@/services/hrService'
import type { ModuleAssignment, AssignmentPayload } from '@/types/modules'
import { PERMISSIONS } from '@/constants'
import { usePermission } from '@/utils/permissions'

const EMPTY: AssignmentPayload = {
  module_id: 0, staff_id: 0, academic_term_id: 0,
  role: 'primary', hours_per_week: 0, notes: '',
}

export default function ModulesAssignmentsPage() {
  const canManage = usePermission(PERMISSIONS.MANAGE_MODULE_ASSIGNMENTS)
  const qc = useQueryClient()

  const termsQ = useQuery({ queryKey: ['academic', 'terms'], queryFn: () => academicService.listTerms() })
  const terms = termsQ.data?.data ?? []
  const [termId, setTermId] = useState<number>(0)
  useEffect(() => {
    if (!termId && terms.length) {
      const current = terms.find((t: any) => t.is_current) ?? terms[0]
      setTermId(current.id)
    }
  }, [terms, termId])

  const listQ = useQuery({
    queryKey: ['modules', 'assignments', termId],
    queryFn: () => moduleAssignmentService.list({ term_id: termId }),
    enabled: !!termId,
  })
  const workloadQ = useQuery({
    queryKey: ['modules', 'assignments', 'workload', termId],
    queryFn: () => moduleAssignmentService.workload(termId),
    enabled: !!termId,
  })

  const [editing, setEditing] = useState<ModuleAssignment | Partial<ModuleAssignment> | null>(null)

  const remove = useMutation({
    mutationFn: (id: number) => moduleAssignmentService.remove(id),
    onSuccess: () => {
      toast.success('Assignment removed')
      qc.invalidateQueries({ queryKey: ['modules', 'assignments'] })
    },
  })

  const rows = listQ.data?.data ?? []
  const workload = workloadQ.data?.data ?? []

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-ink-900 dark:text-white">Faculty ↔ Module Assignments</h2>
          <p className="text-[13px] text-ink-500">Pick a term; assign staff to modules and monitor workload.</p>
        </div>
        <div className="flex gap-2 items-center">
          <select
            className="input input-sm w-56"
            value={termId || ''}
            onChange={(e) => setTermId(Number(e.target.value))}
          >
            <option value="" disabled>Select term…</option>
            {terms.map((t: any) => (
              <option key={t.id} value={t.id}>
                {t.label}{t.is_current ? ' (current)' : ''}
              </option>
            ))}
          </select>
          {canManage && (
            <button
              className="btn-primary btn-sm"
              disabled={!termId}
              onClick={() => setEditing({ academic_term_id: termId })}
            >
              <Plus className="w-3.5 h-3.5" /> New assignment
            </button>
          )}
        </div>
      </div>

      {!termId ? (
        <div className="card p-8 text-center text-ink-400">Pick an academic term to begin.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Assignments table */}
          <div className="card overflow-hidden lg:col-span-3">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="bg-ink-50 dark:bg-ink-800/50 border-b border-ink-100 dark:border-ink-700">
                  <th className="px-4 py-2.5 font-bold text-ink-400 text-[10px] uppercase">Module</th>
                  <th className="px-4 py-2.5 font-bold text-ink-400 text-[10px] uppercase">Staff</th>
                  <th className="px-4 py-2.5 font-bold text-ink-400 text-[10px] uppercase">Role</th>
                  <th className="px-4 py-2.5 font-bold text-ink-400 text-[10px] uppercase">Hrs/wk</th>
                  <th className="px-4 py-2.5 font-bold text-ink-400 text-[10px] uppercase text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                {listQ.isLoading ? (
                  <tr><td colSpan={5} className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" /></td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-ink-400">No assignments yet for this term.</td></tr>
                ) : rows.map((a) => (
                  <tr key={a.id} className="hover:bg-ink-50/50 dark:hover:bg-ink-700/20">
                    <td className="px-4 py-3 font-mono">{a.module_code} <span className="text-ink-500 font-sans">· {a.module_name}</span></td>
                    <td className="px-4 py-3">{a.staff_name ?? `#${a.staff_id}`}</td>
                    <td className="px-4 py-3">{a.role}</td>
                    <td className="px-4 py-3">{String(a.hours_per_week)}</td>
                    <td className="px-4 py-3 text-right">
                      {canManage && (
                        <div className="flex items-center justify-end gap-1">
                          <button className="icon-btn" onClick={() => setEditing(a)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button className="icon-btn text-red-500" onClick={() => confirm('Remove this assignment?') && remove.mutate(a.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Workload */}
          <div className="card p-0 lg:col-span-2 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-ink-100 dark:border-ink-700 font-semibold text-[13px]">
              Workload by staff
            </div>
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="bg-ink-50 dark:bg-ink-800/50 border-b border-ink-100 dark:border-ink-700">
                  <th className="px-4 py-2 font-bold text-ink-400 text-[10px] uppercase">Staff</th>
                  <th className="px-4 py-2 font-bold text-ink-400 text-[10px] uppercase">Modules</th>
                  <th className="px-4 py-2 font-bold text-ink-400 text-[10px] uppercase">Hrs/wk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                {workloadQ.isLoading ? (
                  <tr><td colSpan={3} className="p-6 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-brand" /></td></tr>
                ) : workload.length === 0 ? (
                  <tr><td colSpan={3} className="p-6 text-center text-ink-400">No data.</td></tr>
                ) : workload.map((w) => {
                  const hours = Number(w.total_hours)
                  const over = hours > 18
                  return (
                    <tr key={w.staff_id} className={over ? 'bg-amber-50/70 dark:bg-amber-500/10' : ''}>
                      <td className="px-4 py-2">{w.staff_name}</td>
                      <td className="px-4 py-2">{w.module_count}</td>
                      <td className="px-4 py-2 font-semibold">{hours.toFixed(1)}{over && <span className="text-amber-700 ml-1 text-[11px]">over</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing !== null && termId > 0 && (
        <AssignmentModal
          assignment={editing}
          termId={termId}
          onClose={() => setEditing(null)}
          onSuccess={() => {
            setEditing(null)
            qc.invalidateQueries({ queryKey: ['modules', 'assignments'] })
          }}
        />
      )}
    </div>
  )
}

// ─── Modal ─────────────────────────────────────────────────────────────────
interface AssignmentModalProps {
  assignment: ModuleAssignment | Partial<ModuleAssignment>
  termId:     number
  onClose:    () => void
  onSuccess:  () => void
}

function AssignmentModal({ assignment, termId, onClose, onSuccess }: AssignmentModalProps) {
  const isEdit = Boolean((assignment as ModuleAssignment).id)

  const modulesQ = useQuery({
    queryKey: ['modules', 'catalog-for-assignment'],
    queryFn: () => moduleCatalogService.list({ per_page: 200, status: 'active' }),
  })
  const staffQ = useQuery({
    queryKey: ['hr', 'employees', 'for-assignment'],
    queryFn: () => hrService.listEmployees({ per_page: 200 }),
  })

  const [form, setForm] = useState<AssignmentPayload>({
    ...EMPTY,
    module_id:         assignment.module_id        ?? 0,
    staff_id:          assignment.staff_id         ?? 0,
    academic_term_id:  termId,
    role:              (assignment.role as any)    ?? 'primary',
    hours_per_week:    Number(assignment.hours_per_week ?? 0),
    notes:             (assignment.notes as any)   ?? '',
  })

  const save = useMutation({
    mutationFn: () => (isEdit
      ? moduleAssignmentService.update((assignment as ModuleAssignment).id, form)
      : moduleAssignmentService.create(form)) as Promise<any>,
    onSuccess: () => {
      toast.success(isEdit ? 'Assignment updated' : 'Assignment created')
      onSuccess()
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Save failed'),
  })

  const modules = modulesQ.data?.data?.data ?? []
  const staff = staffQ.data?.data?.data ?? []

  const canSubmit =
    form.module_id > 0 && form.staff_id > 0 && form.academic_term_id > 0

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? 'Edit assignment' : 'New assignment'}
      size="md"
      footer={
        <>
          <button className="btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn-primary btn-sm" disabled={!canSubmit || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : isEdit ? 'Save' : 'Create'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block text-[13px]">
          <span className="text-ink-600 block mb-1">Module</span>
          <select
            className="input input-sm w-full"
            value={form.module_id || ''}
            onChange={(e) => setForm({ ...form, module_id: Number(e.target.value) })}
            disabled={isEdit}
          >
            <option value="" disabled>Pick a module</option>
            {modules.map((m) => (
              <option key={m.module_id} value={m.module_id}>
                {m.module_code} — {m.module_name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-[13px]">
          <span className="text-ink-600 block mb-1">Staff member</span>
          <select
            className="input input-sm w-full"
            value={form.staff_id || ''}
            onChange={(e) => setForm({ ...form, staff_id: Number(e.target.value) })}
            disabled={isEdit}
          >
            <option value="" disabled>Pick staff</option>
            {staff.map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.full_name} — {s.position ?? 'Staff'}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block text-[13px]">
            <span className="text-ink-600 block mb-1">Role</span>
            <select className="input input-sm w-full" value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as any })}>
              <option value="primary">Primary</option>
              <option value="assistant">Assistant</option>
            </select>
          </label>
          <label className="block text-[13px]">
            <span className="text-ink-600 block mb-1">Hours / week</span>
            <input type="number" step="0.5" className="input input-sm w-full"
              value={form.hours_per_week}
              onChange={(e) => setForm({ ...form, hours_per_week: Number(e.target.value) })} />
          </label>
        </div>

        <label className="block text-[13px]">
          <span className="text-ink-600 block mb-1">Notes</span>
          <textarea rows={2} className="input input-sm w-full"
            value={form.notes ?? ''}
            onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </label>
      </div>
    </Modal>
  )
}
