import { api } from '@/services/api'
import type { PaginatedResponse } from '@/types'
import type { HrEmployee, StaffQualification, StaffQualificationPayload } from '@/types/academic'

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
  emp_code:      string
  staff_id?:     number | null
  first_name:    string
  last_name:     string
  gender:        'M' | 'F'
  department:    string
  position:      string
  contract_type: 'Permanent' | 'Temporal' | 'Part-time'
  start_date:    string
  end_date?:     string | null
  salary:        number
  phone?:        string | null
  email?:        string | null
  status?:       'Active' | 'Inactive' | 'Terminated'
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
  other_deductions?: number
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
  other_deductions?: number | null
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

/* ── Payroll Config types ───────────────────────────────────────────────── */

export interface CustomDeduction {
  id:            number
  label:         string
  description:   string | null
  employee_rate: number
  employer_rate: number
  is_active:     number
  sort_order:    number
}

export interface PayrollConfig {
  rssb_employee_rate:      number
  rssb_employer_rate:      number
  maternity_employee_rate: number
  maternity_employer_rate: number
  cbhi_employee_rate:      number
  cbhi_employer_rate:      number
  custom_deductions?:      CustomDeduction[]
}

/* ── Per-employee Deduction types ──────────────────────────────────────── */

export type DeductionType = 'Loan' | 'School Fees' | 'Restoration' | 'Other'
export type DeductionStatus = 'Active' | 'Completed' | 'Cancelled'

export interface EmployeeDeduction {
  id:              number
  emp_id:          number
  deduction_type:  DeductionType
  label:           string
  monthly_amount:  number
  total_amount:    number | null
  paid_amount:     number
  notes:           string | null
  start_year:      number
  start_month:     number
  end_year:        number | null
  end_month:       number | null
  status:          DeductionStatus
  created_at:      string
  updated_at:      string
}

export interface EmployeeDeductionPayload {
  deduction_type:  DeductionType
  label:           string
  monthly_amount:  number
  total_amount?:   number | null
  paid_amount?:    number
  notes?:          string
  start_year:      number
  start_month:     number
  end_year?:       number | null
  end_month?:      number | null
  status?:         DeductionStatus
}

export interface ActiveDeductionsResponse {
  deductions: { id: number; label: string; deduction_type: string; monthly_amount: number }[]
  total:      number
}

/* ── Faculty profile: qualifications & subjects ─────────────────────────── */

export type QualificationType = 'Degree' | 'Certification' | 'Other'

export interface StaffQualification {
  id:             number
  employee_id:    number
  qual_type:      QualificationType
  title:          string
  field_of_study: string | null
  institution:    string | null
  year_obtained:  number | null
  grade:          string | null
  reference_no:   string | null
  expiry_date:    string | null
  document_url:   string | null
  notes:          string | null
  created_at:     string
  updated_at:     string
}

export interface StaffQualificationPayload {
  qual_type:       QualificationType
  title:           string
  field_of_study?: string | null
  institution?:    string | null
  year_obtained?:  number | null
  grade?:          string | null
  reference_no?:   string | null
  expiry_date?:    string | null
  document_url?:   string | null
  notes?:          string | null
}

export type SubjectProficiency = 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert'

export interface StaffSubject {
  id:               number
  employee_id:      number
  subject_name:     string
  proficiency:      SubjectProficiency
  years_experience: number | null
  is_primary:       number | boolean
  notes:            string | null
  created_at:       string
  updated_at:       string
}

export interface StaffSubjectPayload {
  subject_name:      string
  proficiency:       SubjectProficiency
  years_experience?: number | null
  is_primary?:       boolean
  notes?:            string | null
}

/* ── Salary Payment types ───────────────────────────────────────────────── */

export type PaymentMethod = 'Bank Transfer' | 'Cash' | 'MoMo'

export interface SalaryPayment {
  id:             number
  payroll_id:     number
  emp_id:         number
  full_name:      string
  period_year:    number
  period_month:   number
  amount:         number
  payment_method: PaymentMethod
  bank_name:      string | null
  account_number: string | null
  reference:      string | null
  notes:          string | null
  paid_at:        string
  status:         'Processed' | 'Cancelled'
}

export interface ProcessPaymentPayload {
  payroll_id:      number
  amount:          number
  payment_method:  PaymentMethod
  bank_name?:      string | null
  account_number?: string | null
  reference?:      string | null
  notes?:          string | null
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

