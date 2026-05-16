import { api } from '@/services/api'
import type { PaginatedResponse } from '@/types'
import type { Student } from '@/types/academic'
import type { ApplicationDocument } from '@/types/admission'
import { useAuthStore } from '@/store/authStore'

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
    by_faculty:    BreakdownRow[]
    by_department: BreakdownRow[]
    by_level:      BreakdownRow[]
    by_program:    BreakdownRow[]
    by_campus:     BreakdownRow[]
    by_intake:     BreakdownRow[]
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
  /** Campus filter — matches student.campus (campuses.id stored as varchar). */
  campus?:        string | number
  /** Intake name (free-text on student.intake). */
  intake?:        string
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
  ) => api.get<PaginatedResponse<Student>>('/api/students', params as Record<string, unknown>, signal),

  stats: (params: { acc_year?: string } = {}, signal?: AbortSignal) =>
    api.get<StudentStats>('/api/students/stats', params as Record<string, unknown>, signal),

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

  /** Task 1.13 — international student visa tracking. */
  listInternational: (signal?: AbortSignal) =>
    api.get<{
      students: Array<{
        id: number; regnumber: string | null; fname: string | null; lname: string | null;
        email: string | null; nationality: string | null;
        assigned_registry_user_id: number | null; assigned_registry_name: string | null;
        country_of_origin: string | null; visa_type: string | null;
        entry_date: string | null; visa_issue_date: string | null; visa_expiry_date: string | null;
        days_to_expiry: number | null;
      }>
      count: number
    }>('/api/students/international', {}, signal),

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

  /** Direct, token-bearing URL for the student's profile photo. The cache-buster
   *  is what the page passes after a re-upload to force the <img> to refetch. */
  photoUrl: (id: number | string, cacheKey?: string | number) => {
    const token = useAuthStore.getState().token
    const base  = import.meta.env.VITE_API_URL ?? ''
    const v     = cacheKey != null ? `&v=${encodeURIComponent(String(cacheKey))}` : ''
    return `${base}/api/students/${id}/photo?token=${token}${v}`
  },

  /** Replace the profile photo. Server expects a multipart form with field `photo`. */
  uploadPhoto: (id: number | string, file: File) => {
    const form = new FormData()
    form.append('photo', file)
    return api.upload<{ photo: string }>(`/api/students/${id}/photo`, form)
  },

  /** Self-service photo URL — fetches the authenticated student's own photo
   *  without requiring VIEW_STUDENTS. */
  myPhotoUrl: (cacheKey?: string | number) => {
    const token = useAuthStore.getState().token
    const base  = import.meta.env.VITE_API_URL ?? ''
    const v     = cacheKey != null ? `&v=${encodeURIComponent(String(cacheKey))}` : ''
    return `${base}/api/students/me/photo?token=${token}${v}`
  },

  /** Self-service photo upload — students update their own profile picture. */
  uploadMyPhoto: (file: File) => {
    const form = new FormData()
    form.append('photo', file)
    return api.upload<{ photo: string }>(`/api/students/me/photo`, form)
  },
}
