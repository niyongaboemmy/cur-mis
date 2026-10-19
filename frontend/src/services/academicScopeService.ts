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
export const academicScopeService = {
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
