import { api } from '@/services/api'

/**
 * Teacher (lecturer) self-service portal.
 *
 * Every endpoint behind /api/teacher/* is scoped server-side to the logged-in
 * lecturer's own module assignments (App\Helpers\LecturerScope), so nothing here
 * needs — or is able to — pass a staff/lecturer id. Asking for another
 * lecturer's course returns 403.
 */

export type ExamAttendanceStatus = 'present' | 'absent' | 'excused' | 'malpractice'

export interface TeacherScheduleBlock {
  /** 1 = Monday … 7 = Sunday. Null when the source row left it blank. */
  day_of_week:  number | null
  start_time:   string | null
  end_time:     string | null
  start_date:   string | null
  end_date:     string | null
  session_type: string
  room:         string | null
  building:     string | null
  /** Which timetable table it came from — `offering` rows carry no room. */
  source:       'schedule' | 'offering'
}

/** Where a module sits in its own teaching window, derived from its dates. */
export type CourseStatus = 'ongoing' | 'upcoming' | 'completed' | 'unscheduled'

export interface TeacherCourse {
  status:              CourseStatus
  /** Timetable blocks for this module in the current term. */
  schedules:           TeacherScheduleBlock[]
  is_scheduled:        boolean
  /** Earliest start / latest end across all blocks. */
  start_date:          string | null
  end_date:            string | null
  /** Comma-joined distinct room names across the blocks. */
  rooms:               string
  assignment_id:       number
  module_id:           number
  module_code:         string
  module_name:         string
  module_credits:      number | null
  level:               number | null
  /** Resolved `levels.name` — displayed instead of the raw `levels.id`. */
  level_name:          string | null
  department_id:       number | null
  role:                'primary' | 'assistant'
  hours_per_week:      number | null
  term_id:             number
  term_label:          string | null
  students:            number
  marks_status:        string | null
  marks_scored:        number
  attendance_sessions: number
  /** null when no attendance has been recorded yet. */
  attendance_rate:     number | null
}

export interface TeacherClassStudent {
  regnumber:       string
  full_name:       string
  gender:          string | null
  email:           string | null
  phone:           string | null
  photo:           string | null
  level:           number | null
  level_name:      string | null
  student_state:   string | null
  total:           number | null
  percentage:      number | null
  grade:           string | null
  decision:        string | null
  marks_status:    string | null
  attendance_rate: number | null
}

/** Marks for this module sitting in a term other than the one on screen. */
export interface RemovalImpactTerm {
  term_id:    number | null
  term_label: string | null
  marks:      number
  /** At least one of them is submitted or confirmed — i.e. a real result. */
  locked:     boolean
  grade:      string | null
}

export interface RemovalImpact {
  regnumber:  string
  full_name:  string
  term_id:    number | null
  registered: boolean
  registration_status: string | null
  marks:               number
  attendance_records:  number
  exam_attendance:     number
  revaluations:        number
  /** Everything above added up, including the registration row itself. */
  total:               number
  other_terms:         RemovalImpactTerm[]
  other_terms_marks:   number
  /** Only a superadmin may delete records; everyone else can only drop. */
  can_purge:           boolean
}

export interface UnenrolResult {
  purged:              boolean
  dropped?:            number
  registrations?:      number
  marks?:              number
  attendance_records?: number
  exam_attendance?:    number
  revaluations?:       number
}

export interface CourseAttendance {
  sessions: Array<{
    id:           number
    session_date: string
    session_type: string
    status:       'open' | 'closed'
    is_locked:    boolean
    recorded:     number
    present:      number
    absent:       number
    late:         number
    excused:      number
  }>
  students: Array<{
    regnumber: string
    full_name: string
    marked:    number
    present:   number
    absent:    number
    late:      number
    excused:   number
    /** present+late over marked; null when nothing recorded for them yet. */
    rate:      number | null
  }>
}

