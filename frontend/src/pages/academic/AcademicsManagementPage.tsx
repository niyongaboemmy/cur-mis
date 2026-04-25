import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  GraduationCap,
  Building2,
  School as SchoolIcon,
  BookOpen,
  DoorOpen,
  ListTree,
  Layers,
  Plane,
  Plus,
  Loader2,
  Trash2,
  Pencil,
  Sliders,
  type LucideIcon,
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { academicsMgmtService } from '@/services/academicsMgmtService'
import type { AcMgmtEntity } from '@/types/academic'
import { CalendarDays } from 'lucide-react'
import AcademicSettingsPage from '@/pages/academic/AcademicSettingsPage'

const SETTINGS_SLUG = 'academic-settings' as const
type RailSlug = AcMgmtEntity | typeof SETTINGS_SLUG
type RailItem =
  | { kind: 'settings'; slug: typeof SETTINGS_SLUG; label: string; icon: LucideIcon }
  | (EntityCfg & { kind: 'entity' })

/* ─────────────────────────────────────────────────────────────
   Entity config — one row per endpoint we want to surface.
   Keep the fields SHORT and required-only; advanced fields can
   be added to `fields` later without changing the table itself.
   ───────────────────────────────────────────────────────────── */

type FieldType = 'text' | 'number' | 'checkbox' | 'textarea'
interface FieldCfg {
  key:      string
  label:    string
  type:     FieldType
  required?: boolean
  placeholder?: string
}
interface EntityCfg {
  slug:     AcMgmtEntity
  label:    string
  singular: string
  icon:     LucideIcon
  pk:       string
  columns:  { key: string; label: string; render?: (row: any) => React.ReactNode }[]
  fields:   FieldCfg[]
}

