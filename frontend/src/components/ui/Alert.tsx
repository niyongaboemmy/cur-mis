import { type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Info, XCircle, X } from 'lucide-react'
import { cn } from '@/utils/helpers'

type AlertVariant = 'info' | 'success' | 'warning' | 'error'

interface AlertProps {
  variant?: AlertVariant
  title?: string
  children: ReactNode
  className?: string
  onClose?: () => void
}

const config: Record<AlertVariant, { icon: typeof Info; classes: string; iconClass: string }> = {
  info:    { icon: Info,          classes: 'bg-blue-50 border-blue-200 text-blue-800',   iconClass: 'text-blue-500' },
  success: { icon: CheckCircle2,  classes: 'bg-green-50 border-green-200 text-green-800', iconClass: 'text-green-500' },
  warning: { icon: AlertCircle,   classes: 'bg-amber-50 border-amber-200 text-amber-800', iconClass: 'text-amber-500' },
  error:   { icon: XCircle,       classes: 'bg-red-50 border-red-200 text-red-800',       iconClass: 'text-red-500' },
}

export default function Alert({ variant = 'info', title, children, className, onClose }: AlertProps) {
  const { icon: Icon, classes, iconClass } = config[variant]

  return (
    <div className={cn('flex gap-3 rounded-lg border p-4', classes, className)} role="alert">
      <Icon className={cn('h-5 w-5 flex-shrink-0 mt-0.5', iconClass)} />
      <div className="flex-1 text-sm">
        {title && <p className="font-semibold mb-0.5">{title}</p>}
        <div className="leading-relaxed">{children}</div>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="ml-auto -mt-0.5 flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
