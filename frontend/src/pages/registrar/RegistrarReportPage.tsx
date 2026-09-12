import { FileText } from 'lucide-react';

export default function RegistrarReportPage() {
  return (
    <div className="h-screen w-full flex flex-col bg-white dark:bg-ink-900 -mx-6 -my-6">
      {/* Header */}
      <div className="px-6 py-4 border-b border-ink-100 dark:border-ink-700 shrink-0">
        <h2 className="text-lg font-bold text-ink-900 dark:text-white tracking-tight flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center">
            <FileText className="w-4 h-4 text-brand" />
          </span>
          Academic Reports
        </h2>
        <p className="text-[13px] text-ink-500 mt-0.5 ml-10">
          Academic registrar documents and reports
        </p>
      </div>

      {/* Full-screen iframe */}
      <div className="flex-1 overflow-hidden">
        <iframe
          src="https://cur.ac.rw/umis/documents/registrar_report/index.php"
          title="Academic Reports"
          className="w-full h-full border-0"
          allow="fullscreen"
        />
      </div>
    </div>
  );
}
