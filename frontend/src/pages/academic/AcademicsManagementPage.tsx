import { useEffect, useMemo, useState } from 'react'
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
  MapPin,
  type LucideIcon,
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import SearchableSelect from '@/components/ui/SearchableSelect'
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

type FieldType = 'text' | 'number' | 'checkbox' | 'textarea' | 'select' | 'multi-select'
interface FieldCfg {
  key:      string
  label:    string
  type:     FieldType
  required?: boolean
  placeholder?: string
  /** For type='select' / 'multi-select': fetch options from another acmgmt entity. */
  selectFrom?: { slug: AcMgmtEntity; valueKey: string; labelKey: string }
  /** Optional column-span override on the main grid (1-12). */
  span?: number
}
interface EntityCfg {
  slug:     AcMgmtEntity
  label:    string
  singular: string
  icon:     LucideIcon
  pk:       string
  columns:  { key: string; label: string; render?: (row: any, ctx?: { lookups: Record<string, Map<any, string>> }) => React.ReactNode }[]
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
      { key: 'fac_id',          label: 'Faculty ID',  type: 'number',   required: true },
    ],
  },
  {
    slug: 'modules', label: 'Modules / Courses', singular: 'Module', icon: BookOpen, pk: 'module_id',
    columns: [
      { key: 'module_code',    label: 'Code' },
      { key: 'module_name',    label: 'Name' },
      { key: 'programs',       label: 'Programs', render: (r) => <ProgramPills programs={r.programs ?? []} /> },
      { key: 'level',          label: 'Level',    render: (r, ctx) => ctx?.lookups.levels?.get(Number(r.level)) ?? (r.level ? `#${r.level}` : '—') },
      { key: 'module_credits', label: 'Credits' },
      { key: 'hours',          label: 'Hours' },
    ],
    fields: [
      { key: 'module_code',    label: 'Code',     type: 'text',   required: true, placeholder: 'CSC1101', span: 3 },
      { key: 'module_name',    label: 'Name',     type: 'text',   required: true, placeholder: 'Introduction to Programming', span: 9 },
      { key: 'module_credits', label: 'Credits',  type: 'number', required: true, span: 3 },
      { key: 'hours',          label: 'Hours',    type: 'number', span: 3 },
      { key: 'level',          label: 'Level',    type: 'select', required: true, span: 6,
        selectFrom: { slug: 'levels', valueKey: 'id', labelKey: 'name' } },
      { key: 'program_ids',    label: 'Programs', type: 'multi-select', required: true,
        selectFrom: { slug: 'options', valueKey: 'id', labelKey: 'name' } },
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
      { key: 'capacity',  label: 'Capacity',  type: 'number',   required: true },
      { key: 'room_type', label: 'Type',      type: 'text',     placeholder: 'lecture / lab' },
      { key: 'is_active', label: 'Active',    type: 'checkbox' },
    ],
  },
  {
    slug: 'options', label: 'Programs', singular: 'Program', icon: ListTree, pk: 'id',
    columns: [
      { key: 'name',          label: 'Program' },
      { key: 'department_id', label: 'Department', render: (r, ctx) => ctx?.lookups.departments?.get(Number(r.department_id)) ?? `#${r.department_id ?? '—'}` },
      { key: 'campus_ids',    label: 'Campuses', render: (r, ctx) => <CampusPills ids={r.campus_ids ?? []} lookup={ctx?.lookups.campuses} /> },
      { key: 'is_active',     label: 'Active', render: (r) => r.is_active ? 'Yes' : 'No' },
    ],
    fields: [
      { key: 'name',          label: 'Program name',  type: 'text',   required: true, placeholder: 'Software Engineering' },
      { key: 'department_id', label: 'Department',    type: 'select', required: true, selectFrom: { slug: 'departments', valueKey: 'dep_id', labelKey: 'dep_name' } },
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
      { key: 'days_allowed', label: 'Days allowed', type: 'number', required: true },
      { key: 'is_paid',      label: 'Paid',         type: 'checkbox' },
    ],
  },
  {
    slug: 'campuses', label: 'Campuses', singular: 'Campus', icon: MapPin, pk: 'id',
    columns: [
      { key: 'name',      label: 'Name' },
      { key: 'code',      label: 'Code' },
      { key: 'location',  label: 'Location' },
      { key: 'phone',     label: 'Phone' },
      { key: 'is_active', label: 'Active', render: (r) => r.is_active ? 'Yes' : 'No' },
    ],
    fields: [
      { key: 'name',      label: 'Name',     type: 'text',     required: true, placeholder: 'Main Campus' },
      { key: 'code',      label: 'Code',     type: 'text',     placeholder: 'MAIN' },
      { key: 'location',  label: 'Location', type: 'text',     placeholder: 'Kigali, Rwanda' },
      { key: 'address',   label: 'Address',  type: 'text',     placeholder: 'KG 123 St' },
      { key: 'phone',     label: 'Phone',    type: 'text' },
      { key: 'email',     label: 'Email',    type: 'text' },
      { key: 'is_active', label: 'Active',   type: 'checkbox' },
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
  const [campusFor, setCampusFor] = useState<Record<string, any> | null>(null)

  const listQ = useQuery({
    queryKey: ['acmgmt', entity.slug, page],
    queryFn:  () => academicsMgmtService.list<any>(entity.slug, { page, per_page: 15 }),
  })

  // Fetch any related entities referenced by select fields, so we can render
  // their names in the table and in the form dropdowns. Programs additionally
  // need the full campus list — for the column pills and for the assignment
  // modal — even though it's not a form field.
  const selectSources = useMemo(() => {
    const fromFields = entity.fields
      .filter((f) => (f.type === 'select' || f.type === 'multi-select') && f.selectFrom)
      .map((f) => f.selectFrom!.slug)
    const extras: AcMgmtEntity[] = entity.slug === 'options' ? ['campuses'] : []
    return Array.from(new Set<AcMgmtEntity>([...fromFields, ...extras]))
  }, [entity])
  const lookupsQs = useQuery({
    queryKey: ['acmgmt', 'lookups', entity.slug, selectSources.join(',')],
    queryFn: async () => {
      const out: Record<string, any[]> = {}
      for (const slug of selectSources) {
        const res = await academicsMgmtService.list<any>(slug as AcMgmtEntity, { per_page: 500 })
        out[slug] = (res.data?.data ?? []) as any[]
      }
      return out
    },
    enabled: selectSources.length > 0,
  })
  const sourceRows = lookupsQs.data ?? {}

  // Map of valueKey → label, keyed by the field key (e.g. department_id → Map<id, name>)
  const lookups = useMemo(() => {
    const m: Record<string, Map<any, string>> = {}
    for (const f of entity.fields) {
      if (f.type === 'select' && f.selectFrom) {
        const items = sourceRows[f.selectFrom.slug] ?? []
        const map = new Map<any, string>()
        items.forEach((it) => map.set(Number(it[f.selectFrom!.valueKey]), String(it[f.selectFrom!.labelKey] ?? '')))
        // Index also by the entity's own slug for convenience (e.g. 'departments')
        m[f.selectFrom.slug] = map
        m[f.key] = map
      }
    }
    // Always expose campus name lookup when present — used for inline pills.
    if (sourceRows['campuses']) {
      const map = new Map<any, string>()
      sourceRows['campuses'].forEach((c: any) => map.set(Number(c.id), String(c.name ?? '')))
      m['campuses'] = map
    }
    return m
  }, [entity, sourceRows])

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
                        {c.render ? c.render(r, { lookups }) : (r[c.key] ?? '—')}
                      </td>
                    ))}
                    <td className="text-right">
                      <div className="inline-flex items-center gap-1">
                        {entity.slug === 'options' && (
                          <button
                            onClick={() => setCampusFor(r)}
                            title="Manage campuses for this program"
                            className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-md bg-brand/10 text-brand hover:bg-brand/20 dark:bg-brand/20 dark:text-gold-400 dark:hover:bg-brand/30 text-[12px] font-semibold whitespace-nowrap transition-colors ring-1 ring-inset ring-brand/20 dark:ring-brand/30"
                          >
                            <MapPin className="w-3.5 h-3.5" />
                            Campuses
                            {Array.isArray(r.campus_ids) && r.campus_ids.length > 0 ? (
                              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-brand text-white text-[10.5px] font-bold leading-none">
                                {r.campus_ids.length}
                              </span>
                            ) : (
                              <span className="text-[10.5px] uppercase tracking-wider opacity-70">none</span>
                            )}
                          </button>
                        )}
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
        sourceRows={sourceRows}
      />

      {entity.slug === 'options' && (
        <ProgramCampusModal
          open={!!campusFor}
          onClose={() => setCampusFor(null)}
          program={campusFor}
          allCampuses={(sourceRows['campuses'] ?? []) as any[]}
          onSaved={() => qc.invalidateQueries({ queryKey: ['acmgmt', 'options'] })}
        />
      )}
    </section>
  )
}

