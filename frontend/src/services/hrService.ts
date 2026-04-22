import { api } from '@/services/api'
import type { PaginatedResponse } from '@/types'
import type { HrEmployee } from '@/types/academic'

export interface HrEmployeePayload {
  emp_code: string
  staff_id?: number | null
  full_name: string
  gender: 'M' | 'F'
  department: string
  position: string
  contract_type: 'Permanent' | 'Temporal' | 'Part-time'
  start_date: string
  end_date?: string | null
  salary: number
  phone?: string | null
  email?: string | null
  status?: 'Active' | 'Inactive' | 'Terminated'
}

export const hrService = {
  listEmployees: (
    params: { page?: number; limit?: number; per_page?: number; q?: string } = {},
    signal?: AbortSignal,
  ) => api.get<PaginatedResponse<HrEmployee>>('/api/employees', params, signal),

  showEmployee: (id: number | string, signal?: AbortSignal) =>
    api.get<HrEmployee>(`/api/employees/${id}`, {}, signal),

  createEmployee: (data: HrEmployeePayload) =>
    api.post<{ id: number }>('/api/employees', data),

  updateEmployee: (id: number | string, data: HrEmployeePayload) =>
    api.put<void>(`/api/employees/${id}`, data),

  deleteEmployee: (id: number | string) =>
    api.delete<void>(`/api/employees/${id}`),

  toggleEmployeeStatus: (id: number | string) =>
    api.patch<{ status: string }>(`/api/employees/${id}/toggle-status`),
}
