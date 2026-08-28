import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  AlertCircle, CheckCircle2, Clock, Loader2, Send, AlertTriangle, RotateCcw,
  Receipt, Building2, User, Calendar,
} from 'lucide-react'
import { bordereauService } from '@/services/bordereauService'
import Modal from '@/components/ui/Modal'

interface BordereauPaymentFormProps {
  applicationId: number
  requiredAmount: number
  isOpen: boolean
  onClose: () => void
  onApproved?: () => void
}

export default function BordereauPaymentForm({
  applicationId,
  requiredAmount,
  isOpen,
  onClose,
}: BordereauPaymentFormProps) {
  const qc = useQueryClient()
  const [formStep, setFormStep] = useState<'form' | 'submitted'>('form')
  const [formData, setFormData] = useState({
    receipt_number: '',
    amount: requiredAmount.toString(),
    bank_name: '',
    account_holder_name: '',
    payment_date: new Date().toISOString().split('T')[0],
  })

  const statusQ = useQuery({
    queryKey: ['bordereau-status', applicationId],
    queryFn: () => bordereauService.getSubmissionStatus(applicationId),
    enabled: isOpen,
  })

  const status = statusQ.data
  const currentSubmission = status?.current_submission

  useEffect(() => {
    if (!isOpen) {
      setFormStep('form')
      setFormData({
        receipt_number: '',
        amount: requiredAmount.toString(),
        bank_name: '',
        account_holder_name: '',
        payment_date: new Date().toISOString().split('T')[0],
      })
    }
  }, [isOpen, requiredAmount])

  const submitMutation = useMutation({
    mutationFn: () =>
      bordereauService.submitReceipt({
        application_id: applicationId,
        receipt_number: formData.receipt_number,
        amount: parseFloat(formData.amount),
        bank_name: formData.bank_name || undefined,
        account_holder_name: formData.account_holder_name || undefined,
        payment_date: formData.payment_date || undefined,
      }),
    onSuccess: (res) => {
      toast.success(res.message)
      setFormStep('submitted')
      qc.invalidateQueries({ queryKey: ['bordereau-status', applicationId] })
      setTimeout(() => {
        onClose()
      }, 2000)
    },
    onError: (e: any) => {
      toast.error(e.message || 'Failed to submit receipt')
    },
  })

  if (!isOpen) return null

  // Show current submission status
  if (currentSubmission?.status === 'approved') {
    return (
      <Modal open onClose={onClose} title="Payment Verified">
        <div className="space-y-4 py-6">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
          </div>
          <div className="text-center">
            <h3 className="text-lg font-black text-emerald-900 dark:text-emerald-100">
              Payment Approved!
            </h3>
            <p className="text-sm text-emerald-700 dark:text-emerald-300 mt-2">
              Your Bordereau payment has been verified by Finance.
            </p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
              Receipt: {currentSubmission.receipt_number}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded-lg transition-colors"
          >
            Continue
          </button>
        </div>
      </Modal>
    )
  }

  if (currentSubmission?.status === 'pending') {
    return (
      <Modal open onClose={onClose} title="Payment Under Review">
        <div className="space-y-4 py-6">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center animate-pulse">
              <Clock className="w-8 h-8 text-amber-600" />
            </div>
          </div>
          <div className="text-center">
            <h3 className="text-lg font-black text-amber-900 dark:text-amber-100">
              Under Review
            </h3>
            <p className="text-sm text-amber-700 dark:text-amber-300 mt-2">
              Finance team is reviewing your Bordereau payment.
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
              Submission #{currentSubmission.attempt} of 3 • Receipt: {currentSubmission.receipt_number}
            </p>
            <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-xs text-amber-700 dark:text-amber-300">
              You will be notified by email once the payment is verified.
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </Modal>
    )
  }

  if (currentSubmission?.status === 'rejected' && (status?.remaining_attempts ?? 0) > 0) {
    return (
      <Modal open onClose={onClose} title="Payment Rejected">
        <div className="space-y-4 py-6">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
          </div>
          <div className="text-center">
            <h3 className="text-lg font-black text-red-900 dark:text-red-100">
              Payment Not Verified
            </h3>
            <p className="text-sm text-red-700 dark:text-red-300 mt-2">
              {currentSubmission.rejection_reason}
            </p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-2">
              Attempt {currentSubmission.attempt} of 3
            </p>
          </div>
          <button
            onClick={() => {
              setFormStep('form')
              statusQ.refetch()
            }}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded-lg transition-colors inline-flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Resubmit Payment
          </button>
          <button
            onClick={onClose}
            className="w-full bg-ink-100 dark:bg-ink-800 text-ink-900 dark:text-white font-bold py-2 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </Modal>
    )
  }

  if (currentSubmission?.status === 'rejected' && (status?.remaining_attempts ?? 0) === 0) {
    return (
      <Modal open onClose={onClose} title="Maximum Attempts Reached">
        <div className="space-y-4 py-6">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
          </div>
          <div className="text-center">
            <h3 className="text-lg font-black text-red-900 dark:text-red-100">
              Maximum Attempts Reached
            </h3>
            <p className="text-sm text-red-700 dark:text-red-300 mt-2">
              You have used all 3 submission attempts.
            </p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-2">
              Please contact Finance to resolve this issue.
            </p>
          </div>
          <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-xs text-red-700 dark:text-red-300 font-mono">
            📧 finance@cur.ac.rw
          </div>
          <button
            onClick={onClose}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </Modal>
    )
  }

  // Show form
  if (formStep === 'form') {
    return (
      <Modal open onClose={onClose} title="Submit Bordereau Payment">
        <div className="space-y-5 py-4">
          {/* Info box */}
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900/40 rounded-lg text-xs text-blue-700 dark:text-blue-300">
            <p className="font-bold mb-1">💡 Bordereau Payment</p>
            <p>If you have already paid via bank transfer, enter your receipt number below. Finance will verify within 24 hours.</p>
          </div>

          {/* Required amount */}
          <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mb-1">Required Amount</p>
            <p className="text-lg font-black text-emerald-900 dark:text-emerald-100">
              {requiredAmount.toLocaleString('en-US', {
                style: 'currency',
                currency: 'RWF',
                minimumFractionDigits: 0,
              })}
            </p>
          </div>

          {/* Receipt Number */}
          <div>
            <label className="block text-xs font-bold text-ink-600 dark:text-ink-400 mb-2 uppercase tracking-wide">
              <Receipt className="w-3 h-3 inline mr-1" />
              Receipt Number *
            </label>
            <input
              type="text"
              placeholder="e.g., BR-2026-001234"
              value={formData.receipt_number}
              onChange={(e) => setFormData({ ...formData, receipt_number: e.target.value })}
              className="w-full px-3 py-2 border border-ink-200 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <p className="text-xs text-ink-400 mt-1">The receipt number from your bank</p>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-xs font-bold text-ink-600 dark:text-ink-400 mb-2 uppercase tracking-wide">
              Amount Paid (RWF) *
            </label>
            <input
              type="number"
              placeholder="0"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              className="w-full px-3 py-2 border border-ink-200 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          {/* Bank Name */}
          <div>
            <label className="block text-xs font-bold text-ink-600 dark:text-ink-400 mb-2 uppercase tracking-wide">
              <Building2 className="w-3 h-3 inline mr-1" />
              Bank Name
            </label>
            <input
              type="text"
              placeholder="e.g., BK, EQUITY, I&M"
              value={formData.bank_name}
              onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
              className="w-full px-3 py-2 border border-ink-200 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          {/* Account Holder */}
          <div>
            <label className="block text-xs font-bold text-ink-600 dark:text-ink-400 mb-2 uppercase tracking-wide">
              <User className="w-3 h-3 inline mr-1" />
              Account Holder Name
            </label>
            <input
              type="text"
              placeholder="Your name as it appears in the account"
              value={formData.account_holder_name}
              onChange={(e) => setFormData({ ...formData, account_holder_name: e.target.value })}
              className="w-full px-3 py-2 border border-ink-200 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          {/* Payment Date */}
          <div>
            <label className="block text-xs font-bold text-ink-600 dark:text-ink-400 mb-2 uppercase tracking-wide">
              <Calendar className="w-3 h-3 inline mr-1" />
              Payment Date
            </label>
            <input
              type="date"
              value={formData.payment_date}
              onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })}
              className="w-full px-3 py-2 border border-ink-200 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          {/* Remaining attempts */}
          {(status?.remaining_attempts ?? 3) < 3 && (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 rounded-lg text-xs text-amber-700 dark:text-amber-300">
              <p className="font-bold">Resubmission Attempt: {currentSubmission?.attempt || 1} of 3</p>
              <p className="mt-1">You have {status?.remaining_attempts ?? 0} submission(s) remaining.</p>
            </div>
          )}

          {/* Submit button */}
          <button
            onClick={() => submitMutation.mutate()}
            disabled={!formData.receipt_number || !formData.amount || submitMutation.isPending}
            className={`w-full font-bold py-2.5 rounded-lg transition-all inline-flex items-center justify-center gap-2 ${
              submitMutation.isPending || !formData.receipt_number || !formData.amount
                ? 'bg-ink-200 dark:bg-ink-800 text-ink-400 cursor-not-allowed'
                : 'bg-primary-600 hover:bg-primary-700 text-white'
            }`}
          >
            {submitMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Submit Receipt
              </>
            )}
          </button>
        </div>
      </Modal>
    )
  }

  // Success state
  return (
    <Modal open onClose={onClose} title="Receipt Submitted">
      <div className="space-y-4 py-6">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>
        </div>
        <div className="text-center">
          <h3 className="text-lg font-black text-emerald-900 dark:text-emerald-100">
            Receipt Submitted!
          </h3>
          <p className="text-sm text-emerald-700 dark:text-emerald-300 mt-2">
            Finance will review your payment within 24 hours.
          </p>
        </div>
      </div>
    </Modal>
  )
}
