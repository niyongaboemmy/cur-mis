import { api } from '@/services/api'

export interface DeliberationModule {
  module_id:      number
  module_code:    string
  module_name:    string
  module_credits: number | string | null
  level:          number | string | null
}

export interface DeliberationCell {
  cats_60:        number | null
  fat_40:         number | null
  total_100:      number | null
  credits_points: number | null
  grade:          string | null
  decision:       string | null
  is_exempted:    boolean
}

export interface DeliberationStudent {
  student_id:       number
  regnumber:        string
  fname:            string
  lname:            string
  sex:              string | null
  intake:           string | null
  current_level:    string | null
  std_option:       string | null
  student_program:  string | null
  program_name:     string | null
  program_acronym:  string | null
  marks:            Record<number, DeliberationCell>
}

export interface DeliberationPagination {
  page:      number
  per_page:  number
  total:     number
  last_page: number
}

export interface DeliberationResponse {
  modules:       DeliberationModule[]
  students:      DeliberationStudent[]
  academic_year: { id: number; label: string } | null
  counts:        { students: number; modules: number }
  pagination:    DeliberationPagination
}

export interface DeliberationParams {
  std_option?:       string | number
  current_level?:    string | number
  intake?:           string
  academic_year_id?: number
  page?:             number
  per_page?:         number
}

export interface DeliberationSession {
  id:             number
  academic_year_id: number
  semester:       number
  program_id:     number | null
  convened_at:    string | null
  notes:          string | null
  finalized:      boolean
  created_by:     number | null
  created_at:     string
  year_label:     string | null
  program_name:   string | null
  program_acronym:string | null
  created_by_name:string | null
}

export interface CreateSessionPayload {
  academic_year_id: number
  semester:         number
  program_id?:      number
  convened_at?:     string
  notes?:           string
}

export const deliberationService = {
  grid: (params: DeliberationParams = {}, signal?: AbortSignal) =>
    api.get<DeliberationResponse>('/api/deliberation', params as Record<string, unknown>, signal),

  listSessions: (params: { academic_year_id?: number } = {}, signal?: AbortSignal) =>
    api.get<DeliberationSession[]>('/api/deliberation/sessions', params as Record<string, unknown>, signal),

  createSession: (payload: CreateSessionPayload) =>
    api.post<{ id: number }>('/api/deliberation/sessions', payload),

  updateSession: (id: number, payload: Partial<CreateSessionPayload>) =>
    api.put<null>(`/api/deliberation/sessions/${id}`, payload),

  finalizeSession: (id: number, payload: { std_option?: string } = {}) =>
    api.post<null>(`/api/deliberation/sessions/${id}/finalize`, payload),
}
