import { type ReactNode } from 'react'
import { Inbox } from 'lucide-react'
import { cn } from '@/utils/helpers'

interface EmptyStateProps {
  icon?:        ReactNode
  title?:       string
  description?: string
  action?:      ReactNode
  className?:   string
}

export default function EmptyState({
  icon,
  title       = 'No data found',
  description = 'There is nothing here yet.',
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center py-16 px-4', className)}>
      <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4 text-gray-400">
        {icon ?? <Inbox className="h-7 w-7" />}
      </div>
      <h3 className="text-base font-semibold text-gray-900 mb-1">{title}</h3>
      <p className="text-sm text-gray-500 max-w-xs">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
