import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  ArrowRight,
  User,
  Mail,
  Phone,
  CalendarDays,
  MapPin,
  GraduationCap,
  Building2,
  FileText,
  Loader2,
  CheckCircle2,
  XCircle,
  MessageSquarePlus,
  ExternalLink,
  ChevronRight,
} from "lucide-react";
import {
  applicationAdminService,
  verificationService,
} from "@/services/admissionService";
import type { ApplicationStatus } from "@/types/admission";

const STATUS_OPTIONS: ApplicationStatus[] = [
  "submitted",
  "documents_under_review",
  "documents_verified",
  "documents_rejected",
  "merit_listed",
  "offered",
  "offer_accepted",
  "offer_declined",
  "enrolled",
  "withdrawn",
];

export default function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const appId = Number(id);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [noteInput, setNoteInput] = useState("");
  // Per-document rejection state: which doc id is open for rejection input
  const [rejectingDocId, setRejectingDocId] = useState<number | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");

  const appQ = useQuery({
    queryKey: ["admin", "applications", appId],
    queryFn: () => applicationAdminService.show(appId),
    enabled: !!appId,
  });

  // Fetch the pending verifications queue so we can navigate applicant-by-applicant
  const queueQ = useQuery({
    queryKey: ["admin", "verifications"],
    queryFn: () => verificationService.getPendingApplications(),
  });
  const queue = queueQ.data?.data?.data ?? [];
  const queueIdx = queue.findIndex((a: any) => a.id === appId);
  const prevApp = queueIdx > 0 ? queue[queueIdx - 1] : null;
  const nextApp = queueIdx < queue.length - 1 ? queue[queueIdx + 1] : null;

  const updateStatus = useMutation({
    mutationFn: (s: ApplicationStatus) =>
      applicationAdminService.updateStatus(appId, { status: s }),
    onSuccess: () => {
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: ["admin", "applications"] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Failed"),
  });

  const addNote = useMutation({
    mutationFn: (n: string) =>
      applicationAdminService.addNote(appId, { notes: n }),
    onSuccess: () => {
      toast.success("Note added");
      setNoteInput("");
      qc.invalidateQueries({ queryKey: ["admin", "applications", appId] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Failed"),
  });

  const verify = useMutation({
    mutationFn: (d: {
      documentId: number;
      status: "verified" | "rejected";
      rejection_notes?: string;
    }) =>
      verificationService.verifyDocument(appId, d.documentId, {
        verification_status: d.status,
        rejection_notes: d.rejection_notes,
      }),
    onSuccess: () => {
      toast.success("Document updated");
      setRejectingDocId(null);
      setRejectNotes("");
      qc.invalidateQueries({ queryKey: ["admin", "applications", appId] });
      qc.invalidateQueries({ queryKey: ["admin", "verifications"] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Failed"),
  });

  const handleApprove = (docId: number) => {
    verify.mutate({ documentId: docId, status: "verified" });
  };

  const handleOpenReject = (docId: number) => {
    setRejectingDocId(docId);
    setRejectNotes("");
  };

  const handleSubmitReject = () => {
    if (!rejectNotes.trim()) {
      toast.error("Please provide rejection notes for the applicant.");
      return;
    }
    verify.mutate({
      documentId: rejectingDocId!,
      status: "rejected",
      rejection_notes: rejectNotes.trim(),
    });
  };

  if (appQ.isLoading)
    return (
      <p className="text-ink-500 text-[13px] flex items-center gap-2 p-4">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </p>
    );
  if (!appQ.data?.data)
    return (
      <p className="text-ink-500 text-[13px] p-4">Application not found.</p>
    );

  const app = appQ.data.data;
  const docs = app.documents ?? [];
  const statusLog = app.status_log ?? [];

  const pendingDocs = docs.filter(
    (d: any) => d.verification_status === "pending",
  ).length;
  const verifiedDocs = docs.filter(
    (d: any) => d.verification_status === "verified",
  ).length;

  return (
    <div className="space-y-4">
      {/* Breadcrumb + queue navigation */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Link
          to="/admin/admissions/verifications"
          className="inline-flex items-center gap-1 text-[12.5px] text-ink-500 hover:text-brand"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to queue
        </Link>

        {queue.length > 0 && (
          <div className="flex items-center gap-2 text-[12.5px] text-ink-500">
            <span className="text-ink-400">
              {queueIdx >= 0
                ? `${queueIdx + 1} of ${queue.length} pending`
                : `${queue.length} pending`}
            </span>
            <button
              className="btn-secondary btn-sm"
              disabled={!prevApp}
              onClick={() =>
                prevApp &&
                navigate(`/admin/admissions/applications/${prevApp.id}`)
              }
            >
              <ArrowLeft className="w-3 h-3" /> Prev
            </button>
            <button
              className="btn-primary btn-sm"
              disabled={!nextApp}
              onClick={() =>
                nextApp &&
                navigate(`/admin/admissions/applications/${nextApp.id}`)
              }
            >
              Next <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Applicant Profile (5/12) */}
        <div className="xl:col-span-5 space-y-6">
          {/* Main Info */}
          <section className="card p-6">
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <p className="text-[11px] uppercase tracking-wider font-semibold text-ink-400">
                  Application
                </p>
                <p className="text-[24px] font-black text-ink-900 dark:text-white font-mono leading-none mt-1">
                  {app.application_number}
                </p>
                <p className="text-[15px] font-bold text-ink-700 dark:text-ink-300 mt-2">
                  {app.first_name} {app.last_name}
                </p>
              </div>
              <div className="text-right">
                <span
                  className={`chip-${app.status === "documents_verified" ? "success" : app.status === "documents_rejected" ? "danger" : "warning"} px-3 py-1 text-[11px] font-black uppercase tracking-widest`}
                >
                  {app.status.replace(/_/g, " ")}
                </span>
                <div className="mt-2">
                  <select
                    className="input py-1 text-[12px] w-44"
                    value={app.status}
                    onChange={(e) =>
                      updateStatus.mutate(e.target.value as ApplicationStatus)
                    }
                    disabled={updateStatus.isPending}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-ink-50 dark:bg-ink-800/40 rounded-2xl p-4 space-y-3">
                <h4 className="text-[12px] font-black uppercase tracking-widest text-ink-400 mb-1">
                  Personal Details
                </h4>
                <Row icon={User} k="Gender" v={app.gender} />
                <Row icon={CalendarDays} k="Birthdate" v={app.birthdate} />
                <Row icon={Mail} k="Email" v={app.email} />
                <Row icon={Phone} k="Phone" v={app.phone} />
                <Row icon={MapPin} k="Nationality" v={app.nationality} />
                <Row icon={MapPin} k="Address" v={app.address || "—"} />
              </div>

              <div className="bg-ink-50 dark:bg-ink-800/40 rounded-2xl p-4 space-y-3">
                <h4 className="text-[12px] font-black uppercase tracking-widest text-ink-400 mb-1">
                  Academic Choice
                </h4>
                <Row
                  icon={Building2}
                  k="Faculty"
                  v={app.faculty_name ?? `#${app.faculty_id}`}
                />
                <Row
                  icon={GraduationCap}
                  k="Department"
                  v={app.department_name ?? `#${app.department_id}`}
                />
                <Row icon={GraduationCap} k="Intake" v={app.intake} />
                <Row
                  icon={GraduationCap}
                  k="Prev. school"
                  v={app.prev_school}
                />
                <Row
                  icon={GraduationCap}
                  k="Qualification"
                  v={`${app.prev_qualification} · grade ${app.prev_grade}`}
                />
                <Row
                  icon={GraduationCap}
                  k="Sponsorship"
                  v={`${app.sponsorship}${app.sponsor_name ? " — " + app.sponsor_name : ""}`}
                />
              </div>
            </div>
          </section>

          {/* Internal Notes */}
          <section className="card p-6 border-brand/20 shadow-sm">
            <h3 className="section-title mb-4 flex items-center gap-2">
              <MessageSquarePlus className="w-4 h-4 text-brand" /> Internal
              Review Notes
            </h3>
            <textarea
              className="input min-h-[100px] text-[13px] bg-brand/5 focus:bg-white transition-colors"
              placeholder="Admin-only notes — never shown to the applicant."
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
            />
            <div className="mt-3 flex justify-end">
              <button
                className="btn-primary"
                onClick={() =>
                  noteInput.trim() && addNote.mutate(noteInput.trim())
                }
                disabled={!noteInput.trim() || addNote.isPending}
              >
                {addNote.isPending && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                )}
                Save Private Note
              </button>
            </div>
            {app.internal_notes && (
              <div className="mt-4 rounded-xl bg-brand/5 p-4 text-[13px] leading-relaxed whitespace-pre-wrap text-ink-800 dark:text-ink-200 border border-brand/10">
                {app.internal_notes}
              </div>
            )}
          </section>

          {/* History */}
          <section className="card p-6">
            <h3 className="section-title mb-4">Application History</h3>
            {statusLog.length === 0 ? (
              <p className="text-[13px] text-ink-500">No transitions logged.</p>
            ) : (
              <div className="relative space-y-4 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-[2px] before:bg-ink-100 dark:before:bg-ink-800">
                {statusLog.map((l: any) => (
                  <div
                    key={l.id}
                    className="relative pl-7 flex items-start gap-3 text-[12.5px]"
                  >
                    <div className="absolute left-0 top-1 w-[16px] h-[16px] rounded-full bg-white dark:bg-ink-900 border-2 border-brand shrink-0" />
                    <div className="min-w-0">
                      <p className="font-bold text-ink-900 dark:text-ink-100 leading-tight">
                        {l.to_status.replace(/_/g, " ").toUpperCase()}
                        <span className="text-[11px] font-medium text-ink-400 ml-2">
                          {l.actor_type}
                        </span>
                      </p>
                      {l.notes && (
                        <p className="text-ink-500 mt-1 italic">"{l.notes}"</p>
                      )}
                      <p className="text-ink-400 text-[11px] mt-1">
                        {new Date(l.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* RIGHT COLUMN: Document Verification (7/12) */}
        <div className="xl:col-span-7 space-y-6">
          <section className="card p-0 overflow-hidden border-brand/20">
            <div className="p-6 border-b border-ink-100 dark:border-ink-800 flex items-center justify-between flex-wrap gap-4 bg-brand/[0.02]">
              <div>
                <h3 className="section-title text-[18px]">
                  Verification Checklist
                </h3>
                <p className="section-sub">
                  Review each document for authenticity and readability.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-widest font-black text-ink-400">
                    Progress
                  </p>
                  <p className="text-[16px] font-black text-ink-900 dark:text-white">
                    {verifiedDocs} / {docs.length}{" "}
                    <span className="text-[12px] font-normal text-ink-500 ml-1">
                      Verified
                    </span>
                  </p>
                </div>
                <div className="w-12 h-12 rounded-full border-4 border-emerald-100 dark:border-emerald-900/30 flex items-center justify-center relative">
                  <span className="text-[12px] font-black text-emerald-600">
                    {Math.round((verifiedDocs / docs.length) * 100)}%
                  </span>
                </div>
              </div>
            </div>

            {docs.length === 0 ? (
              <div className="p-12 text-center">
                <FileText className="w-12 h-12 text-ink-200 mx-auto mb-4" />
                <p className="text-[14px] text-ink-500">
                  No documents have been uploaded yet.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-ink-100 dark:divide-ink-800">
                {docs.map((d: any) => (
                  <div
                    key={d.id}
                    className={`p-5 transition-colors ${rejectingDocId === d.id ? "bg-red-50/30 dark:bg-red-900/10" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${d.verification_status === "verified" ? "bg-emerald-50 text-emerald-600" : d.verification_status === "rejected" ? "bg-red-50 text-red-600" : "bg-ink-100 text-ink-500"}`}
                        >
                          <FileText className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[14px] font-black text-ink-900 dark:text-white truncate">
                            {d.document_type_name ??
                              `Document Type #${d.document_type_id}`}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[12px] text-ink-500 truncate max-w-[200px]">
                              {d.file_original_name}
                            </span>
                            <span className="text-ink-300">·</span>
                            <span className="text-[11px] text-ink-400 font-medium uppercase">
                              {Math.ceil((d.file_size || 0) / 1024)} KB
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <a
                          href={verificationService.downloadUrl(app.id, d.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="p-2 rounded-lg hover:bg-ink-100 dark:hover:bg-ink-800 text-ink-500 transition-colors"
                          title="View Full Document"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                        <div className="h-6 w-px bg-ink-200 dark:bg-ink-700 mx-1" />
                        <button
                          className={`btn-sm ${d.verification_status === "verified" ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20" : "btn-secondary text-emerald-600 hover:bg-emerald-50"}`}
                          onClick={() => handleApprove(d.id)}
                          disabled={verify.isPending}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {d.verification_status === "verified"
                            ? "Verified"
                            : "Verify"}
                        </button>
                        <button
                          className={`btn-sm ${d.verification_status === "rejected" ? "bg-red-600 text-white shadow-lg shadow-red-500/20" : "btn-secondary text-red-600 hover:bg-red-50"}`}
                          onClick={() =>
                            rejectingDocId === d.id
                              ? setRejectingDocId(null)
                              : handleOpenReject(d.id)
                          }
                          disabled={verify.isPending}
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          {rejectingDocId === d.id ? "Cancel" : "Reject"}
                        </button>
                      </div>
                    </div>

                    {/* Rejection form/note */}
                    {(d.rejection_notes || rejectingDocId === d.id) && (
                      <div className="mt-4 ml-14 animate-in fade-in slide-in-from-top-2 duration-300">
                        {rejectingDocId === d.id ? (
                          <div className="space-y-3 bg-white dark:bg-ink-900 rounded-2xl p-4 border-2 border-red-200 dark:border-red-900/50 shadow-sm">
                            <p className="text-[12px] font-black uppercase tracking-widest text-red-600 flex items-center gap-2">
                              <MessageSquarePlus className="w-3.5 h-3.5" />{" "}
                              Specify Rejection Reason
                            </p>
                            <textarea
                              className="input min-h-[80px] text-[13px] border-red-100 focus:border-red-400 focus:ring-red-50"
                              placeholder="e.g. Image is blurry, name mismatch, document expired..."
                              value={rejectNotes}
                              onChange={(e) => setRejectNotes(e.target.value)}
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <button
                                className="btn-secondary btn-sm"
                                onClick={() => setRejectingDocId(null)}
                              >
                                Close
                              </button>
                              <button
                                className="btn-sm bg-red-600 text-white hover:bg-red-700 px-4"
                                disabled={
                                  verify.isPending || !rejectNotes.trim()
                                }
                                onClick={handleSubmitReject}
                              >
                                {verify.isPending ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  "Confirm Rejection"
                                )}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-3 border border-red-100 dark:border-red-800/50">
                            <p className="text-[12px] text-red-800 dark:text-red-300 leading-relaxed">
                              <span className="font-black uppercase text-[10px] mr-2">
                                Rejected:
                              </span>{" "}
                              {d.rejection_notes}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Quick-navigate Footer */}
            {docs.length > 0 && pendingDocs === 0 && nextApp && (
              <div className="p-6 bg-emerald-50/50 dark:bg-emerald-900/10 border-t border-emerald-100 dark:border-emerald-900/30 flex items-center justify-between">
                <div>
                  <p className="text-[14px] font-black text-emerald-800 dark:text-emerald-300">
                    All documents reviewed!
                  </p>
                  <p className="text-[12px] text-emerald-600/80">
                    Ready to proceed with {nextApp.first_name}{" "}
                    {nextApp.last_name}?
                  </p>
                </div>
                <button
                  className="btn-primary px-6 py-2.5 rounded-xl shadow-lg shadow-emerald-500/20"
                  onClick={() =>
                    navigate(`/admin/admissions/applications/${nextApp.id}`)
                  }
                >
                  Review Next Applicant <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Row({
  icon: Icon,
  k,
  v,
}: {
  icon: any;
  k: string;
  v: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="w-3.5 h-3.5 text-ink-400 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <span className="text-ink-500">{k}: </span>
        <span className="text-ink-800 dark:text-ink-100 font-medium break-words">
          {v || "—"}
        </span>
      </div>
    </div>
  );
}

