import { api } from '@/services/api'

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused'
export type SessionType      = 'lecture' | 'lab' | 'tutorial' | 'seminar' | 'exam'
export type SessionState     = 'open' | 'closed'

export interface AttendanceSession {
  id:                 number
  module_id:          number
  module_schedule_id: number | null
  academic_term_id:   number
  session_date:       string
  session_type:       SessionType
  status:             SessionState
  is_locked:          0 | 1
  notes:              string | null
  started_by:         number | null
  created_at:         string
  updated_at:         string

  module_code?:       string
  module_name?:       string
  term_label?:        string
  started_by_name?:   string
  recorded_count?:    number | string
  present_count?:     number | string
}

export interface TeachableModule {
  module_id:           number
  module_code:         string
  module_name:         string
  level:               number
  academic_term_id?:   number
  academic_year_id?:   number
  teacher_first_name?: string | null
  teacher_last_name?:  string | null
}

export interface RosterRow {
  student_id:       number
  regnumber:        string
  fname:            string
  lname:            string
  email:            string | null
  record_status:    AttendanceStatus | null
  remarks:          string | null
  recorded_at:      string | null
  total_sessions:   number | string
  present_sessions: number | string
  attendance_pct:   number
}

export interface SessionDetail {
  session: AttendanceSession
  roster:  RosterRow[]
  summary: {
    total_roster: number
    present:      number
    absent:       number
    late:         number
    excused:      number
    unmarked:     number
  }
}

export interface OverviewPayload {
  totals: {
    sessions:        number
    modules:         number
    records:         number
    present:         number
    absent:          number
    late:            number
    excused:         number
    attendance_pct:  number
  }
  by_module: Array<{
    module_id:        number
    module_code:      string
    module_name:      string
    sessions:         number | string
    records:          number | string
    present_like:     number | string
    attendance_pct:   number
  }>
  recent_sessions: Array<{
    id:              number
    session_date:    string
    session_type:    SessionType
    status:          SessionState
    module_code:     string
    module_name:     string
    recorded_count:  number | string
    present_like:    number | string
    attendance_pct:  number
  }>
  at_risk: Array<{
    regnumber:       string
    fname:           string
    lname:           string
    total_records:   number | string
    present_like:    number | string
    attendance_pct:  number
  }>
}

/** Status returned by the per-student summary; `not_recorded` marks a
 * session that exists in a registered module but was never marked for
 * the student (so the full class timeline still surfaces). */
export type StudentAttendanceStatus = AttendanceStatus | 'not_recorded'

export interface StudentAttendanceSummary {
  totals: {
    sessions:       number
    records:        number
    present:        number
    late:           number
    absent:         number
    excused:        number
    not_recorded:   number
    attendance_pct: number
  }
  by_module: Array<{
    module_id:           number
    module_code:         string
    module_name:         string
    academic_term_id:    number
    registration_status: 'registered' | 'completed' | 'dropped' | 'failed'
    sessions:            number | string
    records:             number | string
    present:             number | string
    late:                number | string
    absent:              number | string
    excused:             number | string
    present_like:        number | string
    not_recorded:        number | string
    attendance_pct:      number
  }>
  recent: Array<{
    status:       StudentAttendanceStatus
    remarks:      string | null
    recorded_at:  string | null
    session_id:   number
    session_date: string
    session_type: SessionType
    module_id:    number
    module_code:  string
    module_name:  string
  }>
}

export interface SessionListParams {
  module_id?:        number | string
  academic_term_id?: number | string
  date_from?:        string
  date_to?:          string
  mine?:             0 | 1
  page?:             number
  per_page?:         number
}

export interface SessionListResponse {
  data:       AttendanceSession[]
  total:      number
  page:       number
  per_page:   number
  last_page:  number
}

export interface CreateSessionPayload {
  module_id:           number
  academic_term_id:    number
  session_date:        string
  session_type?:       SessionType
  module_schedule_id?: number | null
  notes?:              string | null
}