export interface TeacherStudent {
  regnumber:    string
  full_name:    string
  gender:       string | null
  email:        string | null
  phone:        string | null
  photo:        string | null
  level:        number | null
  level_name:   string | null
  modules:      number
  module_codes: string
}

export interface TeacherSummary {
  term_id: number | null
  stats: {
    courses:         number
    students:        number
    sessions_held:   number
    attendance_rate: number | null
    marks_pending:   number
    upcoming_exams:  number
    pending_leave:   number
  }
  today_classes: Array<{
    module_id:    number
    module_code:  string
    module_name:  string
    start_time:   string
    end_time:     string
    session_type: string
    room:         string | null
  }>
  upcoming_exams: Array<{
    id:          number
    module_id:   number
    module_code: string
    module_name: string
    component:   string
    exam_date:   string
    start_time:  string | null
    end_time:    string | null
    room:        string | null
  }>
  marks_progress: Array<{
    module_id:   number
    module_code: string
    module_name: string
    enrolled:    number
    unmarked:    number
  }>
  latest_payslip: {
    period_year:  number
    period_month: number
    net_pay:      number
    gross_pay:    number | null
  } | null
}

export interface TeacherCalendar {
  from:    string
  to:      string
  term_id: number | null
  /** Recurring weekly rules — the UI expands them across the date range. */
  classes: Array<{
    id:           number
    module_id:    number
    module_code:  string
    module_name:  string
    day_of_week:  number
    start_time:   string
    end_time:     string
    session_type: string
    start_date:   string | null
    end_date:     string | null
    room:         string | null
    building:     string | null
  }>
  exams: Array<{
    id:             number
    module_id:      number
    module_code:    string
    module_name:    string
    component:      string
    exam_date:      string
    start_time:     string | null
    end_time:       string | null
    room:           string | null
    building:       string | null
    capacity:       number | null
    is_invigilator: boolean
  }>
  leave: Array<{
    id:         number
    start_date: string
    end_date:   string
    status:     string
    days:       number | null
    leave_type: string | null
  }>
}

export interface TeacherExam {
  id:             number
  module_id:      number
  module_code:    string
  module_name:    string
  component:      string
  exam_date:      string
  start_time:     string | null
  end_time:       string | null
  room:           string | null
  building:       string | null
  capacity:       number | null
  is_invigilator: boolean
  marked:         number
  present:        number
  absent:         number
}

export interface ExamAttendanceSheet {
  exam: {
    id:              number
    module_id:       number
    module_code:     string
    module_name:     string
    component:       string
    exam_date:       string
    start_time:      string | null
    end_time:        string | null
    term_id:         number | null
    room_id:         number | null
    room:            string | null
    building:        string | null
    capacity:        number | null
    instructor_name: string | null
    is_invigilator:  boolean
  }
  students: Array<{
    regnumber:     string
    full_name:     string
    gender:        string | null
    photo:         string | null
    level:         number | null
    level_name:    string | null
    status:        ExamAttendanceStatus | null
    seat_no:       string | null
    signed_in_at:  string | null
    signed_out_at: string | null
    remarks:       string | null
  }>
}

export interface ExamAttendanceInput {
  regnumber: string
  status:    ExamAttendanceStatus
  seat_no?:  string | null
  remarks?:  string | null
}

