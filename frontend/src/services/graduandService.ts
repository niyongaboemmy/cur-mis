import { api } from '@/services/api'

export type GraduandStatus  = 'pending' | 'approved' | 'graduated' | 'deferred'
export type DegreeClass     = 'First Class' | 'Upper Second' | 'Lower Second' | 'Pass' | 'Distinction'

export interface EligibilityRow {
  id:                  number
  regnumber:           string
  fname:               string
  lname:               string
  current_level:       string | null
  std_option:          string | null
  fac_name:            string | null
  dep_name:            string | null
  option_acronym:      string | null
  option_title:        string | null
  eligible:            boolean
  weighted_avg:        number | null
  total_credits:       number
  total_credit_points: number
  degree_class:        DegreeClass | null
  passed:              number
  failed:              number
  modules:             number
}

export interface EligibilityListResponse {
  data:      EligibilityRow[]
  total:     number
  page:      number
  per_page:  number
  last_page: number
}

export interface GraduandRow {
  id:               number
  student_id:       number
  academic_year_id: number | null
  graduation_date:  string | null
  degree_class:     DegreeClass | null
  cgpa:             number | null
  total_credits:    number | null
  ceremony_number:  string | null
  status:           GraduandStatus
  approved_by:      number | null
  approved_at:      string | null
  created_at:       string
  regnumber:        string
  fname:            string
  lname:            string
  year_label:       string | null
  approved_by_name: string | null
}

export interface GraduandListResponse {
  data:      GraduandRow[]
  total:     number
  page:      number
  per_page:  number
  last_page: number
}

export const graduandService = {
  eligibilityList: (
    params: { academic_year_id?: number; std_option?: string | number; current_level?: number; page?: number; per_page?: number } = {},
    signal?: AbortSignal,
  ) =>
    api.get<EligibilityListResponse>('/api/graduands/eligibility', params as Record<string, unknown>, signal),

  list: (
    params: { status?: GraduandStatus; academic_year_id?: number; page?: number; per_page?: number } = {},
    signal?: AbortSignal,
  ) =>
    api.get<GraduandListResponse>('/api/graduands', params as Record<string, unknown>, signal),

  add: (payload: { student_id: number; academic_year_id?: number; degree_class?: DegreeClass }) =>
    api.post<{ id: number }>('/api/graduands', payload),

  approve: (id: number) =>
    api.put<null>(`/api/graduands/${id}/approve`, {}),

  graduate: (id: number, payload: { graduation_date?: string; ceremony_number?: string }) =>
    api.put<null>(`/api/graduands/${id}/graduate`, payload),

  defer: (id: number) =>
    api.put<null>(`/api/graduands/${id}/defer`, {}),

  delete: (id: number) =>
    api.delete<null>(`/api/graduands/${id}`),
}
