import { api } from '@/services/api'
import type { PaginatedResponse } from '@/types'
import type { Student } from '@/types/academic'
import type { ApplicationDocument } from '@/types/admission'
import { useAuthStore } from '@/store/authStore'

export interface FacetOption {
  value: string
  label: string
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
  faculty: string | number
  regnumber?: string
  phone?: string | null
  email?: string | null
  gender?: string | null
  birthdate?: string | null
  nationality?: string | null
  program?: string | null
  department?: string | null
  current_level?: string | null
  registration_date?: string | null
  student_state?: string | null
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
}
