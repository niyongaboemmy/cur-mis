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
  /**
   * Set when the stored components cannot be taken at face value:
   * `out_of_scale` for a negative component or a raw total that was never on a
   * /100 basis, `does_not_sum` when CAT + FAT does not reconcile with the
   * recorded total. Note this is NOT "bigger than the column heading" — around
   * 103 modules are legitimately marked on a different weighting (CAT/30 +
   * FAT/70) and reconcile fine. The value is still shown; this only marks it so
   * the board does not read it as verified.
   */
  anomaly:        'out_of_scale' | 'does_not_sum' | null
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

/** One row per mark, flattened for the board's spreadsheet. */
export interface DeliberationExportRow {
  regnumber:        string
  fname:            string | null
  lname:            string | null
  sex:              string | null
  current_level:    string | null
  intake:           string | null
  student_state:    string | null
  declared_program: string | null
  module_code:      string
  module_name:      string
  module_credits:   number | string | null
  module_level:     number | string | null
  department:       string | null
  term_label:       string | null
  cat_marks:        number | string | null
  exam_marks:       number | string | null
  total:            number | string | null
  percentage:       number | string | null
  grade:            string | null
  decision:         string | null
  status:           string | null
  outcome:          'PASS' | 'FAIL'
  created_at:       string | null
}

export interface DeliberationExportResponse {
  rows:      DeliberationExportRow[]
  count:     number
  /** True when the row cap was hit — the file is partial, so say so. */
  truncated: boolean
  cap:       number
  pass_mark: number
}

export type DeliberationOutcome =
  | 'promote'
  | 'repeat_level'
  | 'repeat_modules'
  | 'discontinue'
  | 'defer'

export interface DecisionInput {
  student_regnumber: string
  outcome:           DeliberationOutcome
  level_from?:       number | null
  /** Required for `promote` — the server refuses a promotion without it. */
  level_to?:         number | null
  carry_modules?:    string | null
  reason?:           string | null
}

export interface DeliberationDecision extends DecisionInput {
  id:                    number
  deliberation_id:       number
  student_name:          string | null
  student_current_level: string | null
  decided_by_name:       string | null
  decided_at:            string
  /** Set when finalise wrote the outcome onto the student record. */
  applied_at:            string | null
}

export interface FinalizePreview {
  total_decisions: number
  counts:          Record<DeliberationOutcome, number>
  changes: {
    student_regnumber: string
    student_name:      string
    change:            'level' | 'status'
    from:              string | null
    to:                string
    already_applied:   boolean
  }[]
  /** Decisions naming a regnumber with no student row — these apply to nobody. */
  unknown_students: string[]
}

export interface FinalizeResult {
  promoted:          number
  discontinued:      number
  decisions_applied: number
  unknown_students:  string[]
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

  /** Unpaginated, one row per mark — the same filter the list is showing. */
  exportMarkStudents: (params: MarkStudentsParams = {}, signal?: AbortSignal) =>
    api.get<DeliberationExportResponse>(
      '/api/deliberation/mark-students/export', params as Record<string, unknown>, signal),

  /**
   * Board approval — moves the marks to `confirmed`, which locks them against
   * further edits. Pass `regnumbers` to approve a ticked selection, or omit it
   * to approve everything the current filter covers.
   */
  approveMarks: (payload: MarkStudentsParams & { regnumbers?: string[] }) =>
    api.post<{ approved: number }>('/api/deliberation/approve-marks', payload),

  listSessions: (params: { academic_year_id?: number } = {}, signal?: AbortSignal) =>
    api.get<DeliberationSession[]>('/api/deliberation/sessions', params as Record<string, unknown>, signal),

  createSession: (payload: CreateSessionPayload) =>
    api.post<{ id: number }>('/api/deliberation/sessions', payload),

  updateSession: (id: number, payload: Partial<CreateSessionPayload>) =>
    api.put<null>(`/api/deliberation/sessions/${id}`, payload),

  finalizeSession: (id: number, payload: { std_option?: string } = {}) =>
    api.post<FinalizeResult>(`/api/deliberation/sessions/${id}/finalize`, payload),

  /* ── Per-student outcomes (migration 148) ─────────────────────────────
   * The board's minute: who progresses, who repeats, who leaves. Recorded
   * and revisable while the session is open; applied on finalise. */
  listDecisions: (sessionId: number, signal?: AbortSignal) =>
    api.get<DeliberationDecision[]>(`/api/deliberation/sessions/${sessionId}/decisions`, {}, signal),

  saveDecisions: (sessionId: number, decisions: DecisionInput[]) =>
    api.post<{ saved: number }>(`/api/deliberation/sessions/${sessionId}/decisions`, { decisions }),

  /** Dry run — what finalising would change. Finalisation cannot be undone. */
  previewFinalize: (sessionId: number, signal?: AbortSignal) =>
    api.get<FinalizePreview>(`/api/deliberation/sessions/${sessionId}/decisions/preview`, {}, signal),
}
