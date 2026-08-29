import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import {
  GraduationCap,
  Building2,
  School as SchoolIcon,
  Library,
  BookOpen,
  DoorOpen,
  ListTree,
  Layers,
  Plane,
  Plus,
  Loader2,
  Trash2,
  Pencil,
  MapPin,
  CalendarDays,
  Download,
  Upload,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Search as SearchIcon,
  X,
  type LucideIcon,
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import SearchableSelect from '@/components/ui/SearchableSelect'
import { academicsMgmtService } from '@/services/academicsMgmtService'
import type { AcMgmtEntity } from '@/types/academic'
import { useAuthStore } from '@/store/authStore'
import type { AuthUser } from '@/store/authStore'
import { PERMISSIONS } from '@/constants'
import { isSuperadmin } from '@/utils/permissions'

/* ─────────────────────────────────────────────────────────────
   Entity / field types and the master ENTITIES registry.
   Exported so individual pages can pass a filtered subset.
   ───────────────────────────────────────────────────────────── */

export type FieldType =
  | 'text'
  | 'number'
  | 'checkbox'
  | 'textarea'
  | 'select'
  | 'multi-select'

export interface FieldCfg {
  key: string
  label: string
  type: FieldType
  required?: boolean
  placeholder?: string
  selectFrom?: { slug: AcMgmtEntity; valueKey: string; labelKey: string }
  span?: number
  /** When true, an empty value is sent to the backend as `null` (clears
   *  the column on update) instead of being stripped from the payload. */
  nullable?: boolean
}

export interface IOColumn {
  /** Header label as it appears in the .xlsx file (case-insensitive on import). */
  header: string
  /** DB / API field key the header maps to. Required unless `lookup` is set. */
  key?: string
  /**
   * For columns that show a value from a related entity (e.g. the parent
   * faculty's fac_code on a department row). On export the cell renders
   * the related row's `labelKey`; on import the cell value is matched
   * against `labelKey` on the related entity to resolve the local FK
   * (`via`) to the related row's `valueKey`.
   */
  lookup?: {
    slug:     AcMgmtEntity
    via:      string  // local FK column (e.g. 'fac_id')
    labelKey: string  // related entity column shown in the file
    valueKey: string  // related entity PK column, used to resolve FK on import
    /**
     * Optional intermediate hop. Use when the local FK doesn't point
     * directly to `slug` — e.g. an option row's `department_id` →
     * department → faculty's `fac_code`. Only used for export rendering;
     * import won't try to resolve a chained value.
     */
    through?: {
      slug:     AcMgmtEntity  // intermediate entity (e.g. 'departments')
      valueKey: string        // intermediate PK column (e.g. 'dep_id')
      nextVia:  string        // FK column on intermediate to final target
    }
  }
  /** Skip this column when building import payloads (export-only display). */
  importIgnore?: boolean
  /** Override the cell value at export time. Receives the full row (with
   *  any backend-aggregated fields) and returns the value to write into
   *  the .xlsx cell. Useful for flattening arrays / computed strings. */
  compute?: (row: any) => any
}

/**
 * A field the user picks BEFORE selecting the import file. Useful for
 * entities whose Excel template only carries a subset of the columns and
 * the rest comes from a per-import choice (e.g. importing programs into a
 * specific faculty + department).
 */
export interface ImportContextField {
  key: string
  label: string
  required?: boolean
  selectFrom: { slug: AcMgmtEntity; valueKey: string; labelKey: string }
  /** When true, the chosen value is *not* merged into row payloads — it's
   *  only used to filter child dropdowns. */
  uiOnly?: boolean
  /** Filter this dropdown's options by another field's chosen value:
   *  options[parentKey].relatedRowKey == chosen[parentKey]. */
  filterBy?: { parentKey: string; relatedRowKey: string }
  /** When true, the field renders as a checkbox list and the resulting
   *  payload value is an array of numbers (e.g. campus_ids). */
  multi?: boolean
}

export interface FilterCfg {
  /** Query-param key sent to the backend (e.g. 'fac_id'). */
  key: string
  /** Display label for the dropdown. */
  label: string
  /** Lookup source for the dropdown options. */
  selectFrom: { slug: AcMgmtEntity; valueKey: string; labelKey: string }
  /** Filter this dropdown's options by another filter's chosen value:
   *  options[parentKey].relatedRowKey == chosen[parentKey]. */
  filterBy?: { parentKey: string; relatedRowKey: string }
}

/** Hook called when the create/edit form mutates a single field. Useful for
 *  deriving other fields from the change (e.g. auto-numbering codes). */
export type ComputeOnChange = (args: {
  changedKey: string
  value: any
  state: Record<string, any>
  setField: (key: string, value: any) => void
  sourceRows: Record<string, any[]>
  isEdit: boolean
}) => void | Promise<void>

export interface EntityCfg {
  slug: AcMgmtEntity
  label: string
  singular: string
  icon: LucideIcon
  pk: string
  /** Backend MANAGE_* permission required to read and write this entity. */
  writePermission?: string
  columns: {
    key: string
    label: string
    render?: (
      row: any,
      ctx?: { lookups: Record<string, Map<any, string>> },
    ) => ReactNode
  }[]
  fields: FieldCfg[]
  /** Explicit Excel import/export schema. Falls back to `fields` when absent. */
  ioColumns?: IOColumn[]
  /** Field key used to detect duplicate rows during Excel import. */
  importMatchKey?: string
  /** Default sort applied when the tab is first rendered. */
  defaultSort?: { key: string; dir: 'asc' | 'desc' }
  /** Toolbar dropdowns above the table. Sent to the backend as query params. */
  filters?: FilterCfg[]
  /** Reacts to form-field changes. Typically used for derived fields. */
  computeOnChange?: ComputeOnChange
  /** When set, the Import button opens a context dialog (faculty +
   *  department selectors, etc.) before reading the .xlsx file. The
   *  chosen values are merged into every imported row's payload. */
  importContextFields?: ImportContextField[]
}

export const ENTITIES: EntityCfg[] = [
  {
    slug: 'faculties', label: 'Faculties', singular: 'Faculty', icon: Library, pk: 'fac_id', writePermission: PERMISSIONS.MANAGE_ACADEMICS,
    columns: [
      { key: 'fac_code',     label: 'Code' },
      { key: 'fac_name',     label: 'Name' },
      { key: 'fac_acronym',  label: 'Acro' },
      { key: 'school_id',    label: 'School', render: (r, ctx) => ctx?.lookups.school_id?.get(Number(r.school_id)) ?? (r.school_id ? `#${r.school_id}` : '—') },
      { key: 'fac_descript', label: 'Description' },
    ],
    fields: [
      { key: 'fac_name',     label: 'Name',        type: 'text',     required: true, placeholder: 'Faculty of Science', span: 6 },
      { key: 'fac_acronym',  label: 'Acro',        type: 'text',     placeholder: 'FOS', span: 3 },
      { key: 'fac_code',     label: 'Code',        type: 'text',     placeholder: 'SCI-001', span: 3 },
      { key: 'school_id',    label: 'School',      type: 'select',   required: true, span: 12,
        selectFrom: { slug: 'schools', valueKey: 'school_id', labelKey: 'school_name' } },
      { key: 'fac_descript', label: 'Description', type: 'textarea' },
    ],
    ioColumns: [
      { header: 'FAC CODE', key: 'fac_code' },
      { header: 'FAC NAME', key: 'fac_name' },
      { header: 'FAC ACRO', key: 'fac_acronym' },
    ],
    importMatchKey: 'fac_code',
    defaultSort: { key: 'fac_code', dir: 'asc' },
  },
  {
    slug: 'departments', label: 'Departments', singular: 'Department', icon: Building2, pk: 'dep_id', writePermission: PERMISSIONS.MANAGE_DEPARTMENTS,
    columns: [
      { key: 'dep_code',    label: 'Code' },
      { key: 'dep_name',    label: 'Name' },
      { key: 'dep_acronym', label: 'Acro' },
      { key: 'fac_id',      label: 'Faculty', render: (r, ctx) => ctx?.lookups.fac_id?.get(Number(r.fac_id)) ?? (r.fac_id ? `#${r.fac_id}` : '—') },
    ],
    fields: [
      { key: 'dep_name',        label: 'Name',        type: 'text',     required: true, span: 6 },
      { key: 'dep_acronym',     label: 'Acro',        type: 'text',     placeholder: 'CS', span: 3 },
      { key: 'dep_code',        label: 'Code',        type: 'text',     placeholder: '3.1 (auto from faculty)', span: 3 },
      { key: 'fac_id',          label: 'Faculty',     type: 'select',   required: true, span: 12,
        selectFrom: { slug: 'faculties', valueKey: 'fac_id', labelKey: 'fac_name' } },
      { key: 'dep_description', label: 'Description', type: 'textarea' },
    ],
    importMatchKey: 'dep_code',
    defaultSort: { key: 'dep_code', dir: 'asc' },
    ioColumns: [
      { header: 'FAC CODE', lookup: { slug: 'faculties', via: 'fac_id', labelKey: 'fac_code',    valueKey: 'fac_id' } },
      { header: 'FAC ACRO', lookup: { slug: 'faculties', via: 'fac_id', labelKey: 'fac_acronym', valueKey: 'fac_id' }, importIgnore: true },
      { header: 'DPT Code', key: 'dep_code' },
      { header: 'DPT ACRO', key: 'dep_acronym' },
      { header: 'DPT Name', key: 'dep_name' },
    ],
    filters: [
      { key: 'fac_id', label: 'Faculty',
        selectFrom: { slug: 'faculties', valueKey: 'fac_id', labelKey: 'fac_name' } },
    ],
    // Auto-fill `dep_code` to "<fac_code>.<seq>" when the user picks a
    // faculty in the form. Only runs on create + when the field is empty,
    // so existing/admin-edited codes aren't clobbered.
    computeOnChange: async ({ changedKey, value, state, setField, isEdit }) => {
      if (changedKey !== 'fac_id' || isEdit) return
      if (!value) return
      const current = String(state.dep_code ?? '').trim()
      if (current !== '') return
      try {
        const res = await academicsMgmtService.nextDepartmentCode(Number(value))
        const next = res.data?.code ?? ''
        if (next) setField('dep_code', next)
      } catch {
        // Silent — admin can fill it in manually.
      }
    },
  },
  {
    slug: 'options', label: 'Programs', singular: 'Program', icon: ListTree, pk: 'id', writePermission: PERMISSIONS.MANAGE_OPTIONS,
    columns: [
      { key: 'code',          label: 'Code' },
      { key: 'name',          label: 'Program' },
      { key: 'acro',          label: 'Acro' },
      { key: 'department_id', label: 'Department', render: (r, ctx) => ctx?.lookups.departments?.get(Number(r.department_id)) ?? `#${r.department_id ?? '—'}` },
      { key: 'start_date',    label: 'Start year' },
      { key: 'end_date',      label: 'End year' },
      { key: 'campus_ids',    label: 'Campuses', render: (r, ctx) => <CampusPills ids={r.campus_ids ?? []} lookup={ctx?.lookups.campuses} /> },
      { key: 'is_active',     label: 'Active', render: (r) => r.is_active ? 'Yes' : 'No' },
    ],
    fields: [
      { key: 'name',          label: 'Program name',  type: 'text',   required: true, placeholder: 'Software Engineering', span: 6 },
      { key: 'acro',          label: 'Acro',          type: 'text',   placeholder: 'SE', span: 3 },
      { key: 'code',          label: 'Code',          type: 'text',   placeholder: '3.1.1 (auto from department)', span: 3 },
      { key: 'department_id', label: 'Department',    type: 'select', required: true, span: 12,
        selectFrom: { slug: 'departments', valueKey: 'dep_id', labelKey: 'dep_name' } },
      { key: 'start_date',    label: 'Start year',    type: 'text',   placeholder: 'e.g. 2023-2024 (optional)', span: 6, nullable: true },
      { key: 'end_date',      label: 'End year',      type: 'text',   placeholder: 'e.g. 2024-2025 or NA',       span: 6, nullable: true },
      { key: 'is_active',     label: 'Active',        type: 'checkbox', span: 6 },
    ],
    defaultSort: { key: 'code', dir: 'asc' },
    importMatchKey: 'code',
    filters: [
      { key: 'department_id', label: 'Department',
        selectFrom: { slug: 'departments', valueKey: 'dep_id', labelKey: 'dep_name' } },
    ],
    // Auto-fill `code` to "<dep_code>.<seq>" when the user picks a
    // department in the form (create only, only if code is blank).
    computeOnChange: async ({ changedKey, value, state, setField, isEdit }) => {
      if (changedKey !== 'department_id' || isEdit) return
      if (!value) return
      const current = String(state.code ?? '').trim()
      if (current !== '') return
      try {
        const res = await academicsMgmtService.nextOptionCode(Number(value))
        const next = res.data?.code ?? ''
        if (next) setField('code', next)
      } catch {
        // Silent — admin can fill it in manually.
      }
    },
    // Excel template for export AND import.
    // Export shows the parent department + faculty for context. Import
    // ignores those (importIgnore: true) — the user picks faculty +
    // department in a pre-import dialog instead, so the file only needs
    // option-level columns.
    ioColumns: [
      { header: 'FAC CODE',   importIgnore: true,
        lookup: { slug: 'faculties', via: 'department_id', valueKey: 'fac_id', labelKey: 'fac_code',
          through: { slug: 'departments', valueKey: 'dep_id', nextVia: 'fac_id' } } },
      { header: 'FAC NAME',   importIgnore: true,
        lookup: { slug: 'faculties', via: 'department_id', valueKey: 'fac_id', labelKey: 'fac_name',
          through: { slug: 'departments', valueKey: 'dep_id', nextVia: 'fac_id' } } },
      { header: 'DPT Code',   importIgnore: true,
        lookup: { slug: 'departments', via: 'department_id', valueKey: 'dep_id', labelKey: 'dep_code' } },
      { header: 'DPT ACRO',   importIgnore: true,
        lookup: { slug: 'departments', via: 'department_id', valueKey: 'dep_id', labelKey: 'dep_acronym' } },
      { header: 'DPT Name',   importIgnore: true,
        lookup: { slug: 'departments', via: 'department_id', valueKey: 'dep_id', labelKey: 'dep_name' } },
      { header: 'Start_Date', key: 'start_date' },
      { header: 'End_Date',   key: 'end_date' },
      { header: 'Option Code', key: 'code' },
      { header: 'Option ACRO', key: 'acro' },
      { header: 'Option Name', key: 'name' },
    ],
    importContextFields: [
      { key: 'fac_id', label: 'Faculty', required: true, uiOnly: true,
        selectFrom: { slug: 'faculties', valueKey: 'fac_id', labelKey: 'fac_name' } },
      { key: 'department_id', label: 'Department', required: true,
        selectFrom: { slug: 'departments', valueKey: 'dep_id', labelKey: 'dep_name' },
        filterBy: { parentKey: 'fac_id', relatedRowKey: 'fac_id' } },
      { key: 'campus_ids', label: 'Campuses', multi: true,
        selectFrom: { slug: 'campuses', valueKey: 'id', labelKey: 'name' } },
    ],
  },
  {
    slug: 'modules', label: 'Modules / Courses', singular: 'Module', icon: BookOpen, pk: 'module_id', writePermission: PERMISSIONS.MANAGE_MODULES,
    columns: [
      { key: 'min_order',      label: 'Order',
        render: (r) => {
          const orders = String(r.orders_used ?? '').trim()
          if (!orders) return <span className="text-ink-400 text-[12px]">—</span>
          const list = orders.split(',').map((s) => s.trim()).filter(Boolean)
          const primary = list[0]
          return (
            <span
              title={list.length > 1 ? `Other placements: ${list.join(', ')}` : undefined}
              className="inline-flex items-center justify-center min-w-[24px] h-[20px] px-1.5 rounded bg-ink-100 dark:bg-ink-800 text-ink-700 dark:text-ink-200 text-[12px] font-mono font-semibold"
            >
              {primary}{list.length > 1 ? '*' : ''}
            </span>
          )
        }
      },
      { key: 'module_code',    label: 'Code' },
      { key: 'module_name',    label: 'Name' },
      { key: 'module_credits', label: 'Credits' },
      { key: 'hours',          label: 'Hours' },
      { key: 'price',          label: 'Price',
        render: (r) => {
          const displayPrice = r.price ?? r.per_credit_price;
          if (displayPrice == null || displayPrice === '') {
            return <span className="text-ink-400 text-[12px]">—</span>;
          }
          const formatted = typeof displayPrice === 'number'
            ? displayPrice.toLocaleString('rw-RW', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
            : displayPrice;
          return formatted;
        }
      },
      { key: 'level',          label: 'Level',
        render: (r, ctx) => ctx?.lookups.levels?.get(Number(r.level)) ?? r.level_name ?? (r.level ? `Level ${r.level}` : '—') },
      { key: 'programs',       label: 'Programs',
        render: (r) => <ProgramPills programs={r.programs ?? []} /> },
      { key: 'programs_count', label: 'Programs',
        render: (r) => {
          const n = Number(r.programs_count ?? (Array.isArray(r.programs) ? r.programs.length : 0))
          return (
            <span className={`inline-flex items-center justify-center min-w-[24px] h-[20px] px-1.5 rounded-full text-[11px] font-bold ${
              n > 0
                ? 'bg-brand/10 text-brand dark:bg-brand/20 dark:text-gold-400'
                : 'bg-ink-100 dark:bg-ink-800 text-ink-500'
            }`}>{n}</span>
          )
        }
      },
    ],
    fields: [
      { key: 'module_code',    label: 'Code',     type: 'text',   required: true, placeholder: 'CSC1101', span: 3 },
      { key: 'module_name',    label: 'Name',     type: 'text',   required: true, placeholder: 'Introduction to Programming', span: 9 },
      { key: 'module_credits', label: 'Credits',  type: 'number', required: true, span: 3 },
      { key: 'hours',          label: 'Hours',    type: 'number', span: 3 },
      // Level first, then Price — admins fill in the curricular level
      // before the (optional) fee.
      { key: 'level',          label: 'Level',    type: 'select', required: true, span: 3,
        selectFrom: { slug: 'levels', valueKey: 'id', labelKey: 'name' } },
      { key: 'price',          label: 'Price',    type: 'number', placeholder: 'Optional', span: 3, nullable: true },
      { key: 'program_ids',    label: 'Programs', type: 'multi-select', required: true,
        selectFrom: { slug: 'options', valueKey: 'id', labelKey: 'name' } },
    ],
    defaultSort: { key: 'module_code', dir: 'asc' },
    importMatchKey: 'module_code',
    filters: [
      { key: 'faculty', label: 'Faculty',
        selectFrom: { slug: 'faculties', valueKey: 'fac_id', labelKey: 'fac_name' } },
      { key: 'department', label: 'Department',
        selectFrom: { slug: 'departments', valueKey: 'dep_id', labelKey: 'dep_name' },
        filterBy: { parentKey: 'faculty', relatedRowKey: 'fac_id' } },
      { key: 'program_ids', label: 'Department Option',
        selectFrom: { slug: 'options', valueKey: 'id', labelKey: 'name' },
        filterBy: { parentKey: 'department', relatedRowKey: 'department_id' } },
      { key: 'level', label: 'Level',
        selectFrom: { slug: 'levels', valueKey: 'id', labelKey: 'name' } },
    ],
    // Single-program import: the user picks the program in the import-
    // context dialog, then uploads a small file with just these columns.
    importContextFields: [
      { key: 'program_id', label: 'Program', required: true,
        selectFrom: { slug: 'options', valueKey: 'id', labelKey: 'name' } },
    ],
    // The five columns the user requested; everything else in the source
    // file is silently ignored.
    ioColumns: [
      { header: 'Order',           key: 'module_order' },
      { header: 'Code',            key: 'module_code' },
      { header: 'Name',            key: 'module_name' },
      { header: 'Credits',         key: 'module_credits' },
      { header: 'Hours',           key: 'hours' },
      { header: 'Price',           key: 'price', compute: (r: any) => {
        const price = r.price ?? r.per_credit_price
        if (!price) return ''
        return price
      }},
      { header: 'Level',           key: 'level', compute: (r: any) => {
        // `modules.level` is a `levels.id`, so the export must carry the
        // catalogue name — an exported "Level 3" that means "Year 2" is worse
        // than useless to whoever opens the spreadsheet.
        if (r.levels && Array.isArray(r.levels) && r.levels.length > 0) {
          return r.levels[0].name
        }
        if (r.level_name) return r.level_name
        return r.level ? `Level ${r.level}` : ''
      }},
      { header: 'Programs',        key: 'programs', compute: (r: any) => {
        if (r.programs && Array.isArray(r.programs)) {
          return r.programs.map((p: any) => p.name).join('; ')
        }
        return ''
      }},
    ],
  },
  {
    slug: 'facility', label: 'Facilities / Rooms', singular: 'Facility', icon: DoorOpen, pk: 'id', writePermission: PERMISSIONS.MANAGE_FACILITIES,
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
    slug: 'schools', label: 'Schools', singular: 'School', icon: SchoolIcon, pk: 'school_id', writePermission: PERMISSIONS.MANAGE_SCHOOLS,
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
    slug: 'degrees', label: 'Degrees', singular: 'Degree', icon: GraduationCap, pk: 'id', writePermission: PERMISSIONS.MANAGE_DEGREES,
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
    slug: 'levels', label: 'Levels', singular: 'Level', icon: Layers, pk: 'id', writePermission: PERMISSIONS.MANAGE_LEVELS,
    columns: [
      { key: 'name', label: 'Name' },
    ],
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Year 1' },
    ],
  },
  {
    slug: 'leave_types', label: 'Leave types', singular: 'Leave type', icon: Plane, pk: 'id', writePermission: PERMISSIONS.MANAGE_LEAVE_TYPES,
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
    slug: 'campuses', label: 'Campuses', singular: 'Campus', icon: MapPin, pk: 'id', writePermission: PERMISSIONS.MANAGE_CAMPUSES,
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
    slug: 'intakes' as AcMgmtEntity, label: 'Intakes', singular: 'Intake', icon: CalendarDays, pk: 'id', writePermission: PERMISSIONS.MANAGE_ADMISSIONS,
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

/* ─────────────────────────────────────────────────────────────
   Permission helper — mirrors PermissionMiddleware bypass logic
   (superadmin only; 'admin' relies on its actual permission grants,
   see RBAC_PERMISSIONS_AUDIT.md Finding A).
   ───────────────────────────────────────────────────────────── */

function canManageEntity(user: AuthUser | null, permission?: string): boolean {
  if (!user) return false
  if (isSuperadmin(user)) return true
  if (!permission) return true
  return (user.permissions ?? []).includes(permission)
}

/* ─────────────────────────────────────────────────────────────
   Public component — a horizontal tab strip plus the active panel.
   Pass a subset of ENTITIES, optionally with extra non-CRUD tabs
   (e.g. a "Years & terms" custom view).
   ───────────────────────────────────────────────────────────── */

export interface ExtraTab {
  slug: string
  label: string
  icon: LucideIcon
  render: () => ReactNode
}

interface TabsProps {
  entities: EntityCfg[]
  defaultSlug?: string
  extraTabs?: ExtraTab[]
  ariaLabel?: string
}

export function EntityCrudTabs({
  entities,
  defaultSlug,
  extraTabs = [],
  ariaLabel = 'Settings sections',
}: TabsProps) {
  const user = useAuthStore((state) => state.user)

  // Only show tabs the current user can access (has the required MANAGE_* permission).
  const visibleEntities = useMemo(
    () => entities.filter((e) => canManageEntity(user, e.writePermission)),
    [entities, user],
  )

  const allSlugs = useMemo(
    () => [...visibleEntities.map((e) => e.slug as string), ...extraTabs.map((t) => t.slug)],
    [visibleEntities, extraTabs],
  )
  const fallbackSlug = defaultSlug && allSlugs.includes(defaultSlug)
    ? defaultSlug
    : (allSlugs[0] ?? '')

  const [searchParams, setSearchParams] = useSearchParams()
  const tabFromUrl = searchParams.get('tab') ?? ''
  const activeSlug = allSlugs.includes(tabFromUrl) ? tabFromUrl : fallbackSlug

  // Mirror the resolved tab back into the URL so reloads land on the same
  // section and the sidebar's sub-item highlighting stays in sync.
  useEffect(() => {
    if (!activeSlug) return
    if (searchParams.get('tab') === activeSlug) return
    const next = new URLSearchParams(searchParams)
    next.set('tab', activeSlug)
    setSearchParams(next, { replace: true })
  }, [activeSlug, searchParams, setSearchParams])

  const handleTabChange = useCallback((slug: string) => {
    // Switching tabs invalidates the entity-scoped state (filters, sort,
    // search, page) so we drop everything except the new tab key.
    setSearchParams({ tab: slug }, { replace: false })
  }, [setSearchParams])

  const activeEntity = useMemo(
    () => visibleEntities.find((e) => e.slug === activeSlug) ?? null,
    [activeSlug, visibleEntities],
  )
  const activeExtra = useMemo(
    () => extraTabs.find((t) => t.slug === activeSlug) ?? null,
    [activeSlug, extraTabs],
  )

  const tabItems = [
    ...visibleEntities.map((e) => ({ slug: e.slug as string, label: e.label, icon: e.icon })),
    ...extraTabs.map((t) => ({ slug: t.slug, label: t.label, icon: t.icon })),
  ]

  return (
    <div className="space-y-4">
      <nav
        role="tablist"
        aria-label={ariaLabel}
        className="card p-1 overflow-x-auto no-scrollbar"
      >
        <div className="flex items-center gap-0.5 min-w-max">
          {tabItems.map((item) => {
            const Icon = item.icon
            const isActive = item.slug === activeSlug
            return (
              <button
                key={item.slug}
                role="tab"
                aria-selected={isActive}
                onClick={() => handleTabChange(item.slug)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-md text-[13px] font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-brand/10 text-brand dark:bg-brand/25 dark:text-gold-400'
                    : 'text-ink-600 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-700/50'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>
      </nav>

      {activeEntity && (
        <CrudPanel
          key={activeEntity.slug}
          entity={activeEntity}
          canWrite={canManageEntity(user, activeEntity.writePermission)}
        />
      )}
      {activeExtra && <div key={activeExtra.slug}>{activeExtra.render()}</div>}
    </div>
  )
}

/* ───────────────────────────────────────────────────────────── */

function CrudPanel({ entity, canWrite }: { entity: EntityCfg; canWrite: boolean }) {
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

  const filterKeys = useMemo(
    () => (entity.filters ?? []).map((f) => f.key),
    [entity.filters],
  )

  // Initial state is hydrated from the URL once per mount. The panel
  // re-mounts whenever the parent tab changes (key={activeEntity.slug}),
  // so this also reacts to browser back/forward across tabs.
  const [page, setPage] = useState<number>(() => {
    const n = Number(searchParams.get('page') ?? '1')
    return Number.isFinite(n) && n > 0 ? n : 1
  })
  const [editing, setEditing] = useState<Record<string, any> | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [campusFor, setCampusFor] = useState<Record<string, any> | null>(null)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const [levelMapping, setLevelMapping] = useState<Record<string, number>>({})
  const [orderEdits, setOrderEdits] = useState<Record<number, number>>({})
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(() => {
    const sb = searchParams.get('sort_by')
    const sd = searchParams.get('sort_dir')
    if (sb && (sd === 'asc' || sd === 'desc')) return { key: sb, dir: sd }
    return entity.defaultSort ?? null
  })
  const [searchInput, setSearchInput] = useState<string>(() => searchParams.get('q') ?? '')
  const [search, setSearch] = useState<string>(() => searchParams.get('q') ?? '')
  const [filterValues, setFilterValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const k of filterKeys) {
      const v = searchParams.get(k)
      if (v) init[k] = v
    }
    return init
  })
  const [importContextOpen, setImportContextOpen] = useState(false)
  const [importContextValues, setImportContextValues] = useState<Record<string, any>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Debounce the search input so we don't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  // Whenever the active search changes, jump back to page 1.
  useEffect(() => { setPage(1) }, [search])

  // Mirror panel state (search / sort / page / filters) into the URL so
  // reloading the page restores the exact view. `tab` and any unrelated
  // params are preserved.
  useEffect(() => {
    const next = new URLSearchParams(searchParams)
    if (search) next.set('q', search)
    else next.delete('q')
    if (sort) {
      next.set('sort_by', sort.key)
      next.set('sort_dir', sort.dir)
    } else {
      next.delete('sort_by')
      next.delete('sort_dir')
    }
    if (page > 1) next.set('page', String(page))
    else next.delete('page')
    for (const k of filterKeys) {
      const v = filterValues[k]
      if (v) next.set(k, v)
      else next.delete(k)
    }
    if (next.toString() === searchParams.toString()) return
    setSearchParams(next, { replace: true })
  }, [search, sort, page, filterValues, filterKeys, searchParams, setSearchParams])

  const toggleSort = (key: string) => {
    setPage(1)
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' }
      if (prev.dir === 'asc') return { key, dir: 'desc' }
      return null // 3rd click → clear
    })
  }

  const ioColumns: IOColumn[] = useMemo(
    () =>
      entity.ioColumns ??
      entity.fields
        .filter((f) => f.type !== 'multi-select')
        .map((f) => ({ header: f.label.toUpperCase(), key: f.key })),
    [entity],
  )

  const cleanFilters = useMemo(
    () => Object.fromEntries(
      Object.entries(filterValues).filter(([, v]) => v !== '' && v != null),
    ),
    [filterValues],
  )

  const listQ = useQuery({
    queryKey: ['acmgmt', entity.slug, page, sort?.key, sort?.dir, search, cleanFilters],
    queryFn:  () => academicsMgmtService.list<any>(entity.slug, {
      page,
      per_page: 15,
      ...(sort   ? { sort_by: sort.key, sort_dir: sort.dir } : {}),
      ...(search ? { q: search } : {}),
      ...cleanFilters,
    }),
  })

  const selectSources = useMemo(() => {
    const fromFields = entity.fields
      .filter((f) => (f.type === 'select' || f.type === 'multi-select') && f.selectFrom)
      .map((f) => f.selectFrom!.slug)
    const fromFilters = (entity.filters ?? []).map((f) => f.selectFrom.slug)
    const fromImportCtx = (entity.importContextFields ?? []).map((f) => f.selectFrom.slug)
    const extras: AcMgmtEntity[] = entity.slug === 'options' ? ['campuses'] : []
    return Array.from(new Set<AcMgmtEntity>([
      ...fromFields, ...fromFilters, ...fromImportCtx, ...extras,
    ]))
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

  /**
   * Choices each filter dropdown should offer, honouring the `filterBy`
   * cascade the entity declares (Faculty → Department → Program).
   *
   * Two rules, and the second is the one that makes the bar feel right:
   *  - parent chosen → keep only the rows pointing at it (departments of
   *    that faculty);
   *  - parent NOT chosen but itself narrowed → keep only the rows pointing
   *    at what the parent is narrowed to. So picking a faculty alone
   *    narrows Programs as well, through the departments of that faculty,
   *    without forcing the user to choose a department first.
   *
   * Filters are declared parent-before-child, so one pass resolves the
   * whole chain.
   */
  const filterChoices = useMemo(() => {
    const out: Record<string, any[]> = {}
    for (const f of entity.filters ?? []) {
      const all = (sourceRows[f.selectFrom.slug] ?? []) as any[]
      const link = f.filterBy
      if (!link) { out[f.key] = all; continue }

      const parent = (entity.filters ?? []).find((p) => p.key === link.parentKey)
      const parentVal = filterValues[link.parentKey]

      if (parentVal !== undefined && parentVal !== '') {
        out[f.key] = all.filter((r) => String(r[link.relatedRowKey] ?? '') === String(parentVal))
        continue
      }
      if (parent) {
        const parentAll = (sourceRows[parent.selectFrom.slug] ?? []) as any[]
        const parentVisible = out[parent.key] ?? parentAll
        if (parentVisible.length !== parentAll.length) {
          const allowed = new Set(parentVisible.map((r: any) => String(r[parent.selectFrom.valueKey] ?? '')))
          out[f.key] = all.filter((r) => allowed.has(String(r[link.relatedRowKey] ?? '')))
          continue
        }
      }
      out[f.key] = all
    }
    return out
  }, [entity.filters, sourceRows, filterValues])

  /** Changing a filter clears every filter downstream of it, so a stale
   *  department can never sit under a newly-picked faculty. */
  const setFilterCascading = (key: string, value: string) => {
    setFilterValues((prev) => {
      const next = { ...prev, [key]: value }
      let changed = [key]
      while (changed.length) {
        const round: string[] = []
        for (const f of entity.filters ?? []) {
          if (f.filterBy && changed.includes(f.filterBy.parentKey) && next[f.key]) {
            next[f.key] = ''
            round.push(f.key)
          }
        }
        changed = round
      }
      return next
    })
  }

  const lookups = useMemo(() => {
    const m: Record<string, Map<any, string>> = {}
    for (const f of entity.fields) {
      if (f.type === 'select' && f.selectFrom) {
        const items = sourceRows[f.selectFrom.slug] ?? []
        const map = new Map<any, string>()
        items.forEach((it) => map.set(Number(it[f.selectFrom!.valueKey]), String(it[f.selectFrom!.labelKey] ?? '')))
        m[f.selectFrom.slug] = map
        m[f.key] = map
      }
    }
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

  /**
   * Fetch the full list of any related entities referenced by ioColumns
   * lookup configs (including any chained `through` slug). Used by both
   * export (PK → labelKey) and import (labelKey → PK).
   */
  const fetchIoLookups = async (): Promise<Record<string, any[]>> => {
    const slugs = Array.from(new Set(
      ioColumns.flatMap((c) => {
        if (!c.lookup) return []
        return c.lookup.through
          ? [c.lookup.slug, c.lookup.through.slug]
          : [c.lookup.slug]
      }),
    ))
    const out: Record<string, any[]> = {}
    for (const slug of slugs) {
      const res = await academicsMgmtService.list<any>(slug as AcMgmtEntity, { per_page: 10000 })
      out[slug] = (res.data?.data ?? []) as any[]
    }
    return out
  }

  const exportToXlsx = async () => {
    setExporting(true)
    try {
      const [listRes, ioLookups] = await Promise.all([
        academicsMgmtService.list<any>(entity.slug, { per_page: 10000 }),
        fetchIoLookups(),
      ])
      const allRows = (listRes.data?.data ?? []) as Record<string, any>[]

      // PK → row map for each related entity, used to resolve FK → labelKey.
      const byPk: Record<string, Map<any, any>> = {}
      const ensureMap = (slug: string, valueKey: string) => {
        if (byPk[slug]) return
        const rows = ioLookups[slug] ?? []
        byPk[slug] = new Map(rows.map((r: any) => [Number(r[valueKey]), r]))
      }
      for (const c of ioColumns) {
        if (!c.lookup) continue
        ensureMap(c.lookup.slug, c.lookup.valueKey)
        if (c.lookup.through) {
          ensureMap(c.lookup.through.slug, c.lookup.through.valueKey)
        }
      }

      const headerRow = ioColumns.map((c) => c.header)
      const dataRows = allRows.map((row) =>
        ioColumns.map((c) => {
          if (c.compute) {
            const v = c.compute(row)
            return v == null ? '' : v
          }
          if (c.lookup) {
            const fkVal = row[c.lookup.via]
            if (fkVal == null || fkVal === '') return ''
            // Two-hop chained lookup: row.<via> → intermediate row → <nextVia>
            //                        → target row → labelKey
            if (c.lookup.through) {
              const intermediate = byPk[c.lookup.through.slug]?.get(Number(fkVal))
              if (!intermediate) return ''
              const finalFk = intermediate[c.lookup.through.nextVia]
              if (finalFk == null || finalFk === '') return ''
              const final = byPk[c.lookup.slug]?.get(Number(finalFk))
              const v = final ? final[c.lookup.labelKey] : ''
              return v == null ? '' : v
            }
            const related = byPk[c.lookup.slug]?.get(Number(fkVal))
            const v = related ? related[c.lookup.labelKey] : ''
            return v == null ? '' : v
          }
          const v = c.key ? row[c.key] : ''
          return v == null ? '' : v
        }),
      )
      const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows])
      const wb = XLSX.utils.book_new()
      // Excel forbids \ / ? * [ ] in sheet names and caps them at 31 chars —
      // sanitize before writing or XLSX.writeFile throws and the user gets
      // no file.
      const safeSheet = entity.label.replace(/[\\/?*[\]]/g, '-').slice(0, 31)
      XLSX.utils.book_append_sheet(wb, ws, safeSheet)
      const safeFile = entity.label.replace(/[\\/?*[\]]/g, '_')
      XLSX.writeFile(wb, `${safeFile}.xlsx`)
      toast.success(`Exported ${allRows.length} ${entity.label.toLowerCase()}`)
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  const buildImportPreview = async (file: File, contextPayload: Record<string, any> = {}) => {
    setImporting(true)
    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      if (!ws) throw new Error('No sheet found in workbook')
      const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, blankrows: false, defval: '' })
      if (aoa.length < 2) {
        toast.error('File has no data rows.')
        return
      }
      const fileHeaders = (aoa[0] as any[]).map((h) => String(h ?? '').trim().toUpperCase())

      // Active import columns: skip importIgnore, require the header to
      // appear in the file. Each entry knows whether it's a direct key
      // write or a FK lookup.
      const activeCols = ioColumns
        .filter((c) => !c.importIgnore)
        .map((c) => ({ ioCol: c, idx: fileHeaders.indexOf(c.header.toUpperCase()) }))
        .filter((m) => m.idx >= 0)

      if (activeCols.length === 0) {
        toast.error(
          `No matching columns. Expected: ${ioColumns.filter((c) => !c.importIgnore).map((c) => c.header).join(', ')}`,
        )
        return
      }

      // Pre-load lookup tables and build labelKey (lower/trim) → valueKey
      // maps for any FK columns in the import.
      const ioLookups = await fetchIoLookups()
      const labelToPk: Record<string, Map<string, any>> = {}
      for (const { ioCol } of activeCols) {
        if (!ioCol.lookup) continue
        const cacheKey = `${ioCol.lookup.slug}|${ioCol.lookup.labelKey}|${ioCol.lookup.valueKey}`
        if (labelToPk[cacheKey]) continue
        const map = new Map<string, any>()
        for (const r of (ioLookups[ioCol.lookup.slug] ?? [])) {
          const lbl = String(r[ioCol.lookup.labelKey] ?? '').trim().toLowerCase()
          if (lbl !== '') map.set(lbl, r[ioCol.lookup.valueKey])
        }
        labelToPk[cacheKey] = map
      }

      const payloads: Record<string, any>[] = []
      const unresolvedLookups: string[] = []
      for (const row of aoa.slice(1)) {
        const r = row as any[]
        // Pre-populate with the per-import context (e.g. department_id chosen
        // before the file was opened). File-derived values may overwrite,
        // but for entities that mark the file's lookup columns as
        // importIgnore (e.g. options) the context is the only source.
        const payload: Record<string, any> = { ...contextPayload }
        for (const { ioCol, idx } of activeCols) {
          const raw = r[idx]
          if (ioCol.lookup) {
            const lbl = String(raw ?? '').trim().toLowerCase()
            if (lbl === '') continue
            const cacheKey = `${ioCol.lookup.slug}|${ioCol.lookup.labelKey}|${ioCol.lookup.valueKey}`
            const resolved = labelToPk[cacheKey]?.get(lbl)
            if (resolved !== undefined) {
              payload[ioCol.lookup.via] = Number(resolved)
            } else {
              const note = `${ioCol.header}="${raw}"`
              if (!unresolvedLookups.includes(note)) unresolvedLookups.push(note)
            }
          } else if (ioCol.key) {
            const coerced = coerceImportValue(raw, ioCol.key, entity.fields)
            if (coerced !== undefined) payload[ioCol.key] = coerced
          }
        }
        if (Object.keys(payload).length > 0) payloads.push(payload)
      }
      if (payloads.length === 0) {
        toast.error('No usable data rows.')
        return
      }
      if (unresolvedLookups.length > 0) {
        toast.error(
          `Couldn't resolve ${unresolvedLookups.length} lookup value${unresolvedLookups.length === 1 ? '' : 's'} (e.g. ${unresolvedLookups.slice(0, 2).join(', ')}). Those rows will be created without that link.`,
        )
      }

      const matchKey = entity.importMatchKey ?? null
      let existingByKey = new Map<string, Record<string, any>>()
      if (matchKey) {
        const allRes = await academicsMgmtService.list<any>(entity.slug, { per_page: 10000 })
        const existingRows = (allRes.data?.data ?? []) as Record<string, any>[]
        existingByKey = new Map(
          existingRows
            .filter((r) => r[matchKey] != null && String(r[matchKey]).trim() !== '')
            .map((r) => [String(r[matchKey]).trim().toLowerCase(), r]),
        )
      }

      const rows: ImportPreview['rows'] = payloads.map((payload) => {
        const v = matchKey ? payload[matchKey] : null
        const key = v != null ? String(v).trim().toLowerCase() : null
        const existingRow = key ? existingByKey.get(key) ?? null : null
        return { payload, existingRow }
      })

      // Modules: detect any module_order values that appear on more than
      // one row in the file. After import every module would land in the
      // same program, so duplicate orders mean the curriculum has two
      // modules competing for the same position — confusing for admins
      // and students. The preview lets users fix this inline.
      let orderConflicts: ImportPreview['orderConflicts']
      if (entity.slug === 'modules') {
        const byOrder = new Map<number, number[]>()
        payloads.forEach((r, i) => {
          const order = Number(r.module_order)
          if (!order || !Number.isFinite(order)) return
          if (!byOrder.has(order)) byOrder.set(order, [])
          byOrder.get(order)!.push(i)
        })
        const dupes = [...byOrder.entries()]
          .filter(([, idxs]) => idxs.length > 1)
          .map(([order, idxs]) => ({ order, rowIndices: idxs }))
        if (dupes.length > 0) orderConflicts = dupes
      }

      // Modules: detect any LEVEL values from the file that don't match
      // an existing `levels` row (by numeric id or by name). The preview
      // dialog asks the admin to map each one to a real level before the
      // import is allowed to run.
      let unmappedLevels: string[] | undefined
      if (entity.slug === 'modules') {
        const allLevels = (sourceRows.levels ?? []) as Array<Record<string, any>>
        const knownIds = new Set(allLevels.map((l) => Number(l.id)))
        const knownNames = new Set(
          allLevels.map((l) => String(l.name ?? '').trim().toLowerCase()),
        )
        const distinct = new Set<string>()
        for (const r of payloads) {
          const v = String(r.level ?? '').trim()
          if (v) distinct.add(v)
        }
        const unmatched: string[] = []
        for (const v of distinct) {
          if (/^\d+$/.test(v) && knownIds.has(parseInt(v, 10))) continue
          if (knownNames.has(v.toLowerCase())) continue
          unmatched.push(v)
        }
        if (unmatched.length > 0) unmappedLevels = unmatched.sort()
      }

      setLevelMapping({})
      setOrderEdits({})
      setImportPreview({
        rows,
        matchKey,
        matchHeader: matchKeyHeader(entity, matchKey),
        unmappedLevels,
        orderConflicts,
      })
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to read file')
    } finally {
      setImporting(false)
    }
  }

  const executeImport = async (action: 'skip' | 'update') => {
    if (!importPreview) return
    const preview = importPreview
    setImportPreview(null)
    setImporting(true)
    try {
      // Modules use a dedicated endpoint that also writes the chosen
      // program → module_programs link with module_order. Other entities
      // go through the generic bulk-import.
      if (entity.slug === 'modules') {
        const programId = Number(preview.rows[0]?.payload?.program_id ?? 0)
        if (!programId) {
          toast.error('No program selected — please pick one in the import dialog.')
          return
        }
        // If the file had unmapped LEVEL values, the user should have
        // picked a real level for each in the preview modal. Block here
        // if any are still missing — the backend would otherwise fall
        // back to whatever raw value came in.
        if (preview.unmappedLevels && preview.unmappedLevels.length > 0) {
          const missing = preview.unmappedLevels.filter((v) => levelMapping[v] === undefined)
          if (missing.length > 0) {
            toast.error(`Map the LEVEL value${missing.length === 1 ? '' : 's'} ${missing.map((v) => `"${v}"`).join(', ')} first.`)
            return
          }
        }
        // Re-check order conflicts against the user's inline edits — the
        // preview modal disables Confirm while any duplicates remain, but
        // we double-check here as a safety net.
        if (preview.orderConflicts && preview.orderConflicts.length > 0) {
          const seen = new Map<number, number[]>()
          preview.rows.forEach((r, idx) => {
            const order = Number(orderEdits[idx] ?? r.payload.module_order)
            if (!order || !Number.isFinite(order)) return
            if (!seen.has(order)) seen.set(order, [])
            seen.get(order)!.push(idx)
          })
          const stillBad = [...seen.entries()].filter(([, idxs]) => idxs.length > 1)
          if (stillBad.length > 0) {
            toast.error(`Order ${stillBad[0][0]} is still used by multiple rows. Renumber to continue.`)
            return
          }
        }
        const rows = preview.rows.map((r, idx) => {
          const { program_id: _ignored, ...rest } = r.payload as Record<string, any>
          // Apply level mapping for any unmapped raw values.
          const rawLevel = rest.level == null ? '' : String(rest.level).trim()
          if (rawLevel && levelMapping[rawLevel] !== undefined) {
            rest.level = levelMapping[rawLevel]
          }
          // Apply per-row order overrides from the conflict-resolution UI.
          if (orderEdits[idx] !== undefined) {
            rest.module_order = orderEdits[idx]
          }
          return rest as { module_code: string; [k: string]: any }
        })
        const res = await academicsMgmtService.programModuleImport({
          program_id: programId,
          rows,
          action,
        })
        const m = res.data?.modules ?? { created: 0, updated: 0 }
        const l = res.data?.links   ?? { created: 0, updated: 0, skipped: 0 }
        const failed = res.data?.failed ?? []
        const summary = [
          m.created ? `${m.created} new module${m.created === 1 ? '' : 's'}` : null,
          m.updated ? `${m.updated} module${m.updated === 1 ? '' : 's'} updated` : null,
          l.created ? `${l.created} link${l.created === 1 ? '' : 's'} created` : null,
          l.updated ? `${l.updated} updated` : null,
          l.skipped ? `${l.skipped} skipped` : null,
        ].filter(Boolean).join(', ')
        if (summary) toast.success(`Imported — ${summary}.`)
        if (failed.length > 0) {
          toast.error(`${failed.length} row${failed.length === 1 ? '' : 's'} failed — e.g. row ${failed[0].index + 2}: ${failed[0].error}`)
        }
        invalidate()
        return
      }

      const res = await academicsMgmtService.bulkImport(entity.slug, {
        rows: preview.rows.map((r) => r.payload),
        action,
        match_key: preview.matchKey,
      })
      const { created = 0, updated = 0, skipped = 0, failed = [] } = res.data ?? {}
      const summary = [
        created > 0 ? `${created} created` : null,
        updated > 0 ? `${updated} updated` : null,
        skipped > 0 ? `${skipped} skipped` : null,
      ].filter(Boolean).join(', ')
      if (summary) toast.success(`Import complete: ${summary}`)
      if (failed.length > 0) {
        const first = failed[0]
        const detail = first.errors
          ? Object.values(first.errors).flat().slice(0, 1).join('') || first.error
          : first.error
        toast.error(
          `${failed.length} row${failed.length === 1 ? '' : 's'} failed${detail ? ` — e.g. row ${first.index + 2}: ${detail}` : ''}`,
        )
      }
      invalidate()
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Import failed')
    } finally {
      setImporting(false)
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
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-400 pointer-events-none" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={`Search ${entity.label.toLowerCase()}…`}
              className="h-8 w-[200px] sm:w-[240px] rounded-md bg-ink-50 dark:bg-ink-800/40 border border-transparent focus:border-primary-300 focus:bg-white focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-900/40 focus:outline-none text-[12.5px] pl-8 pr-7 transition"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700 dark:hover:text-ink-200"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {entity.filters?.map((filter) => {
            const opts = filterChoices[filter.key] ?? sourceRows[filter.selectFrom.slug] ?? []
            // Nothing to choose from once the parent's selection excludes
            // everything — say so rather than offering an empty menu.
            const empty = opts.length === 0
            return (
              <select
                key={filter.key}
                value={filterValues[filter.key] ?? ''}
                disabled={empty}
                onChange={(e) => {
                  setPage(1)
                  setFilterCascading(filter.key, e.target.value)
                }}
                className="h-8 rounded-md bg-ink-50 dark:bg-ink-800/40 border border-transparent focus:border-primary-300 focus:bg-white focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-900/40 focus:outline-none text-[12.5px] px-2.5 max-w-[200px] truncate"
                title={`Filter by ${filter.label}`}
              >
                <option value="">
                  {empty ? `No ${filter.label.toLowerCase()}` : `All ${filter.label.toLowerCase()}`}
                </option>
                {opts.map((it: any) => (
                  <option key={String(it[filter.selectFrom.valueKey])} value={String(it[filter.selectFrom.valueKey])}>
                    {String(it[filter.selectFrom.labelKey] ?? '')}
                  </option>
                ))}
              </select>
            )
          })}
          <button
            className="btn-secondary btn-sm"
            onClick={exportToXlsx}
            disabled={exporting}
            title={`Export all ${entity.label.toLowerCase()} to .xlsx`}
          >
            {exporting
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Download className="w-3.5 h-3.5" />}
            Export
          </button>
          {canWrite && (
            <>
              <button
                className="btn-secondary btn-sm"
                onClick={() => {
                  if (entity.importContextFields?.length) {
                    setImportContextValues({})
                    setImportContextOpen(true)
                  } else {
                    fileInputRef.current?.click()
                  }
                }}
                disabled={importing}
                title={`Import ${entity.label.toLowerCase()} from .xlsx`}
              >
                {importing
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Upload className="w-3.5 h-3.5" />}
                Import
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) {
                    const ctx: Record<string, any> = {}
                    for (const field of entity.importContextFields ?? []) {
                      if (field.uiOnly) continue
                      const v = importContextValues[field.key]
                      if (field.multi) {
                        if (Array.isArray(v) && v.length > 0) {
                          ctx[field.key] = v.map((x) => Number(x))
                        }
                      } else if (v != null && v !== '') {
                        ctx[field.key] = Number(v)
                      }
                    }
                    buildImportPreview(f, ctx)
                  }
                  e.target.value = ''
                }}
              />
              <button className="btn-primary btn-sm" onClick={openNew}>
                <Plus className="w-3.5 h-3.5" /> New {entity.singular.toLowerCase()}
              </button>
            </>
          )}
        </div>
      </div>

      {listQ.isLoading ? (
        <p className="text-ink-500 text-[13px] py-6 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</p>
      ) : listQ.isError ? (
        <p className="text-red-600 text-[13px] py-6">Failed to load {entity.label.toLowerCase()}.</p>
      ) : rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-ink-200 p-6 text-center text-ink-500 text-[13px]">
          {search
            ? <>No {entity.label.toLowerCase()} matching <strong className="text-ink-700 dark:text-ink-200">“{search}”</strong>.</>
            : <>No {entity.label.toLowerCase()} yet.</>}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  {entity.columns.map((c) => {
                    const isSorted = sort?.key === c.key
                    const dir = isSorted ? sort!.dir : null
                    return (
                      <th key={c.key} className="select-none">
                        <button
                          type="button"
                          onClick={() => toggleSort(c.key)}
                          className={`inline-flex items-center gap-1 group transition-colors ${
                            isSorted
                              ? 'text-brand dark:text-gold-400'
                              : 'text-ink-600 dark:text-ink-300 hover:text-ink-900 dark:hover:text-white'
                          }`}
                          title={
                            !isSorted ? `Sort by ${c.label}`
                            : dir === 'asc' ? `Sorted ascending — click for descending`
                            : `Sorted descending — click to clear`
                          }
                        >
                          {c.label}
                          {dir === 'asc'  && <ArrowUp   className="w-3 h-3" />}
                          {dir === 'desc' && <ArrowDown className="w-3 h-3" />}
                          {!isSorted && (
                            <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />
                          )}
                        </button>
                      </th>
                    )
                  })}
                  {canWrite && <th className="text-right">Actions</th>}
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
                    {canWrite && (
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
                    )}
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

      <ImportPreviewModal
        open={!!importPreview}
        onClose={() => setImportPreview(null)}
        entity={entity}
        preview={importPreview}
        importing={importing}
        onConfirm={executeImport}
        levels={(sourceRows.levels ?? []) as Array<{ id: number | string; name: string }>}
        onLevelMappingChange={(m) => setLevelMapping(m)}
        orderEdits={orderEdits}
        onOrderEditsChange={(e) => setOrderEdits(e)}
      />

      <ImportContextModal
        open={importContextOpen}
        onClose={() => setImportContextOpen(false)}
        entity={entity}
        sourceRows={sourceRows}
        values={importContextValues}
        setValues={setImportContextValues}
        onContinue={() => {
          setImportContextOpen(false)
          // Defer the file picker to the next tick so the modal can finish
          // closing — some browsers throw if the picker opens during a
          // dispatching click.
          setTimeout(() => fileInputRef.current?.click(), 0)
        }}
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

/* ─────────────────────────────────────────────────────────────
   Excel import preview
   ───────────────────────────────────────────────────────────── */

interface ImportPreview {
  rows: Array<{ payload: Record<string, any>; existingRow: Record<string, any> | null }>
  matchKey: string | null
  matchHeader: string | null
  /**
   * Modules-only: distinct LEVEL values in the file that don't match any
   * existing `levels` row (by id or by name). The preview modal asks the
   * user to map each to a real level before the import can proceed.
   */
  unmappedLevels?: string[]
  /**
   * Modules-only: any `module_order` value used by more than one row in the
   * file. The preview modal lets the admin renumber inline before the
   * import runs so the program doesn't end up with two modules sharing a
   * curricular position.
   */
  orderConflicts?: Array<{ order: number; rowIndices: number[] }>
}

function matchKeyHeader(entity: EntityCfg, matchKey: string | null): string | null {
  if (!matchKey) return null
  const fromIo = entity.ioColumns?.find((c) => c.key === matchKey)?.header
  const fromField = entity.fields.find((f) => f.key === matchKey)?.label
  return fromIo ?? fromField ?? matchKey
}

/**
 * Coerce a raw cell value from an .xlsx file to the type the backend
 * expects for that field. Excel commonly returns numbers for codes that
 * happen to be all-digits — e.g. "1003" arrives as 1003, which fails the
 * server's `string` validator. Coerce based on each field's declared type.
 */
const NO_VALUE_TOKENS = new Set(['NA', 'N/A', 'N\\A', '-', '—', '–', 'NONE', 'NULL'])

function coerceImportValue(raw: any, key: string, fields: FieldCfg[]): any {
  if (raw === null || raw === undefined) return undefined
  const trimmed = typeof raw === 'string' ? raw.trim() : raw
  if (trimmed === '') return undefined

  const field = fields.find((f) => f.key === key)
  const type: FieldType = field?.type ?? 'text'

  // For nullable text fields, recognise common "no value" placeholders
  // ("NA", "N/A", "—", etc.) and treat them as missing so they don't
  // clobber the column with literal junk text.
  if (field?.nullable && (type === 'text' || type === 'textarea')) {
    const token = String(trimmed).toUpperCase()
    if (NO_VALUE_TOKENS.has(token)) return undefined
  }

  switch (type) {
    case 'number':
    case 'select': {
      const n = Number(trimmed)
      return Number.isFinite(n) ? n : undefined
    }
    case 'checkbox': {
      const s = String(trimmed).trim().toLowerCase()
      const truthy = ['1', 'true', 'yes', 'y'].includes(s)
      return truthy ? '1' : '0'
    }
    case 'multi-select':
      return undefined
    case 'text':
    case 'textarea':
    default:
      return String(trimmed)
  }
}

/* ─────────────────────────────────────────────────────────────
   Import context dialog — shown before the file picker for entities
   whose Excel template carries only a subset of the data (e.g.
   programs need to know which faculty + department they belong to).
   ───────────────────────────────────────────────────────────── */

function InlineSearchSelect({
  options, value, onChange, placeholder, emptyText, parentMissing, parentMissingText,
}: {
  options: { value: number; label: string }[]
  value: number | ''
  onChange: (v: number | '') => void
  placeholder?: string
  emptyText?: string
  parentMissing?: boolean
  parentMissingText?: string
}) {
  const [filter, setFilter] = useState('')
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.label.toLowerCase().includes(q))
  }, [options, filter])

  return (
    <div className="rounded-md border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-900 overflow-hidden">
      <div className="p-2 border-b border-ink-100 dark:border-ink-800 bg-ink-50/40 dark:bg-ink-800/30">
        <input
          type="text"
          className="input"
          placeholder={placeholder ?? 'Search…'}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          disabled={!!parentMissing}
        />
      </div>
      <div className="max-h-[260px] overflow-y-auto divide-y divide-ink-100 dark:divide-ink-800">
        {parentMissing ? (
          <div className="p-6 text-center text-ink-500 text-[12.5px] italic">
            {parentMissingText ?? 'Pick the parent value first.'}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center text-ink-500 text-[12.5px]">
            {emptyText ?? (filter ? 'No matches.' : 'No options available.')}
          </div>
        ) : (
          filtered.map((o) => {
            const selected = Number(value) === o.value
            return (
              <label
                key={o.value}
                className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors ${
                  selected
                    ? 'bg-brand/10 text-brand dark:bg-brand/20 dark:text-gold-400'
                    : 'hover:bg-ink-50 dark:hover:bg-ink-800/40 text-ink-800 dark:text-ink-100'
                }`}
              >
                <input
                  type="radio"
                  checked={selected}
                  onChange={() => onChange(o.value)}
                  className="rounded-full border-ink-300 text-brand focus:ring-brand/30"
                />
                <span className="text-[13px] flex-1 truncate">{o.label}</span>
                {selected && (
                  <span className="text-[10px] uppercase tracking-wider font-bold text-brand dark:text-gold-400">picked</span>
                )}
              </label>
            )
          })
        )}
      </div>
    </div>
  )
}

function ImportContextModal({
  open, onClose, entity, sourceRows, values, setValues, onContinue,
}: {
  open: boolean
  onClose: () => void
  entity: EntityCfg
  sourceRows: Record<string, any[]>
  values: Record<string, any>
  setValues: React.Dispatch<React.SetStateAction<Record<string, any>>>
  onContinue: () => void
}) {
  const fields = entity.importContextFields ?? []
  const expectedHeaders = (entity.ioColumns ?? [])
    .filter((c) => !c.importIgnore)
    .map((c) => c.header)

  const downloadTemplate = () => {
    try {
      const ws = XLSX.utils.aoa_to_sheet([expectedHeaders])
      const wb = XLSX.utils.book_new()
      // Sanitize: Excel rejects \ / ? * [ ] in sheet names and caps at 31
      // chars. The previous version used the raw label ("Modules / Courses
      // template") which silently failed to write.
      const safeLabel = entity.label.replace(/[\\/?*[\]]/g, '-')
      const sheetName = `${safeLabel} template`.slice(0, 31)
      XLSX.utils.book_append_sheet(wb, ws, sheetName)
      const safeFile = entity.label.replace(/[\\/?*[\]]/g, '_')
      XLSX.writeFile(wb, `${safeFile} - import template.xlsx`)
      toast.success('Template downloaded.')
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to build template')
    }
  }

  // Fully-required-and-set test — used to gate the Continue button.
  const ready = fields.every((f) => {
    if (!f.required) return true
    const v = values[f.key]
    if (f.multi) return Array.isArray(v) && v.length > 0
    return v != null && v !== ''
  })

  // Auto-clear a child dropdown when its parent changes — otherwise the
  // user could keep a stale department under a new faculty.
  const setField = (key: string, value: any) => {
    setValues((prev) => {
      const next: Record<string, any> = { ...prev, [key]: value }
      for (const f of fields) {
        if (f.filterBy?.parentKey === key) {
          next[f.key] = f.multi ? [] : ''
        }
      }
      return next
    })
  }

  const toggleMulti = (key: string, id: number) => {
    setValues((prev) => {
      const arr: number[] = Array.isArray(prev[key]) ? [...prev[key]] : []
      const idx = arr.indexOf(id)
      if (idx >= 0) arr.splice(idx, 1)
      else arr.push(id)
      return { ...prev, [key]: arr }
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Import ${entity.label.toLowerCase()}`}
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full gap-2 flex-wrap">
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={downloadTemplate}
            title="Download a blank .xlsx with just the expected headers"
          >
            <Download className="w-3.5 h-3.5" />
            Download template
          </button>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button
              className="btn-primary"
              onClick={onContinue}
              disabled={!ready}
              title={!ready ? 'Pick the required fields first.' : 'Choose a file'}
            >
              <Upload className="w-3.5 h-3.5" />
              Choose file…
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Lead — explains what the user is about to do. */}
        <p className="text-[13px] text-ink-700 dark:text-ink-200">
          Pick the {fields.map((f) => f.label.toLowerCase()).join(' and ')} that
          every row in your file belongs to, then upload the spreadsheet.
        </p>

        {/* Context selectors — the most important part, given top space. */}
        <div className="space-y-4">
          {fields.map((f) => {
            const rawOpts = (sourceRows[f.selectFrom.slug] ?? []) as any[]
            const filtered = f.filterBy
              ? rawOpts.filter((r) => {
                  const parentVal = values[f.filterBy!.parentKey]
                  if (parentVal == null || parentVal === '') return false
                  return Number(r[f.filterBy!.relatedRowKey]) === Number(parentVal)
                })
              : rawOpts
            const parentMissing = !!f.filterBy
              && (values[f.filterBy.parentKey] == null
                  || values[f.filterBy.parentKey] === '')

            const selectedNum: number | '' = (() => {
              const v = values[f.key]
              if (v == null || v === '') return ''
              const n = Number(v)
              return Number.isFinite(n) ? n : ''
            })()
            const selectedLabel = (() => {
              if (selectedNum === '') return null
              const hit = filtered.find((it: any) => Number(it[f.selectFrom.valueKey]) === selectedNum)
              return hit ? String(hit[f.selectFrom.labelKey] ?? '') : null
            })()

            if (f.multi) {
              const selected: number[] = Array.isArray(values[f.key]) ? values[f.key] : []
              return (
                <div key={f.key}>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <label className="label !mb-0">
                      {f.label}{f.required && <span className="text-red-500 ml-0.5">*</span>}
                    </label>
                    <span className="text-[11px] text-ink-400">
                      {selected.length > 0
                        ? `${selected.length} selected`
                        : (filtered.length === 0 ? 'no options available' : 'none')}
                    </span>
                  </div>
                  {filtered.length === 0 ? (
                    <p className="text-[12px] text-ink-500 rounded-md border border-dashed border-ink-200 dark:border-ink-700 p-3 text-center">
                      No {f.label.toLowerCase()} defined yet.
                    </p>
                  ) : (
                    <div className="rounded-md border border-ink-200 dark:border-ink-700 max-h-[180px] overflow-y-auto p-2 flex flex-wrap gap-1.5">
                      {filtered.map((it: any) => {
                        const id = Number(it[f.selectFrom.valueKey])
                        const checked = selected.includes(id)
                        return (
                          <label
                            key={id}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer text-[12.5px] transition-colors ${
                              checked
                                ? 'bg-brand/10 text-brand dark:bg-brand/20 dark:text-gold-400 ring-1 ring-brand/30'
                                : 'hover:bg-ink-50 dark:hover:bg-ink-800/50 text-ink-700 dark:text-ink-200'
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="rounded border-ink-300 text-brand focus:ring-brand/30"
                              checked={checked}
                              onChange={() => toggleMulti(f.key, id)}
                            />
                            {String(it[f.selectFrom.labelKey] ?? '')}
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            }

            return (
              <div key={f.key}>
                <label className="label">
                  {f.label}{f.required && <span className="text-red-500 ml-0.5">*</span>}
                </label>
                {selectedNum !== '' && selectedLabel ? (
                  // Compact "Selected" card — frees the modal for the
                  // template + actions once the pick is made.
                  <div className="rounded-md border border-brand/30 bg-brand/5 dark:bg-brand/10 dark:border-brand/40 p-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-brand/10 dark:bg-brand/20 text-brand dark:text-gold-400 flex items-center justify-center shrink-0">
                      <CheckCircleIcon />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10.5px] uppercase tracking-wider font-bold text-ink-500 dark:text-ink-400">
                        Picked
                      </div>
                      <div className="text-[14px] font-semibold text-ink-900 dark:text-ink-100 truncate">
                        {selectedLabel}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setField(f.key, '')}
                      className="text-[12px] text-brand dark:text-gold-400 font-semibold hover:underline shrink-0"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <InlineSearchSelect
                    options={filtered.map((it: any) => ({
                      value: Number(it[f.selectFrom.valueKey]),
                      label: String(it[f.selectFrom.labelKey] ?? ''),
                    }))}
                    value={selectedNum}
                    onChange={(v) => setField(f.key, v === '' ? '' : Number(v))}
                    placeholder={`Search ${f.label.toLowerCase()}…`}
                    emptyText={`No ${f.label.toLowerCase()} found.`}
                    parentMissing={parentMissing}
                    parentMissingText={
                      f.filterBy
                        ? `Pick a ${f.filterBy.parentKey.replace(/_id$/, '')} first.`
                        : undefined
                    }
                  />
                )}
              </div>
            )
          })}
        </div>

        {/* Required columns — a lighter footnote-style block. */}
        <div className="rounded-md border border-ink-200 dark:border-ink-700 bg-ink-50/40 dark:bg-ink-800/30 p-3">
          <p className="text-[11.5px] uppercase tracking-wider font-bold text-ink-600 dark:text-ink-300 mb-2">
            Your file should contain these columns (extras are ignored)
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {expectedHeaders.map((h) => (
              <li key={h}
                  className="text-[11.5px] font-mono px-2 py-0.5 rounded bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-700 text-ink-700 dark:text-ink-200">
                {h}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={downloadTemplate}
            className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-brand hover:underline"
          >
            <Download className="w-3.5 h-3.5" />
            Download a blank .xlsx with these headers
          </button>
        </div>
      </div>
    </Modal>
  )
}

/* Per-row diff: which fields would change if we update existing data. */
interface RowChange {
  key: string
  label: string
  before: string
  after: string
}

function diffRow(
  payload: Record<string, any>,
  existingRow: Record<string, any> | null,
  fields: FieldCfg[],
): RowChange[] {
  if (!existingRow) return []
  const out: RowChange[] = []
  for (const [key, newVal] of Object.entries(payload)) {
    const oldVal = existingRow[key]
    const oldStr = oldVal === null || oldVal === undefined ? '' : String(oldVal).trim()
    const newStr = newVal === null || newVal === undefined ? '' : String(newVal).trim()
    if (oldStr !== newStr) {
      const label = fields.find((f) => f.key === key)?.label ?? key
      out.push({ key, label, before: oldStr, after: newStr })
    }
  }
  return out
}

function ImportPreviewModal({
  open, onClose, entity, preview, importing, onConfirm, levels = [],
  onLevelMappingChange, orderEdits = {}, onOrderEditsChange,
}: {
  open: boolean
  onClose: () => void
  entity: EntityCfg
  preview: ImportPreview | null
  importing: boolean
  onConfirm: (action: 'skip' | 'update') => void
  levels?: Array<{ id: number | string; name: string }>
  onLevelMappingChange?: (mapping: Record<string, number>) => void
  orderEdits?: Record<number, number>
  onOrderEditsChange?: (edits: Record<number, number>) => void
}) {
  const [action, setAction] = useState<'skip' | 'update'>('skip')
  const [levelMap, setLevelMap] = useState<Record<string, number>>({})

  useEffect(() => {
    if (open) {
      setAction('skip')
      setLevelMap({})
      onLevelMappingChange?.({})
    }
  }, [open, preview])

  if (!preview) return null

  const unmapped = preview.unmappedLevels ?? []
  const allMapped = unmapped.every((v) => levelMap[v] !== undefined)

  const setLevelFor = (raw: string, levelId: number | '') => {
    setLevelMap((prev) => {
      const next = { ...prev }
      if (levelId === '' || Number.isNaN(Number(levelId))) {
        delete next[raw]
      } else {
        next[raw] = Number(levelId)
      }
      onLevelMappingChange?.(next)
      return next
    })
  }

  const setOrderFor = (rowIdx: number, value: string) => {
    const next: Record<number, number> = { ...orderEdits }
    if (value.trim() === '') {
      delete next[rowIdx]
    } else {
      const n = Number(value)
      if (Number.isFinite(n)) next[rowIdx] = n
    }
    onOrderEditsChange?.(next)
  }
  const orderFor = (rowIdx: number, fileValue: any): number | '' => {
    if (orderEdits[rowIdx] !== undefined) return orderEdits[rowIdx]
    if (fileValue == null || fileValue === '') return ''
    const n = Number(fileValue)
    return Number.isFinite(n) ? n : ''
  }
  // Live conflict recompute — reflects the user's inline edits, not just
  // the original file state. Confirm stays disabled while any duplicates
  // remain.
  const liveOrderConflicts = (() => {
    if (!preview.orderConflicts || preview.orderConflicts.length === 0) return []
    const byOrder = new Map<number, number[]>()
    preview.rows.forEach((r, i) => {
      const order = Number(orderFor(i, r.payload.module_order))
      if (!order || !Number.isFinite(order)) return
      if (!byOrder.has(order)) byOrder.set(order, [])
      byOrder.get(order)!.push(i)
    })
    return [...byOrder.entries()]
      .filter(([, idxs]) => idxs.length > 1)
      .map(([order, idxs]) => ({ order, rowIndices: idxs }))
  })()
  const ordersResolved = liveOrderConflicts.length === 0

  const dupesAll = preview.rows
    .map((r, idx) => ({ ...r, idx }))
    .filter((r) => r.existingRow)
  const newsAll = preview.rows
    .map((r, idx) => ({ ...r, idx }))
    .filter((r) => !r.existingRow)
  const total = preview.rows.length
  const matchKey = preview.matchKey
  const matchHeader = preview.matchHeader

  // For updates, split duplicates into "actually changing" vs "identical".
  const dupesWithChanges = matchKey
    ? dupesAll
        .map((r) => ({ ...r, changes: diffRow(r.payload, r.existingRow, entity.fields) }))
        .filter((r) => r.changes.length > 0)
    : []
  const dupesNoChanges = matchKey
    ? dupesAll.length - dupesWithChanges.length
    : 0

  const willCreate = newsAll.length
  const willUpdate = action === 'update' ? dupesWithChanges.length : 0
  const willSkip   = action === 'skip'   ? dupesAll.length : 0
  const willNoop   = action === 'update' ? dupesNoChanges : 0

  // For the bottom banner: a one-line plain-English summary so admins
  // know what "Confirm" actually does without reading the lists.
  const summarySentence = (() => {
    const parts: string[] = []
    if (willCreate > 0) parts.push(`${willCreate} new ${entity.label.toLowerCase()}`)
    if (willUpdate > 0) parts.push(`${willUpdate} updated`)
    if (willSkip > 0)   parts.push(`${willSkip} kept as-is`)
    if (willNoop > 0)   parts.push(`${willNoop} unchanged`)
    return parts.length === 0 ? 'Nothing will change.' : parts.join(', ') + '.'
  })()

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Import ${entity.label.toLowerCase()}`}
      size="xl"
      footer={
        <div className="flex items-center justify-between w-full gap-3">
          <p className="text-[12.5px] text-ink-600 dark:text-ink-300">
            <strong>On confirm:</strong> {summarySentence}
          </p>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={onClose} disabled={importing}>Cancel</button>
            <button
              className="btn-primary"
              onClick={() => onConfirm(action)}
              disabled={importing || total === 0 || !allMapped || !ordersResolved}
              title={
                !allMapped
                  ? 'Map every unmapped LEVEL value first.'
                  : !ordersResolved
                    ? 'Renumber the rows that share the same Module Order first.'
                    : undefined
              }
            >
              {importing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Confirm import
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Lead — one sentence the user can read at a glance. */}
        <p className="text-[13px] text-ink-700 dark:text-ink-200">
          We read <strong>{total}</strong> row{total === 1 ? '' : 's'} from your file
          {matchKey && (
            <> and matched them against existing {entity.label.toLowerCase()} by
              {' '}<code className="font-mono px-1 py-0.5 rounded bg-ink-100 dark:bg-ink-800 text-[12px]">{matchHeader}</code>.</>
          )}
          {!matchKey && <> — duplicate detection isn't configured for this entity.</>}
        </p>

        {/* Duplicate Module Order values — block confirm until each row
            has a unique order within the program. */}
        {liveOrderConflicts.length > 0 && (
          <div className="rounded-lg border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-900/20 p-3.5">
            <div className="flex items-baseline gap-2 mb-2 flex-wrap">
              <span className="text-[12px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300">
                Duplicate Module Order
              </span>
              <span className="text-[11.5px] text-rose-700/80 dark:text-rose-300/80">
                Two or more rows share the same position in the program. Renumber the rows below so each one is unique.
              </span>
            </div>
            <div className="space-y-3">
              {liveOrderConflicts.map(({ order, rowIndices }) => (
                <div key={order} className="rounded-md border border-rose-200 dark:border-rose-800 bg-white dark:bg-ink-900 p-2.5">
                  <div className="text-[11.5px] font-semibold text-rose-700 dark:text-rose-300 mb-1.5">
                    Order <code className="font-mono px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-900/40">{order}</code>
                    {' '}is used by {rowIndices.length} rows:
                  </div>
                  <div className="space-y-1.5">
                    {rowIndices.map((idx) => {
                      const r = preview.rows[idx]
                      const code = String(r.payload.module_code ?? '').trim()
                      const name = String(r.payload.module_name ?? '').trim()
                      return (
                        <div key={idx} className="flex items-center gap-2 flex-wrap text-[12.5px]">
                          <RowBadge n={idx + 2} />
                          <code className="font-mono text-rose-700 dark:text-rose-300">{code || '—'}</code>
                          <span className="text-ink-600 dark:text-ink-300 truncate max-w-[280px]">
                            {name}
                          </span>
                          <span className="text-ink-400">→ new order</span>
                          <input
                            type="number"
                            min={1}
                            value={orderFor(idx, r.payload.module_order)}
                            onChange={(e) => setOrderFor(idx, e.target.value)}
                            className="h-7 w-[70px] rounded-md bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-700 text-[12.5px] font-mono px-2 focus:border-primary-300 focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-900/40 focus:outline-none"
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Unmapped LEVEL values — block confirm until each is mapped. */}
        {unmapped.length > 0 && (
          <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3.5">
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-[12px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                LEVEL values not in the system
              </span>
              <span className="text-[11.5px] text-amber-700/80 dark:text-amber-300/80">
                Pick a matching level for each. We'll apply it to every row that uses that value.
              </span>
            </div>
            <div className="space-y-2">
              {unmapped.map((raw) => (
                <div key={raw} className="flex items-center gap-3 flex-wrap">
                  <code className="font-mono text-[12.5px] px-2 py-0.5 rounded bg-white dark:bg-ink-900 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 min-w-[60px] text-center">
                    {raw}
                  </code>
                  <span className="text-ink-400">→</span>
                  <select
                    value={levelMap[raw] ?? ''}
                    onChange={(e) => setLevelFor(raw, e.target.value === '' ? '' : Number(e.target.value))}
                    className="h-8 rounded-md bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-700 text-[12.5px] px-2 flex-1 min-w-[200px] focus:border-primary-300 focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-900/40 focus:outline-none"
                  >
                    <option value="">Select a matching level…</option>
                    {levels.map((l) => (
                      <option key={String(l.id)} value={String(l.id)}>{l.name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-2">
          <Stat label="New rows"   value={newsAll.length} tone="emerald" />
          <Stat label="Already exist" value={dupesAll.length} tone="amber" />
          <Stat label="Total in file" value={total} tone="ink" />
        </div>

        {/* Action selector — only meaningful when there are duplicates */}
        {matchKey && dupesAll.length > 0 && (
          <fieldset className="rounded-lg border border-ink-200 dark:border-ink-700 p-3">
            <legend className="px-1.5 text-[11.5px] font-bold uppercase tracking-wider text-ink-700 dark:text-ink-200">
              What should happen to the {dupesAll.length} existing row{dupesAll.length === 1 ? '' : 's'}?
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
              <ActionCard
                selected={action === 'skip'}
                onSelect={() => setAction('skip')}
                tone="amber"
                title="Ignore them"
                body={`Keep existing data unchanged. Only create the ${newsAll.length} new row${newsAll.length === 1 ? '' : 's'}.`}
                inputName={`import-action-${entity.slug}`}
              />
              <ActionCard
                selected={action === 'update'}
                onSelect={() => setAction('update')}
                tone="sky"
                title="Update them"
                body={`Overwrite ${dupesWithChanges.length} row${dupesWithChanges.length === 1 ? '' : 's'} with the imported values${dupesNoChanges > 0 ? ` (${dupesNoChanges} identical row${dupesNoChanges === 1 ? '' : 's'} will be left alone).` : '.'}`}
                inputName={`import-action-${entity.slug}`}
              />
            </div>
          </fieldset>
        )}

        {/* Per-row preview, grouped */}
        <div className="space-y-3">
          {newsAll.length > 0 && (
            <PreviewGroup
              title={`New rows (${newsAll.length})`}
              hint="These will be created."
              tone="emerald"
              icon={<Plus className="w-3.5 h-3.5" />}
            >
              {newsAll.map((r) => (
                <NewRowItem
                  key={r.idx}
                  excelRowNumber={r.idx + 2}
                  payload={r.payload}
                  matchKey={matchKey}
                  fields={entity.fields}
                />
              ))}
            </PreviewGroup>
          )}

          {action === 'update' && dupesWithChanges.length > 0 && (
            <PreviewGroup
              title={`Will be updated (${dupesWithChanges.length})`}
              hint="Field-level changes shown below — old → new."
              tone="sky"
              icon={<Pencil className="w-3.5 h-3.5" />}
            >
              {dupesWithChanges.map((r) => (
                <UpdateRowItem
                  key={r.idx}
                  excelRowNumber={r.idx + 2}
                  payload={r.payload}
                  matchKey={matchKey!}
                  changes={r.changes}
                />
              ))}
            </PreviewGroup>
          )}

          {action === 'update' && dupesNoChanges > 0 && (
            <PreviewGroup
              title={`Identical (${dupesNoChanges})`}
              hint="Already match the file. No write will be issued."
              tone="ink"
              icon={<CheckCircleIcon />}
            />
          )}

          {action === 'skip' && dupesAll.length > 0 && (
            <PreviewGroup
              title={`Will be left as-is (${dupesAll.length})`}
              hint="Existing data won't be touched."
              tone="amber"
              icon={<SkipIcon />}
            >
              {dupesAll.map((r) => (
                <SkipRowItem
                  key={r.idx}
                  excelRowNumber={r.idx + 2}
                  matchValue={String(r.payload[matchKey!] ?? '')}
                  matchHeader={matchHeader}
                  existingRow={r.existingRow!}
                  fields={entity.fields}
                  matchKey={matchKey!}
                />
              ))}
            </PreviewGroup>
          )}
        </div>
      </div>
    </Modal>
  )
}

/* ── Tiny presentational helpers used only inside the import modal ── */

function Stat({ label, value, tone }: { label: string; value: number; tone: 'ink' | 'emerald' | 'amber' | 'sky' }) {
  const toneClass = {
    ink:     'bg-ink-50 dark:bg-ink-800/40 text-ink-700 dark:text-ink-100 border-ink-200 dark:border-ink-700',
    emerald: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/50',
    amber:   'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900/50',
    sky:     'bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-900/50',
  }[tone]
  return (
    <div className={`rounded-lg border ${toneClass} px-3 py-2`}>
      <div className="text-[10.5px] uppercase tracking-wider opacity-70 font-semibold">{label}</div>
      <div className="text-[22px] font-bold leading-tight">{value}</div>
    </div>
  )
}

function ActionCard({
  selected, onSelect, tone, title, body, inputName,
}: {
  selected: boolean
  onSelect: () => void
  tone: 'amber' | 'sky'
  title: string
  body: string
  inputName: string
}) {
  const ring = selected
    ? (tone === 'sky'
        ? 'ring-2 ring-sky-400 dark:ring-sky-500 bg-sky-50/60 dark:bg-sky-900/20 border-sky-300 dark:border-sky-800'
        : 'ring-2 ring-amber-400 dark:ring-amber-500 bg-amber-50/60 dark:bg-amber-900/20 border-amber-300 dark:border-amber-800')
    : 'border-ink-200 dark:border-ink-700 hover:bg-ink-50 dark:hover:bg-ink-800/40'
  return (
    <label className={`relative flex gap-2.5 items-start rounded-md border p-3 cursor-pointer transition-colors ${ring}`}>
      <input
        type="radio"
        name={inputName}
        className="mt-0.5"
        checked={selected}
        onChange={onSelect}
      />
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-ink-900 dark:text-ink-100">{title}</div>
        <div className="text-[11.5px] text-ink-600 dark:text-ink-300 leading-relaxed mt-0.5">{body}</div>
      </div>
    </label>
  )
}

function PreviewGroup({
  title, hint, tone, icon, children,
}: {
  title: string
  hint?: string
  tone: 'emerald' | 'sky' | 'amber' | 'ink'
  icon?: ReactNode
  children?: ReactNode
}) {
  const toneBar = {
    emerald: 'bg-emerald-500',
    sky:     'bg-sky-500',
    amber:   'bg-amber-500',
    ink:     'bg-ink-300 dark:bg-ink-600',
  }[tone]
  const toneText = {
    emerald: 'text-emerald-700 dark:text-emerald-300',
    sky:     'text-sky-700 dark:text-sky-300',
    amber:   'text-amber-700 dark:text-amber-300',
    ink:     'text-ink-600 dark:text-ink-300',
  }[tone]
  return (
    <section className="rounded-lg border border-ink-100 dark:border-ink-800">
      <header className="flex items-baseline gap-2 px-3 py-2 border-b border-ink-100 dark:border-ink-800">
        <span className={`inline-block w-1.5 h-4 ${toneBar} rounded-full`} />
        <span className={`text-[12px] font-bold uppercase tracking-wider ${toneText}`}>{title}</span>
        {hint && <span className="text-[11.5px] text-ink-500 ml-2">{hint}</span>}
        <span className="ml-auto text-[11px] text-ink-400">{icon}</span>
      </header>
      {children && (
        <div className="max-h-[260px] overflow-y-auto divide-y divide-ink-100 dark:divide-ink-800">
          {children}
        </div>
      )}
    </section>
  )
}

function NewRowItem({
  excelRowNumber, payload, matchKey, fields,
}: {
  excelRowNumber: number
  payload: Record<string, any>
  matchKey: string | null
  fields: FieldCfg[]
}) {
  return (
    <div className="px-3 py-2 text-[12.5px] flex items-baseline gap-3">
      <RowBadge n={excelRowNumber} />
      {matchKey && (
        <code className="font-mono text-emerald-700 dark:text-emerald-300 shrink-0">
          {String(payload[matchKey] ?? '—')}
        </code>
      )}
      <span className="text-ink-700 dark:text-ink-200 truncate">
        {Object.entries(payload)
          .filter(([k]) => k !== matchKey)
          .map(([k, v]) => `${fields.find((f) => f.key === k)?.label ?? k}: ${v}`)
          .join(' · ') || '—'}
      </span>
    </div>
  )
}

function UpdateRowItem({
  excelRowNumber, payload, matchKey, changes,
}: {
  excelRowNumber: number
  payload: Record<string, any>
  matchKey: string
  changes: RowChange[]
}) {
  return (
    <div className="px-3 py-2 text-[12.5px]">
      <div className="flex items-baseline gap-3 mb-1">
        <RowBadge n={excelRowNumber} />
        <code className="font-mono text-sky-700 dark:text-sky-300">
          {String(payload[matchKey] ?? '—')}
        </code>
        <span className="text-[11px] text-ink-500">
          {changes.length} field{changes.length === 1 ? '' : 's'} changing
        </span>
      </div>
      <ul className="ml-12 space-y-0.5">
        {changes.map((c) => (
          <li key={c.key} className="text-[12px] flex items-baseline gap-1.5 flex-wrap">
            <span className="text-ink-500 font-medium min-w-[90px]">{c.label}:</span>
            <span className="line-through text-red-500/80 dark:text-red-400/80">{c.before || '—'}</span>
            <span className="text-ink-400">→</span>
            <span className="text-emerald-700 dark:text-emerald-300 font-medium">{c.after || '—'}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function SkipRowItem({
  excelRowNumber, matchValue, matchHeader, existingRow, fields, matchKey,
}: {
  excelRowNumber: number
  matchValue: string
  matchHeader: string | null
  existingRow: Record<string, any>
  fields: FieldCfg[]
  matchKey: string
}) {
  return (
    <div className="px-3 py-2 text-[12.5px] flex items-baseline gap-3">
      <RowBadge n={excelRowNumber} />
      <code className="font-mono text-amber-700 dark:text-amber-300 shrink-0">{matchValue}</code>
      <span className="text-ink-500 truncate">
        already exists{matchHeader ? ` (${matchHeader})` : ''}:{' '}
        {Object.entries(existingRow)
          .filter(([k, v]) => k !== matchKey && v != null && v !== '' && fields.some((f) => f.key === k))
          .slice(0, 3)
          .map(([k, v]) => `${fields.find((f) => f.key === k)?.label ?? k}: ${v}`)
          .join(' · ') || 'kept unchanged'}
      </span>
    </div>
  )
}

function RowBadge({ n }: { n: number }) {
  return (
    <span
      title={`Row ${n} in your file`}
      className="inline-flex items-center justify-center min-w-[36px] h-[20px] px-1.5 rounded bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-300 text-[10.5px] font-mono font-semibold"
    >
      #{n}
    </span>
  )
}

function CheckCircleIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 inline">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
    </svg>
  )
}

function SkipIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 inline">
      <path fillRule="evenodd" d="M4 5a1 1 0 011-1h2a1 1 0 010 2H6v8h1a1 1 0 110 2H5a1 1 0 01-1-1V5zm12 0a1 1 0 00-1-1h-2a1 1 0 100 2h1v8h-1a1 1 0 100 2h2a1 1 0 001-1V5z" clipRule="evenodd" />
    </svg>
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

  useEffect(() => {
    if (!open) return
    const init: Record<string, any> = {}
    entity.fields.forEach((f) => {
      if (f.type === 'multi-select') {
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

  const isEdit = !!initial

  /** Single-field setter that also fires the entity's compute hook (if any).
   *  Async hooks may setField themselves later (e.g. after a fetch). */
  const setField = (key: string, value: any) => {
    let next: Record<string, any> = state
    setState((prev) => {
      next = { ...prev, [key]: value }
      return next
    })
    const hook = entity.computeOnChange
    if (hook) {
      Promise.resolve(
        hook({
          changedKey: key,
          value,
          state: next,
          setField: (k, v) => setState((prev) => ({ ...prev, [k]: v })),
          sourceRows,
          isEdit,
        }),
      ).catch(() => { /* hook errors must not break the form */ })
    }
  }

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
    const clean: Record<string, any> = {}
    for (const f of entity.fields) {
      const v = state[f.key]
      // Nullable fields send an explicit `null` when empty so updates can
      // clear the column. Non-nullable fields skip empties entirely so
      // they don't accidentally overwrite existing data.
      const emptyValue = f.nullable ? null : undefined
      if (f.type === 'checkbox') clean[f.key] = v ? '1' : '0'
      else if (f.type === 'multi-select') clean[f.key] = Array.isArray(v) ? v.map(Number) : []
      else if (f.type === 'number' || f.type === 'select') clean[f.key] = v === '' || v == null ? emptyValue : Number(v)
      else clean[f.key] = v === '' ? emptyValue : v
    }
    onSubmit(clean)
  }

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
                    {renderField(f, state, setField, sourceRows)}
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
                    {renderField(f, state, setField, sourceRows)}
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
  setField: (key: string, value: any) => void,
  sourceRows: Record<string, any[]>,
) {
  if (f.type === 'textarea') {
    return (
      <textarea
        className="input min-h-[84px]"
        placeholder={f.placeholder}
        value={state[f.key] ?? ''}
        onChange={(e) => setField(f.key, e.target.value)}
      />
    )
  }
  if (f.type === 'checkbox') {
    return (
      <label className="inline-flex items-center gap-2 mt-1">
        <input
          type="checkbox"
          checked={!!state[f.key]}
          onChange={(e) => setField(f.key, e.target.checked)}
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
        onChange={(v) => setField(f.key, v ? Number(v) : '')}
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
        onChange={(arr) => setField(f.key, arr)}
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
      onChange={(e) => setField(f.key, e.target.value)}
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
