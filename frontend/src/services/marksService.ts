import { api, apiClient } from '@/services/api'

export interface MarkableModule {
  module_id:          number
  module_code:        string
  module_name:        string
  level:              number
  academic_term_id?:  number
}

/** One module a programme's transcript may or may not print. */
export interface TranscriptModuleRow {
  module_ident:         string
  module_code:          string
  module_name:          string | null
  level:                number | null
  module_credits:       number | null
  students_with_marks:  number
  avg_mark:             number | null
  /** Distinct mark values across the cohort — 1 or 2 means a bulk entry. */
  distinct_marks:       number
  in_curriculum:        boolean
  /** An explicit registry decision, or null when the curriculum decides. */
  ruling:               'show' | 'hide' | null
  prints_on_transcript: boolean
}

export interface MarksRosterRow {
  student_id:        number
  regnumber:         string
  fname:             string
  lname:             string
  email:             string | null
  sex:               string | null
  student_program:   string | null
  option_acro:       string | null
  mark_id:           number | null

  // Legacy (kept in sync server-side for the transcript path).
  cat_marks:         string | number | null
  assignment_marks:  string | number | null
  exam_marks:        string | number | null
  cat_max:           string | number
  assignment_max:    string | number
  exam_max:          string | number

  // CUR-template component scores.
  cat1:              string | number | null
  cat2:              string | number | null
  cat3:              string | number | null
  partial_exam:      string | number | null
  cat1_max:          string | number
  cat2_max:          string | number
  cat3_max:          string | number
  partial_exam_max:  string | number
  cats_max:          string | number
  exam_1st_sitting:  string | number | null
  exam_2nd_sitting:  string | number | null
  final_exam_max:    string | number

  total:             string | number | null
  percentage:        string | number | null
  /** Resolved server-side from the configured grading scale, not the stored
   *  column — imported marks were all landed with a NULL grade. */
  grade:             string | null
  /** The band's description ('Distinction', 'Credit', …). */
  grade_label?:      string | null
  grade_point?:      number | string | null
  decision:          string | null
  status:            string | null
  /** Registration status from `module_registrations.status`:
   *  'registered' | 'completed' | 'failed' | 'dropped' | null (eligible-only). */
  reg_status?:       string | null
  is_exempted?:      number | boolean | null
  exemption_reason?: string | null
  remarks:           string | null
  updated_at:        string | null
  /** When this student's mark was first entered — backs the "added between"
   *  filter. Null for a roster row that has no saved mark yet. */
  created_at:        string | null
  teaching_started_on: string | null
  teaching_ended_on:   string | null
}

export interface MarksModuleHeader {
  module_id:           number
  module_code:         string
  module_name:         string
  module_credits?:     number | string | null
  level?:              number | string | null
  d_option?:           string | null
  option_acronym?:     string | null
  program?:            string | null
  dep_id?:             number | null
  dep_name?:           string | null
  dep_acronym?:        string | null
  fac_id?:             number | null
  fac_name?:           string | null
  fac_code?:           string | null
  lecturer_name?:      string | null
  lecturer_email?:     string | null
  teaching_started_on?:string | null
  teaching_ended_on?:  string | null
}

export type MarksWorkflowStatus =
  | 'draft'
  | 'claims_open'
  | 'submitted'
  | 'confirmed'

export interface MarksWorkflow {
  status:           MarksWorkflowStatus
  claims_opened_at: string | null
  submitted_at:     string | null
  confirmed_at:     string | null
  /** Resolved names of the actors, so a locked sheet says who locked it. */
  submitted_by_name?: string | null
  confirmed_by_name?: string | null
}

export interface MarksListResponse {
  module:   MarksModuleHeader
  /** The term the sheet is ACTUALLY showing — not necessarily the one asked
   *  for. The server redirects to the term holding the module's marks when the
   *  requested one has none, so this is what a save must be written against. */
  term:     { id: number; label: string }
  roster:   MarksRosterRow[]
  summary:  { total_roster: number; recorded: number; unmarked: number; avg_pct: number }
  workflow: MarksWorkflow
  /** The term_id in the request — differs from `term.id` when redirected. */
  requested_term_id?: number
  /** Every term this module holds marks in, busiest first. */
  terms_with_marks?:  { id: number; label: string; mark_count: number }[]
}

