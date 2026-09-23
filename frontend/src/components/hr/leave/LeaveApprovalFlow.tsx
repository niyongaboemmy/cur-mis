import { useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Clock,
  Flag,
  Minus,
  Undo2,
  Users,
  X,
} from "lucide-react";
import type { LeaveProgressStep, LeaveStepState } from "@/services/hrService";
import { STEP_LABELS, fmtDateTime, humanHours } from "./leaveStatus";

/**
 * The approval chain as a vertical workflow rail.
 *
 * Vertical, not a grid: the chain is a sequence, and a two-column layout made it
 * read left→right→wrap, so "who comes after HR" stopped being obvious. A single
 * spine with numbered nodes reads in one direction, survives any number of
 * stages, and needs no reflow on a narrow screen.
 *
 * The spine is drawn per-segment and coloured by what has been cleared, so how
 * far the request has travelled is legible before reading a single label.
 */

type NodeLook = {
  icon: typeof Check;
  /** The node circle. */
  node: string;
  /** The connector *below* this node. */
  spine: string;
  title: string;
  chip: string;
};

const LOOK: Record<LeaveStepState, NodeLook> = {
  completed: {
    icon: Check,
    node: "bg-emerald-500 border-emerald-500 text-white",
    spine: "bg-emerald-400",
    title: "text-ink-900 dark:text-white",
    chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  },
  current: {
    icon: Clock,
    node: "bg-amber-400 border-amber-400 text-white ring-4 ring-amber-400/25",
    spine: "bg-ink-200 dark:bg-ink-700",
    title: "text-ink-900 dark:text-white",
    chip: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
  },
  pending: {
    icon: Minus,
    node: "bg-white dark:bg-ink-800 border-ink-200 dark:border-ink-600 text-ink-400",
    spine: "bg-ink-200 dark:bg-ink-700",
    title: "text-ink-500 dark:text-ink-400",
    chip: "bg-ink-100 text-ink-500 dark:bg-ink-700 dark:text-ink-400",
  },
  rejected: {
    icon: X,
    node: "bg-red-600 border-red-600 text-white ring-4 ring-red-500/20",
    spine: "bg-ink-200 dark:bg-ink-700",
    title: "text-red-700 dark:text-red-300",
    chip: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
  },
  changes_requested: {
    icon: Undo2,
    node: "bg-orange-500 border-orange-500 text-white ring-4 ring-orange-500/20",
    spine: "bg-ink-200 dark:bg-ink-700",
    title: "text-orange-700 dark:text-orange-300",
    chip: "bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-300",
  },
  cancelled: {
    icon: X,
    node: "bg-ink-400 border-ink-400 text-white",
    spine: "bg-ink-200 dark:bg-ink-700",
    title: "text-ink-500 dark:text-ink-400",
    chip: "bg-ink-100 text-ink-500 dark:bg-ink-700 dark:text-ink-400",
  },
  skipped: {
    icon: Minus,
    node: "bg-transparent border-ink-200 dark:border-ink-700 border-dashed text-ink-300 dark:text-ink-600",
    spine: "bg-transparent border-l-2 border-dashed border-ink-200 dark:border-ink-700",
    title: "text-ink-400 dark:text-ink-500 line-through decoration-1",
    chip: "bg-transparent text-ink-400 dark:text-ink-500",
  },
};

