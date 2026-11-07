import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ExternalLink, Loader2, RefreshCw, UserPlus, X } from 'lucide-react'

export const ADD_STUDENT_URL =
  'https://cur.ac.rw/umis/documents/all_certificate/add_student.php'

interface AddStudentModalProps {
  open: boolean
  onClose: () => void
}

/**
 * Full-screen modal that hosts the legacy "add student" form in an iframe.
 * The form keeps its own session and save logic; this component only frames it.
 */
export default function AddStudentModal({ open, onClose }: AddStudentModalProps) {
  const [loaded, setLoaded] = useState(false)
  // Bumping the key remounts the iframe, which is how "Refresh" reloads the form.
  const [frameKey, setFrameKey] = useState(0)

  // Each time the modal opens, show the loading state again.
  useEffect(() => {
    if (open) setLoaded(false)
  }, [open])

  // Escape closes, and the page behind does not scroll while open.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-student-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-ink-900/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative z-10 flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl dark:bg-ink-900 sm:h-[94vh] sm:w-[min(1100px,96vw)] sm:rounded-2xl sm:ring-1 sm:ring-ink-200 dark:sm:ring-ink-700">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-ink-100 bg-gradient-to-r from-blue-50 via-white to-white px-4 py-3 dark:border-ink-800 dark:from-ink-800 dark:via-ink-900 dark:to-ink-900 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-600/30">
              <UserPlus className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 id="add-student-title" className="truncate text-base font-semibold text-ink-900 dark:text-white sm:text-lg">
                Add Student who already have a registration number
              </h2>
              <p className="truncate text-xs text-ink-500 dark:text-ink-400">
                Register a new student record in UMIS
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={() => { setLoaded(false); setFrameKey((k) => k + 1) }}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-600 transition-colors hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
              title="Reload the form"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Reload</span>
            </button>
            <a
              href={ADD_STUDENT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-600 transition-colors hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
              title="Open the form in a new tab"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Open in new tab</span>
            </a>
            <button
              type="button"
              onClick={onClose}
              className="ml-1 rounded-lg p-1.5 text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800 dark:text-ink-400 dark:hover:bg-ink-800 dark:hover:text-white"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Frame */}
        <div className="relative min-h-0 flex-1 bg-ink-50 dark:bg-ink-950">
          {!loaded && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-ink-50 dark:bg-ink-950">
              <Loader2 className="h-7 w-7 animate-spin text-blue-600" />
              <p className="text-sm text-ink-500 dark:text-ink-400">Loading the add student form…</p>
            </div>
          )}
          <iframe
            key={frameKey}
            src={ADD_STUDENT_URL}
            title="Add student form"
            className="block h-full w-full border-0 bg-white dark:bg-ink-900"
            onLoad={() => setLoaded(true)}
          />
        </div>

        {/* Footer hint */}
        <div className="shrink-0 border-t border-ink-100 px-4 py-2 text-center text-[11px] text-ink-400 dark:border-ink-800 dark:text-ink-500 sm:px-6">
          If the form does not appear here, use “Open in new tab”. Close this window when you are done to refresh the student list.
        </div>
      </div>
    </div>,
    document.body,
  )
}
