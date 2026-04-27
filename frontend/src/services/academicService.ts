import { api } from '@/services/api'
import type { AcademicYear, AcademicTerm } from '@/types/academic'

export interface CreateYearPayload {
  label:               string
  start_date:          string
  end_date:            string
  clearance_threshold?: number
}

export interface CreateTermPayload {
  academic_year_id: number
  label:            string
  start_date?:      string
  end_date?:        string
}

export const academicService = {
  /* ── Years ───────────────────────────────────────────────────── */
  listYears: (signal?: AbortSignal) =>
    api.get<AcademicYear[]>('/api/academic/years', {}, signal),

  createYear: (data: CreateYearPayload) =>
    api.post<{ id: number }>('/api/academic/years', data),

  updateYear: (id: number, data: Partial<CreateYearPayload>) =>
    api.put<null>(`/api/academic/years/${id}`, data),

  deleteYear: (id: number) =>
    api.delete<null>(`/api/academic/years/${id}`),

  activateYear: (id: number) =>
    api.patch<null>(`/api/academic/years/${id}/activate`),

  /* ── Terms ───────────────────────────────────────────────────── */
  listTerms: (signal?: AbortSignal) =>
    api.get<AcademicTerm[]>('/api/academic/terms', {}, signal),

  createTerm: (data: CreateTermPayload) =>
    api.post<{ id: number }>('/api/academic/terms', data),

  updateTerm: (id: number, data: Partial<CreateTermPayload>) =>
    api.put<null>(`/api/academic/terms/${id}`, data),

  deleteTerm: (id: number) =>
    api.delete<null>(`/api/academic/terms/${id}`),

  activateTerm: (id: number) =>
    api.patch<null>(`/api/academic/terms/${id}/activate`),
}
