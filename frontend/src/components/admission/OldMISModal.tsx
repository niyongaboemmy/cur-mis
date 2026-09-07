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
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/50 dark:bg-black/70"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative w-[95%] bg-white dark:bg-ink-900 rounded-2xl shadow-2xl z-50 flex flex-col max-h-[98vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-ink-100 dark:border-ink-800 shrink-0">
            <h2 className="text-lg font-semibold text-ink-900 dark:text-white">
              Old MIS Application
            </h2>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-ink-100 dark:hover:bg-ink-800 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-ink-500" />
            </button>
          </div>

          {/* IFrame Container */}
          <div className="flex-1 overflow-hidden">
            <iframe
              src="https://cur.ac.rw/umis/old_applicants/index.php"
              title="Old MIS Application"
              className="w-full h-full border-0"
              allow="same-origin"
            />
          </div>
        </div>
      </div>
  )
}
