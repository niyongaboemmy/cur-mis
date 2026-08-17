import type { ReactNode } from 'react'
import { AlertTriangle, HelpCircle } from 'lucide-react'
import Modal from './Modal'
import Button from './Button'

interface ConfirmDialogProps {
  open:       boolean
  onClose:    () => void
  onConfirm:  () => void
  title?:     string
  message:    ReactNode
  /**
   * Anything the person should see before committing — what the action will
   * change, a field the action needs, a warning about consequences. Rendered
   * below the message.
   */
  details?:   ReactNode
  confirmLabel?: string
  cancelLabel?:  string
  /** Use danger variant for destructive actions (delete, etc.) */
  variant?:   'danger' | 'primary' | 'success' | 'warning'
  /** Blocks confirming while a required input is missing. */
  confirmDisabled?: boolean
  loading?:   boolean
}

const ICON_TINT: Record<string, string> = {
  danger:  'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400',
  warning: 'bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
  success: 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400',
  primary: 'bg-primary-100 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400',
}

export default function ConfirmDialog({
  open, onClose, onConfirm,
  title = 'Are you sure?',
  message,
  details,
  confirmLabel = 'Confirm',
  cancelLabel  = 'Cancel',
  variant = 'danger',
  confirmDisabled,
  loading,
}: ConfirmDialogProps) {
  const Icon = variant === 'danger' || variant === 'warning' ? AlertTriangle : HelpCircle
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      static={loading}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === 'success' || variant === 'warning' ? 'primary' : variant}
            onClick={onConfirm}
            isLoading={loading}
            disabled={confirmDisabled || loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-4">
        <div
          className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${ICON_TINT[variant] ?? ICON_TINT.primary}`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
          <div className="mt-1 text-sm text-gray-500 dark:text-ink-400">{message}</div>
          {details && <div className="mt-3">{details}</div>}
        </div>
      </div>
    </Modal>
  )
}
