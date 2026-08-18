import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  CalendarDays,
  Loader2,
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
  ClipboardList,
  AlertTriangle,
  MessageSquareWarning,
  RefreshCw,
  Route,
  X,
} from "lucide-react";
import {
  hrService,
  type MyLeaveRequest,
  type LeaveStatus,
  type LeaveType,
} from "@/services/hrService";
import ModalPortal from "@/components/ui/ModalPortal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import LeaveStatusBadge from "@/components/hr/leave/LeaveStatusBadge";
import LeaveStagePill from "@/components/hr/leave/LeaveStagePill";
import LeaveProgressModal from "@/components/hr/leave/LeaveProgressModal";
import LeaveMiniProgress from "@/components/hr/leave/LeaveMiniProgress";
import LeaveStageAge from "@/components/hr/leave/LeaveStageAge";
import { fmtDate as fmt, prettyDays } from "@/components/hr/leave/leaveStatus";

/* ══════════════════════════════════════════════════════════════════════
   MY LEAVE — staff self-service
   ══════════════════════════════════════════════════════════════════════ */
export default function MyLeavePage() {
  const qc = useQueryClient();
  const [newOpen, setNewOpen] = useState(false);
  const [cancelling, setCancelling] = useState<MyLeaveRequest | null>(null);
  const [resubmitting, setResubmitting] = useState<MyLeaveRequest | null>(null);
  const [progressId, setProgressId] = useState<number | null>(null);

  const { data: res, isLoading, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["my-leave-requests"],
    queryFn: ({ signal }) => hrService.myLeaveRequests(signal),
    // A reviewer can decide at any moment; poll so the page reflects that
    // without the requester having to know to reload.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const requests = (res?.data ?? []) as MyLeaveRequest[];

  const counts = useMemo(() => {
    const c = {
      Pending: 0,
      ChangesRequested: 0,
      Approved: 0,
      Rejected: 0,
      Cancelled: 0,
    } as Record<LeaveStatus, number>;
    requests.forEach((r) => {
      c[r.status] = (c[r.status] ?? 0) + 1;
    });
    return c;
  }, [requests]);

  /** Requests the reviewer has handed back — the requester's to-do list. */
  const needsAction = useMemo(
    () => requests.filter((r) => r.status === "ChangesRequested"),
    [requests],
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["my-leave-requests"] });
    qc.invalidateQueries({ queryKey: ["leave-progress"] });
    // A decision or resubmission changes what is unread in the bell too.
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-ink-900 dark:text-white flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-brand" /> My Leave
          </h2>
          <p className="text-[13px] text-ink-500">
            Request leave and track your applications
          </p>
        </div>
        <button
          className="btn-primary flex items-center gap-1.5 text-[13px]"
          onClick={() => setNewOpen(true)}
        >
          <Plus className="w-4 h-4" /> Request Leave
        </button>
      </div>

      {/* Anything sent back needs the requester to act — say so at the top of
          the page rather than leaving it to be spotted in a table row. */}
      {needsAction.length > 0 && (
        <div className="rounded-xl border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-500/10 px-4 py-3 flex items-start gap-3">
          <MessageSquareWarning className="w-5 h-5 text-orange-600 dark:text-orange-400 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold text-orange-800 dark:text-orange-300">
              {needsAction.length === 1
                ? "A reviewer asked for changes on your leave request"
                : `${needsAction.length} of your leave requests need changes`}
            </p>
            <p className="text-[12px] text-orange-700 dark:text-orange-400 mt-0.5">
              {needsAction[0].review_comment
                ? `“${needsAction[0].review_comment}”`
                : "Open the request, make the change and resubmit it — it goes straight back to the same reviewer."}
            </p>
          </div>
          <button
            className="shrink-0 bg-orange-500 hover:bg-orange-600 text-white font-semibold text-[12px] rounded-lg px-3 py-1.5 transition-colors flex items-center gap-1.5"
            onClick={() => setResubmitting(needsAction[0])}
          >
            <RefreshCw className="w-3.5 h-3.5" /> Fix &amp; Resubmit
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard
          icon={Clock}
          color="amber"
          label="In Review"
          value={counts.Pending}
        />
        <StatCard
          icon={MessageSquareWarning}
          color="orange"
          label="Needs Your Action"
          value={counts.ChangesRequested}
        />
        <StatCard
          icon={CheckCircle2}
          color="emerald"
          label="Approved"
          value={counts.Approved}
        />
        <StatCard
          icon={XCircle}
          color="red"
          label="Rejected"
          value={counts.Rejected}
        />
        <StatCard
          icon={ClipboardList}
          color="ink"
          label="Total"
          value={requests.length}
        />
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-ink-100 dark:border-ink-700">
          <h3 className="text-[13px] font-bold text-ink-700 dark:text-ink-200">
            My Requests
          </h3>
          <span className="text-[12px] text-ink-400 flex items-center gap-1.5">
            {isFetching && <Loader2 className="w-3 h-3 animate-spin" />}
            {requests.length} record{requests.length !== 1 ? "s" : ""}
            {dataUpdatedAt > 0 && (
              <span className="text-ink-300 hidden sm:inline">
                · updated{" "}
                {new Date(dataUpdatedAt).toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12.5px]">
            <thead>
              <tr className="bg-ink-50 dark:bg-ink-800/60 border-b border-ink-100 dark:border-ink-700 text-[10px] font-bold text-ink-400 uppercase tracking-wider">
                <th className="px-3 py-2.5 w-10 text-center">#</th>
                <th className="px-3 py-2.5">Leave Type</th>
                <th className="px-3 py-2.5">From</th>
                <th className="px-3 py-2.5">To</th>
                <th className="px-3 py-2.5 text-center">Days</th>
                <th className="px-3 py-2.5">Reason</th>
                <th className="px-3 py-2.5">Waiting On</th>
                <th className="px-3 py-2.5">Progress</th>
                <th className="px-3 py-2.5 text-center">Status</th>
                <th className="px-3 py-2.5">Submitted</th>
                <th className="px-3 py-2.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
              {isLoading ? (
                <tr>
                  <td colSpan={11} className="py-14 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" />
                  </td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-14 text-center">
                    <div className="flex flex-col items-center gap-2 text-ink-400">
                      <CalendarDays className="w-10 h-10 opacity-30" />
                      <p className="text-[13px]">
                        You haven't requested any leave yet
                      </p>
                      <button
                        className="btn-secondary text-[12px] mt-1"
                        onClick={() => setNewOpen(true)}
                      >
                        Request your first leave
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                requests.map((r, idx) => {
                  return (
                    <tr
                      key={r.id}
                      className="hover:bg-ink-50/40 dark:hover:bg-ink-700/20 transition-colors align-top"
                    >
                      <td className="px-3 py-2.5 text-center text-ink-400 font-mono text-[11px]">
                        {idx + 1}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white"
                          style={{
                            backgroundColor: r.leave_type_color || "#6b7280",
                          }}
                        >
                          {r.leave_type_name}
                          {!r.is_paid && <span className="opacity-70">(Unpaid)</span>}
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
                      <td className="px-3 py-2.5 text-ink-500 max-w-[220px]">
                        <div className="truncate" title={r.reason ?? ""}>
                          {r.reason || <span className="text-ink-300">—</span>}
                        </div>
                        {r.review_comment && (
                          <div
                            className={`text-[11px] mt-0.5 truncate ${
                              r.status === "ChangesRequested"
                                ? "text-orange-600 dark:text-orange-400 font-semibold"
                                : "text-ink-400"
                            }`}
                            title={r.review_comment}
                          >
                            Reviewer: {r.review_comment}
                          </div>
                        )}
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

                      <td className="px-3 py-2.5">
                        <button
                          className="block w-full text-left"
                          onClick={() => setProgressId(r.id)}
                          title="See the full approval chain"
                        >
                          <LeaveMiniProgress
                            status={r.status}
                            stageOrder={r.current_stage_order}
                            totalStages={r.total_stages}
                          />
                        </button>
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
                          >
                            <Route className="w-3 h-3" /> Progress
                          </button>
                          {r.status === "ChangesRequested" && (
                            <button
                              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold bg-orange-50 hover:bg-orange-100 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-800 transition-colors"
                              onClick={() => setResubmitting(r)}
                            >
                              <RefreshCw className="w-3 h-3" /> Fix &amp;
                              Resubmit
                            </button>
                          )}
                          {(r.status === "Pending" ||
                            r.status === "ChangesRequested") && (
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
      </div>

      {newOpen && (
        <NewLeaveModal
          onClose={() => setNewOpen(false)}
          onDone={() => {
            setNewOpen(false);
            invalidate();
          }}
        />
      )}
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
      {resubmitting && (
        <ResubmitModal
          request={resubmitting}
          onClose={() => setResubmitting(null)}
          onDone={() => {
            setResubmitting(null);
            invalidate();
          }}
        />
      )}
      {progressId !== null && (
        <LeaveProgressModal
          requestId={progressId}
          scope="own"
          onClose={() => setProgressId(null)}
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

/* ══════════════════════════════════════════════════════════════════════
   NEW LEAVE REQUEST MODAL (self)
   ══════════════════════════════════════════════════════════════════════ */
function NewLeaveModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const { data: typesRes } = useQuery({
    queryKey: ["leave-types"],
    queryFn: ({ signal }) => hrService.leaveTypes(signal),
  });
  const types = (typesRes?.data ?? []) as LeaveType[];

  const [typeId, setTypeId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const chosenType = types.find((t) => String(t.id) === typeId);

  const submit = useMutation({
    mutationFn: () =>
      hrService.submitMyLeaveRequest({
        leave_type_id: parseInt(typeId),
        start_date: start,
        end_date: end,
        reason,
      }),
    onSuccess: () => {
      toast.success("Leave request submitted.");
      onDone();
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? "Submission failed"),
  });

  const canSubmit = typeId && start && end;

  return (
    <ModalShell title="Request Leave" onClose={onClose}>
      <div className="space-y-3">
        {/* Leave Type */}
        <div>
          <label className="form-label">
            Leave Type <span className="text-red-500">*</span>
          </label>
          <select
            className="input text-[13px]"
            value={typeId}
            onChange={(e) => setTypeId(e.target.value)}
          >
            <option value="">— Select type —</option>
            {types
              .filter((t) => t.is_active)
              .map((t) => (
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
            <label className="form-label">
              Start Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              className="input text-[13px]"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div>
            <label className="form-label">
              End Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              className="input text-[13px]"
              value={end}
              min={start || undefined}
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
            placeholder="Brief reason for your leave…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        <p className="text-[11px] text-ink-400">
          Only Mon–Fri working days are counted. You'll be emailed once your
          request is reviewed.
        </p>
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
          title="Submit this leave request?"
          confirmLabel="Yes, submit"
          cancelLabel="Keep editing"
          message={
            <>
              Requesting <strong>{chosenType?.name ?? "leave"}</strong> from{" "}
              {start} to {end}.
            </>
          }
          details={
            <p className="text-[12px] text-ink-500 dark:text-ink-400 rounded-lg bg-ink-50 dark:bg-ink-900/30 px-3 py-2">
              Only Mon–Fri days count. Once submitted it enters the approval
              chain — you can cancel it while it is still under review, but you
              cannot edit it unless a reviewer asks for changes.
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
  request: MyLeaveRequest;
  onClose: () => void;
  onDone: () => void;
}) {
  const cancel = useMutation({
    mutationFn: () => hrService.cancelMyLeaveRequest(request.id),
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
          Cancel your{" "}
          <span className="font-semibold text-ink-900 dark:text-white">
            {request.leave_type_name}
          </span>{" "}
          request for{" "}
          <span className="font-semibold text-ink-900 dark:text-white">
            {fmt(request.start_date)} → {fmt(request.end_date)}
          </span>
          ?
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

/* ══════════════════════════════════════════════════════════════════════
   RESUBMIT MODAL — answering a reviewer's "changes requested"
   ══════════════════════════════════════════════════════════════════════ */
function ResubmitModal({
  request,
  onClose,
  onDone,
}: {
  request: MyLeaveRequest;
  onClose: () => void;
  onDone: () => void;
}) {
  const [start, setStart] = useState(request.start_date);
  const [end, setEnd] = useState(request.end_date);
  const [reason, setReason] = useState(request.reason ?? "");
  const [confirming, setConfirming] = useState(false);

  const submit = useMutation({
    mutationFn: () =>
      hrService.resubmitMyLeaveRequest(request.id, {
        start_date: start,
        end_date: end,
        reason,
      }),
    onSuccess: (res) => {
      toast.success(res?.message ?? "Leave request resubmitted.");
      onDone();
    },
    onError: (e: any) => {
      setConfirming(false);
      toast.error(e?.response?.data?.message ?? "Resubmission failed");
    },
  });

  return (
    <ModalShell title="Fix and Resubmit" onClose={onClose}>
      <div className="space-y-3">
        {request.review_comment && (
          <div className="rounded-lg bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-800 px-3 py-2">
            <p className="text-[10px] font-bold text-orange-700 dark:text-orange-400 uppercase tracking-wider mb-0.5">
              What the reviewer asked for
            </p>
            <p className="text-[12px] text-orange-800 dark:text-orange-300 italic">
              “{request.review_comment}”
            </p>
          </div>
        )}

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
              min={start || undefined}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="form-label">Reason</label>
          <textarea
            className="input text-[13px] resize-none"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        <p className="text-[11px] text-ink-400">
          Resubmitting returns the request to{" "}
          <strong>{request.current_stage_label ?? "the same reviewer"}</strong> —
          the stage that asked for changes — rather than restarting the chain.
        </p>
      </div>

      <div className="flex gap-2 pt-4 border-t border-ink-100 dark:border-ink-700 mt-4">
        <button className="btn-secondary flex-1" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn-primary flex-1 flex items-center justify-center gap-1.5"
          disabled={!start || !end || submit.isPending}
          onClick={() => setConfirming(true)}
        >
          {submit.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          Resubmit
        </button>
      </div>

      {confirming && (
        <ConfirmDialog
          open
          variant="primary"
          onClose={() => setConfirming(false)}
          onConfirm={() => submit.mutate()}
          loading={submit.isPending}
          title="Send this back for review?"
          confirmLabel="Yes, resubmit"
          cancelLabel="Keep editing"
          message={
            <>
              Your {request.leave_type_name} request will go back under review
              for {fmt(start)} → {fmt(end)}.
            </>
          }
          details={
            <p className="text-[12px] text-ink-500 dark:text-ink-400 rounded-lg bg-ink-50 dark:bg-ink-900/30 px-3 py-2">
              It returns to{" "}
              <strong>
                {request.current_stage_label ?? "the same reviewer"}
              </strong>{" "}
              — the stage that asked for changes — not to the start of the chain.
            </p>
          }
        />
      )}
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
