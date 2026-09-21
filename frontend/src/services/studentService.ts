import { api, apiClient } from '@/services/api'
import type { PaginatedResponse } from '@/types'

/** A student-proposed identity change awaiting (or past) registry review. */
export interface ProfileChangeRequest {
  id:               number
  student_id:       number
  /** Rendered field-by-field for the reviewer. */
  changes:          { field: string; label: string; from: string | null; to: string | null }[]
  reason:           string | null
  status:           'pending' | 'approved' | 'rejected'
  review_note:      string | null
  reviewed_by_name: string | null
  reviewed_at:      string | null
  created_at:       string
  has_document:     boolean
  document_original_name: string | null
  /** Present only on the registry queue. */
  regnumber?:       string
  student_fname?:   string
  student_lname?:   string
}

/** One row of a student's status audit trail (migration 145). */
export interface StudentStatusChange {
  id:                     number
  student_id:             number
  previous_state:         string | null
  new_state:              string
  reason:                 string | null
  document_original_name: string | null
  document_mime:          string | null
  document_size:          number | null
  /** The storage handle is never sent to the client; this flag stands in for
   *  it, and the document is fetched through the id-addressed route. */
  has_document:           boolean
  changed_by:             number | null
  changed_by_name:        string | null
  changed_at:             string
}
import type { Student } from '@/types/academic'
import type { ApplicationDocument } from '@/types/admission'
import { useAuthStore } from '@/store/authStore'
import { useCampusFilterStore } from '@/store/campusFilterStore'
import { useCategoryFilterStore } from '@/store/categoryFilterStore'

import { isPhotoUuid, legacyPhotoUrl } from '@/services/photoHelper'

export interface FacetOption {
  value: string
  label: string
}

/**
 * Program/option facet — same shape as FacetOption but carries the parent
 * department/faculty so the student edit form can keep the legacy
 * faculty/department fields in sync without a second lookup.
 */
export interface ProgramFacetOption extends FacetOption {
  department_id: number | null
  faculty_id:    number | null
}

export interface BreakdownRow {
  value: string
  label: string | null
  code?: string | null
  total: number | string
}

export interface StudentStats {
  total:            number
  active:           number
  inactive:         number
  male:             number
  female:           number
  rwandan:          number
  foreign_students: number
  faculties:        number
  academic_years:   number

  // Active-only slices
  active_male:                number
  active_female:              number
  active_unknown_gender:      number
  active_rwandan:             number
  active_foreign:             number
  active_unknown_nationality: number
  active_faculties:           number
  active_departments:         number
  active_academic_years:      number

  by_level:         { level: string; total: number | string }[]
  active_breakdown: {
    by_faculty:       BreakdownRow[]
    by_department:    BreakdownRow[]
    by_level:         BreakdownRow[]
    /** The real curriculum — grouped by `student.std_option` (catalog program). */
    by_program:       BreakdownRow[]
    /** Day / Evening / Weekend — stored in the legacy `student.program` column. */
    by_learning_mode: BreakdownRow[]
    by_campus:        BreakdownRow[]
    by_intake:        BreakdownRow[]
  }
  facets: {
    faculty:       FacetOption[]
    department:    FacetOption[]
    current_level: FacetOption[]
    acc_year:      FacetOption[]
    program:       FacetOption[]
    /** Catalog programs (options) — what students should now be assigned to. */
    options?:      ProgramFacetOption[]
  }
}

export interface StudentListParams {
  page?:          number
  per_page?:      number
  q?:             string
  student_state?: string
  gender?:        string
  faculty?:       string | number
  department?:    string
  current_level?: string
  nationality?:   string
  acc_year?:      string
  program?:       string
  /** Catalog program (options.id) the student is assigned to. */
  std_option?:    string | number
  /** Day / Evening / Weekend — backend maps this to the legacy `program` column. */
  learning_mode?: string
  /** Campus filter — matches student.campus (campuses.id stored as varchar). */
  campus?:        string | number
  /** Intake name (free-text on student.intake). */
  intake?:        string
  /** Student category bucket — matches student.category (undergraduate | postgraduate). */
  category?:      string
  /** Residency filters — free-text columns on `student`, matched
   *  case-insensitively server-side. `province` accepts a canonical bucket
   *  key ("southern") which the backend expands to every live spelling. */
  country?:       string
  province?:      string
  district?:      string
  sector?:        string
  /** Inclusive age bounds, derived from `student.birthdate`. Students whose
   *  birthdate is missing or unparseable are excluded once either is set. */
  age_min?:       string | number
  age_max?:       string | number
  /** Document verification bucket — derived server-side from the student's
   *  application documents: verified | pending | rejected | none. */
  document_status?: string
  sort_by?:       string
  sort_dir?:      'asc' | 'desc'
}