  changeEmployeeStatus: (id: number | string, status: string) =>
    api.put<void>(`/api/employees/${id}`, { status }),

  /* ── Staff Qualifications ────────────────────────────────────────── */

  listQualifications: (empId: number | string, signal?: AbortSignal) =>
    api.get<StaffQualification[]>(`/api/employees/${empId}/qualifications`, {}, signal),

  addQualification: (empId: number | string, data: StaffQualificationPayload) =>
    api.post<StaffQualification>(`/api/employees/${empId}/qualifications`, data),

  updateQualification: (empId: number | string, qid: number, data: StaffQualificationPayload) =>
    api.put<StaffQualification>(`/api/employees/${empId}/qualifications/${qid}`, data),

  deleteQualification: (empId: number | string, qid: number) =>
    api.delete<void>(`/api/employees/${empId}/qualifications/${qid}`),

  /* ── Payroll ─────────────────────────────────────────────────────────── */

  payrollList: (params: PayrollListParams = {}, signal?: AbortSignal) =>
    api.get<PayrollListResponse>('/api/hr/payroll', params as Record<string, unknown>, signal),

  payrollSlips: (empId: number | string, params?: { from_year?: number; from_month?: number; to_year?: number; to_month?: number }, signal?: AbortSignal) =>
    api.get<PayrollSlipsResponse>(`/api/hr/payroll/${empId}/slips`, params as Record<string, unknown>, signal),

  payrollUpsert: (data: PayrollEntry) =>
    api.post<PayrollEntry>('/api/hr/payroll', data),

  payrollDelete: (id: number) =>
    api.delete<void>(`/api/hr/payroll/${id}`),

  payrollSetStatus: (id: number, status: 'Pending' | 'Paid' | 'Approved') =>
    api.patch<void>(`/api/hr/payroll/${id}/status`, { status }),

  payrollCopyPeriod: (params: { from_year: number; from_month: number; to_year: number; to_month: number }) =>
    api.post<{ copied: number; skipped: number; period: string }>('/api/hr/payroll/copy-period', params),

  payrollImportExcel: (params: { period_year: number; period_month: number; rows?: unknown[] }) =>
    api.post<{ period: string; inserted: number; skipped: number; detail: { row: string; status: string; legacy_found?: boolean; gross?: number; paye?: number; net?: number; reason?: string }[] }>(
      '/api/hr/payroll/import-excel', params
    ),

  /* ── Salary payments ─────────────────────────────────────────────────── */

  listPayments: (params?: { period_year?: number; period_month?: number; emp_id?: number; payroll_id?: number }, signal?: AbortSignal) =>
    api.get<SalaryPayment[]>('/api/hr/payroll/payments', (params ?? {}) as Record<string, unknown>, signal),

  processPayment: (data: ProcessPaymentPayload) =>
    api.post<{ id: number }>('/api/hr/payroll/payments', data),

  cancelPayment: (id: number) =>
    api.delete<void>(`/api/hr/payroll/payments/${id}`),

  /* ── Per-employee deductions ─────────────────────────────────────────── */

  listEmployeeDeductions: (empId: number | string, signal?: AbortSignal) =>
    api.get<EmployeeDeduction[]>(`/api/hr/employees/${empId}/deductions`, {}, signal),

  activeEmployeeDeductions: (empId: number | string, year: number, month: number, signal?: AbortSignal) =>
    api.get<ActiveDeductionsResponse>(`/api/hr/employees/${empId}/deductions/active`, { year, month }, signal),

  addEmployeeDeduction: (empId: number | string, data: EmployeeDeductionPayload) =>
    api.post<EmployeeDeduction>(`/api/hr/employees/${empId}/deductions`, data),

  updateEmployeeDeduction: (empId: number | string, id: number, data: EmployeeDeductionPayload) =>
    api.put<EmployeeDeduction>(`/api/hr/employees/${empId}/deductions/${id}`, data),

  deleteEmployeeDeduction: (empId: number | string, id: number) =>
    api.delete<void>(`/api/hr/employees/${empId}/deductions/${id}`),

  /* ── Faculty qualifications & credentials ────────────────────────────── */

