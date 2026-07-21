import { api, apiClient } from '@/services/api'
import type { ServiceRequestSummary, RequestStep, RequestProgress } from '@/types/serviceRequest'

export interface ServiceRequestTrackResult {
  request_code: string
  service_name: string | null
  status: string
  steps: RequestStep[]
  current_step: number
  total_steps: number
  submitted_at: string | null
  completed_at: string | null
}

export const serviceRequestService = {
  submit: (serviceSlug: string, fields: Record<string, string>, files: Record<string, File>) => {
    const form = new FormData()
    form.append('service_slug', serviceSlug)
    Object.entries(fields).forEach(([key, value]) => form.append(key, value))
    Object.entries(files).forEach(([key, file]) => form.append(key, file))
    return api.upload<ServiceRequestSummary>('/api/service-requests', form)
  },

  resubmit: (id: number, fields: Record<string, string>, files: Record<string, File>) => {
    const form = new FormData()
    Object.entries(fields).forEach(([key, value]) => form.append(key, value))
    Object.entries(files).forEach(([key, file]) => form.append(key, file))
    return api.upload<ServiceRequestSummary>(`/api/service-requests/${id}/resubmit`, form)
  },

  myRequests: (signal?: AbortSignal) =>
    api.get<ServiceRequestSummary[]>('/api/service-requests/mine', {}, signal),

  getCheckoutLink: (id: number) =>
    api.get<{ checkout_url: string; amount: number; currency: string }>(`/api/service-requests/${id}/checkout-link`),

  /** Auth is a bearer JWT, so a plain <a href> won't carry it — fetch as a blob and save it. */
  download: async (id: number, token: string, requestCode: string) => {
    const response = await apiClient.get(
      `/api/service-requests/${id}/download`,
      { params: { token }, responseType: 'blob' },
    )
    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `${requestCode}.pdf`)
    document.body.appendChild(link)
    link.click()
    link.parentNode?.removeChild(link)
    window.URL.revokeObjectURL(url)
  },

  track: (requestCode: string, identifier: string, signal?: AbortSignal) =>
    api.get<ServiceRequestTrackResult>('/api/services/track', { request_code: requestCode, identifier }, signal),

  getProgress: (id: number, signal?: AbortSignal) =>
    api.get<RequestProgress>(`/api/service-requests/${id}/progress`, {}, signal),
}
