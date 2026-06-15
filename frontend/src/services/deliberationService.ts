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

/* ── Marks-centric view: students that have marks, mapped to
   module → program → department ─────────────────────────────────────────── */

export interface MarkDepartment {
  dep_id:      number
  dep_name:    string
  dep_acronym: string | null
  students:    number | string
  modules:     number | string
  marks:       number | string
}

export interface MarkProgram {
  id:            number
  name:          string
  acro:          string | null
  department_id: number
  modules:       number | string
}

export interface MarkFiltersResponse {
  departments: MarkDepartment[]
  programs:    MarkProgram[]
  pass_mark:   number
  totals:      { marks: number; students: number; modules: number }
}

export interface MarkStudentRow {
  regnumber:             string
  student_id:            number | null
  fname:                 string | null
  lname:                 string | null
  sex:                   string | null
  current_level:         string | null
  intake:                string | null
  std_option:            string | null
  student_state:         string | null
  declared_program:      string | null
  declared_program_acro: string | null
  modules_count:         number | string
  marks_count:           number | string
  avg_pct:               number | string | null
  passed:                number | string
  failed:                number | string
  departments:           string | null
}

export interface MarkStudentsResponse {
  students:   MarkStudentRow[]
  pass_mark:  number
  pagination: DeliberationPagination
}

export interface StudentMarkRow {
  id:             number
  module_id:      number
  module_code:    string
  module_name:    string
  module_credits: number | string | null
  level:          number | string | null
  dep_id:         number | null
  dep_name:       string | null
  cat_marks:      number | string | null
  exam_marks:     number | string | null
  total:          number | string | null
  percentage:     number | string | null
  grade:          string | null
  decision:       string | null
  status:         string | null
  term_id:        number | null
  term_label:     string | null
  programs:       string | null
}

export interface StudentMarksResponse {
  student: {
    id?:                    number
    regnumber:              string
    fname?:                 string | null
    lname?:                 string | null
    sex?:                   string | null
    current_level?:         string | null
    intake?:                string | null
    std_option?:            string | null
    student_state?:         string | null
    declared_program?:      string | null
    declared_program_acro?: string | null
  }
  marks:     StudentMarkRow[]
  pass_mark: number
  summary:   { modules: number; passed: number; failed: number; avg_pct: number | null }
}

export interface MarkStudentsParams {
  department_id?: number
  option_id?:     number
  current_level?: string | number
  q?:             string
  page?:          number
  per_page?:      number
}

export const deliberationService = {
  grid: (params: DeliberationParams = {}, signal?: AbortSignal) =>
    api.get<DeliberationResponse>('/api/deliberation', params as Record<string, unknown>, signal),

  markFilters: (signal?: AbortSignal) =>
    api.get<MarkFiltersResponse>('/api/deliberation/mark-filters', {}, signal),

  markStudents: (params: MarkStudentsParams = {}, signal?: AbortSignal) =>
    api.get<MarkStudentsResponse>('/api/deliberation/mark-students', params as Record<string, unknown>, signal),

  studentMarks: (regnumber: string, signal?: AbortSignal) =>
    api.get<StudentMarksResponse>('/api/deliberation/student-marks', { regnumber }, signal),

  listSessions: (params: { academic_year_id?: number } = {}, signal?: AbortSignal) =>
    api.get<DeliberationSession[]>('/api/deliberation/sessions', params as Record<string, unknown>, signal),

  createSession: (payload: CreateSessionPayload) =>
    api.post<{ id: number }>('/api/deliberation/sessions', payload),

  updateSession: (id: number, payload: Partial<CreateSessionPayload>) =>
    api.put<null>(`/api/deliberation/sessions/${id}`, payload),

  finalizeSession: (id: number, payload: { std_option?: string } = {}) =>
    api.post<null>(`/api/deliberation/sessions/${id}/finalize`, payload),
}
