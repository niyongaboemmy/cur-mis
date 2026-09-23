import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import VoidRequestButton from "@/components/service-requests/VoidRequestButton";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell,
} from "recharts";
import {
  FileText, Clock, CreditCard, CheckCircle2, XCircle, Wallet,
  Timer, RefreshCw, AlertTriangle, Loader2, Layers,
} from "lucide-react";
import { serviceRequestReportService, type ReportFilter } from "@/services/serviceRequestReportService";
import ServiceRequestListModal from "@/components/service-requests/ServiceRequestListModal";
import { Link } from "react-router-dom";

/* ─── Palette ─────────────────────────────────────────────────────────────
 * Status colors are semantic (reserved), not cycled — same mapping used by
 * the status badges on the queue/my-requests/tracking pages elsewhere in
 * this feature, so a given status always reads the same color everywhere. */
const STATUS_COLORS: Record<string, string> = {
  submitted: "#f59e0b",
  in_review: "#f59e0b",
  changes_requested: "#f97316",
  awaiting_payment: "#3b82f6",
  paid: "#10b981",
  completed: "#10b981",
  rejected: "#ef4444",
  cancelled: "#9ca3af",
  expired: "#9ca3af",
};
const SERVICE_COLORS = ["#6366f1", "#22c55e", "#3b82f6", "#f97316", "#8b5cf6", "#14b8a6", "#ec4899", "#eab308"];

const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  in_review: "In Review",
  changes_requested: "Changes Requested",
  awaiting_payment: "Awaiting Payment",
  paid: "Paid",
  completed: "Completed",
  rejected: "Rejected",
  cancelled: "Cancelled",
  expired: "Expired",
};

const DAY_RANGES = [7, 30, 90] as const;

