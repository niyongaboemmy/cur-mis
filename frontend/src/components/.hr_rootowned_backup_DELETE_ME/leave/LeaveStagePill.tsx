import { Layers } from "lucide-react";
import type { LeaveStatus } from "@/services/hrService";

/**
 * "Stage 1 of 2 · Supervisor / HOD Review" — where a request currently sits in
 * its approval chain. Renders nothing once the request has left the chain,
 * because a stage pointer on a finished request is noise.
 */
export default function LeaveStagePill({
  status,
  stageOrder,
  stageLabel,
  totalStages,
  isFinal,
}: {
  status: LeaveStatus;
  stageOrder: number;
  stageLabel: string | null;
  totalStages: number;
  isFinal?: number | boolean | null;
}) {
  const inFlight = status === "Pending" || status === "ChangesRequested";
  if (!inFlight || !stageLabel) {
    return <span className="text-ink-300 text-[11px]">—</span>;
  }

  return (
    <div className="flex flex-col gap-0.5">
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-ink-700 dark:text-ink-200">
        <Layers className="w-3 h-3 text-brand shrink-0" />
        {stageLabel}
      </span>
      <span className="text-[10px] text-ink-400 uppercase tracking-wider">
        Stage {stageOrder} of {Math.max(totalStages, stageOrder)}
        {isFinal ? " · final" : ""}
      </span>
    </div>
  );
}
