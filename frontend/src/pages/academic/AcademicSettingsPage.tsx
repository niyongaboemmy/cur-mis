import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
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
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { academicService, type CreateYearPayload, type CreateTermPayload } from '@/services/academicService'
import { useSystemStore, selectActiveYear, selectActiveTerm } from '@/store/systemStore'
import { useSystemBasics } from '@/hooks/useSystemBasics'
import type { AcademicYear, AcademicTerm } from '@/types/academic'

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

export default function AcademicSettingsPage() {
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
    <div className="max-w-6xl mx-auto space-y-6">
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
