import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  CalendarDays,
  Search,
  Loader2,
  Check,
  X,
  ClipboardList,
  Clock,
  CheckCircle2,
  Users,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  MessageSquareWarning,
  Plus,
  Settings2,
  Route,
  Layers,
} from "lucide-react";
import {
  hrService,
  type LeaveDecision,
  type LeaveRequest,
  type LeaveStatus,
  type LeaveType,
} from "@/services/hrService";
import { PERMISSIONS, LEAVE_STAGE_PERMISSIONS } from "@/constants";
import { useAnyPermission, usePermission } from "@/utils/permissions";
import ModalPortal from "@/components/ui/ModalPortal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import LeaveStatusBadge from "@/components/hr/leave/LeaveStatusBadge";
import LeaveStagePill from "@/components/hr/leave/LeaveStagePill";
import LeaveProgressModal from "@/components/hr/leave/LeaveProgressModal";
import LeaveChainEditorModal from "@/components/hr/leave/LeaveChainEditorModal";
import LeaveStageAge from "@/components/hr/leave/LeaveStageAge";
import LeaveDecisionConfirm from "@/components/hr/leave/LeaveDecisionConfirm";
import { fmtDate as fmt, prettyDays } from "@/components/hr/leave/leaveStatus";

const CUR_Y = new Date().getFullYear();
const YEAR_OPTS = Array.from({ length: 4 }, (_, i) => CUR_Y - i);
const STATUS_OPTS: { v: LeaveStatus | ""; label: string }[] = [
  { v: "", label: "All" },
  { v: "Pending", label: "In Review" },
  { v: "ChangesRequested", label: "Changes Requested" },
  { v: "Approved", label: "Approved" },
  { v: "Rejected", label: "Rejected" },
  { v: "Cancelled", label: "Cancelled" },
];