  listQualifications: (empId: number | string, signal?: AbortSignal) =>
    api.get<StaffQualification[]>(`/api/hr/employees/${empId}/qualifications`, {}, signal),

  addQualification: (empId: number | string, data: StaffQualificationPayload) =>
    api.post<StaffQualification>(`/api/hr/employees/${empId}/qualifications`, data),

  updateQualification: (empId: number | string, id: number, data: StaffQualificationPayload) =>
    api.put<StaffQualification>(`/api/hr/employees/${empId}/qualifications/${id}`, data),

  deleteQualification: (empId: number | string, id: number) =>
    api.delete<void>(`/api/hr/employees/${empId}/qualifications/${id}`),

  /* ── Teaching subjects / specialisations ─────────────────────────────── */

  listSubjects: (empId: number | string, signal?: AbortSignal) =>
    api.get<StaffSubject[]>(`/api/hr/employees/${empId}/subjects`, {}, signal),

  addSubject: (empId: number | string, data: StaffSubjectPayload) =>
    api.post<StaffSubject>(`/api/hr/employees/${empId}/subjects`, data),

  updateSubject: (empId: number | string, id: number, data: StaffSubjectPayload) =>
    api.put<StaffSubject>(`/api/hr/employees/${empId}/subjects/${id}`, data),

  deleteSubject: (empId: number | string, id: number) =>
    api.delete<void>(`/api/hr/employees/${empId}/subjects/${id}`),

  /* ── Payroll Config ──────────────────────────────────────────────────── */

  getPayrollConfig: (signal?: AbortSignal) =>
    api.get<PayrollConfig>('/api/hr/config', {}, signal),

  updatePayrollConfig: (data: Partial<PayrollConfig>) =>
    api.put<{ updated: number }>('/api/hr/config', data),

  listCustomDeductions: (signal?: AbortSignal) =>
    api.get<CustomDeduction[]>('/api/hr/config/deductions', {}, signal),

  addCustomDeduction: (data: { label: string; description?: string; employee_rate: number; employer_rate: number }) =>
    api.post<CustomDeduction>('/api/hr/config/deductions', data),

  updateCustomDeduction: (id: number, data: { label: string; description?: string; employee_rate: number; employer_rate: number; is_active: number }) =>
    api.put<CustomDeduction>(`/api/hr/config/deductions/${id}`, data),

  deleteCustomDeduction: (id: number) =>
    api.delete<void>(`/api/hr/config/deductions/${id}`),

  /* ── Appraisals ─────────────────────────────────────────────────────── */

  appraisalStats: (signal?: AbortSignal) =>
    api.get<AppraisalStats>('/api/appraisals/stats', {}, signal),

  listAppraisalPeriods: (params?: { status?: string; year?: number }, signal?: AbortSignal) =>
    api.get<AppraisalPeriod[]>('/api/appraisals/periods', (params ?? {}) as Record<string, unknown>, signal),

  createAppraisalPeriod: (data: AppraisalPeriodPayload) =>
    api.post<AppraisalPeriod>('/api/appraisals/periods', data),

  updateAppraisalPeriod: (id: number, data: AppraisalPeriodPayload) =>
    api.put<AppraisalPeriod>(`/api/appraisals/periods/${id}`, data),

  setAppraisalPeriodStatus: (id: number, status: AppraisalPeriodStatus) =>
    api.patch<{ status: string }>(`/api/appraisals/periods/${id}/status`, { status }),

  deleteAppraisalPeriod: (id: number) =>
    api.delete<void>(`/api/appraisals/periods/${id}`),

  initiateAppraisals: (periodId: number) =>
    api.post<{ created: number; skipped: number }>(`/api/appraisals/periods/${periodId}/initiate`, {}),

  listCriteria: (periodId: number, signal?: AbortSignal) =>
    api.get<AppraisalCriterion[]>(`/api/appraisals/periods/${periodId}/criteria`, {}, signal),

  addCriterion: (periodId: number, data: AppraisalCriterionPayload) =>
    api.post<AppraisalCriterion>(`/api/appraisals/periods/${periodId}/criteria`, data),

  updateCriterion: (periodId: number, cid: number, data: AppraisalCriterionPayload) =>
    api.put<void>(`/api/appraisals/periods/${periodId}/criteria/${cid}`, data),

  deleteCriterion: (periodId: number, cid: number) =>
    api.delete<void>(`/api/appraisals/periods/${periodId}/criteria/${cid}`),

