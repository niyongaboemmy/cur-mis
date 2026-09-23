import {
  Check,
  CheckCircle2,
  Clock,
  MessageSquareWarning,
  X,
  XCircle,
} from "lucide-react";
import type { LeaveStatus, LeaveStepState } from "@/services/hrService";

/**
 * Shared leave presentation vocabulary.
 *
 * LeavePage, MyLeavePage and the approval queue all render the same statuses;
 * keeping the styles/icons/labels here is what stops a new status (like
 * ChangesRequested) from being handled in one place and forgotten in another.
 */

export const STATUS_STYLES: Record<LeaveStatus, string> = {
  Pending:
    "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  ChangesRequested:
    "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
  Approved:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  Rejected: "bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400",
  Cancelled: "bg-ink-100 text-ink-500 dark:bg-ink-700 dark:text-ink-400",
};

export const STATUS_ICONS: Record<LeaveStatus, typeof Check> = {
  Pending: Clock,
  ChangesRequested: MessageSquareWarning,
  Approved: CheckCircle2,
  Rejected: XCircle,
  Cancelled: X,
};

/** "Pending" alone reads as if nobody has looked at it — name the real state. */
export const STATUS_LABELS: Record<LeaveStatus, string> = {
  Pending: "In Review",
  ChangesRequested: "Changes Requested",
  Approved: "Approved",
  Rejected: "Rejected",
  Cancelled: "Cancelled",
};


/**
 * The workflow is a sequence of signature blocks, so a cleared step reads
 * "Signed", not "Done" — the same wording the paper form uses.
 */
export const STEP_LABELS: Record<LeaveStepState, string> = {
  completed: "Signed",
  current: "Awaiting signature",
  pending: "Not yet reached",
  rejected: "Rejected here",
  changes_requested: "Changes requested here",
  cancelled: "Cancelled here",
  skipped: "Not reached",
};

/** Card tint per step state — a signed block reads green, like the form. */
export const STEP_CARD_STYLES: Record<LeaveStepState, string> = {
  completed:
    "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-800",
  current:
    "bg-amber-50 dark:bg-amber-500/10 border-amber-300 dark:border-amber-700",
  pending: "bg-ink-50/60 dark:bg-ink-900/20 border-ink-200 dark:border-ink-700",
  rejected: "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-800",
  changes_requested:
    "bg-orange-50 dark:bg-orange-500/10 border-orange-200 dark:border-orange-800",
  cancelled: "bg-ink-50 dark:bg-ink-800 border-ink-200 dark:border-ink-700",
  skipped:
    "bg-transparent border-ink-200 dark:border-ink-700 border-dashed opacity-70",
};

/** Heading colour per step state. */
export const STEP_TITLE_STYLES: Record<LeaveStepState, string> = {
  completed: "text-emerald-800 dark:text-emerald-300",
  current: "text-amber-800 dark:text-amber-300",
  pending: "text-ink-500 dark:text-ink-400",
  rejected: "text-red-800 dark:text-red-300",
  changes_requested: "text-orange-800 dark:text-orange-300",
  cancelled: "text-ink-500 dark:text-ink-400",
  skipped: "text-ink-400 dark:text-ink-500",
};

export const DECISION_LABELS: Record<string, string> = {
  submitted: "Submitted",
  resubmitted: "Resubmitted",
  approved: "Approved",
  rejected: "Rejected",
  changes_requested: "Changes requested",
  cancelled: "Cancelled",
};

export const DECISION_STYLES: Record<string, string> = {
  submitted: "text-blue-600 dark:text-blue-400",
  resubmitted: "text-blue-600 dark:text-blue-400",
  approved: "text-emerald-600 dark:text-emerald-400",
  rejected: "text-red-600 dark:text-red-400",
  changes_requested: "text-orange-600 dark:text-orange-400",
  cancelled: "text-ink-500 dark:text-ink-400",
};

/** "5h" / "3d" — a duration in hours, at the precision a reader cares about. */
export const humanHours = (hours: number) => {
  const h = Math.max(0, Math.round(hours));
  if (h < 1) return "under an hour";
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
};

/**
 * "10" / "4.5" — days_requested arrives as a DECIMAL string ("10.0"), and a
 * trailing .0 in a sentence reads like a machine wrote it.
 */
export const prettyDays = (days: number | string | null | undefined) => {
  const n = Number(days ?? 0);
  return Number.isFinite(n) ? String(Number(n.toFixed(1))) : "0";
};

/** dd Mon yyyy — the format used across every leave view. */
export const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

export const fmtDateTime = (d: string) =>
  new Date(d).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
