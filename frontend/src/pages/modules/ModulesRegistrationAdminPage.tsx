import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Loader2, Save, Search, Users, Check, X, UserPlus } from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '@/components/ui/Modal'
import {
  moduleRegistrationService,
  moduleCatalogService,
} from '@/services/modulesService'
import { academicService } from '@/services/academicService'
import { studentService } from '@/services/studentService'
import type { ModuleRegistration } from '@/types/modules'

export default function ModulesRegistrationAdminPage() {
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

  const [filters, setFilters] = useState<{ regnumber: string; status: string; module_id: string }>({
    regnumber: '', status: '', module_id: '',
  })

  const modulesQ = useQuery({
    queryKey: ['modules', 'catalog-for-reg-filter'],
    queryFn: () => moduleCatalogService.list({ per_page: 200, status: 'active' }),
  })
  const modulesList = modulesQ.data?.data?.data ?? []

  const listQ = useQuery({
    queryKey: ['modules', 'registrations', termId, filters],
    queryFn: () => moduleRegistrationService.list({
      term_id:   termId,
      regnumber: filters.regnumber || undefined,
      status:    filters.status || undefined,
      module_id: filters.module_id ? Number(filters.module_id) : undefined,
    }),
    enabled: !!termId,
  })
  const rows = listQ.data?.data ?? []

  const [enrolling, setEnrolling] = useState(false)

  const updateStatus = useMutation({
    mutationFn: ({ id, status, grade }: { id: number; status: ModuleRegistration['status']; grade?: string }) =>
      moduleRegistrationService.update(id, { status, grade }),
    onSuccess: () => {
      toast.success('Registration updated')
      qc.invalidateQueries({ queryKey: ['modules', 'registrations'] })
    },
  })
  const remove = useMutation({
    mutationFn: (id: number) => moduleRegistrationService.remove(id),
    onSuccess: () => {
      toast.success('Registration deleted')
      qc.invalidateQueries({ queryKey: ['modules', 'registrations'] })
    },
  })

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-ink-900 dark:text-white">Student Module Registrations</h2>
          <p className="text-[13px] text-ink-500">Admin view — enroll students to modules individually or in bulk.</p>
        </div>
        <div className="flex gap-2 items-center">
          <select className="input input-sm w-56" value={termId || ''} onChange={(e) => setTermId(Number(e.target.value))}>
            <option value="" disabled>Select term…</option>
            {terms.map((t: any) => (
              <option key={t.id} value={t.id}>
                {t.label}{t.is_current ? ' (current)' : ''}
              </option>
            ))}
          </select>
          <button className="btn-primary btn-sm" disabled={!termId} onClick={() => setEnrolling(true)}>
            <UserPlus className="w-3.5 h-3.5" /> Enroll students
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-3 flex gap-2 flex-wrap items-end">
        <input className="input input-sm flex-1 min-w-[200px]" placeholder="Search reg number…"
          value={filters.regnumber}
          onChange={(e) => setFilters({ ...filters, regnumber: e.target.value })} />
        <select className="input input-sm w-48" value={filters.module_id}
          onChange={(e) => setFilters({ ...filters, module_id: e.target.value })}>
          <option value="">All modules</option>
          {modulesList.map((m) => (
            <option key={m.module_id} value={m.module_id}>{m.module_code} — {m.module_name}</option>
          ))}
        </select>
        <select className="input input-sm w-36" value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">Any status</option>
          <option value="registered">Registered</option>
          <option value="dropped">Dropped</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="bg-ink-50 dark:bg-ink-800/50 border-b border-ink-100 dark:border-ink-700">
              <th className="px-4 py-2.5 font-bold text-ink-400 text-[10px] uppercase">Reg #</th>
              <th className="px-4 py-2.5 font-bold text-ink-400 text-[10px] uppercase">Student</th>
              <th className="px-4 py-2.5 font-bold text-ink-400 text-[10px] uppercase">Module</th>
              <th className="px-4 py-2.5 font-bold text-ink-400 text-[10px] uppercase">Status</th>
              <th className="px-4 py-2.5 font-bold text-ink-400 text-[10px] uppercase">Grade</th>
              <th className="px-4 py-2.5 font-bold text-ink-400 text-[10px] uppercase text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
            {!termId ? (
              <tr><td colSpan={6} className="p-6 text-center text-ink-400">Pick a term to view registrations.</td></tr>
            ) : listQ.isLoading ? (
              <tr><td colSpan={6} className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-ink-400">No registrations match the filters.</td></tr>
            ) : rows.map((r) => (
              <RegistrationRow key={r.id} row={r} onSave={(s, g) => updateStatus.mutate({ id: r.id, status: s, grade: g })}
                onDelete={() => confirm('Delete this registration?') && remove.mutate(r.id)} />
            ))}
          </tbody>
        </table>
      </div>

      {enrolling && termId > 0 && (
        <EnrollStudentsModal
          termId={termId}
          onClose={() => setEnrolling(false)}
          onSuccess={() => {
            setEnrolling(false)
            qc.invalidateQueries({ queryKey: ['modules', 'registrations'] })
          }}
        />
      )}
    </div>
  )
}

