import { useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { paymentService } from "@/services/financeService";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import toast from "react-hot-toast";

const dtFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit", month: "short", year: "numeric",
  hour: "2-digit", minute: "2-digit",
});
const fmtDate = (v: string | null | undefined) =>
  v ? dtFmt.format(new Date(v)) : "-";

// What the payer actually paid for. `payment.fee_category` holds the UrubutoPay
// service_code (resolved to a name server-side); the two legacy numeric values
// pre-date the service catalogue and name no service at all.
const LEGACY_CATEGORY_LABELS: Record<string, string> = {
  "147": "Bank payment",
  "146": "Payment reversal",
};

const serviceOf = (p: any): { name: string; category: string | null } => {
  if (p.service_name) {
    return { name: p.service_name, category: p.fee_category_label ?? null };
  }
  const raw = String(p.fee_category ?? "").trim();
  if (raw === "") return { name: "-", category: null };
  return { name: LEGACY_CATEGORY_LABELS[raw] ?? raw, category: null };
};
import {
  Search,
  Activity,
  CreditCard,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  RefreshCcw,
  User,
  FileSpreadsheet,
  Eye,
  ExternalLink,
} from "lucide-react";


export default function OnlinePaymentsHistoryPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [searchInput, setSearchInput] = useState("");
  // Channel / service narrowing — this listing is what VIEW_MOBILE_PAYMENTS
  // opens, so it has to be able to show the mobile-money slice on its own.
  const [channel, setChannel] = useState("");
  const [serviceCode, setServiceCode] = useState("");
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["finance", "online-payments", page, keyword, channel, serviceCode],
    queryFn: () =>
      paymentService.getOnlinePaymentsHistory({
        page,
        per_page: 20,
        keyword,
        channel,
        service_code: serviceCode,
      }),
    placeholderData: keepPreviousData,
  });

  const payments = data?.data?.data || [];
  // Options come back with the page so the pickers can never drift from what
  // the gateway is actually writing.
  const filterOptions = {
    channels: data?.data?.filters?.channels ?? [],
    services: data?.data?.filters?.services ?? [],
  };
  const pagination = data?.data?.pagination;
  const metrics = data?.data?.metrics;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setKeyword(searchInput);
    setPage(1);
  };

  const handleExport = async () => {
    const total = data?.data?.pagination?.total ?? 0;
    if (total === 0) {
      toast.error("Nothing to export.");
      return;
    }
    setExporting(true);
    try {
      const pageSize = 200;
      const pages = Math.ceil(total / pageSize);
      const allRows: any[] = [];
      for (let pg = 1; pg <= pages; pg++) {
        const res = await paymentService.getOnlinePaymentsHistory({
          page: pg,
          per_page: pageSize,
          keyword,
        });
        allRows.push(...(res?.data?.data ?? []));
      }

      const header = [
        "Date",
        "Reg Number",
        "Student Name",
        "Slip No",
        "Trans Code",
        "Service Paid For",
        "Fee Category",
        "Amount (RWF)",
        "Channel",
        "Status",
      ];

      const rows = allRows.map((p: any) => {
        const fullName =
          p.student_fname || p.student_lname
            ? `${p.student_fname ?? ""} ${p.student_lname ?? ""}`.trim()
            : "";
        const regNumber = p.student_regnumber || p.student || "";
        const s = String(p.status ?? "").toLowerCase();
        const isCredit = String(p.payment_notifi ?? "").toLowerCase() === "credit";
        const statusLabel = isCredit
          ? "Reversed"
          : s === "successful" || s === "success" || s === "1"
          ? "Success"
          : s === "failed" || s === "0"
          ? "Failed"
          : p.status || "Pending";

        return [
          fmtDate(p.date),
          regNumber,
          fullName,
          p.slip_no || "",
          p.trans_code || "",
          serviceOf(p).name,
          serviceOf(p).category ?? "",
          parseFloat(p.amount || "0"),
          p.payment_chanel || p.mode || "",
          statusLabel,
        ];
      });

      const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
      ws["!cols"] = [20, 18, 22, 22, 22, 24, 20, 14, 10, 10].map((w) => ({ wch: w }));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Online Payments");

      const now = new Date();
      const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      XLSX.writeFile(wb, `online-payments-${stamp}.xlsx`);
    } catch {
      toast.error("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const getStatusBadge = (p: any) => {
    const s = String(p.status ?? "").toLowerCase();
    const isCredit = String(p.payment_notifi ?? "").toLowerCase() === "credit";

    if (isCredit)
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
          <RefreshCcw className="w-3 h-3" />
          Reversed
        </span>
      );

    if (s === "successful" || s === "success" || s === "1")
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
          <CheckCircle2 className="w-3 h-3" />
          Success
        </span>
      );
    if (s === "failed" || s === "0")
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
          <AlertCircle className="w-3 h-3" />
          Failed
        </span>
      );
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
        <Activity className="w-3 h-3" />
        {p.status || "Pending"}
      </span>
    );
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink-900 dark:text-ink-100 flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-brand" />
            Online Payments History
          </h1>
          <p className="text-sm text-ink-500 dark:text-ink-400">
            Monitor all legacy online payments from gateways.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={exporting || isLoading}
            className="btn-secondary"
          >
            <FileSpreadsheet
              className={`w-4 h-4 text-emerald-600 dark:text-emerald-400 ${exporting ? "animate-pulse" : ""}`}
            />
            {exporting ? "Exporting…" : "Export Excel"}
          </button>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="btn-secondary"
          >
            <RefreshCcw
              className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="card p-4 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 transform translate-x-4 -translate-y-4 group-hover:scale-110 transition-transform">
            <DollarSign className="w-24 h-24 text-brand" />
          </div>
          <div className="relative z-10">
            <p className="text-sm font-medium text-ink-500 dark:text-ink-400 mb-1">
              Total Processed Amount
            </p>
            <p className="text-3xl font-bold text-ink-900 dark:text-ink-100">
              RWF {(metrics?.total_amount || 0).toLocaleString()}
            </p>
          </div>
        </div>

        <div className="card p-4 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 transform translate-x-4 -translate-y-4 group-hover:scale-110 transition-transform">
            <Activity className="w-24 h-24 text-brand" />
          </div>
          <div className="relative z-10">
            <p className="text-sm font-medium text-ink-500 dark:text-ink-400 mb-1">
              Total Transactions
            </p>
            <p className="text-3xl font-bold text-ink-900 dark:text-ink-100">
              {(metrics?.total_transactions || 0).toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden border border-ink-200 dark:border-ink-800">
        <div className="p-3 border-b border-ink-200 dark:border-ink-800 bg-ink-50 dark:bg-ink-900/50 flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:items-center">
            <form onSubmit={handleSearch} className="relative w-full sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
              <input
                type="text"
                placeholder="Search by student ID, slip no, or trans code..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="input pl-9 w-full"
              />
            </form>

            <label className="sr-only" htmlFor="op-channel">Payment channel</label>
            <select
              id="op-channel"
              className="input w-full sm:w-44"
              value={channel}
              onChange={(e) => { setChannel(e.target.value); setPage(1); }}
            >
              <option value="">All channels</option>
              {filterOptions.channels.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <label className="sr-only" htmlFor="op-service">Service paid for</label>
            <select
              id="op-service"
              className="input w-full sm:w-56"
              value={serviceCode}
              onChange={(e) => { setServiceCode(e.target.value); setPage(1); }}
            >
              <option value="">All services</option>
              {filterOptions.services.map((s) => (
                <option key={s.service_code} value={s.service_code}>{s.service_name}</option>
              ))}
            </select>
          </div>
          {keyword && (
            <div className="text-sm text-ink-500 dark:text-ink-400">
              Showing results for "<span className="font-semibold text-ink-900 dark:text-ink-100">{keyword}</span>"
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-ink-50 dark:bg-ink-900/50 text-ink-500 dark:text-ink-400 uppercase text-[11px] font-semibold tracking-wider">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Reg Number</th>
                <th className="px-4 py-3">Student Name</th>
                <th className="px-4 py-3">Slip No</th>
                <th className="px-4 py-3">Trans Code</th>
                <th className="px-4 py-3">Service Paid For</th>
                <th className="px-4 py-3 text-right">Amount (RWF)</th>
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-200 dark:divide-ink-800">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-ink-500">
                    <RefreshCcw className="w-6 h-6 animate-spin mx-auto mb-2 text-brand" />
                    <p>Loading payments...</p>
                  </td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-ink-500">
                    No online payments found.
                  </td>
                </tr>
              ) : (
                payments.map((p: any) => {
                  const hasStudent = !!p.student_db_id;
                  const fullName =
                    p.student_fname || p.student_lname
                      ? `${p.student_fname ?? ""} ${p.student_lname ?? ""}`.trim()
                      : null;
                  const regNumber = p.student_regnumber || p.student || "-";

                  return (
                    <tr
                      key={p.id}
                      className={`transition-colors hover:bg-ink-50 dark:hover:bg-ink-800/50`}
                    >
                      <td className="px-4 py-3 text-ink-500 dark:text-ink-400">
                        {fmtDate(p.date)}
                      </td>
                      <td className="px-4 py-3 font-mono text-[13px]">
                        <span className="font-semibold text-ink-900 dark:text-ink-100">
                          {regNumber}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {fullName ? (
                          <div className="font-medium text-ink-900 dark:text-ink-100 flex items-center gap-1">
                            <User className="w-3 h-3 shrink-0" />
                            {fullName}
                          </div>
                        ) : (
                          <span className="text-ink-500 dark:text-ink-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-[13px] text-ink-500">
                        {p.slip_no || "-"}
                      </td>
                      <td className="px-4 py-3 font-mono text-[13px] text-brand">
                        {p.trans_code || "-"}
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const svc = serviceOf(p);
                          return (
                            <div className="leading-tight">
                              <div className="font-medium text-ink-900 dark:text-ink-100">
                                {svc.name}
                              </div>
                              {svc.category && (
                                <div className="text-[11px] text-ink-500 dark:text-ink-400">
                                  {svc.category}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {parseFloat(p.amount || "0").toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-300">
                          {p.payment_chanel || p.mode || "Unknown"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {getStatusBadge(p)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {hasStudent && (
                            <button
                              onClick={() => navigate(`/students/${p.student_db_id}`)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium bg-brand/10 text-brand hover:bg-brand/20 dark:bg-brand/20 dark:hover:bg-brand/30 transition-colors"
                              title="View student details"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>View</span>
                            </button>
                          )}
                          {p.slip_no && (
                            <a
                              href={`https://urubutopay.rw/receipt?transaction_id=${encodeURIComponent(
                                p.slip_no || ""
                              )}&amount=${encodeURIComponent(String(p.amount || ""))}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50 transition-colors"
                              title="Download receipt from Urubuto Pay"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>Receipt</span>
                            </a>
                          )}
                          {!hasStudent && !p.slip_no && (
                            <span className="text-xs text-ink-400 dark:text-ink-500">-</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {pagination && pagination.last_page > 1 && (
          <div className="p-4 border-t border-ink-200 dark:border-ink-800 flex items-center justify-between bg-ink-50 dark:bg-ink-900/50">
            <span className="text-sm text-ink-500 dark:text-ink-400">
              Showing page {pagination.current_page} of {pagination.last_page} (
              {pagination.total} total)
            </span>
            <div className="flex gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="btn-outline text-xs px-3 py-1"
              >
                Previous
              </button>
              <button
                disabled={page >= pagination.last_page}
                onClick={() => setPage(p => p + 1)}
                className="btn-outline text-xs px-3 py-1"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
