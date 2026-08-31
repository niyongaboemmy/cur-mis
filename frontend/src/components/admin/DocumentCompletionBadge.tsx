import { CheckCircle2, AlertCircle, Clock } from 'lucide-react'

interface DocumentCompletionBadgeProps {
  status?: 'completed' | 'pending' | 'not-started'
}

export default function DocumentCompletionBadge({
  status = 'not-started',
}: DocumentCompletionBadgeProps) {
  if (status === 'completed') {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
        <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
          Docs Complete
        </span>
      </div>
    )
  }

  if (status === 'pending') {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
        <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
        <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
          Pending
        </span>
      </div>
    )
  }

  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-ink-100 dark:bg-ink-800 border border-ink-200 dark:border-ink-700">
      <Clock className="w-3.5 h-3.5 text-ink-600 dark:text-ink-400" />
      <span className="text-xs font-semibold text-ink-700 dark:text-ink-300">
        Not Started
      </span>
    </div>
  )
}
