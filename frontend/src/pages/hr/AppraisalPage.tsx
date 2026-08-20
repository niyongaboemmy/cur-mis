import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  ClipboardList,
  Plus,
  ChevronRight,
  Loader2,
  Star,
  Users,
  CheckCircle2,
  Clock,
  AlertCircle,
  Pencil,
  Trash2,
  X,
  Save,
  Send,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Settings,
  RefreshCw,
  Award,
  TrendingUp,
  Circle,
} from "lucide-react";
import { hrService } from "@/services/hrService";
import type {
  AppraisalPeriod,
  AppraisalPeriodPayload,
  AppraisalPeriodStatus,
  AppraisalCriterion,
  AppraisalCriterionPayload,
  Appraisal,
  AppraisalStatus,
  AppraisalRating,
} from "@/services/hrService";
import ModalPortal from "@/components/ui/ModalPortal";
import { PERMISSIONS } from "@/constants/permissions";
import { usePermission } from "@/utils/permissions";

/* ── helpers ────────────────────────────────────────────────────────────── */

const STATUS_CONFIG: Record<
  AppraisalStatus,
  { label: string; color: string; bg: string; icon: React.ComponentType<{ className?: string }> }
> = {
  Draft:               { label: "Draft",            color: "text-ink-500",    bg: "bg-ink-100 dark:bg-ink-700",           icon: Circle },
  "Self-Review":       { label: "Self-Review",      color: "text-blue-600",   bg: "bg-blue-50 dark:bg-blue-900/30",       icon: ClipboardList },
  "Supervisor-Review": { label: "Supervisor Review",color: "text-amber-600",  bg: "bg-amber-50 dark:bg-amber-900/30",     icon: Users },
  "HR-Review":         { label: "HR Review",        color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-900/30",   icon: BarChart3 },
  Completed:           { label: "Completed",        color: "text-green-600",  bg: "bg-green-50 dark:bg-green-900/30",     icon: CheckCircle2 },
};

const PERIOD_STATUS_CONFIG: Record<
  AppraisalPeriodStatus,
  { label: string; color: string; dot: string }
> = {
  Draft:  { label: "Draft",  color: "text-ink-500",   dot: "bg-ink-400" },
  Active: { label: "Active", color: "text-green-600", dot: "bg-green-500" },
  Closed: { label: "Closed", color: "text-red-600",   dot: "bg-red-500" },
};

const GRADE_CONFIG: Record<string, { color: string; bg: string }> = {
  Excellent:           { color: "text-green-700",  bg: "bg-green-50 dark:bg-green-900/30" },
  Good:                { color: "text-blue-700",   bg: "bg-blue-50 dark:bg-blue-900/30" },
  Satisfactory:        { color: "text-amber-700",  bg: "bg-amber-50 dark:bg-amber-900/30" },
  "Needs Improvement": { color: "text-red-700",    bg: "bg-red-50 dark:bg-red-900/30" },
};

function ScoreBadge({ score, max = 5 }: { score: number | null; max?: number }) {
  if (score == null) return <span className="text-ink-400 text-xs italic">—</span>;
  const pct = (score / max) * 100;
  const color = pct >= 80 ? "text-green-600" : pct >= 60 ? "text-amber-600" : "text-red-600";
  return <span className={`font-semibold tabular-nums ${color}`}>{score}/{max}</span>;
}

function StatusBadge({ status }: { status: AppraisalStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.Draft;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}>
      <Icon className="w-3 h-3" />{cfg.label}
    </span>
  );
}

