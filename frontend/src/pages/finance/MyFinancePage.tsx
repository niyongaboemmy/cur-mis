import { useEffect, useState, type ElementType } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2,
  AlertCircle,
  ShieldCheck,
  ShieldX,
  RefreshCw,
  Smartphone,
  HelpCircle,
  DollarSign,
  CheckCircle2,
  Gift,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  Receipt,
} from "lucide-react";
import { myLedgerService } from "@/services/financeService";
import { useSystemStore } from "@/store/systemStore";
import InvoiceStatusBadge from "@/components/finance/InvoiceStatusBadge";
import UrubutoPayInstructionsModal from "@/components/finance/UrubutoPayInstructionsModal";
import {
  FEE_TYPE_LABELS,
  CLEARANCE_STATUS_LABELS,
  CLEARANCE_STATUS_COLORS,
} from "@/types/finance";
import { formatRWF } from "@/utils/formatCurrency";
import type {
  FeeInvoice,
  LedgerTotals,
  ClearanceResult,
  MobilePaymentRecord,
} from "@/types/finance";

type Semester = "" | "1" | "2";
type InvoiceTab = "all" | "unpaid" | "partial" | "paid";

const TAB_FILTERS: { key: InvoiceTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unpaid", label: "Unpaid" },
  { key: "partial", label: "Partial" },
  { key: "paid", label: "Paid" },
];

const INVOICE_ROW_ACCENT: Record<string, string> = {
  unpaid: "border-l-2 border-red-400",
  partial: "border-l-2 border-amber-400",
  paid: "border-l-2 border-green-400",
  waived: "border-l-2 border-blue-300",
};