const ENTITIES: EntityCfg[] = [
  {
    slug: 'degrees', label: 'Degrees', singular: 'Degree', icon: GraduationCap, pk: 'id',
    columns: [
      { key: 'code',          label: 'Code' },
      { key: 'name',          label: 'Name' },
      { key: 'degree_type',   label: 'Type' },
      { key: 'is_active',     label: 'Active', render: (r) => r.is_active ? 'Yes' : 'No' },
    ],
    fields: [
      { key: 'code',           label: 'Code',           type: 'text',     required: true, placeholder: 'BSC' },
      { key: 'name',           label: 'Name',           type: 'text',     required: true, placeholder: 'Bachelor of Science' },
      { key: 'degree_type',    label: 'Type',           type: 'text',     placeholder: 'Bachelor / Master / PhD' },
      { key: 'duration_years', label: 'Duration (yrs)', type: 'number' },
      { key: 'total_credits',  label: 'Total credits',  type: 'number' },
      { key: 'department_id',  label: 'Department ID',  type: 'number' },
      { key: 'is_active',      label: 'Active',         type: 'checkbox' },
    ],
  },
  {
    slug: 'schools', label: 'Schools / Faculties', singular: 'School', icon: SchoolIcon, pk: 'school_id',
    columns: [
      { key: 'school_id',      label: '#' },
      { key: 'school_name',    label: 'Name' },
      { key: 'school_descript',label: 'Motto / Desc.' },
      { key: 'school_email',   label: 'Email' },
    ],
    fields: [
      { key: 'school_name',     label: 'Name',        type: 'text',     required: true },
      { key: 'school_descript', label: 'Description', type: 'textarea' },
      { key: 'school_address',  label: 'Address',     type: 'text' },
      { key: 'school_phone',    label: 'Phone',       type: 'text' },
      { key: 'school_email',    label: 'Email',       type: 'text' },
    ],
  },
  {
    slug: 'departments', label: 'Departments', singular: 'Department', icon: Building2, pk: 'dep_id',
    columns: [
      { key: 'dep_id',      label: '#' },
      { key: 'dep_name',    label: 'Name' },
      { key: 'dep_acronym', label: 'Acronym' },
    ],
    fields: [
      { key: 'dep_name',        label: 'Name',        type: 'text',     required: true },
      { key: 'dep_acronym',     label: 'Acronym',     type: 'text' },
      { key: 'dep_description', label: 'Description', type: 'textarea' },
      { key: 'fac_id',          label: 'Faculty ID',  type: 'number' },
    ],
  },
  {
    slug: 'modules', label: 'Modules / Courses', singular: 'Module', icon: BookOpen, pk: 'module_id',
    columns: [
      { key: 'module_code',    label: 'Code' },
      { key: 'module_name',    label: 'Name' },
      { key: 'module_credits', label: 'Credits' },
      { key: 'hours',          label: 'Hours' },
      { key: 'level',          label: 'Level' },
    ],
    fields: [
      { key: 'module_code',    label: 'Code',    type: 'text', required: true, placeholder: 'CSC1101' },
      { key: 'module_name',    label: 'Name',    type: 'text', required: true, placeholder: 'Introduction to Programming' },
      { key: 'module_credits', label: 'Credits', type: 'number' },
      { key: 'hours',          label: 'Hours',   type: 'number' },
      { key: 'level',          label: 'Level',   type: 'number' },
      { key: 'school_id',      label: 'School ID',type: 'number' },
      { key: 'department',     label: 'Dept ID', type: 'number' },
    ],
  },
  {
    slug: 'facility', label: 'Facilities / Rooms', singular: 'Facility', icon: DoorOpen, pk: 'id',
    columns: [
      { key: 'name',      label: 'Name' },
      { key: 'building',  label: 'Building' },
      { key: 'capacity',  label: 'Capacity' },
      { key: 'room_type', label: 'Type' },
      { key: 'is_active', label: 'Active', render: (r) => r.is_active ? 'Yes' : 'No' },
    ],
    fields: [
      { key: 'name',      label: 'Name',      type: 'text',     required: true },
      { key: 'building',  label: 'Building',  type: 'text' },
      { key: 'capacity',  label: 'Capacity',  type: 'number' },
      { key: 'room_type', label: 'Type',      type: 'text',     placeholder: 'lecture / lab' },
      { key: 'is_active', label: 'Active',    type: 'checkbox' },
    ],
  },
  {
    slug: 'options', label: 'Options', singular: 'Option', icon: ListTree, pk: 'id',
    columns: [
      { key: 'name',          label: 'Name' },
      { key: 'department_id', label: 'Department ID' },
      { key: 'is_active',     label: 'Active', render: (r) => r.is_active ? 'Yes' : 'No' },
    ],
    fields: [
      { key: 'name',          label: 'Name',          type: 'text',     required: true },
      { key: 'department_id', label: 'Department ID', type: 'number' },
      { key: 'is_active',     label: 'Active',        type: 'checkbox' },
    ],
  },
  {
    slug: 'levels', label: 'Levels', singular: 'Level', icon: Layers, pk: 'id',
    columns: [
      { key: 'name', label: 'Name' },
    ],
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Year 1' },
    ],
  },
  {
    slug: 'leave_types', label: 'Leave types', singular: 'Leave type', icon: Plane, pk: 'id',
    columns: [
      { key: 'name',         label: 'Name' },
      { key: 'days_allowed', label: 'Days' },
      { key: 'is_paid',      label: 'Paid', render: (r) => r.is_paid ? 'Yes' : 'No' },
    ],
    fields: [
      { key: 'name',         label: 'Name',         type: 'text',     required: true, placeholder: 'Annual leave' },
      { key: 'days_allowed', label: 'Days allowed', type: 'number' },
      { key: 'is_paid',      label: 'Paid',         type: 'checkbox' },
    ],
  },
  {
    slug: 'intakes' as AcMgmtEntity, label: 'Intakes', singular: 'Intake', icon: CalendarDays, pk: 'id',
    columns: [
      { key: 'name',         label: 'Name' },
      { key: 'start_date',   label: 'Start Date' },
      { key: 'end_date',     label: 'End Date' },
      { key: 'is_active',    label: 'Active', render: (r) => r.is_active ? 'Yes' : 'No' },
    ],
    fields: [
      { key: 'name',         label: 'Name',       type: 'text', required: true, placeholder: 'January 2024' },
      { key: 'start_date',   label: 'Start Date', type: 'text', required: true, placeholder: 'YYYY-MM-DD' },
      { key: 'end_date',     label: 'End Date',   type: 'text', required: true, placeholder: 'YYYY-MM-DD' },
      { key: 'is_active',    label: 'Active',     type: 'checkbox' },
    ],
  },
]

/* ───────────────────────────────────────────────────────────── */

