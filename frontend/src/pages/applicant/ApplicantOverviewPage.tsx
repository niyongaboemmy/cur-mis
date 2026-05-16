import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  Loader2,
  GraduationCap,
  FileText,
  CheckCircle2,
  AlertCircle,
  UploadCloud,
  Clock,
  Award,
  ChevronRight,
  Plus,
  Download,
  Building2,
  Calendar,
  Sparkles,
  ArrowRight,
  Hash,
  XCircle,
  PlayCircle,
} from "lucide-react";
import { applicantService } from "@/services/admissionService";
import { systemService } from "@/services/systemService";
import { ApplicationStatus } from "@/types/admission";
import Modal from "@/components/ui/Modal";
import { Field } from "@/components/applicant/ApplicantPortalShared";
import ApplicationDetailsView from "@/components/applicant/ApplicationDetailsView";
import DocumentsUploader from "@/components/ui/DocumentsUploader";
import AdmissionLetter from "@/components/admission/AdmissionLetter";

export default function ApplicantOverviewPage() {
  const q = useQuery({
    queryKey: ["applicant", "applications"],
    queryFn: () => applicantService.listApplications(),
  });
  const apps = q.data?.data ?? [];
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const videosQ = useQuery({
    queryKey: ['portal', 'guidance-videos'],
    queryFn: () => systemService.getGuidanceVideos(),
    staleTime: 60_000 * 10,
  });
  const loginVideoUrl = videosQ.data?.data?.video_login_guide_url ?? '';

  if (q.isLoading)
    return (
      <div className="max-w-5xl mx-auto p-12 text-center">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-brand" />
        <p className="text-ink-500 mt-4">Loading your applications...</p>
      </div>
    );

  if (apps.length === 0)
    return (
      <div className="max-w-xl mx-auto py-20 px-4 text-center">
        <div className="w-20 h-20 bg-primary-50 dark:bg-primary-900/30 rounded-3xl flex items-center justify-center mx-auto mb-6 rotate-3 shadow-xl shadow-primary-500/10">
          <GraduationCap className="w-10 h-10 text-primary-600" />
        </div>
        <h2 className="text-2xl font-bold text-ink-900 dark:text-white mb-2">
          Ready to start your journey?
        </h2>
        <p className="text-ink-500 mb-8 leading-relaxed max-w-sm mx-auto">
          Join the Catholic University of Rwanda today. Start your application
          in just a few minutes.
        </p>
        <a
          href="/apply"
          className="btn-primary py-3.5 px-10 text-[16px] rounded-2xl shadow-xl shadow-primary-500/20 hover:shadow-primary-500/40 transition-all active:scale-95"
        >
          Start New Application
        </a>
      </div>
    );

  const selectedApp = selectedId ? apps.find((a) => a.id === selectedId) : null;
  const hasDraft = apps.some((a) => a.status === "draft");
  const hasSubmitted = apps.some((a) => a.status !== "draft");

  const stats = computeStats(apps);

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12">
      {selectedApp ? (
        /* Detail view — replaces the list while one app is selected */
        <ApplicationView
          app={selectedApp}
          onBack={() => setSelectedId(null)}
        />
      ) : (
        /* List view */
        <div className="space-y-6">
          {/* Page header */}
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] font-bold text-primary-600 mb-1">
                Applicant Portal
              </p>
              <h1 className="text-[26px] sm:text-[30px] font-black text-ink-900 dark:text-white tracking-tight leading-tight">
                My Applications
              </h1>
              <p className="text-[13px] text-ink-500 mt-1">
                Track your admission journey, respond to offers, and manage your application files.
              </p>
              {loginVideoUrl && (
                <a
                  href={loginVideoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 mt-2 text-[12px] font-medium text-brand hover:underline"
                >
                  <PlayCircle className="w-3.5 h-3.5" />
                  Watch: How to log in &amp; reset your password
                </a>
              )}
            </div>
            {hasDraft ? (
              <a
                href="/apply"
                className="btn-primary inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <ChevronRight className="w-3.5 h-3.5" /> Continue Draft
              </a>
            ) : !hasSubmitted ? (
              <a
                href="/apply"
                className="btn-primary inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" /> New Application
              </a>
            ) : null}
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              icon={FileText}
              label="Total"
              value={stats.total}
              accent="bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
            />
            <StatCard
              icon={Clock}
              label="In Review"
              value={stats.inReview}
              accent="bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
            />
            <StatCard
              icon={Sparkles}
              label="Offers"
              value={stats.offers}
              accent="bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
              highlight={stats.offers > 0}
            />
            <StatCard
              icon={AlertCircle}
              label="Action Needed"
              value={stats.actionNeeded}
              accent="bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300"
              highlight={stats.actionNeeded > 0}
            />
          </div>

          {/* Section heading */}
          <div className="flex items-center justify-between px-0.5">
            <h3 className="text-[12px] uppercase tracking-[0.2em] font-black text-ink-400 flex items-center gap-2">
              <span className="w-5 h-[3px] bg-primary-500 rounded-full" />
              Your applications
              <span className="text-ink-300 font-bold">·</span>
              <span className="text-ink-500 font-bold">{apps.length}</span>
            </h3>
          </div>

          {/* Cards */}
          <div className="space-y-3.5">
            {apps.map((a) => (
              <ApplicationListItem
                key={a.id}
                app={a}
                onSelect={() => setSelectedId(a.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── stats ──────────────────────────────────────────────────────── */

function computeStats(apps: any[]) {
  let inReview = 0;
  let offers = 0;
  let actionNeeded = 0;
  for (const a of apps) {
    const s = a.status as ApplicationStatus | string;
    if (s === "submitted" || s === "documents_under_review" || s === "documents_verified" || s === "merit_listed") {
      inReview++;
    }
    if (s === "offered" || s === "offer_accepted" || s === "enrolled") {
      offers++;
    }
    if (s === "draft" || s === "documents_rejected" || s === "requested_changes") {
      actionNeeded++;
    }
  }
  return { total: apps.length, inReview, offers, actionNeeded };
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
  highlight,
}: {
  icon: any;
  label: string;
  value: number;
  accent: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`p-4 rounded-2xl border flex items-center gap-3 transition-all ${
        highlight
          ? "border-primary-200 dark:border-primary-800 bg-white dark:bg-ink-900 shadow-sm"
          : "border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/40"
      }`}
    >
      <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${accent}`}>
        <Icon className="w-5 h-5" />
      </span>
      <div className="min-w-0">
        <p className="text-[10.5px] uppercase tracking-wider font-bold text-ink-400">{label}</p>
        <p className="text-[20px] font-black text-ink-900 dark:text-white leading-none mt-1">{value}</p>
      </div>
    </div>
  );
}

/* ─── status presentation ───────────────────────────────────────── */

const STATUS_PRESENT: Record<
  string,
  { label: string; tone: string; dot: string; icon: any; nextStep: string }
> = {
  draft: {
    label: "Draft",
    tone: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-900/40",
    dot: "bg-amber-500",
    icon: FileText,
    nextStep: "Continue and submit your application",
  },
  submitted: {
    label: "Submitted",
    tone: "bg-primary-50 text-primary-700 border-primary-200 dark:bg-primary-900/20 dark:text-primary-300 dark:border-primary-900/40",
    dot: "bg-primary-500",
    icon: CheckCircle2,
    nextStep: "Awaiting initial review by admissions",
  },
  documents_under_review: {
    label: "Docs Under Review",
    tone: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-900/40",
    dot: "bg-amber-500",
    icon: Clock,
    nextStep: "Your documents are being verified",
  },
  documents_verified: {
    label: "Docs Verified",
    tone: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-900/40",
    dot: "bg-emerald-500",
    icon: CheckCircle2,
    nextStep: "Awaiting merit list publication",
  },
  documents_rejected: {
    label: "Docs Rejected",
    tone: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-900/40",
    dot: "bg-red-500",
    icon: XCircle,
    nextStep: "Re-upload the requested documents",
  },
  requested_changes: {
    label: "Changes Requested",
    tone: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-900/40",
    dot: "bg-red-500",
    icon: AlertCircle,
    nextStep: "Review the message from admissions",
  },
  merit_listed: {
    label: "Merit Listed",
    tone: "bg-primary-50 text-primary-700 border-primary-200 dark:bg-primary-900/20 dark:text-primary-300 dark:border-primary-900/40",
    dot: "bg-primary-500",
    icon: Award,
    nextStep: "Watch for an admission offer",
  },
  offered: {
    label: "Offer Received",
    tone: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-900/40",
    dot: "bg-emerald-500",
    icon: Sparkles,
    nextStep: "Respond to your admission offer",
  },
  offer_accepted: {
    label: "Offer Accepted",
    tone: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-900/40",
    dot: "bg-emerald-500",
    icon: CheckCircle2,
    nextStep: "Enrollment is being finalized",
  },
  offer_declined: {
    label: "Offer Declined",
    tone: "bg-ink-50 text-ink-600 border-ink-200 dark:bg-ink-800 dark:text-ink-300 dark:border-ink-700",
    dot: "bg-ink-400",
    icon: XCircle,
    nextStep: "This offer was declined",
  },
  enrolled: {
    label: "Enrolled",
    tone: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-900/40",
    dot: "bg-emerald-500",
    icon: CheckCircle2,
    nextStep: "Welcome to CUR",
  },
  withdrawn: {
    label: "Withdrawn",
    tone: "bg-ink-50 text-ink-600 border-ink-200 dark:bg-ink-800 dark:text-ink-300 dark:border-ink-700",
    dot: "bg-ink-400",
    icon: XCircle,
    nextStep: "This application was withdrawn",
  },
};

const STAGE_ORDER = [
  "submitted",
  "documents_under_review",
  "merit_listed",
  "offered",
  "enrolled",
] as const;

function stageProgress(status: string): number {
  switch (status) {
    case "draft":
      return 0;
    case "submitted":
      return 1;
    case "documents_under_review":
    case "documents_verified":
    case "documents_rejected":
    case "requested_changes":
      return 2;
    case "merit_listed":
      return 3;
    case "offered":
    case "offer_accepted":
    case "offer_declined":
      return 4;
    case "enrolled":
      return 5;
    case "withdrawn":
      return 0;
    default:
      return 1;
  }
}

function ApplicationListItem({
  app,
  onSelect,
}: {
  app: any;
  onSelect: () => void;
}) {
  const isDraft = app.status === "draft";
  const isOffered = app.status === "offered";
  const isActionNeeded =
    app.status === "documents_rejected" || app.status === "requested_changes";
  const meta = STATUS_PRESENT[app.status] ?? STATUS_PRESENT.submitted;
  const StatusIcon = meta.icon;
  const progress = stageProgress(app.status);
  const totalStages = STAGE_ORDER.length;

  return (
    <button
      onClick={() => {
        if (isDraft) {
          window.location.href = "/apply";
          return;
        }
        onSelect();
      }}
      className={`relative w-full text-left rounded-2xl border bg-white dark:bg-ink-900 transition-all group overflow-hidden hover:-translate-y-0.5 hover:shadow-lg ${
        isOffered
          ? "border-emerald-200 dark:border-emerald-800/60 ring-1 ring-emerald-200/40 dark:ring-emerald-900/40"
          : isActionNeeded
            ? "border-red-200 dark:border-red-800/60"
            : "border-ink-100 dark:border-ink-800 hover:border-primary-300 dark:hover:border-primary-700"
      }`}
    >
      <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
        {/* Icon block */}
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <div
            className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${
              isOffered
                ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600"
                : isActionNeeded
                  ? "bg-red-50 dark:bg-red-900/30 text-red-600"
                  : "bg-primary-50 dark:bg-primary-900/30 text-primary-600"
            }`}
          >
            <GraduationCap className="w-6 h-6 sm:w-7 sm:h-7" />
          </div>

          {/* Title block */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-[10.5px] font-mono font-black text-primary-600 bg-primary-50 dark:bg-primary-900/20 px-2 py-0.5 rounded">
                <Hash className="w-2.5 h-2.5 inline -mt-0.5" />
                {app.application_number}
              </span>
              <span className="w-0.5 h-0.5 rounded-full bg-ink-200" />
              <span className="text-[11px] font-medium text-ink-400 inline-flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {new Date(app.created_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
              {isOffered && (
                <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-500 text-white animate-pulse">
                  New Offer
                </span>
              )}
            </div>
            <h4 className="text-[16px] sm:text-[17px] font-black text-ink-900 dark:text-white truncate">
              {app.program_name ?? app.department_name ?? "—"}
            </h4>
            <div className="flex items-center gap-3 mt-0.5 text-[12.5px] text-ink-500 flex-wrap">
              {app.faculty_name && (
                <span className="truncate">{app.faculty_name}</span>
              )}
              {app.campus_name && (
                <>
                  <span className="w-0.5 h-0.5 rounded-full bg-ink-300 shrink-0" />
                  <span className="inline-flex items-center gap-1 truncate">
                    <Building2 className="w-3 h-3" />
                    {app.campus_name}
                  </span>
                </>
              )}
              {app.intake && (
                <>
                  <span className="w-0.5 h-0.5 rounded-full bg-ink-300 shrink-0" />
                  <span className="truncate">{app.intake}</span>
                </>
              )}
            </div>
            <p className="text-[12px] text-ink-400 mt-1.5 italic truncate">
              {meta.nextStep}
            </p>
          </div>
        </div>

        {/* Status block */}
        <div className="flex sm:flex-col items-center sm:items-end justify-between gap-3 shrink-0 pt-3 sm:pt-0 border-t sm:border-0 border-ink-100 dark:border-ink-800">
          <span
            className={`inline-flex items-center gap-1.5 text-[10.5px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest border ${meta.tone}`}
          >
            <StatusIcon className="w-3 h-3" />
            {meta.label}
          </span>

          <div className="flex items-center gap-2">
            {isDraft ? (
              <span className="inline-flex items-center gap-1 text-[10.5px] font-black px-3 py-1.5 rounded-full uppercase tracking-widest bg-primary-600 text-white shadow-sm">
                Continue <ArrowRight className="w-3 h-3" />
              </span>
            ) : (
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold text-ink-500 group-hover:text-primary-600 transition-colors">
                View details
                <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Progress mini-tracker */}
      {!isDraft && app.status !== "withdrawn" && (
        <div className="px-4 sm:px-5 pb-4 sm:pb-5 -mt-1">
          <div className="flex items-center gap-1">
            {STAGE_ORDER.map((_, i) => {
              const reached = i < progress;
              const current = i === progress - 1;
              return (
                <span
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    reached
                      ? current
                        ? `${meta.dot}`
                        : "bg-emerald-400"
                      : "bg-ink-100 dark:bg-ink-800"
                  }`}
                />
              );
            })}
          </div>
          <div className="flex items-center justify-between mt-1.5 text-[10.5px] text-ink-400 font-medium">
            <span>Stage {progress} of {totalStages}</span>
            <span className="capitalize">{STAGE_ORDER[Math.max(0, progress - 1)].replace(/_/g, " ")}</span>
          </div>
        </div>
      )}
    </button>
  );
}

function ApplicationView({ app, onBack }: { app: any; onBack?: () => void }) {
  const [editing, setEditing] = useState(false);
  const qc = useQueryClient();

  const detailsQ = useQuery({
    queryKey: ["applicant", "application", app.id],
    queryFn: () => applicantService.getApplicationDetails(app.id),
  });
  const details = detailsQ.data?.data;

  const timelineQ = useQuery({
    queryKey: ["applicant", "application", app.id, "timeline"],
    queryFn: () => applicantService.getApplicationTimeline(app.id),
  });
  const timeline = timelineQ.data?.data;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-400 space-y-6">
      <ApplicationStepIndicator
        currentStatus={app.status}
        timeline={timeline?.timeline ?? []}
      />

      {/* Offer Banner */}
      {app.status === "offered" && details && (
        <AdmissionOfferBanner
          app={app}
          details={details}
          onRespond={() =>
            qc.invalidateQueries({ queryKey: ["applicant", "applications"] })
          }
        />
      )}

      {/* Accepted Confirmation */}
      {(app.status === "offer_accepted" || app.status === "enrolled") && (
        <div className="p-6 bg-emerald-50 border border-emerald-200 dark:bg-emerald-900/10 dark:border-emerald-900/50 rounded-2xl flex flex-col sm:flex-row items-center gap-6">
          <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-800 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-7 h-7 text-emerald-600" />
          </div>
          <div className="text-center sm:text-left flex-1">
            <h3 className="text-lg font-black text-emerald-900 dark:text-emerald-100 uppercase tracking-tight">
              {app.status === "enrolled" ? "Enrollment Complete!" : "Admission Confirmed!"}
            </h3>
            <p className="text-[13px] text-emerald-800 dark:text-emerald-300 mt-1 leading-relaxed">
              {app.status === "enrolled"
                ? "Your enrollment is complete. Check your email for your Student Registration Number."
                : "You have accepted the admission offer. Our admissions team is finalizing your enrollment."}
            </p>
          </div>
          {(details as any)?.offer?.letter_token && (
            <a
              href={`${import.meta.env.VITE_API_URL ?? ''}/api/portal/admission-letter?token=${(details as any).offer.letter_token}`}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-black uppercase tracking-widest transition-colors"
            >
              <Download className="w-4 h-4" /> Download Letter
            </a>
          )}
        </div>
      )}

      {/* Requested Changes Banner */}
      {app.status === ApplicationStatus.REQUESTED_CHANGES && (
        <div className="p-6 bg-red-50 border-red-200 dark:bg-red-900/10 dark:border-red-900/50 rounded-2xl flex flex-col sm:flex-row items-start gap-6 animate-in slide-in-from-top-4 duration-500">
          <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0 border border-red-200 dark:border-red-900/50">
            <AlertCircle className="w-7 h-7 text-red-600 dark:text-red-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-black text-red-900 dark:text-red-100 uppercase tracking-tight flex items-center gap-2">
              Action Required: Changes Requested
              <span className="px-2 py-0.5 bg-red-600 text-white text-[10px] rounded-full">Urgent</span>
            </h3>
            {app.rejection_reason && (
              <div className="mt-3 p-4 bg-white/50 dark:bg-black/20 rounded-xl border border-red-100 dark:border-red-900/20">
                <p className="text-[11px] font-black text-red-500 uppercase tracking-widest mb-1">Message from Admissions Office:</p>
                <p className="text-[14px] text-red-800 dark:text-red-300 font-medium leading-relaxed">
                  {app.rejection_reason}
                </p>
              </div>
            )}
            <p className="text-[13px] text-red-700 dark:text-red-400 mt-3 leading-relaxed">
              Please review the document checklist below. Rejected documents are highlighted and must be re-uploaded to proceed with your application.
            </p>
          </div>
        </div>
      )}

      <ApplicationDetailsView
        application={app}
        onEdit={() => setEditing(true)}
        onBack={onBack}
      />

      {editing && (
        <EditApplicationModal
          appId={app.id}
          onClose={() => setEditing(false)}
          onSuccess={() => {
            setEditing(false);
            qc.invalidateQueries({ queryKey: ["applicant", "applications"] });
            qc.invalidateQueries({
              queryKey: ["applicant", "application", app.id],
            });
          }}
        />
      )}
    </div>
  );
}

function AdmissionOfferBanner({
  app,
  details,
  onRespond,
}: {
  app: any;
  details: any;
  onRespond: () => void;
}) {
  const [viewingLetter, setViewingLetter] = useState(false);
  const [responding, setResponding] = useState<"accepted" | "declined" | null>(
    null,
  );

  const respond = useMutation({
    mutationFn: (response: "accepted" | "declined") =>
      applicantService.respondToOffer(app.id, { response }),
    onSuccess: () => {
      toast.success(
        responding === "accepted"
          ? "Admission Accepted! Welcome aboard."
          : "Response recorded.",
      );
      setResponding(null);
      onRespond();
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? "Response failed"),
  });

  return (
    <section className="card p-0 overflow-hidden border-2 border-amber-500 shadow-2xl shadow-amber-500/10 ring-4 ring-amber-500/5">
      <div className="bg-gradient-to-r from-amber-500 to-amber-600 p-6 text-white flex flex-col md:flex-row items-center gap-6">
        <div className="w-20 h-20 rounded-3xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/30 rotate-3 shadow-lg">
          <Award className="w-10 h-10 text-white" />
        </div>
        <div className="flex-1 text-center md:text-left">
          <p className="text-[12px] font-black uppercase tracking-[0.2em] opacity-80 leading-none mb-2">
            Congratulations
          </p>
          <h2 className="text-2xl md:text-3xl font-black tracking-tight leading-tight">
            You're Admitted!
          </h2>
          <p className="text-[14px] font-medium opacity-90 mt-1 max-w-lg">
            We are pleased to offer you admission to the{" "}
            <span className="font-bold underline decoration-white/30 underline-offset-4">
              {app.department_name}
            </span>{" "}
            program. Please review your offer letter below.
          </p>
        </div>
        <div className="flex flex-col gap-3 shrink-0">
          <button
            className="btn-white px-8 py-3 rounded-2xl font-black uppercase tracking-widest text-[12px] shadow-xl shadow-black/10 hover:-translate-y-0.5 transition-transform"
            onClick={() => setViewingLetter(true)}
          >
            <FileText className="w-4 h-4 mr-2" /> View Offer Letter
          </button>
          {details.offer?.letter_token && (
            <a
              href={`${import.meta.env.VITE_API_URL ?? ''}/api/portal/admission-letter?token=${details.offer.letter_token}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 px-8 py-3 rounded-2xl font-black uppercase tracking-widest text-[12px] bg-white/20 hover:bg-white/30 text-white border border-white/30 transition-colors"
            >
              <Download className="w-4 h-4" /> Download PDF
            </a>
          )}
        </div>
      </div>

      <div className="p-6 bg-amber-50 dark:bg-amber-900/10 flex flex-col sm:flex-row items-center justify-between gap-6 border-t border-amber-200 dark:border-amber-900/50">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-[13px] font-bold text-amber-800 dark:text-amber-200">
            <Clock className="w-4 h-4" /> Expires:{" "}
            {new Date(details.offer?.expires_at).toLocaleDateString()}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            className="px-6 py-2.5 text-[13px] font-black uppercase tracking-widest text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
            onClick={() => setResponding("declined")}
            disabled={respond.isPending}
          >
            Decline
          </button>
          <button
            className="btn-primary px-8 py-3 rounded-xl font-black uppercase tracking-widest text-[13px] shadow-lg shadow-primary-500/20"
            onClick={() => setResponding("accepted")}
            disabled={respond.isPending}
          >
            Accept Admission
          </button>
        </div>
      </div>

      {/* View Letter Modal */}
      <Modal
        open={viewingLetter}
        onClose={() => setViewingLetter(false)}
        title="Admission Letter"
        size="lg"
      >
        <div className="bg-slate-100 p-8 rounded-2xl overflow-y-auto max-h-[70vh]">
          {details.offer && (
            <AdmissionLetter
              offer={{
                ...details.offer,
                first_name: app.first_name,
                last_name: app.last_name,
                email: app.email,
                application_number: app.application_number,
                department_name: app.department_name,
                offered_at: new Date().toISOString(), // Fallback
              }}
            />
          )}
        </div>
      </Modal>

      {/* Confirmation Modal */}
      <Modal
        open={!!responding}
        onClose={() => setResponding(null)}
        title={responding === "accepted" ? "Accept Admission" : "Decline Offer"}
        footer={
          <>
            <button
              className="btn-secondary"
              onClick={() => setResponding(null)}
            >
              Cancel
            </button>
            <button
              className={`btn-${responding === "accepted" ? "primary" : "danger"}`}
              onClick={() => responding && respond.mutate(responding)}
              disabled={respond.isPending}
            >
              {respond.isPending && (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              )}
              {responding === "accepted"
                ? "Confirm Acceptance"
                : "Confirm Decline"}
            </button>
          </>
        }
      >
        <p className="text-[15px] leading-relaxed text-ink-700 dark:text-ink-300">
          {responding === "accepted"
            ? "By clicking confirm, you accept our offer of admission and agree to abide by the university's rules and regulations. This action is final."
            : "Are you sure you want to decline this admission offer? This action cannot be undone."}
        </p>
      </Modal>
    </section>
  );
}

function EditApplicationModal({
  appId,
  onClose,
  onSuccess,
}: {
  appId: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"details" | "documents">(
    "details",
  );
  const applicationQ = useQuery({
    queryKey: ["applicant", "application", appId],
    queryFn: () => applicantService.getApplicationDetails(appId),
  });
  const app = applicationQ.data?.data;
  const [form, setForm] = useState<any>(null);

  useEffect(() => {
    if (app && !form) {
      setForm({
        first_name: app.first_name,
        last_name: app.last_name,
        phone: app.phone,
        gender: app.gender,
        birthdate: app.birthdate,
        nationality: app.nationality,
        address: app.address,
        prev_school: app.prev_school,
        prev_qualification: app.prev_qualification,
        prev_grade: app.prev_grade,
        graduation_year: app.graduation_year,
        sponsorship: app.sponsorship,
        sponsor_name: app.sponsor_name,
      });
    }
  }, [app, form]);

  const mutation = useMutation({
    mutationFn: (d: any) => applicantService.updateApplication(appId, d),
    onSuccess: () => {
      toast.success("Application details updated");
      onSuccess();
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? "Failed to update"),
  });

  if (!app || !form) return null;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Manage Application: ${app.application_number}`}
      size="xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <p className="text-[11px] text-ink-400 font-medium">
            Last saved:{" "}
            {new Date(app.updated_at || app.created_at!).toLocaleString()}
          </p>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={onClose}>
              Close
            </button>
            {activeTab === "details" && (
              <button
                className="btn-primary"
                onClick={() => mutation.mutate(form)}
                disabled={mutation.isPending}
              >
                {mutation.isPending && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}{" "}
                Save Details
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="flex border-b border-ink-100 dark:border-ink-800 mb-6">
        <TabBtn
          active={activeTab === "details"}
          onClick={() => setActiveTab("details")}
          label="General Details"
          icon={FileText}
        />
        <TabBtn
          active={activeTab === "documents"}
          onClick={() => setActiveTab("documents")}
          label="Documents Checklist"
          icon={UploadCloud}
        />
      </div>

      {activeTab === "details" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="First name">
            <input
              className="input"
              value={form.first_name}
              onChange={(e) => setForm({ ...form, first_name: e.target.value })}
            />
          </Field>
          <Field label="Last name">
            <input
              className="input"
              value={form.last_name}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })}
            />
          </Field>
          <Field label="Phone number">
            <input
              className="input"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Field>
          <Field label="Gender">
            <select
              className="input"
              value={form.gender}
              onChange={(e) => setForm({ ...form, gender: e.target.value })}
            >
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </Field>
          <Field label="Birthdate">
            <input
              type="date"
              className="input"
              value={form.birthdate}
              onChange={(e) => setForm({ ...form, birthdate: e.target.value })}
            />
          </Field>
          <Field label="Nationality">
            <input
              className="input"
              value={form.nationality}
              onChange={(e) =>
                setForm({ ...form, nationality: e.target.value })
              }
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Address">
              <textarea
                className="input h-20"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </Field>
          </div>

          <div className="sm:col-span-2 pt-4 border-t border-ink-50 dark:border-ink-800 mt-2">
            <h4 className="text-[13px] font-bold text-ink-900 dark:text-white">
              Academic History
            </h4>
          </div>
          <Field label="Previous school">
            <input
              className="input"
              value={form.prev_school}
              onChange={(e) =>
                setForm({ ...form, prev_school: e.target.value })
              }
            />
          </Field>
          <Field label="Qualification">
            <input
              className="input"
              value={form.prev_qualification}
              onChange={(e) =>
                setForm({ ...form, prev_qualification: e.target.value })
              }
            />
          </Field>
          <Field label="Grade/Result">
            <input
              className="input"
              value={form.prev_grade}
              onChange={(e) => setForm({ ...form, prev_grade: e.target.value })}
            />
          </Field>
          <Field label="Graduation year">
            <input
              type="number"
              className="input"
              value={form.graduation_year}
              onChange={(e) =>
                setForm({ ...form, graduation_year: Number(e.target.value) })
              }
            />
          </Field>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/50 rounded-2xl flex gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-amber-900 dark:text-amber-200">
                Required Documents Checklist
              </p>
              <p className="text-[12px] text-amber-800 dark:text-amber-300 leading-relaxed mt-1">
                Ensure all required files are uploaded and readable. You can
                replace files until they are verified by the admissions office.
              </p>
            </div>
          </div>

          <DocumentsUploader
            requirements={app.document_checklist ?? []}
            uploaded={
              (app.document_checklist ?? [])
                .filter((i: any) => i.uploaded)
                .map((i: any) => ({
                  id: i.document_id,
                  document_type_id: i.document_type_id,
                  file_original_name: i.file_original_name,
                  verification_status: i.verification_status,
                  rejection_notes: i.rejection_notes,
                  file_mime: i.file_mime,
                })) as any
            }
            onUpload={({ document_type_id, file }) =>
              applicantService.uploadDocument({ document_type_id, file })
            }
            invalidateKeys={[["applicant", "application", appId]]}
          />
        </div>
      )}
    </Modal>
  );
}

function TabBtn({
  active,
  onClick,
  label,
  icon: Icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: any;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-6 py-4 text-[13.5px] font-bold flex items-center gap-2 border-b-2 transition-all ${active ? "border-primary-500 text-primary-600" : "border-transparent text-ink-400 hover:text-ink-600"}`}
    >
      <Icon className="w-4 h-4" /> {label}
    </button>
  );
}

/* ──────────────────────────────────────────────────────────────────────
 * Application progress stepper (Task 1.10).
 * Shows every stage in the admission lifecycle, marks completed stages
 * with a checkmark + date, highlights the current stage and grays out
 * what's still ahead.
 * ──────────────────────────────────────────────────────────────────── */
const PROGRESS_STAGES: { status: string; label: string }[] = [
  { status: 'submitted',              label: 'Application Submitted' },
  { status: 'documents_under_review', label: 'Documents Under Review' },
  { status: 'documents_verified',     label: 'Documents Verified' },
  { status: 'offered',                label: 'Offer Made' },
  { status: 'offer_accepted',         label: 'Offer Accepted' },
  { status: 'enrolled',               label: 'Enrolled' },
];

function ApplicationStepIndicator({
  currentStatus, timeline,
}: {
  currentStatus: string
  timeline: Array<{ to_status: string; created_at: string }>
}) {
  if (currentStatus === 'draft' || currentStatus === 'withdrawn') {
    return null;
  }
  // Map status → first date it was reached (for the checkmark label).
  const reached = new Map<string, string>();
  for (const entry of timeline) {
    if (!reached.has(entry.to_status)) reached.set(entry.to_status, entry.created_at);
  }
  const currentIdx = (() => {
    const i = PROGRESS_STAGES.findIndex((s) => s.status === currentStatus);
    if (i >= 0) return i;
    // unknown intermediate status — treat as documents review.
    return 1;
  })();

  return (
    <section className="rounded-2xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900 p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[12.5px] font-semibold text-ink-900 dark:text-white uppercase tracking-wider">
          Application progress
        </h3>
        <a
          href="/messages"
          className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-brand hover:underline"
          title="Open the messaging center to contact the registry"
        >
          Contact registry &rarr;
        </a>
      </div>
      <ol className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {PROGRESS_STAGES.map((stage, idx) => {
          const done    = idx < currentIdx;
          const current = idx === currentIdx;
          const date    = reached.get(stage.status);
          return (
            <li key={stage.status} className="relative">
              <div className={
                'flex flex-col items-center text-center gap-2 p-3 rounded-xl border transition-colors ' +
                (done
                  ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-900/15 dark:border-emerald-900/50'
                  : current
                    ? 'border-brand bg-primary-50 dark:bg-primary-900/20 ring-2 ring-primary-200 dark:ring-primary-900/40'
                    : 'border-ink-100 dark:border-ink-800 bg-ink-50/50 dark:bg-ink-800/30')
              }>
                <span className={
                  'w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold ' +
                  (done
                    ? 'bg-emerald-500 text-white'
                    : current
                      ? 'bg-brand text-white'
                      : 'bg-ink-200 dark:bg-ink-700 text-ink-500')
                }>
                  {done ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                </span>
                <p className={
                  'text-[11.5px] font-semibold leading-tight ' +
                  (current
                    ? 'text-brand'
                    : done
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : 'text-ink-500')
                }>
                  {stage.label}
                </p>
                {date && (
                  <p className="text-[10px] text-ink-400">
                    {(() => {
                      try {
                        const d = new Date(date.replace(' ', 'T'));
                        return isNaN(d.getTime()) ? date : d.toLocaleDateString();
                      } catch { return date; }
                    })()}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
