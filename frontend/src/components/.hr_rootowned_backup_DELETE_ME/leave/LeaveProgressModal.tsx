import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  History,
  Loader2,
  RefreshCw,
  Route,
  X,
} from "lucide-react";
import { hrService, type LeaveProgress } from "@/services/hrService";
import { notificationService } from "@/services/notificationService";
import ModalPortal from "@/components/ui/ModalPortal";
import LeaveApprovalFlow from "./LeaveApprovalFlow";
import LeaveStatusBadge from "./LeaveStatusBadge";
import {
  DECISION_LABELS,
  DECISION_STYLES,
  fmtDate,
  fmtDateTime,
} from "./leaveStatus";

/**
 * One leave request's approval chain: a vertical workflow rail built from that
 * leave type's live stage configuration, captioned with the request itself, over
 * the immutable audit trail.
 *
 * `scope` picks which endpoint to read: "own" is the requester-scoped one (a
 * staff member may only read their own trail), "review" is the HR/reviewer one.
 */
export default function LeaveProgressModal({
  requestId,
  scope,
  onClose,
}: {
  requestId: number;
  scope: "own" | "review";
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [historyOpen, setHistoryOpen] = useState(false);

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["leave-progress", scope, requestId],
    queryFn: ({ signal }) =>
      scope === "own"
        ? hrService.myLeaveRequestProgress(requestId, signal)
        : hrService.leaveRequestProgress(requestId, signal),
    // Someone else may sign while this is open.
    refetchInterval: 45_000,
  });

  // Looking at the request is the point of the notification, so opening this
  // clears the badges about it rather than leaving them to be dismissed twice.
  const clearBadges = useMutation({
    mutationFn: () =>
      notificationService.markEntityRead("leave_request", requestId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  useEffect(() => {
    clearBadges.mutate();
    // Once per request opened — deliberately not keyed on the mutation object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  // Escape closes, like every other modal in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const p = data?.data as LeaveProgress | undefined;

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-900/60 backdrop-blur-sm p-0 sm:p-4"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Approval progress"
          onClick={(e) => e.stopPropagation()}
          className="bg-white dark:bg-ink-800 w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] sm:max-h-[88vh] flex flex-col animate-fade-in"
        >
          {/* ── Header: what this is, and where it stands ── */}
          <div className="px-5 pt-4 pb-3 border-b border-ink-100 dark:border-ink-700">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-bold text-[15px] text-ink-900 dark:text-white flex items-center gap-2">
                  <Route className="w-4 h-4 text-brand shrink-0" />
                  Approval Progress
                </h3>
                {p && (
                  <p className="text-[12px] text-ink-500 mt-0.5 truncate">
                    {p.employee_name}
                    {p.leave_type_name && (
                      <>
                        {" · "}
                        <span
                          className="font-semibold"
                          style={{ color: p.leave_type_color ?? undefined }}
                        >
                          {p.leave_type_name}
                        </span>
                      </>
                    )}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => refetch()}
                  disabled={isFetching}
                  title="Refresh"
                  className="icon-btn disabled:opacity-40"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`}
                  />
                </button>
                <button className="icon-btn" onClick={onClose} title="Close">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {p && (
              <div className="flex items-center gap-2 flex-wrap mt-2.5">
                <LeaveStatusBadge status={p.status} />
                {p.start_date && p.end_date && (
                  <span className="text-[11.5px] text-ink-500 dark:text-ink-400">
                    {fmtDate(p.start_date)} → {fmtDate(p.end_date)}
                  </span>
                )}
                {p.days_requested != null && (
                  <span className="chip-soft text-[10.5px]">
                    {p.days_requested} working day
                    {Number(p.days_requested) === 1 ? "" : "s"}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* ── Body ── */}
          <div className="px-5 py-4 overflow-y-auto">
            {isLoading && (
              <div className="py-12 text-center">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" />
              </div>
            )}

            {isError && (
              <p className="py-10 text-center text-[13px] text-red-500">
                Could not load the approval progress.
              </p>
            )}

            {p && (
              <>
                <LeaveApprovalFlow
                  steps={p.steps}
                  signaturesDone={p.signatures_done}
                  signaturesTotal={p.signatures_total}
                />

                {p.reason && (
                  <div className="mt-4 rounded-xl bg-ink-50 dark:bg-ink-900/30 px-3 py-2.5">
                    <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wider mb-0.5">
                      Reason given
                    </p>
                    <p className="text-[12px] text-ink-600 dark:text-ink-300">
                      {p.reason}
                    </p>
                  </div>
                )}

                {/* The rail already names who signed what and when, so the raw
                    trail is collapsed — it is for auditing, not for reading. */}
                <div className="mt-4 border-t border-ink-100 dark:border-ink-700 pt-3">
                  <button
                    onClick={() => setHistoryOpen((v) => !v)}
                    aria-expanded={historyOpen}
                    className="w-full flex items-center justify-between gap-2 group"
                  >
                    <span className="text-[10px] font-bold text-ink-400 uppercase tracking-wider flex items-center gap-1.5 group-hover:text-brand transition-colors">
                      <History className="w-3.5 h-3.5" />
                      Audit trail ({p.history.length})
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 text-ink-400 transition-transform ${historyOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  {historyOpen && (
                    <ul className="mt-2 space-y-1.5">
                      {p.history.length === 0 ? (
                        <li className="text-[12px] text-ink-400">
                          Nothing recorded yet.
                        </li>
                      ) : (
                        p.history.map((h) => (
                          <li
                            key={h.id}
                            className="rounded-lg bg-ink-50/60 dark:bg-ink-900/20 px-3 py-2"
                          >
                            <div className="flex items-baseline justify-between gap-2 flex-wrap">
                              <span
                                className={`text-[11.5px] font-bold ${DECISION_STYLES[h.decision] ?? "text-ink-600"}`}
                              >
                                {DECISION_LABELS[h.decision] ?? h.decision}
                              </span>
                              <span className="text-[10px] text-ink-400 tabular-nums">
                                {fmtDateTime(h.decided_at)}
                              </span>
                            </div>
                            <p className="text-[11px] text-ink-500">
                              {h.stage_label ?? h.stage_key}
                              {h.actor_display_name &&
                                ` · ${h.actor_display_name}`}
                              {h.actor_role && ` (${h.actor_role})`}
                            </p>
                            {h.comment && (
                              <p className="text-[11px] text-ink-500 dark:text-ink-400 mt-0.5 italic">
                                “{h.comment}”
                              </p>
                            )}
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