/* ── Faceted filter options ──────────────────────────────────── */

/** One selectable filter value plus how many students it would yield. */
export interface FacetValue {
  value: string
  label: string
  total: number
}

export interface FacultyFacet extends FacetValue {
  /** Drives the Option filter, which the registry only uses for Education. */
  is_education: boolean
}

export interface DepartmentFacet extends FacultyFacet {
  faculty_id: string | null
}

export interface OptionFacet extends FacultyFacet {
  department_id: string | null
  faculty_id:    string | null
}

/** Province values carry `canonical: false` when they are unrecognised
 *  free-text (foreign regions, junk rows) rather than one of the five
 *  Rwandan provinces. */
export interface ProvinceFacet extends FacetValue {
  canonical: boolean
}

export interface DistrictFacet extends FacetValue {
  /** Canonical province key this district mostly belongs to. */
  province: string | null
}

export interface SectorFacet extends FacetValue {
  /** District key this sector mostly belongs to. */
  district: string | null
}

export interface AgeBand extends FacetValue {
  min: number | null
  max: number | null
}

export interface StudentFilterOptions {
  /** Students matching the filters as sent — what an export would contain. */
  total:          number
  faculties:      FacultyFacet[]
  departments:    DepartmentFacet[]
  options:        OptionFacet[]
  countries:      FacetValue[]
  provinces:      ProvinceFacet[]
  districts:      DistrictFacet[]
  sectors:        SectorFacet[]
  academic_years: FacetValue[]
  statuses:       FacetValue[]
  /** Derived document-verification buckets (verified | pending | rejected | none). */
  document_statuses: FacetValue[]
  age: {
    min:   number
    max:   number
    /** Students in scope with a usable birthdate — the rest can't be aged. */
    known: number
    bands: AgeBand[]
  }
}

export interface StudentPayload {
  fname: string
  lname: string
  /** The catalog program (options.id) the student belongs to — required. */
  std_option: string | number | null
  regnumber?: string | null
  phone?: string | null
  email?: string | null
  gender?: string | null
  birthdate?: string | null
  nationality?: string | null
  /** Free-text program label — auto-set from the option name on the server. */
  program?: string | null
  /** Auto-derived from the option's department; sent for backward-compat only. */
  faculty?: string | number | null
  department?: string | null
  current_level?: string | null
  registration_date?: string | null
  student_state?: string | null
  intake?: string | null
  acc_year?: string | null
  sponsor?: string | null
  marital_status?: string | null
  father?: string | null
  mother?: string | null
  id_card?: string | null
  country?: string | null
  disability?: string | null
  province?: string | null
  district?: string | null
  sector?: string | null
  cell?: string | null
  village?: string | null
}

/** Partial of {@link StudentPayload} for section-by-section admin saves. */
export type StudentPatch = Partial<StudentPayload>

/* ── Bulk import / preview ───────────────────────────────────── */

export type BulkRowAction = 'create' | 'update' | 'duplicate'

export interface BulkRowError {
  field:   string
  message: string
}

export interface BulkPreviewRow {
  row_no: number
  action: BulkRowAction
  data:   Record<string, string>
  errors: BulkRowError[]
}

export interface BulkValidateResponse {
  headers: string[]
  rows:    BulkPreviewRow[]
  summary: {
    total:       number
    valid:       number
    with_errors: number
    to_create:   number
    to_update?:  number
    duplicates?: number
  }
}

export interface BulkPatchedRow {
  row_no: number
  data:   Record<string, string>
}

/* ── Export modal ────────────────────────────────────────────── */

/** `xlsx` is a real workbook; `csv` is the flat UTF-8 (BOM'd) file. */
export type ExportFormat = 'xlsx' | 'csv'

export interface ExportColumn {
  key:   string
  label: string
  group: string
}
export interface ExportColumnGroup {
  name:    string
  columns: ExportColumn[]
}
export interface ExportTemplate {
  /** Numeric for user-saved templates, string `sys:*` for built-in. */
  id:        number | string
  name:      string
  /** Ordered list of column descriptors. Each is either a raw key
   *  string or `{key, label}` so system templates can override the
   *  header label (e.g. exact Mifotra spellings). */
  columns:   Array<string | { key: string; label?: string }>
  is_system: boolean
  /** True for user-saved templates the caller owns; false for system
   *  templates (which can't be deleted from the UI). */
  is_owner?: boolean
}

/* ── Program curriculum + marks (student details page) ───────── */