/* ══════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════════════════════════════════ */
export default function LeavePage() {
  // Anyone holding a stage permission can decide from this list; the server
  // still refuses a decision on a stage the actor does not own.
  const canDecide = useAnyPermission([
    PERMISSIONS.MANAGE_LEAVE_REQUESTS,
    ...LEAVE_STAGE_PERMISSIONS,
  ]);
  const canCancel = usePermission(PERMISSIONS.MANAGE_LEAVE_REQUESTS);
  // Editing the chain is a leave-type concern, not a per-request one.
  const canEditChain = usePermission(PERMISSIONS.MANAGE_LEAVE_TYPES);
  // Filing on someone else's behalf is what the admin submit endpoint is for.
  const canFileForOthers = useAnyPermission([
    PERMISSIONS.MANAGE_LEAVE_REQUESTS,
    PERMISSIONS.VIEW_HR_EMPLOYEES,
  ]);
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<LeaveStatus | "">("");
  const [year, setYear] = useState(CUR_Y);
  const [stageOrder, setStageOrder] = useState<number | "">("");
  const [page, setPage] = useState(1);

  /* modals */
  const [newOpen, setNewOpen] = useState(false);
  const [deciding, setDeciding] = useState<{
    request: LeaveRequest;
    decision: LeaveDecision;
  } | null>(null);
  const [cancelling, setCancelling] = useState<LeaveRequest | null>(null);
  const [progressId, setProgressId] = useState<number | null>(null);
  const [chainOpen, setChainOpen] = useState(false);

  const { data: statsData } = useQuery({
    queryKey: ["leave-stats"],
    queryFn: ({ signal }) => hrService.leaveStats(signal),
  });
  const stats = statsData?.data;

  const { data: res, isLoading } = useQuery({
    queryKey: ["leave-requests", { search, status, year, stageOrder, page }],
    queryFn: ({ signal }) =>
      hrService.leaveRequests(
        {
          q: search,
          status: status || undefined,
          year,
          stage_order: stageOrder || undefined,
          page,
          per_page: 20,
        },
        signal,
      ),
    placeholderData: (prev) => prev,
  });
  const requests = (res?.data?.data ?? []) as LeaveRequest[];
  const total = res?.data?.total ?? 0;
  const lastPage = res?.data?.last_page ?? 1;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["leave-requests"] });
    qc.invalidateQueries({ queryKey: ["leave-stats"] });
    qc.invalidateQueries({ queryKey: ["leave-approval-queue"] });
    qc.invalidateQueries({ queryKey: ["leave-progress"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-ink-900 dark:text-white flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-brand" /> Leave Management
          </h2>
          <p className="text-[13px] text-ink-500">
            Staff leave requests and approvals
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEditChain && (
            <button
              className="btn-secondary flex items-center gap-1.5 text-[13px]"
              onClick={() => setChainOpen(true)}
              title="Configure who approves each leave type, and in what order"
            >
              <Settings2 className="w-4 h-4" /> Approval Chain
            </button>
          )}
          {canFileForOthers && (
            <button
              className="btn-primary flex items-center gap-1.5 text-[13px]"
              onClick={() => setNewOpen(true)}
            >
              <Plus className="w-4 h-4" /> New Request
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        <StatCard
          icon={Clock}
          color="amber"
          label="In Review"
          value={stats?.pending ?? 0}
        />
        <StatCard
          icon={MessageSquareWarning}
          color="orange"
          label="Changes Requested"
          value={stats?.changes_requested ?? 0}
        />
        <StatCard
          icon={CheckCircle2}
          color="emerald"
          label="Approved"
          value={stats?.approved ?? 0}
        />
        <StatCard
          icon={Users}
          color="blue"
          label="On Leave Today"
          value={stats?.on_leave_today ?? 0}
        />
        <StatCard
          icon={AlertTriangle}
          color="red"
          label="Past SLA"
          value={stats?.overdue ?? 0}
        />
        <StatCard
          icon={ClipboardList}
          color="ink"
          label="Total This Year"
          value={stats?.total ?? 0}
        />
      </div>

      {/* Where the in-flight requests are sitting in their approval chains. */}
      {!!stats?.by_stage?.length && (
        <div className="card px-4 py-3">
          <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-brand" /> Awaiting decision, by
            approval stage
          </p>
          <div className="flex flex-wrap gap-2">
            {stats.by_stage.map((st) => (
              <button
                key={st.stage_order}
                onClick={() => {
                  setStageOrder((cur) =>
                    cur === st.stage_order ? "" : st.stage_order,
                  );
                  setStatus("Pending");
                  setPage(1);
                }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                  stageOrder === st.stage_order
                    ? "bg-brand text-white border-brand"
                    : "bg-ink-50 dark:bg-ink-700/40 text-ink-600 dark:text-ink-300 border-ink-200 dark:border-ink-700 hover:bg-ink-100"
                }`}
              >
                {st.stage_label}
                <span className="tabular-nums font-bold">{st.total}</span>
                {st.overdue > 0 && (
                  <span
                    className="inline-flex items-center gap-0.5 px-1.5 rounded-full bg-red-100 text-red-700 dark:bg-red-500/25 dark:text-red-200 text-[10px] font-bold"
                    title={`${st.overdue} past this stage's SLA`}
                  >
                    <AlertTriangle className="w-2.5 h-2.5" />
                    {st.overdue}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filters + table */}
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-ink-100 dark:border-ink-700">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" />
            <input
              className="input pl-9 py-1.5 text-[13px] w-full"
              placeholder="Search employee…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <select
            className="input py-1.5 text-[13px] min-w-[140px]"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as LeaveStatus | "");
              setPage(1);
            }}
          >
            {STATUS_OPTS.map((o) => (
              <option key={o.v} value={o.v}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            className="input py-1.5 text-[13px] w-24"
            value={year}
            onChange={(e) => {
              setYear(parseInt(e.target.value));
              setPage(1);
            }}
          >
            {YEAR_OPTS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <span className="text-[12px] text-ink-400 ml-auto">
            {total} record{total !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12.5px]">
            <thead>
              <tr className="bg-ink-50 dark:bg-ink-800/60 border-b border-ink-100 dark:border-ink-700 text-[10px] font-bold text-ink-400 uppercase tracking-wider">
                <th className="px-3 py-2.5 w-10 text-center">#</th>
                <th className="px-3 py-2.5">Employee</th>
                <th className="px-3 py-2.5">Leave Type</th>
                <th className="px-3 py-2.5">From</th>
                <th className="px-3 py-2.5">To</th>
                <th className="px-3 py-2.5 text-center">Days</th>
                <th className="px-3 py-2.5">Approval Stage</th>
                <th className="px-3 py-2.5 text-center">Status</th>
                <th className="px-3 py-2.5">Submitted</th>
                <th className="px-3 py-2.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="py-14 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" />
                  </td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-14 text-center">
                    <div className="flex flex-col items-center gap-2 text-ink-400">
                      <CalendarDays className="w-10 h-10 opacity-30" />
                      <p className="text-[13px]">No leave requests found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                requests.map((r, idx) => {
                  const inFlight =
                    r.status === "Pending" || r.status === "ChangesRequested";
                  return (
                    <tr
                      key={r.id}
                      className="hover:bg-ink-50/40 dark:hover:bg-ink-700/20 transition-colors"
                    >
                      <td className="px-3 py-2.5 text-center text-ink-400 font-mono text-[11px]">
                        {(page - 1) * 20 + idx + 1}
                      </td>

                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <LeaveAvatar name={r.employee_name} />
                          <div>
                            <div className="font-semibold text-ink-900 dark:text-white leading-tight">
                              {r.employee_name}
                            </div>
                            {r.department && (
                              <div className="text-[11px] text-ink-400">
                                {r.department}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-3 py-2.5">
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white"
                          style={{
                            backgroundColor: r.leave_type_color || "#6b7280",
                          }}
                        >
                          {r.leave_type_name}
                          {r.is_paid ? (
                            ""
                          ) : (
                            <span className="opacity-70">(Unpaid)</span>
                          )}
                        </span>
                      </td>

                      <td className="px-3 py-2.5 text-ink-700 dark:text-ink-300 whitespace-nowrap">
                        {fmt(r.start_date)}
                      </td>
                      <td className="px-3 py-2.5 text-ink-700 dark:text-ink-300 whitespace-nowrap">
                        {fmt(r.end_date)}
                      </td>

                      <td className="px-3 py-2.5 text-center font-bold tabular-nums text-ink-900 dark:text-white">
                        {prettyDays(r.days_requested)}
                      </td>

                      <td className="px-3 py-2.5">
                        <LeaveStagePill
                          status={r.status}
                          stageOrder={r.current_stage_order}
                          stageLabel={r.current_stage_label}
                          totalStages={r.total_stages}
                          isFinal={r.current_stage_is_final}
                        />
                        <div className="mt-0.5">
                          <LeaveStageAge
                            status={r.status}
                            hoursAtStage={r.hours_at_stage}
                            slaHours={r.current_stage_sla_hours}
                            isOverdue={r.is_overdue}
                          />
                        </div>
                      </td>

                      <td className="px-3 py-2.5 text-center">
                        <LeaveStatusBadge status={r.status} />
                      </td>

                      <td className="px-3 py-2.5 text-ink-500 text-[11px] whitespace-nowrap">
                        {fmt(r.created_at)}
                      </td>

                      <td className="px-3 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1 flex-wrap">
                          <button
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold bg-ink-50 hover:bg-ink-100 dark:bg-ink-700 text-ink-600 dark:text-ink-300 border border-ink-200 dark:border-ink-600 transition-colors"
                            onClick={() => setProgressId(r.id)}
                            title="Approval chain and decision history"
                          >
                            <Route className="w-3 h-3" /> Progress
                          </button>

                          {canDecide && r.status === "Pending" && (
                            <>
                              <button
                                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 transition-colors"
                                onClick={() =>
                                  setDeciding({
                                    request: r,
                                    decision: "approved",
                                  })
                                }
                                title={
                                  r.current_stage_is_final
                                    ? "Final stage — grants the leave"
                                    : "Approve this stage and pass it on"
                                }
                              >
                                <Check className="w-3 h-3" />
                                {r.current_stage_is_final
                                  ? "Grant"
                                  : "Approve"}
                              </button>
                              <button
                                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold bg-orange-50 hover:bg-orange-100 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-800 transition-colors"
                                onClick={() =>
                                  setDeciding({
                                    request: r,
                                    decision: "changes_requested",
                                  })
                                }
                              >
                                <MessageSquareWarning className="w-3 h-3" />
                                Changes
                              </button>
                              <button
                                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold bg-red-50 hover:bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 transition-colors"
                                onClick={() =>
                                  setDeciding({
                                    request: r,
                                    decision: "rejected",
                                  })
                                }
                              >
                                <X className="w-3 h-3" /> Reject
                              </button>
                            </>
                          )}

                          {canCancel &&
                            (inFlight || r.status === "Approved") && (
                              <button
                                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold bg-ink-50 hover:bg-ink-100 dark:bg-ink-700 text-ink-500 dark:text-ink-400 border border-ink-200 dark:border-ink-600 transition-colors"
                                onClick={() => setCancelling(r)}
                              >
                                Cancel
                              </button>
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

        {/* Pagination */}
        {lastPage > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-ink-100 dark:border-ink-700">
            <span className="text-[12px] text-ink-400">
              Page {page} of {lastPage}
            </span>
            <div className="flex items-center gap-1">
              <button
                className="icon-btn"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                className="icon-btn"
                onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
                disabled={page === lastPage}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {newOpen && (
        <NewLeaveModal
          onClose={() => setNewOpen(false)}
          onDone={() => {
            setNewOpen(false);
            invalidate();
          }}
        />
      )}
      {deciding && (
        <LeaveDecisionConfirm
          request={deciding.request}
          decision={deciding.decision}
          onClose={() => setDeciding(null)}
          onDone={() => {
            setDeciding(null);
            invalidate();
          }}
        />
      )}
      {progressId !== null && (
        <LeaveProgressModal
          requestId={progressId}
          scope="review"
          onClose={() => setProgressId(null)}
        />
      )}
      {chainOpen && <LeaveChainEditorModal onClose={() => setChainOpen(false)} />}
      {cancelling && (
        <CancelModal
          request={cancelling}
          onClose={() => setCancelling(null)}
          onDone={() => {
            setCancelling(null);
            invalidate();
          }}
        />
      )}
    </div>
  );
}

/* ── Stat Card ── */
function StatCard({
  icon: Icon,
  color,
  label,
  value,
}: {
  icon: typeof Clock;
  color: string;
  label: string;
  value: number;
}) {
  const colors: Record<string, string> = {
    amber: "text-amber-600  dark:text-amber-400",
    orange: "text-orange-600 dark:text-orange-400",
    emerald: "text-emerald-600 dark:text-emerald-400",
    blue: "text-blue-600   dark:text-blue-400",
    red: "text-red-600     dark:text-red-400",
    ink: "text-ink-500    dark:text-ink-400",
  };
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${colors[color]}`} />
        <p className="text-[11px] font-bold text-ink-400 uppercase tracking-wider">
          {label}
        </p>
      </div>
      <p className={`text-[24px] font-bold tabular-nums ${colors[color]}`}>
        {value}
      </p>
    </div>
  );
}

/* ── Avatar ── */
function LeaveAvatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0] ?? "")
    .join("")
    .toUpperCase();
  return (
    <div className="w-8 h-8 rounded-full bg-brand/10 text-brand text-[11px] font-bold flex items-center justify-center shrink-0">
      {initials}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   NEW LEAVE REQUEST MODAL
   ══════════════════════════════════════════════════════════════════════ */
function NewLeaveModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const { data: empRes } = useQuery({
    queryKey: ["hr-employees-all"],
    queryFn: ({ signal }) =>
      hrService.listEmployees({ per_page: 200, status: "Active" }, signal),
  });
  const employees = empRes?.data?.data ?? [];

  const { data: typesRes } = useQuery({
    queryKey: ["leave-types"],
    queryFn: ({ signal }) => hrService.leaveTypes(signal),
  });
  const types = (typesRes?.data ?? []) as LeaveType[];

  const [empId, setEmpId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [empQ, setEmpQ] = useState("");
  // Filing leave for someone else starts an approval chain in their name, so it
  // is confirmed rather than submitted straight off the form.
  const [confirming, setConfirming] = useState(false);

  const filteredEmps = empQ.trim()
    ? employees.filter(
        (e: any) =>
          `${e.employee_fname} ${e.employee_lname}`
            .toLowerCase()
            .includes(empQ.toLowerCase()) ||
          (e.emp_code ?? "").toLowerCase().includes(empQ.toLowerCase()),
      )
    : employees;

  const submit = useMutation({
    mutationFn: () =>
      hrService.submitLeaveRequest({
        employee_id: parseInt(empId),
        leave_type_id: parseInt(typeId),
        start_date: start,
        end_date: end,
        reason,
      }),
    onSuccess: (res) => {
      toast.success(res?.message ?? "Leave request submitted.");
      onDone();
    },
    onError: (e: any) => {
      setConfirming(false);
      toast.error(e?.response?.data?.message ?? "Submission failed");
    },
  });

  const canSubmit = empId && typeId && start && end;
  // The list is typed loosely elsewhere in this modal — the HR employees
  // endpoint returns the legacy employee_* column names.
  const chosenEmp = (filteredEmps as any[]).find(
    (e) => String(e.employee_id) === empId,
  );
  const chosenType = types.find((t) => String(t.id) === typeId);

  return (
    <ModalShell title="New Leave Request" onClose={onClose}>
      <div className="space-y-3">
        {/* Employee */}
        <div>
          <label className="form-label">Employee</label>
          <input
            className="input text-[13px] mb-1"
            placeholder="Search employee…"
            value={empQ}
            onChange={(e) => setEmpQ(e.target.value)}
          />
          <select
            className="input text-[13px]"
            value={empId}
            onChange={(e) => setEmpId(e.target.value)}
          >
            <option value="">— Select employee —</option>
            {filteredEmps.map((e: any) => (
              <option key={e.employee_id} value={e.employee_id}>
                {e.employee_fname} {e.employee_lname} ({e.emp_code})
              </option>
            ))}
          </select>
        </div>

        {/* Leave Type */}
        <div>
          <label className="form-label">Leave Type</label>
          <select
            className="input text-[13px]"
            value={typeId}
            onChange={(e) => setTypeId(e.target.value)}
          >
            <option value="">— Select type —</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.days_allowed} days
                {t.is_paid ? ", paid" : ", unpaid"})
              </option>
            ))}
          </select>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="form-label">Start Date</label>
            <input
              type="date"
              className="input text-[13px]"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div>
            <label className="form-label">End Date</label>
            <input
              type="date"
              className="input text-[13px]"
              value={end}
              min={start}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
        </div>

        {/* Reason */}
        <div>
          <label className="form-label">
            Reason <span className="text-ink-400 font-normal">(optional)</span>
          </label>
          <textarea
            className="input text-[13px] resize-none"
            rows={3}
            placeholder="Brief reason for leave…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </div>

      <div className="flex gap-2 pt-4 border-t border-ink-100 dark:border-ink-700 mt-4">
        <button className="btn-secondary flex-1" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn-primary flex-1 flex items-center justify-center gap-1.5"
          disabled={!canSubmit || submit.isPending}
          onClick={() => setConfirming(true)}
        >
          {submit.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Submit Request
        </button>
      </div>

      {confirming && (
        <ConfirmDialog
          open
          variant="primary"
          onClose={() => setConfirming(false)}
          onConfirm={() => submit.mutate()}
          loading={submit.isPending}
          title="File this request?"
          confirmLabel="Yes, submit"
          cancelLabel="Keep editing"
          message={
            <>
              This files a{" "}
              <strong>{chosenType?.name ?? "leave"}</strong> request on behalf of{" "}
              <strong>
                {chosenEmp
                  ? `${chosenEmp.employee_fname} ${chosenEmp.employee_lname}`
                  : "the selected employee"}
              </strong>
              , from {start} to {end}.
            </>
          }
          details={
            <p className="text-[12px] text-ink-500 dark:text-ink-400 rounded-lg bg-ink-50 dark:bg-ink-900/30 px-3 py-2">
              It enters the approval chain at the first stage immediately, and
              the employee is notified.
            </p>
          }
        />
      )}
    </ModalShell>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   CANCEL MODAL
   ══════════════════════════════════════════════════════════════════════ */
function CancelModal({
  request,
  onClose,
  onDone,
}: {
  request: LeaveRequest;
  onClose: () => void;
  onDone: () => void;
}) {
  const cancel = useMutation({
    mutationFn: () => hrService.cancelLeave(request.id),
    onSuccess: () => {
      toast.success("Leave request cancelled.");
      onDone();
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? "Cancel failed"),
  });

  return (
    <ModalShell title="Cancel Leave Request" onClose={onClose} size="sm">
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400" />
        </div>
        <p className="text-[13px] text-ink-600 dark:text-ink-300">
          Cancel the{" "}
          <span className="font-semibold text-ink-900 dark:text-white">
            {request.leave_type_name}
          </span>{" "}
          request for{" "}
          <span className="font-semibold text-ink-900 dark:text-white">
            {request.employee_name}
          </span>
          ?
          {request.status === "Approved" && (
            <span className="block mt-1 text-amber-600 dark:text-amber-400 text-[12px]">
              This will also reverse the leave balance deduction.
            </span>
          )}
        </p>
      </div>
      <div className="flex gap-2 pt-4 border-t border-ink-100 dark:border-ink-700 mt-2">
        <button className="btn-secondary flex-1" onClick={onClose}>
          Keep It
        </button>
        <button
          className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-semibold text-[13px] rounded-lg px-4 py-2 transition-colors flex items-center justify-center gap-1.5"
          onClick={() => cancel.mutate()}
          disabled={cancel.isPending}
        >
          {cancel.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Yes, Cancel
        </button>
      </div>
    </ModalShell>
  );
}

/* ── Shared modal shell ── */
function ModalShell({
  title,
  onClose,
  children,
  size = "md",
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  size?: "sm" | "md";
}) {
  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 backdrop-blur-sm p-4">
      <div
        className={`bg-white dark:bg-ink-800 rounded-xl shadow-2xl w-full ${size === "sm" ? "max-w-sm" : "max-w-lg"}`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100 dark:border-ink-700">
          <h3 className="font-bold text-[15px] text-ink-900 dark:text-white">
            {title}
          </h3>
          <button className="icon-btn" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
    </ModalPortal>
  );
}