  listAppraisals: (params?: { period_id?: number; employee_id?: number; status?: string }, signal?: AbortSignal) =>
    api.get<Appraisal[]>('/api/appraisals', (params ?? {}) as Record<string, unknown>, signal),

  showAppraisal: (id: number, signal?: AbortSignal) =>
    api.get<Appraisal>(`/api/appraisals/${id}`, {}, signal),

  saveSelfAssessment: (id: number, data: SelfAssessmentPayload) =>
    api.patch<Appraisal>(`/api/appraisals/${id}/self`, data),

  saveSupervisorReview: (id: number, data: SupervisorReviewPayload) =>
    api.patch<Appraisal>(`/api/appraisals/${id}/supervisor`, data),

  saveHrReview: (id: number, data: HrReviewPayload) =>
    api.patch<Appraisal>(`/api/appraisals/${id}/hr`, data),

  /* ── Leave Management ───────────────────────────────────────────────── */

  leaveStats: (signal?: AbortSignal) =>
    api.get<LeaveStats>('/api/hr/leave/stats', {}, signal),

  leaveTypes: (signal?: AbortSignal) =>
    api.get<LeaveType[]>('/api/hr/leave/types', {}, signal),

  createLeaveType: (data: LeaveTypePayload) =>
    api.post<LeaveType>('/api/hr/leave/types', data),

  updateLeaveType: (id: number, data: LeaveTypePayload) =>
    api.put<LeaveType>(`/api/hr/leave/types/${id}`, data),

  deleteLeaveType: (id: number) =>
    api.delete<void>(`/api/hr/leave/types/${id}`),

  leaveRequests: (params: LeaveRequestParams = {}, signal?: AbortSignal) =>
    api.get<PaginatedResponse<LeaveRequest>>('/api/hr/leave/requests', params as Record<string, unknown>, signal),

  showLeaveRequest: (id: number, signal?: AbortSignal) =>
    api.get<LeaveRequest>(`/api/hr/leave/requests/${id}`, {}, signal),

  submitLeaveRequest: (data: LeaveRequestPayload) =>
    api.post<LeaveRequest>('/api/hr/leave/requests', data),

  approveLeave: (id: number, comment?: string) =>
    api.patch<void>(`/api/hr/leave/requests/${id}/approve`, { comment: comment ?? '' }),

  rejectLeave: (id: number, comment: string) =>
    api.patch<void>(`/api/hr/leave/requests/${id}/reject`, { comment }),

  cancelLeave: (id: number) =>
    api.delete<void>(`/api/hr/leave/requests/${id}`),

  leaveBalances: (params: LeaveBalanceParams = {}, signal?: AbortSignal) =>
    api.get<LeaveBalance[]>('/api/hr/leave/balances', params as Record<string, unknown>, signal),

  upsertLeaveBalance: (data: UpsertLeaveBalancePayload) =>
    api.post<void>('/api/hr/leave/balances', data),
}

/* ── Leave types ────────────────────────────────────────────────────────── */

export interface LeaveType {
  id:           number
  name:         string
  description:  string | null
  days_allowed: number
  is_paid:      number | boolean
  color:        string
  is_active:    number | boolean
  created_at?:  string
}

export interface LeaveTypePayload {
  name:         string
  description?: string
  days_allowed: number
  is_paid:      boolean
  color:        string
  is_active:    boolean
}

/* ── Leave requests ──────────────────────────────────────────────────────── */

export type LeaveStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled'

export interface LeaveRequest {
  id:               number
  employee_id:      number
  employee_name:    string
  department:       string | null
  position:         string | null
  leave_type_id:    number
  leave_type_name:  string
  leave_type_color: string
  is_paid:          number | boolean
  start_date:       string
  end_date:         string
  days_requested:   number
  reason:           string | null
  status:           LeaveStatus
  review_comment:   string | null
  reviewed_at:      string | null
  created_at:       string
}

export interface LeaveRequestPayload {
  employee_id:   number
  leave_type_id: number
  start_date:    string
  end_date:      string
  reason?:       string
}

export interface LeaveRequestParams {
  page?:           number
  per_page?:       number
  q?:              string
  status?:         LeaveStatus | ''
  employee_id?:    number
  leave_type_id?:  number
  year?:           number
}

