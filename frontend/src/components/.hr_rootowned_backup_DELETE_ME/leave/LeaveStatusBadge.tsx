import type { LeaveStatus } from "@/services/hrService";
import { STATUS_ICONS, STATUS_LABELS, STATUS_STYLES } from "./leaveStatus";

/** The one place a leave status is turned into a pill. */
export default function LeaveStatusBadge({
  status,
  className = "",
}: {
  status: LeaveStatus;
  className?: string;
}) {
  const Icon = STATUS_ICONS[status];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLES[status]} ${className}`}
    >
      <Icon className="w-3 h-3" />
      {STATUS_LABELS[status]}
    </span>
  );
}
