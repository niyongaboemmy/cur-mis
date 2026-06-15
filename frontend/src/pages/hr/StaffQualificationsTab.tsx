import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  GraduationCap,
  Award,
  BookOpen,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  X,
  Save,
  Star,
  Calendar,
  Hash,
  FileText,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import {
  hrService,
  type StaffQualification,
  type StaffQualificationPayload,
  type QualificationType,
  type StaffSubject,
  type StaffSubjectPayload,
  type SubjectProficiency,
} from "@/services/hrService";
import ModalPortal from "@/components/ui/ModalPortal";

const QUAL_TYPES: { value: QualificationType; label: string }[] = [
  { value: "Degree", label: "Academic degree" },
  { value: "Certification", label: "Professional certification" },
  { value: "Other", label: "Other credential" },
];

const QUAL_META: Record<
  QualificationType,
  { icon: typeof GraduationCap; chip: string; heading: string }
> = {
  Degree: {
    icon: GraduationCap,
    chip: "bg-sky-100 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300",
    heading: "Academic Degrees",
  },
  Certification: {
    icon: Award,
    chip: "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300",
    heading: "Professional Certifications",
  },
  Other: {
    icon: FileText,
    chip: "bg-ink-100 dark:bg-ink-600 text-ink-600 dark:text-ink-300",
    heading: "Other Credentials",
  },
};

const PROFICIENCIES: SubjectProficiency[] = [
  "Beginner",
  "Intermediate",
  "Advanced",
  "Expert",
];

const PROF_COLORS: Record<SubjectProficiency, string> = {
  Beginner: "bg-ink-100 dark:bg-ink-600 text-ink-600 dark:text-ink-300",
  Intermediate:
    "bg-sky-100 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300",
  Advanced:
    "bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300",
  Expert:
    "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
};

const curYear = new Date().getFullYear();

/* ══════════════════════════════════════════════════════════════════════
   MAIN TAB
   ══════════════════════════════════════════════════════════════════════ */