export interface ProgramModuleMarks {
  mark_id?:         number | null
  cat_marks:        string | number | null
  assignment_marks: string | number | null
  exam_marks:       string | number | null
  cat_max:          string | number | null
  assignment_max:   string | number | null
  exam_max:         string | number | null
  total:            string | number | null
  percentage:       string | number | null
  grade:            string | null
  remarks:          string | null
  is_exempted?:     boolean
  exemption_reason?:string | null
  academic_term_id?:number | null
  term_label:       string | null
  year_label:       string | null
}

export interface CreateExemptionPayload {
  module_id:        number
  academic_term_id: number
  percentage:       number
  reason?:          string | null
}

export interface ProgramModuleSchedule {
  offering_count: number
  modes:          string | null
  semesters:      string | null
  years:          string | null
}

export interface ProgramModuleRegistration {
  id:               number
  status:           'registered' | 'dropped' | 'completed' | 'failed'
  grade:            string | null
  academic_term_id: number | null
  term_label:       string | null
  year_label:       string | null
  registered_at:    string | null
}

export interface ProgramModuleRow {
  module_id:      number
  module_code:    string
  module_name:    string
  module_credits: number | null
  module_order:   number | null
  is_scheduled:   boolean
  schedule:       ProgramModuleSchedule | null
  registration:   ProgramModuleRegistration | null
  marks:          ProgramModuleMarks | null
}

export interface ProgramLevelGroup {
  level_id:   number | null
  level_name: string
  modules:    ProgramModuleRow[]
  /** True when this is a synthetic group of registrations to modules
   *  that aren't part of the student's own programme curriculum
   *  (cross-programme enrollments). */
  is_extra?:  boolean
}

export interface ProgramModulesResponse {
  student: {
    id:         number
    regnumber?: string | null
    fname?:     string | null
    lname?:     string | null
    std_option?:string | null
    program?:   string | null
  }
  program: {
    id:            number
    name:          string
    code:          string | null
    department_id: number | null
    faculty_id:    number | null
  } | null
  groups: ProgramLevelGroup[]
}

/** The student's latest admission offer, as far as the documents tab is
 *  concerned. Only present when an offer exists and has had a letter token
 *  generated — otherwise there is no PDF to download yet. */
export interface AdmissionOfferSummary {
  offer_id:           number
  letter_token:       string
  status:             'pending' | 'accepted' | 'declined' | 'expired' | string | null
  letter_sent_at:     string | null
  application_number: string | null
}

/** One row of the required-documents checklist for the student's
 *  programme category — a `programme_document_requirements` entry matched
 *  (by document_type_id) against what the student actually uploaded. */
export type DocumentRequirementStatus = 'verified' | 'pending' | 'rejected' | 'missing'

export interface DocumentRequirementItem {
  requirement_id:       number
  document_type_id:     number
  name:                 string
  slug:                 string
  description:          string | null
  notes:                string | null
  is_required:          boolean
  status:               DocumentRequirementStatus
  document_id:          number | null
  file_original_name:   string | null
  uploaded_at:          string | null
  verified_at:          string | null
  verifier_name:        string | null
  verification_comment: string | null
}

export interface MissingDocumentNotice {
  id:             number
  message:        string
  document_types: { id: number; name: string; status?: string }[]
  in_app_sent:    boolean
  email_to:       string | null
  email_sent:     boolean
  email_error:    string | null
  sent_by_name:   string | null
  created_at:     string
}

export interface DocumentChecklist {
  programme_category:       'undergraduate' | 'postgraduate' | 'masters' | string
  programme_category_label: string
  /** false when no checklist has been configured for the category yet. */
  configured:               boolean
  requirements:             DocumentRequirementItem[]
  /** Required items that are missing or rejected — what a notice lists. */
  outstanding:              DocumentRequirementItem[]
  /** Uploaded application_documents ids that aren't on the checklist. */
  extra_document_ids:       number[]
  summary: {
    required_total:   number
    verified:         number
    pending:          number
    rejected:         number
    missing:          number
    optional_missing: number
  }
  /** Every required document is verified. */
  is_complete:              boolean
  last_notice:              MissingDocumentNotice | null
}

export interface StudentDocumentsResponse {
  application_id:   number | null
  documents:        ApplicationDocument[]
  admission_offer:  AdmissionOfferSummary | null
  checklist?:       DocumentChecklist
  /** Admin view only — whether a notice can actually reach the student. */
  student_contact?: { email: string | null; has_portal_account: boolean }
  can_upload?:      boolean
}

export interface NotifyMissingDocumentsResult {
  note_id:            number
  documents:          { id: number; name: string; status: string }[]
  in_app:             boolean
  has_portal_account: boolean
  email:              { to: string | null; sent: boolean; error: string | null }
}