export default function MyFinancePage() {
  const basics = useSystemStore((s) => s.basics);
  const selectedYearLabel = useSystemStore((s) => s.selectedYearLabel);

  const resolveYearId = (label: string): number | string => {
    if (label) {
      const found = basics?.years?.find((y: any) => y.label === label);
      if (found) return found.id;
    }
    return (basics?.active_year as any)?.id ?? "";
  };

  const [yearId, setYearId] = useState<number | string>(() =>
    resolveYearId(selectedYearLabel),
  );
  const [semester, setSemester] = useState<Semester>("");
  const [invoiceTab, setInvoiceTab] = useState<InvoiceTab>("all");
  const [showHistory, setShowHistory] = useState(false);
  const [showUssdModal, setShowUssdModal] = useState(false);
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  useEffect(() => {
    setYearId(resolveYearId(selectedYearLabel));
  }, [selectedYearLabel, basics?.years]);

  const ledgerQ = useQuery({
    queryKey: ["my-finance", "ledger", yearId, semester],
    queryFn: (ctx) =>
      myLedgerService.getMyLedger(
        {
          ...(yearId ? { academic_year_id: Number(yearId) } : {}),
          ...(semester ? { semester: Number(semester) as 1 | 2 } : {}),
        },
        ctx.signal,
      ),
    enabled: !!yearId,
  });

  const clearanceQ = useQuery({
    queryKey: ["my-finance", "clearance", yearId, semester],
    queryFn: (ctx) =>
      myLedgerService.getMyClearance(
        Number(yearId),
        semester ? (Number(semester) as 1 | 2) : null,
        ctx.signal,
      ),
    enabled: !!yearId,
  });

  const historyQ = useQuery({
    queryKey: ["my-finance", "mobile-history"],
    queryFn: (ctx) => myLedgerService.getMobileHistory(ctx.signal),
    enabled: showHistory,
  });

  const invoices: FeeInvoice[] = ledgerQ.data?.data?.invoices ?? [];
  const totals: LedgerTotals | undefined = ledgerQ.data?.data?.totals;
  const clearance: ClearanceResult | undefined =
    clearanceQ.data?.data ?? undefined;
  const history: MobilePaymentRecord[] = historyQ.data?.data ?? [];

  const balance = totals?.balance ?? 0;
  const totalDue = totals?.total_due ?? 0;
  const totalPaid = totals?.total_paid ?? 0;
  const paidPct =
    totalDue > 0 ? Math.min(100, Math.round((totalPaid / totalDue) * 100)) : 0;

  const filteredInvoices = invoices.filter((inv) => {
    if (invoiceTab === "all") return true;
    return inv.status === invoiceTab;
  });

  const tabCounts: Record<InvoiceTab, number> = {
    all: invoices.length,
    unpaid: invoices.filter((i) => i.status === "unpaid").length,
    partial: invoices.filter((i) => i.status === "partial").length,
    paid: invoices.filter((i) => i.status === "paid").length,
  };

  const handlePayNow = async () => {
    setPayLoading(true);
    setPayError(null);
    try {
      const res = await myLedgerService.getPaymentLink();
      window.open(res?.data?.checkout_url, "_blank", "noopener,noreferrer");
    } catch {
      setPayError("Could not generate payment link. Please try again.");
    } finally {
      setPayLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6 max-w-6xl mx-auto">
      {/* Page header row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-900 dark:text-white">
            My Finance
          </h1>
          <p className="text-[13px] text-ink-400 mt-0.5">
            Your invoices and payment status
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={semester}
            onChange={(e) => setSemester(e.target.value as Semester)}
            className="input input-sm w-44"
          >
            <option value="">All Semesters</option>
            <option value="1">Semester 1</option>
            <option value="2">Semester 2</option>
          </select>
        </div>
      </div>

      {/* No year selected */}
      {!yearId && (
        <div className="card p-6 text-center text-ink-400 text-[13px]">
          Select an academic year using the selector at the top of the page.
        </div>
      )}

      {yearId && (
        <>
          {/* Ledger fetch error */}
          {ledgerQ.isError && (
            <div className="card p-5 flex items-center gap-3 text-red-600 dark:text-red-400">
              <AlertCircle className="shrink-0" size={20} />
              <div className="flex-1 text-[13px]">
                {(ledgerQ.error as any)?.response?.data?.message ??
                  "Failed to load finance data."}
              </div>
              <button
                onClick={() => ledgerQ.refetch()}
                className="btn btn-sm flex items-center gap-1.5"
              >
                <RefreshCw size={13} />
                Retry
              </button>
            </div>
          )}

          {/* ── Payment Hero Card ─────────────────────────────────────────────── */}
          <div className="card p-5 md:p-6">
            <div className="flex flex-col md:flex-row md:items-center gap-6">
              {/* Balance side */}
              <div className="flex-1 space-y-3">
                <p className="text-[11px] uppercase font-bold text-ink-400 tracking-wider">
                  Outstanding Balance
                </p>
                {ledgerQ.isLoading ? (
                  <Loader2 size={24} className="animate-spin text-ink-300" />
                ) : (
                  <p
                    className={`text-3xl font-bold ${balance > 0 ? "text-red-500 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}
                  >
                    {formatRWF(balance)}
                  </p>
                )}
                {/* Progress bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-ink-400">
                    <span>{paidPct}% paid</span>
                    <span>
                      {formatRWF(totalPaid)} of {formatRWF(totalDue)}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-ink-100 dark:bg-ink-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-green-500 transition-all duration-700"
                      style={{ width: `${paidPct}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Action side */}
              <div className="flex flex-col gap-2 md:items-end">
                {payError && (
                  <p className="text-[12px] text-red-600 dark:text-red-400 flex items-center gap-1.5">
                    <AlertCircle size={13} />
                    {payError}
                  </p>
                )}
                <button
                  onClick={handlePayNow}
                  disabled={payLoading || !yearId}
                  className="btn btn-primary flex items-center gap-2 px-5"
                >
                  {payLoading ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Smartphone size={15} />
                  )}
                  Pay via Mobile Money
                </button>
                <button
                  onClick={() => setShowUssdModal(true)}
                  className="text-[12px] text-ink-400 dark:text-ink-500 hover:text-primary-600 dark:hover:text-primary-400 flex items-center gap-1 transition-colors"
                >
                  <HelpCircle size={13} />
                  How to pay via USSD *775#
                </button>
              </div>
            </div>
          </div>

          {/* ── Summary stat cards ────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              icon={DollarSign}
              label="Total Invoiced"
              value={formatRWF(totals?.total_due ?? 0)}
              loading={ledgerQ.isLoading}
              iconClass="text-ink-400"
            />
            <StatCard
              icon={CheckCircle2}
              label="Amount Paid"
              value={formatRWF(totals?.total_paid ?? 0)}
              loading={ledgerQ.isLoading}
              iconClass="text-green-500"
              valueClass="text-green-600 dark:text-green-400"
            />
            <StatCard
              icon={Gift}
              label="Bursary Applied"
              value={formatRWF(totals?.total_bursary ?? 0)}
              loading={ledgerQ.isLoading}
              iconClass="text-blue-500"
              valueClass="text-blue-600 dark:text-blue-400"
            />
            <StatCard
              icon={TrendingDown}
              label="Balance Due"
              value={formatRWF(balance)}
              loading={ledgerQ.isLoading}
              iconClass={balance > 0 ? "text-red-500" : "text-green-500"}
              valueClass={
                balance > 0
                  ? "text-red-600 dark:text-red-400"
                  : "text-green-600 dark:text-green-400"
              }
            />
          </div>

          {/* ── Clearance banner ─────────────────────────────────────────────── */}
          {clearance && (
            <div
              className={`rounded-xl p-4 flex items-center gap-3 ${
                clearance.status === "cleared"
                  ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
                  : "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
              }`}
            >
              {clearance.status === "cleared" ? (
                <ShieldCheck
                  size={20}
                  className="text-green-600 dark:text-green-400 shrink-0"
                />
              ) : (
                <ShieldX
                  size={20}
                  className="text-red-500 dark:text-red-400 shrink-0"
                />
              )}
              <div className="flex-1">
                <p
                  className={`text-[13px] font-semibold ${clearance.status === "cleared" ? "text-green-800 dark:text-green-300" : "text-red-700 dark:text-red-300"}`}
                >
                  Financial Clearance:{" "}
                  {CLEARANCE_STATUS_LABELS[clearance.status]}
                </p>
                {clearance.status !== "cleared" && balance > 0 && (
                  <p className="text-[12px] text-red-600 dark:text-red-400 mt-0.5">
                    Clear {formatRWF(balance)} outstanding balance to unlock
                    clearance.
                  </p>
                )}
              </div>
              <span
                className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${CLEARANCE_STATUS_COLORS[clearance.status]}`}
              >
                {CLEARANCE_STATUS_LABELS[clearance.status]}
              </span>
            </div>
          )}
          {clearanceQ.isLoading && (
            <div className="card p-4 flex items-center gap-2 text-ink-400 text-[13px]">
              <Loader2 size={14} className="animate-spin" />
              Checking clearance status…
            </div>
          )}

          {/* ── Invoice table with tabs ───────────────────────────────────────── */}
          <div className="card overflow-hidden">
            <div className="px-4 pt-3 pb-0 border-b border-ink-100 dark:border-ink-800">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[13px] font-bold text-ink-900 dark:text-white">
                  Invoices
                </h2>
              </div>
              {/* Tab bar */}
              <div className="flex gap-1">
                {TAB_FILTERS.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setInvoiceTab(key)}
                    className={`px-3 py-1.5 text-[12px] font-medium rounded-t-md border-b-2 transition-colors ${
                      invoiceTab === key
                        ? "border-primary-600 text-primary-700 dark:text-primary-400"
                        : "border-transparent text-ink-400 hover:text-ink-700 dark:hover:text-ink-200"
                    }`}
                  >
                    {label}
                    {tabCounts[key] > 0 && (
                      <span className="ml-1.5 text-[10px] font-bold bg-ink-100 dark:bg-ink-700 text-ink-500 dark:text-ink-300 px-1.5 py-0.5 rounded-full">
                        {tabCounts[key]}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {ledgerQ.isLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-ink-400 text-[13px]">
                <Loader2 size={16} className="animate-spin" />
                Loading invoices…
              </div>
            ) : filteredInvoices.length === 0 ? (
              <div className="py-12 text-center text-ink-400 text-[13px]">
                {invoiceTab === "all"
                  ? "No invoices found for this period."
                  : `No ${invoiceTab} invoices.`}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-ink-100 dark:border-ink-800 bg-ink-50/50 dark:bg-ink-800/30">
                      {[
                        "Invoice #",
                        "Date",
                        "Fee Type",
                        "Description",
                        "Due",
                        "Paid",
                        "Bursary",
                        "Status",
                      ].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-2.5 text-left text-[10px] uppercase font-bold text-ink-400 whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-50 dark:divide-ink-800">
                    {filteredInvoices.map((inv) => (
                      <tr
                        key={inv.id}
                        className={`hover:bg-ink-50/50 dark:hover:bg-ink-800/30 ${INVOICE_ROW_ACCENT[inv.status] ?? ""}`}
                      >
                        <td className="px-4 py-2.5 font-mono text-[12px] text-ink-600 dark:text-ink-300 whitespace-nowrap">
                          {inv.invoice_number}
                        </td>
                        <td className="px-4 py-2.5 text-ink-500 dark:text-ink-400 whitespace-nowrap">
                          {new Date(inv.created_at).toLocaleDateString("en-GB")}
                        </td>
                        <td className="px-4 py-2.5 text-ink-700 dark:text-ink-300 whitespace-nowrap">
                          {FEE_TYPE_LABELS[inv.fee_type] ?? inv.fee_type}
                        </td>
                        <td className="px-4 py-2.5 text-ink-700 dark:text-ink-300 max-w-[200px] truncate">
                          {inv.description}
                        </td>
                        <td className="px-4 py-2.5 text-right text-ink-900 dark:text-white font-medium whitespace-nowrap">
                          {formatRWF(inv.amount_due)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-green-600 dark:text-green-400 whitespace-nowrap">
                          {formatRWF(inv.amount_paid)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-blue-600 dark:text-blue-400 whitespace-nowrap">
                          {formatRWF(inv.bursary_applied)}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <InvoiceStatusBadge status={inv.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Recent Mobile Payments ────────────────────────────────────────── */}
          <div className="card overflow-hidden">
            <button
              onClick={() => setShowHistory((v) => !v)}
              className="w-full px-4 py-3 flex items-center justify-between text-[13px] font-bold text-ink-900 dark:text-white hover:bg-ink-50/50 dark:hover:bg-ink-800/30 transition-colors"
            >
              <span className="flex items-center gap-2">
                <Receipt size={15} className="text-ink-400" />
                Recent Mobile Payments
              </span>
              {showHistory ? (
                <ChevronUp size={15} className="text-ink-400" />
              ) : (
                <ChevronDown size={15} className="text-ink-400" />
              )}
            </button>

            {showHistory && (
              <div className="border-t border-ink-100 dark:border-ink-800">
                {historyQ.isLoading ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-ink-400 text-[13px]">
                    <Loader2 size={14} className="animate-spin" />
                    Loading payment history…
                  </div>
                ) : history.length === 0 ? (
                  <div className="py-8 text-center text-ink-400 text-[13px]">
                    No mobile payments recorded yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="border-b border-ink-100 dark:border-ink-800 bg-ink-50/50 dark:bg-ink-800/30">
                          {[
                            "Date",
                            "Transaction Code",
                            "Channel",
                            "Amount",
                            "Receipt #",
                            "Invoice",
                          ].map((h) => (
                            <th
                              key={h}
                              className="px-4 py-2.5 text-left text-[10px] uppercase font-bold text-ink-400 whitespace-nowrap"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink-50 dark:divide-ink-800">
                        {history.map((p) => (
                          <tr
                            key={p.id}
                            className="hover:bg-ink-50/50 dark:hover:bg-ink-800/30"
                          >
                            <td className="px-4 py-2.5 text-ink-500 dark:text-ink-400 whitespace-nowrap">
                              {new Date(p.payment_date).toLocaleDateString(
                                "en-GB",
                              )}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-[12px] text-ink-600 dark:text-ink-300 whitespace-nowrap">
                              {p.transaction_code}
                            </td>
                            <td className="px-4 py-2.5 text-ink-500 dark:text-ink-400 whitespace-nowrap">
                              {p.payment_sub_method ?? "Mobile Money"}
                            </td>
                            <td className="px-4 py-2.5 text-right text-green-600 dark:text-green-400 font-medium whitespace-nowrap">
                              {formatRWF(p.amount)}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-[12px] text-ink-500 dark:text-ink-400 whitespace-nowrap">
                              {p.receipt_number ?? "—"}
                            </td>
                            <td className="px-4 py-2.5 text-ink-500 dark:text-ink-400 whitespace-nowrap">
                              {p.invoice_number ?? "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* USSD instructions modal */}
      <UrubutoPayInstructionsModal
        open={showUssdModal}
        onClose={() => setShowUssdModal(false)}
      />
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  loading,
  iconClass = "text-ink-400",
  valueClass = "text-ink-900 dark:text-white",
}: {
  icon: ElementType;
  label: string;
  value: string;
  loading: boolean;
  iconClass?: string;
  valueClass?: string;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={15} className={iconClass} />
        <p className="text-[11px] uppercase font-bold text-ink-400">{label}</p>
      </div>
      {loading ? (
        <Loader2 size={16} className="animate-spin text-ink-300 mt-1" />
      ) : (
        <p className={`text-[15px] font-bold ${valueClass}`}>{value}</p>
      )}
    </div>
  );
}
