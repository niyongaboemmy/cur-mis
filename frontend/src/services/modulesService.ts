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
  ) => api.get<PaginatedResponse<Module>>('/modules', params, signal),

  show: (id: number, signal?: AbortSignal) =>
    api.get<Module>(`/api/modules/${id}`, {}, signal),

  create: (data: CreateModulePayload) =>
    api.post<Module>('/modules', data),

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
  ) => api.get<ModuleScheduleRow[]>('/modules/schedules', params, signal),

  checkConflicts: (data: SchedulePayload) =>
    api.post<{ conflicts: ScheduleConflict[] }>(
      '/modules/schedules/check-conflicts',
      data,
    ),

  create: (data: SchedulePayload) =>
    api.post<{ id: number }>('/modules/schedules', data),

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
  ) => api.get<ModuleAssignment[]>('/modules/assignments', params, signal),

  workload: (term_id: number, signal?: AbortSignal) =>
    api.get<WorkloadRow[]>('/modules/assignments/workload', { term_id }, signal),

  create: (data: AssignmentPayload) =>
    api.post<{ id: number }>('/modules/assignments', data),

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
  ) => api.get<ModuleRegistration[]>('/modules/registrations', params, signal),

  create: (data: RegistrationPayload) =>
    api.post<{ id: number }>('/modules/registrations', data),

  bulkRegister: (data: {
    module_id: number
    academic_term_id: number
    student_regnumbers: string[]
    force?: boolean
  }) => api.post<{ created: number; skipped: number; errors: Array<{ regnumber: string; reason: string }> }>(
    '/modules/registrations/bulk', data
  ),

  update: (id: number, data: Partial<RegistrationPayload>) =>
    api.put<null>(`/api/modules/registrations/${id}`, data),

  remove: (id: number) =>
    api.delete<null>(`/api/modules/registrations/${id}`),
}

/* ── Student self-service ────────────────────────────────────────── */
export interface MyExamRow {
  module_id:        number
  module_code:      string
  module_name:      string
  module_credits?:  number | null
  academic_term_id: number
  term_label?:      string | null
  exam_id:          number | null
  component:        string | null
  exam_date:        string | null
  start_time:       string | null
  end_time:         string | null
  campus_id:        number | null
  campus_name:      string | null
  instructor_name:  string | null
  notes:            string | null
}

export const myModulesService = {
  eligible: (term_id: number, signal?: AbortSignal) =>
    api.get<Module[]>('/modules/my/eligible', { term_id }, signal),

  registrations: (params: { term_id?: number } = {}, signal?: AbortSignal) =>
    api.get<ModuleRegistration[]>('/modules/my/registrations', params, signal),

  /**
   * Student-facing exam timetable: every module the user is registered to,
   * left-joined with `exam_schedules` so modules with no published exam
   * still surface (with `exam_id: null`). Backed by /api/modules/my/exams.
   */
  exams: (params: { term_id?: number } = {}, signal?: AbortSignal) =>
    api.get<MyExamRow[]>('/modules/my/exams', params, signal),

  register: (data: SelfRegisterPayload) =>
    api.post<{ id: number }>('/modules/my/register', data),

  drop: (id: number) =>
    api.post<null>(`/api/modules/my/drop/${id}`),
}
