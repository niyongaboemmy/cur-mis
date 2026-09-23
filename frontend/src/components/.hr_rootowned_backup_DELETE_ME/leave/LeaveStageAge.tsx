import { AlertTriangle, Clock } from "lucide-react";
import type { LeaveStatus } from "@/services/hrService";
import { humanHours } from "./leaveStatus";

/**
 * How long the request has been waiting at its current stage, and whether that
 * breaches the stage's SLA.
 *
 * Every stage carries an `sla_hours` in the chain config; without surfacing it
 * the number is dead data and nothing in the workflow ever says "this has been
 * sitting too long". Renders nothing for a settled request — an SLA only means
 * something while somebody still owes a decision.
 */
export default function LeaveStageAge({
  status,
  hoursAtStage,
  slaHours,
  isOverdue,
  compact = false,
}: {
  status: LeaveStatus;
  hoursAtStage: number;
  slaHours: number | null;
  isOverdue: number | boolean;
  compact?: boolean;
}) {
  if (status !== "Pending") return null;

  const hours = Math.max(0, Number(hoursAtStage) || 0);
  const late = !!isOverdue;
  const overBy = slaHours != null ? hours - slaHours : 0;

  if (late) {
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300"
        title={`Waiting ${humanHours(hours)} — the SLA for this stage is ${slaHours}h`}
      >
        <AlertTriangle className="w-3 h-3" />
        {humanHours(overBy)} overdue
      </span>
    );
  }

  if (compact) return null;

  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] text-ink-400"
      title={
        slaHours != null
          ? `Waiting ${humanHours(hours)} of the ${slaHours}h allowed at this stage`
          : `Waiting ${humanHours(hours)} — this stage has no SLA`
      }
    >
      <Clock className="w-3 h-3" />
      {humanHours(hours)} here
      {slaHours != null && ` / ${slaHours}h`}
    </span>
  );
}
