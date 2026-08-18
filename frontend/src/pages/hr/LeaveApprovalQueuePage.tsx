import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ClipboardCheck,
  Layers,
  Loader2,
  MessageSquareWarning,
  Route,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import {
  hrService,
  type LeaveDecision,
  type LeaveRequest,
} from "@/services/hrService";
import LeaveProgressModal from "@/components/hr/leave/LeaveProgressModal";
import LeaveDecisionConfirm from "@/components/hr/leave/LeaveDecisionConfirm";
import LeaveStageAge from "@/components/hr/leave/LeaveStageAge";
import { fmtDate } from "@/components/hr/leave/leaveStatus";

/**
 * My Leave Approvals — the reviewer's inbox.
 *
 * The queue is derived server-side from the approval chain: a request only
 * appears here while it is parked at a stage whose required permission this
 * user holds. Approving a non-final stage hands the request to the next
 * reviewer rather than granting the leave.
 *
 * Same shape as ServiceRequestApprovalQueuePage — the two flows deliberately
 * behave the same way.
 */
export default function LeaveApprovalQueuePage() {
  const qc = useQueryClient();
  // Every decision — approve included — goes through the confirmation step.
  // A signature is not retractable, so nothing here is a one-click action.
  const [pending, setPending] = useState<{
    row: LeaveRequest;
    decision: LeaveDecision;
  } | null>(null);
  const [progressId, setProgressId] = useState<number | null>(null);

  const { data, isLoading, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["leave-approval-queue"],
    queryFn: ({ signal }) => hrService.leaveApprovalQueue(signal),
    // Requests arrive from other people's actions, so a reviewer sitting on
    // this page should see them appear without reloading.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const queue = (data?.data ?? []) as LeaveRequest[];
  // The server already orders breaches first; count them for the header.
  const overdue = queue.filter((r) => !!r.is_overdue).length;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["leave-approval-queue"] });
    qc.invalidateQueries({ queryKey: ["leave-requests"] });
    qc.invalidateQueries({ queryKey: ["leave-stats"] });
    qc.invalidateQueries({ queryKey: ["leave-progress"] });
    // Deciding retires this request's "needs your decision" badge server-side.
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap mt-2">
        <div>
          <h2 className="text-lg font-bold text-ink-900 dark:text-white flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-brand" /> Leave Approvals
          </h2>
          <p className="text-[13px] text-ink-500">
            Requests waiting at a stage you are authorised to decide
          </p>
        </div>
        <div className="flex items-center gap-2">
          {overdue > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-bold bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300">
              <AlertTriangle className="w-3.5 h-3.5" />
              {overdue} past SLA
            </span>
          )}
          <span className="chip-soft text-[12px] flex items-center gap-1.5">
            {isFetching && <Loader2 className="w-3 h-3 animate-spin" />}
            {queue.length} awaiting you
            {dataUpdatedAt > 0 && (
              <span className="text-ink-400 hidden sm:inline">
                ·{" "}
                {new Date(dataUpdatedAt).toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Queue */}
      {isLoading ? (
        <div className="card py-16 text-center">
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" />
        </div>
      ) : queue.length === 0 ? (
        <div className="card py-16 text-center">
          <div className="flex flex-col items-center gap-2 text-ink-400">
            <ClipboardCheck className="w-10 h-10 opacity-30" />
            <p className="text-[13px]">Nothing is waiting on your decision</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {queue.map((r) => (
            <div
              key={r.id}
              className={`card p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                r.is_overdue
                  ? "border-l-4 border-l-red-500 dark:border-l-red-500"
                  : ""
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white"
                    style={{ backgroundColor: r.leave_type_color || "#6b7280" }}
                  >
                    {r.leave_type_name}
                    {!r.is_paid && <span className="opacity-70">(Unpaid)</span>}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                    <Layers className="w-3 h-3" />
                    {r.current_stage_label ?? "Leave Approval"} · stage{" "}
                    {r.current_stage_order} of{" "}
                    {Math.max(r.total_stages, r.current_stage_order)}
                  </span>
                  <LeaveStageAge
                    status={r.status}
                    hoursAtStage={r.hours_at_stage}
                    slaHours={r.current_stage_sla_hours}
                    isOverdue={r.is_overdue}
                  />
                  {!!r.current_stage_is_final && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-primary-100 text-primary-700 dark:bg-primary-500/20 dark:text-primary-300">
                      Final stage — grants the leave
                    </span>
                  )}
                </div>

                <p className="font-bold text-[14px] text-ink-900 dark:text-white mt-1.5">
                  {r.employee_name}
                  {r.department && (
                    <span className="font-normal text-ink-400">
                      {" "}
                      · {r.department}
                    </span>
                  )}
                </p>
                <p className="text-[12px] text-ink-500 mt-0.5">
                  {fmtDate(r.start_date)} → {fmtDate(r.end_date)} ·{" "}
                  <strong className="tabular-nums">{r.days_requested}</strong>{" "}
                  working day{Number(r.days_requested) === 1 ? "" : "s"} ·
                  submitted {fmtDate(r.created_at)}
                </p>
                {r.reason && (
                  <p className="text-[12px] text-ink-500 mt-1 italic line-clamp-2">
                    “{r.reason}”
                  </p>
                )}
                {r.review_comment && (
                  <p className="text-[11px] text-ink-400 mt-1">
                    Earlier note: {r.review_comment}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <button
                  className="btn-ghost text-[12px] flex items-center gap-1.5"
                  onClick={() => setProgressId(r.id)}
                >
                  <Route className="w-3.5 h-3.5" /> Progress
                </button>
                <button
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[12px] rounded-lg px-3 py-2 transition-colors flex items-center gap-1.5"
                  onClick={() => setPending({ row: r, decision: "approved" })}
                >
                  <Check className="w-3.5 h-3.5" />
                  {r.current_stage_is_final ? "Grant Leave" : "Approve Stage"}
                </button>
                <button
                  className="bg-orange-500 hover:bg-orange-600 text-white font-semibold text-[12px] rounded-lg px-3 py-2 transition-colors flex items-center gap-1.5"
                  onClick={() =>
                    setPending({ row: r, decision: "changes_requested" })
                  }
                >
                  <MessageSquareWarning className="w-3.5 h-3.5" /> Request
                  Changes
                </button>
                <button
                  className="bg-red-600 hover:bg-red-700 text-white font-semibold text-[12px] rounded-lg px-3 py-2 transition-colors flex items-center gap-1.5"
                  onClick={() => setPending({ row: r, decision: "rejected" })}
                >
                  <XCircle className="w-3.5 h-3.5" /> Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* One confirmation step for every decision. */}
      {pending && (
        <LeaveDecisionConfirm
          request={pending.row}
          decision={pending.decision}
          onClose={() => setPending(null)}
          onDone={() => {
            setPending(null);
            refresh();
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
    </div>
  );
}