// ─── Row with inline status/grade edit ─────────────────────────────────────
function RegistrationRow({
  row, onSave, onDelete,
}: {
  row: ModuleRegistration
  onSave: (status: ModuleRegistration['status'], grade?: string) => void
  onDelete: () => void
}) {
  const [status, setStatus] = useState<ModuleRegistration['status']>(row.status)
  const [grade, setGrade] = useState<string>(row.grade ?? '')
  const dirty = status !== row.status || (grade ?? '') !== (row.grade ?? '')

  return (
    <tr className="hover:bg-ink-50/50 dark:hover:bg-ink-700/20">
      <td className="px-4 py-3 font-mono">{row.student_regnumber}</td>
      <td className="px-4 py-3">{[row.student_fname, row.student_lname].filter(Boolean).join(' ') || '—'}</td>
      <td className="px-4 py-3">
        <span className="font-mono">{row.module_code}</span>
        <span className="text-ink-500 ml-1">— {row.module_name}</span>
      </td>
      <td className="px-4 py-3">
        <select className="input input-xs w-32" value={status}
          onChange={(e) => setStatus(e.target.value as ModuleRegistration['status'])}>
          <option value="registered">Registered</option>
          <option value="dropped">Dropped</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>
      </td>
      <td className="px-4 py-3">
        <input className="input input-xs w-20" placeholder="—"
          value={grade} onChange={(e) => setGrade(e.target.value)} />
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1">
          <button className="icon-btn" disabled={!dirty} onClick={() => onSave(status, grade || undefined)}>
            <Save className={`w-3.5 h-3.5 ${dirty ? 'text-brand' : 'text-ink-300'}`} />
          </button>
          <button className="icon-btn text-red-500" onClick={onDelete}>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  )
}

