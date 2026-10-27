import { api } from '@/services/api'

export type IssueSeverity = 'error' | 'warning'

export interface DataQualityIssue {
  code: string
  severity: IssueSeverity
  field: string
  message: string
}

export interface DataQualityEmployee {
  employee_id: number
  name: string
  bank: string
  account: string
  issues: DataQualityIssue[]
}

export interface DataQualityReport {
  scope: string
  active_employees: number
  clean_employees: number
  blocked_employees: number
  issue_counts: Record<string, number>
  employees: DataQualityEmployee[]
}

export const payrollReferenceService = {
  dataQuality: (salaryReviewAbove?: string) =>
    api.get<DataQualityReport>(
      '/hr/payroll/data-quality',
      salaryReviewAbove ? { salary_review_above: salaryReviewAbove } : undefined,
    ),
}
