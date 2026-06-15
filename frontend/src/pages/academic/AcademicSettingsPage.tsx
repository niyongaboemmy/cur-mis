import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import {
  CalendarDays,
  Clock,
  Plus,
  CheckCircle2,
  Circle,
  Trash2,
  Pencil,
  Loader2,
  AlertCircle,
  CalendarClock,
  GraduationCap,
  Save,
  Upload,
  Download,
  Search,
  ChevronDown,
  Video,
  ExternalLink,
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import SearchableSelect from '@/components/ui/SearchableSelect'
import { academicService, type CreateYearPayload, type CreateTermPayload } from '@/services/academicService'
import { academicsMgmtService } from '@/services/academicsMgmtService'
import { systemService, type GuidanceVideos } from '@/services/systemService'
import { useSystemStore, selectActiveYear, selectActiveTerm } from '@/store/systemStore'
import { useSystemBasics } from '@/hooks/useSystemBasics'
import { useSessionStorage } from '@/hooks/useSessionStorage'
import type { AcademicYear, AcademicTerm, AcMgmtEntity } from '@/types/academic'
import { EntityCrudTabs, ENTITIES, type ExtraTab } from '@/components/academic/EntityCrudTabs'
import RegistrationsPanel from '@/components/academic/RegistrationsPanel'

/* ─────────────────────────────────────────────────────────────── */

const yearSchema = z.object({
  label:      z.string().min(2, 'Required').max(16, 'Too long'),
  start_date: z.string().min(1, 'Required'),
  end_date:   z.string().min(1, 'Required'),
})

const termSchema = z.object({
  academic_year_id: z.coerce.number().int().positive('Required'),
  label:            z.string().min(2, 'Required').max(64, 'Too long'),
  start_date:       z.string().optional().or(z.literal('')),
  end_date:         z.string().optional().or(z.literal('')),
})

/* ─────────────────────────────────────────────────────────────── */

const ACADEMIC_TAB_SLUGS: AcMgmtEntity[] = ['faculties', 'departments', 'options', 'modules']

export default function AcademicSettingsPage() {
  const academicEntities = useMemo(
    () => ACADEMIC_TAB_SLUGS
      .map((slug) => ENTITIES.find((e) => e.slug === slug))
      .filter((e): e is NonNullable<typeof e> => !!e),
    [],
  )

  const extraTabs: ExtraTab[] = useMemo(
    () => [
      {
        slug: 'scheduling',
        label: 'Scheduling',
        icon: CalendarClock,
        render: () => <SchedulingPanel />,
      },
      {
        slug: 'registrations',
        label: 'Registrations',
        icon: GraduationCap,
        render: () => <RegistrationsPanel />,
      },
      {
        slug: 'years-terms',
        label: 'Years & terms',
        icon: CalendarDays,
        render: () => <YearsAndTermsPanel />,
      },
      {
        slug: 'guidance-videos',
        label: 'Guidance videos',
        icon: Video,
        render: () => <GuidanceVideosPanel />,
      },
    ],
    [],
  )

  return (
    <div className="max-w-[1400px] mx-auto">
      <EntityCrudTabs
        entities={academicEntities}
        defaultSlug="faculties"
        extraTabs={extraTabs}
        ariaLabel="Academic settings sections"
      />
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────── */

function YearsAndTermsPanel() {
  const qc = useQueryClient()
  const [yearModal, setYearModal] = useState(false)
  const [termModal, setTermModal] = useState(false)
  const [editingYear, setEditingYear] = useState<AcademicYear | null>(null)
  const [editingTerm, setEditingTerm] = useState<AcademicTerm | null>(null)

  // Make sure basics refresh in sync when we toggle active year/term
  useSystemBasics()
  const activeYear = useSystemStore(selectActiveYear)
  const activeTerm = useSystemStore(selectActiveTerm)

  /* ── queries ─────────────────────────────────────────────── */
  const yearsQ = useQuery({
    queryKey: ['academic', 'years'],
    queryFn:  () => academicService.listYears(),
  })
  const termsQ = useQuery({
    queryKey: ['academic', 'terms'],
    queryFn:  () => academicService.listTerms(),
  })

  const years = yearsQ.data?.data ?? []
  const terms = termsQ.data?.data ?? []

  /* ── mutations ───────────────────────────────────────────── */
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['academic'] })
    qc.invalidateQueries({ queryKey: ['system', 'basics'] })
  }

  const createYear = useMutation({
    mutationFn: (d: CreateYearPayload) => academicService.createYear(d),
    onSuccess:  () => { toast.success('Academic year added'); setYearModal(false); invalidate() },
    onError:    (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to create year'),
  })

  const updateYear = useMutation({
    mutationFn: (v: { id: number; data: Partial<CreateYearPayload> }) => academicService.updateYear(v.id, v.data),
    onSuccess:  () => { toast.success('Year updated'); setYearModal(false); setEditingYear(null); invalidate() },
    onError:    (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to update year'),
  })

  const activateYear = useMutation({
    mutationFn: (id: number) => academicService.activateYear(id),
    onSuccess:  () => { toast.success('Year activated'); invalidate() },
    onError:    (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to activate'),
  })

  const deleteYear = useMutation({
    mutationFn: (id: number) => academicService.deleteYear(id),
    onSuccess:  () => { toast.success('Year removed'); invalidate() },
    onError:    (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to delete'),
  })

  const createTerm = useMutation({
    mutationFn: (d: CreateTermPayload) => academicService.createTerm(d),
    onSuccess:  () => { toast.success('Term added'); setTermModal(false); invalidate() },
    onError:    (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to create term'),
  })

  const updateTerm = useMutation({
    mutationFn: (v: { id: number; data: Partial<CreateTermPayload> }) => academicService.updateTerm(v.id, v.data),
    onSuccess:  () => { toast.success('Term updated'); setTermModal(false); setEditingTerm(null); invalidate() },
    onError:    (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to update term'),
  })

  const activateTerm = useMutation({
    mutationFn: (id: number) => academicService.activateTerm(id),
    onSuccess:  () => { toast.success('Term activated'); invalidate() },
    onError:    (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to activate'),
  })

  const deleteTerm = useMutation({
    mutationFn: (id: number) => academicService.deleteTerm(id),
    onSuccess:  () => { toast.success('Term removed'); invalidate() },
    onError:    (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to delete'),
  })

  /* ── year label helper ───────────────────────────────────── */
  const yearLabelById = (id: number) => years.find((y) => y.id === id)?.label ?? `#${id}`

  return (
    <div className="space-y-6">
      {/* Summary */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SummaryCard
          icon={CalendarDays}
          label="Active academic year"
          value={activeYear?.label ?? '— none —'}
          hint={
            activeYear
              ? `${activeYear.start_date} → ${activeYear.end_date}`
              : 'Set one as current below.'
          }
        />
        <SummaryCard
          icon={Clock}
          label="Active term"
          value={activeTerm?.label ?? '— none —'}
          hint={activeTerm ? `Year #${activeTerm.academic_year_id}` : 'Add & activate a term.'}
        />
      </section>

      {/* Years */}
      <section className="card p-6">
        <Header
          title="Academic years"
          sub="Manage the yearly cycles for CUR."
          onAdd={() => { setEditingYear(null); setYearModal(true) }}
          addLabel="Add year"
        />

        <ListState
          loading={yearsQ.isLoading}
          error={yearsQ.isError}
          empty={!yearsQ.isLoading && years.length === 0}
          emptyLabel="No academic years yet — create the first one."
        >
          <table className="data-table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Start</th>
                <th>End</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {years.map((y) => (
                <YearRow
                  key={y.id}
                  year={y}
                  onActivate={() => activateYear.mutate(y.id)}
                  activating={activateYear.isPending && activateYear.variables === y.id}
                  onEdit={() => { setEditingYear(y); setYearModal(true) }}
                  onDelete={() => {
                    if (confirm(`Delete academic year "${y.label}"?`)) deleteYear.mutate(y.id)
                  }}
                  deleting={deleteYear.isPending && deleteYear.variables === y.id}
                />
              ))}
            </tbody>
          </table>
        </ListState>
      </section>

      {/* Terms */}
      <section className="card p-6">
        <Header
          title="Academic terms"
          sub="Semesters / trimesters inside each year."
          onAdd={() => { setEditingTerm(null); setTermModal(true) }}
          addLabel="Add term"
          disabled={years.length === 0}
          disabledHint={years.length === 0 ? 'Create an academic year first.' : undefined}
        />

        <ListState
          loading={termsQ.isLoading}
          error={termsQ.isError}
          empty={!termsQ.isLoading && terms.length === 0}
          emptyLabel="No terms yet — add one to start tracking semesters."
        >
          <table className="data-table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Year</th>
                <th>Start</th>
                <th>End</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {terms.map((t) => (
                <TermRow
                  key={t.id}
                  term={t}
                  yearLabel={yearLabelById(t.academic_year_id)}
                  onActivate={() => activateTerm.mutate(t.id)}
                  activating={activateTerm.isPending && activateTerm.variables === t.id}
                  onEdit={() => { setEditingTerm(t); setTermModal(true) }}
                  onDelete={() => {
                    if (confirm(`Delete term "${t.label}"?`)) deleteTerm.mutate(t.id)
                  }}
                  deleting={deleteTerm.isPending && deleteTerm.variables === t.id}
                />
              ))}
            </tbody>
          </table>
        </ListState>
      </section>

      {/* ── Year modal (create / edit) ── */}
      <YearModal
        open={yearModal}
        onClose={() => { setYearModal(false); setEditingYear(null) }}
        initial={editingYear}
        onSubmit={(v) => editingYear
          ? updateYear.mutate({ id: editingYear.id, data: v })
          : createYear.mutate(v)}
        submitting={createYear.isPending || updateYear.isPending}
      />

      {/* ── Term modal (create / edit) ── */}
      <TermModal
        open={termModal}
        onClose={() => { setTermModal(false); setEditingTerm(null) }}
        years={years}
        defaultYearId={activeYear?.id ?? years[0]?.id}
        initial={editingTerm}
        onSubmit={(v) => editingTerm
          ? updateTerm.mutate({ id: editingTerm.id, data: v })
          : createTerm.mutate(v)}
        submitting={createTerm.isPending || updateTerm.isPending}
      />
    </div>
  )
}

/* ============================================================
   Small composables
   ============================================================ */

function SummaryCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: any
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="card p-5 flex items-start gap-3">
      <div className="w-10 h-10 rounded-md bg-brand/10 text-brand dark:bg-brand/25 dark:text-gold-400 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wider font-medium text-ink-400">{label}</p>
        <p className="text-[18px] font-semibold text-ink-900 dark:text-white truncate">{value}</p>
        {hint && <p className="text-[12px] text-ink-500 mt-0.5 truncate">{hint}</p>}
      </div>
    </div>
  )
}

function Header({
  title, sub, onAdd, addLabel, disabled, disabledHint,
}: {
  title: string
  sub?: string
  onAdd: () => void
  addLabel: string
  disabled?: boolean
  disabledHint?: string
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div>
        <h2 className="section-title">{title}</h2>
        {sub && <p className="section-sub">{sub}</p>}
        {disabled && disabledHint && (
          <p className="text-[12px] text-amber-600 mt-1 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> {disabledHint}
          </p>
        )}
      </div>
      <button
        onClick={onAdd}
        disabled={disabled}
        className="btn-primary btn-sm"
      >
        <Plus className="w-3.5 h-3.5" />
        {addLabel}
      </button>
    </div>
  )
}

function ListState({
  loading, error, empty, emptyLabel, children,
}: {
  loading: boolean
  error:   boolean
  empty:   boolean
  emptyLabel: string
  children: React.ReactNode
}) {
  if (loading) {
    return <div className="flex items-center gap-2 py-6 text-ink-500 text-[13px]"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
  }
  if (error) {
    return <p className="text-red-600 text-[13px] py-4">Failed to load. Try again.</p>
  }
  if (empty) {
    return <div className="rounded-md border border-dashed border-ink-200 p-6 text-center text-ink-500 text-[13px]">{emptyLabel}</div>
  }
  return <>{children}</>
}

function YearRow({
  year, onActivate, activating, onEdit, onDelete, deleting,
}: {
  year: AcademicYear
  onActivate: () => void
  activating: boolean
  onEdit:     () => void
  onDelete:   () => void
  deleting:   boolean
}) {
  const active = !!year.is_current
  return (
    <tr>
      <td className="font-semibold text-ink-900 dark:text-ink-100">{year.label}</td>
      <td>{year.start_date ?? '—'}</td>
      <td>{year.end_date   ?? '—'}</td>
      <td>
        {active
          ? <span className="chip-success"><CheckCircle2 className="w-3 h-3" /> Active</span>
          : <span className="chip-soft"><Circle className="w-3 h-3" /> Inactive</span>}
      </td>
      <td className="text-right">
        <div className="inline-flex items-center gap-1">
          {!active && (
            <button className="btn-secondary btn-sm" onClick={onActivate} disabled={activating}>
              {activating ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
              Activate
            </button>
          )}
          <button className="icon-btn" onClick={onEdit} aria-label="Edit year">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            className="icon-btn text-red-500 hover:text-red-600 hover:bg-red-50"
            onClick={onDelete}
            disabled={deleting}
            aria-label="Delete year"
          >
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </td>
    </tr>
  )
}

function TermRow({
  term, yearLabel, onActivate, activating, onEdit, onDelete, deleting,
}: {
  term: AcademicTerm
  yearLabel: string
  onActivate: () => void
  activating: boolean
  onEdit:     () => void
  onDelete:   () => void
  deleting:   boolean
}) {
  const active = !!term.is_current
  return (
    <tr>
      <td className="font-semibold text-ink-900 dark:text-ink-100">{term.label}</td>
      <td>{yearLabel}</td>
      <td>{term.start_date ?? '—'}</td>
      <td>{term.end_date   ?? '—'}</td>
      <td>
        {active
          ? <span className="chip-success"><CheckCircle2 className="w-3 h-3" /> Active</span>
          : <span className="chip-soft"><Circle className="w-3 h-3" /> Inactive</span>}
      </td>
      <td className="text-right">
        <div className="inline-flex items-center gap-1">
          {!active && (
            <button className="btn-secondary btn-sm" onClick={onActivate} disabled={activating}>
              {activating ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
              Activate
            </button>
          )}
          <button className="icon-btn" onClick={onEdit} aria-label="Edit term">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            className="icon-btn text-red-500 hover:text-red-600 hover:bg-red-50"
            onClick={onDelete}
            disabled={deleting}
            aria-label="Delete term"
          >
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </td>
    </tr>
  )
}

/* ─── Year modal ─── */
function YearModal({
  open, onClose, onSubmit, submitting, initial,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (v: CreateYearPayload) => void
  submitting: boolean
  initial?: AcademicYear | null
}) {
  const form = useForm<z.infer<typeof yearSchema>>({
    resolver: zodResolver(yearSchema),
    defaultValues: { label: '', start_date: '', end_date: '' },
  })
  useEffect(() => {
    if (!open) return
    form.reset({
      label:      initial?.label      ?? '',
      start_date: initial?.start_date ?? '',
      end_date:   initial?.end_date   ?? '',
    })
  }, [open, initial])
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'Edit academic year' : 'New academic year'}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            onClick={form.handleSubmit((v) => onSubmit(v))}
            disabled={submitting}
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {initial ? 'Save changes' : 'Create'}
          </button>
        </>
      }
    >
      <form onSubmit={form.handleSubmit((v) => onSubmit(v))} className="space-y-4">
        <Field label="Label (e.g. 2026/2027)" error={form.formState.errors.label?.message}>
          <input className="input" placeholder="2026/2027" {...form.register('label')} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Start date" error={form.formState.errors.start_date?.message}>
            <input type="date" className="input" {...form.register('start_date')} />
          </Field>
          <Field label="End date" error={form.formState.errors.end_date?.message}>
            <input type="date" className="input" {...form.register('end_date')} />
          </Field>
        </div>
      </form>
    </Modal>
  )
}

/* ─── Term modal ─── */
function TermModal({
  open, onClose, onSubmit, submitting, years, defaultYearId, initial,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (v: CreateTermPayload) => void
  submitting: boolean
  years: AcademicYear[]
  defaultYearId?: number
  initial?: AcademicTerm | null
}) {
  const form = useForm<z.infer<typeof termSchema>>({
    resolver: zodResolver(termSchema),
    defaultValues: { label: '', academic_year_id: defaultYearId, start_date: '', end_date: '' },
  })
  useEffect(() => {
    if (!open) return
    form.reset({
      label:            initial?.label            ?? '',
      academic_year_id: initial?.academic_year_id ?? defaultYearId,
      start_date:       initial?.start_date       ?? '',
      end_date:         initial?.end_date         ?? '',
    })
  }, [open, initial, defaultYearId])
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'Edit academic term' : 'New academic term'}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            onClick={form.handleSubmit((v) => onSubmit({
              academic_year_id: v.academic_year_id,
              label: v.label,
              start_date: v.start_date || undefined,
              end_date:   v.end_date   || undefined,
            }))}
            disabled={submitting}
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {initial ? 'Save changes' : 'Create'}
          </button>
        </>
      }
    >
      <form className="space-y-4">
        <Field label="Academic year" error={form.formState.errors.academic_year_id?.message}>
          <select className="input" {...form.register('academic_year_id')}>
            {years.map((y) => (
              <option key={y.id} value={y.id}>{y.label}{y.is_current ? ' • active' : ''}</option>
            ))}
          </select>
        </Field>
        <Field label="Term label (e.g. Semester 1)" error={form.formState.errors.label?.message}>
          <input className="input" placeholder="Semester 1" {...form.register('label')} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Start date (optional)" error={form.formState.errors.start_date?.message}>
            <input type="date" className="input" {...form.register('start_date')} />
          </Field>
          <Field label="End date (optional)" error={form.formState.errors.end_date?.message}>
            <input type="date" className="input" {...form.register('end_date')} />
          </Field>
        </div>
      </form>
    </Modal>
  )
}

function Field({
  label, error, children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {error && <p className="error-text">{error}</p>}
    </div>
  )
}

/* ============================================================
   Module Scheduling — pick a program + mode, edit start/end
   dates per module, and visualize as a Gantt-style timeline.
   ============================================================ */

type ServerBlock = {
  id:              number
  start_date:      string | null
  end_date:        string | null
  semesters:       string | null
  academic_year:   string | null
  day_of_week:     number | null
  /** Comma-separated ISO day numbers (1=Mon…7=Sun). May be multi-day. */
  day_pattern:     string | null
  start_time:      string | null
  end_time:        string | null
  instructor_id:   number | null
  instructor_name: string | null
  activity:        string | null
  year_of_study:   number | null
  campus_id:       number | null
}
type ServerModule = {
  module_id:      number
  module_order:   number | null
  module_code:    string
  module_name:    string
  module_credits: number | null
  level:          number | null
  blocks:         ServerBlock[]
}

/** A working-copy block: tracks its server `id` (if any), plus a local
 *  React key so add/remove animations work. Drafts have id=null and
 *  get inserted by the backend on save. */
type WorkingBlock = {
  _key:            string
  id:              number | null
  module_id:       number
  start_date:      string
  end_date:        string
  semesters:       string
  day_of_week:     number | ''  // legacy; derived on save from day_pattern
  /** Selected ISO day numbers (1=Mon…7=Sun). Empty = "any day". */
  day_pattern:     number[]
  start_time:      string  // 'HH:MM'
  end_time:        string  // 'HH:MM'
  instructor_id:   number | ''
  instructor_name: string
  activity:        string
  year_of_study:   number | ''
  campus_id:       number | ''
}

/** Per-block validation issues. Mirrors the backend's invariants so the
 *  client refuses to submit a request that would partially fail. */
type BlockIssues = {
  startAfterEnd:        boolean   // end_date < start_date
  endBeforeStartTime:   boolean   // end_time <= start_time (same-day)
  endTimeWithoutStart:  boolean   // end_time set but start_time blank
}

function validateBlock(b: WorkingBlock): BlockIssues {
  const startAfterEnd =
    !!b.start_date && !!b.end_date && b.end_date < b.start_date
  // 'HH:MM' strings sort lexicographically as time-of-day. Backend rejects
  // when end <= start, so flag equality too.
  const endBeforeStartTime =
    !!b.start_time && !!b.end_time && b.end_time <= b.start_time
  const endTimeWithoutStart = !b.start_time && !!b.end_time
  return { startAfterEnd, endBeforeStartTime, endTimeWithoutStart }
}

const ACTIVITY_OPTIONS = ['', 'Teaching', 'Final Exam', 'Lab', 'Tutorial', 'Workshop']

const SEMESTER_OPTIONS = [
  '', 'S1', 'S2', 'S1&S2',
  'S3', 'S4', 'S3&S4',
  'S5', 'S6', 'S5&S6',
  'S7', 'S8', 'S7&S8',
]
const DAY_LABELS: Record<number, string> = {
  1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun',
}
const WEEKDAYS = [1, 2, 3, 4, 5]
const WEEKEND  = [6, 7]

/** Parse a server-side `day_pattern` ("1,3,5" / "weekdays" / "weekend")
 *  into a sorted, deduplicated list of ISO day numbers. Falls back to the
 *  legacy single `day_of_week` when no pattern is set. */
function parseDayPattern(pattern: string | null | undefined, dayOfWeek: number | null | undefined): number[] {
  const out = new Set<number>()
  const raw = (pattern ?? '').trim().toLowerCase()
  if (raw === 'weekdays' || raw === 'mon-fri' || raw === 'monday-friday') {
    WEEKDAYS.forEach((d) => out.add(d))
  } else if (raw === 'weekend' || raw === 'sat-sun' || raw === 'saturday-sunday') {
    WEEKEND.forEach((d) => out.add(d))
  } else if (raw) {
    for (const tok of raw.split(/[,\s]+/)) {
      const n = Number(tok)
      if (Number.isInteger(n) && n >= 1 && n <= 7) out.add(n)
    }
  } else if (typeof dayOfWeek === 'number' && dayOfWeek >= 1 && dayOfWeek <= 7) {
    out.add(dayOfWeek)
  }
  return [...out].sort((a, b) => a - b)
}

/** Compact human-readable summary of a day list. Picks the smallest form
 *  that's still unambiguous: "—" / "Mon" / "Mon–Fri" / "Sat,Sun" /
 *  "Mon, Wed, Fri". */
function formatDayPattern(days: number[]): string {
  if (days.length === 0) return '— any —'
  const sorted = [...days].sort((a, b) => a - b)
  const isWeekdays = sorted.length === 5 && sorted.every((d, i) => d === i + 1)
  const isWeekend  = sorted.length === 2 && sorted[0] === 6 && sorted[1] === 7
  if (isWeekdays) return 'Mon–Fri'
  if (isWeekend)  return 'Sat–Sun'
  if (sorted.length === 7) return 'All week'
  return sorted.map((d) => DAY_LABELS[d]).join(', ')
}

function SchedulingPanel() {
  const qc = useQueryClient()
  // Tab-level selection (program/mode/term) is persisted to sessionStorage
  // so switching to another Academic-Settings tab and back doesn't wipe
  // the admin's context. Cleared automatically when the browser tab closes.
  const [programId, setProgramId] = useSessionStorage<number | ''>('sched.programId', '')
  const [mode,      setMode]      = useSessionStorage<string>('sched.mode', 'Day')
  const [termId,    setTermId]    = useSessionStorage<number | ''>('sched.termId', '')

  // Working copy of every module's blocks. Initialised from server data
  // when the query resolves; mutated locally on every edit; reconciled
  // against the server's snapshot when saving (creates/updates/deletes).
  const [working, setWorking] = useState<Record<number, WorkingBlock[]>>({})
  const [originalIds, setOriginalIds] = useState<Set<number>>(new Set())
  const [importOpen, setImportOpen] = useState(false)

  // Reset working copy whenever the user changes program / mode / term.
  useEffect(() => {
    setWorking({})
    setOriginalIds(new Set())
  }, [programId, mode, termId])

  // Academic terms — the selected one bounds the date pickers and the
  // Gantt's time axis so admins can't plan outside the term window.
  const termsQ = useQuery({
    queryKey: ['academic', 'terms'],
    queryFn:  () => academicService.listTerms(),
  })
  const terms = (termsQ.data?.data ?? []) as AcademicTerm[]
  const selectedTerm = useMemo(
    () => terms.find((t) => t.id === Number(termId)) ?? null,
    [terms, termId],
  )
  // Default to the active term once loaded so the schedule lands inside
  // a sensible window without an extra click.
  useEffect(() => {
    if (termId === '' && terms.length > 0) {
      const active = terms.find((t) => !!t.is_current)
      if (active) setTermId(active.id)
    }
  }, [terms, termId])
  const termStart = selectedTerm?.start_date ?? ''
  const termEnd   = selectedTerm?.end_date   ?? ''

  const programsQ = useQuery({
    queryKey: ['acmgmt', 'options', 'all'],
    queryFn:  () => academicsMgmtService.list<any>('options', { per_page: 1000 }),
  })
  const programs = (programsQ.data?.data?.data ?? []) as Array<{ id: number; name: string; code?: string }>

  const instructorsQ = useQuery({
    queryKey: ['scheduling', 'instructors'],
    queryFn:  () => academicsMgmtService.getInstructors(),
    staleTime: 5 * 60 * 1000,
  })
  const instructors = (instructorsQ.data?.data?.rows ?? []) as Array<{ id: number; full_name: string; position: string | null }>

  // Campuses — power the per-block Campus selector. Loaded once; tiny payload.
  const campusesQ = useQuery({
    queryKey: ['scheduling', 'campuses'],
    queryFn:  () => academicsMgmtService.list<any>('campuses', { per_page: 1000 }),
    staleTime: 5 * 60 * 1000,
  })
  const campuses = (campusesQ.data?.data?.data ?? []) as Array<{ id: number; name: string }>

  const schedulesQ = useQuery({
    queryKey: ['scheduling', programId, mode],
    queryFn:  () => academicsMgmtService.getSchedules(Number(programId), mode),
    enabled:  !!programId,
  })
  const rows = (schedulesQ.data?.data?.rows ?? []) as ServerModule[]

  // Hydrate the working copy when the server data arrives. Done in
  // an effect so the user's in-flight edits aren't blown away by a
  // background refetch.
  useEffect(() => {
    if (!schedulesQ.data) return
    const next: Record<number, WorkingBlock[]> = {}
    const ids = new Set<number>()
    rows.forEach((m) => {
      next[m.module_id] = m.blocks.map((b) => {
        ids.add(b.id)
        return serverBlockToWorking(m.module_id, b)
      })
    })
    setWorking(next)
    setOriginalIds(ids)
  }, [schedulesQ.data])   

  const blocksOf = (moduleId: number): WorkingBlock[] => working[moduleId] ?? []
  const setBlocks = (moduleId: number, list: WorkingBlock[]) => {
    setWorking((prev) => ({ ...prev, [moduleId]: list }))
  }
  const updateBlock = (moduleId: number, key: string, patch: Partial<WorkingBlock>) => {
    setBlocks(moduleId, blocksOf(moduleId).map((b) => b._key === key ? { ...b, ...patch } : b))
  }
  const addBlock = (moduleId: number) => {
    setBlocks(moduleId, [...blocksOf(moduleId), newDraftBlock(moduleId)])
  }
  const removeBlock = (moduleId: number, key: string) => {
    setBlocks(moduleId, blocksOf(moduleId).filter((b) => b._key !== key))
  }

  // Reconcile working copy against the server snapshot to compute what
  // changed: new drafts → create, modified saved blocks → update, server
  // blocks no longer present → delete.
  const { allBlocks, deleteIds, dirty, dirtyCount } = useMemo(() => {
    const all: WorkingBlock[] = []
    const presentIds = new Set<number>()
    for (const list of Object.values(working)) {
      for (const b of list) {
        all.push(b)
        if (b.id !== null) presentIds.add(b.id)
      }
    }
    const dels = [...originalIds].filter((id) => !presentIds.has(id))
    const news = all.filter((b) => b.id === null).length
    // For updates, we'd ideally diff against the original snapshot — but
    // a full deep compare would be costly. Treat any block we know about
    // as potentially dirty; the backend update is idempotent on equal
    // values, so re-saving an unchanged block is harmless.
    return {
      allBlocks: all,
      deleteIds: dels,
      dirty: news > 0 || dels.length > 0 || all.some((b) => b.id !== null),
      dirtyCount: news + dels.length,
    }
  }, [working, originalIds])

  // Block-level validation. Mirrors the backend's invariants so the user
  // can't kick off a save that the server will partially reject.
  // Returned issues are keyed per WorkingBlock._key.
  const issuesByKey = useMemo(() => {
    const map = new Map<string, BlockIssues>()
    for (const b of allBlocks) {
      const issues = validateBlock(b)
      if (issues.startAfterEnd || issues.endBeforeStartTime || issues.endTimeWithoutStart) {
        map.set(b._key, issues)
      }
    }
    return map
  }, [allBlocks])
  const invalidCount = issuesByKey.size
  const canSave      = dirty && invalidCount === 0

  const saveM = useMutation({
    mutationFn: () => {
      const blocks = allBlocks.map((b) => ({
        ...(b.id !== null ? { id: b.id } : {}),
        module_id:       b.module_id,
        start_date:      b.start_date || null,
        end_date:        b.end_date   || null,
        semesters:       b.semesters  || null,
        day_of_week:     b.day_pattern.length === 1 ? b.day_pattern[0]
                       : b.day_of_week === '' ? null : Number(b.day_of_week),
        day_pattern:     b.day_pattern.length ? b.day_pattern.join(',') : null,
        start_time:      b.start_time || null,
        end_time:        b.end_time   || null,
        instructor_id:   b.instructor_id === '' ? null : Number(b.instructor_id),
        instructor_name: b.instructor_name || null,
        activity:        b.activity   || null,
        year_of_study:   b.year_of_study === '' ? null : Number(b.year_of_study),
        campus_id:       b.campus_id === '' ? null : Number(b.campus_id),
      }))
      return academicsMgmtService.saveSchedules({
        program_id: Number(programId),
        mode,
        blocks,
        delete_ids: deleteIds,
      })
    },
    onSuccess: (res) => {
      const d = res.data ?? { created: 0, updated: 0, deleted: 0, failed: [] }
      const summary = [
        d.created ? `${d.created} new` : null,
        d.updated ? `${d.updated} updated` : null,
        d.deleted ? `${d.deleted} deleted` : null,
      ].filter(Boolean).join(', ')
      toast.success(summary ? `Schedule saved — ${summary}.` : 'Schedule saved.')
      if (d.failed.length > 0) {
        // Surface the first concrete server-side error so the user knows
        // what to fix instead of the generic "N blocks failed".
        const first = d.failed[0]
        toast.error(
          d.failed.length === 1
            ? `Block #${first.index}: ${first.error}`
            : `${d.failed.length} blocks failed — first: ${first.error}`,
        )
      }
      qc.invalidateQueries({ queryKey: ['scheduling'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to save schedule'),
  })

  return (
    <section className="card p-6 min-h-[calc(100vh-12rem)]">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-md bg-brand/10 text-brand dark:bg-brand/25 dark:text-gold-400 flex items-center justify-center shrink-0">
          <CalendarClock className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h2 className="section-title">Module scheduling</h2>
          <p className="section-sub">
            {programId
              ? 'Edit teaching blocks below — every module of the selected program is listed.'
              : 'Pick a program first — every block is scoped to one program at a time.'}
          </p>
        </div>
      </div>

      {/* STAGE 1 — no program picked. A big, inviting selector that can't
          be missed; nothing else renders until the admin chooses one. */}
      {!programId && (
        <div className="rounded-xl border border-ink-200 dark:border-ink-700 bg-ink-50/40 dark:bg-ink-900/40 p-6 sm:p-8 max-w-3xl mx-auto">
          <div className="text-center mb-5">
            <div className="inline-flex w-12 h-12 rounded-full bg-brand/10 text-brand dark:bg-brand/25 dark:text-gold-400 items-center justify-center mb-3">
              <CalendarClock className="w-6 h-6" />
            </div>
            <h3 className="text-[16px] font-semibold text-ink-900 dark:text-ink-100">
              Which program are you scheduling?
            </h3>
            <p className="text-[12.5px] text-ink-500 mt-0.5">
              Modules, mode, dates and lecturers are all tracked per program.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-3">
            <div>
              <label className="label">Program *</label>
              <SearchableSelect
                options={programs.map((p) => ({
                  value: Number(p.id),
                  label: p.code ? `${p.code} · ${p.name}` : p.name,
                }))}
                value={0}
                onChange={(v) => setProgramId(v ? Number(v) : '')}
                placeholder="Search programs…"
                allLabel="Search programs…"
              />
            </div>
            <div>
              <label className="label">Mode</label>
              <select className="input" value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="Day">Day</option>
                <option value="Weekend">Weekend</option>
                <option value="Holiday">Holiday</option>
                <option value="">— unassigned —</option>
              </select>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-ink-200 dark:border-ink-700 flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[12px] text-ink-500">
              Already have the spreadsheet? Skip selection and import the whole file.
            </span>
            <button className="btn-secondary btn-sm" onClick={() => setImportOpen(true)}>
              <Upload className="w-3.5 h-3.5" /> Import timetable
            </button>
          </div>
        </div>
      )}

      {/* STAGE 2 — toolbar (with inline program switcher) + table view. */}
      {programId && (
        <>
          {/* Selected-program card: shown above the toolbar so the admin
              never loses sight of which program these blocks belong to,
              and can swap it inline without leaving the table. */}
          <div className="rounded-lg border border-brand/30 bg-brand/[0.04] dark:border-brand/40 dark:bg-brand/10 p-3 mb-3">
            <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] items-center gap-3">
              <div className="text-[11px] uppercase tracking-[0.15em] font-semibold text-brand dark:text-gold-400">
                Currently scheduling
              </div>
              <SearchableSelect
                options={programs.map((p) => ({
                  value: Number(p.id),
                  label: p.code ? `${p.code} · ${p.name}` : p.name,
                }))}
                value={Number(programId)}
                onChange={(v) => setProgramId(v ? Number(v) : '')}
                placeholder="Switch program…"
                allLabel="Switch program…"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 mb-4">
            <div>
              <label className="label">Mode</label>
              <select className="input" value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="Day">Day</option>
                <option value="Weekend">Weekend</option>
                <option value="Holiday">Holiday</option>
                <option value="">— unassigned —</option>
              </select>
            </div>
            <div>
              <label className="label">
                Academic term
                {selectedTerm && (
                  <span className="ml-1 text-[11px] text-ink-500 font-normal">
                    ({termStart} → {termEnd})
                  </span>
                )}
              </label>
              <select
                className="input"
                value={termId === '' ? '' : String(termId)}
                onChange={(e) => setTermId(e.target.value === '' ? '' : Number(e.target.value))}
              >
                <option value="">— no term (no date bounds) —</option>
                {terms.map((t) => (
                  <option key={t.id} value={String(t.id)}>
                    {t.label}{t.is_current ? ' • active' : ''}
                    {t.start_date && t.end_date ? ` (${t.start_date} → ${t.end_date})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2 flex-wrap">
              <button
                className="btn-secondary"
                onClick={() => downloadTimetable()}
                title="Export every block to a .xlsx in the university timetable format"
              >
                <Download className="w-4 h-4" /> Export
              </button>
              <button
                className="btn-secondary"
                onClick={() => setImportOpen(true)}
                title="Upload the university timetable spreadsheet"
              >
                <Upload className="w-4 h-4" /> Import
              </button>
              <button
                className="btn-primary"
                onClick={() => saveM.mutate()}
                disabled={!canSave || saveM.isPending}
                title={
                  !dirty
                    ? 'No changes to save'
                    : invalidCount > 0
                    ? `Fix ${invalidCount} invalid block${invalidCount === 1 ? '' : 's'} first`
                    : 'Save schedule'
                }
              >
                {saveM.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Save className="w-4 h-4" />}
                {invalidCount > 0
                  ? `${invalidCount} invalid`
                  : dirtyCount > 0
                  ? `Save (${dirtyCount} pending)`
                  : 'Save schedule'}
              </button>
            </div>
          </div>

          {invalidCount > 0 && (
            <div
              className="mb-3 rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-[12.5px] text-red-700 dark:text-red-300 flex items-center gap-2"
              role="alert"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>
                <strong>{invalidCount}</strong> block{invalidCount === 1 ? ' has' : 's have'} an
                invalid time or date range. End time must be after start time, and end date can't
                be before start date.
              </span>
            </div>
          )}

          {schedulesQ.isLoading ? (
            <div className="py-16 flex items-center justify-center text-ink-500 text-[13px]">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading schedule…
            </div>
          ) : rows.length === 0 ? (
            <SchedEmpty msg="This program has no modules linked yet. Add modules via the Modules tab first, then come back." />
          ) : (
            <ScheduleBlocksTable
              modules={rows}
              blocksOf={blocksOf}
              updateBlock={updateBlock}
              addBlock={addBlock}
              removeBlock={removeBlock}
              instructors={instructors}
              campuses={campuses}
              issuesByKey={issuesByKey}
              termStart={termStart}
              termEnd={termEnd}
              mode={mode}
            />
          )}
        </>
      )}

      {/* Import-timetable dialog */}
      <ImportTimetableModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onDone={() => qc.invalidateQueries({ queryKey: ['scheduling'] })}
      />
    </section>
  )
}

/* ── Helpers shared by SchedulingPanel + helpers below ─────── */

function newDraftBlock(moduleId: number): WorkingBlock {
  return {
    _key:        `new-${moduleId}-${Math.random().toString(36).slice(2, 8)}`,
    id:          null,
    module_id:   moduleId,
    start_date:  '', end_date: '',
    semesters:   '',
    day_of_week: '',
    day_pattern: [],
    start_time:  '', end_time: '',
    instructor_id:   '',
    instructor_name: '',
    activity:    '',
    year_of_study:   '',
    campus_id:       '',
  }
}
function serverBlockToWorking(moduleId: number, b: ServerBlock): WorkingBlock {
  return {
    _key:        `b-${b.id}`,
    id:          b.id,
    module_id:   moduleId,
    start_date:  b.start_date ?? '',
    end_date:    b.end_date   ?? '',
    semesters:   b.semesters  ?? '',
    day_of_week: b.day_of_week ?? '',
    day_pattern: parseDayPattern(b.day_pattern, b.day_of_week),
    start_time:  b.start_time ? b.start_time.slice(0, 5) : '',
    end_time:    b.end_time   ? b.end_time.slice(0, 5)   : '',
    instructor_id:   b.instructor_id ?? '',
    instructor_name: b.instructor_id ? '' : (b.instructor_name ?? ''),
    activity:    b.activity ?? '',
    year_of_study:   b.year_of_study ?? '',
    campus_id:       b.campus_id ?? '',
  }
}

/** Trigger the timetable export and save the response as an .xlsx that
 *  mirrors the university's spreadsheet layout. The leading `ID` column
 *  carries the offering's primary key — when the file is re-imported,
 *  the backend updates those rows in place instead of duplicating them. */
async function downloadTimetable() {
  try {
    const res = await academicsMgmtService.exportTimetable()
    const rows = res.data?.rows ?? []
    if (rows.length === 0) {
      toast.error('No timetable data to export yet.')
      return
    }
    const headers = [
      'ID',
      'M', 'DPT', 'OPT', 'Attendance Mode',
      'Module & Component', 'Code',
      'Credits', 'Total Contact Hours',
      'Start Date', 'End Date', 'Period',
      'Hours/Day', 'Total Days', 'Total Weeks',
      'Activity', "Lecturer's Name",
      'Level', 'Year', 'Sem', 'Campus',
    ]
    const fmtDate = (iso: string | null) => {
      if (!iso) return ''
      const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      if (!m) return iso
      return `${Number(m[2])}/${Number(m[3])}/${m[1]}`
    }
    const fmtPeriod = (s: string | null, e: string | null) => {
      const fmt = (t: string) => t.slice(0, 2) + 'h' + t.slice(3, 5)
      if (!s || !e) return ''
      return `${fmt(s)}:${fmt(e)}`
    }
    /** Hours per teaching day from the period endpoints. Returns a number
     *  so Excel keeps it numeric (and so callers can multiply it cleanly).
     *  Negative differences (overnight blocks) collapse to ''. */
    const hoursPerDay = (s: string | null, e: string | null): number | '' => {
      if (!s || !e) return ''
      const toMin = (t: string) => {
        const m = t.match(/^(\d{1,2}):(\d{2})/); if (!m) return NaN
        return Number(m[1]) * 60 + Number(m[2])
      }
      const diff = toMin(e) - toMin(s)
      if (!Number.isFinite(diff) || diff <= 0) return ''
      return Math.round((diff / 60) * 100) / 100   // 2 decimals
    }
    const round1 = (n: number) => Math.round(n * 10) / 10
    const data = rows.map((r) => {
      const start = r.start_date ?? ''
      const month = start ? Number(start.slice(5, 7)) : ''
      const dayCount: number | '' = (r.start_date && r.end_date)
        ? (Math.round((+new Date(r.end_date) - +new Date(r.start_date)) / 86_400_000) + 1)
        : ''
      const hpd = hoursPerDay(r.start_time, r.end_time)
      const totalHours: number | '' =
        typeof hpd === 'number' && typeof dayCount === 'number'
          ? Math.round(hpd * dayCount * 100) / 100
          : ''
      const weeks: number | '' = typeof dayCount === 'number' ? round1(dayCount / 7) : ''
      return [
        r.id ?? '',
        month,
        r.dep_acronym ?? '',
        r.option_acro ?? '',
        r.mode === 'Day' ? 'DP' : r.mode === 'Weekend' ? 'WK' : r.mode === 'Holiday' ? 'HD' : '',
        r.module_name ?? '',
        r.module_code ?? '',
        r.module_credits ?? '',
        totalHours,
        fmtDate(r.start_date),
        fmtDate(r.end_date),
        fmtPeriod(r.start_time, r.end_time),
        hpd,
        dayCount,
        weeks,
        r.activity ?? '',
        r.instructor_full_name ?? r.instructor_name_raw ?? '',
        r.level ?? '',
        r.year_of_study ?? '',
        r.semesters ?? '',
        r.campus_name ?? '',
      ]
    })
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Timetable')
    XLSX.writeFile(wb, 'Timetable.xlsx')
    toast.success(`Exported ${rows.length} block${rows.length === 1 ? '' : 's'}.`)
  } catch (e: any) {
    toast.error(e?.response?.data?.message ?? 'Export failed')
  }
}

function SchedEmpty({ msg }: { msg: string }) {
  return (
    <div className="rounded-lg border border-dashed border-ink-200 dark:border-ink-700 p-12 text-center text-ink-500 text-[13px]">
      {msg}
    </div>
  )
}

function ScheduleBlocksTable({
  modules, blocksOf, updateBlock, addBlock, removeBlock, instructors, campuses,
  issuesByKey, termStart = '', termEnd = '', mode,
}: {
  modules: ServerModule[]
  blocksOf: (moduleId: number) => WorkingBlock[]
  updateBlock: (moduleId: number, key: string, patch: Partial<WorkingBlock>) => void
  addBlock: (moduleId: number) => void
  removeBlock: (moduleId: number, key: string) => void
  instructors: Array<{ id: number; full_name: string; position: string | null }>
  campuses:    Array<{ id: number; name: string }>
  issuesByKey: Map<string, BlockIssues>
  termStart?: string
  termEnd?:   string
  mode?:      string
}) {
  // Build one row per (module, block). Modules with zero blocks emit a
  // single placeholder row so every program module is listed top-to-
  // bottom — admins can spot which modules still need scheduling, and
  // add a block straight from the placeholder.
  type Row = { module: ServerModule; block: WorkingBlock | null }
  const sorted = [...modules].sort((a, b) => {
    const mo = (a.module_order ?? 9999) - (b.module_order ?? 9999)
    if (mo !== 0) return mo
    return a.module_code.localeCompare(b.module_code)
  })
  const rows: Row[] = []
  sorted.forEach((m) => {
    const blocks = [...blocksOf(m.module_id)].sort((a, b) => {
      const sa = a.start_date || '9'
      const sb = b.start_date || '9'
      return sa.localeCompare(sb)
    })
    if (blocks.length === 0) {
      rows.push({ module: m, block: null })
    } else {
      blocks.forEach((b) => rows.push({ module: m, block: b }))
    }
  })

  const blocksTotal = rows.reduce((n, r) => n + (r.block ? 1 : 0), 0)
  const moduleCount = sorted.length

  return (
    <div className="card p-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
        <h3 className="text-[12.5px] font-bold uppercase tracking-[0.15em] text-ink-700 dark:text-ink-200">
          Teaching blocks
          <span className="ml-2 text-ink-500 font-normal normal-case tracking-normal">
            ({moduleCount} module{moduleCount === 1 ? '' : 's'} · {blocksTotal} block{blocksTotal === 1 ? '' : 's'})
          </span>
        </h3>
      </div>

      <div className="overflow-x-auto">
        <table className="data-table data-table-tight text-[12.5px] min-w-[1820px]">
          <thead>
            <tr>
              <th className="w-[40px] sticky left-0 z-20 bg-ink-50 dark:bg-ink-900">#</th>
              <th className="w-[110px] sticky left-[40px] z-20 bg-ink-50 dark:bg-ink-900">Code</th>
              <th className="w-[260px] sticky left-[150px] z-20 bg-ink-50 dark:bg-ink-900 border-r border-ink-200 dark:border-ink-700 shadow-[2px_0_0_0_rgba(0,0,0,0.04)]">Module &amp; Component</th>
              <th className="w-[150px]">Activity</th>
              <th className="w-[120px]">Sem</th>
              <th className="w-[180px]">Days</th>
              <th className="w-[170px]">Start Date</th>
              <th className="w-[170px]">End Date</th>
              <th className="w-[230px]">Period</th>
              <th className="w-[240px]">Lecturer</th>
              <th className="w-[200px]">Campus</th>
              <th className="w-[60px]" />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ module: m, block: b }) => (
              b ? (
                <BlockRow
                  key={b._key}
                  module={m}
                  block={b}
                  issues={issuesByKey.get(b._key)}
                  onChange={(patch) => updateBlock(m.module_id, b._key, patch)}
                  onRemove={() => removeBlock(m.module_id, b._key)}
                  onAddAnother={() => addBlock(m.module_id)}
                  instructors={instructors}
                  campuses={campuses}
                  termStart={termStart}
                  termEnd={termEnd}
                  mode={mode}
                />
              ) : (
                <PlaceholderRow
                  key={`empty-${m.module_id}`}
                  module={m}
                  onAdd={() => addBlock(m.module_id)}
                  mode={mode}
                />
              )
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PlaceholderRow({
  module: m, onAdd, mode,
}: {
  module: ServerModule
  onAdd: () => void
  mode?: string
}) {
  // Solid bg on every cell so the sticky-left cells match the rest of the
  // placeholder row exactly, and so scrolled content can't bleed through.
  const cellBg = 'bg-ink-50 dark:bg-ink-900'
  const modeLabel = mode ? mode : ''
  return (
    <tr>
      <td className={`font-mono text-[12px] text-ink-500 sticky left-0 z-10 ${cellBg}`}>{m.module_order ?? '—'}</td>
      <td className={`font-mono text-[12.5px] font-semibold whitespace-nowrap text-ink-700 dark:text-ink-200 sticky left-[40px] z-10 ${cellBg}`}>
        {m.module_code}
      </td>
      <td
        className={`text-[12.5px] truncate text-ink-700 dark:text-ink-200 sticky left-[150px] z-10 ${cellBg} border-r border-ink-200 dark:border-ink-700 shadow-[2px_0_0_0_rgba(0,0,0,0.04)] max-w-[260px]`}
        title={modeLabel ? `${m.module_name} · ${modeLabel}` : m.module_name}
      >
        {m.module_name}
        {modeLabel && (
          <span className="ml-1.5 text-[10.5px] uppercase tracking-wider text-ink-400 font-normal">
            · {modeLabel}
          </span>
        )}
      </td>
      <td colSpan={8} className={`text-[12px] text-ink-500 italic ${cellBg}`}>
        Not scheduled yet.
      </td>
      <td className={`text-right ${cellBg}`}>
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={onAdd}
          title="Add a teaching block for this module"
        >
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </td>
    </tr>
  )
}

/* ── Days picker (Mon–Fri / Sat–Sun / custom) ───────────────────
 * Lets the admin pick any subset of the week. Two presets ("Weekdays",
 * "Weekend") plus seven toggle chips so unusual schedules (e.g. Mon-Wed-Fri)
 * are still fast to enter. Portaled like TablePicker so the popover
 * doesn't get clipped by the table's horizontal scroll container.
 */
function DaysPicker({
  value, onChange,
}: {
  value: number[]
  onChange: (next: number[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const reposition = () => {
      const r = btnRef.current?.getBoundingClientRect()
      if (!r) return
      setCoords({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 280) })
    }
    reposition()
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return
      setOpen(false)
    }
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const sorted = [...value].sort((a, b) => a - b)
  const summary = formatDayPattern(sorted)
  const has = (n: number) => sorted.includes(n)
  const isWeekdays = sorted.length === 5 && WEEKDAYS.every((d) => sorted.includes(d))
  const isWeekend  = sorted.length === 2 && WEEKEND.every((d) => sorted.includes(d))
  const toggle = (n: number) => onChange(has(n) ? sorted.filter((d) => d !== n) : [...sorted, n])

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label="Days"
        className="input input-sm w-full text-left flex items-center justify-between gap-1.5"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={sorted.length ? 'text-ink-900 dark:text-white truncate' : 'text-ink-400 truncate'}>
          {summary}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-ink-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && coords && createPortal(
        <div
          ref={popRef}
          style={{ position: 'fixed', top: coords.top, left: coords.left, width: coords.width, zIndex: 1000 }}
          className="bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-700 rounded-lg shadow-2xl overflow-hidden"
        >
          {/* Presets */}
          <div className="p-2 border-b border-ink-100 dark:border-ink-700 flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              className={`text-[11.5px] px-2 py-1 rounded-md border transition-colors ${
                isWeekdays
                  ? 'bg-brand text-white border-brand'
                  : 'border-ink-200 dark:border-ink-700 hover:border-brand hover:text-brand'
              }`}
              onClick={() => onChange(isWeekdays ? [] : [...WEEKDAYS])}
            >
              Weekdays · Mon–Fri
            </button>
            <button
              type="button"
              className={`text-[11.5px] px-2 py-1 rounded-md border transition-colors ${
                isWeekend
                  ? 'bg-brand text-white border-brand'
                  : 'border-ink-200 dark:border-ink-700 hover:border-brand hover:text-brand'
              }`}
              onClick={() => onChange(isWeekend ? [] : [...WEEKEND])}
            >
              Weekend · Sat–Sun
            </button>
            {sorted.length > 0 && (
              <button
                type="button"
                className="ml-auto text-[11px] text-ink-500 hover:text-red-500"
                onClick={() => onChange([])}
              >
                Clear
              </button>
            )}
          </div>
          {/* Custom day chips */}
          <div className="p-2">
            <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-1.5">Custom days</div>
            <div className="grid grid-cols-7 gap-1">
              {[1, 2, 3, 4, 5, 6, 7].map((n) => {
                const on = has(n)
                return (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={on}
                    className={`text-[11.5px] py-1.5 rounded-md border transition-colors ${
                      on
                        ? 'bg-brand text-white border-brand'
                        : 'border-ink-200 dark:border-ink-700 text-ink-600 dark:text-ink-300 hover:border-brand hover:text-brand'
                    }`}
                    onClick={() => toggle(n)}
                  >
                    {DAY_LABELS[n]}
                  </button>
                )
              })}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

/* ── Searchable picker for table cells ──────────────────────────
 * The Lecturer / Campus columns sit inside the table's `overflow-x-auto`
 * scroll container, which clips a normal `<select>` popover (and a
 * normal `position: absolute` dropdown). We render the popover via
 * `createPortal` to `<body>` and position it with `position: fixed`
 * coordinates derived from the trigger's `getBoundingClientRect`, so
 * the dropdown floats above the page and is never clipped.
 */
function TablePicker({
  value, onChange, options, placeholder, allLabel, ariaLabel, sub,
}: {
  value: number | ''
  onChange: (next: number | '') => void
  options: Array<{ value: number; label: string; sub?: string }>
  placeholder: string
  allLabel?: string
  ariaLabel?: string
  /** When true, hint that the trigger should display the option's `sub`
   *  next to the label (e.g., the lecturer's position). */
  sub?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = options.find((o) => o.value === value)

  // Position the popover under the trigger. Recomputed on open and on
  // scroll/resize so it tracks the cell as the user pans the table.
  useEffect(() => {
    if (!open) return
    const reposition = () => {
      const r = btnRef.current?.getBoundingClientRect()
      if (!r) return
      setCoords({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 240) })
    }
    reposition()
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open])

  // Close on outside click and on Escape.
  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return
      setOpen(false)
    }
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30)
    else setSearch('')
  }, [open])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) =>
      o.label.toLowerCase().includes(q) || (o.sub ?? '').toLowerCase().includes(q),
    )
  }, [options, search])

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={ariaLabel}
        className="input input-sm w-full text-left flex items-center justify-between gap-1.5"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={selected ? 'text-ink-900 dark:text-white truncate' : 'text-ink-400 truncate'}>
          {selected ? (sub && selected.sub ? `${selected.label} · ${selected.sub}` : selected.label) : placeholder}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-ink-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && coords && createPortal(
        <div
          ref={popRef}
          style={{ position: 'fixed', top: coords.top, left: coords.left, width: coords.width, zIndex: 1000 }}
          className="bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-700 rounded-lg shadow-2xl overflow-hidden"
        >
          <div className="p-1.5 border-b border-ink-100 dark:border-ink-700">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                ref={inputRef}
                type="text"
                className="input input-xs pl-7 w-full"
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto py-0.5">
            {allLabel && (
              <button
                type="button"
                className={`w-full text-left px-3 py-1.5 text-[12.5px] transition-colors ${
                  value === '' ? 'bg-brand/10 text-brand font-semibold' : 'hover:bg-ink-50 dark:hover:bg-ink-700/30 text-ink-600 dark:text-ink-300'
                }`}
                onClick={() => { onChange(''); setOpen(false) }}
              >
                {allLabel}
              </button>
            )}
            {filtered.length === 0 ? (
              <p className="p-3 text-center text-ink-400 text-[12px]">No matches.</p>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={`w-full text-left px-3 py-1.5 text-[12.5px] flex items-center gap-2 transition-colors ${
                    o.value === value ? 'bg-brand/10 text-brand font-semibold' : 'hover:bg-ink-50 dark:hover:bg-ink-700/30'
                  }`}
                  onClick={() => { onChange(o.value); setOpen(false) }}
                >
                  <span className="truncate">{o.label}</span>
                  {o.sub && (
                    <span className="ml-auto text-[10.5px] text-ink-400 whitespace-nowrap">{o.sub}</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

function BlockRow({
  module: m, block: b, issues, onChange, onRemove, onAddAnother, instructors, campuses, termStart, termEnd, mode,
}: {
  module: ServerModule
  block: WorkingBlock
  issues?: BlockIssues
  onChange: (patch: Partial<WorkingBlock>) => void
  onRemove: () => void
  onAddAnother?: () => void
  instructors: Array<{ id: number; full_name: string; position: string | null }>
  campuses:    Array<{ id: number; name: string }>
  termStart?: string
  termEnd?: string
  mode?: string
}) {
  const isDraft = b.id === null
  // Sticky-left cells need a solid bg (otherwise scrolled content shows
  // through). Draft rows lose their tinted highlight on the sticky portion
  // — the "new" badge on Code keeps the cue visible.
  const stickyBg = 'bg-white dark:bg-ink-900'
  // Per-field validation flags. Used to paint the offending input red so
  // the admin can spot what's wrong without reading the toast.
  const dateBad = !!issues?.startAfterEnd
  const timeBad = !!(issues?.endBeforeStartTime || issues?.endTimeWithoutStart)
  const errInput = 'border-red-400 dark:border-red-500 focus:ring-red-300'
  const timeMsg = issues?.endBeforeStartTime
    ? 'End time must be after start time'
    : issues?.endTimeWithoutStart
    ? 'Set a start time too'
    : ''
  return (
    <tr className={isDraft ? 'bg-brand/[0.05]' : undefined}>
      <td className={`font-mono text-[12px] text-ink-500 sticky left-0 z-10 ${stickyBg}`}>{m.module_order ?? '—'}</td>
      <td className={`font-mono text-[12.5px] font-semibold whitespace-nowrap sticky left-[40px] z-10 ${stickyBg}`}>
        {m.module_code}{isDraft && <span className="ml-1 text-[10px] uppercase tracking-wider text-brand dark:text-gold-400">new</span>}
      </td>
      <td
        className={`text-[12.5px] truncate sticky left-[150px] z-10 ${stickyBg} border-r border-ink-200 dark:border-ink-700 shadow-[2px_0_0_0_rgba(0,0,0,0.04)] max-w-[260px]`}
        title={mode ? `${m.module_name} · ${mode}` : m.module_name}
      >
        {m.module_name}
        {mode && (
          <span className="ml-1.5 text-[10.5px] uppercase tracking-wider text-ink-400 font-normal">
            · {mode}
          </span>
        )}
      </td>
      <td>
        <select className="input input-sm" value={b.activity} onChange={(e) => onChange({ activity: e.target.value })}>
          {ACTIVITY_OPTIONS.map((a) => <option key={a || 'none'} value={a}>{a || '—'}</option>)}
        </select>
      </td>
      <td>
        <select className="input input-sm" value={b.semesters} onChange={(e) => onChange({ semesters: e.target.value })}>
          {SEMESTER_OPTIONS.map((s) => <option key={s || 'none'} value={s}>{s || '—'}</option>)}
        </select>
      </td>
      <td>
        <DaysPicker
          value={b.day_pattern}
          onChange={(next) => onChange({
            day_pattern: next,
            day_of_week: next.length === 1 ? next[0] : '',
          })}
        />
      </td>
      <td>
        <input
          type="date"
          className={`input input-sm ${dateBad ? errInput : ''}`}
          min={termStart || undefined}
          max={termEnd   || undefined}
          value={b.start_date}
          onChange={(e) => onChange({ start_date: e.target.value })}
        />
      </td>
      <td>
        <input
          type="date"
          className={`input input-sm ${dateBad ? errInput : ''}`}
          min={(b.start_date || termStart) || undefined}
          max={termEnd || undefined}
          value={b.end_date}
          onChange={(e) => onChange({ end_date: e.target.value })}
          title={dateBad ? "End date can't be before start date" : undefined}
        />
      </td>
      <td>
        <div className="flex items-center gap-1.5">
          <input
            type="time"
            className={`input input-sm flex-1 min-w-0 ${timeBad ? errInput : ''}`}
            value={b.start_time}
            onChange={(e) => onChange({ start_time: e.target.value })}
          />
          <span className="text-ink-400 text-[11px] shrink-0">→</span>
          <input
            type="time"
            className={`input input-sm flex-1 min-w-0 ${timeBad ? errInput : ''}`}
            min={b.start_time || undefined}
            value={b.end_time}
            onChange={(e) => onChange({ end_time: e.target.value })}
            title={timeMsg || undefined}
          />
        </div>
        {timeMsg && (
          <p className="text-[10.5px] text-red-600 dark:text-red-400 mt-1">{timeMsg}</p>
        )}
      </td>
      <td>
        {b.instructor_id !== '' || !b.instructor_name ? (
          <TablePicker
            value={b.instructor_id}
            onChange={(v) => onChange({ instructor_id: v })}
            options={instructors.map((i) => ({ value: i.id, label: i.full_name, sub: i.position ?? undefined }))}
            placeholder="— unassigned —"
            allLabel="— unassigned —"
            ariaLabel="Lecturer"
            sub
          />
        ) : (
          <div className="flex items-center gap-2 min-w-0">
            <span className="italic text-ink-700 dark:text-ink-200 text-[12px] truncate min-w-0 flex-1" title={b.instructor_name}>
              {b.instructor_name}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-amber-600 shrink-0">unmatched</span>
            <button
              type="button"
              className="text-[11.5px] text-brand hover:underline shrink-0"
              onClick={() => onChange({ instructor_name: '' })}
            >
              Pick
            </button>
          </div>
        )}
      </td>
      <td>
        <TablePicker
          value={b.campus_id}
          onChange={(v) => onChange({ campus_id: v })}
          options={campuses.map((c) => ({ value: c.id, label: c.name }))}
          placeholder="— any —"
          allLabel="— any —"
          ariaLabel="Campus"
        />
      </td>
      <td className="text-right">
        <div className="flex items-center justify-end gap-1">
          {onAddAnother && (
            <button
              type="button"
              className="icon-btn text-brand hover:text-brand hover:bg-brand/10"
              onClick={onAddAnother}
              title="Add another schedule for this module"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            className="icon-btn text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
            onClick={onRemove}
            title="Remove this block"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  )
}

function Field2({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10.5px] uppercase tracking-wider text-ink-500 mb-0.5">{label}</label>
      {children}
    </div>
  )
}

/* ============================================================
   Import-timetable dialog — accepts the wide university CSV /
   xlsx, parses each row into a teaching block, sends to backend.
   ============================================================ */

function ImportTimetableModal({
  open, onClose, onDone,
}: {
  open: boolean
  onClose: () => void
  onDone: () => void
}) {
  const [academicYear, setAcademicYear] = useState('')
  const [modeDefault,  setModeDefault]  = useState('Day')
  const [replace,      setReplace]      = useState(false)
  const [parsedRows,   setParsedRows]   = useState<Array<Record<string, any>> | null>(null)
  const [previewMeta,  setPreviewMeta]  = useState<{
    total: number
    distinctModules: number
    distinctOpts:    number
    distinctLecturers: number
  } | null>(null)
  const [submitting,   setSubmitting]   = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setParsedRows(null); setPreviewMeta(null)
      setReplace(false)
      setModeDefault('Day')
    }
  }, [open])

  const parseFile = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array', cellDates: false })
      const ws = wb.Sheets[wb.SheetNames[0]]
      if (!ws) throw new Error('No sheet found in workbook')
      const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, blankrows: false, defval: '' })
      if (aoa.length < 2) {
        toast.error('File has no data rows.')
        return
      }
      const headers = (aoa[0] as any[]).map((h) => String(h ?? '').trim().toUpperCase())
      const find = (...candidates: string[]) => {
        for (const c of candidates) {
          const idx = headers.indexOf(c.toUpperCase())
          if (idx >= 0) return idx
        }
        return -1
      }
      const ix = {
        // Block ID — present in files exported by this app. Lets the
        // backend update existing blocks in place when admins re-upload
        // an edited export. Plain `ID` and a few aliases are accepted.
        id:         find('ID', 'OFFERING ID', 'BLOCK ID'),
        dpt:        find('DPT'),
        opt:        find('OPT'),
        attendance: find('ATTENDANCE MODE'),
        moduleName: find('MODULE & COMPONENT', 'MODULE NAME', 'MODULE TITLE & COMPONENT'),
        code:       find('CODE', 'MODULE CODE'),
        startDate:  find('START DATE'),
        endDate:    find('END DATE'),
        period:     find('PERIOD'),
        activity:   find('ACTIVITY'),
        lecturer:   find("LECTURER'S NAME", 'LECTURER NAME', 'LECTURER'),
        level:      find('LEVEL'),
        year:       find('YEAR'),
        sem:        find('SEM', 'SEMESTER', 'SEMESTERS'),
        campus:     find('CAMPUS', 'CAMPUS NAME'),
      }
      if (ix.code < 0 || ix.opt < 0) {
        toast.error('Required columns missing. Need at minimum: OPT and Code.')
        return
      }

      const parseDate = (s: string): string | null => {
        if (!s) return null
        const trimmed = String(s).trim()
        // M/D/YYYY or D/M/YYYY isn't ambiguous when the file says US
        // format (it does — confirmed). Accept both that and YYYY-MM-DD.
        let m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
        if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
        m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
        if (m) return trimmed
        return null
      }
      const parsePeriod = (s: string): { start: string; end: string } | null => {
        if (!s) return null
        const m = String(s).match(/^\s*(\d{1,2})h(\d{2})\s*[:\-–]\s*(\d{1,2})h(\d{2})\s*$/i)
        if (!m) return null
        return {
          start: `${m[1].padStart(2, '0')}:${m[2]}`,
          end:   `${m[3].padStart(2, '0')}:${m[4]}`,
        }
      }
      const text = (cell: any) => cell == null ? '' : String(cell).trim()
      const intOrNull = (cell: any) => {
        const t = text(cell)
        if (!t) return null
        const n = Number(t)
        return Number.isFinite(n) ? n : null
      }

      const rows: Array<Record<string, any>> = []
      const modules = new Set<string>()
      const opts = new Set<string>()
      const lecturers = new Set<string>()
      for (const row of aoa.slice(1)) {
        const r = row as any[]
        const optAcro = text(r[ix.opt])
        const code    = text(r[ix.code])
        if (!optAcro || !code) continue
        const period = ix.period >= 0 ? parsePeriod(text(r[ix.period])) : null
        const lecturer = ix.lecturer >= 0 ? text(r[ix.lecturer]) : ''
        modules.add(code.toLowerCase()); opts.add(optAcro.toLowerCase())
        if (lecturer) lecturers.add(lecturer.toLowerCase())
        rows.push({
          id:              ix.id >= 0 ? intOrNull(r[ix.id]) : null,
          option_acro:     optAcro,
          module_code:     code,
          module_name:     ix.moduleName >= 0 ? text(r[ix.moduleName]) : '',
          start_date:      ix.startDate >= 0 ? parseDate(text(r[ix.startDate])) : null,
          end_date:        ix.endDate   >= 0 ? parseDate(text(r[ix.endDate]))   : null,
          start_time:      period?.start ?? null,
          end_time:        period?.end   ?? null,
          semesters:       ix.sem >= 0 ? text(r[ix.sem]) : null,
          activity:        ix.activity >= 0 ? text(r[ix.activity]) : null,
          lecturer_name:   lecturer || null,
          level:           ix.level >= 0 ? intOrNull(r[ix.level]) : null,
          year_of_study:   ix.year >= 0 ? intOrNull(r[ix.year]) : null,
          campus_name:     ix.campus >= 0 ? text(r[ix.campus]) : null,
          attendance_mode: ix.attendance >= 0 ? text(r[ix.attendance]) : null,
        })
      }

      if (rows.length === 0) {
        toast.error('No usable rows — every row needs an OPT and Code.')
        return
      }

      setParsedRows(rows)
      setPreviewMeta({
        total: rows.length,
        distinctModules: modules.size,
        distinctOpts: opts.size,
        distinctLecturers: lecturers.size,
      })
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to read file')
    }
  }

  const submit = async () => {
    if (!parsedRows) return
    setSubmitting(true)
    try {
      const res = await academicsMgmtService.importTimetable({
        academic_year: academicYear || null,
        mode_default:  modeDefault,
        replace,
        rows: parsedRows as any,
      })
      const d = res.data ?? { modules_created: 0, blocks_created: 0, blocks_updated: 0, blocks_replaced: 0, failed: [], unknown_opts: [], unknown_staff: [], unknown_campuses: [], unknown_levels: [] }
      const summary = [
        d.modules_created ? `${d.modules_created} module${d.modules_created === 1 ? '' : 's'} created` : null,
        d.blocks_created  ? `${d.blocks_created} block${d.blocks_created === 1 ? '' : 's'} created` : null,
        d.blocks_updated  ? `${d.blocks_updated} updated` : null,
        d.blocks_replaced ? `${d.blocks_replaced} replaced` : null,
      ].filter(Boolean).join(', ')
      toast.success(summary ? `Timetable imported — ${summary}.` : 'Timetable imported.')
      if (d.failed.length > 0) {
        const first = d.failed[0]
        toast.error(
          d.failed.length === 1
            ? `Row #${first.index} failed: ${first.error}`
            : `${d.failed.length} rows failed — first: ${first.error}`,
        )
      }
      if (d.unknown_opts.length > 0) toast.error(`Unknown OPT values: ${d.unknown_opts.slice(0, 5).join(', ')}${d.unknown_opts.length > 5 ? ', …' : ''}`)
      if (d.unknown_levels.length > 0) {
        toast(`Levels not in catalogue (saved as null): ${d.unknown_levels.slice(0, 5).join(', ')}${d.unknown_levels.length > 5 ? ', …' : ''}`, { icon: 'ℹ️' })
      }
      onDone()
      onClose()
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Import failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import timetable"
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
          <button
            className="btn-primary"
            onClick={submit}
            disabled={submitting || !parsedRows}
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {parsedRows ? `Import ${previewMeta?.total ?? 0} block${(previewMeta?.total ?? 0) === 1 ? '' : 's'}` : 'Choose file first'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-[13px] text-ink-700 dark:text-ink-200">
          Upload the university timetable spreadsheet. Each row becomes one teaching block.
          OPT, Code, dates, period, lecturer and campus are read; computed columns
          (M, Credits, Total Contact Hours, Hours/Day, Total Days, Total Weeks) are silently
          ignored. If a row's <strong>ID</strong> matches an existing block (e.g., from a prior
          export), that block is updated in place instead of duplicated.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field2 label="Academic year (optional)">
            <input
              type="text"
              className="input"
              placeholder="e.g. 2025-2026"
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
            />
          </Field2>
          <Field2 label="Default mode (used when DP/WK/HD is blank)">
            <select className="input" value={modeDefault} onChange={(e) => setModeDefault(e.target.value)}>
              <option value="Day">Day</option>
              <option value="Weekend">Weekend</option>
              <option value="Holiday">Holiday</option>
            </select>
          </Field2>
        </div>

        <label className="flex items-start gap-2 rounded-md border border-ink-200 dark:border-ink-700 p-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={replace}
            onChange={(e) => setReplace(e.target.checked)}
          />
          <div>
            <div className="text-[13px] font-semibold text-ink-900 dark:text-ink-100">
              Replace existing blocks for these (module, program, mode) combinations
            </div>
            <div className="text-[11.5px] text-ink-500">
              Recommended for clean re-imports — wipes any saved blocks for the same combos before inserting the file's rows. Leave off to add blocks alongside whatever's already there.
            </div>
          </div>
        </label>

        {!parsedRows ? (
          <div className="rounded-md border border-dashed border-ink-200 dark:border-ink-700 p-6 text-center text-[12.5px] text-ink-500">
            <button
              type="button"
              className="btn-primary"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="w-3.5 h-3.5" /> Choose file…
            </button>
            <p className="mt-2">Accepts .xlsx and .csv files.</p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) parseFile(f)
                e.target.value = ''
              }}
            />
          </div>
        ) : (
          <div className="rounded-md border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-900/20 p-3.5 text-[12.5px] text-emerald-800 dark:text-emerald-200">
            <p className="font-semibold mb-1">File parsed.</p>
            <ul className="list-disc pl-5 space-y-0.5">
              <li><strong>{previewMeta?.total}</strong> block rows</li>
              <li><strong>{previewMeta?.distinctModules}</strong> distinct modules detected</li>
              <li><strong>{previewMeta?.distinctOpts}</strong> distinct programs (OPT)</li>
              <li><strong>{previewMeta?.distinctLecturers}</strong> distinct lecturer names</li>
            </ul>
            <button
              type="button"
              className="mt-2 text-[12px] text-brand hover:underline"
              onClick={() => { setParsedRows(null); setPreviewMeta(null) }}
            >
              Pick a different file
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}


/* ──────────────────────────────────────────────────────────────────────
 * Guidance videos — two URLs shown to applicants in the public portal.
 * ──────────────────────────────────────────────────────────────────── */
function GuidanceVideosPanel() {
  const [vals, setVals]     = useState<GuidanceVideos>({ video_application_guide_url: '', video_login_guide_url: '' })
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    systemService.getGuidanceVideos()
      .then((r) => { if (r.data) setVals(r.data) })
      .catch(() => toast.error('Failed to load guidance videos'))
      .finally(() => setLoaded(true))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const r = await systemService.saveGuidanceVideos(vals)
      if (r.data) setVals(r.data)
      toast.success('Guidance videos saved')
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="card p-6 max-w-3xl">
      <div className="flex items-center gap-2 mb-4">
        <Video className="w-5 h-5 text-brand" />
        <div>
          <h2 className="section-title">Guidance videos</h2>
          <p className="section-sub">
            URLs shown publicly to applicants. Paste a YouTube link, Vimeo link, or any direct video URL.
          </p>
        </div>
      </div>

      {!loaded ? (
        <p className="text-[12.5px] text-ink-500 py-6">Loading…</p>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="label">How to apply video</label>
            <p className="text-[11.5px] text-ink-500 mb-1.5">
              Linked from the public application form so candidates can watch the full apply walkthrough (including how to upload the payment slip).
            </p>
            <input
              type="url"
              className="input"
              placeholder="https://youtu.be/…"
              value={vals.video_application_guide_url}
              onChange={(e) => setVals((v) => ({ ...v, video_application_guide_url: e.target.value }))}
            />
            {vals.video_application_guide_url && (
              <a
                href={vals.video_application_guide_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 mt-1 text-[11.5px] text-brand hover:underline"
              >
                <ExternalLink className="w-3 h-3" /> Preview
              </a>
            )}
          </div>

          <div>
            <label className="label">How to log in &amp; reset password video</label>
            <p className="text-[11.5px] text-ink-500 mb-1.5">
              Shown below the login form and on the applicant overview so admitted students know how to use their username (registration number) and reset their password.
            </p>
            <input
              type="url"
              className="input"
              placeholder="https://youtu.be/…"
              value={vals.video_login_guide_url}
              onChange={(e) => setVals((v) => ({ ...v, video_login_guide_url: e.target.value }))}
            />
            {vals.video_login_guide_url && (
              <a
                href={vals.video_login_guide_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 mt-1 text-[11.5px] text-brand hover:underline"
              >
                <ExternalLink className="w-3 h-3" /> Preview
              </a>
            )}
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="btn-primary"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