export default function AcademicsManagementPage() {
  const [activeSlug, setActiveSlug] = useState<RailSlug>('degrees')

  const railItems = useMemo<RailItem[]>(
    () => [
      { kind: 'settings', slug: SETTINGS_SLUG, label: 'Academic settings', icon: Sliders },
      ...ENTITIES.map<RailItem>((e) => ({ ...e, kind: 'entity' })),
    ],
    [],
  )

  const activeEntity = useMemo(
    () => (activeSlug === SETTINGS_SLUG ? null : ENTITIES.find((e) => e.slug === activeSlug) ?? null),
    [activeSlug],
  )

  return (
    <div className="max-w-[1400px] mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6 items-start">
        {/* Entity rail */}
        <aside className="card p-2 self-start md:sticky md:top-0">
          <nav className="space-y-0.5">
            {railItems.map((item) => {
              const Icon = item.icon
              const isActive = item.slug === activeSlug
              return (
                <button
                  key={item.slug}
                  onClick={() => setActiveSlug(item.slug)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium transition-colors ${
                    isActive
                      ? 'bg-brand/10 text-brand dark:bg-brand/25 dark:text-gold-400'
                      : 'text-ink-600 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-700/50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="truncate">{item.label}</span>
                </button>
              )
            })}
          </nav>
        </aside>

        {/* Panel */}
        {activeEntity ? (
          <CrudPanel key={activeEntity.slug} entity={activeEntity} />
        ) : (
          <div className="min-w-0">
            <AcademicSettingsPage />
          </div>
        )}
      </div>
    </div>
  )
}

/* ───────────────────────────────────────────────────────────── */

function CrudPanel({ entity }: { entity: EntityCfg }) {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<Record<string, any> | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const listQ = useQuery({
    queryKey: ['acmgmt', entity.slug, page],
    queryFn:  () => academicsMgmtService.list<any>(entity.slug, { page, per_page: 15 }),
  })

  const rows   = listQ.data?.data?.data ?? []
  const total  = listQ.data?.data?.total ?? 0
  const last   = listQ.data?.data?.last_page ?? 1

  const invalidate = () => qc.invalidateQueries({ queryKey: ['acmgmt', entity.slug] })

  const createM = useMutation({
    mutationFn: (d: Record<string, any>) => academicsMgmtService.create(entity.slug, d),
    onSuccess:  () => { toast.success(`${entity.singular} added`); setModalOpen(false); invalidate() },
    onError:    (e: any) => toast.error(e?.response?.data?.message ?? 'Create failed'),
  })

  const updateM = useMutation({
    mutationFn: (v: { id: number | string; data: Record<string, any> }) =>
      academicsMgmtService.update(entity.slug, v.id, v.data),
    onSuccess:  () => { toast.success(`${entity.singular} updated`); setModalOpen(false); invalidate() },
    onError:    (e: any) => toast.error(e?.response?.data?.message ?? 'Update failed'),
  })

  const deleteM = useMutation({
    mutationFn: (id: number | string) => academicsMgmtService.remove(entity.slug, id),
    onSuccess:  () => { toast.success(`${entity.singular} removed`); invalidate() },
    onError:    (e: any) => toast.error(e?.response?.data?.message ?? 'Delete failed'),
  })

  const openNew = () => { setEditing(null); setModalOpen(true) }
  const openEdit = (row: Record<string, any>) => { setEditing(row); setModalOpen(true) }

  const submit = (data: Record<string, any>) => {
    if (editing) {
      updateM.mutate({ id: editing[entity.pk], data })
    } else {
      createM.mutate(data)
    }
  }

  return (
    <section className="card p-6 min-h-[calc(100vh-8rem)]">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div className="min-w-0 flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-brand/10 text-brand dark:bg-brand/25 dark:text-gold-400 flex items-center justify-center shrink-0">
            <entity.icon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="section-title truncate">{entity.label}</h2>
            <p className="section-sub">
              {listQ.isLoading ? 'Loading…' : `${total.toLocaleString()} record${total === 1 ? '' : 's'}`}
            </p>
          </div>
        </div>
        <button className="btn-primary btn-sm" onClick={openNew}>
          <Plus className="w-3.5 h-3.5" /> New {entity.singular.toLowerCase()}
        </button>
      </div>

      {listQ.isLoading ? (
        <p className="text-ink-500 text-[13px] py-6 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</p>
      ) : listQ.isError ? (
        <p className="text-red-600 text-[13px] py-6">Failed to load {entity.label.toLowerCase()}.</p>
      ) : rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-ink-200 p-6 text-center text-ink-500 text-[13px]">
          No {entity.label.toLowerCase()} yet.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  {entity.columns.map((c) => <th key={c.key}>{c.label}</th>)}
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r[entity.pk]}>
                    {entity.columns.map((c) => (
                      <td key={c.key} className="align-middle">
                        {c.render ? c.render(r) : (r[c.key] ?? '—')}
                      </td>
                    ))}
                    <td className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <button className="icon-btn" onClick={() => openEdit(r)} aria-label="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          className="icon-btn text-red-500 hover:text-red-600 hover:bg-red-50"
                          onClick={() => {
                            if (confirm(`Delete this ${entity.singular.toLowerCase()}?`)) {
                              deleteM.mutate(r[entity.pk])
                            }
                          }}
                          disabled={deleteM.isPending && deleteM.variables === r[entity.pk]}
                          aria-label="Delete"
                        >
                          {deleteM.isPending && deleteM.variables === r[entity.pk]
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {last > 1 && (
            <div className="flex items-center justify-between mt-4 text-[12.5px] text-ink-500">
              <span>Page {page} of {last}</span>
              <div className="flex gap-1">
                <button
                  className="btn-secondary btn-sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >Prev</button>
                <button
                  className="btn-secondary btn-sm"
                  onClick={() => setPage((p) => Math.min(last, p + 1))}
                  disabled={page >= last}
                >Next</button>
              </div>
            </div>
          )}
        </>
      )}

      <EntityFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        entity={entity}
        initial={editing ?? undefined}
        onSubmit={submit}
        submitting={createM.isPending || updateM.isPending}
      />
    </section>
  )
}

/* ───────────────────────────────────────────────────────────── */

function EntityFormModal({
  open, onClose, entity, initial, onSubmit, submitting,
}: {
  open: boolean
  onClose: () => void
  entity: EntityCfg
  initial?: Record<string, any>
  onSubmit: (data: Record<string, any>) => void
  submitting: boolean
}) {
  const [state, setState] = useState<Record<string, any>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Rebuild form state whenever we open
  useMemo(() => {
    if (!open) return
    const init: Record<string, any> = {}
    entity.fields.forEach((f) => {
      init[f.key] = initial?.[f.key] ?? (f.type === 'checkbox' ? false : '')
    })
    setState(init)
    setErrors({})
  }, [open, entity, initial])

  const validate = () => {
    const errs: Record<string, string> = {}
    for (const f of entity.fields) {
      if (f.required && (state[f.key] === '' || state[f.key] == null)) {
        errs[f.key] = 'Required'
      }
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = () => {
    if (!validate()) return
    // Coerce empty → undefined; checkboxes → "1"/"0" strings (backend
    // validator expects stringy booleans via `in:0,1` rule).
    const clean: Record<string, any> = {}
    for (const f of entity.fields) {
      const v = state[f.key]
      if (f.type === 'checkbox') clean[f.key] = v ? '1' : '0'
      else if (f.type === 'number') clean[f.key] = v === '' || v == null ? undefined : Number(v)
      else clean[f.key] = v === '' ? undefined : v
    }
    onSubmit(clean)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${initial ? 'Edit' : 'New'} ${entity.singular.toLowerCase()}`}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {initial ? 'Save changes' : 'Create'}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {entity.fields.map((f) => (
          <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
            <label className="label">
              {f.label}{f.required && <span className="text-red-500 ml-0.5">*</span>}
            </label>

            {f.type === 'textarea' ? (
              <textarea
                className="input min-h-[84px]"
                placeholder={f.placeholder}
                value={state[f.key] ?? ''}
                onChange={(e) => setState({ ...state, [f.key]: e.target.value })}
              />
            ) : f.type === 'checkbox' ? (
              <label className="inline-flex items-center gap-2 mt-1">
                <input
                  type="checkbox"
                  checked={!!state[f.key]}
                  onChange={(e) => setState({ ...state, [f.key]: e.target.checked })}
                  className="rounded border-ink-300 text-brand focus:ring-brand/30"
                />
                <span className="text-[13px] text-ink-700 dark:text-ink-200">Yes</span>
              </label>
            ) : (
              <input
                type={f.type === 'number' ? 'number' : 'text'}
                className="input"
                placeholder={f.placeholder}
                value={state[f.key] ?? ''}
                onChange={(e) => setState({ ...state, [f.key]: e.target.value })}
              />
            )}

            {errors[f.key] && <p className="error-text">{errors[f.key]}</p>}
          </div>
        ))}
      </div>
    </Modal>
  )
}
