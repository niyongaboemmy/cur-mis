import { api } from '@/services/api'

export interface ModuleRequestStatus {
  applies: boolean
  needs_request: boolean
  waiting: boolean
  assigned_count: number
  pending_count: number
}

export interface ModuleOption {
  module_id: number
  module_code: string
  module_name: string
  department: number | null
  dep_name: string | null
}

export interface PendingModuleRequest {
  id: number
  user_id: number
  module_id: number
  requested_at: string
  full_name: string
  username: string
  module_code: string
  module_name: string
  department: number | null
  dep_name: string | null
}

// Writes go through POST: the production WAF and the API client send PUT as POST.
export const moduleRequestService = {
  status: () =>
    api.get<ModuleRequestStatus>('/api/module-requests/status'),

  options: () =>
    api.get<{ department_id: number | null; modules: ModuleOption[] }>('/api/module-requests/options'),

  submit: (moduleIds: number[]) =>
    api.post<{ sent: number }>('/api/module-requests', { module_ids: moduleIds }),

  pending: () =>
    api.get<PendingModuleRequest[]>('/api/module-requests/pending'),

  approve: (id: number) =>
    api.post(`/api/module-requests/${id}/approve`, {}),

  reject: (id: number, note?: string) =>
    api.post(`/api/module-requests/${id}/reject`, { note: note ?? '' }),
}
