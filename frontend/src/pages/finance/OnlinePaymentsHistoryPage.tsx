import { useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { paymentService } from "@/services/financeService";

const dtFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit", month: "short", year: "numeric",
  hour: "2-digit", minute: "2-digit",
});
const fmtDate = (v: string | null | undefined) =>
  v ? dtFmt.format(new Date(v)) : "-";
import {
  Search,
  Activity,
  CreditCard,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  RefreshCcw,
} from "lucide-react";

export default function OnlinePaymentsHistoryPage() {
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["finance", "online-payments", page, keyword],
    queryFn: () =>
      paymentService.getOnlinePaymentsHistory({
        page,
        per_page: 20,
        keyword,
      }),
    placeholderData: keepPreviousData,
  });

  const payments = data?.data?.data || [];
  const pagination = data?.data?.pagination;
  const metrics = data?.data?.metrics;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setKeyword(searchInput);
    setPage(1);
  };

  const getStatusBadge = (status: string) => {
    const s = status?.toLowerCase() || "";
    if (s === "successful" || s === "success")
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
          <CheckCircle2 className="w-3 h-3" />
          Success
        </span>
      );
    if (s === "failed")
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
          <AlertCircle className="w-3 h-3" />
          Failed
        </span>
      );
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
        <Activity className="w-3 h-3" />
        {status || "Pending"}
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
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="btn-outline gap-2"
        >
          <RefreshCcw
            className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`}
          />
          Refresh
        </button>
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
          <form onSubmit={handleSearch} className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
            <input
              type="text"
              placeholder="Search by student ID, slip no, or trans code..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="input pl-9 w-full"
            />
          </form>
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
                <th className="px-4 py-3">Student / Reference</th>
                <th className="px-4 py-3">Slip No</th>
                <th className="px-4 py-3">Trans Code</th>
                <th className="px-4 py-3 text-right">Amount (RWF)</th>
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-200 dark:divide-ink-800">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-ink-500">
                    <RefreshCcw className="w-6 h-6 animate-spin mx-auto mb-2 text-brand" />
                    <p>Loading payments...</p>
                  </td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-ink-500">
                    No online payments found.
                  </td>
                </tr>
              ) : (
                payments.map((p: any) => (
                  <tr
                    key={p.id}
                    className="hover:bg-ink-50 dark:hover:bg-ink-800/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      {fmtDate(p.date)}
                    </td>
                    <td className="px-4 py-3 font-medium text-ink-900 dark:text-ink-100">
                      {p.student || "-"}
                    </td>
                    <td className="px-4 py-3 font-mono text-[13px] text-ink-500">
                      {p.slip_no || "-"}
                    </td>
                    <td className="px-4 py-3 font-mono text-[13px] text-brand">
                      {p.trans_code || "-"}
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
                      {getStatusBadge(p.status)}
                    </td>
                  </tr>
                ))
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
