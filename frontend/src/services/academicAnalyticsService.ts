import { api } from '@/services/api'

/* ── Overview ──────────────────────────────────────────────────────────── */

export interface AnalyticsOverview {
  students:           number
  assessed_students:  number
  assessed_modules:   number
  modules_with_marks: number
  total_records:      number
  passed:             number
  failed:             number
  pass_rate:          number
  avg_percentage:     number
  attendance_rate:    number
  attendance_total:   number
}

/* ── Grade Distribution ────────────────────────────────────────────────── */

export interface GradeDistributionItem {
  grade:      string
  count:      number
  percentage: number
}

export interface GradeDistributionResponse {
  distribution: GradeDistributionItem[]
  total:        number
}

/* ── Pass / Fail Rates ─────────────────────────────────────────────────── */

export interface PassFailRow {
  id:        number | string
  label:     string
  name:      string
  total:     number
  passed:    number
  failed:    number
  pass_rate: number
  avg_pct:   number
}

export interface PassFailResponse {
  group_by: 'module' | 'department'
  rows:     PassFailRow[]
}

/* ── Enrollment Trends ─────────────────────────────────────────────────── */

export interface EnrollmentTrendRow {
  year_label:    string
  total:         number
  male:          number
  female:        number
  undergraduate: number
  postgraduate:  number
  masters:       number
}

export interface ProgramEnrollmentRow {
  program_name: string
  count:        number
}

export interface EnrollmentTrendsResponse {
  trends:      EnrollmentTrendRow[]
  latest_year: string | null
  by_program:  ProgramEnrollmentRow[]
}

/* ── Department Performance ────────────────────────────────────────────── */

export interface DepartmentPerformanceRow {
  department:        string
  modules_assessed:  number
  students_assessed: number
  total_records:     number
  passed:            number
  pass_rate:         number
  avg_percentage:    number
  min_percentage:    number
  max_percentage:    number
}

export interface DepartmentPerformanceResponse {
  rows: DepartmentPerformanceRow[]
}

/* ── Attendance Compliance ─────────────────────────────────────────────── */

export interface AttendanceComplianceRow {
  program:         string
  total_records:   number
  present:         number
  absent:          number
  late:            number
  excused:         number
  modules_tracked: number
  attendance_rate: number
}

export interface AttendanceOverall {
  total:           number
  present:         number
  absent:          number
  attendance_rate: number
}

export interface AttendanceComplianceResponse {
  rows:    AttendanceComplianceRow[]
  overall: AttendanceOverall
}

/* ── Shared filter params ──────────────────────────────────────────────── */

export interface AnalyticsFilterParams {
  academic_year_id?: number
  option_id?:        number
  department_id?:    number
  group_by?:         'module' | 'department'
  limit?:            number
}

/* ── Service ───────────────────────────────────────────────────────────── */

const BASE = '/academic-analytics'

export const academicAnalyticsService = {
  overview: (params: Pick<AnalyticsFilterParams, 'academic_year_id'> = {}, signal?: AbortSignal) =>
    api.get<AnalyticsOverview>(`${BASE}/overview`, params as Record<string, unknown>, signal),

  gradeDistribution: (params: AnalyticsFilterParams = {}, signal?: AbortSignal) =>
    api.get<GradeDistributionResponse>(`${BASE}/grade-distribution`, params as Record<string, unknown>, signal),

  passFailRates: (params: AnalyticsFilterParams = {}, signal?: AbortSignal) =>
    api.get<PassFailResponse>(`${BASE}/pass-fail-rates`, params as Record<string, unknown>, signal),

  enrollmentTrends: (signal?: AbortSignal) =>
    api.get<EnrollmentTrendsResponse>(`${BASE}/enrollment-trends`, {}, signal),

  departmentPerformance: (params: Pick<AnalyticsFilterParams, 'academic_year_id'> = {}, signal?: AbortSignal) =>
    api.get<DepartmentPerformanceResponse>(`${BASE}/department-performance`, params as Record<string, unknown>, signal),

  attendanceCompliance: (params: Pick<AnalyticsFilterParams, 'academic_year_id'> = {}, signal?: AbortSignal) =>
    api.get<AttendanceComplianceResponse>(`${BASE}/attendance-compliance`, params as Record<string, unknown>, signal),
}
