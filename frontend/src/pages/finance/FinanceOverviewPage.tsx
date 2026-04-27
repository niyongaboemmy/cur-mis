import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useQuery } from "@tanstack/react-query";
import {
  Loader2,
  AlertTriangle,
  TrendingUp,
  CheckCircle2,
  Users,
  BarChart3,
  TrendingDown,
  Wallet,
} from "lucide-react";
import {
  financeReportService,
  balanceService,
} from "@/services/financeService";
import { useSystemStore } from "@/store/systemStore";

import { FEE_TYPE_LABELS, PAYMENT_METHOD_LABELS } from "@/types/finance";
import type { RecentPayment, RevenueByType } from "@/types/finance";
import { formatRWF } from "@/utils/formatCurrency";

export default function FinanceOverviewPage() {
  const basics = useSystemStore((s) => s.basics);
  const selectedYearLabel = useSystemStore((s) => s.selectedYearLabel);
  const basicsLoading = useSystemStore((s) => s.loading);

  const [yearId, setYearId] = useState<number | null>(null);

  // Sync with global academic year
  useEffect(() => {
    if (selectedYearLabel) {
      const year = basics?.years?.find((y) => y.label === selectedYearLabel);
      if (year) {
        setYearId(year.id);
      }
    } else {
      // Fallback to active year
      const active = basics?.active_year as any;
      if (active?.id) setYearId(active.id);
    }
  }, [selectedYearLabel, basics?.years]);

  const activeYear = basics?.years?.find(y => y.id === yearId) || (basics?.active_year as any);

  const summaryQ = useQuery({
    queryKey: ["finance", "summary", yearId],
    queryFn: () => financeReportService.getSummary(yearId!),
    enabled: !!yearId,
  });

  const revenueQ = useQuery({
    queryKey: ["finance", "revenue-report", yearId],
    queryFn: () => financeReportService.getRevenueByType(yearId!),
    enabled: !!yearId,
  });

  const balanceQ = useQuery({
    queryKey: ["finance", "balance", yearId],
    queryFn: () => balanceService.get(yearId!),
    enabled: !!yearId,
  });


  if (basicsLoading || (!activeYear && !summaryQ.isFetched)) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-brand" />
      </div>
    );
  }

  if (!activeYear) {
    return (
      <div className="card p-8 text-center text-ink-400">
        <p className="text-sm">No active academic year configured.</p>
      </div>
    );
  }

  if (summaryQ.isLoading || balanceQ.isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-brand" />
      </div>
    );
  }

  const summary = summaryQ.data?.data;
  const totals = summary?.totals;
  const revenue: RevenueByType[] = revenueQ.data?.data ?? [];
  const bal = balanceQ.data?.data;

  const collected = Number(totals?.total_collected ?? 0);
  const expected = Number(totals?.total_expected ?? 0);
  const pct =
    bal?.collection_rate ??
    (expected > 0 ? Math.round((collected / expected) * 100) : 0);
  const overdue = summary?.overdue_count ?? 0;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-ink-900 dark:text-white">
            Finance Dashboard
          </h2>
          <p className="text-[13px] text-ink-500">
            {activeYear.label} — Collection overview
          </p>
        </div>
        <span className="text-xs bg-ink-100 dark:bg-ink-700 text-ink-500 px-2.5 py-1 rounded-full">
          Active Year
        </span>
      </div>

      {/* Workflow Tracker */}
      <div className="card p-4 flex items-center justify-between relative overflow-hidden">
        {/* Background line */}
        <div className="absolute top-9 left-12 right-12 h-0.5 bg-ink-100 dark:bg-ink-700 z-0 hidden md:block" />

        {[
          {
            step: 1,
            label: "Fee Structures",
            desc: "Define term fees",
            active: expected === 0,
            done: expected > 0,
            link: "/finance/structures",
          },
          {
            step: 2,
            label: "Invoicing",
            desc: "Generate bills",
            active: expected > 0 && collected === 0,
            done: collected > 0,
            link: "/finance/billing",
          },
          {
            step: 3,
            label: "Payments",
            desc: "Receive & approve",
            active: collected > 0 && pct < 100,
            done: pct >= 100,
            link: "/finance/billing",
          },
          {
            step: 4,
            label: "Clearance",
            desc: "Finalize accounts",
            active: pct >= 100,
            done: false,
            link: "/finance/clearance",
          },
        ].map((s) => (
          <Link
            key={s.step}
            to={s.link}
            className={`relative z-10 flex flex-col items-center gap-2 group transition-all p-2 rounded-xl hover:bg-ink-50 dark:hover:bg-ink-800/50 ${
              s.active
                ? "opacity-100 scale-105"
                : s.done
                  ? "opacity-100"
                  : "opacity-50 grayscale"
            }`}
          >
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shadow-sm transition-colors ${
                s.active
                  ? "bg-brand text-white shadow-brand/30 ring-4 ring-brand/10"
                  : s.done
                    ? "bg-green-500 text-white shadow-green-500/20"
                    : "bg-ink-100 text-ink-400 dark:bg-ink-800 dark:text-ink-500"
              }`}
            >
              {s.done ? <CheckCircle2 className="w-5 h-5" /> : s.step}
            </div>
            <div className="text-center">
              <p
                className={`text-xs font-bold uppercase tracking-wider ${s.active ? "text-brand" : "text-ink-600 dark:text-ink-300"}`}
              >
                {s.label}
              </p>
              <p className="text-[10px] text-ink-400 hidden sm:block mt-0.5">
                {s.desc}
              </p>
            </div>
          </Link>
        ))}
      </div>

      {/* Overdue alert */}
      {overdue > 0 && (
        <div className="flex items-center gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-400">
            <span className="font-semibold">{overdue}</span> invoice
            {overdue !== 1 ? "s" : ""} past their due date.{" "}
            <Link to="/finance/billing" className="underline font-medium">
              View in Student Ledger →
            </Link>
          </p>
        </div>
      )}

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Total Expected"
          value={formatRWF(expected)}
          suffix="invoiced this year"
          icon={<TrendingUp className="w-4 h-4" />}
          color="text-ink-700 dark:text-ink-200"
          bg="bg-ink-50 dark:bg-ink-700/40"
        />
        <KpiCard
          label="Collected"
          value={formatRWF(collected)}
          suffix={`${pct}% of target`}
          icon={<CheckCircle2 className="w-4 h-4" />}
          color="text-green-600"
          bg="bg-green-50 dark:bg-green-900/20"
        />
        <KpiCard
          label="Expenses"
          value={formatRWF(bal?.total_expenses ?? 0)}
          suffix="recorded"
          icon={<TrendingDown className="w-4 h-4" />}
          color="text-red-600"
          bg="bg-red-50 dark:bg-red-900/20"
        />
        <KpiCard
          label="Net Balance"
          value={formatRWF(bal?.net_balance ?? 0)}
          suffix="surplus / deficit"
          icon={<Wallet className="w-4 h-4" />}
          color={
            (bal?.net_balance ?? 0) >= 0 ? "text-green-600" : "text-red-600"
          }
          bg={
            (bal?.net_balance ?? 0) >= 0
              ? "bg-green-50 dark:bg-green-900/20"
              : "bg-red-50 dark:bg-red-900/20"
          }
        />
      </div>

      {/* Status breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatusBadge
          label="Paid"
          count={Number(totals?.paid_count ?? 0)}
          color="bg-green-100  text-green-700  dark:bg-green-900/30  dark:text-green-400"
        />
        <StatusBadge
          label="Partial"
          count={Number(totals?.partial_count ?? 0)}
          color="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
        />
        <StatusBadge
          label="Unpaid"
          count={Number(totals?.unpaid_count ?? 0)}
          color="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
        />
        <StatusBadge
          label="Overdue"
          count={Number(totals?.overdue_count ?? 0)}
          color="bg-red-100    text-red-700    dark:bg-red-900/30    dark:text-red-400"
        />
      </div>

      {/* Collection progress — only shown when invoices exist */}
      {expected > 0 ? (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-brand" />
              <span className="font-medium text-sm">Collection Progress</span>
            </div>
            <span className="text-sm font-bold text-brand">{pct}%</span>
          </div>
          <div className="h-3 bg-ink-100 dark:bg-ink-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                pct >= 80
                  ? "bg-green-500"
                  : pct >= 50
                    ? "bg-yellow-500"
                    : "bg-red-500"
              }`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs text-ink-400">
            <span>{formatRWF(collected)} collected</span>
            <span>Target: {formatRWF(expected)}</span>
          </div>
        </div>
      ) : (
        <div className="card p-5 flex items-center gap-3 text-ink-400">
          <BarChart3 className="w-4 h-4 shrink-0" />
          <p className="text-sm">
            No invoices generated yet for{" "}
            <span className="font-semibold text-ink-600 dark:text-ink-300">
              {activeYear.label}
            </span>
            .
          </p>
        </div>
      )}

      {/* Revenue by fee type */}
      {revenue.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-ink-100 dark:border-ink-700 flex items-center gap-2 font-medium text-sm">
            <Users className="w-3.5 h-3.5 text-ink-400" /> Revenue by Fee
            Category
          </div>
          <div className="divide-y divide-ink-100 dark:divide-ink-700">
            {revenue.map((r: RevenueByType) => {
              const typePct =
                Number(r.total_expected) > 0
                  ? Math.round(
                      (Number(r.total_collected) / Number(r.total_expected)) *
                        100,
                    )
                  : 0;
              return (
                <div
                  key={r.fee_type}
                  className="px-4 py-3 flex items-center gap-4"
                >
                  <div className="w-32 shrink-0">
                    <p className="text-xs font-medium text-ink-700 dark:text-ink-200 truncate">
                      {FEE_TYPE_LABELS[r.fee_type] ?? r.fee_type}
                    </p>
                    <p className="text-[10px] text-ink-400">
                      {r.invoice_count} invoice
                      {Number(r.invoice_count) !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="h-2 bg-ink-100 dark:bg-ink-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          typePct >= 80
                            ? "bg-green-500"
                            : typePct >= 50
                              ? "bg-yellow-400"
                              : "bg-red-400"
                        }`}
                        style={{ width: `${Math.min(typePct, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right shrink-0 w-28">
                    <p className="text-xs font-mono font-semibold text-green-600">
                      {formatRWF(r.total_collected)}
                    </p>
                    <p className="text-[10px] text-ink-400">
                      / {formatRWF(r.total_expected)}
                    </p>
                  </div>
                  <div className="w-10 text-right shrink-0">
                    <span
                      className={`text-xs font-bold ${
                        typePct >= 80
                          ? "text-green-600"
                          : typePct >= 50
                            ? "text-yellow-600"
                            : "text-red-500"
                      }`}
                    >
                      {typePct}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {/* Expense breakdown */}
      {bal?.expense_by_category && bal.expense_by_category.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-ink-100 dark:border-ink-700 flex items-center gap-2 font-medium text-sm">
            <BarChart3 className="w-3.5 h-3.5 text-ink-400" /> Expenditure by
            Category
          </div>
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
            {bal.expense_by_category.map((c: any) => {
              const expPct =
                Number(bal.total_expenses) > 0
                  ? Math.round(
                      (Number(c.total) / Number(bal.total_expenses)) * 100,
                    )
                  : 0;
              return (
                <div key={c.category_name} className="space-y-1.5">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-ink-600 dark:text-ink-300">
                      {c.category_name}
                    </span>
                    <span className="text-ink-500">
                      {formatRWF(c.total)} ({expPct}%)
                    </span>
                  </div>
                  <div className="h-1.5 bg-ink-100 dark:bg-ink-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-400 rounded-full"
                      style={{ width: `${expPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent payments */}
      {summary?.recent_payments && summary.recent_payments.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-ink-100 dark:border-ink-700 font-medium text-sm flex items-center justify-between">
            <span>Recent Payments</span>
            <Link
              to="/finance/reports"
              className="text-xs text-brand hover:underline"
            >
              View report →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ink-50 dark:bg-ink-700/50 text-ink-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-2.5 text-left">Receipt #</th>
                  <th className="px-4 py-2.5 text-left">Student</th>
                  <th className="px-4 py-2.5 text-left">Fee Type</th>
                  <th className="px-4 py-2.5 text-left">Method</th>
                  <th className="px-4 py-2.5 text-right">Amount</th>
                  <th className="px-4 py-2.5 text-left">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                {summary.recent_payments.map((p: RecentPayment, i: number) => (
                  <tr
                    key={i}
                    className="hover:bg-ink-50/50 dark:hover:bg-ink-700/30"
                  >
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {p.receipt_number}
                    </td>
                    <td className="px-4 py-2.5 font-medium">
                      {p.fname} {p.lname}
                    </td>
                    <td className="px-4 py-2.5 text-ink-500 text-xs">
                      {FEE_TYPE_LABELS[p.fee_type]}
                    </td>
                    <td className="px-4 py-2.5 text-ink-500 text-xs">
                      {PAYMENT_METHOD_LABELS[p.payment_method]}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-green-600">
                      {formatRWF(p.amount)}
                    </td>
                    <td className="px-4 py-2.5 text-ink-500 text-xs">
                      {new Date(p.paid_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!summary && !summaryQ.isLoading && (
        <div className="card p-8 text-center text-ink-400 text-sm">
          No financial data for {activeYear.label} yet.
        </div>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  suffix,
  icon,
  color,
  bg,
}: {
  label: string;
  value: string;
  suffix: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
}) {
  return (
    <div className="card p-4 flex flex-col gap-2.5">
      <div
        className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center ${color}`}
      >
        {icon}
      </div>
      <p className="text-xs text-ink-500">{label}</p>
      <p className={`text-xl font-bold leading-none ${color}`}>{value}</p>
      <p className="text-[11px] text-ink-400">{suffix}</p>
    </div>
  );
}

function StatusBadge({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div
      className={`rounded-lg px-3 py-2.5 ${color} flex items-center justify-between gap-2`}
    >
      <span className="text-xs font-medium">{label}</span>
      <span className="text-lg font-bold leading-none">{count}</span>
    </div>
  );
}
