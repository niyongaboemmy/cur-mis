import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Download, ChevronLeft, ChevronRight, Loader2, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";
import ModalPortal from "@/components/ui/ModalPortal";
import { serviceRequestReportService, type ReportFilter } from "@/services/serviceRequestReportService";

const STATUS_STYLES: Record<string, string> = {
  submitted: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400",
  in_review: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400",
  changes_requested: "bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400",
  approved: "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400",
  awaiting_payment: "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400",
  paid: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400",
  completed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400",
  rejected: "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400",
  cancelled: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  expired: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

function buildPages(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "…")[] = [1];
  if (current > 3) pages.push("…");
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
  if (current < total - 2) pages.push("…");
  pages.push(total);
  return pages;
}

const PER_PAGE = 15;

export default function ServiceRequestListModal({
  filter, title, onClose,
}: {
  filter: ReportFilter;
  title: string;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  const listQ = useQuery({
    queryKey: ["service-requests", "reports", "list", filter, page],
    queryFn: ({ signal }) => serviceRequestReportService.getList(filter, page, PER_PAGE, signal),
  });

  const result = listQ.data?.data;
  const rows = result?.data ?? [];
  const totalPages = result?.last_page ?? 1;
  const total = result?.total ?? 0;

  const handleExport = async () => {
    setExporting(true);
    try {
      await serviceRequestReportService.exportCsv(filter);
    } catch {
      toast.error("Failed to export.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-4xl max-h-[85vh] flex flex-col">
          <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-800 shrink-0">
            <div>
              <h2 className="text-lg font-black text-gray-900 dark:text-white">{title}</h2>
              <p className="text-xs text-gray-400 mt-0.5">{total.toLocaleString()} request(s)</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExport}
                disabled={exporting || total === 0}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-50"
              >
                {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                Export CSV
              </button>
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto flex-1">
            {listQ.isLoading && (
              <div className="flex items-center justify-center h-48 text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            )}
            {listQ.isError && (
              <div className="flex flex-col items-center justify-center h-48 gap-2 text-red-500">
                <AlertTriangle className="w-6 h-6" />
                <span className="text-sm">Failed to load requests.</span>
              </div>
            )}
            {!listQ.isLoading && rows.length === 0 && (
              <div className="flex items-center justify-center h-48 text-gray-400 text-sm">No requests found.</div>
            )}
            {rows.length > 0 && (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white dark:bg-gray-900">
                  <tr className="text-left text-[11px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 dark:border-gray-800">
                    <th className="px-5 py-2">Request</th>
                    <th className="px-5 py-2">Requester</th>
                    <th className="px-5 py-2">Service</th>
                    <th className="px-5 py-2">Status</th>
                    <th className="px-5 py-2">Amount</th>
                    <th className="px-5 py-2">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-gray-50 dark:border-gray-800/60">
                      <td className="px-5 py-2.5 font-mono text-xs text-gray-500">{r.request_code}</td>
                      <td className="px-5 py-2.5">
                        <div className="text-gray-700 dark:text-gray-200">{r.full_name}</div>
                        <div className="text-[11px] text-gray-400">{r.email}</div>
                      </td>
                      <td className="px-5 py-2.5 text-gray-500">{r.service_name}</td>
                      <td className="px-5 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${STATUS_STYLES[r.status] ?? "bg-gray-100 text-gray-500"}`}>
                          {r.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-5 py-2.5 text-gray-600 dark:text-gray-300 text-xs">
                        {r.amount_paid != null ? `${Number(r.amount_paid).toLocaleString()} RWF` : "-"}
                      </td>
                      <td className="px-5 py-2.5 text-gray-400 text-xs">
                        {r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {totalPages > 1 && (
            <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between shrink-0">
              <p className="text-[11px] text-gray-400 tabular-nums">
                Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Prev
                </button>
                {buildPages(page, totalPages).map((p, idx) =>
                  p === "…" ? (
                    <span key={`e-${idx}`} className="w-7 text-center text-gray-400 text-xs select-none">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`w-7 h-7 rounded-lg text-xs font-bold transition-colors ${
                        page === p
                          ? "bg-primary-600 text-white"
                          : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                      }`}
                    >
                      {p}
                    </button>
                  ),
                )}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30"
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}