export interface SaveRecordsPayload {
  records: Array<{
    student_regnumber: string
    status:            AttendanceStatus
    remarks?:          string | null
  }>
}

export interface ScheduledBlock {
  block_id:        number
  module_id:       number
  option_id:       number | null
  module_code:     string
  module_name:     string
  level:           number | null
  program_name:    string | null
  program_code:    string | null
  program_acro:    string | null
  start_date:      string | null
  end_date:        string | null
  semesters:       string | null
  academic_year:   string | null
  day_of_week:     number | null
  day_pattern:     string | null
  start_time:      string | null
  end_time:        string | null
  activity:        string | null
  mode:            string | null
  year_of_study:   number | null
  campus_id:       number | null
  instructor_id:   number | null
  instructor_name: string | null
}

export interface ScheduledBlocksResponse {
  rows:  ScheduledBlock[]
  count: number
}

export const attendanceService = {
  overview: (params: {
    academic_term_id?: number | string
    module_id?:        number | string
    date_from?:        string
    date_to?:          string
    mine?:             0 | 1
  } = {}) => api.get<OverviewPayload>('/attendance/overview', params as Record<string, unknown>),

  teachableModules: (params: { academic_term_id?: number | string } = {}) =>
    api.get<TeachableModule[]>('/attendance/teachable-modules', params as Record<string, unknown>),

  /** Flat list of every module_offerings block — same data the Module
   *  scheduling page shows, but unfiltered so the attendance landing
   *  table can list every scheduled session at once. */
  scheduledBlocks: (params: { program_id?: number | string; mode?: string } = {}) =>
    api.get<ScheduledBlocksResponse>(
      '/attendance/scheduled-blocks',
      params as Record<string, unknown>,
    ),

  listSessions: (params: SessionListParams = {}) =>
    api.get<SessionListResponse>('/attendance/sessions', params as Record<string, unknown>),

  /** Look up an existing session without creating one. */
  findSession: (params: { module_id: number; session_date: string; session_type?: SessionType }) =>
    api.get<{ session: AttendanceSession | null }>(
      '/attendance/sessions/find',
      params as Record<string, unknown>,
    ),

  showSession: (id: number | string) =>
    api.get<SessionDetail>(`/api/attendance/sessions/${id}`),

  createSession: (payload: CreateSessionPayload) =>
    api.post<{ id: number }>('/attendance/sessions', payload),

  saveRecords: (id: number | string, payload: SaveRecordsPayload) =>
    api.put<{ saved: number }>(`/api/attendance/sessions/${id}/records`, payload),

  reopenSession: (id: number | string) =>
    api.post<{ id: number; status: SessionState }>(`/api/attendance/sessions/${id}/reopen`, {}),

  toggleLock: (id: number | string, locked: boolean) =>
    api.post<{ id: number; is_locked: 0 | 1 }>(`/api/attendance/sessions/${id}/lock`, { locked }),

  deleteSession: (id: number | string) =>
    api.delete<void>(`/api/attendance/sessions/${id}`),

  studentSummary: (regnumber: string, params: { academic_term_id?: number | string; limit?: number } = {}) =>
    api.get<StudentAttendanceSummary>(`/api/attendance/students/${regnumber}/summary`, params as Record<string, unknown>),

  /** id-based variant — use when the regnumber may contain slashes (e.g.
   *  "STD/2026/22699") that would break the path-based route matcher. */
  studentSummaryById: (studentId: number | string, params: { academic_term_id?: number | string; limit?: number } = {}) =>
    api.get<StudentAttendanceSummary>(
      `/api/attendance/students/by-id/${studentId}/summary`,
      params as Record<string, unknown>,
    ),

  /** Self-service: the authenticated student's own attendance summary.
   *  Does not require VIEW_ATTENDANCE — the backend resolves the student
   *  record from the auth user so the caller can only see their own data. */
  meSummary: (params: { academic_term_id?: number | string; limit?: number } = {}) =>
    api.get<StudentAttendanceSummary>(
      `/api/attendance/me/summary`,
      params as Record<string, unknown>,
    ),
}