export default function ServiceRequestsDashboardPage() {
  const [days, setDays] = useState<(typeof DAY_RANGES)[number]>(30);
  const qc = useQueryClient();

  const reportQ = useQuery({
    queryKey: ["service-requests", "reports", "overview", days],
    queryFn: ({ signal }) => serviceRequestReportService.getOverview(days, signal),
  });

  const data = reportQ.data?.data;

  const [activeFilter, setActiveFilter] = useState<{ filter: ReportFilter; title: string } | null>(null);

  const handleRefresh = () => qc.invalidateQueries({ queryKey: ["service-requests", "reports"] });

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center">
            <Layers className="w-6 h-6 text-primary-600" />
          </div>
          <div>
            <h1 className="text-xl font-black text-gray-900 dark:text-white">Service Requests Report</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Volume, approval bottlenecks, revenue, and turnaround across all services.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-900 p-1 rounded-xl">
            {DAY_RANGES.map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  days === d
                    ? "bg-white dark:bg-gray-800 text-primary-600 shadow-sm"
                    : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
          <button
            onClick={handleRefresh}
            disabled={reportQ.isFetching}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${reportQ.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {reportQ.isLoading && (
        <div className="flex items-center justify-center h-64 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      )}

      {reportQ.isError && (
        <div className="flex flex-col items-center justify-center h-48 gap-2 text-red-500">
          <AlertTriangle className="w-6 h-6" />
          <span className="text-sm">Failed to load the report.</span>
        </div>
      )}

      {data && (
        <>
          {/* KPI row — click any card to drill into a paginated, exportable list */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Total Requests"
              value={data.totals.total}
              icon={<FileText className="w-5 h-5" />}
              accent="indigo"
              onClick={() => setActiveFilter({ filter: "total", title: "Total Requests" })}
            />
            <KpiCard
              label="Pending Review"
              value={data.totals.pending_review}
              icon={<Clock className="w-5 h-5" />}
              accent="amber"
              onClick={() => setActiveFilter({ filter: "pending_review", title: "Pending Review" })}
            />
            <KpiCard
              label="Awaiting Payment"
              value={data.totals.awaiting_payment}
              icon={<CreditCard className="w-5 h-5" />}
              accent="blue"
              onClick={() => setActiveFilter({ filter: "awaiting_payment", title: "Awaiting Payment" })}
            />
            <KpiCard
              label="Completed"
              value={data.totals.completed}
              icon={<CheckCircle2 className="w-5 h-5" />}
              accent="green"
              onClick={() => setActiveFilter({ filter: "completed", title: "Completed" })}
            />
            <KpiCard
              label="Rejected / Cancelled"
              value={data.totals.rejected + data.totals.cancelled}
              sub={`${data.totals.rejected} rejected · ${data.totals.cancelled} cancelled`}
              icon={<XCircle className="w-5 h-5" />}
              accent="red"
              onClick={() => setActiveFilter({ filter: "rejected_cancelled", title: "Rejected / Cancelled" })}
            />
            <KpiCard
              label="Revenue Collected"
              value={`${data.totals.revenue.toLocaleString()} RWF`}
              icon={<Wallet className="w-5 h-5" />}
              accent="green"
              onClick={() => setActiveFilter({ filter: "paid_or_completed", title: "Paid & Completed Requests" })}
            />
            <KpiCard
              label="Avg. Turnaround"
              value={data.turnaround.avg_hours != null ? formatHours(data.turnaround.avg_hours) : "—"}
              sub={data.turnaround.sample_size ? `Based on ${data.turnaround.sample_size} completed request(s)` : "No completed requests yet"}
              icon={<Timer className="w-5 h-5" />}
              accent="indigo"
              onClick={() => setActiveFilter({ filter: "completed", title: "Completed" })}
            />
            <KpiCard
              label="Currently In Review"
              value={data.stage_workload.reduce((sum, s) => sum + s.count, 0)}
              sub={data.stage_workload.length ? `Across ${data.stage_workload.length} stage(s)` : "No backlog"}
              icon={<Layers className="w-5 h-5" />}
              accent="amber"
              onClick={() => setActiveFilter({ filter: "in_review", title: "Currently In Review" })}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Trend */}
            <ChartCard className="lg:col-span-2">
              <SectionTitle title="Submission Trend" sub={`Requests submitted per day, last ${days} days`} />
              {data.trend.every((t) => t.count === 0) ? (
                <EmptyState message="No submissions in this period." />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={data.trend} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis
                      dataKey="day"
                      tickFormatter={(d) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      tick={{ fontSize: 11, fill: "#9ca3af" }}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={24}
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={28} />
                    <Tooltip content={<CustomTooltip />} labelFormatter={(d) => new Date(d as string).toLocaleDateString()} />
                    <Area type="monotone" dataKey="count" name="Requests" stroke="#6366f1" strokeWidth={2} fill="url(#trendFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* Status breakdown */}
            <ChartCard>
              <SectionTitle title="Status Breakdown" sub="All requests, all time" />
              {data.status_breakdown.length === 0 ? (
                <EmptyState message="No requests yet." />
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={data.status_breakdown}
                        dataKey="count"
                        nameKey="status"
                        innerRadius={45}
                        outerRadius={75}
                        paddingAngle={2}
                        stroke="none"
                      >
                        {data.status_breakdown.map((s) => (
                          <Cell key={s.status} fill={STATUS_COLORS[s.status] ?? "#9ca3af"} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip nameFormatter={(n: string) => STATUS_LABELS[n] ?? n} />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="mt-2 space-y-1.5">
                    {data.status_breakdown.map((s) => (
                      <div key={s.status} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: STATUS_COLORS[s.status] ?? "#9ca3af" }} />
                          {STATUS_LABELS[s.status] ?? s.status}
                        </span>
                        <span className="font-mono font-bold text-gray-800 dark:text-gray-100">{s.count}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* By service */}
            <ChartCard className="lg:col-span-2">
              <SectionTitle title="Requests by Service" sub="Volume and revenue per service" />
              {data.by_service.length === 0 ? (
                <EmptyState message="No requests yet." />
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(180, data.by_service.length * 48)}>
                  <BarChart data={data.by_service} layout="vertical" margin={{ top: 4, right: 24, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={140}
                      tick={{ fontSize: 12, fill: "#6b7280" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="total" name="Requests" radius={[0, 4, 4, 0]} barSize={18}>
                      {data.by_service.map((s, i) => (
                        <Cell key={s.id} fill={SERVICE_COLORS[i % SERVICE_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* Stage workload */}
            <ChartCard>
              <SectionTitle title="Approval Backlog" sub="Requests currently in review, by stage" />
              {data.stage_workload.length === 0 ? (
                <EmptyState message="Nothing currently in review." />
              ) : (
                <div className="space-y-3">
                  {data.stage_workload.map((s, i) => (
                    <div key={`${s.service_name}-${s.stage_label}`}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-gray-600 dark:text-gray-300 truncate pr-2">
                          {s.stage_label} <span className="text-gray-400">· {s.service_name}</span>
                        </span>
                        <span className="font-mono font-bold text-gray-800 dark:text-gray-100 shrink-0">{s.count}</span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, (s.count / Math.max(...data.stage_workload.map((x) => x.count))) * 100)}%`,
                            background: SERVICE_COLORS[i % SERVICE_COLORS.length],
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ChartCard>
          </div>

          {/* Recent activity */}
          <ChartCard>
            <div className="flex items-center justify-between mb-4">
              <SectionTitle title="Recent Activity" sub="Latest 10 requests across all services" />
              <Link to="/service-requests/queue" className="text-xs font-bold text-primary-600 hover:underline shrink-0">
                Go to approval queue →
              </Link>
            </div>
            {data.recent.length === 0 ? (
              <EmptyState message="No requests yet." />
            ) : (
              <div className="overflow-x-auto -mx-5">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 dark:border-gray-800">
                      <th className="px-5 py-2">Request</th>
                      <th className="px-5 py-2">Requester</th>
                      <th className="px-5 py-2">Service</th>
                      <th className="px-5 py-2">Status</th>
                      <th className="px-5 py-2">Submitted</th>
                      <th className="px-5 py-2"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map((r) => (
                      <tr key={r.id} className="border-b border-gray-50 dark:border-gray-800/60">
                        <td className="px-5 py-2.5 font-mono text-xs text-gray-500">{r.request_code}</td>
                        <td className="px-5 py-2.5 text-gray-700 dark:text-gray-200">{r.full_name}</td>
                        <td className="px-5 py-2.5 text-gray-500">{r.service_name}</td>
                        <td className="px-5 py-2.5">
                          <span
                            className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
                            style={{
                              background: `${STATUS_COLORS[r.status] ?? "#9ca3af"}1A`,
                              color: STATUS_COLORS[r.status] ?? "#9ca3af",
                            }}
                          >
                            {STATUS_LABELS[r.status] ?? r.status}
                          </span>
                        </td>
                        <td className="px-5 py-2.5 text-gray-400 text-xs">
                          {r.submitted_at ? new Date(r.submitted_at).toLocaleString() : "-"}
                        </td>
                        <td className="px-5 py-2.5 text-right">
                          <VoidRequestButton
                            requestId={r.id}
                            requestCode={r.request_code}
                            status={r.status}
                            invalidateKeys={[["service-requests", "reports"]]}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ChartCard>
        </>
      )}

      {activeFilter && (
        <ServiceRequestListModal
          filter={activeFilter.filter}
          title={activeFilter.title}
          onClose={() => setActiveFilter(null)}
        />
      )}
    </div>
  );
}

function formatHours(hours: number): string {
  if (hours < 24) return `${hours}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function KpiCard({
  label, value, sub, icon, accent = "indigo", onClick,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  accent?: "indigo" | "green" | "red" | "amber" | "blue";
  onClick?: () => void;
}) {
  const accents: Record<string, string> = {
    indigo: "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400",
    green: "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400",
    red: "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400",
    amber: "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400",
    blue: "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400",
  };
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`w-full text-left bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 flex items-start gap-4 transition-all ${
        onClick ? "cursor-pointer hover:border-primary-300 dark:hover:border-primary-700 hover:shadow-md hover:-translate-y-0.5" : ""
      }`}
    >
      <div className={`rounded-xl p-2.5 shrink-0 ${accents[accent]}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{label}</p>
        <p className="text-xl font-black text-gray-900 dark:text-white mt-0.5 truncate">{value}</p>
        {sub && <p className="text-[11px] text-gray-400 mt-0.5 truncate">{sub}</p>}
      </div>
    </Tag>
  );
}

function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-bold text-gray-900 dark:text-white">{title}</h3>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function ChartCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 ${className}`}>
      {children}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-2 text-gray-400">
      <AlertTriangle className="w-7 h-7 opacity-40" />
      <p className="text-xs">{message}</p>
    </div>
  );
}

function CustomTooltip({ active, payload, label, nameFormatter }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-lg shadow-lg px-3 py-2 text-xs min-w-[140px]">
      {label != null && <p className="font-semibold text-gray-700 dark:text-gray-200 mb-1.5">{label}</p>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-gray-500">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color ?? p.payload?.fill }} />
            {nameFormatter ? nameFormatter(p.name ?? p.payload?.status) : p.name}
          </span>
          <span className="font-mono font-semibold text-gray-800 dark:text-gray-100">{p.value}</span>
        </div>
      ))}
    </div>
  );
}
