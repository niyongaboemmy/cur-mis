import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Eye, EyeOff, RotateCcw, Search, AlertTriangle } from "lucide-react";

import { marksService, type TranscriptModuleRow } from "@/services/marksService";
import { academicsMgmtService } from "@/services/academicsMgmtService";
import toast from "react-hot-toast";

/**
 * Which modules a programme's transcript prints.
 *
 * The transcript prints a student's marks intersected with their programme's
 * curriculum. That is right where the curriculum is complete, but many
 * programmes have modules students genuinely sat that were never added to the
 * curriculum — and legacy marks also carry class-wide entries for modules a
 * student never took. Neither the curriculum nor any heuristic can tell those
 * apart, so this screen lets the registry rule on each module explicitly, with
 * the evidence in front of them.
 */
export default function TranscriptModulesPage() {
  const qc = useQueryClient();
  const [optionId, setOptionId] = useState<string>("");
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<"all" | "printing" | "hidden" | "ruled">("all");

  const optionsQ = useQuery({
    queryKey: ["acmgmt", "options", "transcript-modules"],
    queryFn: () => academicsMgmtService.list<any>("options", { per_page: 500 }),
    staleTime: 5 * 60_000,
  });

  const dataQ = useQuery({
    queryKey: ["transcript-modules", optionId],
    queryFn: () => marksService.transcriptModules(optionId),
    enabled: !!optionId,
  });

  const rule = useMutation({
    mutationFn: (v: { module_ident: string; visible: "show" | "hide" | null }) =>
      marksService.setTranscriptModule({ option_id: optionId, ...v }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["transcript-modules", optionId] });
      toast.success(
        v.visible === "show"
          ? "Module will print on transcripts."
          : v.visible === "hide"
          ? "Module will not print on transcripts."
          : "Reset — the curriculum decides again.",
      );
    },
    onError: () => toast.error("Could not save that decision. Please try again."),
  });

  // list() returns a paginated envelope: response.data.data holds the rows.
  const options: any[] = (optionsQ.data?.data as any)?.data ?? [];
  const payload = dataQ.data?.data;
  const rows = payload?.modules ?? [];

  const shown = useMemo(() => {
    const needle = q.trim().toUpperCase();
    return rows.filter((r) => {
      if (only === "printing" && !r.prints_on_transcript) return false;
      if (only === "hidden" && r.prints_on_transcript) return false;
      if (only === "ruled" && r.ruling === null) return false;
      if (!needle) return true;
      return (
        r.module_code.toUpperCase().includes(needle) ||
        (r.module_name ?? "").toUpperCase().includes(needle)
      );
    });
  }, [rows, q, only]);

  return (
    <div className="p-6 space-y-5">
      <div>
        <h2 className="section-title">Transcript modules</h2>
        <p className="section-sub max-w-3xl">
          Choose which modules a programme&rsquo;s transcript prints. Modules nobody has ruled on
          follow the programme curriculum, exactly as before.
        </p>
      </div>

      {/* ── Programme picker + filters ─────────────────────────────────── */}
      <div className="card p-4 flex flex-wrap items-end gap-3">
        <label className="text-[13px]">
          <span className="text-ink-600 block mb-1">Programme</span>
          <select
            className="input input-sm w-72"
            value={optionId}
            onChange={(e) => setOptionId(e.target.value)}
          >
            <option value="">Select a programme…</option>
            {options.map((o: any) => (
              <option key={o.id} value={o.id}>
                {o.name}
                {o.acro ? ` (${o.acro})` : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="text-[13px]">
          <span className="text-ink-600 block mb-1">Find a module</span>
          <span className="relative block">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              className="input input-sm w-64 pl-8"
              placeholder="Code or title"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              disabled={!optionId}
            />
          </span>
        </label>

        <label className="text-[13px]">
          <span className="text-ink-600 block mb-1">Show</span>
          <select
            className="input input-sm w-48"
            value={only}
            onChange={(e) => setOnly(e.target.value as typeof only)}
            disabled={!optionId}
          >
            <option value="all">All modules</option>
            <option value="printing">Only those printing</option>
            <option value="hidden">Only those hidden</option>
            <option value="ruled">Only decided by staff</option>
          </select>
        </label>

        {payload && (
          <div className="ml-auto flex gap-4 text-[13px] text-ink-500">
            <span>
              <b className="text-ink-800 dark:text-ink-100">{payload.summary.printing}</b> printing
            </span>
            <span>
              <b className="text-ink-800 dark:text-ink-100">{payload.summary.hidden}</b> hidden
            </span>
            <span>
              <b className="text-ink-800 dark:text-ink-100">{payload.summary.ruled}</b> decided by staff
            </span>
          </div>
        )}
      </div>

      {!optionId ? (
        <div className="card p-10 text-center text-ink-500 text-sm">
          Select a programme to review its transcript modules.
        </div>
      ) : dataQ.isLoading ? (
        <div className="card p-10 flex items-center justify-center gap-2 text-ink-500 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading modules…
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-[13px] min-w-[900px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-ink-400 border-b border-ink-100 dark:border-ink-700">
                <th className="px-4 py-2.5">Module</th>
                <th className="px-4 py-2.5">Level</th>
                <th className="px-4 py-2.5 text-right">Credits</th>
                <th className="px-4 py-2.5 text-right">Students</th>
                <th className="px-4 py-2.5 text-right">Avg</th>
                <th className="px-4 py-2.5">Evidence</th>
                <th className="px-4 py-2.5">On transcript</th>
                <th className="px-4 py-2.5">Decision</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <Row
                  key={r.module_ident}
                  row={r}
                  busy={rule.isPending && rule.variables?.module_ident === r.module_ident}
                  onRule={(visible) => rule.mutate({ module_ident: r.module_ident, visible })}
                />
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-ink-500">
                    No modules match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Row({
  row,
  busy,
  onRule,
}: {
  row: TranscriptModuleRow;
  busy: boolean;
  onRule: (visible: "show" | "hide" | null) => void;
}) {
  // One or two distinct marks across a cohort is a class-wide entry, not a
  // sat exam — the single most useful signal on this screen.
  const bulk = row.students_with_marks >= 5 && row.distinct_marks <= 2;

  return (
    <tr className="border-b border-ink-50 dark:border-ink-800 last:border-0">
      <td className="px-4 py-2.5">
        <div className="font-mono text-[12.5px] font-medium">{row.module_code}</div>
        <div className="text-ink-500 text-[12px]">{row.module_name ?? "—"}</div>
      </td>
      <td className="px-4 py-2.5">{row.level ?? "—"}</td>
      <td className="px-4 py-2.5 text-right tabular-nums">{row.module_credits ?? "—"}</td>
      <td className="px-4 py-2.5 text-right tabular-nums">{row.students_with_marks}</td>
      <td className="px-4 py-2.5 text-right tabular-nums">
        {row.avg_mark !== null ? row.avg_mark.toFixed(1) : "—"}
      </td>
      <td className="px-4 py-2.5">
        <div className="flex flex-wrap gap-1.5">
          <span
            className={`chip-xs ${
              row.in_curriculum
                ? "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300"
                : "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300"
            }`}
          >
            {row.in_curriculum ? "In curriculum" : "Not in curriculum"}
          </span>
          {bulk && (
            <span className="chip-xs bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300 inline-flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {row.distinct_marks === 1 ? "One mark for all" : "Almost one mark for all"}
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-2.5">
        {row.prints_on_transcript ? (
          <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-medium">
            <Eye className="w-3.5 h-3.5" /> Prints
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-ink-400">
            <EyeOff className="w-3.5 h-3.5" /> Hidden
          </span>
        )}
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <select
            className="input input-sm w-40"
            value={row.ruling ?? "default"}
            disabled={busy}
            onChange={(e) => {
              const v = e.target.value;
              onRule(v === "default" ? null : (v as "show" | "hide"));
            }}
          >
            <option value="default">
              Follow curriculum{row.in_curriculum ? " (prints)" : " (hidden)"}
            </option>
            <option value="show">Always print</option>
            <option value="hide">Never print</option>
          </select>
          {row.ruling !== null && !busy && (
            <button
              type="button"
              className="text-ink-400 hover:text-ink-700 dark:hover:text-ink-200"
              title="Reset to the curriculum rule"
              onClick={() => onRule(null)}
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-ink-400" />}
        </div>
      </td>
    </tr>
  );
}
