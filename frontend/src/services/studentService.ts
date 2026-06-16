import { api } from '@/services/api'
import type { PaginatedResponse } from '@/types'
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
  sort_by?:       string
  sort_dir?:      'asc' | 'desc'
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

/* ── CSV export modal ────────────────────────────────────────── */

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

export interface StudentDocumentsResponse {
  application_id:   number | null
  documents:        ApplicationDocument[]
  admission_offer:  AdmissionOfferSummary | null
}

export const studentService = {
  list: (
    params: StudentListParams = {},
    signal?: AbortSignal,
  ) => {
    // Inject the global topbar campus scope. The students endpoint uses
    // the legacy `campus` parameter (varchar id), so we mirror onto that
    // key when the caller hasn't already pinned one.
    const scopeId = useCampusFilterStore.getState().selectedCampusId
    const category = useCategoryFilterStore.getState().selectedCategory
    const merged: Record<string, unknown> = { ...(params as Record<string, unknown>) }
    if (scopeId != null && (merged.campus == null || merged.campus === '')) {
      merged.campus = String(scopeId)
    }
    if (category != null && (merged.category == null || merged.category === '')) {
      merged.category = category
    }
    return api.get<PaginatedResponse<Student>>('/api/students', merged, signal)
  },

  stats: (params: { acc_year?: string; campus?: string | number; category?: string } = {}, signal?: AbortSignal) => {
    // Mirror the topbar campus + category scope onto the stats endpoint so
    // the dashboard cards / charts always reflect just the user's chosen scope.
    const scopeId = useCampusFilterStore.getState().selectedCampusId
    const category = useCategoryFilterStore.getState().selectedCategory
    const merged: Record<string, unknown> = { ...(params as Record<string, unknown>) }
    if (scopeId != null && (merged.campus == null || merged.campus === '')) {
      merged.campus = String(scopeId)
    }
    if (category != null && (merged.category == null || merged.category === '')) {
      merged.category = category
    }
    return api.get<StudentStats>('/api/students/stats', merged, signal)
  },

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
    const base  = import.meta.env.VITE_API_URL ?? ''
    return `${base}/api/students/bulk-upload-template?token=${token}`
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
    api.get<{ groups: ExportColumnGroup[] }>('/api/students/export-columns'),

  /** Fetch every export template visible to the caller — system
   *  templates first, then their own saved ones. */
  listExportTemplates: () =>
    api.get<{ templates: ExportTemplate[] }>('/api/students/export-templates'),

  /** Save a new export template (or update an existing one matching the
   *  user + name pair) using the given ordered column list. */
  saveExportTemplate: (name: string, columns: string[]) =>
    api.post<{ id: number; name: string; columns: string[] }>(
      '/api/students/export-templates',
      { name, columns },
    ),

  /** Delete a user-owned export template. System templates are 403. */
  deleteExportTemplate: (id: number | string) =>
    api.delete<void>(`/api/students/export-templates/${id}`),

  /** Build a token-bearing CSV download URL. The browser navigates to
   *  it directly (`window.location.href = url`) so the response is
   *  saved as a file — much simpler than streaming an Axios blob.
   *
   *  Pass either `template_id` (id from listExportTemplates) or an
   *  array of column keys; the backend prefers `template_id` when both
   *  are present.
   *
   *  All current list filters (q, gender, faculty, department, campus,
   *  category, …) are forwarded so the export matches what the user
   *  sees on the table. */
  exportCsvUrl: (params: {
    template_id?: string | number
    columns?:     string[]
    filters?:     Record<string, string | number | undefined>
  }) => {
    const token = useAuthStore.getState().token
    const base  = import.meta.env.VITE_API_URL ?? ''
    const search = new URLSearchParams()
    if (params.template_id != null && params.template_id !== '') {
      search.set('template_id', String(params.template_id))
    }
    if (params.columns && params.columns.length > 0) {
      search.set('columns', params.columns.join(','))
    }
    // Mirror the same global scopes the list endpoint reads — campus
    // from the topbar pill and category from the topbar category
    // switcher. The caller already passes paginated filters through
    // `filters`; we only fill these when not already set so a
    // power-user override (e.g. a hard-pinned filter) still wins.
    const scopeCampus   = useCampusFilterStore.getState().selectedCampusId
    const scopeCategory = useCategoryFilterStore.getState().selectedCategory
    const filters = { ...(params.filters ?? {}) }
    if (scopeCampus != null && (filters.campus == null || filters.campus === '')) {
      filters.campus = String(scopeCampus)
    }
    if (scopeCategory != null && (filters.category == null || filters.category === '')) {
      filters.category = scopeCategory
    }
    for (const [k, v] of Object.entries(filters)) {
      if (v == null || v === '') continue
      search.set(k, String(v))
    }
    if (token) search.set('token', token)
    return `${base}/api/students/export?${search.toString()}`
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

  /** Self-service: tokenized download URL for the caller's own visa file.
   *  Used by the synthetic Visa row in the Documents tab. */
  meVisaDocumentUrl: () => {
    const token = useAuthStore.getState().token
    const base  = import.meta.env.VITE_API_URL ?? ''
    return `${base}/api/students/me/visa/document?token=${token}`
  },

  /** Admin equivalent — tokenized download URL for any student's current
   *  visa document file. Requires VIEW_STUDENTS at the server. */
  visaDocumentUrl: (studentId: number | string) => {
    const token = useAuthStore.getState().token
    const base  = import.meta.env.VITE_API_URL ?? ''
    return `${base}/api/students/${studentId}/visa/document?token=${token}`
  },

  /** Self-service: tokenized download URL for one of the caller's own documents. */
  meDocumentDownloadUrl: (documentId: number | string) => {
    const token = useAuthStore.getState().token
    const base  = import.meta.env.VITE_API_URL ?? ''
    return `${base}/api/students/me/documents/${documentId}/download?token=${token}`
  },

  /** Self-service: curriculum + marks view for the authenticated student. */
  meProgramModules: (signal?: AbortSignal) =>
    api.get<ProgramModulesResponse>(`/api/students/me/program-modules`, {}, signal),

  create: (data: StudentPayload) =>
    api.post<{ id: number }>('/api/students', data),

  update: (id: number | string, data: StudentPayload | StudentPatch) =>
    api.put<void>(`/api/students/${id}`, data),

  remove: (id: number | string) =>
    api.delete<void>(`/api/students/${id}`),

  listDocuments: (id: number | string, signal?: AbortSignal) =>
    api.get<StudentDocumentsResponse>(
      `/api/students/${id}/documents`, {}, signal,
    ),

  /** Public token-gated URL for the admission letter PDF. Works for both
   *  the student themselves and admin staff viewing a student's documents,
   *  since the token alone authorizes the download (no JWT required). */
  admissionLetterUrl: (letterToken: string) => {
    const base = import.meta.env.VITE_API_URL ?? ''
    return `${base}/api/portal/admission-letter?token=${encodeURIComponent(letterToken)}`
  },

  documentDownloadUrl: (id: number | string, documentId: number | string) => {
    const token = useAuthStore.getState().token
    const base  = import.meta.env.VITE_API_URL ?? ''
    return `${base}/api/students/${id}/documents/${documentId}/download?token=${token}`
  },

  /** Curriculum view: every module in the student's program with their marks. */
  programModules: (id: number | string, signal?: AbortSignal) =>
    api.get<ProgramModulesResponse>(`/api/students/${id}/program-modules`, {}, signal),

  /** Direct CSV download URL for the curriculum + marks view. */
  programModulesExportUrl: (id: number | string) => {
    const token = useAuthStore.getState().token
    const base  = import.meta.env.VITE_API_URL ?? ''
    return `${base}/api/students/${id}/program-modules/export?token=${token}`
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
    }>('/api/students/international', q, signal)
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
    const base  = import.meta.env.VITE_API_URL ?? ''
    const search = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v == null || v === '') continue
      search.set(k, String(v))
    }
    if (token) search.set('token', token)
    return `${base}/api/students/international/export?${search.toString()}`
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
    const base  = import.meta.env.VITE_API_URL ?? ''
    const v     = cacheKey != null ? `&v=${encodeURIComponent(photoValue)}` : ''
    return `${base}/api/students/${id}/photo?token=${token}${v}`
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
    const base  = import.meta.env.VITE_API_URL ?? ''
    const v     = cacheKey != null ? `&v=${encodeURIComponent(photoValue)}` : ''
    return `${base}/api/students/me/photo?token=${token}${v}`
  },

  /** Self-service photo upload — students update their own profile picture. */
  uploadMyPhoto: (file: File) => {
    const form = new FormData()
    form.append('photo', file)
    return api.upload<{ photo: string }>(`/api/students/me/photo`, form)
  },
}
