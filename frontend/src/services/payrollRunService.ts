import { api, apiClient } from '@/services/api'

export type RunStatus = 'DRAFT' | 'CALCULATED' | 'VERIFIED' | 'APPROVED' | 'PAID'

export interface RunRow {
  id: number
  scheme_code: string
  period_date: string
  title: string
  status: RunStatus
  created_by: number | null
  created_at: string | null
  calculated_at: string | null
  verified_at: string | null
  approved_at: string | null
  paid_at: string | null
}

export interface RunLine {
  id: number
  run_id: number
  employee_id: number
  contract_id: number | null
  line_ref: string
  employee_name: string
  bank_name: string | null
  account_number: string | null
  tax_method: string | null
  inputs: Record<string, unknown>
  warnings: string[]
  basic_salary: number
  basic_topup: number
  housing_allowance: number
  transport_allowance: number
  gross_salary: number
  responsibility_allowance: number
  arrears: number
  total_gross: number
  paye: number
  pension_employee: number
  pension_employer: number
  maternity_employee: number
  maternity_employer: number
  hazard_employer: number
  rssb_employee_total: number
  rama_employee: number
  rama_employer: number
  other_insurance: number
  cbhi: number
  deductions: number
  total_deductions: number
  net_pay: number
  employer_cost: number
  gross_up_residual: number
}

export interface RunSummary {
  run: RunRow & { snapshot: Record<string, unknown>; settings_effective_from: string }
  line_count: number
  totals: Record<string, number>
}

export interface AuditEntry {
  id: number
  actor_user_id: number | null
  action: string
  before_json: string | null
  after_json: string | null
  created_at: string
}

export interface Adjustment {
  id: number
  line_id: number | null
  component: string
  old_value: string | null
  new_value: string | null
  reason: string
  created_at: string
}

export interface RunHistory {
  audit: AuditEntry[]
  adjustments: Adjustment[]
}

export interface ContractRow {
  id: number
  employee_id: number
  scheme_code: string
  start_date: string
  end_date: string | null
  basic_salary: string
  topup_rate: string | null
  housing_divisor: number | null
  transport_divisor: number | null
  responsibility_roles: string | null
  tax_method: string | null
  tax_method_reason: string | null
  status: string
}

export interface PartTimeRow {
  id: number
  employee_id: number
  employee_fname: string
  employee_lname: string
  module_code: string
  module_title: string
  programme: string
  credits: number
  hours_default: string
  hours_paid: string | null
  hours_override_reason: string | null
  grade_code: string
  period_start: string
  period_end: string
  status: string
  payroll_run_id: number | null
  from_outside_huye: number
  accommodation_nights: number
  transport_zone: string | null
  transport_trips: number
}

export interface SettingsVersion {
  id: number
  effective_from: string
  note: string | null
  created_at: string | null
  settings: Record<string, unknown>
}

export interface ReferenceData {
  pay_schemes: { code: string; name: string; earnings_mode: string; default_tax_method: string }[]
  settings_versions: SettingsVersion[]
  responsibility_roles: { role_code: string; role_name: string; monthly_amount: string; effective_from: string }[]
  hourly_rates: { grade_code: string; grade_name: string; rate_per_hour: string; effective_from: string }[]
  banks: { name: string; short_code: string | null }[]
}

export interface BankGroup {
  bank: string
  payments: { name: string; account: string; amount: number }[]
  total: number
}

export const PAYROLL_LINE_MONEY_KEYS = [
  'basic_salary', 'basic_topup', 'housing_allowance', 'transport_allowance', 'gross_salary',
  'responsibility_allowance', 'arrears', 'total_gross', 'paye', 'pension_employee', 'pension_employer',
  'maternity_employee', 'maternity_employer', 'hazard_employer', 'rssb_employee_total', 'rama_employee',
  'rama_employer', 'other_insurance', 'cbhi', 'deductions', 'total_deductions', 'net_pay', 'employer_cost',
] as const

