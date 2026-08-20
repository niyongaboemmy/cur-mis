import { api } from '@/services/api'
import type { ServiceRequestSummary } from '@/types/serviceRequest'

export interface ApprovalQueueRow extends ServiceRequestSummary {
  stage_label: string
  is_final_approval: 0 | 1
}

export const serviceRequestApprovalService = {
  getQueue: (signal?: AbortSignal) =>
    api.get<ApprovalQueueRow[]>('/api/service-requests/approvals/queue', {}, signal),

  decide: (id: number, decision: 'approved' | 'rejected' | 'changes_requested', comment?: string) =>
    api.post<ServiceRequestSummary>(`/api/service-requests/approvals/${id}/decide`, { decision, comment }),
}
