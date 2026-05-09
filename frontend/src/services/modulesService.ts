import { api } from '@/services/api'
import type { PaginatedResponse } from '@/types'
import type {
  Module,
  ModuleScheduleRow,
  ScheduleConflict,
  ModuleAssignment,
  WorkloadRow,
  ModuleRegistration,
  CreateModulePayload,
  SchedulePayload,
  AssignmentPayload,
  RegistrationPayload,
  SelfRegisterPayload,
} from '@/types/modules'

/* ── Catalog ─────────────────────────────────────────────────────── */
export const moduleCatalogService = {
  list: (
    params: {
      page?:       number
      per_page?:   number
      department?: number
      program?:    number
      level?:      number
      status?:     'draft' | 'active' | 'archived'
      q?:          string
    } = {},
    signal?: AbortSignal,
  ) => api.get<PaginatedResponse<Module>>('/api/modules', params, signal),

  show: (id: number, signal?: AbortSignal) =>
    api.get<Module>(`/api/modules/${id}`, {}, signal),

  create: (data: CreateModulePayload) =>
    api.post<Module>('/api/modules', data),

  update: (id: number, data: Partial<CreateModulePayload>) =>
    api.put<Module>(`/api/modules/${id}`, data),

  remove: (id: number) =>
    api.delete<null>(`/api/modules/${id}`),
}

/* ── Scheduling ──────────────────────────────────────────────────── */
export const moduleScheduleService = {
  list: (
    params: { term_id?: number; module_id?: number; room_id?: number; staff_id?: number } = {},
    signal?: AbortSignal,
  ) => api.get<ModuleScheduleRow[]>('/api/modules/schedules', params, signal),

  checkConflicts: (data: SchedulePayload) =>
    api.post<{ conflicts: ScheduleConflict[] }>(
      '/api/modules/schedules/check-conflicts',
      data,
    ),

  create: (data: SchedulePayload) =>
    api.post<{ id: number }>('/api/modules/schedules', data),

  update: (id: number, data: SchedulePayload) =>
    api.put<null>(`/api/modules/schedules/${id}`, data),

  remove: (id: number) =>
    api.delete<null>(`/api/modules/schedules/${id}`),
}

/* ── Assignments ─────────────────────────────────────────────────── */
export const moduleAssignmentService = {
  list: (
    params: { term_id?: number; staff_id?: number; module_id?: number } = {},
    signal?: AbortSignal,
  ) => api.get<ModuleAssignment[]>('/api/modules/assignments', params, signal),

  workload: (term_id: number, signal?: AbortSignal) =>
    api.get<WorkloadRow[]>('/api/modules/assignments/workload', { term_id }, signal),

  create: (data: AssignmentPayload) =>
    api.post<{ id: number }>('/api/modules/assignments', data),

  update: (id: number, data: Partial<AssignmentPayload>) =>
    api.put<null>(`/api/modules/assignments/${id}`, data),

  remove: (id: number) =>
    api.delete<null>(`/api/modules/assignments/${id}`),
}

/* ── Registrations (admin) ───────────────────────────────────────── */
export const moduleRegistrationService = {
  list: (
    params: { term_id?: number; module_id?: number; regnumber?: string; status?: string } = {},
    signal?: AbortSignal,
  ) => api.get<ModuleRegistration[]>('/api/modules/registrations', params, signal),

  create: (data: RegistrationPayload) =>
    api.post<{ id: number }>('/api/modules/registrations', data),

  bulkRegister: (data: {
    module_id: number
    academic_term_id: number
    student_regnumbers: string[]
    force?: boolean
  }) => api.post<{ created: number; skipped: number; errors: Array<{ regnumber: string; reason: string }> }>(
    '/api/modules/registrations/bulk', data
  ),

  update: (id: number, data: Partial<RegistrationPayload>) =>
    api.put<null>(`/api/modules/registrations/${id}`, data),

  remove: (id: number) =>
    api.delete<null>(`/api/modules/registrations/${id}`),
}

/* ── Student self-service ────────────────────────────────────────── */
export const myModulesService = {
  eligible: (term_id: number, signal?: AbortSignal) =>
    api.get<Module[]>('/api/modules/my/eligible', { term_id }, signal),

  registrations: (params: { term_id?: number } = {}, signal?: AbortSignal) =>
    api.get<ModuleRegistration[]>('/api/modules/my/registrations', params, signal),

  register: (data: SelfRegisterPayload) =>
    api.post<{ id: number }>('/api/modules/my/register', data),

  drop: (id: number) =>
    api.post<null>(`/api/modules/my/drop/${id}`),
}
