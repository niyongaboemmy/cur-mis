import { api } from '@/services/api'

export interface GradingScaleRow {
  id:          number
  grade:       string
  min_marks:   number
  max_marks:   number
  grade_point: number
  description: string | null
}

export interface GradingScaleUpsertPayload {
  scales: Omit<GradingScaleRow, 'id'>[]
}

export const gradingScaleService = {
  list: (signal?: AbortSignal) =>
    api.get<GradingScaleRow[]>('/grading-scales', {}, signal),

  upsert: (payload: GradingScaleUpsertPayload) =>
    api.put<null>('/grading-scales', payload),

  reset: () =>
    api.post<null>('/grading-scales/reset', {}),
}
