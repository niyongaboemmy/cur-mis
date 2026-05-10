import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Loader2,
  Search,
  Users,
  Check,
  X,
  GraduationCap,
  BookOpen,
  Plus,
  ListTree,
} from 'lucide-react'
import toast from 'react-hot-toast'
import SearchableSelect from '@/components/ui/SearchableSelect'
import { academicService } from '@/services/academicService'
import { academicsMgmtService } from '@/services/academicsMgmtService'
import { moduleCatalogService, moduleRegistrationService } from '@/services/modulesService'
import { studentService } from '@/services/studentService'
import { useSessionStorage } from '@/hooks/useSessionStorage'
import type { AcademicTerm } from '@/types/academic'
import type { Module, ModuleRegistration } from '@/types/modules'

/* ─────────────────────────────────────────────────────────────
   Academic Settings · Registrations
   Pick a program (option) → list every student in it → pick a
   module attached to that program → enroll one-by-one or in bulk.
   ───────────────────────────────────────────────────────────── */

type OptionRow = {
  id:            number
  name:          string
  code?:         string | null
  acro?:         string | null
  department_id?: number | null
  is_active?:    number | boolean | null
}

export default function RegistrationsPanel() {
  const qc = useQueryClient()

  /* ── Term picker (defaults to current) ───────────────────── */
  const termsQ = useQuery({ queryKey: ['academic', 'terms'], queryFn: () => academicService.listTerms() })
  const terms = (termsQ.data?.data ?? []) as AcademicTerm[]
  const [termId, setTermId] = useSessionStorage<number | ''>('regPanel.termId', '')
  useEffect(() => {
    if (!termId && terms.length) {
      const current = (terms.find((t: any) => t.is_current) ?? terms[0]) as any
      setTermId(current.id)
    }
  }, [terms, termId, setTermId])

  /* ── Program (option) picker ─────────────────────────────── */
  const programsQ = useQuery({
    queryKey: ['acmgmt', 'options', 'all'],
    queryFn:  () => academicsMgmtService.list<OptionRow>('options', { per_page: 1000 }),
    staleTime: 5 * 60_000,
  })
  const programs = (programsQ.data?.data?.data ?? []) as OptionRow[]
  const [programId, setProgramId] = useSessionStorage<number | ''>('regPanel.programId', '')
  const selectedProgram = useMemo(
    () => programs.find((p) => p.id === Number(programId)) ?? null,
    [programs, programId],
  )

  const programOptions = useMemo(
    () => programs.map((p) => ({
      value: p.id,
      label: p.name,
      sub:   [p.code, p.acro].filter(Boolean).join(' · '),
    })),
    [programs],
  )

  /* ── Modules linked to the program ───────────────────────── */
  const modulesQ = useQuery({
    queryKey: ['modules', 'by-program', programId],
    queryFn:  () => moduleCatalogService.list({ per_page: 500, program: Number(programId) }),
    enabled:  !!programId,
  })
  const programModules: Module[] = modulesQ.data?.data?.data ?? []

  const [moduleId, setModuleId] = useState<number>(0)
  useEffect(() => { setModuleId(0) }, [programId])

  const selectedModule = useMemo(
    () => programModules.find((m) => m.module_id === moduleId) ?? null,
    [programModules, moduleId],
  )

  const [moduleSearch, setModuleSearch] = useState('')
  const filteredProgramModules = useMemo(() => {
    const q = moduleSearch.trim().toLowerCase()
    if (!q) return programModules
    return programModules.filter((m) =>
      m.module_code.toLowerCase().includes(q) ||
      m.module_name.toLowerCase().includes(q)
    )
  }, [programModules, moduleSearch])

  /* ── Every prior registration for this module (any term, any status). The
   *    user wants "students in the programme who have NOT studied this
   *    module", so anyone with a prior record at all should drop out — not
   *    just current-term registrations. ─────────────────────────── */
  const regsQ = useQuery({
    queryKey: ['modules', 'registrations-all-terms', moduleId],
    queryFn:  () => moduleRegistrationService.list({ module_id: moduleId }),
    enabled:  !!moduleId,
  })
  const existingRegs: ModuleRegistration[] = regsQ.data?.data ?? []
  const studiedRegnumbers = useMemo(
    () => new Set(existingRegs.map((r) => r.student_regnumber).filter(Boolean)),
    [existingRegs],
  )
  // Distinguish "currently enrolled in this term" so the row UI can still
  // show an Enrolled chip for the active term, instead of just hiding.
  const enrolledThisTermRegnumbers = useMemo(
    () => new Set(
      existingRegs
        .filter((r) => r.status === 'registered' && Number(r.academic_term_id) === Number(termId))
        .map((r) => r.student_regnumber)
        .filter(Boolean),
    ),
    [existingRegs, termId],
  )

  /* ── Students in the program (scoped by std_option). Search and any other
   *    filters only apply when the admin types/picks them — by default we
   *    show every student whose programme matches. The admin can flip
   *    `showAll` if scoping-by-programme misses someone they expected. ── */
  const [studentSearch, setStudentSearch] = useState('')
  const [showAll, setShowAll] = useState(false)
  const studentsQ = useQuery({
    queryKey: ['students', 'by-program', programId, studentSearch, showAll],
    queryFn: () => studentService.list({
      per_page: 500,
      page: 1,
      std_option: showAll ? undefined : String(programId),
      q: studentSearch || undefined,
    }),
    enabled: !!programId,
  })
  const allStudents: any[] = studentsQ.data?.data?.data ?? []
  const totalInProgram = allStudents.length
  const programMatchEmpty = !showAll && !studentsQ.isLoading && totalInProgram === 0

  /* ── Selection state for bulk enroll ─────────────────────── */
  const [selected, setSelected] = useState<Set<string>>(new Set())
  useEffect(() => { setSelected(new Set()) }, [moduleId, programId])

  // The displayed list = students in this programme who have NOT studied
  // this module before. Already-enrolled-this-term still appear (to give a
  // visual confirmation) but the bulk of the panel is the "can enrol" set.
  const eligibleForEnroll = useMemo(
    () => allStudents.filter((s: any) => {
      const reg = s.regnumber || s.student_regnumber
      return !!reg && !studiedRegnumbers.has(reg)
    }),
    [allStudents, studiedRegnumbers],
  )
  const totalEligible = eligibleForEnroll.length
  const enrolledInScope = enrolledThisTermRegnumbers.size

  const toggleStudent = (reg: string) => {
    if (studiedRegnumbers.has(reg)) return
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(reg)) n.delete(reg); else n.add(reg)
      return n
    })
  }
  const selectAllEligible = () => {
    setSelected((prev) => {
      const n = new Set(prev)
      eligibleForEnroll.forEach((s: any) => {
        const reg = s.regnumber || s.student_regnumber
        if (reg) n.add(reg)
      })
      return n
    })
  }
  const clearSelection = () => setSelected(new Set())
  const allEligibleChecked = totalEligible > 0
    && eligibleForEnroll.every((s: any) => selected.has(s.regnumber || s.student_regnumber))
  const onHeaderToggle = () => {
    if (allEligibleChecked) clearSelection(); else selectAllEligible()
  }

  /* ── Mutations (force=true: admin path bypasses prereq/level checks) ── */
  const bulkEnroll = useMutation({
    mutationFn: () => moduleRegistrationService.bulkRegister({
      module_id: moduleId,
      academic_term_id: Number(termId),
      student_regnumbers: Array.from(selected),
      force: true,
    }),
    onSuccess: (res: any) => {
      const data = res.data
      if (data?.created > 0) toast.success(`${data.created} students enrolled${data.skipped ? ` · ${data.skipped} skipped` : ''}`)
      else toast(`Nothing added — ${data?.skipped ?? 0} skipped`)
      data?.errors?.slice(0, 5).forEach((e: any) => toast.error(`${e.regnumber}: ${e.reason}`, { duration: 5000 }))
      setSelected(new Set())
      qc.invalidateQueries({ queryKey: ['modules', 'registrations'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Bulk registration failed'),
  })

  const singleEnroll = useMutation({
    mutationFn: (reg: string) => moduleRegistrationService.create({
      module_id: moduleId,
      academic_term_id: Number(termId),
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

  /* ── Render ──────────────────────────────────────────────── */
  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-ink-900 dark:text-white">Program registrations</h2>
          <p className="text-[13px] text-ink-500">
            Search a program, see every student in it, and enroll them in any module attached to that program.
          </p>
        </div>
        <select
          className="input input-sm w-56"
          value={termId || ''}
          onChange={(e) => setTermId(Number(e.target.value))}
        >
          <option value="" disabled>Select term…</option>
          {terms.map((t: any) => (
            <option key={t.id} value={t.id}>{t.label}{t.is_current ? ' (current)' : ''}</option>
          ))}
        </select>
      </div>

      {/* ── Program search ── */}
      <div className="card p-3">
        <label className="text-[10px] uppercase tracking-wide font-bold text-ink-400 mb-1 flex items-center gap-1">
          <span className="w-4 h-4 rounded-full bg-brand text-white inline-flex items-center justify-center text-[9px] font-bold">1</span>
          Program
        </label>
        <SearchableSelect
          options={programOptions}
          value={programId}
          onChange={(v) => setProgramId(v ? Number(v) : '')}
          placeholder="Search program by name, code or acronym…"
          allLabel="Select program…"
        />
        {selectedProgram && (
          <div className="mt-2 text-[12px] text-ink-500 flex items-center gap-2 flex-wrap">
            <ListTree className="w-3.5 h-3.5" />
            <span className="font-mono text-ink-700 dark:text-ink-200">{selectedProgram.code ?? '—'}</span>
            <span>·</span>
            <span>{selectedProgram.name}</span>
            {selectedProgram.acro && <span className="text-ink-400">({selectedProgram.acro})</span>}
            <span className="ml-auto inline-flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              <b className="text-ink-700">{totalInProgram}</b> students
            </span>
          </div>
        )}
      </div>

      {!termId ? (
        <div className="card p-8 text-center text-ink-400">Pick an academic term to begin.</div>
      ) : !programId ? (
        <div className="card p-10 text-center">
          <div className="w-14 h-14 rounded-full bg-brand/10 text-brand flex items-center justify-center mx-auto mb-3">
            <ListTree className="w-7 h-7" />
          </div>
          <h3 className="font-semibold text-ink-900 dark:text-white mb-1">Pick a program to start</h3>
          <p className="text-[13px] text-ink-500">All students in that program will be loaded so you can enroll them in any of its modules.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* ── Left: modules in program ── */}
          <div className="card lg:col-span-4 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-ink-100 dark:border-ink-700">
              <div className="flex items-center gap-2 mb-2">
                <BookOpen className="w-4 h-4 text-brand" />
                <h3 className="font-semibold text-[13px]">Program modules ({programModules.length})</h3>
              </div>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  className="input input-sm pl-8 w-full"
                  placeholder="Filter modules…"
                  value={moduleSearch}
                  onChange={(e) => setModuleSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="max-h-[640px] overflow-y-auto">
              {modulesQ.isLoading ? (
                <div className="p-6 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-brand" /></div>
              ) : filteredProgramModules.length === 0 ? (
                <div className="p-6 text-center text-ink-400 text-[13px]">
                  {programModules.length === 0
                    ? 'This program has no modules attached yet.'
                    : 'No modules match your search.'}
                </div>
              ) : filteredProgramModules.map((m) => {
                const isSelected = m.module_id === moduleId
                return (
                  <button
                    key={m.module_id}
                    type="button"
                    onClick={() => setModuleId(m.module_id)}
                    className={`w-full text-left px-4 py-2.5 border-b border-ink-100/70 dark:border-ink-700/70 transition-colors ${isSelected
                      ? 'bg-brand/5 border-l-[3px] border-l-brand'
                      : 'hover:bg-ink-50 dark:hover:bg-ink-700/30 border-l-[3px] border-l-transparent'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-mono font-semibold text-[12.5px] text-ink-900 dark:text-white">{m.module_code}</div>
                        <div className="text-[12px] text-ink-600 dark:text-ink-300 truncate">{m.module_name}</div>
                        <div className="text-[10.5px] text-ink-400 mt-0.5">L{m.level} · {m.module_credits} cr</div>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-brand shrink-0" />}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Right: students in program (with enrollment) ── */}
          <div className="lg:col-span-8 space-y-4">
            {!selectedModule ? (
              <div className="card p-10 text-center">
                <div className="w-14 h-14 rounded-full bg-brand/10 text-brand flex items-center justify-center mx-auto mb-3">
                  <GraduationCap className="w-7 h-7" />
                </div>
                <h3 className="font-semibold text-ink-900 dark:text-white mb-1">Pick a module on the left</h3>
                <p className="text-[13px] text-ink-500">
                  Then enroll students one at a time, or select all and register them at once.
                </p>
              </div>
            ) : (
              <div className="card overflow-hidden">
                <div className="px-4 py-2.5 border-b border-ink-100 dark:border-ink-700 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <Users className="w-4 h-4 text-brand shrink-0" />
                    <div className="min-w-0">
                      <h3 className="font-semibold text-[13px] truncate">
                        <span className="font-mono">{selectedModule.module_code}</span>
                        <span className="text-ink-500"> · {selectedModule.module_name}</span>
                      </h3>
                      <span className="text-[11px] text-ink-400 flex items-center gap-2 flex-wrap">
                        <span><b className="text-ink-600">{totalInProgram}</b> {showAll ? 'shown' : 'in program'}</span>
                        <span className="inline-flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          <b>{enrolledInScope}</b> enrolled
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-brand" />
                          <b>{totalEligible}</b> can enroll
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <label className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-600 dark:text-ink-300 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="rounded border-ink-300 text-brand"
                        checked={showAll}
                        onChange={(e) => setShowAll(e.target.checked)}
                      />
                      Show all students
                    </label>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
                      <input
                        className="input input-sm pl-8 w-56"
                        placeholder="Search name or reg #…"
                        value={studentSearch}
                        onChange={(e) => setStudentSearch(e.target.value)}
                      />
                    </div>
                    <button
                      className="btn-ghost btn-xs text-[12px]"
                      onClick={selectAllEligible}
                      disabled={totalEligible === 0}
                    >
                      Select all unenrolled
                    </button>
                  </div>
                </div>

                <div className="max-h-[640px] overflow-y-auto">
                  {studentsQ.isLoading || regsQ.isLoading ? (
                    <div className="p-6 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-brand" /></div>
                  ) : programMatchEmpty ? (
                    <div className="p-8 text-center text-ink-400 text-[13px]">
                      No students could be matched to this programme.<br/>
                      <button
                        type="button"
                        className="mt-2 text-brand hover:underline text-[12.5px] font-semibold"
                        onClick={() => setShowAll(true)}
                      >
                        Show all students instead
                      </button>
                    </div>
                  ) : totalInProgram === 0 ? (
                    <div className="p-8 text-center text-ink-400 text-[13px]">
                      No students match your search.
                    </div>
                  ) : eligibleForEnroll.length === 0 ? (
                    <div className="p-8 text-center text-ink-400 text-[13px]">
                      Every student in this programme has already studied this module.
                    </div>
                  ) : (
                    <table className="w-full text-[12.5px]">
                      <thead className="sticky top-0 bg-white dark:bg-ink-900 z-[1]">
                        <tr className="border-b border-ink-100 dark:border-ink-700">
                          <th className="px-3 py-2 w-10">
                            <input
                              type="checkbox"
                              className="rounded border-ink-300 text-brand"
                              disabled={totalEligible === 0}
                              checked={allEligibleChecked}
                              onChange={onHeaderToggle}
                            />
                          </th>
                          <th className="px-3 py-2 text-left text-[10px] uppercase font-bold text-ink-400">Reg #</th>
                          <th className="px-3 py-2 text-left text-[10px] uppercase font-bold text-ink-400">Name</th>
                          <th className="px-3 py-2 text-left text-[10px] uppercase font-bold text-ink-400">Level</th>
                          <th className="px-3 py-2 text-right text-[10px] uppercase font-bold text-ink-400">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink-100/50 dark:divide-ink-700/50">
                        {eligibleForEnroll.map((s: any) => {
                          const reg = s.regnumber || s.student_regnumber
                          const isSelected = !!reg && selected.has(reg)
                          const rowClass = isSelected
                            ? 'bg-brand/5 dark:bg-brand/10 border-l-[3px] border-l-brand'
                            : 'hover:bg-ink-50 dark:hover:bg-ink-700/20 border-l-[3px] border-l-transparent'
                          return (
                            <tr key={s.id ?? reg} className={`transition-colors ${rowClass}`}>
                              <td className="px-3 py-2 text-center">
                                <button
                                  type="button"
                                  className={`w-4 h-4 rounded border inline-flex items-center justify-center ${isSelected ? 'bg-brand border-brand text-white' : 'border-ink-300 dark:border-ink-600'}`}
                                  onClick={() => reg && toggleStudent(reg)}
                                >
                                  {isSelected && <Check className="w-3 h-3" />}
                                </button>
                              </td>
                              <td className="px-3 py-2 font-mono text-ink-900 dark:text-white">
                                {reg || '—'}
                              </td>
                              <td className="px-3 py-2">
                                {s.fname} {s.lname}
                              </td>
                              <td className="px-3 py-2 text-ink-500">L{s.current_level ?? '—'}</td>
                              <td className="px-3 py-2 text-right">
                                <button
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-brand text-white text-[11px] font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors"
                                  disabled={singleEnroll.isPending || !reg}
                                  onClick={() => reg && singleEnroll.mutate(reg)}
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

                <div className="px-4 py-2.5 border-t border-ink-100 dark:border-ink-700 flex items-center justify-between gap-2 flex-wrap bg-ink-50/40 dark:bg-ink-800/30">
                  <div className="flex items-center gap-2 text-[12px] text-ink-500">
                    <span><b className="text-ink-700">{selected.size}</b> selected of {totalEligible} unenrolled</span>
                    {selected.size > 0 && (
                      <button onClick={clearSelection} className="hover:text-red-500">
                        <X className="w-3 h-3 inline" /> clear
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="btn-primary btn-sm"
                      disabled={selected.size === 0 || bulkEnroll.isPending}
                      onClick={() => bulkEnroll.mutate()}
                    >
                      {bulkEnroll.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                      Enroll {selected.size} selected
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
