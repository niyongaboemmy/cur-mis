import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Flag,
  Info,
  Layers,
  Loader2,
  Plus,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  hrService,
  type LeaveApprovalStagePayload,
  type LeaveType,
} from "@/services/hrService";
import ModalPortal from "@/components/ui/ModalPortal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

/**
 * Human labels for the stage permissions a chain can be gated on — the offices
 * that sign, named the way the paper form names them.
 */
const PERMISSION_LABELS: Record<string, string> = {
  APPROVE_LEAVE_VC: "Vice Chancellor",
  APPROVE_LEAVE_HR: "HR — Recommendation",
  APPROVE_LEAVE_DAF: "DAF — Director of Administration & Finance",
  APPROVE_LEAVE_FINAL:
    "Vice Chancellor — Final Authorization (grants the leave)",
  APPROVE_LEAVE_L1: "Generic stage 1 approver (e.g. supervisor / HOD)",
  APPROVE_LEAVE_L2: "Generic stage 2 approver (e.g. dean / director)",
  MANAGE_LEAVE_REQUESTS: "Leave administrator",
};

const slugify = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "stage";

type Draft = LeaveApprovalStagePayload;

/**
 * Edit a leave type's approval chain.
 *
 * The chain is configuration, not code — but until there was a screen for it,
 * changing who signs off at which level meant an API call. The rules enforced
 * here mirror LeaveApprovalService::validateChain exactly, so the Save button
 * only ever sends something the server will accept; the server remains the
 * authority and its error is surfaced verbatim if they ever diverge.
 */
