import { api } from '@/services/api'

export type RevaluationStatus = 'pending' | 'approved' | 'processed' | 'rejected'

export interface Revaluation {
  id:               number
  student_id:       number
  exam_id:          number          // module_marks.id being contested
  reason:           string
  fee_paid:         string | number
  status:           RevaluationStatus
  new_marks:        string | number | null
  reviewed_by:      number | null
  reviewed_by_name: string | null
  reviewed_at:      string | null
  created_at:       string
  // joined context
  regnumber?:       string
  fname?:           string
  lname?:           string
  current_marks?:   string | number | null
  current_grade?:   string | null
  module_code?:     string
  module_name?:     string
}

export interface BacklogRow {
  mark_id:        number
  percentage:     string | number | null
  grade:          string | null
  total:          string | number | null
  module_id:      number
  module_code:    string
  module_name:    string
  module_credits: number | string
  term_label:     string | null
  year_label:     string | null
}

export interface RevaluationReview {
  status:     RevaluationStatus
  new_marks?: number
  fee_paid?:  number
}

export const STATUS_LABELS: Record<RevaluationStatus, string> = {
  pending:   'Pending review',
  approved:  'Approved',
  processed: 'Processed',
  rejected:  'Rejected',
}

export const revaluationService = {
  // Student self-service
  myRequests: () => api.get<Revaluation[]>('/revaluations/my'),
  myBacklog:  () => api.get<BacklogRow[]>('/revaluations/my-backlog'),
  request: (markId: number, reason: string) =>
    api.post<Revaluation>('/revaluations/request', { mark_id: markId, reason }),

  // Staff
  list: (status?: RevaluationStatus) =>
    api.get<Revaluation[]>('/revaluations', status ? { status } : {}),
  backlogById: (studentId: number | string) =>
    api.get<BacklogRow[]>(`/api/revaluations/backlog/by-id/${studentId}`),
  review: (id: number, payload: RevaluationReview) =>
    api.put<Revaluation>(`/api/revaluations/${id}`, payload),
}
