import { api } from '@/services/api'
import type { PaginatedResponse } from '@/types'
import type { Student } from '@/types/academic'

export const studentService = {
  list: (
    params: { page?: number; limit?: number; per_page?: number; q?: string } = {},
    signal?: AbortSignal,
  ) => api.get<PaginatedResponse<Student>>('/api/students', params, signal),

  show: (id: number | string, signal?: AbortSignal) =>
    api.get<Student>(`/api/students/${id}`, {}, signal),
}