/**
 * Mirror the topbar's global campus + category scope onto an outgoing query.
 * The students endpoints use the legacy `campus` parameter (a varchar id), so
 * we write onto that key — but only when the caller hasn't pinned one itself,
 * so an explicit override still wins.
 *
 * Shared by list / stats / filterOptions / export so all four always describe
 * the same cohort; a scope applied to the table but not to the facet counts
 * would have the panel promising rows the list can't show.
 */
function withGlobalScopes<T extends object>(params: T): Record<string, unknown> {
  const scopeId  = useCampusFilterStore.getState().selectedCampusId
  const category = useCategoryFilterStore.getState().selectedCategory
  const merged: Record<string, unknown> = { ...(params as Record<string, unknown>) }
  if (scopeId != null && (merged.campus == null || merged.campus === '')) {
    merged.campus = String(scopeId)
  }
  if (category != null && (merged.category == null || merged.category === '')) {
    merged.category = category
  }
  return merged
}

export const studentService = {
  list: (
    params: StudentListParams = {},
    signal?: AbortSignal,
  ) =>
    api.get<PaginatedResponse<Student>>(
      '/students',
      withGlobalScopes(params),
      signal,
    ),

  stats: (params: { acc_year?: string; campus?: string | number; category?: string } = {}, signal?: AbortSignal) =>
    api.get<StudentStats>('/students/stats', withGlobalScopes(params), signal),

  /** Propose a change to an identity field, with evidence, for the registry
   *  to approve (migration 147). Tier-1 fields save straight through
   *  updateMe(); these need a decision because they print on certificates. */
  requestProfileChange: (payload: {
    fields: Record<string, string>
    reason?: string
    document?: File | null
  }) => {
    const form = new FormData()
    form.append('fields', JSON.stringify(payload.fields))
    if (payload.reason)   form.append('reason', payload.reason)
    if (payload.document) form.append('document', payload.document)
    return api.upload<{ id: number; fields: string[] }>(
      '/students/me/profile-change-requests',
      form,
    )
  },

  /** The student's own change-request history. */
  myProfileChangeRequests: (signal?: AbortSignal) =>
    api.get<ProfileChangeRequest[]>('/students/me/profile-change-requests', {}, signal),

  /** The registry's review queue. */
  listProfileChangeRequests: (status = 'pending', signal?: AbortSignal) =>
    api.get<ProfileChangeRequest[]>('/students/profile-change-requests', { status }, signal),

  decideProfileChangeRequest: (id: number, decision: 'approved' | 'rejected', note?: string) =>
    api.post<{ status: string }>(`/api/students/profile-change-requests/${id}/decide`, { decision, note }),

  /** One entry in a student's status audit trail (migration 145). */
  statusHistory: (id: number | string, signal?: AbortSignal) =>
    api.get<StudentStatusChange[]>(`/api/students/${id}/status-history`, {}, signal),

  /**
   * Change a student's status, with the reason and evidence the registry
   * requires. Multipart because the state, the reason and the certificate are
   * one transaction on the server — the generic PUT refuses status changes so
   * this stays the only path that records why.
   *
   * `reason` is required for `rejected` and `dropped`; `document` for
   * `deceased`. The server enforces both, so a caller that skips them gets a
   * 422 naming the missing field rather than a silent partial write.
   */
  updateStatus: (
    id: number | string,
    payload: { student_state: string; reason?: string; document?: File | null },
  ) => {
    const form = new FormData()
    form.append('student_state', payload.student_state)
    if (payload.reason)   form.append('reason', payload.reason)
    if (payload.document) form.append('document', payload.document)
    return api.upload<{ student_state: string; previous: string }>(
      `/api/students/${id}/status`,
      form,
    )
  },

  /** URL for a status change's supporting document (auth via cookie/header
   *  interceptor on apiClient — use downloadStatusDocument to fetch it). */
  downloadStatusDocument: async (id: number | string, changeId: number) => {
    const res = await apiClient.get(
      `/api/students/${id}/status-history/${changeId}/document`,
      { responseType: 'blob' },
    )
    const blob = res.data instanceof Blob ? res.data : new Blob([res.data])
    const cd   = (res.headers['content-disposition'] as string | undefined) ?? ''
    const m    = /filename="?([^";]+)"?/i.exec(cd)
    const url  = window.URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = m?.[1] ?? `status-document-${changeId}`
    document.body.appendChild(a); a.click(); a.remove()
    window.URL.revokeObjectURL(url)
  },

  /** Every value the filter panel can offer, each with the number of
   *  students it would yield. Counts are faceted: pass the filters that are
   *  already active and each dimension comes back counted with the others
   *  applied but its own excluded, so the panel can show what a click does
   *  before the user makes it. */
  filterOptions: (params: StudentListParams = {}, signal?: AbortSignal) =>
    api.get<StudentFilterOptions>(
      '/students/filter-options',
      withGlobalScopes(params),
      signal,
    ),

  /** Bulk reassign students to a campus. Server applies the change in a
   *  single transaction and returns the affected row count. */
  bulkUpdateCampus: (studentIds: Array<number | string>, campusId: number | null) =>
    api.post<{ updated: number }>(`/api/students/bulk-update-campus`, {
      student_ids: studentIds,
      campus_id: campusId,
    }),

  /** Bulk import — token-bearing template download URL. Hits the
   *  read-only `bulk-upload-template` endpoint which streams the CSV
   *  (UTF-8 with BOM so Excel opens it correctly). */
  bulkUploadTemplateUrl: () => {
    const token = useAuthStore.getState().token
    const base  = (import.meta.env.VITE_API_URL ?? '') + '/api'
    return `${base}/students/bulk-upload-template?token=${token}`
  },

  /** Dry-run preview — parses the CSV server-side and returns one row
   *  per line with `action` (`create` | `update`) and any validation
   *  errors. The modal shows this in a table so the user can fix
   *  mismatches before committing. */
  bulkValidate: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.upload<BulkValidateResponse>(`/api/students/bulk-validate`, form)
  },

  /** Commit — uploads the CSV and writes (insert + upsert by regnumber)
   *  in a single transaction. `patchedRows` lets the modal forward
   *  per-row corrections the user made in the preview. */
  bulkUpload: (file: File, patchedRows?: BulkPatchedRow[]) => {
    const form = new FormData()
    form.append('file', file)
    if (patchedRows && patchedRows.length > 0) {
      form.append('patched_rows', JSON.stringify(patchedRows))
    }
    return api.upload<{
      inserted:  number
      updated:   number
      /** Existing rows where every provided cell already matched the
       *  current value (or the only filled cells were blank) — nothing
       *  was written to the DB. */
      unchanged: number
      skipped:   number
      errors:    Array<{ row: number; message: string }>
    }>(`/api/students/bulk-upload`, form)
  },

  /** Fetch the column registry that drives the export modal's custom
   *  picker. Groups + ordering are returned exactly as the backend
   *  declared them so the UI stays canonical. */
  exportColumns: () =>
    api.get<{ groups: ExportColumnGroup[] }>('/students/export-columns'),

  /** Fetch every export template visible to the caller — system
   *  templates first, then their own saved ones. */
  listExportTemplates: () =>
    api.get<{ templates: ExportTemplate[] }>('/students/export-templates'),

  /** Save a new export template (or update an existing one matching the
   *  user + name pair) using the given ordered column list. */
  saveExportTemplate: (name: string, columns: string[]) =>
    api.post<{ id: number; name: string; columns: string[] }>(
      '/students/export-templates',
      { name, columns },
    ),

  /** Delete a user-owned export template. System templates are 403. */
  deleteExportTemplate: (id: number | string) =>
    api.delete<void>(`/api/students/export-templates/${id}`),

  /** Build a token-bearing download URL. The browser navigates to it
   *  directly (see `downloadExport` below) so the response is saved as a
   *  file — much simpler than streaming an Axios blob.
   *
   *  Pass either `template_id` (id from listExportTemplates) or an array of
   *  column keys; the backend prefers `template_id` when both are present,
   *  and falls back to a standard column set when neither is given — that's
   *  what lets the filter panel offer a one-click download per value.
   *
   *  `format` picks the file type: `xlsx` produces a real workbook (styled
   *  header, frozen pane, autofilter, and a sheet recording which filters
   *  produced it); `csv` streams the flat file.
   *
   *  All current list filters (q, gender, faculty, department, campus,
   *  category, …) are forwarded so the export matches what the user
   *  sees on the table. */
  exportUrl: (params: {
    template_id?: string | number
    columns?:     string[]
    filters?:     Record<string, string | number | undefined>
    format?:      ExportFormat
  }) => {
    const token = useAuthStore.getState().token
    const base  = (import.meta.env.VITE_API_URL ?? '') + '/api'
    const search = new URLSearchParams()
    if (params.template_id != null && params.template_id !== '') {
      search.set('template_id', String(params.template_id))
    }
    if (params.columns && params.columns.length > 0) {
      search.set('columns', params.columns.join(','))
    }
    search.set('format', params.format ?? 'xlsx')
    // Mirror the same global scopes the list endpoint reads — campus from
    // the topbar pill and category from the topbar category switcher.
    const filters = withGlobalScopes(params.filters ?? {})
    for (const [k, v] of Object.entries(filters)) {
      if (v == null || v === '') continue
      search.set(k, String(v))
    }
    if (token) search.set('token', token)
    return `${base}/students/export?${search.toString()}`
  },

  /** Trigger the browser's native download flow for an export URL. A plain
   *  anchor click keeps the server's Content-Disposition filename, which a
   *  fetch-and-blob round-trip would throw away. */
  downloadExport: (url: string) => {
    const a = document.createElement('a')
    a.href = url
    a.rel  = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  },

  show: (id: number | string, signal?: AbortSignal) =>
    api.get<Student>(`/api/students/${id}`, {}, signal),

  /** Self-service: returns the authenticated user's own student record. */
  me: (signal?: AbortSignal) =>
    api.get<Student>(`/api/students/me`, {}, signal),

  /** Self-service: patch the caller's own student record. The server
   *  whitelists which columns are actually writable; anything else in the
   *  payload is silently dropped. */
  updateMe: (data: Partial<{
    phone:          string | null
    marital_status: string | null
    province:       string | null
    district:       string | null
    sector:         string | null
    cell:           string | null
    village:        string | null
  }>) => api.put<Student>(`/api/students/me`, data),

  /** Self-service: documents the authenticated student uploaded with their
   *  application + the admission letter the registrar issued for them. */
  meDocuments: (signal?: AbortSignal) =>
    api.get<StudentDocumentsResponse>(
      `/api/students/me/documents`, {}, signal,
    ),

  /** Self-service: read the authenticated student's current visa info +
   *  history. Powers the "missing visa" banner shown to international
   *  students on the overview tab. */
  meVisa: (signal?: AbortSignal) =>
    api.get<{
      is_international: boolean
      needs_visa:       boolean
      is_expired:       boolean
      current: null | {
        id:                 number
        country_of_origin:  string
        entry_date:         string
        visa_issue_date:    string
        visa_expiry_date:   string
        visa_type:          string | null
        notes:              string | null
        visa_document_file_id:        string | null
        visa_document_original_name:  string | null
        visa_document_mime:           string | null
        visa_document_size:           number | null
        created_at:         string
      }
      records: Array<{
        id: number
        country_of_origin: string
        visa_issue_date:   string
        visa_expiry_date:  string
        visa_type:         string | null
        is_current:        0 | 1
        created_at:        string
      }>
    }>(`/api/students/me/visa`, {}, signal),

  /** Self-service: save visa obtained + expiration dates. Creates a new
   *  visa record (any prior record is marked non-current). */
  meAddVisa: (data: {
    country_of_origin: string
    visa_issue_date:   string
    visa_expiry_date:  string
    entry_date?:       string
    visa_type?:        string
    notes?:            string
  }) => api.post<{ id: number }>(`/api/students/me/visa`, data),

  /** Self-service: upload the visa document (PDF/JPG/PNG) and attach it
   *  to the current visa record. */
  meUploadVisaDocument: (file: File) => {
    const form = new FormData()
    form.append('document', file)
    return api.upload<{
      visa_record_id:      number
      file_server_id:      string
      file_original_name:  string
      file_mime:           string
      file_size:           number
    }>(`/api/students/me/visa/document`, form)
  },

  /** Self-service: upload a document (PDF/JPG/PNG/DOC/DOCX) to the student profile,
   *  without requiring an admission application. */
  meUploadDocument: (formData: FormData) => {
    return api.upload<{
      document_id:         string
      file_server_id:      string
      file_original_name:  string
      file_mime:           string
      file_size:           number
    }>(`/api/students/me/documents`, formData)
  },

  /** Self-service: tokenized download URL for the caller's own visa file.
   *  Used by the synthetic Visa row in the Documents tab. */
  meVisaDocumentUrl: () => {
    const token = useAuthStore.getState().token
    const base  = (import.meta.env.VITE_API_URL ?? '') + '/api'
    return `${base}/students/me/visa/document?token=${token}`
  },

  /** Admin equivalent — tokenized download URL for any student's current
   *  visa document file. Requires VIEW_STUDENTS at the server. */
  visaDocumentUrl: (studentId: number | string) => {
    const token = useAuthStore.getState().token
    const base  = (import.meta.env.VITE_API_URL ?? '') + '/api'
    return `${base}/students/${studentId}/visa/document?token=${token}`
  },

  /** Self-service: tokenized download URL for one of the caller's own documents. */
  meDocumentDownloadUrl: (documentId: number | string) => {
    const token = useAuthStore.getState().token
    const base  = (import.meta.env.VITE_API_URL ?? '') + '/api'
    return `${base}/students/me/documents/${documentId}/download?token=${token}`
  },

  /** Self-service: curriculum + marks view for the authenticated student. */
  meProgramModules: (signal?: AbortSignal) =>
    api.get<ProgramModulesResponse>(`/api/students/me/program-modules`, {}, signal),

  create: (data: StudentPayload) =>
    api.post<{ id: number }>('/students', data),

  update: (id: number | string, data: StudentPayload | StudentPatch) =>
    api.put<void>(`/api/students/${id}`, data),

  remove: (id: number | string) =>
    api.delete<void>(`/api/students/${id}`),

  listDocuments: (id: number | string, signal?: AbortSignal) =>
    api.get<StudentDocumentsResponse>(
      `/api/students/${id}/documents`, {}, signal,
    ),

  /** Notify the student (portal notification + email) about outstanding
   *  required documents. Both fields optional: the server lists every
   *  outstanding requirement unless `document_type_ids` narrows it. */
  notifyMissingDocuments: (
    id: number | string,
    body: { message?: string; document_type_ids?: number[] } = {},
  ) =>
    api.post<NotifyMissingDocumentsResult>(
      `/api/students/${id}/missing-documents/notify`, body,
    ),

  /** Notices previously sent to the student, newest first. */
  missingDocumentNotices: (id: number | string, signal?: AbortSignal) =>
    api.get<{ notices: MissingDocumentNotice[] }>(
      `/api/students/${id}/missing-documents/notices`, {}, signal,
    ),

  /** Public token-gated URL for the admission letter PDF. Works for both
   *  the student themselves and admin staff viewing a student's documents,
   *  since the token alone authorizes the download (no JWT required). */
  admissionLetterUrl: (letterToken: string) => {
    const base = (import.meta.env.VITE_API_URL ?? '') + '/api'
    return `${base}/portal/admission-letter?token=${encodeURIComponent(letterToken)}`
  },

  documentDownloadUrl: (id: number | string, documentId: number | string) => {
    const token = useAuthStore.getState().token
    const base  = (import.meta.env.VITE_API_URL ?? '') + '/api'
    return `${base}/students/${id}/documents/${documentId}/download?token=${token}`
  },

  /** Curriculum view: every module in the student's program with their marks. */
  programModules: (id: number | string, signal?: AbortSignal) =>
    api.get<ProgramModulesResponse>(`/api/students/${id}/program-modules`, {}, signal),

  /** Direct CSV download URL for the curriculum + marks view. */
  programModulesExportUrl: (id: number | string) => {
    const token = useAuthStore.getState().token
    const base  = (import.meta.env.VITE_API_URL ?? '') + '/api'
    return `${base}/students/${id}/program-modules/export?token=${token}`
  },

  /** Record an exemption mark for a module the student didn't sit. */
  createExemption: (id: number | string, payload: CreateExemptionPayload) =>
    api.post<{
      id: number | null
      percentage: number
      grade: string
      decision: string
      is_exempted: boolean
      exemption_reason: string | null
    }>(`/api/students/${id}/exemptions`, payload),

  /** Remove a previously-recorded exemption (by its module_marks.id). */
  deleteExemption: (id: number | string, markId: number | string) =>
    api.delete<void>(`/api/students/${id}/exemptions/${markId}`),

  /** Enroll the student into a module — creates / re-activates the registration. */
  enrollModule: (id: number | string, payload: { module_id: number; academic_term_id?: number | null }) =>
    api.post<{
      id: number | null
      module_id: number
      academic_term_id: number
      status: string
    }>(`/api/students/${id}/module-registrations`, payload),

  /** Drop a module registration (by registration id). */
  dropModule: (id: number | string, registrationId: number | string) =>
    api.delete<void>(`/api/students/${id}/module-registrations/${registrationId}`),

  /** Task 1.13 — paginated + filterable international students list. */
  listInternational: (
    params: {
      page?:               number
      per_page?:           number
      q?:                  string
      program?:            string | number
      country?:            string
      expiry_status?:      '' | 'active' | 'expiring' | 'expired' | 'missing'
      has_visa_document?:  '' | 'yes' | 'no'
    } = {},
    signal?: AbortSignal,
  ) => {
    const q: Record<string, string> = {}
    for (const [k, v] of Object.entries(params)) {
      if (v == null || v === '') continue
      q[k] = String(v)
    }
    return api.get<{
      data: Array<{
        id: number; regnumber: string | null; fname: string | null; lname: string | null;
        email: string | null; nationality: string | null;
        std_option: string | null; program_name: string | null
        assigned_registry_user_id: number | null; assigned_registry_name: string | null;
        country_of_origin: string | null; visa_type: string | null;
        entry_date: string | null; visa_issue_date: string | null; visa_expiry_date: string | null;
        days_to_expiry: number | null;
        visa_document_file_id: string | null;
        visa_document_original_name: string | null;
      }>
      page:      number
      per_page:  number
      total:     number
      last_page: number
      summary: {
        total:                 number
        with_visa_document:    number
        without_visa_document: number
        expired:               number
        expiring_this_week:    number
      }
      facets: {
        program: Array<{ value: string | number; label: string }>
        country: Array<{ value: string; label: string }>
      }
      /** Legacy keys kept for backwards-compatibility with older callers. */
      students: any[]
      count:    number
    }>('/students/international', q, signal)
  },

  /** Tokenized download URL for the international-students CSV export.
   *  Mirrors the same filters the list endpoint accepts so the export
   *  always matches what the user has selected on screen. */
  internationalExportUrl: (params: {
    q?:                 string
    program?:           string | number
    country?:           string
    expiry_status?:     string
    has_visa_document?: string
  } = {}) => {
    const token = useAuthStore.getState().token
    const base  = (import.meta.env.VITE_API_URL ?? '') + '/api'
    const search = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v == null || v === '') continue
      search.set(k, String(v))
    }
    if (token) search.set('token', token)
    return `${base}/students/international/export?${search.toString()}`
  },

  listVisaRecords: (id: number | string, signal?: AbortSignal) =>
    api.get<{
      records: Array<{
        id: number; student_id: number; country_of_origin: string;
        entry_date: string; visa_issue_date: string; visa_expiry_date: string;
        visa_type: string | null; notes: string | null; is_current: 0 | 1; created_at: string;
      }>
      current: any | null
    }>(`/api/students/${id}/visa`, {}, signal),

  addVisaRecord: (id: number | string, data: {
    country_of_origin: string
    entry_date: string
    visa_issue_date: string
    visa_expiry_date: string
    visa_type?: string
    notes?: string
  }) => api.post<{ id: number }>(`/api/students/${id}/visa`, data),

  assignRegistryOfficer: (id: number | string, userId: number | null) =>
    api.patch<{ assigned_registry_user_id: number | null }>(
      `/api/students/${id}/assign-registry`,
      { assigned_registry_user_id: userId },
    ),

  /** Direct URL for the student's profile photo.
   *  Legacy photo values (non-UUID paths like "documents/std_photo/photo_xxx.jpg")
   *  are served straight from the old CUR photo store so the browser never routes
   *  through the PHP backend (which cannot reach that server).
   *  UUID values are fetched via the authenticated API endpoint as before. */
  photoUrl: (id: number | string, cacheKey?: string | number) => {
    const photoValue = cacheKey != null ? String(cacheKey) : ''
    if (photoValue && !isPhotoUuid(photoValue)) {
      return legacyPhotoUrl(photoValue)
    }
    const token = useAuthStore.getState().token
    const base  = (import.meta.env.VITE_API_URL ?? '') + '/api'
    const v     = cacheKey != null ? `&v=${encodeURIComponent(photoValue)}` : ''
    return `${base}/students/${id}/photo?token=${token}${v}`
  },

  /** Replace the profile photo. Server expects a multipart form with field `photo`. */
  uploadPhoto: (id: number | string, file: File) => {
    const form = new FormData()
    form.append('photo', file)
    return api.upload<{ photo: string }>(`/api/students/${id}/photo`, form)
  },

  /** Self-service photo URL — same legacy-detection logic as photoUrl(). */
  myPhotoUrl: (cacheKey?: string | number) => {
    const photoValue = cacheKey != null ? String(cacheKey) : ''
    if (photoValue && !isPhotoUuid(photoValue)) {
      return legacyPhotoUrl(photoValue)
    }
    const token = useAuthStore.getState().token
    const base  = (import.meta.env.VITE_API_URL ?? '') + '/api'
    const v     = cacheKey != null ? `&v=${encodeURIComponent(photoValue)}` : ''
    return `${base}/students/me/photo?token=${token}${v}`
  },

  /** Self-service photo upload — students update their own profile picture. */
  uploadMyPhoto: (file: File) => {
    const form = new FormData()
    form.append('photo', file)
    return api.upload<{ photo: string }>(`/api/students/me/photo`, form)
  },

  /** Remove a student's profile photo (requires MANAGE_STUDENTS). */
  deletePhoto: (id: number | string) =>
    api.delete<{ photo: null }>(`/api/students/${id}/photo`),

  /** Self-service removal — a student clearing their own picture. */
  deleteMyPhoto: () =>
    api.delete<{ photo: null }>(`/api/students/me/photo`),
}
