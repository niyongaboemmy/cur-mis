import { CheckCircle2, AlertCircle, XCircle } from 'lucide-react'

interface DocumentCompletionBadgeProps {
  status?: 'verified' | 'pending' | 'rejected'
  onClick?: () => void
}

export default function DocumentCompletionBadge({
  status = 'pending',
  onClick,
}: DocumentCompletionBadgeProps) {
  if (status === 'verified') {
    return (
      <div
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 cursor-not-allowed opacity-60"
        title="All documents verified - No action needed"
      >
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
        <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
          Verified
        </span>
      </div>
    )
  }

  if (status === 'rejected') {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700">
        <XCircle className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
        <span className="text-xs font-semibold text-red-700 dark:text-red-300">
          Rejected
        </span>
      </div>
    )
  }

  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/40 hover:border-amber-300 dark:hover:border-amber-600 transition-colors cursor-pointer"
      title="Click to verify documents"
    >
      <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
      <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
        Not Verified
      </span>
    </button>
  )
}