/** A slim meter for the SLA on the step that is currently waiting. */
function SlaMeter({ step }: { step: LeaveProgressStep }) {
  const waited = Math.max(0, step.hours_waiting ?? 0);
  const sla = step.sla_hours;

  if (sla == null) {
    return (
      <p className="text-[11px] text-ink-500 dark:text-ink-400 flex items-center gap-1">
        <Clock className="w-3 h-3" /> waiting {humanHours(waited)} · no target set
      </p>
    );
  }

  const pct = Math.min(100, Math.round((waited / sla) * 100));
  const late = !!step.is_overdue;

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={`text-[11px] font-semibold ${
            late
              ? "text-red-600 dark:text-red-400"
              : "text-ink-600 dark:text-ink-300"
          }`}
        >
          {late ? (
            <span className="inline-flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {humanHours(waited - sla)} over target
            </span>
          ) : (
            <>waiting {humanHours(waited)}</>
          )}
        </span>
        <span className="text-[10px] text-ink-400 tabular-nums">
          {Math.floor(waited)}h / {sla}h
        </span>
      </div>
      <div
        className="h-1.5 rounded-full bg-ink-100 dark:bg-ink-700 overflow-hidden"
        role="progressbar"
        aria-valuenow={Math.floor(waited)}
        aria-valuemin={0}
        aria-valuemax={sla}
      >
        <div
          className={`h-full rounded-full transition-all duration-700 ${
            late ? "bg-red-500" : pct > 75 ? "bg-amber-500" : "bg-emerald-500"
          }`}
          style={{ width: `${Math.max(pct, 3)}%` }}
        />
      </div>
    </div>
  );
}