export interface SaveMarkRecord {
  student_regnumber: string

  /** CAT total out of 60 — what CUR records and what the sheet asks for.
   *  When present it is the CAT mark and the components below stay null. */
  cats_total?:       number | null

  // Component scores (kept for historical rows that carry a breakdown).
  cat1?:             number | null
  cat2?:             number | null
  cat3?:             number | null
  partial_exam?:     number | null
  exam_1st_sitting?: number | null
  exam_2nd_sitting?: number | null

  // Maxes — sent on every payload so a teacher's edit takes effect for the row.
  cat1_max?:         number
  cat2_max?:         number
  cat3_max?:         number
  partial_exam_max?: number
  cats_max?:         number
  final_exam_max?:   number

  remarks?:          string | null
}

export interface SaveMarksPayload {
  module_id:           number
  academic_term_id:    number
  teaching_started_on?:string | null
  teaching_ended_on?:  string | null
  records:             SaveMarkRecord[]
}

/** Full transcript shape — used for both /my and /students/:reg. */
export interface StudentMarksResponse {
  student: {
    regnumber:      string
    fname?:         string
    lname?:         string
    email?:         string
    current_level?: string
    fac_name?:      string
    dep_name?:      string
  }
  rows:   MyMarksRow[]
  totals: MyMarksTotals
}

export interface MyMarksRow {
  id:                number
  module_id:         number
  module_code:       string
  module_name:       string
  module_credits:    number | string
  level:             number | string
  cat_marks:         string | number | null
  assignment_marks:  string | number | null
  exam_marks:        string | number | null
  cat_max:           string | number
  assignment_max:    string | number
  exam_max:          string | number
  total:             string | number | null
  percentage:        string | number | null
  /** From the configured grading scale — see MarksRosterRow.grade. */
  grade:             string | null
  grade_label?:      string | null
  grade_point?:      number | string | null
  remarks:           string | null
  is_exempted?:      number | boolean | null
  exemption_reason?: string | null
  credit_point:      number | string | null
  academic_term_id:  number
  term_label:        string
  academic_year_id:  number
  year_label:        string
  updated_at:        string | null
}

/**
 * The degree class the CUR regulations award, as computed by
 * `DegreeClassificationService::honours()` — decided on the final-level
 * modules, not on the cumulative average. Null when the request was filtered
 * to one academic year, since a partial record cannot be classified.
 */
export interface HonoursClassification {
  /** '1st' | '2i' | '2ii' | '3', or null when no class is awarded. */
  code:               string | null
  /** Roster vocabulary — 'First Class', 'Upper Second', … */
  class:              string | null
  /** Full printed wording, or 'Not classified'. */
  label:              string
  awarded:            boolean
  /** Why no class was awarded — set only when `awarded` is false. */
  reason:             string | null
  /** What the record could not confirm (e.g. no Project module found). */
  caveats:            string[]
  /** Levels of study the assessment covered. */
  levels:             number[]
  modules:            number
  credits:            number
  /** Credits sitting at or above the awarded class's threshold. */
  qualifying_credits: number
  weighted_average:   number | null
  lowest_mark:        number | null
  project: {
    code:    string
    name:    string
    mark:    number
    credits: number
  } | null
}

export interface MyMarksTotals {
  modules:               number
  total_credits:         number
  total_credit_points:   number
  weighted_average:      number | null
  overall_grade:         string | null
  overall_grade_label:   string | null
  overall_grade_point?:  number | null
  decision:              'Promoted' | 'Repeat' | null
  passed:                number
  failed:                number
  classification?:       HonoursClassification | null
}

export interface MyMarksResponse {
  student: {
    regnumber:      string
    fname?:         string
    lname?:         string
    email?:         string
    current_level?: string
    fac_name?:      string
    dep_name?:      string
  }
  rows:   MyMarksRow[]
  totals: MyMarksTotals
}

