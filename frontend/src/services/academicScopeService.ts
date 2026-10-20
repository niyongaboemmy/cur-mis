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
  requester_role?: string | null
}

export interface ScopeSecretary {
  id: number
  user_id: number
  full_name: string
  username: string
  fac_id: number | null
  dep_id: number | null
  fac_name: string | null
  dep_name: string | null
}

export interface ScopeLecturer {
  user_id: number
  full_name: string
  username: string
  fac_id: number | null
  dep_id: number | null
  option_id: number | null
  fac_name: string | null
  dep_name: string | null
  option_name: string | null
}

export interface ScopeStudentRow {
  regnumber: string
  status: string
  grade: string | null
  module_id: number
  module_code: string
  module_name: string
  term_label: string
  fname: string | null
  lname: string | null
}

export const academicScopeService = {
  // Own scope and choose / waiting state (any signed-in user).
  options: () =>
    api.get<{
      faculties: { fac_id: number; fac_name: string }[]
      departments: { dep_id: number; dep_name: string; fac_id: number | null }[]
      options: { id: number; name: string; department_id: number }[]
    }>('/api/academic-scope/options'),

  // Modules a lecturer teaches this term; admin (all) or Dean / HOD / secretary (their scope).
  lecturerModules: (userId: number, place?: { fac_id?: number | null; dep_id?: number | null; option_id?: number | null }) => {
    const params: Record<string, number> = {}
    if (place?.fac_id) params.fac_id = place.fac_id
    if (place?.dep_id) params.dep_id = place.dep_id
    if (place?.option_id) params.option_id = place.option_id
    return api.get<{
      academic_year_id: number | null
      academic_term_id: number | null
      assigned: { module_id: number; module_code: string; module_name: string; department: number | null }[]
      options: { module_id: number; module_code: string; module_name: string; department: number | null }[]
    }>(`/api/academic-scope/lecturers/${userId}/modules`, params)
  },

  setLecturerModules: (userId: number, moduleIds: number[]) =>
    api.post(`/api/academic-scope/lecturers/${userId}/modules`, { module_ids: moduleIds }),

  // Academic secretaries: admin (all), Dean / HOD (their unit).
  secretaries: () =>
    api.get<ScopeSecretary[]>('/api/academic-scope/secretaries'),

  assignSecretary: (userId: number, unit: { fac_id?: number; dep_id?: number }) =>
    api.post('/api/academic-scope/secretaries', { user_id: userId, ...unit }),

  removeSecretary: (id: number) =>
    api.post(`/api/academic-scope/secretaries/${id}/remove`, {}),

  // Lecturer placement: admin (all) or Dean / HOD (their scope).
  lecturers: () =>
    api.get<ScopeLecturer[]>('/api/academic-scope/lecturers'),

  placeLecturer: (userId: number, body: { fac_id?: number | null; dep_id?: number | null; option_id?: number | null }) =>
    api.post(`/api/academic-scope/lecturers/${userId}/placement`, body),

  // Lecturer: students in my modules for one academic year (default: current year).
  myStudents: (academicYearId?: number) =>
    api.get<{
      years: { id: number; label: string; is_current: number }[]
      academic_year_id: number
      modules: { module_id: number; module_code: string; module_name: string }[]
      students: ScopeStudentRow[]
    }>('/api/academic-scope/my-students', academicYearId ? { academic_year_id: academicYearId } : {}),

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
