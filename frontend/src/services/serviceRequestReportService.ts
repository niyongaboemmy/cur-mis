import { api, apiClient } from '@/services/api'

export interface ServiceRequestTotals {
  total: number
  pending_review: number
  awaiting_payment: number
  paid_or_completed: number
  completed: number
  rejected: number
  cancelled: number
  revenue: number
}

export interface StatusCount {
  status: string
  count: number
}

export interface ServiceBreakdown {
  id: number
  name: string
  total: number
  completed: number
  rejected: number
  revenue: number
}

export interface TrendPoint {
  day: string
  count: number
}

export interface Turnaround {
  avg_hours: number | null
  sample_size: number
}

export interface StageWorkload {
  stage_label: string
  service_name: string
  count: number
}

export interface RecentRequest {
  id: number
  request_code: string
  full_name: string
  status: string
  submitted_at: string | null
  service_name: string
}

export interface ServiceRequestReportOverview {
  totals: ServiceRequestTotals
  status_breakdown: StatusCount[]
  by_service: ServiceBreakdown[]
  trend: TrendPoint[]
  turnaround: Turnaround
  stage_workload: StageWorkload[]
  recent: RecentRequest[]
}

export type ReportFilter =
  | 'total'
  | 'pending_review'
  | 'awaiting_payment'
  | 'completed'
  | 'rejected_cancelled'
  | 'in_review'
  | 'paid_or_completed'

export interface ServiceRequestListRow {
  id: number
  request_code: string
  full_name: string
  email: string | null
  phone: string | null
  status: string
  submitted_at: string | null
  completed_at: string | null
  service_name: string
  amount_due: string | number | null
  amount_paid: string | number | null
  invoice_status: string | null
}

export interface PaginatedList<T> {
  data: T[]
  total: number
  per_page: number
  current_page: number
  last_page: number
  filter: ReportFilter
}

export const serviceRequestReportService = {
  getOverview: (days = 30, signal?: AbortSignal) =>
    api.get<ServiceRequestReportOverview>('/service-requests/reports/overview', { days }, signal),

  getList: (filter: ReportFilter, page: number, perPage = 15, signal?: AbortSignal) =>
    api.get<PaginatedList<ServiceRequestListRow>>(
      '/service-requests/reports/list',
      { filter, page, per_page: perPage },
      signal,
    ),

  /** Auth is a bearer JWT, so a plain link/window.open won't carry it — fetch as a blob and save it. */
  exportCsv: async (filter: ReportFilter) => {
    const response = await apiClient.get('/service-requests/reports/export', {
      params: { filter },
      responseType: 'blob',
    })
    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `service-requests-${filter}-${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    link.parentNode?.removeChild(link)
    window.URL.revokeObjectURL(url)
  },
}
