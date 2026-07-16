import { AlertTriangle } from 'lucide-react'
import Modal from './Modal'
import Button from './Button'

interface ConfirmDialogProps {
  open:       boolean
  onClose:    () => void
  onConfirm:  () => void
  title?:     string
  message:    string
  confirmLabel?: string
  cancelLabel?:  string
  /** Use danger variant for destructive actions (delete, etc.) */
  variant?:   'danger' | 'primary'
  loading?:   boolean
}

export default function ConfirmDialog({
  open, onClose, onConfirm,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  cancelLabel  = 'Cancel',
  variant = 'danger',
  loading,
}: ConfirmDialogProps) {
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
          <Button variant={variant} onClick={onConfirm} isLoading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-4">
        {variant === 'danger' && (
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
        )}
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-ink-400">{message}</p>
        </div>
      </div>
    </Modal>
  )
}
