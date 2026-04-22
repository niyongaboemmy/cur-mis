import { api } from '@/services/api'
import type { PaginatedResponse } from '@/types'
import type { HrEmployee } from '@/types/academic'

export const hrService = {
  listEmployees: (
    params: { page?: number; limit?: number; per_page?: number; q?: string } = {},
    signal?: AbortSignal,
  ) => api.get<PaginatedResponse<HrEmployee>>('/api/employees', params, signal),

  showEmployee: (id: number | string, signal?: AbortSignal) =>
    api.get<HrEmployee>(`/api/employees/${id}`, {}, signal),
}