export default function LeaveApprovalFlow({
  steps,
  signaturesDone,
  signaturesTotal,
}: {
  steps: LeaveProgressStep[];
  signaturesDone?: number;
  signaturesTotal?: number;
}) {
  // Expanded by default only where there is something extra to read.
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggle = (i: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  const pct =
    signaturesTotal && signaturesTotal > 0
      ? Math.round(((signaturesDone ?? 0) / signaturesTotal) * 100)
      : 0;

  return (
    <div>
      {/* Overall progress — the answer to "how far along is this?" up front. */}
      {!!signaturesTotal && (
        <div className="mb-4">
          <div className="flex items-baseline justify-between gap-2 mb-1.5">
            <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wider">
              Approval flow
            </p>
            <p className="text-[11px] font-semibold text-ink-600 dark:text-ink-300 tabular-nums">
              {signaturesDone ?? 0} of {signaturesTotal} signature
              {signaturesTotal === 1 ? "" : "s"}
            </p>
          </div>
          <div className="h-1.5 rounded-full bg-ink-100 dark:bg-ink-700 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      <ol className="relative">
        {steps.map((step, i) => {
          const look = LOOK[step.state];
          const Icon = step.key === "granted" ? Flag : look.icon;
          const isLast = i === steps.length - 1;
          const isOutcome = step.key === "granted";
          const signed = step.state === "completed" && !!step.actor && !isOutcome;
          const hasDetail = !!step.comment;
          const open = expanded.has(i);

          return (
            <li key={`${step.key}-${i}`} className="flex gap-3 group">
              {/* ── Spine ── */}
              <div className="flex flex-col items-center shrink-0">
                <span
                  className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-[11px] font-bold transition-all ${look.node}`}
                >
                  {step.state === "pending" ? (
                    <span className="tabular-nums">{i + 1}</span>
                  ) : (
                    <Icon className="w-3.5 h-3.5" />
                  )}
                </span>
                {!isLast && (
                  <span
                    className={`w-0.5 flex-1 min-h-[26px] my-1 rounded-full ${look.spine}`}
                    aria-hidden
                  />
                )}
              </div>

              {/* ── Card ── */}
              <div className={`min-w-0 flex-1 ${isLast ? "pb-0" : "pb-3"}`}>
                <div
                  className={`rounded-xl border px-3 py-2.5 transition-colors ${
                    step.state === "current"
                      ? "border-amber-300 dark:border-amber-700 bg-amber-50/70 dark:bg-amber-500/10"
                      : step.state === "completed"
                        ? "border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-800"
                        : step.state === "rejected"
                          ? "border-red-200 dark:border-red-800 bg-red-50/70 dark:bg-red-500/10"
                          : step.state === "changes_requested"
                            ? "border-orange-200 dark:border-orange-800 bg-orange-50/70 dark:bg-orange-500/10"
                            : "border-ink-100 dark:border-ink-700/60 bg-ink-50/40 dark:bg-ink-900/20"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className={`text-[13px] font-bold leading-snug ${look.title}`}
                    >
                      {step.label}
                    </p>
                    <span
                      className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${look.chip}`}
                    >
                      {isOutcome && step.state === "completed"
                        ? "Granted"
                        : STEP_LABELS[step.state]}
                    </span>
                  </div>

                  {/* Signature line, in the form's own wording. */}
                  {signed && (
                    <p className="text-[11.5px] text-ink-600 dark:text-ink-300 mt-1">
                      Signed by <strong>{step.actor}</strong>
                      {step.actor_role && (
                        <span className="text-ink-400"> ({step.actor_role})</span>
                      )}
                      {step.decided_at && (
                        <span className="text-ink-400">
                          {" "}
                          · {fmtDateTime(step.decided_at)}
                        </span>
                      )}
                    </p>
                  )}

                  {isOutcome && step.state === "completed" && step.decided_at && (
                    <p className="text-[11.5px] text-ink-600 dark:text-ink-300 mt-1">
                      Granted on {fmtDateTime(step.decided_at)}
                    </p>
                  )}

                  {(step.state === "rejected" ||
                    step.state === "changes_requested") &&
                    step.actor && (
                      <p className="text-[11.5px] text-ink-600 dark:text-ink-300 mt-1">
                        By <strong>{step.actor}</strong>
                        {step.actor_role && (
                          <span className="text-ink-400">
                            {" "}
                            ({step.actor_role})
                          </span>
                        )}
                        {step.decided_at && (
                          <span className="text-ink-400">
                            {" "}
                            · {fmtDateTime(step.decided_at)}
                          </span>
                        )}
                      </p>
                    )}

                  {/* Which office is assigned to sign this step — shown on any
                      step not yet signed, so the road ahead names the offices
                      rather than only their stage titles. An empty assignment is
                      a step nobody can sign, which has to be said out loud. */}
                  {!isOutcome &&
                    step.state !== "completed" &&
                    step.state !== "skipped" &&
                    step.assigned_roles !== undefined && (
                      <p className="text-[11px] mt-1 flex items-start gap-1">
                        <Users className="w-3 h-3 mt-0.5 shrink-0 text-ink-400" />
                        {step.assigned_roles.length > 0 ? (
                          <span className="text-ink-500 dark:text-ink-400">
                            Assigned to{" "}
                            <strong className="text-ink-700 dark:text-ink-200">
                              {step.assigned_roles.join(", ")}
                            </strong>
                          </span>
                        ) : (
                          <span className="text-amber-700 dark:text-amber-400 font-semibold">
                            No role assigned — nobody can sign this step
                          </span>
                        )}
                      </p>
                    )}

                  {/* The waiting step gets the meter; later steps just a target. */}
                  {step.state === "current" && (
                    <div className="mt-2">
                      <SlaMeter step={step} />
                    </div>
                  )}
                  {step.state === "pending" && step.sla_hours != null && (
                    <p className="text-[10.5px] text-ink-400 mt-1">
                      {step.sla_hours}h target once reached
                    </p>
                  )}

                  {/* A reviewer's note is the one thing worth hiding until asked. */}
                  {hasDetail && (
                    <>
                      <button
                        onClick={() => toggle(i)}
                        aria-expanded={open}
                        className="mt-1.5 inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wider text-ink-400 hover:text-brand transition-colors"
                      >
                        <ChevronDown
                          className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`}
                        />
                        {open ? "Hide note" : "Note from reviewer"}
                      </button>
                      {open && (
                        <p className="text-[11.5px] text-ink-600 dark:text-ink-300 mt-1 pl-1 border-l-2 border-ink-200 dark:border-ink-600 italic">
                          {step.comment}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
