import { useState } from 'react';
import { FileText } from 'lucide-react';
import RegistrarReportModal from '@/components/registrar/RegistrarReportModal';

export default function RegistrarReportPage() {
  const [reportOpen, setReportOpen] = useState(true);

  return (
    <div className="space-y-5 animate-fade-in pb-12">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-ink-900 dark:text-white tracking-tight flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center">
            <FileText className="w-4 h-4 text-brand" />
          </span>
          Academic Reports
        </h2>
        <p className="text-[13px] text-ink-500 mt-0.5 ml-10">
          Academic registrar documents and reports
        </p>
      </div>

      {/* Report Modal */}
      <RegistrarReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        reportUrl="https://cur.ac.rw/umis/documents/registrar_report/index.php"
      />
    </div>
  );
}