/* ── Leave balances ──────────────────────────────────────────────────────── */

export interface LeaveBalance {
  id:              number
  employee_id:     number
  employee_name:   string
  department:      string | null
  leave_type_id:   number
  leave_type_name: string
  color:           string
  year:            number
  total_days:      number
  used_days:       number
  remaining_days:  number
}

export interface LeaveBalanceParams {
  employee_id?:   number
  leave_type_id?: number
  year?:          number
}

export interface UpsertLeaveBalancePayload {
  employee_id:   number
  leave_type_id: number
  year:          number
  total_days:    number
  used_days?:    number
}

/* ── Leave stats ─────────────────────────────────────────────────────────── */

/* ── Appraisal types ─────────────────────────────────────────────────────── */

export type AppraisalPeriodType = 'Annual' | 'Semi-Annual' | 'Quarterly' | 'Custom'
export type AppraisalPeriodStatus = 'Draft' | 'Active' | 'Closed'
export type AppraisalStatus = 'Draft' | 'Self-Review' | 'Supervisor-Review' | 'HR-Review' | 'Completed'
export type AppraisalGrade = 'Excellent' | 'Good' | 'Satisfactory' | 'Needs Improvement'

export interface AppraisalPeriod {
  id:                  number
  title:               string
  period_type:         AppraisalPeriodType
  year:                number
  start_date:          string
  end_date:            string
  submission_deadline: string | null
  status:              AppraisalPeriodStatus
  description:         string | null
  criteria_count:      number
  appraisal_count:     number
  created_at:          string
  updated_at:          string
}

export interface AppraisalPeriodPayload {
  title:               string
  period_type:         AppraisalPeriodType
  year:                number
  start_date:          string
  end_date:            string
  submission_deadline?: string | null
  status?:             AppraisalPeriodStatus
  description?:        string | null
}

export interface AppraisalCriterion {
  id:          number
  period_id:   number
  name:        string
  description: string | null
  weight:      number
  max_score:   number
  sort_order:  number
}

export interface AppraisalCriterionPayload {
  name:         string
  description?: string | null
  weight?:      number
  max_score?:   number
  sort_order?:  number
}

export interface AppraisalRating {
  id:                  number
  appraisal_id:        number
  criterion_id:        number
  criterion_name:      string
  criterion_description: string | null
  weight:              number
  max_score:           number
  sort_order:          number
  self_score:          number | null
  supervisor_score:    number | null
  self_comment:        string | null
  supervisor_comment:  string | null
}

export interface Appraisal {
  id:                     number
  period_id:              number
  employee_id:            number
  employee_name:          string
  department:             string | null
  position:               string | null
  period_title:           string
  period_year:            number
  submission_deadline:    string | null
  status:                 AppraisalStatus
  self_comment:           string | null
  supervisor_comment:     string | null
  hr_comment:             string | null
  self_total_score:       number | null
  supervisor_total_score: number | null
  final_score:            number | null
  final_grade:            AppraisalGrade | null
  submitted_at:           string | null
  supervisor_reviewed_at: string | null
  completed_at:           string | null
  ratings:                AppraisalRating[]
  created_at:             string
  updated_at:             string
}

export interface AppraisalStats {
  periods:   number
  active:    number
  total:     number
  completed: number
  pending:   number
  inReview:  number
  byStatus:  { status: string; total: number }[]
}

export interface AppraisalRatingPayload {
  criterion_id:        number
  self_score?:         number | null
  self_comment?:       string | null
  supervisor_score?:   number | null
  supervisor_comment?: string | null
}

export interface SelfAssessmentPayload {
  self_comment?: string | null
  ratings:       AppraisalRatingPayload[]
  submit?:       boolean
}

export interface SupervisorReviewPayload {
  supervisor_comment?: string | null
  ratings:             AppraisalRatingPayload[]
  submit?:             boolean
}

export interface HrReviewPayload {
  hr_comment?:   string | null
  final_score?:  number | null
  final_grade?:  AppraisalGrade | null
  complete?:     boolean
}

export interface LeaveStats {
  pending:             number
  approved:            number
  rejected:            number
  total:               number
  on_leave_today:      number
  approved_this_month: number
  by_type:             { name: string; color: string; total: number; total_days: number }[]
  monthly_trend:       { month: number; count: number }[]
}