export const payrollRunService = {
  runs: (params?: Record<string, string>) => api.get<RunRow[]>('/hr/payroll/runs', params),
  run: (id: number) => api.get<RunSummary>(`/hr/payroll/runs/${id}`),
  lines: (id: number) => api.get<RunLine[]>(`/hr/payroll/runs/${id}/lines`),
  history: (id: number) => api.get<RunHistory>(`/hr/payroll/runs/${id}/audit`),

  create: (body: { scheme_code: string; period_date: string; title: string }) =>
    api.post<{ id: number }>('/hr/payroll/runs', body),
  generate: (id: number) => api.post<{ lines_added: number }>(`/hr/payroll/runs/${id}/generate`),
  addLine: (id: number, body: { employee_id: number; line_ref?: string; inputs: Record<string, unknown>; reason: string }) =>
    api.post<{ line_id: number }>(`/hr/payroll/runs/${id}/lines`, body),
  updateLine: (id: number, lineId: number, body: { changes: Record<string, unknown>; reason: string }) =>
    api.post(`/hr/payroll/runs/${id}/lines/${lineId}`, body),
  removeLine: (id: number, lineId: number, reason: string) =>
    api.post(`/hr/payroll/runs/${id}/lines/${lineId}/remove`, { reason }),
  calculate: (id: number) => api.post(`/hr/payroll/runs/${id}/calculate`),
  verify: (id: number) => api.post(`/hr/payroll/runs/${id}/verify`),
  returnToPreparer: (id: number, reason: string) => api.post(`/hr/payroll/runs/${id}/return`, { reason }),
  approve: (id: number) => api.post(`/hr/payroll/runs/${id}/approve`),
  pay: (id: number) => api.post(`/hr/payroll/runs/${id}/pay`),
  reopen: (id: number, reason: string) => api.post(`/hr/payroll/runs/${id}/reopen`, { reason }),

  contracts: (employeeId: number) => api.get<ContractRow[]>(`/hr/payroll/employees/${employeeId}/contracts`),
  addContract: (employeeId: number, body: Record<string, unknown>) =>
    api.post<{ id: number }>(`/hr/payroll/employees/${employeeId}/contracts`, body),
  endContract: (contractId: number, endDate: string) =>
    api.post(`/hr/payroll/contracts/${contractId}/end`, { end_date: endDate }),

  partTime: (status?: string) => api.get<PartTimeRow[]>('/hr/payroll/part-time', status ? { status } : undefined),
  requestModule: (body: Record<string, unknown>) => api.post<{ id: number }>('/hr/payroll/part-time', body),
  overrideHours: (id: number, hours: string, reason: string) =>
    api.post(`/hr/payroll/part-time/${id}/hours`, { hours, reason }),
  advancePartTime: (id: number) => api.post<{ status: string }>(`/hr/payroll/part-time/${id}/advance`),
  sendPartTime: (id: number, runId: number) => api.post(`/hr/payroll/part-time/${id}/send`, { run_id: runId }),
  reimbursement: (id: number) =>
    api.get<{ accommodation: number; transport: number; total: number }>(`/hr/payroll/part-time/${id}/reimbursement`),

  reference: () => api.get<ReferenceData>('/hr/payroll/reference'),
  addSettings: (body: { effective_from: string; settings: Record<string, unknown>; note: string }) =>
    api.post<{ id: number }>('/hr/payroll/settings', body),
  addRole: (body: { role_code: string; role_name: string; amount: number; effective_from: string }) =>
    api.post('/hr/payroll/roles', body),
  addHourly: (body: { grade_code: string; grade_name: string; rate: number; effective_from: string }) =>
    api.post('/hr/payroll/hourly', body),
}

/**
 * Downloads a file from an authenticated endpoint. Plain links cannot carry the bearer token.
 */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const response = await apiClient.get<Blob>(path, { responseType: 'blob' })
  const url = URL.createObjectURL(response.data)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/** The message the API sent with an error, or a fallback. */
export function errorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  const data = (error as { response?: { data?: { message?: string } } })?.response?.data
  return data?.message ?? fallback
}
