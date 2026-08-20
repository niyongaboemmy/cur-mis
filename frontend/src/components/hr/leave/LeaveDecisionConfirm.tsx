import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  ArrowRight,
  Check,
  CornerUpLeft,
  Flag,
  Loader2,
  Undo2,
  Users,
  X,
  XCircle,
} from "lucide-react";
import {
  hrService,
  type LeaveDecision,
  type LeaveRequest,
} from "@/services/hrService";
import ModalPortal from "@/components/ui/ModalPortal";
import { fmtDate, prettyDays } from "./leaveStatus";

/**
 * The confirmation step for every stage decision — approve, request changes,
 * reject — shared by the reviewer queue and the HR register.
 *
 * A signature cannot be taken back: the audit trail is append-only, and a final
 * approval debits the balance and emails the requester. So nothing here is a
 * one-click action.
 *
 * The design leads with what the click *does to the workflow*: a from → to strip
 * showing the stage being signed and where the request lands next. The same
 * green button either passes a request along or grants the leave outright
 * depending on the stage, and that difference has to be impossible to miss.
 */

type Theme = {
  /** Header band + confirm button. */
  accent: string;
  band: string;
  ring: string;
  icon: typeof Check;
  title: (isFinal: boolean) => string;
  confirm: (isFinal: boolean) => string;
  commentRequired: boolean;
  commentLabel: string;
  placeholder: string;
};

const THEMES: Record<LeaveDecision, Theme> = {
  approved: {
    accent: "bg-emerald-600 hover:bg-emerald-700 focus-visible:ring-emerald-500",
    band: "from-emerald-500 to-emerald-600",
    ring: "ring-emerald-500/20",
    icon: Check,
    title: (f) => (f ? "Grant this leave?" : "Approve this stage?"),
    confirm: (f) => (f ? "Yes, grant leave" : "Yes, approve"),
    commentRequired: false,
    commentLabel: "Comment",
    placeholder: "Optional note, kept on the audit trail…",
  },
  changes_requested: {
    accent: "bg-amber-500 hover:bg-amber-600 focus-visible:ring-amber-400",
    band: "from-amber-400 to-amber-500",
    ring: "ring-amber-400/20",
    icon: Undo2,
    title: () => "Send this back for changes?",
    confirm: () => "Yes, request changes",
    commentRequired: true,
    commentLabel: "What needs to change",
    placeholder: "The requester sees this — say what to fix…",
  },
  rejected: {
    accent: "bg-red-600 hover:bg-red-700 focus-visible:ring-red-500",
    band: "from-red-500 to-red-600",
    ring: "ring-red-500/20",
    icon: XCircle,
    title: () => "Reject this request?",
    confirm: () => "Yes, reject",
    commentRequired: true,
    commentLabel: "Reason for rejection",
    placeholder: "Recorded on the audit trail and emailed to the requester…",
  },
};

/** Initials avatar, matching the register's row treatment. */
function Avatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0] ?? "")
    .join("")
    .toUpperCase();
  return (
    <span className="w-9 h-9 rounded-full bg-brand/10 text-brand text-[12px] font-bold flex items-center justify-center shrink-0">
      {initials}
    </span>
  );
}

