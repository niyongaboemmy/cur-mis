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
  sort_by?:       string
  sort_dir?:      'asc' | 'desc'
}

export interface StudentPayload {
  fname: string
  lname: string
  /** The catalog program (options.id) the student belongs to — required. */
  std_option: string | number
  regnumber?: string
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

  create: (data: StudentPayload) =>
    api.post<{ id: number }>('/api/students', data),

  update: (id: number | string, data: StudentPayload) =>
    api.put<void>(`/api/students/${id}`, data),

  remove: (id: number | string) =>
    api.delete<void>(`/api/students/${id}`),

  listDocuments: (id: number | string, signal?: AbortSignal) =>
    api.get<{ application_id: number | null; documents: ApplicationDocument[] }>(
      `/api/students/${id}/documents`, {}, signal,
    ),

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
}
