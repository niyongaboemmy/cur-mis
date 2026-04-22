import { api } from '@/services/api'
import type { PaginatedResponse } from '@/types'
import type { Student } from '@/types/academic'

export interface StudentPayload {
  fname: string
  lname: string
  faculty: string | number
  regnumber?: string
  phone?: string | null
  email?: string | null
  gender?: string | null
  birthdate?: string | null
  nationality?: string | null
  program?: string | null
  department?: string | null
  current_level?: string | null
  registration_date?: string | null
  student_state?: string | null
}

export const studentService = {
  list: (
    params: { page?: number; limit?: number; per_page?: number; q?: string } = {},
    signal?: AbortSignal,
  ) => api.get<PaginatedResponse<Student>>('/api/students', params, signal),

  show: (id: number | string, signal?: AbortSignal) =>
    api.get<Student>(`/api/students/${id}`, {}, signal),

  create: (data: StudentPayload) =>
    api.post<{ id: number }>('/api/students', data),

  update: (id: number | string, data: StudentPayload) =>
    api.put<void>(`/api/students/${id}`, data),

  remove: (id: number | string) =>
    api.delete<void>(`/api/students/${id}`),
}
