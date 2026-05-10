import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
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
  History,
  CalendarClock,
  CalendarOff,
  Network,
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

type ModuleProgramRef = { id: number; name: string; code?: string | null }

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

  /* ── Other programmes that also have this module attached. The catalog
   *    response includes a `programs` array per module (from `module_programs`),
   *    so the admin can enroll students from sibling programmes that share the
   *    course — e.g. a service module taught across faculties. */
  const otherPrograms: ModuleProgramRef[] = useMemo(() => {
    if (!selectedModule) return []
    const list = (selectedModule as unknown as { programs?: ModuleProgramRef[] }).programs ?? []
    return list.filter((p) => Number(p.id) !== Number(programId))
  }, [selectedModule, programId])
  const [otherProgramsOpen, setOtherProgramsOpen] = useState(false)
  // Close the cross-program sheet when the chosen module changes — its
  // contents would otherwise still belong to the previous module.
  useEffect(() => { setOtherProgramsOpen(false) }, [moduleId])

  /* ── Offering metadata for the selected module. `is_scheduled` and
   *    `offering_modes` are stamped on each catalog row by the backend
   *    when the request is filtered by program — so we read them straight
   *    off the selectedModule without an extra round-trip. */
  const isSelectedModuleScheduled = !!(selectedModule as unknown as { is_scheduled?: boolean } | null)?.is_scheduled
  const selectedModuleModes: string[] = useMemo(() => {
    if (!selectedModule) return []
    const m = selectedModule as unknown as { offering_modes?: string[] | null }
    return Array.isArray(m.offering_modes) ? m.offering_modes : []
  }, [selectedModule])
  const [modeFilter, setModeFilter] = useState<string>('')
  useEffect(() => {
    setModeFilter(selectedModuleModes[0] ?? '')
  }, [moduleId, selectedModuleModes.join('|')])

  /* ── Left list filters: by default we hide modules that aren't scheduled
   *    for this programme — there's nothing actionable to enroll for, and
   *    keeping them around encouraged double-enrolls. The admin can flip
   *    `showUnscheduled` if they specifically need to see the unscheduled
   *    set (curriculum reference). */
  const [showUnscheduled, setShowUnscheduled] = useState(false)
  const [moduleSearch, setModuleSearch] = useState('')
  const filteredProgramModules = useMemo(() => {
    const q = moduleSearch.trim().toLowerCase()
    const base = showUnscheduled
      ? programModules
      : programModules.filter((m) => !!(m as unknown as { is_scheduled?: boolean }).is_scheduled)
    if (!q) return base
    return base.filter((m) =>
      m.module_code.toLowerCase().includes(q) ||
      m.module_name.toLowerCase().includes(q)
    )
  }, [programModules, moduleSearch, showUnscheduled])

  /* ── Every registration for this module (any term, any status). We need
   *    every record to know who is currently enrolled, who dropped, and who
   *    has prior-term history with this module. ─────────────────────── */
  const regsQ = useQuery({
    queryKey: ['modules', 'registrations-all-terms', moduleId],
    queryFn:  () => moduleRegistrationService.list({ module_id: moduleId }),
    enabled:  !!moduleId,
  })
  const existingRegs: ModuleRegistration[] = regsQ.data?.data ?? []

  // Status (any) this term — backend's isRegistered() blocks any record in
  // this term regardless of status, so this is what gates "can enroll".
  const thisTermByReg = useMemo(() => {
    const m = new Map<string, ModuleRegistration>()
    for (const r of existingRegs) {
      if (!r.student_regnumber) continue
      if (Number(r.academic_term_id) !== Number(termId)) continue
      m.set(r.student_regnumber, r)
    }
    return m
  }, [existingRegs, termId])

  // Has any record in a *different* term — used as a "studied before" hint.
  const priorTermsByReg = useMemo(() => {
    const s = new Set<string>()
    for (const r of existingRegs) {
      if (!r.student_regnumber) continue
      if (Number(r.academic_term_id) === Number(termId)) continue
      s.add(r.student_regnumber)
    }
    return s
  }, [existingRegs, termId])

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
  const programMatchEmpty = !showAll && !studentsQ.isLoading && allStudents.length === 0

  /* ── Selection state for bulk enroll ─────────────────────── */
  const [selected, setSelected] = useState<Set<string>>(new Set())
  useEffect(() => { setSelected(new Set()) }, [moduleId, programId])

  /* ── Decorate every student with this-term registration state. We show
   *    the full programme list — enrolled, dropped, completed/failed, and
   *    never-registered — so admins can see at a glance who is in and who
   *    can still be added, instead of trying to enroll the same person
   *    twice. We also append cross-program enrollees (students from OTHER
   *    programmes already registered in this term) so the admin actually
   *    sees who is in the module, regardless of where they came from. */
  type Decorated = {
    student: any
    reg: string
    thisTerm: ModuleRegistration | null
    studiedBefore: boolean
    canEnroll: boolean
    /** When true, this student's programme isn't the currently-selected one
     *  — they were enrolled into this module from another programme. */
    crossProgram: boolean
    /** Display label of the student's actual programme (only set when
     *  crossProgram=true). */
    crossProgramName: string | null
  }
  const decoratedStudents: Decorated[] = useMemo(() => {
    const out: Decorated[] = []
    const seenRegs = new Set<string>()

    // 1. Students from the currently-selected programme.
    for (const s of allStudents) {
      const reg = (s.regnumber || s.student_regnumber || '') as string
      if (!reg) continue
      seenRegs.add(reg)
      const thisTerm = thisTermByReg.get(reg) ?? null
      out.push({
        student:           s,
        reg,
        thisTerm,
        studiedBefore:     priorTermsByReg.has(reg),
        canEnroll:         !thisTerm,
        crossProgram:      false,
        crossProgramName:  null,
      })
    }

    // 2. Anyone registered to this module in this term whose programme isn't
    //    the selected one — pulled from the registration JOIN, so we already
    //    have their name / level / programme without an extra query.
    for (const r of existingRegs) {
      const reg = r.student_regnumber
      if (!reg || seenRegs.has(reg)) continue
      if (Number(r.academic_term_id) !== Number(termId)) continue
      // Sanity: only registrations whose program differs from the selected
      // one (or whose program couldn't be resolved) count as cross-program.
      const studentProgramId = r.student_std_option ? Number(r.student_std_option) : null
      if (studentProgramId && Number(programId) && studentProgramId === Number(programId)) {
        // They share the programme but didn't surface in the program-scoped
        // student list — still useful to show.
      }
      seenRegs.add(reg)
      out.push({
        student: {
          id:            r.student_id ?? null,
          regnumber:     reg,
          fname:         r.student_fname ?? '',
          lname:         r.student_lname ?? '',
          current_level: r.student_current_level ?? null,
          std_option:    r.student_std_option ?? null,
          intake:        r.student_intake ?? null,
        },
        reg,
        thisTerm:         r,
        studiedBefore:    priorTermsByReg.has(reg),
        canEnroll:        false,
        crossProgram:     true,
        crossProgramName: r.student_program_name
          ?? (r.student_program_code ? `Program ${r.student_program_code}` : null),
      })
    }

    return out
  }, [allStudents, thisTermByReg, priorTermsByReg, existingRegs, termId, programId])
  const totalInProgram = decoratedStudents.length
  const enrolledInScope = decoratedStudents.filter(
    (d) => d.thisTerm?.status === 'registered',
  ).length
  const totalEligible = decoratedStudents.filter((d) => d.canEnroll).length

  const toggleStudent = (reg: string) => {
    const row = decoratedStudents.find((d) => d.reg === reg)
    if (!row || !row.canEnroll) return
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(reg)) n.delete(reg); else n.add(reg)
      return n
    })
  }
  const selectAllEligible = () => {
    setSelected((prev) => {
      const n = new Set(prev)
      decoratedStudents.forEach((d) => {
        if (d.canEnroll) n.add(d.reg)
      })
      return n
    })
  }
  const clearSelection = () => setSelected(new Set())
  const allEligibleChecked = totalEligible > 0
    && decoratedStudents.filter((d) => d.canEnroll).every((d) => selected.has(d.reg))
  const onHeaderToggle = () => {
    if (allEligibleChecked) clearSelection(); else selectAllEligible()
  }

  /* ── Mutations (force=true: admin path bypasses prereq/level checks) ── */
  const refreshRegistrations = () => {
    qc.invalidateQueries({ queryKey: ['modules', 'registrations-all-terms', moduleId] })
    qc.invalidateQueries({ queryKey: ['modules', 'registrations'] })
  }

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
      refreshRegistrations()
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
      refreshRegistrations()
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Enrollment failed'),
  })

  const dropRegistration = useMutation({
    mutationFn: (registrationId: number) =>
      moduleRegistrationService.update(registrationId, { status: 'dropped' }),
    onSuccess: () => {
      toast.success('Registration dropped')
      refreshRegistrations()
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Drop failed'),
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
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <BookOpen className="w-4 h-4 text-brand shrink-0" />
                  <h3 className="font-semibold text-[13px] truncate">
                    {showUnscheduled ? 'All modules' : 'Module schedules'} ({filteredProgramModules.length})
                  </h3>
                </div>
                <label
                  className="inline-flex items-center gap-1 text-[10.5px] text-ink-500 dark:text-ink-300 cursor-pointer select-none whitespace-nowrap"
                  title="Hide / show modules that don't have any schedule for this programme yet"
                >
                  <input
                    type="checkbox"
                    className="rounded border-ink-300 text-brand"
                    checked={showUnscheduled}
                    onChange={(e) => setShowUnscheduled(e.target.checked)}
                  />
                  Show unscheduled
                </label>
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
                    : showUnscheduled
                      ? 'No modules match your search.'
                      : (
                        <>
                          No scheduled modules for this programme yet.<br />
                          <button
                            type="button"
                            className="mt-2 text-brand hover:underline text-[12.5px] font-semibold"
                            onClick={() => setShowUnscheduled(true)}
                          >
                            Show all modules
                          </button>
                        </>
                      )}
                </div>
              ) : filteredProgramModules.map((m) => {
                const isSelected = m.module_id === moduleId
                // Backend sets `is_scheduled` and `offering_modes` on each
                // catalog row when filtered by program — same semantic the
                // curriculum / exam screens use, so the badge stays
                // consistent across pages.
                const meta = m as unknown as { is_scheduled?: boolean; offering_modes?: string[] | null }
                const isScheduled = !!meta.is_scheduled
                const modes: string[] = Array.isArray(meta.offering_modes) ? meta.offering_modes : []
                return (
                  <button
                    key={m.module_id}
                    type="button"
                    onClick={() => setModuleId(m.module_id)}
                    className={`w-full text-left px-4 py-2.5 border-b border-ink-100/70 dark:border-ink-700/70 transition-colors ${isSelected
                      ? 'bg-brand/5 border-l-[3px] border-l-brand'
                      : isScheduled
                        ? 'hover:bg-ink-50 dark:hover:bg-ink-700/30 border-l-[3px] border-l-transparent'
                        // Dim un-scheduled rows so the eye gets pulled toward the
                        // modules actually being delivered this term.
                        : 'opacity-70 hover:opacity-100 hover:bg-ink-50 dark:hover:bg-ink-700/30 border-l-[3px] border-l-transparent'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-mono font-semibold text-[12.5px] text-ink-900 dark:text-white">{m.module_code}</div>
                        <div className="text-[12px] text-ink-600 dark:text-ink-300 truncate">{m.module_name}</div>
                        <div className="text-[10.5px] text-ink-400 mt-1 flex items-center gap-1.5 flex-wrap">
                          <span>L{m.level} · {m.module_credits} cr</span>
                          {isScheduled ? (
                            modes.length > 0 ? (
                              modes.map((mo) => (
                                <span
                                  key={mo}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9.5px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                                  title={`Offered in ${mo} mode for this programme`}
                                >
                                  <CalendarClock className="w-2.5 h-2.5" /> {mo}
                                </span>
                              ))
                            ) : (
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9.5px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                                title="A schedule exists for this module in the selected programme"
                              >
                                <CalendarClock className="w-2.5 h-2.5" /> Scheduled
                              </span>
                            )
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9.5px] font-bold bg-ink-100 text-ink-500 dark:bg-ink-700/40 dark:text-ink-300"
                              title="No schedule for this module yet"
                            >
                              <CalendarOff className="w-2.5 h-2.5" /> Not scheduled
                            </span>
                          )}
                        </div>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-brand shrink-0 mt-0.5" />}
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
                    {selectedModuleModes.length > 0 && (
                      <label className="inline-flex items-center gap-1.5 text-[11px] text-ink-500 dark:text-ink-400 select-none">
                        <CalendarClock className="w-3.5 h-3.5" /> Mode
                        <select
                          className="input input-sm h-7 py-0 text-[12px]"
                          value={modeFilter}
                          onChange={(e) => setModeFilter(e.target.value)}
                          title="Defaults to the module's first scheduled mode. Switch to view students you'd enroll in another mode (Day / Evening / Weekend …), or pick All to ignore the filter."
                        >
                          {selectedModuleModes.map((mo) => (
                            <option key={mo} value={mo}>{mo}</option>
                          ))}
                          <option value="">All modes</option>
                        </select>
                      </label>
                    )}
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
                      disabled={totalEligible === 0 || !isSelectedModuleScheduled}
                      title={!isSelectedModuleScheduled ? 'Module must be scheduled before students can be enrolled' : undefined}
                    >
                      Select all unenrolled
                    </button>
                    {otherPrograms.length > 0 && (
                      <button
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-brand/40 text-brand text-[11.5px] font-semibold hover:bg-brand/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => setOtherProgramsOpen(true)}
                        disabled={!isSelectedModuleScheduled}
                        title={!isSelectedModuleScheduled
                          ? 'Schedule this module first before enrolling cross-programme students'
                          : `This module is also taught in ${otherPrograms.length} other programme${otherPrograms.length === 1 ? '' : 's'}`}
                      >
                        <Network className="w-3.5 h-3.5" />
                        Enroll from other programs ({otherPrograms.length})
                      </button>
                    )}
                  </div>
                </div>

                {!isSelectedModuleScheduled && (
                  <div className="px-4 py-2 bg-amber-50 dark:bg-amber-500/10 border-b border-amber-200/60 dark:border-amber-500/20 text-[12px] text-amber-800 dark:text-amber-200 flex items-center gap-2">
                    <CalendarOff className="w-3.5 h-3.5" />
                    This module isn't scheduled yet. Add a teaching block from the Scheduling tab before enrolling students.
                  </div>
                )}

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
                          <th className="px-3 py-2 text-left text-[10px] uppercase font-bold text-ink-400">Status</th>
                          <th className="px-3 py-2 text-right text-[10px] uppercase font-bold text-ink-400">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink-100/50 dark:divide-ink-700/50">
                        {decoratedStudents.map(({ student: s, reg, thisTerm, studiedBefore, canEnroll, crossProgram, crossProgramName }) => {
                          const isSelected = canEnroll && selected.has(reg)
                          const rowClass = isSelected
                            ? 'bg-brand/5 dark:bg-brand/10 border-l-[3px] border-l-brand'
                            : crossProgram
                              ? 'bg-violet-50/40 dark:bg-violet-500/5 border-l-[3px] border-l-violet-400'
                              : thisTerm?.status === 'registered'
                                ? 'bg-emerald-50/40 dark:bg-emerald-500/5 border-l-[3px] border-l-emerald-400'
                                : 'hover:bg-ink-50 dark:hover:bg-ink-700/20 border-l-[3px] border-l-transparent'
                          return (
                            <tr key={s.id ?? reg} className={`transition-colors ${rowClass}`}>
                              <td className="px-3 py-2 text-center">
                                {canEnroll ? (
                                  <button
                                    type="button"
                                    className={`w-4 h-4 rounded border inline-flex items-center justify-center ${isSelected ? 'bg-brand border-brand text-white' : 'border-ink-300 dark:border-ink-600'}`}
                                    onClick={() => reg && toggleStudent(reg)}
                                  >
                                    {isSelected && <Check className="w-3 h-3" />}
                                  </button>
                                ) : (
                                  <span className="w-4 h-4 inline-flex items-center justify-center text-ink-300">—</span>
                                )}
                              </td>
                              <td className="px-3 py-2 font-mono text-ink-900 dark:text-white">
                                {reg || '—'}
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex flex-col">
                                  <span>{s.fname} {s.lname}</span>
                                  {crossProgram && crossProgramName && (
                                    <span
                                      className="inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 rounded-full text-[9.5px] font-semibold bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300 self-start"
                                      title="This student is from a different programme but is registered to this module"
                                    >
                                      <Network className="w-2.5 h-2.5" />
                                      {crossProgramName}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-ink-500">L{s.current_level ?? '—'}</td>
                              <td className="px-3 py-2">
                                {thisTerm ? (
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold ${
                                    thisTerm.status === 'registered' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                                    : thisTerm.status === 'completed' ? 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300'
                                    : thisTerm.status === 'failed' ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'
                                    : 'bg-ink-100 text-ink-600 dark:bg-ink-700 dark:text-ink-300'
                                  }`}>
                                    <Check className="w-3 h-3" />
                                    {thisTerm.status === 'registered' ? 'Enrolled'
                                      : thisTerm.status === 'dropped' ? 'Dropped'
                                      : thisTerm.status === 'completed' ? 'Completed'
                                      : 'Failed'}
                                    {thisTerm.grade ? ` · ${thisTerm.grade}` : ''}
                                  </span>
                                ) : studiedBefore ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                                    <History className="w-3 h-3" />
                                    Studied before
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-ink-400">Not enrolled</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right">
                                {thisTerm?.status === 'registered' ? (
                                  <button
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-rose-50 text-rose-700 text-[11px] font-semibold hover:bg-rose-100 disabled:opacity-50 transition-colors dark:bg-rose-500/15 dark:text-rose-300 dark:hover:bg-rose-500/25"
                                    disabled={dropRegistration.isPending}
                                    onClick={() => dropRegistration.mutate(thisTerm.id)}
                                  >
                                    <X className="w-3 h-3" /> Drop
                                  </button>
                                ) : thisTerm ? (
                                  <span className="text-[11px] text-ink-400 italic">Already on file</span>
                                ) : (
                                  <button
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-brand text-white text-[11px] font-semibold hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    disabled={singleEnroll.isPending || !reg || !isSelectedModuleScheduled}
                                    onClick={() => reg && singleEnroll.mutate(reg)}
                                    title={!isSelectedModuleScheduled
                                      ? 'Schedule this module before enrolling students'
                                      : `Enroll ${reg}`}
                                  >
                                    <Plus className="w-3 h-3" /> Enroll
                                  </button>
                                )}
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
                      disabled={selected.size === 0 || bulkEnroll.isPending || !isSelectedModuleScheduled}
                      onClick={() => bulkEnroll.mutate()}
                      title={!isSelectedModuleScheduled
                        ? 'Schedule this module before enrolling students'
                        : undefined}
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

      {otherProgramsOpen && selectedModule && (
        <CrossProgramEnrollModal
          module={selectedModule}
          termId={Number(termId)}
          otherPrograms={otherPrograms}
          thisTermByReg={thisTermByReg}
          onClose={() => setOtherProgramsOpen(false)}
          onEnrolled={() => {
            qc.invalidateQueries({ queryKey: ['modules', 'registrations-all-terms', moduleId] })
            qc.invalidateQueries({ queryKey: ['modules', 'registrations'] })
          }}
        />
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   Cross-program enrollment sheet.
   When a module is shared by multiple programmes (via the
   `module_programs` link table), this dialog lets the admin
   enroll students from those *other* programmes into the same
   module, in the same term, without first switching context.
   Each programme's roster is fetched in parallel; students who
   already have any registration record in this term are shown
   but disabled, mirroring the backend's `isRegistered()` guard.
   ───────────────────────────────────────────────────────────── */
function CrossProgramEnrollModal({
  module, termId, otherPrograms, thisTermByReg, onClose, onEnrolled,
}: {
  module:        Module
  termId:        number
  otherPrograms: ModuleProgramRef[]
  thisTermByReg: Map<string, ModuleRegistration>
  onClose:       () => void
  onEnrolled:    () => void
}) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const studentQueries = useQueries({
    queries: otherPrograms.map((p) => ({
      queryKey: ['students', 'by-program', p.id, search],
      queryFn:  () => studentService.list({
        per_page: 500,
        page: 1,
        std_option: String(p.id),
        q: search || undefined,
      }),
      staleTime: 30_000,
    })),
  })

  const isLoading = studentQueries.some((q) => q.isLoading)

  type Row = {
    student:       any
    reg:           string
    program:       ModuleProgramRef
    thisTerm:      ModuleRegistration | null
    canEnroll:     boolean
  }
  const rows: Row[] = useMemo(() => {
    const out: Row[] = []
    studentQueries.forEach((q, idx) => {
      const program = otherPrograms[idx]
      const list = q.data?.data?.data ?? []
      for (const s of list) {
        const reg = (s.regnumber || s.student_regnumber || '') as string
        const thisTerm = reg ? (thisTermByReg.get(reg) ?? null) : null
        out.push({
          student:   s,
          reg,
          program,
          thisTerm,
          canEnroll: !!reg && !thisTerm,
        })
      }
    })
    return out
    // studentQueries identity changes on every render; gate on the data refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentQueries.map((q) => q.data).join('|'), thisTermByReg, otherPrograms])

  const enrollableCount = rows.filter((r) => r.canEnroll).length
  const toggle = (reg: string, ok: boolean) => {
    if (!ok) return
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(reg)) n.delete(reg); else n.add(reg)
      return n
    })
  }
  const selectAll = () => setSelected(new Set(rows.filter((r) => r.canEnroll).map((r) => r.reg)))
  const clearAll  = () => setSelected(new Set())

  const bulkEnroll = useMutation({
    mutationFn: () => moduleRegistrationService.bulkRegister({
      module_id: module.module_id,
      academic_term_id: termId,
      student_regnumbers: Array.from(selected),
      force: true,
    }),
    onSuccess: (res: any) => {
      const data = res.data
      if (data?.created > 0) toast.success(`${data.created} students enrolled${data.skipped ? ` · ${data.skipped} skipped` : ''}`)
      else toast(`Nothing added — ${data?.skipped ?? 0} skipped`)
      data?.errors?.slice(0, 5).forEach((e: any) => toast.error(`${e.regnumber}: ${e.reason}`, { duration: 5000 }))
      setSelected(new Set())
      onEnrolled()
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Bulk registration failed'),
  })

  // Group rows by program for a clearer layout when several programmes share
  // the module — each block carries its own header + count.
  const groupedRows = useMemo(() => {
    const map = new Map<number, { program: ModuleProgramRef; rows: Row[] }>()
    for (const r of rows) {
      let bucket = map.get(r.program.id)
      if (!bucket) {
        bucket = { program: r.program, rows: [] }
        map.set(r.program.id, bucket)
      }
      bucket.rows.push(r)
    }
    return Array.from(map.values())
  }, [rows])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-ink-900 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-ink-100 dark:border-ink-700 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-bold text-[14px] flex items-center gap-2">
              <Network className="w-4 h-4 text-brand" />
              Enroll from other programs
            </h3>
            <p className="text-[12px] text-ink-500 truncate">
              <span className="font-mono">{module.module_code}</span>
              <span className="text-ink-400"> · {module.module_name}</span>
              <span className="text-ink-400"> — also taught in {otherPrograms.length} other programme{otherPrograms.length === 1 ? '' : 's'}</span>
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-ink-100 dark:hover:bg-ink-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-2.5 border-b border-ink-100 dark:border-ink-700 flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              className="input input-sm pl-8 w-full"
              placeholder="Search name or reg #…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button className="btn-ghost btn-xs text-[12px]" onClick={selectAll} disabled={enrollableCount === 0}>
            Select all unenrolled
          </button>
          {selected.size > 0 && (
            <button className="btn-ghost btn-xs text-[12px]" onClick={clearAll}>Clear</button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-brand" /></div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-ink-400 text-[13px]">
              No students found in the other programmes attached to this module.
            </div>
          ) : groupedRows.map((g) => {
            const enrollable = g.rows.filter((r) => r.canEnroll).length
            return (
              <div key={g.program.id} className="border-b border-ink-100 dark:border-ink-700 last:border-b-0">
                <div className="px-4 py-2 bg-ink-50/60 dark:bg-ink-800/40 flex items-center justify-between gap-2">
                  <div className="text-[12.5px] font-semibold flex items-center gap-2 min-w-0">
                    <ListTree className="w-3.5 h-3.5 text-brand shrink-0" />
                    <span className="truncate">{g.program.name}</span>
                    {g.program.code && <span className="font-mono text-[11px] text-ink-400">{g.program.code}</span>}
                  </div>
                  <span className="text-[11px] text-ink-500">
                    <b>{g.rows.length}</b> student{g.rows.length === 1 ? '' : 's'} · <b className="text-emerald-600 dark:text-emerald-400">{enrollable}</b> can enroll
                  </span>
                </div>
                <table className="w-full text-[12.5px]">
                  <tbody className="divide-y divide-ink-100/50 dark:divide-ink-700/50">
                    {g.rows.map((r) => {
                      const isSel = r.canEnroll && selected.has(r.reg)
                      return (
                        <tr
                          key={r.student.id ?? r.reg}
                          className={`transition-colors ${isSel
                            ? 'bg-brand/5 border-l-[3px] border-l-brand'
                            : r.thisTerm?.status === 'registered'
                              ? 'bg-emerald-50/40 dark:bg-emerald-500/5 border-l-[3px] border-l-emerald-400'
                              : 'hover:bg-ink-50 dark:hover:bg-ink-700/20 border-l-[3px] border-l-transparent'}`}
                        >
                          <td className="px-3 py-2 w-10 text-center">
                            {r.canEnroll ? (
                              <button
                                type="button"
                                className={`w-4 h-4 rounded border inline-flex items-center justify-center ${isSel ? 'bg-brand border-brand text-white' : 'border-ink-300 dark:border-ink-600'}`}
                                onClick={() => toggle(r.reg, true)}
                              >
                                {isSel && <Check className="w-3 h-3" />}
                              </button>
                            ) : (
                              <span className="text-ink-300">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-mono text-ink-900 dark:text-white">{r.reg || '—'}</td>
                          <td className="px-3 py-2">{r.student.fname} {r.student.lname}</td>
                          <td className="px-3 py-2 text-ink-500">L{r.student.current_level ?? '—'}</td>
                          <td className="px-3 py-2">
                            {r.thisTerm ? (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold ${
                                r.thisTerm.status === 'registered' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                                : r.thisTerm.status === 'completed' ? 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300'
                                : r.thisTerm.status === 'failed'    ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'
                                : 'bg-ink-100 text-ink-600 dark:bg-ink-700 dark:text-ink-300'
                              }`}>
                                <Check className="w-3 h-3" />
                                {r.thisTerm.status === 'registered' ? 'Enrolled'
                                  : r.thisTerm.status === 'dropped' ? 'Dropped'
                                  : r.thisTerm.status === 'completed' ? 'Completed'
                                  : 'Failed'}
                              </span>
                            ) : (
                              <span className="text-[11px] text-ink-400">Not enrolled</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>

        <div className="px-4 py-2.5 border-t border-ink-100 dark:border-ink-700 flex items-center justify-between gap-2 bg-ink-50/40 dark:bg-ink-800/30">
          <div className="text-[12px] text-ink-500">
            <b className="text-ink-700">{selected.size}</b> selected of {enrollableCount} can enroll
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn-ghost btn-sm">Cancel</button>
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
    </div>
  )
}