function StarRating({
  value,
  max = 5,
  onChange,
  readOnly = false,
}: {
  value: number | null;
  max?: number;
  onChange?: (v: number) => void;
  readOnly?: boolean;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }, (_, i) => i + 1).map((star) => {
        const filled = (hovered ?? value ?? 0) >= star;
        return (
          <button
            key={star}
            type="button"
            disabled={readOnly}
            onMouseEnter={() => !readOnly && setHovered(star)}
            onMouseLeave={() => !readOnly && setHovered(null)}
            onClick={() => !readOnly && onChange?.(star)}
            className={`w-6 h-6 transition-colors ${readOnly ? "cursor-default" : "cursor-pointer hover:scale-110"}`}
          >
            <Star
              className={`w-5 h-5 transition-colors ${
                filled ? "fill-amber-400 text-amber-400" : "text-ink-300 dark:text-ink-600"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}

/* ── Period Form modal ───────────────────────────────────────────────────── */

function PeriodFormModal({
  period,
  onClose,
}: {
  period?: AppraisalPeriod | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!period;

  const [form, setForm] = useState<AppraisalPeriodPayload>({
    title:               period?.title ?? "",
    period_type:         period?.period_type ?? "Annual",
    year:                period?.year ?? new Date().getFullYear(),
    start_date:          period?.start_date ?? "",
    end_date:            period?.end_date ?? "",
    submission_deadline: period?.submission_deadline ?? "",
    status:              period?.status ?? "Draft",
    description:         period?.description ?? "",
  });

  const mut = useMutation({
    mutationFn: () =>
      isEdit
        ? hrService.updateAppraisalPeriod(period!.id, form)
        : hrService.createAppraisalPeriod(form),
    onSuccess: () => {
      toast.success(isEdit ? "Period updated." : "Period created.");
      qc.invalidateQueries({ queryKey: ["appraisal-periods"] });
      qc.invalidateQueries({ queryKey: ["appraisal-stats"] });
      onClose();
    },
    onError: () => toast.error("Failed to save period."),
  });

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
        <div className="bg-white dark:bg-ink-800 rounded-xl shadow-xl w-full max-w-lg">
          <div className="flex items-center justify-between px-6 py-4 border-b border-ink-100 dark:border-ink-700">
            <h2 className="font-semibold text-ink-800 dark:text-ink-100">
              {isEdit ? "Edit Period" : "New Appraisal Period"}
            </h2>
            <button onClick={onClose} className="text-ink-400 hover:text-ink-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            <div>
              <label className="text-xs font-medium text-ink-600 dark:text-ink-400 uppercase tracking-wide">Title *</label>
              <input
                className="mt-1 input w-full"
                placeholder="e.g. Annual Appraisal 2025"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-ink-600 dark:text-ink-400 uppercase tracking-wide">Type *</label>
                <select
                  className="mt-1 input w-full"
                  value={form.period_type}
                  onChange={(e) => setForm((f) => ({ ...f, period_type: e.target.value as never }))}
                >
                  {["Annual","Semi-Annual","Quarterly","Custom"].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-ink-600 dark:text-ink-400 uppercase tracking-wide">Year *</label>
                <input
                  type="number"
                  className="mt-1 input w-full"
                  value={form.year}
                  onChange={(e) => setForm((f) => ({ ...f, year: parseInt(e.target.value) }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-ink-600 dark:text-ink-400 uppercase tracking-wide">Start Date *</label>
                <input
                  type="date"
                  className="mt-1 input w-full"
                  value={form.start_date}
                  onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-ink-600 dark:text-ink-400 uppercase tracking-wide">End Date *</label>
                <input
                  type="date"
                  className="mt-1 input w-full"
                  value={form.end_date}
                  onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-ink-600 dark:text-ink-400 uppercase tracking-wide">Submission Deadline</label>
              <input
                type="date"
                className="mt-1 input w-full"
                value={form.submission_deadline ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, submission_deadline: e.target.value || null }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-600 dark:text-ink-400 uppercase tracking-wide">Status</label>
              <select
                className="mt-1 input w-full"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as AppraisalPeriodStatus }))}
              >
                {(["Draft","Active","Closed"] as const).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-ink-600 dark:text-ink-400 uppercase tracking-wide">Description</label>
              <textarea
                className="mt-1 input w-full resize-none"
                rows={2}
                value={form.description ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value || null }))}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 px-6 py-4 border-t border-ink-100 dark:border-ink-700">
            <button className="btn-ghost px-4 py-2 rounded-lg text-sm" onClick={onClose}>Cancel</button>
            <button
              className="btn-primary px-5 py-2 rounded-lg text-sm flex items-center gap-2"
              onClick={() => mut.mutate()}
              disabled={mut.isPending || !form.title || !form.start_date || !form.end_date}
            >
              {mut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              <Save className="w-4 h-4" />
              {isEdit ? "Update" : "Create"}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

/* ── Criterion form row ──────────────────────────────────────────────────── */

function CriteriaManager({ period }: { period: AppraisalPeriod }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<AppraisalCriterionPayload>({ name: "", description: "", weight: 1, max_score: 5, sort_order: 0 });

  const criteriaQ = useQuery({
    queryKey: ["appraisal-criteria", period.id],
    queryFn: ({ signal }) => hrService.listCriteria(period.id, signal),
    staleTime: 30_000,
  });
  const criteria: AppraisalCriterion[] = criteriaQ.data?.data ?? [];

  const addMut = useMutation({
    mutationFn: () => hrService.addCriterion(period.id, form),
    onSuccess: () => { toast.success("Criterion added."); qc.invalidateQueries({ queryKey: ["appraisal-criteria", period.id] }); qc.invalidateQueries({ queryKey: ["appraisal-periods"] }); resetForm(); },
    onError: () => toast.error("Failed to add criterion."),
  });
  const updMut = useMutation({
    mutationFn: () => hrService.updateCriterion(period.id, editingId!, form),
    onSuccess: () => { toast.success("Criterion updated."); qc.invalidateQueries({ queryKey: ["appraisal-criteria", period.id] }); resetForm(); },
    onError: () => toast.error("Failed to update criterion."),
  });
  const delMut = useMutation({
    mutationFn: (cid: number) => hrService.deleteCriterion(period.id, cid),
    onSuccess: () => { toast.success("Criterion removed."); qc.invalidateQueries({ queryKey: ["appraisal-criteria", period.id] }); qc.invalidateQueries({ queryKey: ["appraisal-periods"] }); },
    onError: () => toast.error("Failed to delete criterion."),
  });

  const resetForm = () => { setShowForm(false); setEditingId(null); setForm({ name: "", description: "", weight: 1, max_score: 5, sort_order: 0 }); };

  const startEdit = (c: AppraisalCriterion) => {
    setEditingId(c.id);
    setForm({ name: c.name, description: c.description, weight: c.weight, max_score: c.max_score, sort_order: c.sort_order });
    setShowForm(true);
  };

  return (
    <div className="space-y-3">
      {criteriaQ.isLoading && <div className="flex items-center gap-2 text-ink-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>}

      {criteria.length === 0 && !criteriaQ.isLoading && (
        <p className="text-sm text-ink-400 italic">No KPI criteria yet. Add some below.</p>
      )}

      {criteria.map((c, idx) => (
        <div key={c.id} className="flex items-start gap-3 p-3 bg-ink-50 dark:bg-ink-700/40 rounded-lg">
          <span className="text-xs text-ink-400 mt-0.5 w-5 shrink-0 text-right">{idx + 1}.</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ink-800 dark:text-ink-100">{c.name}</p>
            {c.description && <p className="text-xs text-ink-500 mt-0.5">{c.description}</p>}
            <div className="flex gap-3 mt-1 text-xs text-ink-400">
              <span>Weight: <strong>{c.weight}</strong></span>
              <span>Max score: <strong>{c.max_score}</strong></span>
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            <button onClick={() => startEdit(c)} className="p-1.5 rounded hover:bg-ink-200 dark:hover:bg-ink-600 text-ink-400 hover:text-blue-600 transition-colors">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => { if (confirm(`Delete criterion "${c.name}"?`)) delMut.mutate(c.id); }}
              className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-ink-400 hover:text-red-600 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}

      {showForm ? (
        <div className="border border-blue-200 dark:border-blue-700 rounded-lg p-4 space-y-3 bg-blue-50/30 dark:bg-blue-900/10">
          <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide">
            {editingId ? "Edit Criterion" : "Add Criterion"}
          </p>
          <input
            className="input w-full"
            placeholder="KPI name *"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <input
            className="input w-full"
            placeholder="Description (optional)"
            value={form.description ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value || null }))}
          />
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-ink-500">Weight</label>
              <input type="number" step="0.5" min="0.5" className="mt-0.5 input w-full" value={form.weight} onChange={(e) => setForm((f) => ({ ...f, weight: parseFloat(e.target.value) }))} />
            </div>
            <div>
              <label className="text-xs text-ink-500">Max Score</label>
              <input type="number" min="2" max="10" className="mt-0.5 input w-full" value={form.max_score} onChange={(e) => setForm((f) => ({ ...f, max_score: parseInt(e.target.value) }))} />
            </div>
            <div>
              <label className="text-xs text-ink-500">Sort Order</label>
              <input type="number" min="0" className="mt-0.5 input w-full" value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value) }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              className="btn-primary px-4 py-1.5 rounded-lg text-sm flex items-center gap-1.5"
              onClick={() => editingId ? updMut.mutate() : addMut.mutate()}
              disabled={!form.name || addMut.isPending || updMut.isPending}
            >
              {(addMut.isPending || updMut.isPending) && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <Save className="w-3.5 h-3.5" /> Save
            </button>
            <button className="btn-ghost px-4 py-1.5 rounded-lg text-sm" onClick={resetForm}>Cancel</button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          <Plus className="w-4 h-4" /> Add Criterion
        </button>
      )}
    </div>
  );
}

/* ── Appraisal detail modal ──────────────────────────────────────────────── */

type ReviewTab = "overview" | "self" | "supervisor" | "hr";

function AppraisalModal({
  appraisal: initial,
  canManage,
  onClose,
}: {
  appraisal: Appraisal;
  canManage: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<ReviewTab>("overview");

  const appraisalQ = useQuery({
    queryKey: ["appraisal-detail", initial.id],
    queryFn: ({ signal }) => hrService.showAppraisal(initial.id, signal),
    initialData: { data: initial } as never,
    staleTime: 10_000,
  });
  const appraisal: Appraisal = appraisalQ.data?.data ?? initial;

  // Build mutable rating maps
  const [selfRatings, setSelfRatings] = useState<Record<number, { score: number | null; comment: string }>>(() => {
    const m: Record<number, { score: number | null; comment: string }> = {};
    (initial.ratings ?? []).forEach((r) => { m[r.criterion_id] = { score: r.self_score, comment: r.self_comment ?? "" }; });
    return m;
  });
  const [selfComment, setSelfComment] = useState(initial.self_comment ?? "");
  const [supRatings, setSupRatings] = useState<Record<number, { score: number | null; comment: string }>>(() => {
    const m: Record<number, { score: number | null; comment: string }> = {};
    (initial.ratings ?? []).forEach((r) => { m[r.criterion_id] = { score: r.supervisor_score, comment: r.supervisor_comment ?? "" }; });
    return m;
  });
  const [supComment, setSupComment] = useState(initial.supervisor_comment ?? "");
  const [hrComment, setHrComment] = useState(initial.hr_comment ?? "");
  const [finalScore, setFinalScore] = useState<string>(String(initial.final_score ?? ""));

  const selfMut = useMutation({
    mutationFn: (submit: boolean) =>
      hrService.saveSelfAssessment(appraisal.id, {
        self_comment: selfComment || null,
        ratings: Object.entries(selfRatings).map(([cid, r]) => ({
          criterion_id: parseInt(cid),
          self_score: r.score,
          self_comment: r.comment || null,
        })),
        submit,
      }),
    onSuccess: () => {
      toast.success("Self-assessment saved.");
      qc.invalidateQueries({ queryKey: ["appraisal-detail", appraisal.id] });
      qc.invalidateQueries({ queryKey: ["appraisals"] });
    },
    onError: () => toast.error("Failed to save."),
  });

  const supMut = useMutation({
    mutationFn: (submit: boolean) =>
      hrService.saveSupervisorReview(appraisal.id, {
        supervisor_comment: supComment || null,
        ratings: Object.entries(supRatings).map(([cid, r]) => ({
          criterion_id: parseInt(cid),
          supervisor_score: r.score,
          supervisor_comment: r.comment || null,
        })),
        submit,
      }),
    onSuccess: () => {
      toast.success("Supervisor review saved.");
      qc.invalidateQueries({ queryKey: ["appraisal-detail", appraisal.id] });
      qc.invalidateQueries({ queryKey: ["appraisals"] });
    },
    onError: () => toast.error("Failed to save."),
  });

  const hrMut = useMutation({
    mutationFn: (complete: boolean) =>
      hrService.saveHrReview(appraisal.id, {
        hr_comment:  hrComment || null,
        final_score: finalScore ? parseFloat(finalScore) : undefined,
        complete,
      }),
    onSuccess: () => {
      toast.success("HR review saved.");
      qc.invalidateQueries({ queryKey: ["appraisal-detail", appraisal.id] });
      qc.invalidateQueries({ queryKey: ["appraisals"] });
    },
    onError: () => toast.error("Failed to save."),
  });

  const ratings: AppraisalRating[] = appraisal.ratings ?? [];

  const TABS: { key: ReviewTab; label: string }[] = [
    { key: "overview",   label: "Overview" },
    { key: "self",       label: "Self-Assessment" },
    { key: "supervisor", label: "Supervisor Review" },
    { key: "hr",         label: "HR Review" },
  ];

  const canSelf       = canManage && appraisal.status === "Self-Review";
  const canSupervisor = canManage && appraisal.status === "Supervisor-Review";
  const canHr         = canManage && (appraisal.status === "HR-Review" || appraisal.status === "Completed");

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-12 pb-4 overflow-y-auto">
        <div className="bg-white dark:bg-ink-800 rounded-xl shadow-xl w-full max-w-3xl">
          {/* Header */}
          <div className="flex items-start justify-between px-6 py-4 border-b border-ink-100 dark:border-ink-700">
            <div>
              <h2 className="font-semibold text-ink-800 dark:text-ink-100 text-lg">{appraisal.employee_name}</h2>
              <p className="text-sm text-ink-500 mt-0.5">{appraisal.position} · {appraisal.department} · {appraisal.period_title}</p>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge status={appraisal.status} />
              <button onClick={onClose} className="text-ink-400 hover:text-ink-600">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-ink-100 dark:border-ink-700 px-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  tab === t.key
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-ink-500 hover:text-ink-800 dark:hover:text-ink-200"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-6">
            {/* Overview tab */}
            {tab === "overview" && (
              <div className="space-y-5">
                {/* Score summary */}
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: "Self Score",       val: appraisal.self_total_score,       color: "text-blue-600" },
                    { label: "Supervisor Score",  val: appraisal.supervisor_total_score, color: "text-amber-600" },
                    { label: "Final Score",       val: appraisal.final_score,            color: "text-green-600" },
                  ].map(({ label, val, color }) => (
                    <div key={label} className="text-center p-4 bg-ink-50 dark:bg-ink-700/40 rounded-xl">
                      <p className="text-xs text-ink-500 mb-1">{label}</p>
                      <p className={`text-2xl font-bold tabular-nums ${color}`}>
                        {val != null ? val.toFixed(2) : "—"}
                      </p>
                      {val != null && <p className="text-xs text-ink-400 mt-0.5">/ 5.00</p>}
                    </div>
                  ))}
                </div>

                {appraisal.final_grade && (
                  <div className={`flex items-center gap-2 px-4 py-3 rounded-xl ${GRADE_CONFIG[appraisal.final_grade]?.bg ?? "bg-ink-50"}`}>
                    <Award className={`w-5 h-5 ${GRADE_CONFIG[appraisal.final_grade]?.color ?? "text-ink-500"}`} />
                    <span className={`font-semibold ${GRADE_CONFIG[appraisal.final_grade]?.color ?? "text-ink-500"}`}>
                      Final Grade: {appraisal.final_grade}
                    </span>
                  </div>
                )}

                {/* Timeline */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide">Timeline</p>
                  {[
                    { label: "Self-assessment submitted", date: appraisal.submitted_at },
                    { label: "Supervisor reviewed",       date: appraisal.supervisor_reviewed_at },
                    { label: "Completed",                 date: appraisal.completed_at },
                  ].map(({ label, date }) => (
                    <div key={label} className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${date ? "bg-green-500" : "bg-ink-200 dark:bg-ink-600"}`} />
                      <span className="text-sm text-ink-700 dark:text-ink-300 flex-1">{label}</span>
                      <span className="text-xs text-ink-400">{date ? new Date(date).toLocaleDateString() : "Pending"}</span>
                    </div>
                  ))}
                </div>

                {/* KPI summary table */}
                {ratings.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">KPI Scores</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-ink-500 border-b border-ink-100 dark:border-ink-700">
                            <th className="text-left py-2 pr-4 font-medium">Criterion</th>
                            <th className="text-center py-2 px-3 font-medium">Self</th>
                            <th className="text-center py-2 px-3 font-medium">Supervisor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ratings.map((r) => (
                            <tr key={r.criterion_id} className="border-b border-ink-50 dark:border-ink-700/50 last:border-0">
                              <td className="py-2 pr-4 text-ink-700 dark:text-ink-300">{r.criterion_name}</td>
                              <td className="py-2 px-3 text-center"><ScoreBadge score={r.self_score} max={r.max_score} /></td>
                              <td className="py-2 px-3 text-center"><ScoreBadge score={r.supervisor_score} max={r.max_score} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Self-Assessment tab */}
            {tab === "self" && (
              <div className="space-y-5">
                {!canSelf && appraisal.status === "Draft" && canManage && (
                  <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-sm text-amber-700 dark:text-amber-300">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    This appraisal is in Draft — no self-assessment yet.
                  </div>
                )}
                {ratings.map((r) => (
                  <div key={r.criterion_id} className="p-4 bg-ink-50 dark:bg-ink-700/40 rounded-xl space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-ink-800 dark:text-ink-100 text-sm">{r.criterion_name}</p>
                        {r.criterion_description && <p className="text-xs text-ink-500 mt-0.5">{r.criterion_description}</p>}
                      </div>
                      <span className="text-xs text-ink-400 shrink-0">Max {r.max_score}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <StarRating
                        value={canSelf ? (selfRatings[r.criterion_id]?.score ?? null) : r.self_score}
                        max={r.max_score}
                        readOnly={!canSelf}
                        onChange={(v) => setSelfRatings((prev) => ({ ...prev, [r.criterion_id]: { ...prev[r.criterion_id], score: v } }))}
                      />
                      <span className="text-xs text-ink-400">
                        {(canSelf ? selfRatings[r.criterion_id]?.score : r.self_score) ?? "—"} / {r.max_score}
                      </span>
                    </div>
                    {canSelf ? (
                      <input
                        className="input w-full text-sm"
                        placeholder="Comment on this criterion…"
                        value={selfRatings[r.criterion_id]?.comment ?? ""}
                        onChange={(e) => setSelfRatings((prev) => ({ ...prev, [r.criterion_id]: { ...prev[r.criterion_id], comment: e.target.value } }))}
                      />
                    ) : (
                      r.self_comment && <p className="text-sm text-ink-600 dark:text-ink-400 italic">"{r.self_comment}"</p>
                    )}
                  </div>
                ))}
                {canSelf ? (
                  <>
                    <div>
                      <label className="text-xs font-medium text-ink-600 dark:text-ink-400 uppercase tracking-wide">Overall Self-Assessment Comment</label>
                      <textarea
                        className="mt-1 input w-full resize-none"
                        rows={3}
                        placeholder="Summarise your achievements and reflections…"
                        value={selfComment}
                        onChange={(e) => setSelfComment(e.target.value)}
                      />
                    </div>
                    <div className="flex gap-3">
                      <button
                        className="btn-ghost px-4 py-2 rounded-lg text-sm flex items-center gap-2"
                        onClick={() => selfMut.mutate(false)}
                        disabled={selfMut.isPending}
                      >
                        {selfMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                        <Save className="w-4 h-4" /> Save Draft
                      </button>
                      <button
                        className="btn-primary px-5 py-2 rounded-lg text-sm flex items-center gap-2"
                        onClick={() => selfMut.mutate(true)}
                        disabled={selfMut.isPending}
                      >
                        {selfMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                        <Send className="w-4 h-4" /> Submit to Supervisor
                      </button>
                    </div>
                  </>
                ) : (
                  appraisal.self_comment && (
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                      <p className="text-xs font-semibold text-blue-600 mb-1">Overall Self-Assessment</p>
                      <p className="text-sm text-ink-700 dark:text-ink-300">{appraisal.self_comment}</p>
                    </div>
                  )
                )}
              </div>
            )}

            {/* Supervisor Review tab */}
            {tab === "supervisor" && (
              <div className="space-y-5">
                {!canSupervisor && (
                  <div className="flex items-center gap-2 p-3 bg-ink-50 dark:bg-ink-700/30 rounded-lg text-sm text-ink-500">
                    <Clock className="w-4 h-4 shrink-0" />
                    {appraisal.status === "Self-Review" || appraisal.status === "Draft"
                      ? "Awaiting self-assessment submission."
                      : "Supervisor review already submitted."}
                  </div>
                )}
                {ratings.map((r) => (
                  <div key={r.criterion_id} className="p-4 bg-ink-50 dark:bg-ink-700/40 rounded-xl space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-ink-800 dark:text-ink-100 text-sm">{r.criterion_name}</p>
                        {r.criterion_description && <p className="text-xs text-ink-500 mt-0.5">{r.criterion_description}</p>}
                      </div>
                      <div className="text-right text-xs text-ink-400">
                        Self: {r.self_score ?? "—"}/{r.max_score}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-ink-500 mb-1">Supervisor Rating:</p>
                      <div className="flex items-center gap-4">
                        <StarRating
                          value={canSupervisor ? (supRatings[r.criterion_id]?.score ?? null) : r.supervisor_score}
                          max={r.max_score}
                          readOnly={!canSupervisor}
                          onChange={(v) => setSupRatings((prev) => ({ ...prev, [r.criterion_id]: { ...prev[r.criterion_id], score: v } }))}
                        />
                        <span className="text-xs text-ink-400">
                          {(canSupervisor ? supRatings[r.criterion_id]?.score : r.supervisor_score) ?? "—"} / {r.max_score}
                        </span>
                      </div>
                    </div>
                    {canSupervisor ? (
                      <input
                        className="input w-full text-sm"
                        placeholder="Supervisor comment on this criterion…"
                        value={supRatings[r.criterion_id]?.comment ?? ""}
                        onChange={(e) => setSupRatings((prev) => ({ ...prev, [r.criterion_id]: { ...prev[r.criterion_id], comment: e.target.value } }))}
                      />
                    ) : (
                      r.supervisor_comment && <p className="text-sm text-ink-600 dark:text-ink-400 italic">"{r.supervisor_comment}"</p>
                    )}
                  </div>
                ))}
                {canSupervisor && (
                  <>
                    <div>
                      <label className="text-xs font-medium text-ink-600 dark:text-ink-400 uppercase tracking-wide">Overall Supervisor Comment</label>
                      <textarea
                        className="mt-1 input w-full resize-none"
                        rows={3}
                        placeholder="Overall performance summary…"
                        value={supComment}
                        onChange={(e) => setSupComment(e.target.value)}
                      />
                    </div>
                    <div className="flex gap-3">
                      <button
                        className="btn-ghost px-4 py-2 rounded-lg text-sm flex items-center gap-2"
                        onClick={() => supMut.mutate(false)}
                        disabled={supMut.isPending}
                      >
                        {supMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                        <Save className="w-4 h-4" /> Save Draft
                      </button>
                      <button
                        className="btn-primary px-5 py-2 rounded-lg text-sm flex items-center gap-2"
                        onClick={() => supMut.mutate(true)}
                        disabled={supMut.isPending}
                      >
                        {supMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                        <Send className="w-4 h-4" /> Submit to HR
                      </button>
                    </div>
                  </>
                )}
                {!canSupervisor && appraisal.supervisor_comment && (
                  <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl">
                    <p className="text-xs font-semibold text-amber-600 mb-1">Overall Supervisor Review</p>
                    <p className="text-sm text-ink-700 dark:text-ink-300">{appraisal.supervisor_comment}</p>
                  </div>
                )}
              </div>
            )}

            {/* HR Review tab */}
            {tab === "hr" && (
              <div className="space-y-5">
                {!canHr && (
                  <div className="flex items-center gap-2 p-3 bg-ink-50 dark:bg-ink-700/30 rounded-lg text-sm text-ink-500">
                    <Clock className="w-4 h-4 shrink-0" />
                    Awaiting supervisor review completion.
                  </div>
                )}
                {/* Scores summary */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-center">
                    <p className="text-xs text-blue-500 mb-1">Self Score</p>
                    <p className="text-xl font-bold text-blue-700">{appraisal.self_total_score?.toFixed(2) ?? "—"}</p>
                  </div>
                  <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-center">
                    <p className="text-xs text-amber-500 mb-1">Supervisor Score</p>
                    <p className="text-xl font-bold text-amber-700">{appraisal.supervisor_total_score?.toFixed(2) ?? "—"}</p>
                  </div>
                </div>
                {canHr && (
                  <>
                    <div>
                      <label className="text-xs font-medium text-ink-600 dark:text-ink-400 uppercase tracking-wide">Final Score Override</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="5"
                        className="mt-1 input w-full"
                        placeholder={`Supervisor score: ${appraisal.supervisor_total_score ?? "—"}`}
                        value={finalScore}
                        onChange={(e) => setFinalScore(e.target.value)}
                      />
                      <p className="text-xs text-ink-400 mt-1">Leave blank to use supervisor score automatically.</p>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-ink-600 dark:text-ink-400 uppercase tracking-wide">HR Comment</label>
                      <textarea
                        className="mt-1 input w-full resize-none"
                        rows={4}
                        placeholder="HR final assessment, recommendations, development plan…"
                        value={hrComment}
                        onChange={(e) => setHrComment(e.target.value)}
                      />
                    </div>
                    <div className="flex gap-3">
                      <button
                        className="btn-ghost px-4 py-2 rounded-lg text-sm flex items-center gap-2"
                        onClick={() => hrMut.mutate(false)}
                        disabled={hrMut.isPending}
                      >
                        {hrMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                        <Save className="w-4 h-4" /> Save
                      </button>
                      <button
                        className="btn-primary px-5 py-2 rounded-lg text-sm flex items-center gap-2"
                        onClick={() => hrMut.mutate(true)}
                        disabled={hrMut.isPending || appraisal.status === "Completed"}
                      >
                        {hrMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                        <CheckCircle2 className="w-4 h-4" /> Mark Complete
                      </button>
                    </div>
                  </>
                )}
                {appraisal.hr_comment && (
                  <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl">
                    <p className="text-xs font-semibold text-purple-600 mb-1">HR Comment</p>
                    <p className="text-sm text-ink-700 dark:text-ink-300">{appraisal.hr_comment}</p>
                  </div>
                )}
                {appraisal.final_score != null && (
                  <div className={`flex items-center gap-3 p-4 rounded-xl ${GRADE_CONFIG[appraisal.final_grade ?? ""]?.bg ?? "bg-ink-50"}`}>
                    <Award className={`w-6 h-6 ${GRADE_CONFIG[appraisal.final_grade ?? ""]?.color ?? "text-ink-500"}`} />
                    <div>
                      <p className={`font-bold text-lg ${GRADE_CONFIG[appraisal.final_grade ?? ""]?.color ?? "text-ink-700"}`}>
                        {appraisal.final_grade ?? "—"}
                      </p>
                      <p className="text-xs text-ink-500">Final Score: {appraisal.final_score.toFixed(2)} / 5.00</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
 * Main Page
 * ════════════════════════════════════════════════════════════════════════ */

type MainTab = "periods" | "appraisals";

export default function AppraisalPage() {
  const canManage = usePermission(PERMISSIONS.MANAGE_APPRAISALS);

  const qc = useQueryClient();
  const [mainTab, setMainTab] = useState<MainTab>("periods");
  const [expandedPeriodId, setExpandedPeriodId] = useState<number | null>(null);
  const [periodModal, setPeriodModal] = useState<{ open: boolean; period?: AppraisalPeriod | null }>({ open: false });
  const [appraisalModal, setAppraisalModal] = useState<Appraisal | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterPeriod, setFilterPeriod] = useState<string>("");

  /* queries */
  const statsQ = useQuery({
    queryKey: ["appraisal-stats"],
    queryFn: ({ signal }) => hrService.appraisalStats(signal),
    staleTime: 30_000,
  });
  const periodsQ = useQuery({
    queryKey: ["appraisal-periods"],
    queryFn: ({ signal }) => hrService.listAppraisalPeriods({}, signal),
    staleTime: 30_000,
  });
  const appraisalsQ = useQuery({
    queryKey: ["appraisals", filterStatus, filterPeriod],
    queryFn: ({ signal }) =>
      hrService.listAppraisals(
        {
          status:    filterStatus  || undefined,
          period_id: filterPeriod ? parseInt(filterPeriod) : undefined,
        },
        signal
      ),
    enabled: mainTab === "appraisals",
    staleTime: 20_000,
  });

  const stats = statsQ.data?.data;
  const periods: AppraisalPeriod[] = periodsQ.data?.data ?? [];
  const appraisals: Appraisal[] = appraisalsQ.data?.data ?? [];

  /* mutations */
  const deletePeriodMut = useMutation({
    mutationFn: (id: number) => hrService.deleteAppraisalPeriod(id),
    onSuccess: () => { toast.success("Period deleted."); qc.invalidateQueries({ queryKey: ["appraisal-periods"] }); qc.invalidateQueries({ queryKey: ["appraisal-stats"] }); },
    onError: (err: Error) => toast.error(err.message ?? "Cannot delete period."),
  });
  const setPeriodStatusMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: "Draft" | "Active" | "Closed" }) =>
      hrService.setAppraisalPeriodStatus(id, status),
    onSuccess: () => { toast.success("Status updated."); qc.invalidateQueries({ queryKey: ["appraisal-periods"] }); },
    onError: () => toast.error("Failed to update status."),
  });
  const initiateMut = useMutation({
    mutationFn: (id: number) => hrService.initiateAppraisals(id),
    onSuccess: (res) => {
      const d = (res as { data: { created: number; skipped: number } }).data;
      toast.success(`Initiated: ${d.created} created, ${d.skipped} skipped.`);
      qc.invalidateQueries({ queryKey: ["appraisal-periods"] });
      qc.invalidateQueries({ queryKey: ["appraisals"] });
      qc.invalidateQueries({ queryKey: ["appraisal-stats"] });
    },
    onError: () => toast.error("Failed to initiate appraisals."),
  });

  const openAppraisal = useCallback(async (a: Appraisal) => {
    const res = await hrService.showAppraisal(a.id);
    setAppraisalModal(res.data);
  }, []);

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-50">Employee Appraisals</h1>
          <p className="text-sm text-ink-500 mt-0.5">Manage performance appraisal cycles, KPIs, and staff reviews</p>
        </div>
        {canManage && (
          <button
            className="btn-primary flex items-center gap-2 px-4 py-2 rounded-lg text-sm"
            onClick={() => setPeriodModal({ open: true, period: null })}
          >
            <Plus className="w-4 h-4" /> New Period
          </button>
        )}
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: "Periods",    value: stats?.periods  ?? "—", icon: ClipboardList, color: "text-blue-600",   bg: "bg-blue-50 dark:bg-blue-900/20" },
          { label: "Active",     value: stats?.active   ?? "—", icon: TrendingUp,    color: "text-green-600",  bg: "bg-green-50 dark:bg-green-900/20" },
          { label: "Total",      value: stats?.total    ?? "—", icon: Users,         color: "text-ink-600",    bg: "bg-ink-50 dark:bg-ink-700/40" },
          { label: "Completed",  value: stats?.completed ?? "—", icon: CheckCircle2,  color: "text-green-600",  bg: "bg-green-50 dark:bg-green-900/20" },
          { label: "In Review",  value: stats?.inReview  ?? "—", icon: BarChart3,     color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-900/20" },
          { label: "Pending",    value: stats?.pending   ?? "—", icon: Clock,         color: "text-amber-600",  bg: "bg-amber-50 dark:bg-amber-900/20" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className={`card p-4 flex flex-col items-center gap-1 ${bg}`}>
            <Icon className={`w-5 h-5 ${color}`} />
            <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
            <p className="text-xs text-ink-500">{label}</p>
          </div>
        ))}
      </div>

      {/* Main tab switcher */}
      <div className="flex border-b border-ink-100 dark:border-ink-700">
        {([
          { key: "periods",    label: "Appraisal Periods",   icon: ClipboardList },
          { key: "appraisals", label: "Employee Appraisals", icon: Users },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setMainTab(key)}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              mainTab === key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-ink-500 hover:text-ink-800 dark:hover:text-ink-200"
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {/* ── PERIODS tab ── */}
      {mainTab === "periods" && (
        <div className="space-y-4">
          {periodsQ.isLoading && (
            <div className="card p-10 flex items-center justify-center gap-2 text-ink-400">
              <Loader2 className="w-5 h-5 animate-spin" /> Loading periods…
            </div>
          )}
          {!periodsQ.isLoading && periods.length === 0 && (
            <div className="card p-12 flex flex-col items-center gap-3 text-center">
              <ClipboardList className="w-10 h-10 text-ink-300 dark:text-ink-600" />
              <p className="text-ink-500">No appraisal periods yet.</p>
              {canManage && (
                <button
                  className="btn-primary flex items-center gap-2 px-4 py-2 rounded-lg text-sm mt-2"
                  onClick={() => setPeriodModal({ open: true, period: null })}
                >
                  <Plus className="w-4 h-4" /> Create First Period
                </button>
              )}
            </div>
          )}
          {periods.map((p) => {
            const expanded = expandedPeriodId === p.id;
            const sc = PERIOD_STATUS_CONFIG[p.status];
            return (
              <div key={p.id} className="card overflow-hidden">
                {/* Period header row */}
                <div
                  className="flex items-center gap-4 p-4 cursor-pointer hover:bg-ink-50 dark:hover:bg-ink-700/30 transition-colors"
                  onClick={() => setExpandedPeriodId(expanded ? null : p.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="font-semibold text-ink-800 dark:text-ink-100">{p.title}</h3>
                      <span className={`flex items-center gap-1 text-xs font-medium ${sc.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} /> {sc.label}
                      </span>
                      <span className="text-xs text-ink-400 bg-ink-100 dark:bg-ink-700 px-2 py-0.5 rounded-full">
                        {p.period_type} · {p.year}
                      </span>
                    </div>
                    <div className="flex gap-4 mt-1 text-xs text-ink-400">
                      <span>{new Date(p.start_date).toLocaleDateString()} – {new Date(p.end_date).toLocaleDateString()}</span>
                      <span className="flex items-center gap-1"><Star className="w-3 h-3" /> {p.criteria_count} criteria</span>
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {p.appraisal_count} appraisals</span>
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {p.status === "Draft" && (
                        <button
                          className="text-xs px-3 py-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-300 font-medium transition-colors"
                          onClick={() => setPeriodStatusMut.mutate({ id: p.id, status: "Active" })}
                          disabled={setPeriodStatusMut.isPending}
                        >Activate</button>
                      )}
                      {p.status === "Active" && (
                        <button
                          className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300 font-medium transition-colors"
                          onClick={() => setPeriodStatusMut.mutate({ id: p.id, status: "Closed" })}
                          disabled={setPeriodStatusMut.isPending}
                        >Close</button>
                      )}
                      <button
                        className="p-1.5 rounded hover:bg-ink-100 dark:hover:bg-ink-700 text-ink-400 hover:text-blue-600 transition-colors"
                        onClick={() => setPeriodModal({ open: true, period: p })}
                        title="Edit period"
                      ><Pencil className="w-3.5 h-3.5" /></button>
                      <button
                        className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-ink-400 hover:text-red-600 transition-colors"
                        onClick={() => { if (confirm(`Delete "${p.title}"?`)) deletePeriodMut.mutate(p.id); }}
                        title="Delete period"
                      ><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  )}
                  <div className="shrink-0 text-ink-400">
                    {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </div>

                {/* Expanded section */}
                {expanded && (
                  <div className="border-t border-ink-100 dark:border-ink-700 p-4 space-y-5">
                    {p.description && (
                      <p className="text-sm text-ink-600 dark:text-ink-400">{p.description}</p>
                    )}
                    {canManage && (
                      <div className="flex items-center gap-3">
                        <button
                          className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
                          onClick={() => initiateMut.mutate(p.id)}
                          disabled={initiateMut.isPending}
                        >
                          {initiateMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                          Initiate / Sync Appraisals
                        </button>
                        <button
                          className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg border border-ink-200 dark:border-ink-600 hover:bg-ink-50 dark:hover:bg-ink-700 text-ink-700 dark:text-ink-300 transition-colors"
                          onClick={() => { setFilterPeriod(String(p.id)); setMainTab("appraisals"); }}
                        >
                          <Users className="w-4 h-4" /> View Appraisals
                        </button>
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                        <Settings className="w-3.5 h-3.5" /> KPI Criteria ({p.criteria_count})
                      </p>
                      {canManage ? (
                        <CriteriaManager period={p} />
                      ) : (
                        <CriterionReadOnly periodId={p.id} />
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── APPRAISALS tab ── */}
      {mainTab === "appraisals" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="card p-4 flex flex-wrap gap-3 items-center">
            <select
              className="input text-sm py-1.5 min-w-[160px]"
              value={filterPeriod}
              onChange={(e) => setFilterPeriod(e.target.value)}
            >
              <option value="">All Periods</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
            <select
              className="input text-sm py-1.5 min-w-[160px]"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="">All Statuses</option>
              {(["Draft","Self-Review","Supervisor-Review","HR-Review","Completed"] as const).map((s) => (
                <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
              ))}
            </select>
            {(filterPeriod || filterStatus) && (
              <button
                className="text-xs text-ink-500 hover:text-ink-700 dark:hover:text-ink-300 flex items-center gap-1"
                onClick={() => { setFilterPeriod(""); setFilterStatus(""); }}
              >
                <X className="w-3.5 h-3.5" /> Clear
              </button>
            )}
            <span className="ml-auto text-xs text-ink-400">{appraisals.length} appraisals</span>
          </div>

          {appraisalsQ.isLoading && (
            <div className="card p-10 flex items-center justify-center gap-2 text-ink-400">
              <Loader2 className="w-5 h-5 animate-spin" /> Loading…
            </div>
          )}

          {!appraisalsQ.isLoading && appraisals.length === 0 && (
            <div className="card p-12 text-center text-ink-400">
              <Users className="w-10 h-10 mx-auto mb-3 text-ink-300" />
              No appraisals found for the selected filters.
            </div>
          )}

          {!appraisalsQ.isLoading && appraisals.length > 0 && (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b border-ink-100 dark:border-ink-700">
                  <tr className="text-xs text-ink-500 uppercase tracking-wide">
                    <th className="text-left px-4 py-3 font-medium">Employee</th>
                    <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Period</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-center px-4 py-3 font-medium hidden sm:table-cell">Self</th>
                    <th className="text-center px-4 py-3 font-medium hidden sm:table-cell">Supervisor</th>
                    <th className="text-center px-4 py-3 font-medium hidden lg:table-cell">Final</th>
                    <th className="text-center px-4 py-3 font-medium hidden lg:table-cell">Grade</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {appraisals.map((a) => {
                    const grade = a.final_grade ? GRADE_CONFIG[a.final_grade] : null;
                    return (
                      <tr
                        key={a.id}
                        className="border-b border-ink-50 dark:border-ink-700/50 last:border-0 hover:bg-ink-50 dark:hover:bg-ink-700/20 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-ink-800 dark:text-ink-100">{a.employee_name}</p>
                          <p className="text-xs text-ink-400 mt-0.5">{a.position}</p>
                        </td>
                        <td className="px-4 py-3 text-ink-600 dark:text-ink-400 hidden md:table-cell">
                          {a.period_title}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={a.status} />
                        </td>
                        <td className="px-4 py-3 text-center hidden sm:table-cell">
                          <ScoreBadge score={a.self_total_score} />
                        </td>
                        <td className="px-4 py-3 text-center hidden sm:table-cell">
                          <ScoreBadge score={a.supervisor_total_score} />
                        </td>
                        <td className="px-4 py-3 text-center hidden lg:table-cell">
                          <ScoreBadge score={a.final_score} />
                        </td>
                        <td className="px-4 py-3 text-center hidden lg:table-cell">
                          {a.final_grade ? (
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${grade?.bg ?? ""} ${grade?.color ?? ""}`}>
                              {a.final_grade}
                            </span>
                          ) : (
                            <span className="text-ink-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-ink-200 dark:border-ink-600 hover:bg-ink-100 dark:hover:bg-ink-700 text-ink-600 dark:text-ink-300 transition-colors ml-auto"
                            onClick={() => openAppraisal(a)}
                          >
                            Review <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {periodModal.open && (
        <PeriodFormModal
          period={periodModal.period}
          onClose={() => setPeriodModal({ open: false })}
        />
      )}
      {appraisalModal && (
        <AppraisalModal
          appraisal={appraisalModal}
          canManage={canManage}
          onClose={() => setAppraisalModal(null)}
        />
      )}
    </div>
  );
}

/* read-only criteria display for non-managers */
function CriterionReadOnly({ periodId }: { periodId: number }) {
  const criteriaQ = useQuery({
    queryKey: ["appraisal-criteria", periodId],
    queryFn: ({ signal }) => hrService.listCriteria(periodId, signal),
    staleTime: 60_000,
  });
  const criteria: AppraisalCriterion[] = criteriaQ.data?.data ?? [];
  if (criteriaQ.isLoading) return <div className="text-ink-400 text-sm flex gap-2"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>;
  if (!criteria.length) return <p className="text-sm text-ink-400 italic">No criteria defined.</p>;
  return (
    <div className="space-y-2">
      {criteria.map((c, i) => (
        <div key={c.id} className="flex items-center gap-2 text-sm p-2 bg-ink-50 dark:bg-ink-700/30 rounded-lg">
          <span className="text-ink-400 w-5 text-right shrink-0">{i + 1}.</span>
          <span className="flex-1 text-ink-700 dark:text-ink-300 font-medium">{c.name}</span>
          <span className="text-xs text-ink-400">/{c.max_score}</span>
        </div>
      ))}
    </div>
  );
}
