import { api } from '@/services/api'
import type { PaginatedResponse } from '@/types'
import type { HrEmployee } from '@/types/academic'

export interface FacetOption {
  value: string
  label: string
}

export interface HrBreakdownRow {
  value: string
  label: string | null
  total: number | string
}

export interface HrStats {
  total:           number
  active:          number
  inactive:        number
  terminated:      number
  male:            number
  female:          number
  permanent:       number
  temporal:        number
  part_time:       number
  joined_last_30d: number
  departments:     number
  by_department:   { department: string; total: number | string }[]

  // Active-only
  active_male:            number
  active_female:          number
  active_unknown_gender:  number
  active_permanent:       number
  active_temporal:        number
  active_part_time:       number
  active_joined_last_30d: number
  active_departments:     number
  active_positions:       number
  active_on_leave_today:  number
  active_breakdown: {
    by_department: HrBreakdownRow[]
    by_position:   HrBreakdownRow[]
    by_contract:   HrBreakdownRow[]
  }

  facets: {
    department:    FacetOption[]
    position:      FacetOption[]
    contract_type: FacetOption[]
    status:        FacetOption[]
    gender:        FacetOption[]
  }
}

export interface HrListParams {
  page?:            number
  per_page?:        number
  q?:               string
  status?:          string
  gender?:          string
  department?:      string
  position?:        string
  contract_type?:   string
  joined_last_30d?: 0 | 1 | boolean
  sort_by?:         string
  sort_dir?:        'asc' | 'desc' | ''
}

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

/* ── Payroll types ──────────────────────────────────────────────────────── */

export interface PayrollEntry {
  id?: number
  emp_id: number
  period_year: number
  period_month: number
  basic_salary: number
  housing_allowance: number
  transport_allowance: number
  other_allowances: number
  gross_salary: number
  paye: number
  rssb: number
  cbhi: number
  net_salary: number
  notes?: string | null
}

export interface PayrollRow extends HrEmployee {
  payroll_id?: number | null
  period_year?: number | null
  period_month?: number | null
  basic_salary?: number | null
  housing_allowance?: number | null
  transport_allowance?: number | null
  other_allowances?: number | null
  gross_salary?: number | null
  paye?: number | null
  rssb?: number | null
  cbhi?: number | null
  net_salary?: number | null
  notes?: string | null
}

export interface PayrollListResponse {
  data: PayrollRow[]
  total: number
  per_page: number
  current_page: number
  last_page: number
  period_year: number
  period_month: number
  facets?: {
    department:    { value: string; label: string }[]
    position:      { value: string; label: string }[]
    contract_type: { value: string; label: string }[]
  }
}

export interface PayrollSlipsResponse {
  employee: HrEmployee
  slips: PayrollEntry[]
}

export interface PayrollListParams extends HrListParams {
  period_year?: number
  period_month?: number
}

export const hrService = {
  listEmployees: (
    params: HrListParams = {},
    signal?: AbortSignal,
  ) => api.get<PaginatedResponse<HrEmployee>>('/api/employees', params as Record<string, unknown>, signal),

  stats: (signal?: AbortSignal) =>
    api.get<HrStats>('/api/employees/stats', {}, signal),

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

  /* ── Payroll ─────────────────────────────────────────────────────────── */

  payrollList: (params: PayrollListParams = {}, signal?: AbortSignal) =>
    api.get<PayrollListResponse>('/api/hr/payroll', params as Record<string, unknown>, signal),

  payrollSlips: (empId: number | string, params?: { from_year?: number; from_month?: number; to_year?: number; to_month?: number }, signal?: AbortSignal) =>
    api.get<PayrollSlipsResponse>(`/api/hr/payroll/${empId}/slips`, params as Record<string, unknown>, signal),

  payrollUpsert: (data: PayrollEntry) =>
    api.post<PayrollEntry>('/api/hr/payroll', data),

  payrollDelete: (id: number) =>
    api.delete<void>(`/api/hr/payroll/${id}`),
}
