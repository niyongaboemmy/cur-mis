import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FileText,
  MapPin,
  Phone,
  Mail,
  User,
  GraduationCap,
  Building2,
  Calendar,
  Eye,
  ArrowLeft,
  CreditCard,
  CheckCircle2,
  Circle,
  XCircle,
  Clock,
  AlertTriangle,
  School,
  Hash,
  Award,
  Sparkles,
} from "lucide-react";
import { applicantService } from "@/services/admissionService";
import {
  Card,
  SectionHeader,
  fmt,
} from "@/components/applicant/ApplicantPortalShared";
import type { StudentApplication, ApplicationStatus } from "@/types/admission";
import {
  COUNTRY_BY_NAME,
  COUNTRY_BY_NATIONALITY,
  countryFlag,
} from "@/data/countries";
import DocumentPreviewModal from "../ui/DocumentPreviewModal";

interface ApplicationDetailsViewProps {
  application: StudentApplication;
  onEdit?: () => void;
  onBack?: () => void;
}

export default function ApplicationDetailsView({
  application,
  onBack,
}: ApplicationDetailsViewProps) {
  const [previewDoc, setPreviewDoc] = useState<any>(null);
  const detailsQ = useQuery({
    queryKey: ["applicant", "application", application.id],
    queryFn: () => applicantService.getApplicationDetails(application.id),
  });

  const details = detailsQ.data?.data;
  const app = (details ?? application) as StudentApplication & {
    document_checklist?: any[];
    status_log?: any[];
  };
  const checklist = (app as any).document_checklist ?? [];
  const statusLog = ((app as any).status_log ?? []).filter(
    (log: any) => log.to_status !== "draft",
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* ── Top bar: back ────────────────────────────────────────── */}
      {onBack && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-600 hover:text-brand transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to applications
          </button>
        </div>
      )}

      {/* ── Hero card ────────────────────────────────────────────── */}
      <Card className="overflow-hidden p-0">
        <div className="relative bg-gradient-to-br from-primary-700 via-primary-700 to-primary-900 p-6 sm:p-8 text-white">
          <div className="pointer-events-none absolute -top-16 -right-16 w-64 h-64 rounded-full bg-white/5 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-12 -left-12 w-48 h-48 rounded-full bg-gold-400/10 blur-3xl" />

          <div className="relative flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-5 min-w-0">
              <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-gold-300 shrink-0">
                <FileText className="w-8 h-8" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.2em] font-bold text-white/60">
                  Application Reference
                </p>
                <h2 className="text-[24px] sm:text-[28px] font-mono font-black text-white leading-tight">
                  {app.application_number}
                </h2>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <StatusPill status={app.status} />
                  {app.submitted_at && (
                    <span className="text-[12.5px] text-white/70 font-medium inline-flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Submitted{" "}
                      {new Date(app.submitted_at).toLocaleDateString(
                        undefined,
                        { month: "short", day: "numeric", year: "numeric" },
                      )}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[11px] uppercase tracking-[0.2em] font-bold text-white/60">
                Applying for
              </p>
              <p className="text-[15px] sm:text-[17px] font-bold text-gold-300 mt-1 max-w-[260px] truncate">
                {app.program_name ?? app.department_name ?? "—"}
              </p>
              <p className="text-[12px] text-white/70 mt-0.5">
                {app.faculty_name ?? ""}
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-8 pt-6 space-y-6">
          {/* Stage tracker */}
          <StageTracker
            status={app.status as ApplicationStatus}
            log={statusLog}
          />

          {/* Quick tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <DetailTile
              icon={GraduationCap}
              label="Program"
              value={app.program_name ?? app.department_name ?? "—"}
            />
            <DetailTile
              icon={Building2}
              label="Campus"
              value={app.campus_name ?? "—"}
              sub={app.campus_location ?? undefined}
            />
            <DetailTile
              icon={School}
              label="Mode of Study"
              value={app.mode_of_study ?? "—"}
            />
            <DetailTile
              icon={Calendar}
              label="Intake"
              value={app.intake ?? "—"}
              sub={app.academic_year_label ?? undefined}
            />
          </div>
        </div>
      </Card>

      {/* ── Main grid: details + side panel ──────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6">
        <div className="space-y-6">
          {/* Personal details */}
          <Card>
            <SectionHeader
              title="Personal Details"
              sub="Identity, contact and parental info."
              icon={User}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5 mt-6">
              <InfoGroup
                label="Full Name"
                value={`${app.first_name} ${app.last_name}`.trim() || "—"}
              />
              <InfoGroup label="Father's Name" value={app.father || "—"} />
              <InfoGroup label="Mother's Name" value={app.mother || "—"} />
              <InfoGroup
                label="Gender"
                value={
                  app.gender === "M"
                    ? "Male"
                    : app.gender === "F"
                      ? "Female"
                      : app.gender || "—"
                }
              />
              <InfoGroup
                label="Date of Birth"
                value={app.birthdate || "—"}
                icon={Calendar}
              />
              <InfoGroup
                label="Marital Status"
                value={cap(app.marital_status) || "—"}
              />
              <InfoGroup
                label="National ID / Passport"
                value={app.national_id || "—"}
                icon={Hash}
              />
              <InfoGroup
                label="Nationality"
                value={withFlag(app.nationality, "nationality")}
                icon={undefined}
              />
              <InfoGroup
                label="Country of Residence"
                value={withFlag(app.country_of_residence, "country")}
                icon={undefined}
              />
              <InfoGroup label="Disability" value={app.disability || "None"} />
            </div>
          </Card>

          {/* Contact */}
          <Card>
            <SectionHeader
              title="Contact"
              sub="How we'll reach you."
              icon={Phone}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5 mt-6">
              <InfoGroup label="Phone" value={app.phone || "—"} icon={Phone} />
              <InfoGroup
                label="Reference Person Phone"
                value={app.reference_phone || "—"}
                icon={Phone}
              />
              <InfoGroup label="Email" value={app.email || "—"} icon={Mail} />
            </div>
          </Card>

          {/* Residency */}
          <Card>
            <SectionHeader
              title="Residency"
              sub="Where you live."
              icon={MapPin}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5 mt-6">
              <InfoGroup label="Province" value={app.province || "—"} />
              <InfoGroup label="District" value={app.district || "—"} />
              <InfoGroup label="Sector" value={app.sector || "—"} />
              <InfoGroup
                label="Residence District"
                value={app.residence_district || "—"}
              />
              <InfoGroup
                label="Address"
                value={app.address || "Not provided"}
                icon={MapPin}
              />
            </div>
          </Card>

          {/* Academic background */}
          <Card>
            <SectionHeader
              title="Academic Background"
              sub="Secondary school transcript provided during application."
              icon={GraduationCap}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5 mt-6">
              <InfoGroup
                label="Attended Secondary School"
                value={app.prev_school || "—"}
              />
              <InfoGroup
                label="Combination / Section"
                value={app.combination || "—"}
              />
              <InfoGroup label="A2 Grades" value={app.a2_grades || "—"} />
              <InfoGroup
                label="Principal Passes"
                value={
                  app.principal_passes != null
                    ? String(app.principal_passes)
                    : "—"
                }
              />
              <InfoGroup
                label="Completion Year"
                value={app.graduation_year ? String(app.graduation_year) : "—"}
              />
              <InfoGroup
                label="Serial Number"
                value={app.serial_number || "—"}
              />
            </div>
          </Card>

          {/* Programs */}
          <Card>
            <SectionHeader
              title="Programme Selection"
              sub="The programme you applied for and how you'll study it."
              icon={Sparkles}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5 mt-6">
              <InfoGroup
                label="Program"
                value={app.program_name ?? app.department_name ?? "—"}
              />
              <InfoGroup label="Faculty" value={app.faculty_name ?? "—"} />
              <InfoGroup
                label="Department"
                value={app.department_name ?? "—"}
              />
              <InfoGroup
                label="Campus"
                value={app.campus_name ?? "—"}
                icon={Building2}
              />
              <InfoGroup
                label="Mode of Study"
                value={app.mode_of_study ?? "—"}
              />
              <InfoGroup
                label="Level"
                value={
                  app.level_name ??
                  (app.level_id ? `Level #${app.level_id}` : "—")
                }
              />
              <InfoGroup label="Intake" value={app.intake ?? "—"} />
              <InfoGroup
                label="Academic Year"
                value={app.academic_year_label ?? "—"}
              />
            </div>
          </Card>

          {/* Documents */}
          <Card>
            <div className="flex items-center justify-between gap-4 mb-2">
              <SectionHeader
                title="Required Documents"
                sub="Upload status and verification."
                icon={FileText}
              />
            </div>
            <div className="space-y-3 mt-4">
              {checklist.length === 0 ? (
                <p className="text-[12px] text-ink-400 text-center py-6">
                  No documents required for this program.
                </p>
              ) : (
                checklist.map((item: any) => (
                  <div
                    key={item.document_type_id}
                    className="p-3 rounded-xl border border-ink-100 dark:border-ink-800 flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          item.uploaded
                            ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600"
                            : "bg-ink-50 dark:bg-ink-800 text-ink-400"
                        }`}
                      >
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-ink-900 dark:text-white truncate flex items-center gap-2">
                          {item.document_type_name}
                          {item.is_required && (
                            <span className="text-[10px] text-red-500 font-bold uppercase tracking-widest">
                              Required
                            </span>
                          )}
                        </p>
                        {item.uploaded ? (
                          <p className="text-[11px] text-ink-500 truncate">
                            {item.file_original_name}
                          </p>
                        ) : (
                          <p className="text-[11px] text-amber-600 font-medium italic">
                            Not uploaded yet
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {item.uploaded && (
                        <>
                          <StatusPillSmall status={item.verification_status} />
                          <button
                            onClick={() => setPreviewDoc(item)}
                            className="p-1.5 rounded-lg hover:bg-ink-100 dark:hover:bg-ink-700 text-ink-500 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Payment */}
          <Card>
            <SectionHeader
              title="Application Fee Payment"
              sub="Bank slip and transaction details."
              icon={CreditCard}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5 mt-6">
              <InfoGroup
                label="Amount Paid"
                value={
                  app.payment_amount != null
                    ? `${app.payment_amount} ${app.payment_currency ?? "RWF"}`
                    : "—"
                }
                icon={CreditCard}
              />
              <InfoGroup
                label="Transaction ID"
                value={app.transaction_id || "—"}
                icon={Hash}
              />
              <InfoGroup
                label="Paid At"
                value={app.paid_at ? fmt(app.paid_at) : "—"}
                icon={Clock}
              />
            </div>

            {app.payment_slip_file_id ? (
              <div className="mt-6 p-3 rounded-xl border border-ink-100 dark:border-ink-800 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-ink-900 dark:text-white">
                      Payment Slip
                    </p>
                    <p className="text-[11px] text-ink-500">
                      Uploaded with this application — click to preview.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() =>
                    setPreviewDoc({
                      __payment_slip: true,
                      document_id: app.id,
                      document_type_name: "Payment Slip",
                      file_mime: (app as any).payment_slip_mime ?? undefined,
                    })
                  }
                  className="p-1.5 rounded-lg hover:bg-ink-100 dark:hover:bg-ink-700 text-ink-500 transition-colors shrink-0"
                  title="Preview payment slip"
                >
                  <Eye className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <p className="mt-6 text-[12px] text-ink-400 italic">
                No payment slip on file.
              </p>
            )}
          </Card>
        </div>

        {/* ── Side panel ─────────────────────────────────────────── */}
        <div className="space-y-6">
          {/* Status timeline */}
          <Card>
            <SectionHeader
              title="Status History"
              sub="Every change to this application."
              icon={Clock}
            />
            <div className="mt-6 space-y-4">
              {statusLog.length === 0 ? (
                <p className="text-[12px] text-ink-400 text-center py-4">
                  No history available.
                </p>
              ) : (
                <div className="relative pl-4 space-y-6 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-0.5 before:bg-ink-100 dark:before:bg-ink-800">
                  {statusLog.map((log: any, idx: number) => (
                    <div key={idx} className="relative">
                      <div className="absolute -left-[19px] top-1.5 w-2.5 h-2.5 rounded-full bg-primary-500 ring-4 ring-white dark:ring-ink-900" />
                      <p className="text-[12.5px] font-bold text-ink-900 dark:text-white capitalize">
                        {String(log.to_status).replace(/_/g, " ")}
                      </p>
                      <p className="text-[11px] text-ink-400 mt-0.5">
                        {fmt(log.created_at)}
                      </p>
                      {log.notes && (
                        <p className="text-[12px] text-ink-500 mt-1 italic">
                          "{log.notes}"
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {/* Financing */}
          <Card>
            <SectionHeader
              title="Financing"
              sub="Funding source declared."
              icon={Award}
            />
            <div className="mt-4 p-4 rounded-xl bg-ink-50 dark:bg-ink-800/40 border border-ink-100 dark:border-ink-700">
              <p className="text-[11px] uppercase tracking-wider text-ink-400 font-bold">
                Funding Source
              </p>
              <p className="text-[15px] font-bold text-ink-900 dark:text-white capitalize mt-0.5">
                {app.sponsorship}
              </p>
              {app.sponsor_name && (
                <p className="text-[13px] text-ink-600 dark:text-ink-300 mt-1">
                  {app.sponsor_name}
                </p>
              )}
            </div>
          </Card>

          {/* Merit info */}
          {(app.merit_score != null || app.merit_rank != null) && (
            <Card>
              <SectionHeader
                title="Merit Evaluation"
                sub="Your rank in the cohort."
                icon={Award}
              />
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Stat
                  label="Score"
                  value={
                    app.merit_score != null ? String(app.merit_score) : "—"
                  }
                />
                <Stat
                  label="Rank"
                  value={app.merit_rank != null ? `#${app.merit_rank}` : "—"}
                />
              </div>
            </Card>
          )}
        </div>
      </div>

      {previewDoc && (
        <DocumentPreviewModal
          open={!!previewDoc}
          onClose={() => setPreviewDoc(null)}
          title={previewDoc.document_type_name || "Document Preview"}
          url={
            previewDoc.__payment_slip
              ? applicantService.paymentSlipUrl(previewDoc.document_id)
              : applicantService.downloadUrl(previewDoc.document_id)
          }
          mimeType={previewDoc.file_mime}
        />
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
 * Stage tracker
 * Visualises the canonical 5-stage admission journey:
 *   Submitted → Document Review → Merit Listing → Offer → Enrolled
 * For each stage we compute one of: completed | current | upcoming |
 * rejected, then render a pill row with connectors.
 * ──────────────────────────────────────────────────────────────────── */

type StageState = "completed" | "current" | "upcoming" | "rejected";

const STAGES: Array<{ key: string; label: string }> = [
  { key: "submitted", label: "Submitted" },
  { key: "documents", label: "Document Review" },
  { key: "merit", label: "Merit Listing" },
  { key: "offer", label: "Admission Offer" },
  { key: "enrolled", label: "Enrolled" },
];

function stageStateFor(
  stage: string,
  status: ApplicationStatus,
  log: any[],
): StageState {
  const seen = new Set(log.map((l) => l.to_status));
  switch (stage) {
    case "submitted":
      return status === "draft" ? "upcoming" : "completed";

    case "documents":
      if (status === "documents_rejected" || status === "requested_changes")
        return "rejected";
      if (status === "documents_under_review") return "current";
      if (
        seen.has("documents_verified") ||
        [
          "merit_listed",
          "offered",
          "offer_accepted",
          "offer_declined",
          "enrolled",
        ].includes(status)
      )
        return "completed";
      if (status === "submitted") return "current";
      return "upcoming";

    case "merit":
      if (status === "merit_listed") return "current";
      if (
        ["offered", "offer_accepted", "offer_declined", "enrolled"].includes(
          status,
        )
      )
        return "completed";
      return "upcoming";

    case "offer":
      if (status === "offered") return "current";
      if (status === "offer_declined") return "rejected";
      if (status === "offer_accepted" || status === "enrolled")
        return "completed";
      return "upcoming";

    case "enrolled":
      if (status === "enrolled") return "completed";
      return "upcoming";
  }
  return "upcoming";
}

function StageTracker({
  status,
  log,
}: {
  status: ApplicationStatus;
  log: any[];
}) {
  return (
    <div className="rounded-xl border border-ink-100 dark:border-ink-800 bg-white/50 dark:bg-ink-900/30 p-4 sm:p-5">
      <p className="text-[11px] uppercase tracking-widest font-bold text-ink-400 mb-4">
        Application progress
      </p>
      <ol className="flex items-stretch gap-1 sm:gap-2 overflow-x-auto no-scrollbar">
        {STAGES.map((s, i) => {
          const state = stageStateFor(s.key, status, log);
          const isLast = i === STAGES.length - 1;
          return (
            <li
              key={s.key}
              className="flex items-center gap-1 sm:gap-2 shrink-0"
            >
              <StageNode state={state} label={s.label} />
              {!isLast && (
                <span
                  className={`w-6 sm:w-10 h-0.5 ${
                    state === "completed"
                      ? "bg-emerald-400"
                      : "bg-ink-200 dark:bg-ink-700"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StageNode({ state, label }: { state: StageState; label: string }) {
  const tone =
    state === "completed"
      ? {
          bg: "bg-emerald-100 dark:bg-emerald-900/30",
          text: "text-emerald-700 dark:text-emerald-300",
          icon: <CheckCircle2 className="w-4 h-4" />,
        }
      : state === "current"
        ? {
            bg: "bg-brand/15 dark:bg-brand/25",
            text: "text-brand dark:text-gold-400",
            icon: <Clock className="w-4 h-4 animate-pulse" />,
          }
        : state === "rejected"
          ? {
              bg: "bg-rose-100 dark:bg-rose-900/30",
              text: "text-rose-700 dark:text-rose-300",
              icon: <XCircle className="w-4 h-4" />,
            }
          : {
              bg: "bg-ink-100 dark:bg-ink-800",
              text: "text-ink-500",
              icon: <Circle className="w-4 h-4" />,
            };
  return (
    <div className="flex items-center gap-2">
      <span
        className={`w-7 h-7 rounded-full flex items-center justify-center ${tone.bg} ${tone.text} shrink-0`}
      >
        {tone.icon}
      </span>
      <span
        className={`text-[12px] font-semibold whitespace-nowrap ${tone.text}`}
      >
        {label}
        {state === "rejected" && (
          <span className="ml-1 inline-flex items-center text-[10px] uppercase tracking-wider opacity-80">
            <AlertTriangle className="w-3 h-3 mr-0.5" /> action needed
          </span>
        )}
      </span>
    </div>
  );
}

/* ─── helpers ──────────────────────────────────────────────────────── */

function StatusPillSmall({ status }: { status: string }) {
  const configs = {
    verified: {
      class: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20",
      label: "Verified",
    },
    rejected: {
      class: "text-red-600 bg-red-50 dark:bg-red-900/20",
      label: "Rejected",
    },
    pending: {
      class: "text-amber-600 bg-amber-50 dark:bg-amber-900/20",
      label: "Pending",
    },
  } as const;
  const cfg = (configs as any)[status] || configs.pending;
  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-tight ${cfg.class}`}
    >
      {cfg.label}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const isDraft = status === "draft";
  const isOffer = status.includes("offer");
  const isRejected =
    status === "requested_changes" ||
    status === "documents_rejected" ||
    status === "offer_declined";
  return (
    <span
      className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-tight ${
        isDraft
          ? "bg-ink-100 text-ink-500"
          : isRejected
            ? "bg-red-100 text-red-700"
            : isOffer
              ? "bg-emerald-100 text-emerald-700"
              : "bg-primary-100 text-primary-700"
      }`}
    >
      {String(status).replace(/_/g, " ")}
    </span>
  );
}

function DetailTile({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: any;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="p-4 rounded-2xl bg-ink-50/50 dark:bg-ink-800/30 border border-ink-100 dark:border-ink-700/50 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-white dark:bg-ink-800 flex items-center justify-center text-primary-500 shadow-sm shrink-0">
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-ink-400 font-bold">
          {label}
        </p>
        <p className="text-[13.5px] font-bold text-ink-800 dark:text-ink-100 truncate">
          {value}
        </p>
        {sub && <p className="text-[11px] text-ink-400 truncate">{sub}</p>}
      </div>
    </div>
  );
}

function InfoGroup({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  icon?: any;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wider text-ink-400 font-bold mb-1">
        {label}
      </p>
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-3.5 h-3.5 text-ink-300 shrink-0" />}
        <p className="text-[14px] text-ink-900 dark:text-white font-medium truncate">
          {value}
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-ink-50 dark:bg-ink-800/40 border border-ink-100 dark:border-ink-700 p-3">
      <p className="text-[10px] uppercase tracking-wider font-bold text-ink-400">
        {label}
      </p>
      <p className="text-[16px] font-bold text-ink-900 dark:text-white mt-0.5">
        {value}
      </p>
    </div>
  );
}

function cap(s?: string | null) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function withFlag(
  value: string | null | undefined,
  mode: "country" | "nationality",
): React.ReactNode {
  if (!value) return "—";
  const lookup =
    mode === "nationality" ? COUNTRY_BY_NATIONALITY : COUNTRY_BY_NAME;
  const country = lookup[value.toLowerCase()];
  if (!country) return value;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className="text-[16px] leading-none">
        {countryFlag(country.code)}
      </span>
      <span>{value}</span>
    </span>
  );
}