function ProgramPills({ programs }: { programs: Array<{ id: number; name: string }> }) {
  if (!programs || programs.length === 0) {
    return <span className="text-ink-400 text-[12px]">— unassigned —</span>
  }
  const visible = programs.slice(0, 3)
  const overflow = programs.length - visible.length
  return (
    <div className="flex flex-wrap gap-1 max-w-[320px]">
      {visible.map((p) => (
        <span
          key={p.id}
          className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300 text-[11px] font-medium border border-emerald-100 dark:border-emerald-900/40"
          title={p.name}
        >
          {p.name}
        </span>
      ))}
      {overflow > 0 && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-300 text-[11px] font-medium">
          +{overflow}
        </span>
      )}
    </div>
  )
}

function CampusPills({ ids, lookup }: { ids: number[]; lookup?: Map<any, string> }) {
  if (!ids || ids.length === 0) {
    return <span className="text-ink-400 text-[12px]">— no campus —</span>
  }
  return (
    <div className="flex flex-wrap gap-1">
      {ids.map((id) => (
        <span
          key={id}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand/10 text-brand dark:bg-brand/20 dark:text-gold-400 text-[11px] font-medium"
        >
          <MapPin className="w-3 h-3" />
          {lookup?.get(Number(id)) ?? `#${id}`}
        </span>
      ))}
    </div>
  )
}

