import { X } from 'lucide-react';

interface RegistrarReportModalProps {
  open: boolean;
  onClose: () => void;
  reportUrl?: string;
}

export default function RegistrarReportModal({
  open,
  onClose,
  reportUrl = 'https://cur.ac.rw/umis/documents/registrar_report/index.php',
}: RegistrarReportModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      {/* Modal backdrop */}
      <div
        className="absolute inset-0 cursor-pointer"
        onClick={onClose}
      />

      {/* Modal content - Full screen iframe */}
      <div className="relative w-[95%] h-[95vh] flex flex-col bg-white dark:bg-ink-900 rounded-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-ink-100 dark:border-ink-700">
          <h2 className="text-lg font-bold text-ink-900 dark:text-white">
            Academic Reports
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-ink-100 dark:hover:bg-ink-800 flex items-center justify-center text-ink-500 hover:text-ink-900 dark:hover:text-white transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Iframe container - 100% width and height */}
        <div className="flex-1 overflow-hidden">
          <iframe
            src={reportUrl}
            title="Academic Reports"
            className="w-full h-full border-0"
            allow="fullscreen"
          />
        </div>
      </div>
    </div>
  );
}
