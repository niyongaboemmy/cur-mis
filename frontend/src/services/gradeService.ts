import { api } from '@/services/api'

export interface GradingBand {
  id:          number
  grade:       string
  min_marks:   string | number
  max_marks:   string | number
  grade_point: string | number
  description: string | null
}

export interface GradingBandInput {
  grade:        string
  min_marks:    number
  max_marks:    number
  grade_point:  number
  description?: string | null
}

export interface GpaTerm {
  term_id:        number
  term_label:     string
  year_id:        number
  year_label:     string
  credits:        number
  quality_points: number
  gpa:            number | null
}

export interface GpaResult {
  terms:                  GpaTerm[]
  cgpa:                   number | null
  total_credits:          number
  total_quality_points:   number
  grade_points_available: boolean
}

export const gradeService = {
  // Grading scale
  listScales: () => api.get<GradingBand[]>('/api/grades/scales'),
  createScale: (payload: GradingBandInput) => api.post<GradingBand>('/api/grades/scales', payload),
  updateScale: (id: number, payload: GradingBandInput) => api.put<GradingBand>(`/api/grades/scales/${id}`, payload),
  removeScale: (id: number) => api.delete<void>(`/api/grades/scales/${id}`),

  // GPA
  gpaById: (studentId: number | string) => api.get<GpaResult>(`/api/grades/gpa/by-id/${studentId}`),
  myGpa:   () => api.get<GpaResult>('/api/grades/my-gpa'),
}