export default function StaffQualificationsTab({
  empId,
  empName,
  canManage,
}: {
  empId: number;
  empName: string;
  canManage: boolean;
}) {
  const qc = useQueryClient();

  const qualsQ = useQuery({
    queryKey: ["staff-qualifications", empId],
    queryFn: ({ signal }) => hrService.listQualifications(empId, signal),
  });
  const subjectsQ = useQuery({
    queryKey: ["staff-subjects", empId],
    queryFn: ({ signal }) => hrService.listSubjects(empId, signal),
  });

  const quals: StaffQualification[] = qualsQ.data?.data ?? [];
  const subjects: StaffSubject[] = subjectsQ.data?.data ?? [];

  const [qualModal, setQualModal] = useState<
    { mode: "add" } | { mode: "edit"; q: StaffQualification } | null
  >(null);
  const [subjModal, setSubjModal] = useState<
    { mode: "add" } | { mode: "edit"; s: StaffSubject } | null
  >(null);

  const delQual = useMutation({
    mutationFn: (id: number) => hrService.deleteQualification(empId, id),
    onSuccess: () => {
      toast.success("Qualification removed.");
      qc.invalidateQueries({ queryKey: ["staff-qualifications", empId] });
    },
    onError: () => toast.error("Failed to remove qualification."),
  });

  const delSubj = useMutation({
    mutationFn: (id: number) => hrService.deleteSubject(empId, id),
    onSuccess: () => {
      toast.success("Subject removed.");
      qc.invalidateQueries({ queryKey: ["staff-subjects", empId] });
    },
    onError: () => toast.error("Failed to remove subject."),
  });

  const grouped = (["Degree", "Certification", "Other"] as QualificationType[])
    .map((t) => ({ type: t, items: quals.filter((q) => q.qual_type === t) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-8">
      {/* ── Qualifications & Credentials ──────────────────────────── */}
      <section>
        <SectionHeader
          icon={GraduationCap}
          title="Qualifications & Credentials"
          subtitle="Academic degrees and professional certifications held"
          actionLabel="Add qualification"
          onAction={canManage ? () => setQualModal({ mode: "add" }) : undefined}
        />

        {qualsQ.isLoading ? (
          <Loading />
        ) : quals.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="No qualifications recorded"
            desc="Capture degrees, diplomas and professional certifications for this staff member."
            actionLabel={canManage ? "Add the first qualification" : undefined}
            onAction={canManage ? () => setQualModal({ mode: "add" }) : undefined}
          />
        ) : (
          <div className="space-y-5">
            {grouped.map((g) => {
              const Meta = QUAL_META[g.type];
              return (
                <div key={g.type}>
                  <div className="flex items-center gap-2 mb-2.5">
                    <Meta.icon className="w-3.5 h-3.5 text-brand" />
                    <h4 className="text-[12px] font-semibold text-ink-500 uppercase tracking-wider">
                      {Meta.heading}
                    </h4>
                    <span className="text-[11px] text-ink-400">
                      ({g.items.length})
                    </span>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {g.items.map((q) => (
                      <QualificationCard
                        key={q.id}
                        q={q}
                        canManage={canManage}
                        onEdit={() => setQualModal({ mode: "edit", q })}
                        onDelete={() => {
                          if (
                            window.confirm(
                              `Remove "${q.title}" from this profile?`,
                            )
                          )
                            delQual.mutate(q.id);
                        }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Teaching Subjects / Specialisations ───────────────────── */}
      <section>
        <SectionHeader
          icon={BookOpen}
          title="Teaching Subjects & Specialisations"
          subtitle="Subjects this faculty member is qualified to teach"
          actionLabel="Add subject"
          onAction={canManage ? () => setSubjModal({ mode: "add" }) : undefined}
        />

        {subjectsQ.isLoading ? (
          <Loading />
        ) : subjects.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No subjects recorded"
            desc="Add the subjects and specialisations this faculty member can teach."
            actionLabel={canManage ? "Add the first subject" : undefined}
            onAction={canManage ? () => setSubjModal({ mode: "add" }) : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {subjects.map((s) => (
              <SubjectCard
                key={s.id}
                s={s}
                canManage={canManage}
                onEdit={() => setSubjModal({ mode: "edit", s })}
                onDelete={() => {
                  if (window.confirm(`Remove "${s.subject_name}"?`))
                    delSubj.mutate(s.id);
                }}
              />
            ))}
          </div>
        )}
      </section>

      {qualModal && (
        <QualificationModal
          empId={empId}
          empName={empName}
          initial={qualModal.mode === "edit" ? qualModal.q : null}
          onClose={() => setQualModal(null)}
        />
      )}
      {subjModal && (
        <SubjectModal
          empId={empId}
          empName={empName}
          initial={subjModal.mode === "edit" ? subjModal.s : null}
          onClose={() => setSubjModal(null)}
        />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   CARDS
   ══════════════════════════════════════════════════════════════════════ */
function QualificationCard({
  q,
  canManage,
  onEdit,
  onDelete,
}: {
  q: StaffQualification;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const Meta = QUAL_META[q.qual_type];
  const expired =
    q.expiry_date && new Date(q.expiry_date).getTime() < Date.now();
  const sub = [q.field_of_study, q.institution].filter(Boolean).join(" · ");

  return (
    <div className="group relative rounded-lg border border-ink-100 dark:border-ink-700 p-4 bg-white dark:bg-ink-800 hover:border-brand/40 transition-colors">
      <div className="flex items-start gap-3">
        <div
          className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${Meta.chip}`}
        >
          <Meta.icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13.5px] font-semibold text-ink-900 dark:text-white leading-snug">
            {q.title}
          </p>
          {sub && (
            <p className="text-[12px] text-ink-500 mt-0.5 truncate">{sub}</p>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-2 text-[11.5px]">
            {q.year_obtained && (
              <span className="inline-flex items-center gap-1 text-ink-500">
                <Calendar className="w-3 h-3" /> {q.year_obtained}
              </span>
            )}
            {q.grade && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-medium">
                {q.grade}
              </span>
            )}
            {q.reference_no && (
              <span className="inline-flex items-center gap-1 text-ink-400 font-mono">
                <Hash className="w-3 h-3" /> {q.reference_no}
              </span>
            )}
            {q.expiry_date && (
              <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-medium ${
                  expired
                    ? "bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400"
                    : "bg-ink-100 dark:bg-ink-600 text-ink-500 dark:text-ink-300"
                }`}
              >
                {expired && <AlertTriangle className="w-3 h-3" />}
                {expired ? "Expired " : "Expires "}
                {formatDate(q.expiry_date)}
              </span>
            )}
          </div>
          {q.notes && (
            <p className="text-[11.5px] text-ink-400 mt-2 italic">{q.notes}</p>
          )}
          {q.document_url && (
            <a
              href={q.document_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11.5px] text-brand hover:underline mt-2"
            >
              <FileText className="w-3 h-3" /> View document
            </a>
          )}
        </div>
        {canManage && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button className="icon-btn" onClick={onEdit} title="Edit">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              className="icon-btn text-red-500"
              onClick={onDelete}
              title="Remove"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SubjectCard({
  s,
  canManage,
  onEdit,
  onDelete,
}: {
  s: StaffSubject;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isPrimary = Number(s.is_primary) === 1 || s.is_primary === true;
  return (
    <div className="group relative rounded-lg border border-ink-100 dark:border-ink-700 p-3.5 bg-white dark:bg-ink-800 hover:border-brand/40 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {isPrimary && (
            <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />
          )}
          <p className="text-[13px] font-semibold text-ink-900 dark:text-white truncate">
            {s.subject_name}
          </p>
        </div>
        {canManage && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button className="icon-btn !p-1" onClick={onEdit} title="Edit">
              <Pencil className="w-3 h-3" />
            </button>
            <button
              className="icon-btn !p-1 text-red-500"
              onClick={onDelete}
              title="Remove"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mt-2 text-[11px]">
        <span
          className={`px-1.5 py-0.5 rounded font-medium ${PROF_COLORS[s.proficiency]}`}
        >
          {s.proficiency}
        </span>
        {s.years_experience != null && (
          <span className="text-ink-500">
            {s.years_experience} yr{s.years_experience === 1 ? "" : "s"} exp.
          </span>
        )}
        {isPrimary && (
          <span className="text-amber-600 dark:text-amber-400 font-medium">
            Primary
          </span>
        )}
      </div>
      {s.notes && (
        <p className="text-[11px] text-ink-400 mt-1.5 italic">{s.notes}</p>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   QUALIFICATION MODAL
   ══════════════════════════════════════════════════════════════════════ */
function QualificationModal({
  empId,
  empName,
  initial,
  onClose,
}: {
  empId: number;
  empName: string;
  initial: StaffQualification | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<StaffQualificationPayload>({
    qual_type: initial?.qual_type ?? "Degree",
    title: initial?.title ?? "",
    field_of_study: initial?.field_of_study ?? "",
    institution: initial?.institution ?? "",
    year_obtained: initial?.year_obtained ?? null,
    grade: initial?.grade ?? "",
    reference_no: initial?.reference_no ?? "",
    expiry_date: initial?.expiry_date ?? "",
    document_url: initial?.document_url ?? "",
    notes: initial?.notes ?? "",
  });

  const set = <K extends keyof StaffQualificationPayload>(
    k: K,
    v: StaffQualificationPayload[K],
  ) => setForm((p) => ({ ...p, [k]: v }));

  const mut = useMutation({
    mutationFn: () => {
      const payload: StaffQualificationPayload = {
        ...form,
        year_obtained: form.year_obtained ? Number(form.year_obtained) : null,
        field_of_study: form.field_of_study || null,
        institution: form.institution || null,
        grade: form.grade || null,
        reference_no: form.reference_no || null,
        expiry_date: form.expiry_date || null,
        document_url: form.document_url || null,
        notes: form.notes || null,
      };
      return initial
        ? hrService.updateQualification(empId, initial.id, payload)
        : hrService.addQualification(empId, payload);
    },
    onSuccess: () => {
      toast.success(initial ? "Qualification updated." : "Qualification added.");
      qc.invalidateQueries({ queryKey: ["staff-qualifications", empId] });
      onClose();
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? "Save failed"),
  });

  const isCert = form.qual_type === "Certification";

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-ink-900/50 backdrop-blur-sm">
        <div className="bg-white dark:bg-ink-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-ink-100 dark:border-ink-700">
            <div>
              <h3 className="text-[15px] font-semibold text-ink-900 dark:text-white">
                {initial ? "Edit qualification" : "Add qualification"}
              </h3>
              <p className="text-[12px] text-ink-500">{empName}</p>
            </div>
            <button onClick={onClose} className="icon-btn">
              <X className="w-4 h-4" />
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              mut.mutate();
            }}
            className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            <Field label="Type" required>
              <select
                className="input"
                value={form.qual_type}
                onChange={(e) =>
                  set("qual_type", e.target.value as QualificationType)
                }
              >
                {QUAL_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label={isCert ? "Certification name" : "Degree / Title"}
              required
            >
              <input
                required
                className="input"
                placeholder={
                  isCert ? "e.g. AWS Solutions Architect" : "e.g. PhD in Computer Science"
                }
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
              />
            </Field>

            <Field label="Field of study">
              <input
                className="input"
                placeholder="e.g. Software Engineering"
                value={form.field_of_study ?? ""}
                onChange={(e) => set("field_of_study", e.target.value)}
              />
            </Field>
            <Field label={isCert ? "Issuing body" : "Institution"}>
              <input
                className="input"
                placeholder="e.g. University of Rwanda"
                value={form.institution ?? ""}
                onChange={(e) => set("institution", e.target.value)}
              />
            </Field>

            <Field label="Year obtained">
              <input
                type="number"
                min={1950}
                max={curYear}
                className="input"
                placeholder={String(curYear)}
                value={form.year_obtained ?? ""}
                onChange={(e) =>
                  set(
                    "year_obtained",
                    e.target.value ? Number(e.target.value) : null,
                  )
                }
              />
            </Field>
            <Field label={isCert ? "Class / Score" : "Grade / Class"}>
              <input
                className="input"
                placeholder="e.g. First Class, Distinction"
                value={form.grade ?? ""}
                onChange={(e) => set("grade", e.target.value)}
              />
            </Field>

            <Field label={isCert ? "Certificate / Licence no." : "Reference no."}>
              <input
                className="input"
                placeholder="Optional"
                value={form.reference_no ?? ""}
                onChange={(e) => set("reference_no", e.target.value)}
              />
            </Field>
            <Field label="Expiry date">
              <input
                type="date"
                className="input"
                value={form.expiry_date ?? ""}
                onChange={(e) => set("expiry_date", e.target.value)}
              />
            </Field>

            <div className="md:col-span-2">
              <Field label="Document URL">
                <input
                  type="url"
                  className="input"
                  placeholder="https://…  (link to scanned certificate)"
                  value={form.document_url ?? ""}
                  onChange={(e) => set("document_url", e.target.value)}
                />
              </Field>
            </div>

            <div className="md:col-span-2">
              <Field label="Notes">
                <textarea
                  className="input min-h-[64px]"
                  placeholder="Any additional context…"
                  value={form.notes ?? ""}
                  onChange={(e) => set("notes", e.target.value)}
                />
              </Field>
            </div>

            <div className="md:col-span-2 flex justify-end gap-2 pt-2 border-t border-ink-100 dark:border-ink-700">
              <button type="button" onClick={onClose} className="btn-secondary">
                Cancel
              </button>
              <button
                type="submit"
                disabled={mut.isPending}
                className="btn-primary"
              >
                {mut.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {initial ? "Save changes" : "Add qualification"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   SUBJECT MODAL
   ══════════════════════════════════════════════════════════════════════ */
function SubjectModal({
  empId,
  empName,
  initial,
  onClose,
}: {
  empId: number;
  empName: string;
  initial: StaffSubject | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<StaffSubjectPayload>({
    subject_name: initial?.subject_name ?? "",
    proficiency: initial?.proficiency ?? "Advanced",
    years_experience: initial?.years_experience ?? null,
    is_primary: initial
      ? Number(initial.is_primary) === 1 || initial.is_primary === true
      : false,
    notes: initial?.notes ?? "",
  });

  const set = <K extends keyof StaffSubjectPayload>(
    k: K,
    v: StaffSubjectPayload[K],
  ) => setForm((p) => ({ ...p, [k]: v }));

  const mut = useMutation({
    mutationFn: () => {
      const payload: StaffSubjectPayload = {
        ...form,
        years_experience: form.years_experience
          ? Number(form.years_experience)
          : null,
        notes: form.notes || null,
      };
      return initial
        ? hrService.updateSubject(empId, initial.id, payload)
        : hrService.addSubject(empId, payload);
    },
    onSuccess: () => {
      toast.success(initial ? "Subject updated." : "Subject added.");
      qc.invalidateQueries({ queryKey: ["staff-subjects", empId] });
      onClose();
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? "Save failed"),
  });

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-ink-900/50 backdrop-blur-sm">
        <div className="bg-white dark:bg-ink-800 rounded-xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-ink-100 dark:border-ink-700">
            <div>
              <h3 className="text-[15px] font-semibold text-ink-900 dark:text-white">
                {initial ? "Edit subject" : "Add teaching subject"}
              </h3>
              <p className="text-[12px] text-ink-500">{empName}</p>
            </div>
            <button onClick={onClose} className="icon-btn">
              <X className="w-4 h-4" />
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              mut.mutate();
            }}
            className="flex-1 overflow-y-auto p-6 space-y-4"
          >
            <Field label="Subject name" required>
              <input
                required
                className="input"
                placeholder="e.g. Database Systems"
                value={form.subject_name}
                onChange={(e) => set("subject_name", e.target.value)}
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Proficiency">
                <select
                  className="input"
                  value={form.proficiency}
                  onChange={(e) =>
                    set("proficiency", e.target.value as SubjectProficiency)
                  }
                >
                  {PROFICIENCIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Years of experience">
                <input
                  type="number"
                  min={0}
                  max={60}
                  className="input"
                  placeholder="e.g. 5"
                  value={form.years_experience ?? ""}
                  onChange={(e) =>
                    set(
                      "years_experience",
                      e.target.value ? Number(e.target.value) : null,
                    )
                  }
                />
              </Field>
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-ink-300 text-brand focus:ring-brand"
                checked={!!form.is_primary}
                onChange={(e) => set("is_primary", e.target.checked)}
              />
              <span className="text-[13px] text-ink-700 dark:text-ink-200">
                Mark as a primary teaching specialisation
              </span>
            </label>

            <Field label="Notes">
              <textarea
                className="input min-h-[64px]"
                placeholder="Optional context…"
                value={form.notes ?? ""}
                onChange={(e) => set("notes", e.target.value)}
              />
            </Field>

            <div className="flex justify-end gap-2 pt-2 border-t border-ink-100 dark:border-ink-700">
              <button type="button" onClick={onClose} className="btn-secondary">
                Cancel
              </button>
              <button
                type="submit"
                disabled={mut.isPending}
                className="btn-primary"
              >
                {mut.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {initial ? "Save changes" : "Add subject"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   SHARED BITS
   ══════════════════════════════════════════════════════════════════════ */
function SectionHeader({
  icon: Icon,
  title,
  subtitle,
  actionLabel,
  onAction,
}: {
  icon: typeof GraduationCap;
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="flex items-start gap-2.5">
        <div className="h-8 w-8 rounded-lg bg-brand/10 text-brand dark:bg-brand/25 dark:text-gold-400 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <h3 className="text-[14px] font-semibold text-ink-900 dark:text-white">
            {title}
          </h3>
          <p className="text-[12px] text-ink-500">{subtitle}</p>
        </div>
      </div>
      {onAction && (
        <button className="btn-primary btn-sm shrink-0" onClick={onAction}>
          <Plus className="w-3.5 h-3.5" /> {actionLabel}
        </button>
      )}
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[12px] font-medium text-ink-700 dark:text-ink-300 mb-1 block">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-ink-500 text-[13px]">
      <Loader2 className="w-4 h-4 animate-spin" /> Loading…
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  desc,
  actionLabel,
  onAction,
}: {
  icon: typeof GraduationCap;
  title: string;
  desc: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-lg border border-dashed border-ink-200 dark:border-ink-700 py-8 px-6 flex flex-col items-center text-center gap-2.5">
      <div className="w-12 h-12 rounded-2xl bg-ink-50 dark:bg-ink-700/40 text-ink-400 flex items-center justify-center">
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <h4 className="text-[13.5px] font-semibold text-ink-800 dark:text-white">
          {title}
        </h4>
        <p className="text-[12px] text-ink-500 mt-0.5 max-w-sm">{desc}</p>
      </div>
      {onAction && (
        <button className="btn-secondary btn-sm mt-1" onClick={onAction}>
          <Sparkles className="w-3.5 h-3.5" /> {actionLabel}
        </button>
      )}
    </div>
  );
}

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
