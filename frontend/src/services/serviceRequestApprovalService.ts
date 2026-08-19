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

  /**
   * Supervisory void — cancels a request outside the per-stage chain.
   * Gated server-side on VOID_SERVICE_REQUEST; the reason is written to the
   * audit trail and included in the notification sent to the requester.
   */
  voidRequest: (id: number, reason: string) =>
    api.post<ServiceRequestSummary>(`/api/admin/service-requests/${id}/void`, { reason }),
}