/** A module the student has a recorded mark for. */
export interface CoverageCompletedRow {
  module_id:      number
  module_code:    string
  module_name:    string
  module_credits: number | string | null
  level:          number | string | null
  cat_marks:      number | string | null
  exam_marks:     number | string | null
  total:          number | string | null
  percentage:     number | string | null
  /** From the configured grading scale — see MarksRosterRow.grade. */
  grade:          string | null
  grade_label?:   string | null
  grade_point?:   number | string | null
  status:         string | null
  term_label:     string | null
  year_label:     string | null
  created_at:     string | null
}

/** A programme module with no mark yet. */
export interface CoverageRemainingRow {
  module_id:      number
  module_code:    string
  module_name:    string
  module_credits: number | string | null
  level:          number | string | null
}

export interface StudentCoverageResponse {
  student: {
    id?:            number
    regnumber:      string
    fname?:         string
    lname?:         string
    current_level?: string | null
    option_id?:     number | null
    option_name?:   string | null
    option_acro?:   string | null
  }
  completed: CoverageCompletedRow[]
  remaining: CoverageRemainingRow[]
  totals: {
    completed:         number
    remaining:         number
    passed:            number
    failed:            number
    credits_completed: number
    credits_remaining: number
    /** False when the student has no programme mapped — "remaining" is then
     *  unknowable rather than zero, and the UI must say so. */
    has_curriculum:     boolean
    curriculum_size:    number
    /** True when `module_programs` looks like the legacy bulk import (the big
     *  Education options map to 272+ modules) rather than a real curriculum,
     *  so the "remaining" list is mostly noise. */
    curriculum_suspect: boolean
  }
}

const apiBase = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

