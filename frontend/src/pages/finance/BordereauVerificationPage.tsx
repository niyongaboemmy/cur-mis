import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  Loader2, AlertCircle, CheckCircle2, XCircle, MessageCircle, Receipt,
  Building2, User, Calendar, Inbox, Clock, Eye, EyeOff, FileText, X,
} from 'lucide-react'
import { bordereauService } from '@/services/bordereauService'
import Modal from '@/components/ui/Modal'

interface SubmissionForReview {
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
  created_at: string
  first_name: string
  last_name: string
  application_reference: string
  required_amount: number
  is_read: boolean
}

export default function BordereauVerificationPage() {
  const qc = useQueryClient()
  const [userRole] = useState<'finance' | 'registrar'>('finance')
  const [selectedSubmission, setSelectedSubmission] = useState<SubmissionForReview | null>(null)
  const [actionModalOpen, setActionModalOpen] = useState(false)
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [showRead, setShowRead] = useState(false)
  const [showBankSlipModal, setShowBankSlipModal] = useState(false)

  const submissionsQ = useQuery({
    queryKey: ['bordereau-pending', userRole],
    queryFn: () => bordereauService.getPendingSubmissions(userRole),
    refetchInterval: 5000,
  })

  const statsQ = useQuery({
    queryKey: ['bordereau-stats'],
    queryFn: () => bordereauService.getDashboardStats(),
    refetchInterval: 30000,
  })

  const approveMutation = useMutation({
    mutationFn: (submissionId: number) => bordereauService.approveBordereau(submissionId),
    onSuccess: (res) => {
      toast.success(res.message)
      setActionModalOpen(false)
      setSelectedSubmission(null)
      qc.invalidateQueries({ queryKey: ['bordereau-pending', userRole] })
      qc.invalidateQueries({ queryKey: ['bordereau-stats'] })
    },
    onError: (e: any) => {
      toast.error(e.message || 'Failed to approve')
    },
  })

  const rejectMutation = useMutation({
    mutationFn: (submissionId: number) =>
      bordereauService.rejectBordereau(submissionId, rejectionReason),
    onSuccess: (res) => {
      toast.success(res.message)
      setActionModalOpen(false)
      setSelectedSubmission(null)
      setRejectionReason('')
      qc.invalidateQueries({ queryKey: ['bordereau-pending', userRole] })
      qc.invalidateQueries({ queryKey: ['bordereau-stats'] })
    },
    onError: (e: any) => {
      toast.error(e.message || 'Failed to reject')
    },
  })

  const submissions = submissionsQ.data?.submissions ?? []
  const stats = statsQ.data
  const unreadCount = submissions.filter((s) => !s.is_read).length

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {/* Page header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
              <Receipt className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-ink-900 dark:text-white">
                Bordereau Payment Verification
              </h1>
              <p className="text-sm text-ink-500">Review and approve student Bordereau payments</p>
            </div>
          </div>
          <button
            onClick={() => setShowBankSlipModal(true)}
            className="btn-secondary flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <FileText className="w-4 h-4" />
            Bank Slip
          </button>
        </div>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 rounded-2xl">
            <p className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wide mb-1">
              Pending Review
            </p>
            <p className="text-2xl font-black text-amber-900 dark:text-amber-100">
              {stats.pending_count}
            </p>
            {unreadCount > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                {unreadCount} unread
              </p>
            )}
          </div>
          <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-900/40 rounded-2xl">
            <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide mb-1">
              Approved
            </p>
            <p className="text-2xl font-black text-emerald-900 dark:text-emerald-100">
              {stats.approved_count}
            </p>
          </div>
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 rounded-2xl">
            <p className="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-wide mb-1">
              Rejected
            </p>
            <p className="text-2xl font-black text-red-900 dark:text-red-100">
              {stats.rejected_count}
            </p>
          </div>
          <div className="p-4 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-900/40 rounded-2xl">
            <p className="text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wide mb-1">
              Total Approved
            </p>
            <p className="text-2xl font-black text-primary-900 dark:text-primary-100">
              {stats.total_approved_amount?.toLocaleString('en-US', {
                style: 'currency',
                currency: 'RWF',
                minimumFractionDigits: 0,
              })}
            </p>
          </div>
        </div>
      )}

      {/* Submissions list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Inbox className="w-4 h-4 text-ink-500" />
            <h2 className="font-bold text-ink-900 dark:text-white">
              Pending Submissions
              {submissions.length > 0 && (
                <span className="ml-2 inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-600 text-white text-xs font-black">
                  {submissions.length}
                </span>
              )}
            </h2>
          </div>
          <button
            onClick={() => setShowRead(!showRead)}
            className="text-xs font-bold text-ink-600 dark:text-ink-400 hover:text-primary-600 transition-colors inline-flex items-center gap-1"
          >
            {showRead ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {showRead ? 'Hide' : 'Show'} Read
          </button>
        </div>

        {submissionsQ.isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
          </div>
        ) : submissions.length === 0 ? (
          <div className="text-center py-12 bg-ink-50 dark:bg-ink-900/20 rounded-2xl border border-ink-100 dark:border-ink-800">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-3 opacity-50" />
            <p className="text-ink-500 font-medium">All pending submissions have been reviewed!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {submissions
              .filter((s) => showRead || !s.is_read)
              .map((submission) => (
                <button
                  key={submission.id}
                  onClick={() => {
                    setSelectedSubmission(submission)
                    setActionModalOpen(true)
                  }}
                  className={`w-full text-left p-4 rounded-2xl border transition-all group hover:-translate-y-0.5 hover:shadow-lg ${
                    submission.is_read
                      ? 'bg-white dark:bg-ink-900 border-ink-100 dark:border-ink-800'
                      : 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-900/40 ring-1 ring-amber-100 dark:ring-amber-900/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    {/* Left content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-black bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 px-2 py-0.5 rounded">
                          #{submission.application_reference}
                        </span>
                        {!submission.is_read && (
                          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                        )}
                      </div>
                      <h3 className="font-black text-ink-900 dark:text-white mb-2">
                        {submission.first_name} {submission.last_name}
                      </h3>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div>
                          <p className="text-ink-500 dark:text-ink-400 mb-0.5">Receipt #</p>
                          <p className="font-mono font-bold text-ink-900 dark:text-white">
                            {submission.receipt_number}
                          </p>
                        </div>
                        <div>
                          <p className="text-ink-500 dark:text-ink-400 mb-0.5">Amount</p>
                          <p className="font-black text-ink-900 dark:text-white">
                            {submission.amount.toLocaleString('en-US', {
                              style: 'currency',
                              currency: 'RWF',
                              minimumFractionDigits: 0,
                            })}
                          </p>
                        </div>
                        {submission.bank_name && (
                          <div>
                            <p className="text-ink-500 dark:text-ink-400 mb-0.5 inline-flex items-center gap-1">
                              <Building2 className="w-2.5 h-2.5" /> Bank
                            </p>
                            <p className="font-bold text-ink-900 dark:text-white">
                              {submission.bank_name}
                            </p>
                          </div>
                        )}
                        <div>
                          <p className="text-ink-500 dark:text-ink-400 mb-0.5 inline-flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" /> Submitted
                          </p>
                          <p className="font-bold text-ink-900 dark:text-white">
                            {new Date(submission.created_at).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Status badge */}
                    <div className="flex-shrink-0">
                      <div className="text-right">
                        <p className="text-xs text-ink-500 dark:text-ink-400 mb-1">Attempt</p>
                        <p className="text-lg font-black text-primary-600">
                          {submission.submission_attempt}/3
                        </p>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
          </div>
        )}
      </div>

      {/* Action Modal */}
      <Modal
        open={actionModalOpen}
        onClose={() => {
          setActionModalOpen(false)
          setSelectedSubmission(null)
          setRejectionReason('')
          setActionType(null)
        }}
        title={
          selectedSubmission
            ? `${selectedSubmission.first_name} ${selectedSubmission.last_name}`
            : 'Review Submission'
        }
      >
        {selectedSubmission && (
          <div className="space-y-5 py-4">
            {/* Submission details */}
            <div className="space-y-3 p-4 bg-ink-50 dark:bg-ink-900/20 rounded-2xl">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-bold text-ink-500 dark:text-ink-400 uppercase tracking-wide mb-1">
                    Receipt Number
                  </p>
                  <p className="font-mono font-black text-ink-900 dark:text-white">
                    {selectedSubmission.receipt_number}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold text-ink-500 dark:text-ink-400 uppercase tracking-wide mb-1">
                    Amount Paid
                  </p>
                  <p className="font-black text-ink-900 dark:text-white">
                    {selectedSubmission.amount.toLocaleString('en-US', {
                      style: 'currency',
                      currency: 'RWF',
                      minimumFractionDigits: 0,
                    })}
                  </p>
                </div>
              </div>

              <div className="h-px bg-ink-200 dark:bg-ink-700" />

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-ink-500 dark:text-ink-400 mb-1">Required Amount</p>
                  <p className="font-bold text-emerald-600">
                    {selectedSubmission.required_amount.toLocaleString('en-US', {
                      style: 'currency',
                      currency: 'RWF',
                      minimumFractionDigits: 0,
                    })}
                  </p>
                </div>
                {selectedSubmission.bank_name && (
                  <div>
                    <p className="text-ink-500 dark:text-ink-400 mb-1 inline-flex items-center gap-1">
                      <Building2 className="w-2.5 h-2.5" /> Bank
                    </p>
                    <p className="font-bold text-ink-900 dark:text-white">
                      {selectedSubmission.bank_name}
                    </p>
                  </div>
                )}
                {selectedSubmission.account_holder_name && (
                  <div>
                    <p className="text-ink-500 dark:text-ink-400 mb-1 inline-flex items-center gap-1">
                      <User className="w-2.5 h-2.5" /> Account Holder
                    </p>
                    <p className="font-bold text-ink-900 dark:text-white">
                      {selectedSubmission.account_holder_name}
                    </p>
                  </div>
                )}
                {selectedSubmission.payment_date && (
                  <div>
                    <p className="text-ink-500 dark:text-ink-400 mb-1 inline-flex items-center gap-1">
                      <Calendar className="w-2.5 h-2.5" /> Payment Date
                    </p>
                    <p className="font-bold text-ink-900 dark:text-white">
                      {new Date(selectedSubmission.payment_date).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Amount verification check */}
            {selectedSubmission.amount === selectedSubmission.required_amount ? (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-900/40 rounded-lg text-xs text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="w-4 h-4 inline mr-2" />
                Amount matches required fee exactly
              </div>
            ) : selectedSubmission.amount > selectedSubmission.required_amount ? (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900/40 rounded-lg text-xs text-blue-700 dark:text-blue-300">
                <AlertCircle className="w-4 h-4 inline mr-2" />
                Amount is higher than required
              </div>
            ) : (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 rounded-lg text-xs text-red-700 dark:text-red-300">
                <AlertCircle className="w-4 h-4 inline mr-2" />
                Amount is lower than required
              </div>
            )}

            {/* Reject reason input (shown only when rejecting) */}
            {actionType === 'reject' && (
              <div>
                <label className="block text-xs font-bold text-ink-600 dark:text-ink-400 mb-2 uppercase tracking-wide">
                  <MessageCircle className="w-3 h-3 inline mr-1" />
                  Rejection Reason *
                </label>
                <textarea
                  placeholder="Explain why this payment cannot be verified..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full px-3 py-2 border border-ink-200 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none h-20"
                />
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-2">
              {actionType === null && (
                <>
                  <button
                    onClick={() => setActionType('approve')}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-lg transition-colors inline-flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Approve Payment
                  </button>
                  <button
                    onClick={() => setActionType('reject')}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-lg transition-colors inline-flex items-center justify-center gap-2"
                  >
                    <XCircle className="w-4 h-4" />
                    Reject Payment
                  </button>
                </>
              )}

              {actionType === 'approve' && (
                <>
                  <button
                    onClick={() => setActionType(null)}
                    className="flex-1 bg-ink-100 dark:bg-ink-800 text-ink-900 dark:text-white font-bold py-2.5 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => approveMutation.mutate(selectedSubmission.id)}
                    disabled={approveMutation.isPending}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg transition-colors inline-flex items-center justify-center gap-2"
                  >
                    {approveMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Approving...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        Confirm Approval
                      </>
                    )}
                  </button>
                </>
              )}

              {actionType === 'reject' && (
                <>
                  <button
                    onClick={() => setActionType(null)}
                    className="flex-1 bg-ink-100 dark:bg-ink-800 text-ink-900 dark:text-white font-bold py-2.5 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => rejectMutation.mutate(selectedSubmission.id)}
                    disabled={!rejectionReason || rejectMutation.isPending}
                    className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg transition-colors inline-flex items-center justify-center gap-2"
                  >
                    {rejectMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Rejecting...
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4" />
                        Confirm Rejection
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Bank Slip Modal */}
      {showBankSlipModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70 backdrop-blur-sm p-4">
          <div className="w-[60%] h-[90vh] max-h-[90vh] bg-white dark:bg-ink-800 rounded-xl shadow-2xl flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-ink-100 dark:border-ink-700 shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-green-600" />
                <h2 className="text-sm font-semibold text-ink-800 dark:text-white">Bank Slip Management</h2>
              </div>
              <button
                onClick={() => setShowBankSlipModal(false)}
                className="p-1.5 hover:bg-ink-100 dark:hover:bg-ink-700 rounded-lg transition-colors"
                title="Close modal"
              >
                <X className="w-4 h-4 text-ink-500 dark:text-ink-400" />
              </button>
            </div>

            {/* Modal Body - iFrame */}
            <div className="flex-1 overflow-hidden bg-white dark:bg-ink-900">
              <iframe
                src="https://cur.ac.rw/umis/finance/bank_slip/index.php?tab=registrar"
                className="w-full h-full border-none"
                title="Bank Slip Portal"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
