import { X } from 'lucide-react'

export default function OldMISModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-3 md:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 dark:bg-black/70"
        onClick={onClose}
      />

      {/* Modal — full screen on phones, inset panel from sm up */}
      <div className="relative z-50 flex flex-col w-full h-full sm:w-[98%] sm:h-[97vh] xl:w-[96%] bg-white dark:bg-ink-900 rounded-none sm:rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-ink-100 dark:border-ink-800 shrink-0">
          <h2 className="text-base sm:text-lg font-semibold text-ink-900 dark:text-white truncate">
            Old MIS Application
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-ink-100 dark:hover:bg-ink-800 transition-colors shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-ink-500" />
          </button>
        </div>

        {/* IFrame Container */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <iframe
            src="https://cur.ac.rw/umis/old_applicants/index.php"
            title="Old MIS Application"
            className="block w-full h-full border-0"
            allow="same-origin"
          />
        </div>
      </div>
    </div>
  )
}