export default function LeaveDecisionConfirm({
  request,
  decision,
  onClose,
  onDone,
}: {
  request: LeaveRequest;
  decision: LeaveDecision;
  onClose: () => void;
  onDone: () => void;
}) {
  const [comment, setComment] = useState("");
  const theme = THEMES[decision];
  const isFinal = !!request.current_stage_is_final;
  const stages = Math.max(request.total_stages, request.current_stage_order);
  const days = prettyDays(request.days_requested);
  const Icon = theme.icon;

  const submit = useMutation({
    mutationFn: () => hrService.decideLeave(request.id, decision, comment),
    onSuccess: (res) => {
      toast.success(res?.message ?? "Decision recorded.");
      onDone();
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? "Could not record decision"),
  });

  const blocked = theme.commentRequired && !comment.trim();
  const canSend = !blocked && !submit.isPending;

  // Escape backs out; Cmd/Ctrl+Enter commits — a reviewer clearing a queue
  // should not have to reach for the mouse for every request.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submit.isPending) onClose();
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canSend) {
        submit.mutate();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSend, submit.isPending]);

  /**
   * Where the request goes if this decision is taken — named, not merely
   * "the next office". A reviewer handing work on should see whose desk it lands
   * on and which role signs there.
   */
  const destination =
    decision === "approved"
      ? isFinal
        ? {
            label: "Leave granted",
            role: null,
            tone: "text-emerald-700 dark:text-emerald-300",
            icon: Flag,
          }
        : {
            label: request.next_stage_label ?? "Next stage",
            role: request.next_stage_roles,
            tone: "text-ink-800 dark:text-ink-100",
            icon: ArrowRight,
          }
      : decision === "changes_requested"
        ? {
            label: "Back to requester",
            role: request.employee_name,
            tone: "text-amber-700 dark:text-amber-300",
            icon: CornerUpLeft,
          }
        : {
            label: "Request closed",
            role: null,
            tone: "text-red-700 dark:text-red-300",
            icon: XCircle,
          };
  const DestIcon = destination.icon;

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-900/60 backdrop-blur-sm p-0 sm:p-4"
        onClick={() => !submit.isPending && onClose()}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={theme.title(isFinal)}
          onClick={(e) => e.stopPropagation()}
          className="bg-white dark:bg-ink-800 w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden animate-fade-in max-h-[92vh] flex flex-col"
        >
          {/* ── Accent band: the decision, in one glance ── */}
          <div
            className={`bg-gradient-to-r ${theme.band} px-5 py-3.5 flex items-center justify-between gap-3`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-white" />
              </span>
              <h3 className="text-white font-bold text-[15px] leading-tight">
                {theme.title(isFinal)}
              </h3>
            </div>
            <button
              onClick={onClose}
              disabled={submit.isPending}
              aria-label="Close"
              className="text-white/80 hover:text-white p-1 rounded-md hover:bg-white/15 transition-colors disabled:opacity-40 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-5 py-4 space-y-4 overflow-y-auto">
            {/* ── Who and what ── */}
            <div className="flex items-start gap-3">
              <Avatar name={request.employee_name} />
              <div className="min-w-0">
                <p className="font-bold text-[14px] text-ink-900 dark:text-white leading-tight">
                  {request.employee_name}
                </p>
                <div className="flex items-center gap-1.5 flex-wrap mt-1">
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold text-white"
                    style={{
                      backgroundColor: request.leave_type_color || "#6b7280",
                    }}
                  >
                    {request.leave_type_name}
                  </span>
                  <span className="text-[12px] text-ink-500 dark:text-ink-400">
                    {fmtDate(request.start_date)} → {fmtDate(request.end_date)}
                  </span>
                  <span className="chip-soft text-[10px]">
                    {days} working day{days === "1" ? "" : "s"}
                  </span>
                </div>
              </div>
            </div>

            {/* ── What this does to the workflow ── */}
            <div className="rounded-xl border border-ink-100 dark:border-ink-700 overflow-hidden">
              <div className="flex items-stretch">
                <div className="flex-1 px-3 py-2.5 min-w-0">
                  <p className="text-[9.5px] font-bold text-ink-400 uppercase tracking-wider">
                    Signing now
                  </p>
                  <p className="text-[12.5px] font-bold text-ink-900 dark:text-white leading-tight mt-0.5 truncate">
                    {request.current_stage_label ?? "Leave Approval"}
                  </p>
                  {request.current_stage_roles && (
                    <p className="text-[10px] text-ink-500 dark:text-ink-400 mt-0.5 truncate flex items-center gap-1">
                      <Users className="w-2.5 h-2.5 shrink-0" />
                      {request.current_stage_roles}
                    </p>
                  )}
                  <p className="text-[10px] text-ink-400 mt-0.5">
                    Stage {request.current_stage_order} of {stages}
                    {isFinal && " · final"}
                  </p>
                </div>
                <div className="flex items-center px-1 text-ink-300 dark:text-ink-600">
                  <ArrowRight className="w-4 h-4" />
                </div>
                <div className="flex-1 px-3 py-2.5 bg-ink-50/70 dark:bg-ink-900/30 min-w-0">
                  <p className="text-[9.5px] font-bold text-ink-400 uppercase tracking-wider">
                    Then
                  </p>
                  <p
                    className={`text-[12.5px] font-bold leading-tight mt-0.5 flex items-center gap-1 ${destination.tone}`}
                  >
                    <DestIcon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{destination.label}</span>
                  </p>
                  {/* The office that signs next — or, when nobody holds that
                      step, a warning that it will simply sit there. */}
                  {decision === "approved" && !isFinal && (
                    <p
                      className={`text-[10px] mt-0.5 truncate flex items-center gap-1 ${
                        destination.role
                          ? "text-ink-500 dark:text-ink-400"
                          : "text-amber-700 dark:text-amber-400 font-semibold"
                      }`}
                    >
                      <Users className="w-2.5 h-2.5 shrink-0" />
                      {destination.role ?? "No role assigned to that step"}
                    </p>
                  )}
                  {decision === "changes_requested" && destination.role && (
                    <p className="text-[10px] text-ink-500 dark:text-ink-400 mt-0.5 truncate flex items-center gap-1">
                      <Users className="w-2.5 h-2.5 shrink-0" />
                      {destination.role}
                    </p>
                  )}
                  <p className="text-[10px] text-ink-400 mt-0.5">
                    {decision === "approved"
                      ? isFinal
                        ? `${days} day${days === "1" ? "" : "s"} off the balance`
                        : "Not granted yet"
                      : decision === "changes_requested"
                        ? "Returns to this stage"
                        : "Cannot be reopened"}
                  </p>
                </div>
              </div>
            </div>

            {/* ── The note ── */}
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <label className="form-label mb-0" htmlFor="leave-decision-note">
                  {theme.commentLabel}{" "}
                  {theme.commentRequired ? (
                    <span className="text-red-500">*</span>
                  ) : (
                    <span className="text-ink-400 font-normal">(optional)</span>
                  )}
                </label>
                {comment.length > 0 && (
                  <span className="text-[10px] text-ink-400 tabular-nums">
                    {comment.length}
                  </span>
                )}
              </div>
              <textarea
                id="leave-decision-note"
                autoFocus
                rows={3}
                className={`input text-[13px] resize-none mt-1 ${
                  blocked
                    ? "border-amber-300 dark:border-amber-700 focus:border-amber-400"
                    : ""
                }`}
                placeholder={theme.placeholder}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <p className="text-[10.5px] text-ink-400 mt-1">
                {blocked
                  ? "A reason is required before you can continue."
                  : "Visible to the requester and kept on the audit trail."}
              </p>
            </div>
          </div>

          {/* ── Commit ── */}
          <div className="px-5 py-3.5 border-t border-ink-100 dark:border-ink-700 bg-ink-50/50 dark:bg-ink-900/20 flex items-center justify-between gap-3">
            <span className="hidden sm:block text-[10.5px] text-ink-400">
              <kbd className="px-1 py-0.5 rounded border border-ink-200 dark:border-ink-600 font-sans">
                Esc
              </kbd>{" "}
              to cancel
            </span>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                className="btn-secondary flex-1 sm:flex-none text-[13px]"
                onClick={onClose}
                disabled={submit.isPending}
              >
                Go back
              </button>
              <button
                onClick={() => submit.mutate()}
                disabled={!canSend}
                className={`flex-1 sm:flex-none text-white font-bold text-[13px] rounded-lg px-5 py-2 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${theme.accent}`}
              >
                {submit.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Icon className="w-3.5 h-3.5" />
                )}
                {theme.confirm(isFinal)}
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
