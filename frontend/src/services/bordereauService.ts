const API_BASE_URL = import.meta.env.VITE_API_URL ?? ''

export interface BordereauSubmission {
  id: number
  status: 'pending' | 'approved' | 'rejected'
  receipt_number: string
  amount: number
  attempt: number
  rejection_reason?: string
  reviewed_at?: string
}

export interface BordereauSubmissionStatus {
  application_id: number
  required_amount: number
  current_submission: BordereauSubmission | null
  can_submit: boolean
  resubmit_reason?: string
  remaining_attempts: number
}

export interface PendingBordereauSubmission {
  id: number
  application_id: number
  student_id: string
  receipt_number: string
  amount: number
  bank_name?: string
  account_holder_name?: string
  payment_date?: string
  notes?: string
  status: 'pending' | 'approved' | 'rejected'
  submission_attempt: number
  rejection_reason?: string
  reviewed_by?: number
  reviewed_at?: string
  created_at: string
  first_name: string
  last_name: string
  application_reference: string
  required_amount: number
  is_read: boolean
}

export const bordereauService = {
  // ── Applicant Endpoints ───────────────────────────────────────────────────

  /**
   * Get current Bordereau submission status for an application
   */
  async getSubmissionStatus(applicationId: number): Promise<BordereauSubmissionStatus> {
    const response = await fetch(
      `${API_BASE_URL}/api/applicant/bordereau/${applicationId}/status`,
      { credentials: 'include' }
    )
    if (!response.ok) throw new Error(`Status: ${response.status}`)
    const json = await response.json()
    return json.data || json
  },

  /**
   * Submit a Bordereau receipt number for verification
   */
  async submitReceipt(data: {
    application_id: number
    receipt_number: string
    amount: number
    bank_name?: string
    account_holder_name?: string
    payment_date?: string
  }): Promise<{
    success: boolean
    message: string
    submission_id: number
    attempt: number
    remaining_attempts: number
  }> {
    const response = await fetch(`${API_BASE_URL}/api/applicant/bordereau/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      credentials: 'include',
    })
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || `Status: ${response.status}`)
    }
    const json = await response.json()
    return json.data || json
  },

  // ── Finance/Registrar Endpoints ───────────────────────────────────────────

  /**
   * Get pending Bordereau submissions for review (Finance/Registrar only)
   */
  async getPendingSubmissions(role: 'finance' | 'registrar'): Promise<{
    pending_count: number
    submissions: PendingBordereauSubmission[]
  }> {
    const response = await fetch(
      `${API_BASE_URL}/api/finance/bordereau/pending?role=${role}`,
      { credentials: 'include' }
    )
    if (!response.ok) throw new Error(`Status: ${response.status}`)
    const json = await response.json()
    return json.data || json
  },

  /**
   * Approve a Bordereau submission (Finance/Registrar only)
   */
  async approveBordereau(submissionId: number): Promise<{
    success: boolean
    message: string
    application_id: number
  }> {
    const formData = new FormData()
    formData.append('submission_id', submissionId.toString())

    const response = await fetch(
      `${API_BASE_URL}/api/finance/bordereau/${submissionId}/approve`,
      {
        method: 'POST',
        body: formData,
        credentials: 'include',
      }
    )
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || `Status: ${response.status}`)
    }
    const json = await response.json()
    return json.data || json
  },

  /**
   * Reject a Bordereau submission with reason (Finance/Registrar only)
   */
  async rejectBordereau(submissionId: number, rejectionReason: string): Promise<{
    success: boolean
    message: string
    can_resubmit: boolean
    remaining_attempts: number
    application_id: number
  }> {
    const response = await fetch(
      `${API_BASE_URL}/api/finance/bordereau/${submissionId}/reject`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission_id: submissionId, rejection_reason: rejectionReason }),
        credentials: 'include',
      }
    )
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || `Status: ${response.status}`)
    }
    const json = await response.json()
    return json.data || json
  },

  /**
   * Get dashboard statistics (Finance only)
   */
  async getDashboardStats(): Promise<{
    pending_count: number
    approved_count: number
    rejected_count: number
    total_approved_amount: number
    last_submission_date: string
  }> {
    const response = await fetch(
      `${API_BASE_URL}/api/finance/bordereau/dashboard-stats`,
      { credentials: 'include' }
    )
    if (!response.ok) throw new Error(`Status: ${response.status}`)
    const json = await response.json()
    return json.data?.stats || json
  },
}
