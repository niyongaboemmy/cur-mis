import { api } from '@/services/api'

export type TranscriptStatus = 'pending' | 'approved' | 'dispatched' | 'rejected'
export type TranscriptType   = 'official' | 'unofficial'

export interface TranscriptRequest {
  id:               number
  student_id:       number
  academic_year_id: number | null
  request_type:     TranscriptType
  purpose:          string | null
  copies:           number
  status:           TranscriptStatus
  reviewed_by:      number | null
  reviewed_at:      string | null
  dispatch_notes:   string | null
  fee_paid:         boolean
  created_at:       string
  updated_at:       string
  regnumber:        string
  fname:            string
  lname:            string
  year_label:       string | null
  reviewed_by_name: string | null
}

export interface TranscriptListResponse {
  data:      TranscriptRequest[]
  total:     number
  page:      number
  per_page:  number
  last_page: number
}

export interface TranscriptListParams {
  status?:           TranscriptStatus
  academic_year_id?: number
  search?:           string
  page?:             number
  per_page?:         number
}

export interface TranscriptCreatePayload {
  request_type?:     TranscriptType
  purpose?:          string
  copies?:           number
  academic_year_id?: number
}

export interface TranscriptReviewPayload {
  action: 'approve' | 'reject'
}

export interface TranscriptDispatchPayload {
  dispatch_notes?: string
}

export const transcriptService = {
  /** Admin: list all requests */
  list: (params: TranscriptListParams = {}, signal?: AbortSignal) =>
    api.get<TranscriptListResponse>('/api/transcripts', params as Record<string, unknown>, signal),

  /** Student: own requests */
  myRequests: (signal?: AbortSignal) =>
    api.get<TranscriptRequest[]>('/api/transcripts/my', {}, signal),

  /** Student: submit new request */
  create: (payload: TranscriptCreatePayload) =>
    api.post<{ id: number }>('/api/transcripts/my', payload),

  /** Admin: approve or reject */
  review: (id: number, payload: TranscriptReviewPayload) =>
    api.put<{ status: TranscriptStatus }>(`/api/transcripts/${id}/review`, payload),

  /** Admin: dispatch */
  dispatch: (id: number, payload: TranscriptDispatchPayload = {}) =>
    api.put<null>(`/api/transcripts/${id}/dispatch`, payload),
}