function ProgramCampusModal({
  open, onClose, program, allCampuses, onSaved,
}: {
  open: boolean
  onClose: () => void
  program: Record<string, any> | null
  allCampuses: any[]
  onSaved: () => void
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [filter, setFilter] = useState('')

  const programId = program?.id as number | undefined

  const detailQ = useQuery({
    queryKey: ['acmgmt', 'options', programId, 'campuses'],
    queryFn:  () => academicsMgmtService.listOptionCampuses(programId!),
    enabled:  !!programId && open,
  })

  // Reset local selection whenever we (re)open with a different program
  useEffect(() => {
    if (!open) return
    setFilter('')
    if (detailQ.data?.data?.campus_ids) {
      setSelected(new Set(detailQ.data.data.campus_ids))
    } else if (Array.isArray(program?.campus_ids)) {
      setSelected(new Set((program!.campus_ids as number[]).map(Number)))
    } else {
      setSelected(new Set())
    }
  }, [open, programId, detailQ.data])

  const saveM = useMutation({
    mutationFn: (ids: number[]) => academicsMgmtService.setOptionCampuses(programId!, ids),
    onSuccess: () => { toast.success('Campuses updated'); onSaved(); onClose() },
    onError:   (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to update campuses'),
  })

  const toggle = (id: number) => {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return allCampuses
    return allCampuses.filter((c) =>
      String(c.name ?? '').toLowerCase().includes(q) ||
      String(c.code ?? '').toLowerCase().includes(q) ||
      String(c.location ?? '').toLowerCase().includes(q)
    )
  }, [allCampuses, filter])

  if (!program) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Campuses · ${program.name ?? 'Program'}`}
      size="md"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            onClick={() => saveM.mutate(Array.from(selected))}
            disabled={saveM.isPending}
          >
            {saveM.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Save
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[12.5px] text-ink-500">
          Tick every campus where this program is offered. Untick to remove.
        </p>

        {allCampuses.length === 0 ? (
          <div className="rounded-md border border-dashed border-ink-200 p-4 text-center text-ink-500 text-[13px]">
            No campuses defined yet — create one in the <strong>Campuses</strong> tab first.
          </div>
        ) : (
          <>
            <input
              className="input"
              placeholder="Search campuses…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />

            {detailQ.isLoading ? (
              <div className="flex items-center gap-2 text-ink-500 text-[13px] py-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading current campuses…
              </div>
            ) : (
              <div className="max-h-[320px] overflow-y-auto divide-y divide-ink-100 dark:divide-ink-800 rounded-md border border-ink-200 dark:border-ink-700">
                {filtered.length === 0 ? (
                  <div className="p-4 text-center text-ink-500 text-[12.5px]">No matching campuses.</div>
                ) : filtered.map((c: any) => {
                  const id = Number(c.id)
                  const checked = selected.has(id)
                  return (
                    <label
                      key={id}
                      className={`flex items-start gap-3 p-3 cursor-pointer transition-colors ${
                        checked ? 'bg-brand/5 dark:bg-brand/10' : 'hover:bg-ink-50 dark:hover:bg-ink-800/40'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 rounded border-ink-300 text-brand focus:ring-brand/30"
                        checked={checked}
                        onChange={() => toggle(id)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-semibold text-ink-900 dark:text-ink-100 truncate">
                            {c.name}
                          </span>
                          {c.code && (
                            <span className="text-[10.5px] font-mono px-1.5 py-0.5 rounded bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-300">
                              {c.code}
                            </span>
                          )}
                          {c.is_active === 0 && (
                            <span className="text-[10.5px] uppercase tracking-wider text-amber-600 font-semibold">inactive</span>
                          )}
                        </div>
                        {c.location && (
                          <p className="text-[11.5px] text-ink-500 mt-0.5 truncate flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {c.location}
                          </p>
                        )}
                      </div>
                    </label>
                  )
                })}
              </div>
            )}

            <div className="flex items-center justify-between text-[12px] text-ink-500">
              <span>{selected.size} selected</span>
              <button
                type="button"
                className="text-brand hover:underline disabled:opacity-50"
                onClick={() => setSelected(new Set())}
                disabled={selected.size === 0}
              >
                Clear all
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

