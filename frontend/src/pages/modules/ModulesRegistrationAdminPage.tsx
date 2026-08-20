import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Search, Users, Check, X, GraduationCap, BookOpen, CalendarDays, Building2, Plus, Mail, Phone, ExternalLink, BadgeCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import Modal from '@/components/ui/Modal'
import toast from 'react-hot-toast'
import {
  moduleRegistrationService,
  moduleCatalogService,
  moduleScheduleService,
} from '@/services/modulesService'
import { academicService } from '@/services/academicService'
import { academicsMgmtService } from '@/services/academicsMgmtService'
import { portalService } from '@/services/admissionService'
import { studentService } from '@/services/studentService'
import { useModulesScopeStore } from '@/store/modulesScopeStore'
import SearchableSelect from '@/components/ui/SearchableSelect'
import type { ModuleRegistration, Module } from '@/types/modules'
import { PERMISSIONS } from '@/constants'
import { usePermission } from '@/utils/permissions'

export default function ModulesRegistrationAdminPage() {
  const canManage = usePermission(PERMISSIONS.MANAGE_MODULE_REGISTRATIONS)
  const qc = useQueryClient()

  /* ── Term picker (same as scheduling) ── */
  const termsQ = useQuery({ queryKey: ['academic', 'terms'], queryFn: () => academicService.listTerms() })
  const terms = termsQ.data?.data ?? []
  const [termId, setTermId] = useState<number>(0)
  useEffect(() => {
    if (!termId && terms.length) {
      const current = terms.find((t: any) => t.is_current) ?? terms[0]
      setTermId(current.id)
    }
  }, [terms, termId])

  /* ── Shared scope: faculty + departments (persisted across tabs) ── */
  const gFaculty  = useModulesScopeStore((s) => s.facultyId)
  const gDepts    = useModulesScopeStore((s) => s.departmentIds)
  const setGFaculty = useModulesScopeStore((s) => s.setFaculty)
  const setGDepts   = useModulesScopeStore((s) => s.setDepartments)

  /* ── Reference data ── */
  const facultiesQ = useQuery({ queryKey: ['portal', 'faculties'], queryFn: () => portalService.getFaculties(), staleTime: 5 * 60_000 })
  const faculties: any[] = facultiesQ.data?.data ?? []
  const deptsQ = useQuery({ queryKey: ['acmgmt', 'departments', 'all'], queryFn: () => academicsMgmtService.list<any>('departments', { per_page: 200 }), staleTime: 5 * 60_000 })
  const allDepartments: any[] = deptsQ.data?.data?.data ?? []
  const departmentsForFaculty = useMemo(
    () => gFaculty ? allDepartments.filter((d: any) => Number(d.fac_id) === gFaculty) : [],
    [gFaculty, allDepartments],
  )

  /* ── Modules + schedules (limited to scope) ── */
  const modulesQ = useQuery({
    queryKey: ['modules', 'catalog-all-for-reg'],
    queryFn:  () => moduleCatalogService.list({ per_page: 500, status: 'active' }),
  })
  const allModules: Module[] = modulesQ.data?.data?.data ?? []

  const schedulesQ = useQuery({
    queryKey: ['modules', 'schedules', termId],
    queryFn:  () => moduleScheduleService.list({ term_id: termId }),
    enabled:  !!termId,
  })
  const allSchedules = schedulesQ.data?.data ?? []

  // Modules constrained to the picked departments
  const scopedModules = useMemo(() => {
    if (!gDepts.length) return [] as Module[]
    return allModules.filter((m) => gDepts.includes(Number(m.department)))
  }, [allModules, gDepts])

  // Split scheduled vs. not-scheduled — only scheduled modules are enrollable;
  // the rest are listed far below for awareness.
  const scheduledModuleIds = useMemo(() => {
    const ids = new Set<number>()
    allSchedules.forEach((s: any) => ids.add(Number(s.module_id)))
    return ids
  }, [allSchedules])
  const scheduledScopedModules = useMemo(() => scopedModules.filter((m) => scheduledModuleIds.has(m.module_id)), [scopedModules, scheduledModuleIds])

  // Schedule entries belonging to scoped modules — used to mark "scheduled" badge & get any schedule snippet for display
  const schedByModule = useMemo(() => {
    const m = new Map<number, any[]>()
    allSchedules.forEach((s: any) => {
      if (!m.has(s.module_id)) m.set(s.module_id, [])
      m.get(s.module_id)!.push(s)
    })
    return m
  }, [allSchedules])

  /* ── Selected module (drives student list + enrollments) ── */
  const [selectedModuleId, setSelectedModuleId] = useState<number>(0)
  // Reset module selection when scope changes
  useEffect(() => { setSelectedModuleId(0) }, [gFaculty, gDepts.join(','), termId])

  const selectedModule = scopedModules.find((m) => m.module_id === selectedModuleId) ?? null

  /* ── Existing registrations for selected module / term ── */
  const regsQ = useQuery({
    queryKey: ['modules', 'registrations', termId, selectedModuleId],
    queryFn:  () => moduleRegistrationService.list({ term_id: termId, module_id: selectedModuleId }),
    enabled:  !!termId && !!selectedModuleId,
  })
  const existingRegs: ModuleRegistration[] = regsQ.data?.data ?? []
  const existingRegnumbers = useMemo(() => new Set(existingRegs.map((r) => r.student_regnumber).filter(Boolean)), [existingRegs])

  /* ── Eligible students: same dept(s) + same term/year (uses department NAMES because student.department stores ID-as-string) ── */
  const [studentSearch, setStudentSearch] = useState('')

  // The students API filters by single faculty/department string (numeric ID stored as varchar).
  // For multi-dept scope we call once per department and merge — there are usually only a few.
  const studentsQs = useQuery({
    queryKey: ['students', 'for-enroll', gFaculty, gDepts.join(','), studentSearch],
    queryFn: async () => {
      if (!gFaculty || !gDepts.length) return { data: [] as any[], total: 0 }
      // Per-dept calls in parallel; merge & dedupe; client-side paginate (50 per page).
      const results = await Promise.all(
        gDepts.map((depId) =>
          studentService.list({
            per_page: 200, page: 1, faculty: String(gFaculty), department: String(depId),
            q: studentSearch || undefined, student_state: 'active',
          })
        )
      )
      const seen = new Set<string>()
      const merged: any[] = []
      results.forEach((res) => {
        (res.data?.data ?? []).forEach((s: any) => {
          const reg = s.regnumber || s.student_regnumber
          if (!reg || seen.has(reg)) return
          seen.add(reg); merged.push(s)
        })
      })
      return { data: merged, total: merged.length }
    },
    enabled: !!gFaculty && gDepts.length > 0,
  })
  const allEligibleStudents: any[] = studentsQs.data?.data ?? []

  // Show every student in scope (no pagination). Enrolled rows get a different
  // visual treatment (green "Enrolled" pill instead of the brand "Enroll" button)
  // but they remain visible so admins can confirm the cohort at a glance.
  const totalEligible = allEligibleStudents.length
  const totalUnregistered = useMemo(
    () => allEligibleStudents.filter((s: any) => {
      const reg = s.regnumber || s.student_regnumber
      return reg && !existingRegnumbers.has(reg)
    }).length,
    [allEligibleStudents, existingRegnumbers],
  )

  /* ── Selection state for bulk enroll ── */
  const [selected, setSelected] = useState<Set<string>>(new Set())
  useEffect(() => { setSelected(new Set()) }, [selectedModuleId])

  // Student detail modal
  const [previewStudent, setPreviewStudent] = useState<any | null>(null)

  const toggleStudent = (reg: string) => {
    if (existingRegnumbers.has(reg)) return
    setSelected((prev) => { const n = new Set(prev); if (n.has(reg)) n.delete(reg); else n.add(reg); return n })
  }
  const selectAllEligibleAll = () => {
    setSelected((prev) => {
      const n = new Set(prev)
      allEligibleStudents.forEach((s: any) => {
        const reg = s.regnumber || s.student_regnumber
        if (reg && !existingRegnumbers.has(reg)) n.add(reg)
      })
      return n
    })
  }
  const clearSelection = () => setSelected(new Set())

  /* ── Enroll mutations ── (force=true: admin path bypasses level/prereq checks;
       enrollment is bound to the module's term, not the globally-selected year.) */
  const bulkEnroll = useMutation({
    mutationFn: () => moduleRegistrationService.bulkRegister({
      module_id: selectedModuleId,
      academic_term_id: termId,
      student_regnumbers: Array.from(selected),
      force: true,
    }),
    onSuccess: (res: any) => {
      const data = res.data
      if (data?.created > 0) toast.success(`${data.created} students enrolled${data.skipped ? ` · ${data.skipped} skipped` : ''}`)
      else toast(`Nothing added — ${data?.skipped ?? 0} skipped`, { icon: 'ℹ️' })
      data?.errors?.slice(0, 5).forEach((e: any) => toast.error(`${e.regnumber}: ${e.reason}`, { duration: 5000 }))
      setSelected(new Set())
      qc.invalidateQueries({ queryKey: ['modules', 'registrations'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Bulk registration failed'),
  })

  const singleEnroll = useMutation({
    mutationFn: (reg: string) => moduleRegistrationService.create({
      module_id: selectedModuleId,
      academic_term_id: termId,
      student_regnumber: reg,
      status: 'registered',
      force: true,
    } as any),
    onSuccess: (_: any, reg: string) => {
      toast.success(`${reg} enrolled`)
      setSelected((prev) => { const n = new Set(prev); n.delete(reg); return n })
      qc.invalidateQueries({ queryKey: ['modules', 'registrations'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Enrollment failed'),
  })

  const enrolledCount = existingRegs.filter((r) => r.status === 'registered').length

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-ink-900 dark:text-white">Student Module Registrations</h2>
          <p className="text-[13px] text-ink-500">Pick a faculty and department, choose a scheduled module, then enroll students from that scope.</p>
        </div>
        <select className="input input-sm w-56" value={termId || ''} onChange={(e) => setTermId(Number(e.target.value))}>
          <option value="" disabled>Select term…</option>
          {terms.map((t: any) => (
            <option key={t.id} value={t.id}>{t.label}{t.is_current ? ' (current)' : ''}</option>
          ))}
        </select>
      </div>

      {/* ── Cascading scope filter (shared with Scheduling) ── */}
      <div className="card p-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          <div>
            <label className="text-[10px] uppercase tracking-wide font-bold text-ink-400 mb-1 flex items-center gap-1">
              <span className="w-4 h-4 rounded-full bg-brand text-white inline-flex items-center justify-center text-[9px] font-bold">1</span>
              Faculty
            </label>
            <SearchableSelect
              options={faculties.map((f: any) => ({ value: f.id, label: f.name }))}
              value={gFaculty}
              onChange={(v) => { setGFaculty(Number(v)) }}
              allLabel="Select faculty…"
            />
          </div>
          <div>
            <label className={`text-[10px] uppercase tracking-wide font-bold mb-1 flex items-center gap-1 ${gFaculty ? 'text-ink-400' : 'text-ink-300'}`}>
              <span className={`w-4 h-4 rounded-full inline-flex items-center justify-center text-[9px] font-bold ${gFaculty ? 'bg-brand text-white' : 'bg-ink-200 text-ink-400'}`}>2</span>
              Departments
            </label>
            <div className={!gFaculty ? 'opacity-50 pointer-events-none' : ''}>
              {/* Quick chip multi-select */}
              <div className="flex flex-wrap gap-1.5">
                {departmentsForFaculty.length === 0 ? (
                  <span className="text-[12px] text-ink-400 py-1">{gFaculty ? 'No departments under this faculty.' : 'Pick a faculty first.'}</span>
                ) : departmentsForFaculty.map((d: any) => {
                  const id = Number(d.dep_id)
                  const active = gDepts.includes(id)
                  return (
                    <button key={id} type="button"
                      className={`text-[12px] px-2.5 py-1 rounded-full border transition-colors ${active ? 'bg-brand/10 text-brand border-brand/40' : 'border-ink-200 dark:border-ink-700 hover:border-brand hover:text-brand'}`}
                      onClick={() => setGDepts(active ? gDepts.filter((x) => x !== id) : [...gDepts, id])}>
                      {active && <Check className="w-3 h-3 inline mr-1" />}{d.dep_name}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {!termId ? (
        <div className="card p-8 text-center text-ink-400">Pick an academic term to begin.</div>
      ) : !gFaculty ? (
        <div className="card p-10 text-center">
          <div className="w-14 h-14 rounded-full bg-brand/10 text-brand flex items-center justify-center mx-auto mb-3">
            <Building2 className="w-7 h-7" />
          </div>
          <h3 className="font-semibold text-ink-900 dark:text-white mb-1">Pick a faculty to start enrolling</h3>
          <p className="text-[13px] text-ink-500">Then choose one or more departments to load their modules and eligible students.</p>
        </div>
      ) : !gDepts.length ? (
        <div className="card p-10 text-center">
          <div className="w-14 h-14 rounded-full bg-brand/10 text-brand flex items-center justify-center mx-auto mb-3">
            <Building2 className="w-7 h-7" />
          </div>
          <h3 className="font-semibold text-ink-900 dark:text-white mb-1">Add at least one department</h3>
          <p className="text-[13px] text-ink-500">Click any department under <b>{faculties.find((f: any) => f.id === gFaculty)?.name ?? 'this faculty'}</b> above to continue.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* ── Left: module list (scoped) ── */}
          <div className="card lg:col-span-3 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-ink-100 dark:border-ink-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-brand" />
                <h3 className="font-semibold text-[13px]">Scheduled modules ({scheduledScopedModules.length})</h3>
              </div>
              <span className="text-[11px] text-ink-400">{gDepts.length} dept{gDepts.length === 1 ? '' : 's'}</span>
            </div>
            <div className="max-h-[520px] overflow-y-auto">
              {modulesQ.isLoading || schedulesQ.isLoading ? (
                <div className="p-6 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-brand" /></div>
              ) : scheduledScopedModules.length === 0 ? (
                <div className="p-6 text-center text-ink-400 text-[13px]">
                  No modules in this scope have a schedule for {terms.find((t: any) => t.id === termId)?.label ?? 'this term'} yet.
                </div>
              ) : scheduledScopedModules.map((m) => {
                const isSelected = m.module_id === selectedModuleId
                const sched = schedByModule.get(m.module_id) ?? []
                const dept = allDepartments.find((d: any) => Number(d.dep_id) === Number(m.department))
                return (
                  <button key={m.module_id} type="button"
                    className={`w-full text-left px-4 py-2.5 border-b border-ink-100/70 dark:border-ink-700/70 transition-colors ${isSelected ? 'bg-brand/5 border-l-[3px] border-l-brand' : 'hover:bg-ink-50 dark:hover:bg-ink-700/30'}`}
                    onClick={() => setSelectedModuleId(m.module_id)}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-semibold text-[12.5px] text-ink-900 dark:text-white">{m.module_code}</span>
                          <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                            <CalendarDays className="w-2.5 h-2.5" /> {sched.length}
                          </span>
                        </div>
                        <div className="text-[12px] text-ink-600 dark:text-ink-300 truncate">{m.module_name}</div>
                        <div className="text-[10.5px] text-ink-400 mt-0.5">{dept?.dep_name ?? '—'} · L{m.level} · {m.module_credits} cr</div>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-brand shrink-0" />}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Right: enrollment for selected module ── */}
          <div className="lg:col-span-9 space-y-4">
            {!selectedModule ? (
              <div className="card p-10 text-center">
                <div className="w-14 h-14 rounded-full bg-brand/10 text-brand flex items-center justify-center mx-auto mb-3">
                  <GraduationCap className="w-7 h-7" />
                </div>
                <h3 className="font-semibold text-ink-900 dark:text-white mb-1">Pick a module on the left</h3>
                <p className="text-[13px] text-ink-500">Once you select a module, eligible students from {gDepts.length === 1 ? 'this department' : `these ${gDepts.length} departments`} will appear here for enrollment.</p>
              </div>
            ) : (
              <>
                {/* Eligible-students panel */}
                <div className="card overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-ink-100 dark:border-ink-700 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <Users className="w-4 h-4 text-brand shrink-0" />
                      <div className="min-w-0">
                        <h3 className="font-semibold text-[13px] truncate">
                          <span className="font-mono">{selectedModule.module_code}</span>
                          <span className="text-ink-500"> · {selectedModule.module_name}</span>
                        </h3>
                        <span className="text-[11px] text-ink-400 flex items-center gap-2">
                          <span><b className="text-ink-600">{totalEligible}</b> in scope</span>
                          <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /><b>{enrolledCount}</b> enrolled</span>
                          <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-brand" /><b>{totalUnregistered}</b> can enroll</span>
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
                        <input className="input input-sm pl-8 w-56" placeholder="Search name or reg #…"
                          value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} />
                      </div>
                      <button className="btn-ghost btn-xs text-[12px]" onClick={selectAllEligibleAll} disabled={totalUnregistered === 0}>
                        Select all unenrolled
                      </button>
                    </div>
                  </div>

                  <div className="max-h-[640px] overflow-y-auto">
                    {studentsQs.isLoading ? (
                      <div className="p-6 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-brand" /></div>
                    ) : allEligibleStudents.length === 0 ? (
                      <div className="p-8 text-center text-ink-400 text-[13px]">
                        No students in this scope.
                      </div>
                    ) : (
                      <table className="w-full text-[12.5px]">
                        <thead className="sticky top-0 bg-white dark:bg-ink-900 z-[1]">
                          <tr className="border-b border-ink-100 dark:border-ink-700">
                            <th className="px-3 py-2 w-10">
                              {(() => {
                                const eligible = allEligibleStudents.filter((s: any) => { const reg = s.regnumber || s.student_regnumber; return reg && !existingRegnumbers.has(reg) })
                                const allChecked = eligible.length > 0 && eligible.every((s: any) => selected.has(s.regnumber || s.student_regnumber))
                                return (
                                  <input type="checkbox" className="rounded border-ink-300 text-brand"
                                    disabled={eligible.length === 0}
                                    checked={allChecked}
                                    onChange={selectAllEligibleAll} />
                                )
                              })()}
                            </th>
                            <th className="px-3 py-2 text-left text-[10px] uppercase font-bold text-ink-400">Reg #</th>
                            <th className="px-3 py-2 text-left text-[10px] uppercase font-bold text-ink-400">Name</th>
                            <th className="px-3 py-2 text-left text-[10px] uppercase font-bold text-ink-400">Level</th>
                            <th className="px-3 py-2 text-right text-[10px] uppercase font-bold text-ink-400">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-ink-100/50 dark:divide-ink-700/50">
                          {allEligibleStudents.map((s: any) => {
                            const reg = s.regnumber || s.student_regnumber
                            const enrolled = !!reg && existingRegnumbers.has(reg)
                            const isSelected = reg && selected.has(reg)
                            const rowClass = enrolled
                              ? 'bg-emerald-50/40 dark:bg-emerald-500/5 border-l-[3px] border-l-emerald-400'
                              : isSelected
                                ? 'bg-brand/5 dark:bg-brand/10 border-l-[3px] border-l-brand'
                                : 'hover:bg-ink-50 dark:hover:bg-ink-700/20 border-l-[3px] border-l-transparent'
                            return (
                              <tr key={s.id ?? reg}
                                className={`transition-colors cursor-pointer ${rowClass}`}
                                onClick={() => setPreviewStudent(s)}>
                                <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                                  {enrolled ? (
                                    <span className="w-4 h-4 rounded-full inline-flex items-center justify-center bg-emerald-500 text-white" title="Already enrolled">
                                      <Check className="w-3 h-3" />
                                    </span>
                                  ) : canManage ? (
                                    <button type="button"
                                      className={`w-4 h-4 rounded border inline-flex items-center justify-center ${isSelected ? 'bg-brand border-brand text-white' : 'border-ink-300 dark:border-ink-600'}`}
                                      onClick={() => reg && toggleStudent(reg)}>
                                      {isSelected && <Check className="w-3 h-3" />}
                                    </button>
                                  ) : null}
                                </td>
                                <td className={`px-3 py-2 font-mono ${enrolled ? 'text-emerald-800 dark:text-emerald-200' : 'text-ink-900 dark:text-white'}`}>{reg || '—'}</td>
                                <td className={`px-3 py-2 ${enrolled ? 'text-emerald-800 dark:text-emerald-200' : ''}`}>{s.fname} {s.lname}</td>
                                <td className="px-3 py-2 text-ink-500">L{s.current_level ?? '—'}</td>
                                <td className="px-3 py-2 text-right">
                                  {enrolled ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold border border-emerald-200 dark:border-emerald-500/30">
                                      <Check className="w-3 h-3" /> Enrolled
                                    </span>
                                  ) : canManage ? (
                                    <button
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-brand text-white text-[11px] font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors"
                                      disabled={singleEnroll.isPending}
                                      onClick={(e) => { e.stopPropagation(); reg && singleEnroll.mutate(reg) }}>
                                      <Plus className="w-3 h-3" /> Enroll
                                    </button>
                                  ) : null}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>

                  <div className="px-4 py-2.5 border-t border-ink-100 dark:border-ink-700 flex items-center justify-between gap-2 flex-wrap bg-ink-50/40 dark:bg-ink-800/30">
                    <div className="flex items-center gap-2 text-[12px] text-ink-500">
                      <span><b className="text-ink-700">{selected.size}</b> selected of {totalUnregistered} unenrolled</span>
                      {selected.size > 0 && <button onClick={clearSelection} className="hover:text-red-500"><X className="w-3 h-3 inline" /> clear</button>}
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-2">
                        <button className="btn-primary btn-sm"
                          disabled={selected.size === 0 || bulkEnroll.isPending}
                          onClick={() => bulkEnroll.mutate()}>
                          {bulkEnroll.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                          Enroll {selected.size} selected
                        </button>
                      </div>
                    )}
                  </div>
                </div>

              </>
            )}
          </div>
        </div>
      )}

      {/* Student detail modal — opens on row click */}
      {previewStudent && (
        <StudentPreviewModal
          student={previewStudent}
          onClose={() => setPreviewStudent(null)}
          enrolled={!!(previewStudent.regnumber || previewStudent.student_regnumber) && existingRegnumbers.has(previewStudent.regnumber || previewStudent.student_regnumber)}
          moduleCode={selectedModule?.module_code}
          moduleName={selectedModule?.module_name}
          onEnroll={() => {
            const reg = previewStudent.regnumber || previewStudent.student_regnumber
            if (reg) singleEnroll.mutate(reg)
            setPreviewStudent(null)
          }}
          enrolling={singleEnroll.isPending}
          deptName={allDepartments.find((d: any) => Number(d.dep_id) === Number(previewStudent.department))?.dep_name}
          facName={faculties.find((f: any) => Number(f.id) === Number(previewStudent.faculty))?.name}
          canManage={canManage}
        />
      )}
    </div>
  )
}

/* ─── Student preview modal ───────────────────────────────────────── */
function StudentPreviewModal({
  student, onClose, enrolled, moduleCode, moduleName, onEnroll, enrolling, deptName, facName, canManage,
}: {
  student: any
  onClose: () => void
  enrolled: boolean
  moduleCode?: string
  moduleName?: string
  onEnroll: () => void
  enrolling: boolean
  deptName?: string
  facName?: string
  canManage: boolean
}) {
  const reg = student.regnumber || student.student_regnumber
  const fullName = [student.fname, student.lname].filter(Boolean).join(' ') || '—'
  const initials = fullName.split(' ').map((p: string) => p[0]).slice(0, 2).join('').toUpperCase()

  return (
    <Modal
      open
      onClose={onClose}
      title="Student details"
      size="md"
      footer={
        <div className="flex items-center justify-between w-full">
          <Link to={`/students/${student.id ?? reg}`}
            className="text-[12.5px] text-brand hover:underline inline-flex items-center gap-1">
            Open full profile <ExternalLink className="w-3 h-3" />
          </Link>
          <div className="flex items-center gap-2">
            <button className="btn-ghost btn-sm" onClick={onClose}>Close</button>
            {enrolled ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[12px] font-semibold border border-emerald-200">
                <Check className="w-3 h-3" /> Already enrolled
              </span>
            ) : canManage ? (
              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-brand text-white text-[12.5px] font-semibold hover:bg-brand-700 disabled:opacity-50"
                disabled={enrolling || !moduleCode}
                onClick={onEnroll}>
                {enrolling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Enroll{moduleCode ? ` in ${moduleCode}` : ''}
              </button>
            ) : null}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-brand/10 text-brand flex items-center justify-center text-[18px] font-bold shrink-0">
            {initials || '?'}
          </div>
          <div className="min-w-0">
            <h3 className="text-[16px] font-bold text-ink-900 dark:text-white truncate">{fullName}</h3>
            <div className="text-[12px] text-ink-500 font-mono">{reg || '—'}</div>
          </div>
        </div>

        {moduleCode && (
          <div className={`px-3 py-2 rounded-md border text-[12.5px] flex items-start gap-2 ${enrolled ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-brand/5 border-brand/20 text-ink-700 dark:text-ink-200'}`}>
            <BookOpen className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              {enrolled
                ? <>Currently enrolled in <b>{moduleCode}</b>{moduleName ? ` — ${moduleName}` : ''}.</>
                : <>Not enrolled in <b>{moduleCode}</b>{moduleName ? ` — ${moduleName}` : ''} yet.</>}
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 text-[12.5px]">
          <Field icon={Building2} label="Faculty" value={facName || (student.faculty ? `#${student.faculty}` : '—')} />
          <Field icon={Building2} label="Department" value={deptName || (student.department ? `#${student.department}` : '—')} />
          <Field icon={GraduationCap} label="Level" value={student.current_level ? `Year ${student.current_level}` : '—'} />
          <Field icon={BadgeCheck} label="Program" value={student.program || '—'} />
          <Field icon={Mail} label="Email" value={student.email || '—'} />
          <Field icon={Phone} label="Phone" value={student.phone || '—'} />
          <Field icon={BadgeCheck} label="Gender" value={student.gender || '—'} />
          <Field icon={BadgeCheck} label="Nationality" value={student.nationality || '—'} />
        </div>
      </div>
    </Modal>
  )
}

function Field({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="w-3.5 h-3.5 mt-0.5 text-ink-400 shrink-0" />
      <div className="min-w-0">
        <div className="text-[10.5px] uppercase tracking-wide font-bold text-ink-400">{label}</div>
        <div className="text-ink-800 dark:text-ink-200 truncate">{value}</div>
      </div>
    </div>
  )
}

