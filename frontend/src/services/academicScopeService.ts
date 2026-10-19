import { api } from '@/services/api'

export interface ScopeFaculty {
  fac_id: number
  fac_name: string
}

export interface ScopeDepartment {
  dep_id: number
  dep_name: string
  fac_id: number | null
}

export interface ScopeUnit {
  id: number
  parent_id: number | null
  name: string
  head_title: string
  head_user_id: number | null
  head_name: string | null
  acting_user_id: number | null
  acting_name: string | null
  acting_until: string | null
  fac_id: number | null
  dep_id: number | null
  member_count: number
}

export interface ScopeOverview {
  faculties: ScopeFaculty[]
  departments: ScopeDepartment[]
  units: ScopeUnit[]
}

export interface ScopeMember {
  user_id: number
  job_title: string | null
  full_name: string
  username: string
}

// Writes go through POST: the production WAF and the API client send PUT as POST.
export interface ScopeRequest {
  id: number
  user_id?: number
  full_name?: string
  username?: string
  fac_id: number | null
  dep_id: number | null
  fac_name?: string | null
  dep_name?: string | null
  status: 'pending' | 'approved' | 'rejected'
  requested_at: string
  decision_note?: string | null
  unit_id?: number | null
  unit_name?: string | null
  unit_head_name?: string | null
}

export const academicScopeService = {
  // Own scope and choose / waiting state (any signed-in user).
  options: () =>
    api.get<{ faculties: { fac_id: number; fac_name: string }[]; departments: { dep_id: number; dep_name: string; fac_id: number | null }[] }>(
      '/api/academic-scope/options',
    ),

  requestScope: (body: { fac_id?: number; dep_id?: number }) =>
    api.post<ScopeRequest>('/api/academic-scope/requests', body),

  // Admin: approvals.
  requests: (status: 'pending' | 'approved' | 'rejected' = 'pending') =>
    api.get<ScopeRequest[]>('/api/academic-scope/admin/requests', { status }),

  approve: (requestId: number) =>
    api.post(`/api/academic-scope/admin/requests/${requestId}/approve`, {}),

  reject: (requestId: number, note?: string) =>
    api.post(`/api/academic-scope/admin/requests/${requestId}/reject`, { note: note ?? '' }),

  overview: () =>
    api.get<ScopeOverview>('/api/academic-scope/admin/overview'),

  members: (unitId: number) =>
    api.get<ScopeMember[]>(`/api/academic-scope/admin/units/${unitId}/members`),

  setLink: (unitId: number, facId: number | null, depId: number | null) =>
    api.post(`/api/academic-scope/admin/units/${unitId}/link`, {
      fac_id: facId,
      dep_id: depId,
    }),

  setHead: (unitId: number, userId: number | null) =>
    api.post(`/api/academic-scope/admin/units/${unitId}/head`, { user_id: userId }),

  setMembers: (unitId: number, userIds: number[]) =>
    api.post(`/api/academic-scope/admin/units/${unitId}/members`, { user_ids: userIds }),
}
