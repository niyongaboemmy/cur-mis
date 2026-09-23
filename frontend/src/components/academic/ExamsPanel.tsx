import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  CalendarPlus,
  Loader2,
  Pencil,
  Trash2,
  Users,
  CalendarClock,
  Search,
  Filter,
  AlertCircle,
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { PERMISSIONS } from '@/constants/permissions'
import { usePermission } from '@/utils/permissions'
import SearchableSelect from '@/components/ui/SearchableSelect'
import RoleGroupedSelect, { type GroupedOption } from '@/components/ui/RoleGroupedSelect'
import { academicsMgmtService } from '@/services/academicsMgmtService'
import { academicService } from '@/services/academicService'
import { useSessionStorage } from '@/hooks/useSessionStorage'
import ExamAttendanceModal from './ExamAttendanceModal'
import type { AcademicTerm } from '@/types/academic'

const COMPONENT_OPTIONS = ['Final Exam', 'Partial Exam', 'CAT', 'Resit'] as const

interface ExamFormState {
  module_id:        number | ''
  option_id:        number | ''
  term_id:          number | ''
  academic_year:    string
  component:        string
  exam_date:        string
  start_time:       string
  end_time:         string
  campus_id:        number | ''
  /** Transient selection aid for the lecturer picker; only `instructor_name`
   *  is persisted (exam_schedules stores the name, not an id). */
  instructor_id:    number | ''
  instructor_name:  string
  notes:            string
}

const blankForm = (): ExamFormState => ({
  module_id:       '',
  option_id:       '',
  term_id:         '',
  academic_year:   '',
  component:       'Final Exam',
  exam_date:       '',
  start_time:      '',
  end_time:        '',
  campus_id:       '',
  instructor_id:   '',
  instructor_name: '',
  notes:           '',
})

/* ─────────────────────────────────────────────────────────────
   Top-level panel — toolbar (filters + create button) + list
   of scheduled exams. Clicking a row opens the attendance sheet;
   the pencil icon opens the edit dialog.
   ───────────────────────────────────────────────────────────── */

