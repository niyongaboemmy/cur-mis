import type { LeaveStatus } from "@/services/hrService";

/**
 * A one-line "stage 2 of 3" progress bar for a table row.
 *
 * The full chain lives behind LeaveProgressModal, but a requester scanning
 * their list should be able to see how far along each request is without
 * opening anything — that is the difference between a status column and
 * actually tracking progress.
 *
 * Derived from the row's own stage columns, so it costs no extra request.
 */
export default function LeaveMiniProgress({
  status,
  stageOrder,
  totalStages,
}: {
  status: LeaveStatus;
  stageOrder: number;
  totalStages: number;
}) {
  const stages = Math.max(totalStages, stageOrder, 1);

  // Cleared stages: all of them once granted, otherwise everything strictly
  // before the stage the request is sitting at — a rejected or cancelled request
  // keeps credit for the stages it did clear.
  const cleared = status === "Approved" ? stages : Math.max(stageOrder - 1, 0);
  const pct = Math.round((cleared / stages) * 100);

  const [barColor, label] = ((): [string, string] => {
    switch (status) {
      case "Approved":
        return ["bg-emerald-500", "Complete"];
      case "Rejected":
        return ["bg-red-500", `Stopped at stage ${stageOrder}`];
      case "Cancelled":
        return ["bg-ink-400", "Cancelled"];
      case "ChangesRequested":
        return ["bg-orange-500", `Back with you · stage ${stageOrder} of ${stages}`];
      default:
        return ["bg-amber-400", `Stage ${stageOrder} of ${stages}`];
    }
  })();

  return (
    <div className="min-w-[110px]">
      <div
        className="h-1.5 rounded-full bg-ink-100 dark:bg-ink-700 overflow-hidden"
        role="progressbar"
        aria-valuenow={cleared}
        aria-valuemin={0}
        aria-valuemax={stages}
        aria-label={`Approval progress: ${label}`}
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${status === "Approved" ? 100 : Math.max(pct, 6)}%` }}
        />
      </div>
      <p className="text-[10px] text-ink-400 mt-1 whitespace-nowrap">{label}</p>
    </div>
  );
}