// ─── Enhanced Enroll Students Modal ─────────────────────────────────────────
function EnrollStudentsModal({
  termId, onClose, onSuccess,
}: { termId: number; onClose: () => void; onSuccess: () => void }) {
  const [moduleId, setModuleId] = useState<number>(0)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [force, setForce] = useState(false)

  const modulesQ = useQuery({
    queryKey: ['modules', 'catalog-for-enroll'],
    queryFn: () => moduleCatalogService.list({ per_page: 200, status: 'active' }),
  })
  const modules = modulesQ.data?.data?.data ?? []

  const studentsQ = useQuery({
    queryKey: ['students', 'for-enroll', search, page],
    queryFn: () => studentService.list({ per_page: 50, page, q: search || undefined }),
  })
  const students = studentsQ.data?.data?.data ?? []
  const totalStudents = studentsQ.data?.data?.total ?? 0
  const lastPage = studentsQ.data?.data?.last_page ?? 1

  // Reset page when search changes
  useEffect(() => { setPage(1) }, [search])

  const toggleStudent = (regnumber: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(regnumber)) next.delete(regnumber)
      else next.add(regnumber)
      return next
    })
  }

  const selectAll = () => {
    const regnumbers = students.map((s: any) => s.regnumber).filter(Boolean) as string[]
    setSelected((prev) => {
      const next = new Set(prev)
      regnumbers.forEach((r) => next.add(r))
      return next
    })
  }

  const deselectAll = () => {
    const regnumbers = new Set(students.map((s: any) => s.regnumber).filter(Boolean))
    setSelected((prev) => {
      const next = new Set(prev)
      regnumbers.forEach((r) => next.delete(r))
      return next
    })
  }

  const allOnPageSelected = useMemo(() => {
    const regnumbers = students.map((s: any) => s.regnumber).filter(Boolean) as string[]
    return regnumbers.length > 0 && regnumbers.every((r) => selected.has(r))
  }, [students, selected])

  const bulkRegister = useMutation({
    mutationFn: () => moduleRegistrationService.bulkRegister({
      module_id: moduleId,
      academic_term_id: termId,
      student_regnumbers: Array.from(selected),
      force,
    }),
    onSuccess: (res: any) => {
      const data = res.data
      const msg = `${data.created} enrolled, ${data.skipped} skipped`
      if (data.created > 0) toast.success(msg)
      else toast(msg, { icon: 'ℹ️' })
      if (data.errors?.length) {
        data.errors.slice(0, 5).forEach((e: any) =>
          toast.error(`${e.regnumber}: ${e.reason}`, { duration: 5000 })
        )
      }
      onSuccess()
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Bulk registration failed'),
  })

  // Single student register
  const singleRegister = useMutation({
    mutationFn: (regnumber: string) => moduleRegistrationService.create({
      module_id: moduleId,
      student_regnumber: regnumber,
      academic_term_id: termId,
      force,
    }),
    onSuccess: (_: any, regnumber: string) => {
      toast.success(`${regnumber} enrolled`)
      setSelected((prev) => { const n = new Set(prev); n.delete(regnumber); return n })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Registration failed'),
  })

  const canSubmit = moduleId > 0 && selected.size > 0

  return (
    <Modal
      open
      onClose={onClose}
      title="Enroll Students to Module"
      size="xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2 text-[13px] text-ink-500">
            <Users className="w-4 h-4" />
            <span>{selected.size} student{selected.size !== 1 ? 's' : ''} selected</span>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-ghost btn-sm" onClick={onClose}>Cancel</button>
            <button
              className="btn-primary btn-sm"
              disabled={!canSubmit || bulkRegister.isPending}
              onClick={() => bulkRegister.mutate()}
            >
              {bulkRegister.isPending ? 'Enrolling…' : `Enroll ${selected.size} student${selected.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        {/* Module picker */}
        <label className="block text-[13px]">
          <span className="text-ink-600 block mb-1 font-semibold">Module</span>
          <select
            className="input input-sm w-full"
            value={moduleId || ''}
            onChange={(e) => setModuleId(Number(e.target.value))}
          >
            <option value="" disabled>Pick a module to enroll students…</option>
            {modules.map((m) => (
              <option key={m.module_id} value={m.module_id}>
                {m.module_code} — {m.module_name} ({m.module_credits} cr)
              </option>
            ))}
          </select>
        </label>

        {/* Options */}
        <label className="inline-flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={force}
            onChange={(e) => setForce(e.target.checked)} />
          <span>Override eligibility checks (force register)</span>
        </label>

        {/* Student search & list */}
        <div className="border border-ink-100 dark:border-ink-700 rounded-lg overflow-hidden">
          <div className="p-2 bg-ink-50/50 dark:bg-ink-800/30 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                className="input input-sm pl-8 w-full"
                placeholder="Search students by name or reg number…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button
              className="btn-ghost btn-xs text-[12px]"
              onClick={allOnPageSelected ? deselectAll : selectAll}
            >
              {allOnPageSelected ? 'Deselect page' : 'Select page'}
            </button>
          </div>

          <div className="max-h-[360px] overflow-y-auto">
            {studentsQ.isLoading ? (
              <div className="p-6 text-center">
                <Loader2 className="w-5 h-5 animate-spin mx-auto text-brand" />
              </div>
            ) : students.length === 0 ? (
              <div className="p-6 text-center text-ink-400 text-[13px]">
                {search ? 'No students match your search.' : 'No students found.'}
              </div>
            ) : (
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 bg-white dark:bg-ink-900">
                  <tr className="border-b border-ink-100 dark:border-ink-700">
                    <th className="px-3 py-2 w-10"></th>
                    <th className="px-3 py-2 text-left text-[10px] uppercase font-bold text-ink-400">Reg #</th>
                    <th className="px-3 py-2 text-left text-[10px] uppercase font-bold text-ink-400">Name</th>
                    <th className="px-3 py-2 text-left text-[10px] uppercase font-bold text-ink-400">Department</th>
                    <th className="px-3 py-2 text-left text-[10px] uppercase font-bold text-ink-400">Level</th>
                    <th className="px-3 py-2 text-right text-[10px] uppercase font-bold text-ink-400">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100/50 dark:divide-ink-700/50">
                  {students.map((s: any) => {
                    const reg = s.regnumber ?? ''
                    const isSelected = selected.has(reg)
                    return (
                      <tr
                        key={s.id ?? reg}
                        className={`transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-brand/5 dark:bg-brand/10'
                            : 'hover:bg-ink-50 dark:hover:bg-ink-700/20'
                        }`}
                        onClick={() => reg && toggleStudent(reg)}
                      >
                        <td className="px-3 py-2 text-center">
                          <span className={`w-4 h-4 rounded border inline-flex items-center justify-center transition-colors ${
                            isSelected
                              ? 'bg-brand border-brand text-white'
                              : 'border-ink-300 dark:border-ink-600'
                          }`}>
                            {isSelected && <Check className="w-3 h-3" />}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-ink-900 dark:text-white">{reg || '—'}</td>
                        <td className="px-3 py-2">{s.fname} {s.lname}</td>
                        <td className="px-3 py-2 text-ink-500">{s.department ?? '—'}</td>
                        <td className="px-3 py-2 text-ink-500">{s.current_level ?? '—'}</td>
                        <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                          <button
                            className="btn-ghost btn-xs text-brand"
                            disabled={!moduleId || !reg || singleRegister.isPending}
                            onClick={() => reg && singleRegister.mutate(reg)}
                            title="Register this student immediately"
                          >
                            <Plus className="w-3 h-3" /> Enroll
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {lastPage > 1 && (
            <div className="px-3 py-2 border-t border-ink-100 dark:border-ink-700 flex items-center justify-between text-[12px] bg-ink-50/50 dark:bg-ink-800/30">
              <span className="text-ink-500">{totalStudents} students</span>
              <div className="flex items-center gap-2">
                <button className="btn-ghost btn-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
                <span className="text-ink-500">{page} / {lastPage}</span>
                <button className="btn-ghost btn-xs" disabled={page >= lastPage} onClick={() => setPage(p => p + 1)}>Next</button>
              </div>
            </div>
          )}
        </div>

        {/* Selected summary */}
        {selected.size > 0 && (
          <div className="flex items-center gap-2 text-[12px] text-ink-600 dark:text-ink-400">
            <div className="flex flex-wrap gap-1 flex-1 max-h-20 overflow-y-auto">
              {Array.from(selected).slice(0, 20).map((r) => (
                <span key={r} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand/10 text-brand text-[11px] font-medium">
                  {r}
                  <button onClick={() => toggleStudent(r)} className="hover:text-red-500">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
              {selected.size > 20 && (
                <span className="text-ink-400 text-[11px]">+{selected.size - 20} more</span>
              )}
            </div>
            <button className="btn-ghost btn-xs text-red-500" onClick={() => setSelected(new Set())}>
              Clear all
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}