export const marksService = {
  markableModules: (params: { academic_term_id?: number | string } = {}) =>
    api.get<MarkableModule[]>('/api/marks/markable-modules', params as Record<string, unknown>),

  list: (params: { module_id: number; academic_term_id: number }) =>
    api.get<MarksListResponse>('/api/marks', params as Record<string, unknown>),

  /**
   * Download the blank marks workbook for one (module, term).
   *
   * Server-issued rather than built in the browser: the file carries a
   * `_meta` stamp naming the module and term, which the importer checks
   * before applying anything. A stamp minted by the same page that validates
   * it would prove nothing.
   */
  downloadTemplate: async (moduleId: number | string, termId: number | string) => {
    const res = await apiClient.get('/api/marks/template', {
      params: { module_id: moduleId, academic_term_id: termId },
      responseType: 'blob',
    }).catch(async (e: any) => {
      // Errors arrive as a Blob under responseType:'blob'; unwrap the JSON so
      // the caller can show the server's message instead of a generic failure.
      const body = e?.response?.data
      if (body instanceof Blob && body.type.includes('json')) {
        try { e.response.data = JSON.parse(await body.text()) } catch { /* leave as-is */ }
      }
      throw e
    })
    const blob = res.data instanceof Blob ? res.data : new Blob([res.data])
    const cd   = (res.headers['content-disposition'] as string | undefined) ?? ''
    const m    = /filename="?([^";]+)"?/i.exec(cd)
    const url  = window.URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = m?.[1] ?? `marks-template-${moduleId}-${termId}.xlsx`
    document.body.appendChild(a); a.click(); a.remove()
    window.URL.revokeObjectURL(url)
  },

  save: (payload: SaveMarksPayload) =>
    api.put<{ saved: number }>('/api/marks', payload),

  workflow: (payload: {
    module_id:        number
    academic_term_id: number
    action:           'open_claims' | 'submit' | 'confirm' | 'reset'
  }) =>
    api.post<{ status: MarksWorkflowStatus }>('/api/marks/workflow', payload),

  remove: (id: number | string) =>
    api.delete<void>(`/api/marks/${id}`),

  studentMarks: (regnumber: string, params: { academic_year_id?: number | string } = {}) =>
    api.get<StudentMarksResponse>(`/api/marks/students/${regnumber}`, params as Record<string, unknown>),

  /** id-based variant — use when regnumber may contain slashes that would
   *  break path-segment routing (e.g. "STD/2026/22699"). */
  studentMarksById: (studentId: number | string, params: { academic_year_id?: number | string } = {}) =>
    api.get<StudentMarksResponse>(`/api/marks/students/by-id/${studentId}`, params as Record<string, unknown>),

  /** Completed marks + the programme modules still outstanding. */
  studentCoverageById: (studentId: number | string, signal?: AbortSignal) =>
    api.get<StudentCoverageResponse>(`/api/marks/students/by-id/${studentId}/coverage`, {}, signal),

  /** Admin: stream a student's PDF transcript. */
  downloadStudentTranscript: async (regnumber: string, params: { academic_year_id?: number | string } = {}) => {
    const res = await apiClient.get(`/api/marks/students/${regnumber}/transcript`, {
      params,
      responseType: 'blob',
    })
    const blob = res.data instanceof Blob ? res.data : new Blob([res.data])
    const cd   = (res.headers['content-disposition'] as string | undefined) ?? ''
    const m    = /filename="?([^";]+)"?/i.exec(cd)
    const name = m?.[1] ?? `transcript-${regnumber}.pdf`
    const url  = window.URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = name
    document.body.appendChild(a); a.click(); a.remove()
    window.URL.revokeObjectURL(url)
  },

  /** id-based variant of downloadStudentTranscript. */
  downloadStudentTranscriptById: async (studentId: number | string, params: { academic_year_id?: number | string } = {}) => {
    const res = await apiClient.get(`/api/marks/students/by-id/${studentId}/transcript`, {
      params,
      responseType: 'blob',
    })
    const blob = res.data instanceof Blob ? res.data : new Blob([res.data])
    const cd   = (res.headers['content-disposition'] as string | undefined) ?? ''
    const m    = /filename="?([^";]+)"?/i.exec(cd)
    const name = m?.[1] ?? `transcript-${studentId}.pdf`
    const url  = window.URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = name
    document.body.appendChild(a); a.click(); a.remove()
    window.URL.revokeObjectURL(url)
  },

  myMarks: (params: { academic_year_id?: number | string } = {}) =>
    api.get<MyMarksResponse>('/api/marks/my', params as Record<string, unknown>),

  /** Direct URL for the transcript download (rarely used — prefer downloadTranscript). */
  myTranscriptUrl: (params: { academic_year_id?: number | string } = {}) => {
    const qs = new URLSearchParams()
    if (params.academic_year_id) qs.set('academic_year_id', String(params.academic_year_id))
    const q = qs.toString()
    return `${apiBase}/api/marks/my/transcript${q ? `?${q}` : ''}`
  },

  /**
   * Which modules a programme's transcript prints, with the evidence needed
   * to rule on each: how many students hold a mark, the average, and how many
   * DISTINCT marks (a real course spreads; a bulk entry repeats one value).
   */
  transcriptModules: (optionId: number | string) =>
    api.get<{
      option: { id: number; name: string; code?: string | null }
      modules: TranscriptModuleRow[]
      summary: { total: number; printing: number; hidden: number; ruled: number }
    }>('/api/marks/transcript-modules', { option_id: optionId }),

  /** `visible`: 'show' | 'hide' | null (null hands the module back to the curriculum rule). */
  setTranscriptModule: (body: {
    option_id: number | string
    module_ident: string
    visible: 'show' | 'hide' | null
    note?: string
  }) => api.post('/api/marks/transcript-modules', body),

  /** Fetch the transcript as a blob (carries auth header) and trigger a browser download. */
  downloadTranscript: async (params: { academic_year_id?: number | string } = {}) => {
    const res = await apiClient.get('/api/marks/my/transcript', {
      params,
      responseType: 'blob',
    })
    const blob = res.data instanceof Blob ? res.data : new Blob([res.data])
    const cd   = (res.headers['content-disposition'] as string | undefined) ?? ''
    const m    = /filename="?([^";]+)"?/i.exec(cd)
    const name = m?.[1] ?? 'transcript.pdf'
    const url  = window.URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = name
    document.body.appendChild(a); a.click(); a.remove()
    window.URL.revokeObjectURL(url)
  },
}