export default function LeaveChainEditorModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [typeId, setTypeId] = useState<number | null>(null);
  const [stages, setStages] = useState<Draft[]>([]);
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const { data: typesRes } = useQuery({
    queryKey: ["leave-types"],
    queryFn: ({ signal }) => hrService.leaveTypes(signal),
  });
  const types = (typesRes?.data ?? []) as LeaveType[];

  // Land on the first type so the editor is never an empty shell.
  useEffect(() => {
    if (typeId === null && types.length > 0) setTypeId(types[0].id);
  }, [types, typeId]);

  const { data: chainRes, isLoading: chainLoading } = useQuery({
    queryKey: ["leave-approval-chain", typeId],
    queryFn: ({ signal }) => hrService.leaveApprovalChain(typeId!, signal),
    enabled: typeId !== null,
  });

  const holderCounts = chainRes?.data?.permission_holder_counts ?? {};
  const permissionRoles = chainRes?.data?.permission_roles ?? {};
  const available = chainRes?.data?.available_stage_permissions ?? [
    "APPROVE_LEAVE_VC",
    "APPROVE_LEAVE_HR",
    "APPROVE_LEAVE_DAF",
    "APPROVE_LEAVE_L1",
    "APPROVE_LEAVE_L2",
    "APPROVE_LEAVE_FINAL",
  ];

  // Reset the draft whenever a different type's chain arrives.
  useEffect(() => {
    const loaded = chainRes?.data?.stages;
    if (!loaded) return;
    setStages(
      loaded.map((s) => ({
        stage_key: s.stage_key,
        stage_label: s.stage_label,
        required_permission_slug: s.required_permission_slug,
        is_final_approval: !!s.is_final_approval,
        sla_hours: s.sla_hours,
      })),
    );
    setDirty(false);
  }, [chainRes]);

  const save = useMutation({
    mutationFn: () => hrService.saveLeaveApprovalChain(typeId!, stages),
    onSuccess: (res) => {
      toast.success(res?.message ?? "Approval chain saved.");
      setDirty(false);
      setConfirming(false);
      qc.invalidateQueries({ queryKey: ["leave-approval-chain"] });
      qc.invalidateQueries({ queryKey: ["leave-types"] });
      qc.invalidateQueries({ queryKey: ["leave-requests"] });
      qc.invalidateQueries({ queryKey: ["leave-stats"] });
    },
    onError: (e: any) => {
      setConfirming(false);
      toast.error(e?.response?.data?.message ?? "Could not save the chain.");
    },
  });

  function edit(i: number, patch: Partial<Draft>) {
    setStages((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));
    setDirty(true);
  }

  function move(i: number, delta: number) {
    const j = i + delta;
    if (j < 0 || j >= stages.length) return;
    setStages((prev) => {
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      // The final approval must remain last, so moving stages re-seats the flag.
      return next.map((s, k) => ({
        ...s,
        is_final_approval: k === next.length - 1,
      }));
    });
    setDirty(true);
  }

  function add() {
    setStages((prev) => {
      const label = `Stage ${prev.length + 1} Review`;
      const next: Draft[] = [
        ...prev.map((s) => ({ ...s, is_final_approval: false })),
        {
          stage_key: slugify(label),
          stage_label: label,
          required_permission_slug: available[
            Math.min(prev.length, available.length - 1)
          ],
          is_final_approval: true,
          sla_hours: 48,
        },
      ];
      return next;
    });
    setDirty(true);
  }

  function remove(i: number) {
    setStages((prev) => {
      const next = prev.filter((_, j) => j !== i);
      return next.map((s, k) => ({
        ...s,
        is_final_approval: k === next.length - 1,
      }));
    });
    setDirty(true);
  }

  /**
   * Offices with nobody in them. Not a validation error — the chain is still
   * legal and saving it is sometimes the first step (create the chain, then
   * assign the accounts) — but a request will sit at that stage indefinitely, so
   * it has to be said out loud.
   */
  const unstaffed = stages.filter(
    (st) => (holderCounts[st.required_permission_slug] ?? 1) === 0,
  );

  /** The same rules validateChain() enforces server-side. */
  const problems: string[] = [];
  if (stages.length === 0) problems.push("A chain needs at least one stage.");
  stages.forEach((s, i) => {
    if (!s.stage_label.trim())
      problems.push(`Stage ${i + 1} needs a name.`);
    if (!s.required_permission_slug)
      problems.push(`Stage ${i + 1} needs an approver.`);
  });
  const keys = stages.map((s) => s.stage_key.trim());
  if (new Set(keys).size !== keys.length)
    problems.push("Two stages share the same key.");
  if (stages.length > 0 && !stages[stages.length - 1].is_final_approval)
    problems.push("The last stage must be the final approval.");

  const activeType = types.find((t) => t.id === typeId);

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 backdrop-blur-sm p-4">
        <div className="bg-white dark:bg-ink-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100 dark:border-ink-700">
            <div>
              <h3 className="font-bold text-[15px] text-ink-900 dark:text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-brand" /> Approval Chain
              </h3>
              <p className="text-[12px] text-ink-500 mt-0.5">
                Who signs off on each leave type, and in what order
              </p>
            </div>
            <button className="icon-btn" onClick={onClose}>
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-5 py-4 overflow-y-auto space-y-4">
            {/* Leave type picker */}
            <div>
              <label className="form-label">Leave type</label>
              <select
                className="input text-[13px]"
                value={typeId ?? ""}
                onChange={(e) => {
                  if (
                    dirty &&
                    !window.confirm("Discard unsaved changes to this chain?")
                  )
                    return;
                  setTypeId(parseInt(e.target.value));
                }}
              >
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.stage_count === 0 ? " — no chain configured" : ""}
                  </option>
                ))}
              </select>
              {activeType?.stage_count === 0 && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 flex items-start gap-1">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
                  This type has no chain, so it falls back to a single
                  administrator approval. Saving below replaces that.
                </p>
              )}
            </div>

            {/* Stages */}
            {chainLoading ? (
              <div className="py-10 text-center">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" />
              </div>
            ) : (
              <div className="space-y-2">
                {stages.map((s, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-ink-200 dark:border-ink-700 p-3 space-y-2 bg-ink-50/40 dark:bg-ink-900/20"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-brand/10 text-brand text-[11px] font-bold flex items-center justify-center shrink-0">
                        {i + 1}
                      </span>
                      <input
                        className="input py-1.5 text-[13px] flex-1"
                        placeholder="Stage name, e.g. Supervisor / HOD Review"
                        value={s.stage_label}
                        onChange={(e) =>
                          edit(i, {
                            stage_label: e.target.value,
                            // Keep the key in step while it still looks generated.
                            stage_key:
                              s.stage_key === slugify(s.stage_label)
                                ? slugify(e.target.value)
                                : s.stage_key,
                          })
                        }
                      />
                      {s.is_final_approval && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 shrink-0">
                          <Flag className="w-3 h-3" /> Final
                        </span>
                      )}
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          className="icon-btn disabled:opacity-30"
                          disabled={i === 0}
                          onClick={() => move(i, -1)}
                          title="Move earlier"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          className="icon-btn disabled:opacity-30"
                          disabled={i === stages.length - 1}
                          onClick={() => move(i, 1)}
                          title="Move later"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          className="icon-btn text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
                          onClick={() => remove(i)}
                          title="Remove stage"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pl-8">
                      <div className="sm:col-span-2">
                        <label className="text-[10px] font-bold text-ink-400 uppercase tracking-wider">
                          Decided by
                        </label>
                        <select
                          className="input py-1.5 text-[12px]"
                          value={s.required_permission_slug}
                          onChange={(e) =>
                            edit(i, { required_permission_slug: e.target.value })
                          }
                        >
                          {available.map((slug) => {
                            const held = holderCounts[slug];
                            const roles = permissionRoles[slug] ?? [];
                            // Name the office, not just the head count: the
                            // permission is the contract, but the role is what an
                            // administrator actually assigns people to.
                            const who = roles.length
                              ? roles.map((r) => r.name).join(", ")
                              : "no role assigned";
                            return (
                              <option key={slug} value={slug}>
                                {PERMISSION_LABELS[slug] ?? slug} — {who}
                                {held !== undefined && ` (${held})`}
                              </option>
                            );
                          })}
                        </select>
                        {(() => {
                          const roles =
                            permissionRoles[s.required_permission_slug] ?? [];
                          const held =
                            holderCounts[s.required_permission_slug] ?? 0;
                          if (roles.length === 0) {
                            return (
                              <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 flex items-start gap-1">
                                <AlertTriangle className="w-3 h-3 shrink-0 mt-px" />
                                No role holds this permission — create or grant one
                                or requests will wait at this step.
                              </p>
                            );
                          }
                          return (
                            <p
                              className={`text-[10px] mt-0.5 flex items-start gap-1 ${
                                held === 0
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-ink-400"
                              }`}
                            >
                              {held === 0 ? (
                                <AlertTriangle className="w-3 h-3 shrink-0 mt-px" />
                              ) : (
                                <Users className="w-3 h-3 shrink-0 mt-px" />
                              )}
                              Role: <strong>{roles.map((r) => r.name).join(", ")}</strong>
                              {held === 0
                                ? " — but no account is assigned to it yet"
                                : ` · ${held} ${held === 1 ? "signatory" : "signatories"}`}
                            </p>
                          );
                        })()}
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-ink-400 uppercase tracking-wider">
                          SLA (hours)
                        </label>
                        <input
                          type="number"
                          min={1}
                          className="input py-1.5 text-[12px]"
                          placeholder="none"
                          value={s.sla_hours ?? ""}
                          onChange={(e) =>
                            edit(i, {
                              sla_hours:
                                e.target.value === ""
                                  ? null
                                  : parseInt(e.target.value),
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  className="btn-secondary w-full text-[12px] flex items-center justify-center gap-1.5"
                  onClick={add}
                >
                  <Plus className="w-3.5 h-3.5" /> Add stage
                </button>
              </div>
            )}

            {unstaffed.length > 0 && problems.length === 0 && (
              <div className="rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-800 px-3 py-2">
                <p className="text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1 mb-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> Stages with nobody
                  assigned
                </p>
                <p className="text-[12px] text-amber-800 dark:text-amber-300">
                  {unstaffed.map((st) => st.stage_label).join(", ")} — a request
                  reaching{" "}
                  {unstaffed.length === 1 ? "this stage" : "these stages"} will
                  wait until an account is given the matching role. You can still
                  save the chain and assign accounts afterwards.
                </p>
              </div>
            )}

            {problems.length > 0 && (
              <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-800 px-3 py-2">
                <p className="text-[11px] font-bold text-red-700 dark:text-red-400 uppercase tracking-wider flex items-center gap-1 mb-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> Fix before saving
                </p>
                <ul className="text-[12px] text-red-700 dark:text-red-300 list-disc pl-4 space-y-0.5">
                  {problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-[11px] text-ink-400">
              The default chain is the institution's own sequence — the
              responsible officer prepares the request, then it is signed by the
              Vice Chancellor, HR, the DAF, and the Vice Chancellor again for
              final authorization.
            </p>
            <p className="text-[11px] text-ink-400">
              Changing a chain affects requests already in flight: a request
              sitting at stage 2 keeps its position, so removing stages can move
              it past reviewers who have not seen it. Prefer editing a chain when
              nothing is mid-review.
            </p>
          </div>

          {/* Footer */}
          <div className="flex gap-2 px-5 py-4 border-t border-ink-100 dark:border-ink-700">
            <button className="btn-secondary flex-1" onClick={onClose}>
              Close
            </button>
            <button
              className="btn-primary flex-1 flex items-center justify-center gap-1.5 disabled:opacity-50"
              disabled={
                !dirty ||
                problems.length > 0 ||
                save.isPending ||
                typeId === null
              }
              onClick={() => setConfirming(true)}
            >
              {save.isPending && (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              )}
              {dirty ? "Save chain" : "Saved"}
            </button>
          </div>
        </div>
      </div>

      {confirming && (
        <ConfirmDialog
          open
          variant="warning"
          onClose={() => setConfirming(false)}
          onConfirm={() => save.mutate()}
          loading={save.isPending}
          title="Replace this approval chain?"
          confirmLabel="Yes, save chain"
          cancelLabel="Keep editing"
          message={
            <>
              The chain for <strong>{activeType?.name ?? "this leave type"}</strong>{" "}
              will be replaced with these {stages.length} stage
              {stages.length === 1 ? "" : "s"}.
            </>
          }
          details={
            <div className="space-y-2">
              <ol className="text-[12px] text-ink-600 dark:text-ink-300 rounded-lg bg-ink-50 dark:bg-ink-900/30 px-3 py-2 space-y-0.5">
                {stages.map((st, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-ink-400 tabular-nums">{i + 1}.</span>
                    <span className="min-w-0">
                      {st.stage_label}
                      {st.is_final_approval && (
                        <strong className="text-emerald-600 dark:text-emerald-400">
                          {" "}
                          — grants the leave
                        </strong>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="text-[11.5px] text-amber-700 dark:text-amber-400">
                Requests already in flight keep their position in the chain, so
                shortening it can carry one past a stage nobody has signed.
              </p>
            </div>
          }
        />
      )}
    </ModalPortal>
  );
}
