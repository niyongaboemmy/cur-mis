import { api, apiClient } from '@/services/api'

export interface MarkableModule {
  module_id:          number
  module_code:        string
  module_name:        string
  level:              number
  academic_term_id?:  number
}

export interface MarksRosterRow {
  student_id:        number
  regnumber:         string
  fname:             string
  lname:             string
  email:             string | null
  mark_id:           number | null
  cat_marks:         string | number | null
  assignment_marks:  string | number | null
  exam_marks:        string | number | null
  cat_max:           string | number
  assignment_max:    string | number
  exam_max:          string | number
  total:             string | number | null
  percentage:        string | number | null
  grade:             string | null
  remarks:           string | null
  updated_at:        string | null
}

export interface MarksListResponse {
  module:  { module_id: number; module_code: string; module_name: string }
  term:    { id: number; label: string }
  roster:  MarksRosterRow[]
  summary: { total_roster: number; recorded: number; unmarked: number; avg_pct: number }
}

export interface SaveMarkRecord {
  student_regnumber: string
  cat_marks?:        number | null
  assignment_marks?: number | null
  exam_marks?:       number | null
  cat_max?:          number
  assignment_max?:   number
  exam_max?:         number
  remarks?:          string | null
}

export interface SaveMarksPayload {
  module_id:        number
  academic_term_id: number
  records:          SaveMarkRecord[]
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
  grade:             string | null
  remarks:           string | null
  credit_point:      number | string | null
  academic_term_id:  number
  term_label:        string
  academic_year_id:  number
  year_label:        string
  updated_at:        string | null
}

export interface MyMarksTotals {
  modules:               number
  total_credits:         number
  total_credit_points:   number
  weighted_average:      number | null
  overall_grade:         string | null
  overall_grade_label:   string | null
  decision:              'Promoted' | 'Repeat' | null
  passed:                number
  failed:                number
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

const apiBase = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

export const marksService = {
  markableModules: (params: { academic_term_id?: number | string } = {}) =>
    api.get<MarkableModule[]>('/api/marks/markable-modules', params as Record<string, unknown>),

  list: (params: { module_id: number; academic_term_id: number }) =>
    api.get<MarksListResponse>('/api/marks', params as Record<string, unknown>),

  save: (payload: SaveMarksPayload) =>
    api.put<{ saved: number }>('/api/marks', payload),

  remove: (id: number | string) =>
    api.delete<void>(`/api/marks/${id}`),

  studentMarks: (regnumber: string, params: { academic_year_id?: number | string } = {}) =>
    api.get<StudentMarksResponse>(`/api/marks/students/${regnumber}`, params as Record<string, unknown>),

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

  myMarks: (params: { academic_year_id?: number | string } = {}) =>
    api.get<MyMarksResponse>('/api/marks/my', params as Record<string, unknown>),

  /** Direct URL for the transcript download (rarely used — prefer downloadTranscript). */
  myTranscriptUrl: (params: { academic_year_id?: number | string } = {}) => {
    const qs = new URLSearchParams()
    if (params.academic_year_id) qs.set('academic_year_id', String(params.academic_year_id))
    const q = qs.toString()
    return `${apiBase}/api/marks/my/transcript${q ? `?${q}` : ''}`
  },

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