export default function ExamsPanel() {
  const qc = useQueryClient()

  // VIEW_EXAMS opens this panel read-only; editing the calendar stays with
  // MANAGE_MODULE_SCHEDULES, which is what the write endpoints enforce.
  const canWrite = usePermission(PERMISSIONS.MANAGE_MODULE_SCHEDULES)

  /* Filters are persisted in sessionStorage so navigating to another
     Academic-Settings tab and back keeps the admin's working view. */
  const [filterTerm,   setFilterTerm]   = useSessionStorage<number | ''>('exams.filterTerm', '')
  const [filterOption, setFilterOption] = useSessionStorage<number | ''>('exams.filterOption', '')
  const [filterComp,   setFilterComp]   = useSessionStorage<string>('exams.filterComp', '')
  const [search,       setSearch]       = useSessionStorage<string>('exams.search', '')

  /* dialogs */
  const [formOpen,      setFormOpen]      = useState(false)
  const [editingId,     setEditingId]     = useState<number | null>(null)
  const [form,          setForm]          = useState<ExamFormState>(blankForm())
  const [attendanceId,  setAttendanceId]  = useState<number | null>(null)

  /* lookups */
  const termsQ = useQuery({
    queryKey: ['academic', 'terms'],
    queryFn:  () => academicService.listTerms(),
  })
  const terms = (termsQ.data?.data ?? []) as AcademicTerm[]

  const programsQ = useQuery({
    queryKey: ['acmgmt', 'options', 'all'],
    queryFn:  () => academicsMgmtService.list<any>('options', { per_page: 1000 }),
  })
  const programs = (programsQ.data?.data?.data ?? []) as Array<{ id: number; name: string; code?: string; acro?: string }>

  const campusesQ = useQuery({
    queryKey: ['acmgmt', 'campuses', 'all'],
    queryFn:  () => academicsMgmtService.list<any>('campuses', { per_page: 1000 }),
    staleTime: 5 * 60 * 1000,
  })
  const campuses = (campusesQ.data?.data?.data ?? []) as Array<{ id: number; name: string }>

  /* Lecturers / staff — the same pool used on the Scheduling tab (HR employees
     + staff user accounts), so any lecturer can be set as exam proctor. */
  const instructorsQ = useQuery({
    queryKey: ['scheduling', 'instructors'],
    queryFn:  () => academicsMgmtService.getInstructors(),
    staleTime: 5 * 60 * 1000,
  })
  const instructors = (instructorsQ.data?.data?.rows ?? []) as Array<{ id: number; full_name: string; position: string | null }>
  const instructorOptions: GroupedOption[] = useMemo(
    () => instructors.map((i) => ({
      value: i.id,
      label: i.full_name,
      sub: i.position ?? undefined,
      group: (i.position ?? '').trim() || 'Other',
    })),
    [instructors],
  )
  const instructorById = useMemo(() => {
    const m = new Map<number, string>()
    instructors.forEach((i) => m.set(i.id, i.full_name))
    return m
  }, [instructors])
  /** Map a stored lecturer name back onto a picker id (for edit pre-selection). */
  const instructorIdByName = useMemo(() => {
    const m = new Map<string, number>()
    instructors.forEach((i) => m.set(i.full_name.trim().toLowerCase(), i.id))
    return m
  }, [instructors])

  /* the universe of "active" modules — modules that already have a
     teaching block. The admin picks from these when scheduling an exam. */
  const scheduledQ = useQuery({
    queryKey: ['exams', 'scheduled-modules'],
    queryFn:  () => academicsMgmtService.examScheduledModules(),
  })
  const scheduledModules = scheduledQ.data?.data?.rows ?? []

  /* the list of already-scheduled exams */
  const examsQ = useQuery({
    queryKey: ['exams', 'list', filterTerm, filterOption, filterComp, search],
    queryFn:  () => academicsMgmtService.listExams({
      ...(filterTerm   ? { term_id:   Number(filterTerm)   } : {}),
      ...(filterOption ? { option_id: Number(filterOption) } : {}),
      ...(filterComp   ? { component: filterComp           } : {}),
      ...(search       ? { q: search                       } : {}),
    }),
  })
  const exams = examsQ.data?.data?.rows ?? []

  const createM = useMutation({
    mutationFn: (body: Parameters<typeof academicsMgmtService.createExam>[0]) =>
      academicsMgmtService.createExam(body),
    onSuccess: () => {
      toast.success('Exam scheduled')
      setFormOpen(false)
      setEditingId(null)
      setForm(blankForm())
      qc.invalidateQueries({ queryKey: ['exams', 'list'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to schedule exam'),
  })

  const updateM = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) =>
      academicsMgmtService.updateExam(id, body),
    onSuccess: () => {
      toast.success('Exam updated')
      setFormOpen(false)
      setEditingId(null)
      setForm(blankForm())
      qc.invalidateQueries({ queryKey: ['exams', 'list'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to update exam'),
  })

  const deleteM = useMutation({
    mutationFn: (id: number) => academicsMgmtService.deleteExam(id),
    onSuccess: () => {
      toast.success('Exam removed')
      qc.invalidateQueries({ queryKey: ['exams', 'list'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to delete exam'),
  })

  const openCreate = () => {
    setEditingId(null)
    // Pre-fill term with the active one if available, and inherit the program
    // already selected in the toolbar above (the module pick refines it).
    const activeTerm = terms.find((t) => !!t.is_current)
    setForm({ ...blankForm(), term_id: activeTerm?.id ?? '', option_id: filterOption || '' })
    setFormOpen(true)
  }

  const openEdit = (id: number) => {
    const row = exams.find((e) => e.id === id)
    if (!row) return
    setEditingId(id)
    setForm({
      module_id:       row.module_id,
      option_id:       row.option_id ?? '',
      term_id:         row.term_id   ?? '',
      academic_year:   row.academic_year ?? '',
      component:       row.component ?? 'Final Exam',
      exam_date:       row.exam_date ?? '',
      start_time:      row.start_time ? row.start_time.slice(0, 5) : '',
      end_time:        row.end_time   ? row.end_time.slice(0, 5)   : '',
      campus_id:       row.campus_id ?? '',
      instructor_id:   instructorIdByName.get((row.instructor_name ?? '').trim().toLowerCase()) ?? '',
      instructor_name: row.instructor_name ?? '',
      notes:           row.notes ?? '',
    })
    setFormOpen(true)
  }

  /** Pre-fill the schedule form from a "module pending an exam" row.
   *  Used when the program filter surfaces modules that don't yet have
   *  an `exam_schedules` entry — the admin clicks "Schedule" and we
   *  carry the module / program / campus / academic year forward so
   *  they only have to fill in the date and time. */
  const openScheduleFor = (moduleId: number) => {
    const row = exams.find((e) => e.module_id === moduleId && e.id === null)
    setEditingId(null)
    const activeTerm = terms.find((t) => !!t.is_current)
    setForm({
      ...blankForm(),
      module_id:     moduleId,
      option_id:     row?.option_id ?? (filterOption || ''),
      term_id:       activeTerm?.id ?? '',
      academic_year: row?.academic_year ?? '',
      campus_id:     row?.campus_id ?? '',
    })
    setFormOpen(true)
  }

  /* ──────────────────────────────────────────────────────────
     Form-time guard — block the user from saving if the times
     are inverted; the backend rejects equal/inverted ranges so
     keep the UI in lock-step.
     ────────────────────────────────────────────────────────── */
  const formIssues = useMemo(() => {
    const issues: string[] = []
    if (!form.module_id)  issues.push('Module is required')
    if (!form.exam_date)  issues.push('Exam date is required')
    if (form.start_time && form.end_time && form.end_time <= form.start_time) {
      issues.push('End time must be after start time')
    }
    return issues
  }, [form])

  const submit = () => {
    if (formIssues.length > 0) {
      toast.error(formIssues[0])
      return
    }
    const body: any = {
      module_id:       Number(form.module_id),
      option_id:       form.option_id === '' ? null : Number(form.option_id),
      term_id:         form.term_id   === '' ? null : Number(form.term_id),
      academic_year:   form.academic_year || null,
      component:       form.component       || 'Final Exam',
      exam_date:       form.exam_date,
      start_time:      form.start_time      || null,
      end_time:        form.end_time        || null,
      campus_id:       form.campus_id === '' ? null : Number(form.campus_id),
      instructor_name: form.instructor_name || null,
      notes:           form.notes           || null,
    }
    if (editingId) updateM.mutate({ id: editingId, body })
    else           createM.mutate(body)
  }

  /* The selected module's metadata — we use this to auto-fill
     the program / campus / academic-year fields when the admin
     picks a module, so they don't have to retype values that
     are already known from the teaching schedule. */
  const onPickModule = (moduleId: number | '') => {
    if (moduleId === '') {
      setForm((f) => ({ ...f, module_id: '' }))
      return
    }
    const m = scheduledModules.find((x) => x.module_id === Number(moduleId))
    setForm((f) => ({
      ...f,
      module_id:     Number(moduleId),
      option_id:     m?.option_id ?? '',
      campus_id:     m?.campus_id ?? '',
      academic_year: m?.academic_year ?? f.academic_year,
    }))
  }

  const moduleOptions = useMemo(
    () => scheduledModules.map((m) => {
      const programLabel = m.option_acro ?? m.option_code ?? m.option_name ?? ''
      const modeLabel = m.mode ? ` · ${m.mode}` : ''
      return {
        value: m.module_id,
        label: `${m.module_code} — ${m.module_name}${programLabel ? ` (${programLabel})` : ''}${modeLabel}`,
      }
    }),
    [scheduledModules],
  )

  const programOptions = useMemo(
    () => programs.map((p) => ({
      value: Number(p.id),
      label: p.code ? `${p.code} · ${p.name}` : p.name,
    })),
    [programs],
  )
  const programLabelById = useMemo(() => {
    const m = new Map<number, string>()
    programs.forEach((p) => m.set(Number(p.id), p.code ? `${p.code} · ${p.name}` : p.name))
    return m
  }, [programs])

  const campusOptions = useMemo(
    () => campuses.map((c) => ({ value: Number(c.id), label: c.name })),
    [campuses],
  )

  return (
    <section className="card p-5 sm:p-6 space-y-4">
      {/* Header + create button */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[15px] font-semibold text-ink-900 dark:text-ink-100 inline-flex items-center gap-2">
            <CalendarClock className="w-4 h-4" /> Exam scheduling
          </h2>
          <p className="text-[12.5px] text-ink-500 mt-0.5">
            Set the exam date and time for any module that's currently scheduled. Click an
            exam to view or print its attendance sheet.
          </p>
        </div>
        {canWrite && (
          <button className="btn-primary" onClick={openCreate}>
            <CalendarPlus className="w-4 h-4" /> Schedule exam
          </button>
        )}
      </div>

      {/* Filter toolbar */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_1.2fr] gap-3">
        <div>
          <label className="label">Term</label>
          <select
            className="input"
            value={filterTerm === '' ? '' : String(filterTerm)}
            onChange={(e) => setFilterTerm(e.target.value === '' ? '' : Number(e.target.value))}
          >
            <option value="">All terms</option>
            {terms.map((t) => (
              <option key={t.id} value={String(t.id)}>
                {t.label}{t.is_current ? ' • active' : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Program</label>
          <SearchableSelect
            options={[{ value: 0, label: 'All programs' }, ...programOptions]}
            value={filterOption === '' ? 0 : Number(filterOption)}
            onChange={(v) => setFilterOption(v && Number(v) > 0 ? Number(v) : '')}
            placeholder="All programs"
            allLabel="All programs"
          />
        </div>
        <div>
          <label className="label">Component</label>
          <select
            className="input"
            value={filterComp}
            onChange={(e) => setFilterComp(e.target.value)}
          >
            <option value="">All components</option>
            {COMPONENT_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Search module</label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              type="text"
              className="input pl-8"
              placeholder="Code or name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {(filterTerm || filterOption || filterComp || search) ? (
        <button
          className="text-[12px] text-brand inline-flex items-center gap-1 hover:underline"
          onClick={() => {
            setFilterTerm(''); setFilterOption(''); setFilterComp(''); setSearch('')
          }}
        >
          <Filter className="w-3 h-3" /> Clear filters
        </button>
      ) : null}

      {/* Exams table */}
      {examsQ.isLoading ? (
        <div className="py-12 flex items-center justify-center text-ink-500 text-[13px]">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading exams…
        </div>
      ) : exams.length === 0 ? (
        <div className="py-10 text-center">
          <div className="inline-flex w-12 h-12 rounded-full bg-ink-100 dark:bg-ink-700 items-center justify-center mb-3">
            <CalendarClock className="w-5 h-5 text-ink-400" />
          </div>
          <h3 className="text-[14px] font-semibold text-ink-700 dark:text-ink-200">
            {filterOption ? 'No scheduled modules in this program' : 'No exams scheduled yet'}
          </h3>
          <p className="text-[12.5px] text-ink-500 mt-1 max-w-md mx-auto">
            {filterOption
              ? 'Add teaching blocks for this program on the Scheduling tab first.'
              : 'Pick a program above to see its scheduled modules, or click “Schedule exam” to schedule one directly.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-ink-200 dark:border-ink-700">
          <table className="w-full text-[12.5px]">
            <thead className="bg-ink-50 dark:bg-ink-800/60 text-ink-600 dark:text-ink-300">
              <tr>
                <th className="text-left font-semibold px-3 py-2.5">Module</th>
                <th className="text-left font-semibold px-3 py-2.5">Program</th>
                <th className="text-left font-semibold px-3 py-2.5">Component</th>
                <th className="text-left font-semibold px-3 py-2.5">Date</th>
                <th className="text-left font-semibold px-3 py-2.5">Time</th>
                <th className="text-left font-semibold px-3 py-2.5">Campus</th>
                <th className="text-left font-semibold px-3 py-2.5">Lecturer</th>
                <th className="text-right font-semibold px-3 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-200 dark:divide-ink-700">
              {exams.map((row, idx) => {
                const scheduled = row.id !== null
                const rowKey = row.id !== null ? `e-${row.id}` : `m-${row.module_id}-${idx}`
                return (
                  <tr
                    key={rowKey}
                    className={`${scheduled
                      ? 'hover:bg-brand/[0.04] dark:hover:bg-brand/10 cursor-pointer'
                      : 'bg-amber-50/60 dark:bg-amber-900/10 hover:bg-amber-50 dark:hover:bg-amber-900/20'}
                    `}
                    onClick={scheduled ? () => setAttendanceId(row.id) : undefined}
                  >
                    <td className="px-3 py-2 align-top">
                      <div className="font-semibold text-ink-900 dark:text-ink-100">
                        {row.module_code}
                      </div>
                      <div className="text-[11.5px] text-ink-500">{row.module_name}</div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span className="text-ink-700 dark:text-ink-200">
                        {row.option_acro ?? row.option_code ?? '—'}
                      </span>
                      {row.option_name && (
                        <div className="text-[11.5px] text-ink-500">{row.option_name}</div>
                      )}
                      {row.mode_label && (
                        <div className="text-[11px] text-ink-400 mt-0.5">{row.mode_label}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {scheduled ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11.5px] bg-brand/10 text-brand dark:bg-brand/20 dark:text-gold-300">
                          {row.component}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11.5px] bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                          Not scheduled
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-ink-700 dark:text-ink-200">
                      {row.exam_date ?? '—'}
                    </td>
                    <td className="px-3 py-2 align-top text-ink-700 dark:text-ink-200">
                      {row.start_time && row.end_time
                        ? `${row.start_time.slice(0, 5)} – ${row.end_time.slice(0, 5)}`
                        : (row.start_time?.slice(0, 5) ?? '—')}
                    </td>
                    <td className="px-3 py-2 align-top text-ink-700 dark:text-ink-200">
                      {row.campus_name ?? '—'}
                    </td>
                    <td className="px-3 py-2 align-top text-ink-700 dark:text-ink-200">
                      {row.instructor_name ?? '—'}
                    </td>
                    <td className="px-3 py-2 align-top text-right whitespace-nowrap">
                      {scheduled ? (
                        <div className="inline-flex items-center gap-1">
                          <button
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                              row.registered_count > 0
                                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/25'
                                : 'bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-500/15 dark:text-amber-300 dark:hover:bg-amber-500/25'
                            }`}
                            title={row.registered_count > 0
                              ? `${row.registered_count} student${row.registered_count === 1 ? '' : 's'} registered — click to view attendance list`
                              : 'No students enrolled for this exam yet — click to view roster'}
                            onClick={(e) => { e.stopPropagation(); setAttendanceId(row.id) }}
                          >
                            <Users className="w-3.5 h-3.5" />
                            {row.registered_count}
                          </button>
                          {canWrite && (
                            <>
                              <button
                                className="btn-ghost btn-xs"
                                title="Edit exam"
                                onClick={(e) => { e.stopPropagation(); openEdit(row.id!) }}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                className="btn-ghost btn-xs text-red-600 hover:text-red-700"
                                title="Delete exam"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (confirm(`Delete the exam for ${row.module_code}?`)) {
                                    deleteM.mutate(row.id!)
                                  }
                                }}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      ) : canWrite ? (
                        <button
                          className="btn-primary btn-xs"
                          onClick={(e) => { e.stopPropagation(); openScheduleFor(row.module_id) }}
                        >
                          <CalendarPlus className="w-3.5 h-3.5" /> Schedule
                        </button>
                      ) : (
                        <span className="text-[11.5px] text-ink-400">Not scheduled</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Schedule / edit dialog */}
      <Modal
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditingId(null); setForm(blankForm()) }}
        title={editingId ? 'Edit exam' : 'Schedule exam'}
        size="lg"
        footer={
          <>
            <button
              className="btn-secondary"
              onClick={() => { setFormOpen(false); setEditingId(null); setForm(blankForm()) }}
            >
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={submit}
              disabled={createM.isPending || updateM.isPending || formIssues.length > 0}
              title={formIssues[0]}
            >
              {(createM.isPending || updateM.isPending) && (
                <Loader2 className="w-4 h-4 animate-spin" />
              )}
              {editingId ? 'Save changes' : 'Schedule'}
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="label">Module *</label>
            <SearchableSelect
              options={moduleOptions}
              value={form.module_id === '' ? 0 : Number(form.module_id)}
              onChange={(v) => onPickModule(v ? Number(v) : '')}
              placeholder={
                scheduledQ.isLoading
                  ? 'Loading modules…'
                  : scheduledModules.length === 0
                  ? 'No active modules — schedule teaching first.'
                  : 'Search a scheduled module…'
              }
              allLabel="Search a scheduled module…"
            />
            {scheduledModules.length === 0 && !scheduledQ.isLoading && (
              <div className="mt-2 text-[11.5px] text-amber-700 dark:text-amber-400 inline-flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                Schedule a teaching block on the “Scheduling” tab first.
              </div>
            )}
          </div>

          <div>
            <label className="label">Component</label>
            <select
              className="input"
              value={form.component}
              onChange={(e) => setForm({ ...form, component: e.target.value })}
            >
              {COMPONENT_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Term</label>
            <select
              className="input"
              value={form.term_id === '' ? '' : String(form.term_id)}
              onChange={(e) => setForm({ ...form, term_id: e.target.value === '' ? '' : Number(e.target.value) })}
            >
              <option value="">— none —</option>
              {terms.map((t) => (
                <option key={t.id} value={String(t.id)}>
                  {t.label}{t.is_current ? ' • active' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Exam date *</label>
            <input
              type="date"
              className="input"
              value={form.exam_date}
              onChange={(e) => setForm({ ...form, exam_date: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Start</label>
              <input
                type="time"
                className="input"
                value={form.start_time}
                onChange={(e) => setForm({ ...form, start_time: e.target.value })}
              />
            </div>
            <div>
              <label className="label">End</label>
              <input
                type="time"
                className="input"
                value={form.end_time}
                onChange={(e) => setForm({ ...form, end_time: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="label">Program</label>
            {/* Inherited from the program filter above / the picked module —
                shown read-only so it isn't re-selected per exam. */}
            <div className="input input-sm flex items-center bg-ink-50 dark:bg-ink-800/40">
              {form.option_id === ''
                ? <span className="text-ink-400 truncate">From selected module / filter</span>
                : <span className="text-ink-700 dark:text-ink-200 truncate">{programLabelById.get(Number(form.option_id)) ?? `Program #${form.option_id}`}</span>}
            </div>
          </div>
          <div>
            <label className="label">Campus</label>
            <SearchableSelect
              options={[{ value: 0, label: '— none —' }, ...campusOptions]}
              value={form.campus_id === '' ? 0 : Number(form.campus_id)}
              onChange={(v) => setForm({ ...form, campus_id: v && Number(v) > 0 ? Number(v) : '' })}
              placeholder="Select campus"
              allLabel="— none —"
            />
          </div>

          <div>
            <label className="label">Lecturer / proctor</label>
            {form.instructor_id === '' && form.instructor_name ? (
              <div className="flex items-center gap-2 input input-sm">
                <span className="italic text-ink-700 dark:text-ink-200 truncate flex-1">{form.instructor_name}</span>
                <span className="chip-warning !text-[10px]">unmatched</span>
                <button type="button" className="text-[11.5px] text-brand hover:underline" onClick={() => setForm({ ...form, instructor_name: '' })}>Pick from list</button>
              </div>
            ) : (
              <RoleGroupedSelect
                options={instructorOptions}
                value={form.instructor_id === '' ? '' : Number(form.instructor_id)}
                onChange={(v) => setForm({ ...form, instructor_id: v === '' ? '' : Number(v), instructor_name: v === '' ? '' : (instructorById.get(Number(v)) ?? '') })}
                placeholder="Search staff by name or role…"
                allLabel="— unassigned —"
                ariaLabel="Lecturer / proctor"
                showSubOnTrigger
              />
            )}
          </div>
          <div>
            <label className="label">Academic year</label>
            <input
              type="text"
              className="input"
              placeholder="2025-2026"
              value={form.academic_year}
              onChange={(e) => setForm({ ...form, academic_year: e.target.value })}
            />
          </div>

          <div className="md:col-span-2">
            <label className="label">Notes</label>
            <textarea
              className="input"
              rows={2}
              placeholder="Optional — any room notes or special instructions."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>

        {formIssues.length > 0 && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 px-3 py-2 text-[12px] text-red-700 dark:text-red-300 inline-flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <ul className="list-disc list-inside space-y-0.5">
              {formIssues.map((m) => <li key={m}>{m}</li>)}
            </ul>
          </div>
        )}
      </Modal>

      <ExamAttendanceModal
        examId={attendanceId}
        onClose={() => setAttendanceId(null)}
      />
    </section>
  )
}