export const teacherService = {
  summary: (termId?: number, signal?: AbortSignal) =>
    api.get<TeacherSummary>('/api/teacher/summary', termId ? { term_id: termId } : undefined, signal),

  /**
   * Assigned modules. Only SCHEDULED modules are returned unless
   * `includeUnscheduled` is set — an assignment with no timetable block has no
   * room, no dates and nothing to take attendance against.
   *
   * `termId: 'all'` spans every term, which is what the courses page uses so a
   * lecturer can reach finished and future modules. The server also accepts
   * `status` and `q`; the page filters client-side instead, so switching tabs
   * is instant and the per-tab counts come for free.
   */
  courses: (
    termId?: number | 'all',
    includeUnscheduled = false,
    signal?: AbortSignal,
  ) =>
    api.get<TeacherCourse[]>(
      '/api/teacher/courses',
      {
        ...(termId ? { term_id: termId } : {}),
        ...(includeUnscheduled ? { scheduled: 0 } : {}),
      },
      signal,
    ),

  /** One course, same shape as a list row — lets the detail page deep-link. */
  courseDetail: (moduleId: number, signal?: AbortSignal) =>
    api.get<TeacherCourse>(`/api/teacher/courses/${moduleId}`, undefined, signal),

  /**
   * Enrol students onto one of my courses.
   *
   * The admin route (POST /api/modules/registrations) needs
   * MANAGE_MODULE_REGISTRATIONS, which lecturers do not hold, so the portal has
   * its own scoped endpoint — it only accepts modules you actually teach.
   */
  enrolStudents: (moduleId: number, regnumbers: string[], signal?: AbortSignal) =>
    api.post<{ added: number; already: number }>(
      `/api/teacher/courses/${moduleId}/students`, { regnumbers }, signal,
    ),

  /**
   * What removing this student would destroy — real counts for the
   * confirmation dialog, plus `can_purge` so the UI never offers a deletion
   * the API will refuse.
   */
  removalImpact: (moduleId: number, regnumber: string, termId?: number, signal?: AbortSignal) =>
    api.get<RemovalImpact>(
      `/api/teacher/courses/${moduleId}/students/removal-impact`,
      { regnumber, ...(termId ? { term_id: termId } : {}) },
      signal,
    ),

  /**
   * Remove a student from a course.
   *
   * `purge` false (the default) marks the registration dropped and keeps every
   * record. `purge` true DELETES the marks, attendance, exam attendance and
   * revaluation requests as well, and is refused with a 403 for anyone but a
   * superadmin. `purgeOtherTerms` widens a purge to this module in every term,
   * which is what stops a mark recorded in another term from keeping the
   * student in the deliberation grid.
   */
  unenrolStudent: (
    moduleId: number,
    regnumber: string,
    opts?: { purge?: boolean; purgeOtherTerms?: boolean; termId?: number },
    signal?: AbortSignal,
  ) =>
    api.post<UnenrolResult>(
      `/api/teacher/courses/${moduleId}/students/unenrol`
        + (opts?.termId ? `?term_id=${opts.termId}` : ''),
      {
        regnumber,
        purge:             opts?.purge ?? false,
        purge_other_terms: opts?.purgeOtherTerms ?? false,
      },
      signal,
    ),

  /** Sessions held + per-student tally, for the course Attendance tab. */
  courseAttendance: (moduleId: number, termId?: number, signal?: AbortSignal) =>
    api.get<CourseAttendance>(
      `/api/teacher/courses/${moduleId}/attendance`,
      termId ? { term_id: termId } : undefined,
      signal,
    ),

  classList: (moduleId: number, termId?: number, signal?: AbortSignal) =>
    api.get<TeacherClassStudent[]>(
      `/api/teacher/courses/${moduleId}/students`,
      termId ? { term_id: termId } : undefined,
      signal,
    ),

  students: (termId?: number, signal?: AbortSignal) =>
    api.get<TeacherStudent[]>('/api/teacher/students', termId ? { term_id: termId } : undefined, signal),

  calendar: (params?: { from?: string; to?: string; term_id?: number }, signal?: AbortSignal) =>
    api.get<TeacherCalendar>('/api/teacher/calendar', params, signal),

  exams: (signal?: AbortSignal) =>
    api.get<TeacherExam[]>('/api/teacher/exams', undefined, signal),

  examAttendance: (examId: number, signal?: AbortSignal) =>
    api.get<ExamAttendanceSheet>(`/api/teacher/exams/${examId}/attendance`, undefined, signal),

  saveExamAttendance: (examId: number, records: ExamAttendanceInput[], signal?: AbortSignal) =>
    api.post<{ saved: number }>(`/api/teacher/exams/${examId}/attendance`, { records }, signal),
}