/* ───────────────────────────────────────────────────────────── */

function EntityFormModal({
  open, onClose, entity, initial, onSubmit, submitting, sourceRows,
}: {
  open: boolean
  onClose: () => void
  entity: EntityCfg
  initial?: Record<string, any>
  onSubmit: (data: Record<string, any>) => void
  submitting: boolean
  sourceRows: Record<string, any[]>
}) {
  const [state, setState] = useState<Record<string, any>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Rebuild form state whenever we open
  useEffect(() => {
    if (!open) return
    const init: Record<string, any> = {}
    entity.fields.forEach((f) => {
      if (f.type === 'multi-select') {
        // Server returns the related rows under a sibling key — e.g. the
        // form field `program_ids` reads its current value from
        // `row.programs: [{id,name}]`. Convention: `<thing>_ids` ↔ `<things>`.
        const sibling = f.key.endsWith('_ids') ? f.key.slice(0, -4) + 's' : null
        const raw =
          (sibling && initial?.[sibling]) ??
          initial?.[f.key] ??
          []
        init[f.key] = Array.isArray(raw)
          ? raw.map((it: any) => Number(typeof it === 'object' ? it.id : it))
          : []
      } else {
        init[f.key] = initial?.[f.key] ?? (f.type === 'checkbox' ? false : '')
      }
    })
    setState(init)
    setErrors({})
  }, [open, entity, initial])

  const validate = () => {
    const errs: Record<string, string> = {}
    for (const f of entity.fields) {
      if (f.required) {
        if (f.type === 'multi-select') {
          if (!Array.isArray(state[f.key]) || state[f.key].length === 0) {
            errs[f.key] = 'Pick at least one'
          }
        } else if (state[f.key] === '' || state[f.key] == null) {
          errs[f.key] = 'Required'
        }
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
      else if (f.type === 'multi-select') clean[f.key] = Array.isArray(v) ? v.map(Number) : []
      else if (f.type === 'number' || f.type === 'select') clean[f.key] = v === '' || v == null ? undefined : Number(v)
      else clean[f.key] = v === '' ? undefined : v
    }
    onSubmit(clean)
  }

  // Group multi-selects after the regular inputs so the modal reads
  // "the basics → relationships". Regular fields lay out in a tight grid;
  // multi-selects each get a full-width section with a heading.
  const baseFields = entity.fields.filter((f) => f.type !== 'multi-select')
  const multiFields = entity.fields.filter((f) => f.type === 'multi-select')

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${initial ? 'Edit' : 'New'} ${entity.singular.toLowerCase()}`}
      size="xl"
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
      <div className="space-y-6">
        {baseFields.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-1 h-4 bg-brand rounded-full" />
              <h3 className="text-[12.5px] font-bold uppercase tracking-[0.15em] text-ink-600 dark:text-ink-300">
                {entity.singular} details
              </h3>
            </div>
            <div className="grid grid-cols-12 gap-x-4 gap-y-4">
              {baseFields.map((f) => {
                const span = f.type === 'textarea' ? 12 : (f.span ?? 6)
                const spanClass =
                  span === 12 ? 'sm:col-span-12'
                  : span === 9 ? 'sm:col-span-12 md:col-span-9'
                  : span === 8 ? 'sm:col-span-12 md:col-span-8'
                  : span === 6 ? 'sm:col-span-12 md:col-span-6'
                  : span === 4 ? 'sm:col-span-6 md:col-span-4'
                  : span === 3 ? 'sm:col-span-6 md:col-span-3'
                  : span === 2 ? 'sm:col-span-6 md:col-span-2'
                  : 'sm:col-span-12 md:col-span-6'
                return (
                  <div key={f.key} className={`col-span-12 ${spanClass}`}>
                    <label className="label">
                      {f.label}{f.required && <span className="text-red-500 ml-0.5">*</span>}
                    </label>
                    {renderField(f, state, setState, sourceRows)}
                    {errors[f.key] && <p className="error-text">{errors[f.key]}</p>}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {multiFields.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-1 h-4 bg-emerald-500 rounded-full" />
              <h3 className="text-[12.5px] font-bold uppercase tracking-[0.15em] text-ink-600 dark:text-ink-300">
                Curriculum placement
              </h3>
              <span className="text-[11px] text-ink-400 ml-auto">
                Pick where this {entity.singular.toLowerCase()} is offered
              </span>
            </div>
            <div className={`grid gap-4 ${multiFields.length > 1 ? 'lg:grid-cols-2' : ''}`}>
              {multiFields.map((f) => {
                const count = Array.isArray(state[f.key]) ? state[f.key].length : 0
                return (
                  <div key={f.key} className="rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/40 p-3.5">
                    <div className="flex items-baseline justify-between mb-2">
                      <label className="text-[12px] font-bold uppercase tracking-wider text-ink-700 dark:text-ink-200">
                        {f.label}{f.required && <span className="text-red-500 ml-0.5">*</span>}
                      </label>
                      <span className="text-[11px] text-ink-400">
                        {count > 0 ? `${count} selected` : 'none'}
                      </span>
                    </div>
                    {renderField(f, state, setState, sourceRows)}
                    {errors[f.key] && <p className="error-text">{errors[f.key]}</p>}
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </div>
    </Modal>
  )
}

function renderField(
  f: FieldCfg,
  state: Record<string, any>,
  setState: React.Dispatch<React.SetStateAction<Record<string, any>>>,
  sourceRows: Record<string, any[]>,
) {
  if (f.type === 'textarea') {
    return (
      <textarea
        className="input min-h-[84px]"
        placeholder={f.placeholder}
        value={state[f.key] ?? ''}
        onChange={(e) => setState({ ...state, [f.key]: e.target.value })}
      />
    )
  }
  if (f.type === 'checkbox') {
    return (
      <label className="inline-flex items-center gap-2 mt-1">
        <input
          type="checkbox"
          checked={!!state[f.key]}
          onChange={(e) => setState({ ...state, [f.key]: e.target.checked })}
          className="rounded border-ink-300 text-brand focus:ring-brand/30"
        />
        <span className="text-[13px] text-ink-700 dark:text-ink-200">Yes</span>
      </label>
    )
  }
  if (f.type === 'select' && f.selectFrom) {
    return (
      <SearchableSelect
        options={(sourceRows[f.selectFrom.slug] ?? []).map((it: any) => ({
          value: Number(it[f.selectFrom!.valueKey]),
          label: String(it[f.selectFrom!.labelKey] ?? ''),
        }))}
        value={state[f.key] ? Number(state[f.key]) : 0}
        onChange={(v) => setState({ ...state, [f.key]: v ? Number(v) : '' })}
        placeholder={f.placeholder ?? `Select ${f.label.toLowerCase()}…`}
        allLabel={`Select ${f.label.toLowerCase()}…`}
      />
    )
  }
  if (f.type === 'multi-select' && f.selectFrom) {
    return (
      <MultiSelectChecklist
        options={(sourceRows[f.selectFrom.slug] ?? []).map((it: any) => ({
          value: Number(it[f.selectFrom!.valueKey]),
          label: String(it[f.selectFrom!.labelKey] ?? ''),
        }))}
        value={Array.isArray(state[f.key]) ? state[f.key] as number[] : []}
        onChange={(arr) => setState({ ...state, [f.key]: arr })}
        placeholder={f.placeholder ?? `Search ${f.label.toLowerCase()}…`}
      />
    )
  }
  return (
    <input
      type={f.type === 'number' ? 'number' : 'text'}
      className="input"
      placeholder={f.placeholder}
      value={state[f.key] ?? ''}
      onChange={(e) => setState({ ...state, [f.key]: e.target.value })}
    />
  )
}

function MultiSelectChecklist({
  options, value, onChange, placeholder,
}: {
  options: Array<{ value: number; label: string }>
  value: number[]
  onChange: (next: number[]) => void
  placeholder?: string
  /** Reserved for future variants — currently only emerald is used. */
  accent?: 'emerald' | 'primary'
}) {
  const [filter, setFilter] = useState('')
  const set = useMemo(() => new Set(value.map(Number)), [value])
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.label.toLowerCase().includes(q))
  }, [options, filter])

  const toggle = (id: number) => {
    const next = new Set(set)
    next.has(id) ? next.delete(id) : next.add(id)
    onChange(Array.from(next))
  }

  const selectedItems = useMemo(
    () => options.filter((o) => set.has(o.value)),
    [options, set],
  )

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
      {/* Left — full list with search, always visible */}
      <div className="lg:col-span-7 rounded-xl border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-900 overflow-hidden">
        <div className="p-2 border-b border-ink-100 dark:border-ink-800 bg-ink-50/40 dark:bg-ink-800/30">
          <input
            className="input"
            placeholder={placeholder ?? 'Search…'}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <div className="max-h-[300px] overflow-y-auto divide-y divide-ink-100 dark:divide-ink-800">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-ink-500 text-[12.5px]">No matches.</div>
          ) : filtered.map((o) => {
            const checked = set.has(o.value)
            return (
              <label
                key={o.value}
                className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors ${
                  checked
                    ? 'bg-emerald-50 dark:bg-emerald-900/15'
                    : 'hover:bg-ink-50 dark:hover:bg-ink-800/40'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(o.value)}
                  className="rounded border-ink-300 text-brand focus:ring-brand/30"
                />
                <span className="text-[13px] text-ink-800 dark:text-ink-100 flex-1">{o.label}</span>
                {checked && (
                  <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-600">added</span>
                )}
              </label>
            )
          })}
        </div>
      </div>

      {/* Right — current selection */}
      <div className="lg:col-span-5 rounded-xl border border-ink-200 dark:border-ink-700 bg-ink-50/40 dark:bg-ink-800/30 overflow-hidden flex flex-col">
        <div className="px-3 py-2.5 border-b border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900 flex items-center justify-between">
          <span className="text-[11.5px] font-bold uppercase tracking-wider text-ink-600 dark:text-ink-300">
            Selected
          </span>
          <span className="inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full bg-emerald-500 text-white text-[10.5px] font-bold">
            {set.size}
          </span>
        </div>
        <div className="max-h-[300px] overflow-y-auto p-2 space-y-1.5 flex-1">
          {selectedItems.length === 0 ? (
            <div className="h-full flex items-center justify-center text-ink-400 text-[12.5px] italic py-10 text-center px-4">
              Tick a row on the left to add it here.
            </div>
          ) : (
            selectedItems.map((o) => (
              <div
                key={o.value}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white dark:bg-ink-900 border border-emerald-100 dark:border-emerald-900/40 text-[12.5px] text-ink-800 dark:text-ink-100"
              >
                <span className="flex-1 truncate">{o.label}</span>
                <button
                  type="button"
                  onClick={() => toggle(o.value)}
                  className="text-ink-400 hover:text-red-500 text-[14px] leading-none"
                  aria-label="Remove"
                >×</button>
              </div>
            ))
          )}
        </div>
        {set.size > 0 && (
          <button
            type="button"
            className="px-3 py-2 text-[11.5px] text-ink-500 hover:text-red-500 border-t border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900 text-left"
            onClick={() => onChange([])}
          >
            Clear all
          </button>
        )}
      </div>
    </div>
  )
}
