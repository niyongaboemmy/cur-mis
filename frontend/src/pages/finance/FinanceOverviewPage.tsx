import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2, AlertTriangle, TrendingUp, CheckCircle2, Users,
  BarChart3, TrendingDown, Wallet, Banknote, ArrowRight,
  Clock, XCircle, AlertCircle, Activity,
  Settings2, BookOpenCheck, ShieldCheck, GitMerge, ExternalLink, X,
} from "lucide-react";
import {
  financeReportService, balanceService, billingService,
  bursaryService,
} from "@/services/financeService";
import { useSystemStore } from "@/store/systemStore";
import { FEE_TYPE_LABELS, PAYMENT_METHOD_LABELS } from "@/types/finance";
import type { RecentPayment, RevenueByType, BillingSummary, FeeBursary } from "@/types/finance";
import { formatRWF } from "@/utils/formatCurrency";
import RecordPaymentStudentModal from "@/pages/finance/RecordPaymentStudentModal";
import {
  FinanceAreaChart, FinanceBarChart, FinanceDonut,
  CHART_COLORS,
} from "@/components/finance/FinanceCharts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveYearId(label: string, basics: any): number | null {
  if (label) {
    const found = basics?.years?.find((y: any) => y.label === label);
    if (found) return found.id;
  }
  return (basics?.active_year as any)?.id ?? null;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FinanceOverviewPage() {
  const basics = useSystemStore((s) => s.basics);
  const selectedYearLabel = useSystemStore((s) => s.selectedYearLabel);
  const basicsLoading = useSystemStore((s) => s.loading);
  const navigate = useNavigate();

  const [payStudent, setPayStudent] = useState<BillingSummary | null>(null);
  const [showFinanceModal, setShowFinanceModal] = useState(false);

  const yearId = resolveYearId(selectedYearLabel, basics);
  const activeYear = basics?.years?.find((y: any) => y.id === yearId) || (basics?.active_year as any);

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

  const monthlyQ = useQuery({
    queryKey: ["finance", "monthly", yearId],
    queryFn: () => financeReportService.getMonthlyCollections(yearId!),
    enabled: !!yearId,
  });

  const unpaidQ = useQuery({
    queryKey: ["finance", "unpaid-students", yearId],
    queryFn: async () => {
      const res = await billingService.getSummary({ academic_year_id: yearId!, per_page: 200, page: 1 });
      const all: BillingSummary[] = (res?.data as any)?.data ?? [];
      return all.filter((s) => Number(s.balance) > 0).sort((a, b) => Number(b.balance) - Number(a.balance)).slice(0, 8);
    },
    enabled: !!yearId,
  });

  const pendingBursariesQ = useQuery({
    queryKey: ["finance", "pending-bursaries", yearId],
    queryFn: () => bursaryService.list({ academic_year_id: yearId!, status: "pending", per_page: 50, page: 1 }),
    enabled: !!yearId,
    select: (res) => (res?.data as any)?.data as FeeBursary[] ?? [],
  });

  if (basicsLoading || (!basics && !summaryQ.isFetched)) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-brand" /></div>;
  }
  if (!activeYear) {
    return <div className="card p-8 text-center text-ink-400 text-sm">No active academic year configured.</div>;
  }
  if (summaryQ.isLoading || balanceQ.isLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-brand" /></div>;
  }

  const summary = summaryQ.data?.data;
  const totals  = summary?.totals;
  const revenue: RevenueByType[] = revenueQ.data?.data ?? [];
  const bal      = balanceQ.data?.data;
  const monthly  = monthlyQ.data?.data ?? [];
  const unpaidStudents = unpaidQ.data ?? [];
  const pendingBursaries: FeeBursary[] = pendingBursariesQ.data ?? [];

  const collected   = Number(totals?.total_collected ?? 0);
  const expected    = Number(totals?.total_expected  ?? 0);
  const pct         = bal?.collection_rate ?? (expected > 0 ? Math.round((collected / expected) * 100) : 0);
  const overdue     = summary?.overdue_count ?? 0;
  const unpaidCount = Number(totals?.unpaid_count  ?? 0);
  const partialCount= Number(totals?.partial_count ?? 0);
  const paidCount   = Number(totals?.paid_count    ?? 0);
  const totalPending= unpaidCount + partialCount;

  // Chart data: monthly area
  const areaData = monthly.map(m => ({
    month:     m.month,
    Collected: m.collected,
    Expenses:  m.expenses,
  }));

  // Chart data: revenue by type (bar)
  const revenueBarData = revenue
    .filter(r => Number(r.total_expected) > 0)
    .map(r => ({
      label:     FEE_TYPE_LABELS[r.fee_type] ?? r.fee_type,
      Expected:  Number(r.total_expected),
      Collected: Number(r.total_collected),
    }));

  // Chart data: status donut
  const statusDonut = [
    { name: "Paid",    value: paidCount,    color: CHART_COLORS.green  },
    { name: "Partial", value: partialCount, color: CHART_COLORS.orange },
    { name: "Unpaid",  value: unpaidCount,  color: CHART_COLORS.yellow },
    { name: "Overdue", value: overdue,      color: CHART_COLORS.red    },
  ].filter(d => d.value > 0);

  // Chart data: expense donut
  const expenseDonut = (bal?.expense_by_category ?? []).map((c: any) => ({
    name:  c.category_name,
    value: Number(c.total),
  }));

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-ink-900 dark:text-white">Finance Dashboard</h2>
          <p className="text-[13px] text-ink-500">{activeYear.label} — Collection overview</p>
        </div>
        <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2.5 py-1 rounded-full font-medium flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> Active Year
        </span>
      </div>

      {/* ── Workflow Tracker ── */}
      {(() => {
        const steps = [
          { step: 1, label: "Fee Structures", desc: "Define term fees",    icon: Settings2,     active: expected === 0,              done: expected > 0,  link: "/finance/structures" },
          { step: 2, label: "Invoicing",      desc: "Generate bills",      icon: BookOpenCheck, active: expected > 0 && collected === 0, done: collected > 0, link: "/finance/billing"    },
          { step: 3, label: "Payments",       desc: "Receive & approve",   icon: Banknote,      active: collected > 0 && pct < 100,  done: pct >= 100,    link: "/finance/billing"    },
          { step: 4, label: "Clearance",      desc: "Finalize accounts",   icon: ShieldCheck,   active: pct >= 100,                  done: false,         link: "/finance/clearance"  },
        ];
        const activeIdx = steps.findIndex((s) => s.active);
        return (
          <div className="card overflow-hidden">
            {/* top accent bar */}
            <div className="h-1 w-full bg-gradient-to-r from-brand via-brand/60 to-ink-100 dark:to-ink-700" />
            <div className="px-6 py-5">
              <div className="flex items-center gap-1">
                {steps.map((s, i) => {
                  const Icon = s.icon;
                  return (
                    <div key={s.step} className="flex items-center flex-1 min-w-0">
                      {/* Step pill */}
                      <Link
                        to={s.link}
                        className={`group relative flex flex-col sm:flex-row items-center sm:items-start gap-3 flex-1 min-w-0 rounded-xl px-3 py-3 transition-all duration-200
                          ${s.active
                            ? "bg-brand/10 dark:bg-brand/15 ring-1 ring-brand/20 dark:ring-brand/30 shadow-sm"
                            : s.done
                            ? "hover:bg-green-50/60 dark:hover:bg-green-900/10"
                            : "hover:bg-ink-50 dark:hover:bg-ink-800/40 opacity-50"
                          }`}
                      >
                        {/* Circle badge */}
                        <div className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200
                          ${s.active
                            ? "bg-brand text-white shadow-md shadow-brand/30"
                            : s.done
                            ? "bg-green-500 text-white shadow-sm shadow-green-500/20"
                            : "bg-ink-100 dark:bg-ink-700 text-ink-400 dark:text-ink-500"
                          }`}
                        >
                          {s.done
                            ? <CheckCircle2 className="w-4 h-4" />
                            : <Icon className="w-4 h-4" />
                          }
                        </div>
                        {/* Text */}
                        <div className="text-center sm:text-left min-w-0">
                          <div className="flex items-center gap-1.5 justify-center sm:justify-start">
                            <span className={`text-[10px] font-semibold uppercase tracking-widest
                              ${s.active ? "text-brand" : s.done ? "text-green-600 dark:text-green-400" : "text-ink-400"}`}>
                              Step {s.step}
                            </span>
                            {s.done && (
                              <span className="text-[9px] font-bold uppercase tracking-wider bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded-full">Done</span>
                            )}
                            {s.active && (
                              <span className="text-[9px] font-bold uppercase tracking-wider bg-brand/10 text-brand px-1.5 py-0.5 rounded-full animate-pulse">Active</span>
                            )}
                          </div>
                          <p className={`text-[13px] font-semibold leading-tight mt-0.5 truncate
                            ${s.active ? "text-ink-900 dark:text-white" : s.done ? "text-ink-700 dark:text-ink-200" : "text-ink-400 dark:text-ink-500"}`}>
                            {s.label}
                          </p>
                          <p className={`text-[11px] hidden sm:block mt-0.5 truncate
                            ${s.active ? "text-ink-500 dark:text-ink-400" : "text-ink-400 dark:text-ink-500"}`}>
                            {s.desc}
                          </p>
                        </div>
                      </Link>

                      {/* Connector */}
                      {i < steps.length - 1 && (
                        <div className="shrink-0 mx-1 flex flex-col items-center gap-0.5">
                          <div className={`w-8 h-0.5 rounded-full transition-colors duration-300
                            ${i < activeIdx || (activeIdx === -1 && steps[i].done)
                              ? "bg-green-400 dark:bg-green-600"
                              : i === activeIdx
                              ? "bg-gradient-to-r from-brand to-ink-200 dark:to-ink-600"
                              : "bg-ink-200 dark:bg-ink-700"
                            }`}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Alert banners ── */}
      {overdue > 0 && (
        <div className="flex items-center gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-400 flex-1"><span className="font-semibold">{overdue}</span> invoice{overdue !== 1 ? "s" : ""} past due date.</p>
          <Link to="/finance/billing?kpi=overdue" className="text-xs font-semibold text-red-600 hover:underline flex items-center gap-1 shrink-0">View <ArrowRight className="w-3 h-3" /></Link>
        </div>
      )}
      {totalPending > 0 && (
        <div className="flex items-center gap-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg px-4 py-3">
          <Clock className="w-4 h-4 text-yellow-600 shrink-0" />
          <p className="text-sm text-yellow-700 dark:text-yellow-400 flex-1"><span className="font-semibold">{totalPending}</span> invoice{totalPending !== 1 ? "s" : ""} awaiting payment ({unpaidCount} unpaid, {partialCount} partial).</p>
          <Link to="/finance/billing?kpi=pending" className="text-xs font-semibold text-yellow-700 hover:underline flex items-center gap-1 shrink-0">Collect <ArrowRight className="w-3 h-3" /></Link>
        </div>
      )}

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: "Total Expected",  value: formatRWF(expected),               sub: "invoiced this year",      icon: TrendingUp,   color: "text-ink-700 dark:text-ink-200",  bg: "bg-ink-100 dark:bg-ink-700" },
          { label: "Collected",       value: formatRWF(collected),              sub: `${pct}% of target`,       icon: CheckCircle2, color: "text-green-600",                  bg: "bg-green-50 dark:bg-green-900/20" },
          { label: "App Fee Transfers", value: formatRWF(summary?.app_transfer_total ?? 0), sub: `${summary?.app_transfer_count ?? 0} application credits`, icon: GitMerge, color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-900/20" },
          { label: "Expenses",        value: formatRWF(bal?.total_expenses ?? 0), sub: "recorded this year",    icon: TrendingDown, color: "text-red-600",                    bg: "bg-red-50 dark:bg-red-900/20" },
          { label: "Net Balance",     value: formatRWF(bal?.net_balance ?? 0),  sub: "surplus / deficit",       icon: Wallet,       color: (bal?.net_balance ?? 0) >= 0 ? "text-green-600" : "text-red-600", bg: (bal?.net_balance ?? 0) >= 0 ? "bg-green-50 dark:bg-green-900/20" : "bg-red-50 dark:bg-red-900/20" },
        ].map((k) => (
          <div key={k.label} className="card p-4 flex flex-col gap-2.5">
            <div className={`w-9 h-9 rounded-xl ${k.bg} flex items-center justify-center ${k.color}`}>
              <k.icon className="w-4 h-4" />
            </div>
            <p className="text-xs text-ink-500">{k.label}</p>
            <p className={`text-xl font-bold leading-none ${k.color}`}>{k.value}</p>
            <p className="text-[11px] text-ink-400">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Status breakdown — clickable badges ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Paid",    count: paidCount,    icon: CheckCircle2, color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",   to: "/finance/billing?kpi=collected" },
          { label: "Partial", count: partialCount, icon: AlertCircle,  color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400", to: "/finance/billing?kpi=partial"   },
          { label: "Unpaid",  count: unpaidCount,  icon: XCircle,      color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400", to: "/finance/billing?kpi=pending"   },
          { label: "Overdue", count: overdue,      icon: AlertTriangle, color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",            to: "/finance/billing?kpi=overdue"   },
        ].map((s) => (
          <Link key={s.label} to={s.to}
            className={`rounded-xl px-4 py-3 ${s.color} flex items-center justify-between gap-2 hover:opacity-80 transition-all hover:scale-[1.02] shadow-sm`}
          >
            <div className="flex items-center gap-1.5">
              <s.icon className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">{s.label}</span>
            </div>
            <span className="text-xl font-bold leading-none">{s.count}</span>
          </Link>
        ))}
      </div>

      {/* ── Charts Row 1: Monthly trend + Status donut ── */}
      {(monthly.length > 0 || statusDonut.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Monthly Collections vs Expenses */}
          {monthly.length > 0 && (
            <div className="card p-4 lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-ink-800 dark:text-white flex items-center gap-2">
                    <Activity className="w-4 h-4 text-brand" /> Monthly Collections vs Expenses
                  </h3>
                  <p className="text-[11px] text-ink-400 mt-0.5">{activeYear.label}</p>
                </div>
              </div>
              <FinanceAreaChart
                data={areaData}
                series={[
                  { key: "Collected", label: "Collected",  color: CHART_COLORS.green },
                  { key: "Expenses",  label: "Expenses",   color: CHART_COLORS.red, dashed: true },
                ]}
                height={210}
              />
            </div>
          )}

          {/* Invoice Status Donut */}
          {statusDonut.length > 0 && (
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-ink-800 dark:text-white mb-1">Invoice Status</h3>
              <p className="text-[11px] text-ink-400 mb-3">Student payment breakdown</p>
              <FinanceDonut
                data={statusDonut}
                height={190}
                innerLabel={`${pct}%`}
                innerSub="collected"
              />
              <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px]">
                {statusDonut.map(d => (
                  <div key={d.name} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                    <span className="text-ink-500">{d.name}: <strong className="text-ink-700 dark:text-ink-200">{d.value}</strong></span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Opening Balance & Payments Button */}
          <button
            onClick={() => setShowFinanceModal(true)}
            className="card p-4 flex flex-col items-center justify-center gap-3 hover:shadow-md transition-all hover:scale-105 cursor-pointer bg-gradient-to-br from-brand/5 to-brand/10 dark:from-brand/10 dark:to-brand/15 border-brand/30 dark:border-brand/40"
          >
            <div className="w-12 h-12 rounded-xl bg-brand text-white flex items-center justify-center">
              <ExternalLink className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-ink-800 dark:text-white">Opening Balance</h3>
            <p className="text-[11px] text-ink-500 text-center">Various payments and sponsors</p>
          </button>
        </div>
      )}

      {/* ── Collection Progress ── */}
      {expected > 0 && (
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
              className={`h-full rounded-full transition-all duration-700 ${pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-500"}`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs text-ink-400">
            <span>{formatRWF(collected)} collected</span>
            <span>Target: {formatRWF(expected)}</span>
          </div>
        </div>
      )}

      {/* ── Charts Row 2: Revenue by type bar + Expense donut ── */}
      {(revenueBarData.length > 0 || expenseDonut.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {revenueBarData.length > 0 && (
            <div className="card p-4 lg:col-span-2">
              <h3 className="text-sm font-semibold text-ink-800 dark:text-white mb-1 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-brand" /> Revenue by Fee Category
              </h3>
              <p className="text-[11px] text-ink-400 mb-3">Expected vs collected per fee type</p>
              <FinanceBarChart
                data={revenueBarData}
                series={[
                  { key: "Expected",  label: "Expected",  color: CHART_COLORS.brand + "60" },
                  { key: "Collected", label: "Collected", color: CHART_COLORS.green },
                ]}
                height={210}
              />
            </div>
          )}

          {expenseDonut.length > 0 && (
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-ink-800 dark:text-white mb-1">Expenditure</h3>
              <p className="text-[11px] text-ink-400 mb-3">Breakdown by category</p>
              <FinanceDonut
                data={expenseDonut}
                height={190}
                innerLabel={formatRWF(bal?.total_expenses ?? 0).split(' ')[0]}
                innerSub="total spent"
              />
            </div>
          )}
        </div>
      )}

      {/* ── Outstanding Balances ── */}
      {!!yearId && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-ink-100 dark:border-ink-700 flex items-center justify-between">
            <div className="flex items-center gap-2 font-medium text-sm">
              <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />
              Outstanding Balances
              {!unpaidQ.isFetching && unpaidStudents.length > 0 && (
                <span className="text-[10px] bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 px-1.5 py-0.5 rounded font-mono">{unpaidStudents.length}</span>
              )}
            </div>
            <Link to="/finance/billing?kpi=pending" className="text-xs text-brand hover:underline flex items-center gap-1">View all <ArrowRight className="w-3 h-3" /></Link>
          </div>
          {unpaidQ.isFetching ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-brand" /></div>
          ) : unpaidStudents.length === 0 ? (
            <div className="flex items-center gap-3 px-5 py-6 text-ink-400">
              <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
              <p className="text-sm">No outstanding balances for {activeYear?.label}.</p>
            </div>
          ) : (
            <div className="divide-y divide-ink-100 dark:divide-ink-700">
              {unpaidStudents.map((s) => (
                <div key={s.regnumber} className="px-4 py-3 flex items-center gap-3 hover:bg-ink-50/50 dark:hover:bg-ink-700/20 group">
                  <div className="w-8 h-8 rounded-full bg-brand/10 flex items-center justify-center text-brand font-bold text-xs shrink-0">
                    {s.fname?.charAt(0) ?? "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink-800 dark:text-ink-100 truncate">{s.lname} {s.fname}</p>
                    <p className="text-[11px] text-ink-400 font-mono">{s.regnumber}</p>
                  </div>
                  <p className="text-xs text-ink-400 hidden sm:block truncate max-w-[120px]">{s.department || s.faculty || "—"}</p>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-red-600">{formatRWF(s.balance)}</p>
                    <p className="text-[10px] text-ink-400">outstanding</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => setPayStudent(s)} className="btn-ghost btn-xs text-brand opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1" title="Record payment">
                      <Banknote className="w-3.5 h-3.5" /><span className="hidden sm:inline">Pay</span>
                    </button>
                    <button onClick={() => navigate(`/finance/billing/${s.regnumber}`)} className="btn-ghost btn-xs text-ink-500 opacity-0 group-hover:opacity-100 transition-opacity" title="View ledger">
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Pending Bursaries ── */}
      {!!yearId && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-ink-100 dark:border-ink-700 flex items-center justify-between">
            <div className="flex items-center gap-2 font-medium text-sm">
              <Clock className="w-3.5 h-3.5 text-blue-500" />
              Pending Bursaries
              {!pendingBursariesQ.isFetching && pendingBursaries.length > 0 && (
                <span className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 px-1.5 py-0.5 rounded font-mono">{pendingBursaries.length}</span>
              )}
            </div>
            <Link to="/finance/bursaries" className="text-xs text-brand hover:underline flex items-center gap-1">Manage <ArrowRight className="w-3 h-3" /></Link>
          </div>
          {pendingBursariesQ.isFetching ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-brand" /></div>
          ) : pendingBursaries.length === 0 ? (
            <div className="flex items-center gap-3 px-5 py-6 text-ink-400">
              <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
              <p className="text-sm">No pending bursaries for {activeYear?.label}.</p>
            </div>
          ) : (
            <div className="divide-y divide-ink-100 dark:divide-ink-700">
              {pendingBursaries.map((b) => (
                <Link key={b.id} to={`/finance/bursaries?open=${b.id}`}
                  className="px-4 py-3 flex items-center gap-3 hover:bg-ink-50/50 dark:hover:bg-ink-700/20 group"
                >
                  <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 font-bold text-xs shrink-0">
                    {b.student_fname?.charAt(0) ?? "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink-800 dark:text-ink-100 truncate">{b.student_lname} {b.student_fname}</p>
                    <p className="text-[11px] text-ink-400 font-mono">{b.student_id}</p>
                  </div>
                  <p className="text-xs text-ink-500 hidden sm:block truncate max-w-[140px]">{b.bursary_type}</p>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-blue-600">{formatRWF(b.amount)}</p>
                    <p className="text-[10px] text-ink-400">pending</p>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 shrink-0 text-brand opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Recent Payments ── */}
      {summary?.recent_payments && summary.recent_payments.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-ink-100 dark:border-ink-700 font-medium text-sm flex items-center justify-between">
            <span className="flex items-center gap-2"><Users className="w-3.5 h-3.5 text-ink-400" /> Recent Payments</span>
            <Link to="/finance/reports" className="text-xs text-brand hover:underline">View report →</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ink-50 dark:bg-ink-700/50 text-ink-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-2.5 text-left">Receipt #</th>
                  <th className="px-4 py-2.5 text-left">Student</th>
                  <th className="px-4 py-2.5 text-left">Fee Type</th>
                  <th className="px-4 py-2.5 text-left">Method / Source</th>
                  <th className="px-4 py-2.5 text-right">Amount</th>
                  <th className="px-4 py-2.5 text-left">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                {summary.recent_payments.map((p: RecentPayment, i: number) => (
                  <tr key={i} className="hover:bg-ink-50/50 dark:hover:bg-ink-700/30">
                    <td className="px-4 py-2.5 font-mono text-xs">{p.receipt_number}</td>
                    <td className="px-4 py-2.5 font-medium">{p.fname} {p.lname}</td>
                    <td className="px-4 py-2.5 text-ink-500 text-xs">{FEE_TYPE_LABELS[p.fee_type]}</td>
                    <td className="px-4 py-2.5 text-xs">
                      {p.source === 'APPLICATION_TRANSFER' ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 font-medium">
                          <GitMerge className="w-3 h-3" /> App Fee Transfer
                        </span>
                      ) : (
                        <span className="text-ink-500">{PAYMENT_METHOD_LABELS[p.payment_method]}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-green-600">{formatRWF(p.amount)}</td>
                    <td className="px-4 py-2.5 text-ink-500 text-xs">{new Date(p.paid_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!summary && !summaryQ.isLoading && (
        <div className="card p-8 text-center text-ink-400 text-sm">No financial data for {activeYear.label} yet.</div>
      )}

      {payStudent && yearId && (
        <RecordPaymentStudentModal
          studentId={payStudent.regnumber}
          studentName={`${payStudent.lname} ${payStudent.fname}`}
          academicYearId={yearId}
          onClose={() => setPayStudent(null)}
          onDone={() => { setPayStudent(null); unpaidQ.refetch(); summaryQ.refetch(); }}
        />
      )}

      {/* Opening Balance & Payments Modal */}
      {showFinanceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70 backdrop-blur-sm">
          <div className="w-[90vw] h-[90vh] max-w-[90%] max-h-[90%] bg-white dark:bg-ink-800 rounded-xl shadow-2xl flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-ink-100 dark:border-ink-700">
              <div className="flex items-center gap-2">
                <ExternalLink className="w-4 h-4 text-brand" />
                <h2 className="text-sm font-semibold text-ink-800 dark:text-white">Opening Balance - Various Payments & Sponsors</h2>
              </div>
              <button
                onClick={() => setShowFinanceModal(false)}
                className="p-1.5 hover:bg-ink-100 dark:hover:bg-ink-700 rounded-lg transition-colors"
                title="Close modal"
              >
                <X className="w-4 h-4 text-ink-500 dark:text-ink-400" />
              </button>
            </div>

            {/* Modal Body - iFrame */}
            <div className="flex-1 overflow-hidden bg-white dark:bg-ink-900">
              <iframe
                src="https://cur.ac.rw/umis/finance/index.php"
                className="w-full h-full border-none"
                title="Finance Portal"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
