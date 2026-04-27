import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
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
  MessageSquarePlus,
  ChevronRight,
  Eye,
  Calendar,
  AlertCircle,
  Download,
  FileCheck2,
  CreditCard,
  UserPlus,
  ExternalLink,
  XCircle,
  Cpu,
  BarChart2,
  ClipboardList,
  UserCheck,
} from "lucide-react";
import {
  applicationAdminService,
  verificationService,
  offerService,
  manualAdmissionService,
} from "@/services/admissionService";
import { academicsMgmtService } from "@/services/academicsMgmtService";
import { ApplicationStatus, VerificationStatus } from "@/types/admission";
import DocumentPreviewModal from "./DocumentPreviewModal";
import RequestChangesModal from "./RequestChangesModal";

const STATUS_OPTIONS: ApplicationStatus[] = [
  ApplicationStatus.SUBMITTED,
  ApplicationStatus.DOCUMENTS_UNDER_REVIEW,
  ApplicationStatus.DOCUMENTS_VERIFIED,
  ApplicationStatus.DOCUMENTS_REJECTED,
  ApplicationStatus.REQUESTED_CHANGES,
  ApplicationStatus.OFFERED,
  ApplicationStatus.OFFER_ACCEPTED,
  ApplicationStatus.OFFER_DECLINED,
  ApplicationStatus.ENROLLED,
  ApplicationStatus.WITHDRAWN,
];

function getStepForStatus(s: ApplicationStatus): number {
  if (
    [
      ApplicationStatus.SUBMITTED,
      ApplicationStatus.DOCUMENTS_UNDER_REVIEW,
      ApplicationStatus.DOCUMENTS_REJECTED,
      ApplicationStatus.REQUESTED_CHANGES,
    ].includes(s)
  )
    return 1;
  if ([ApplicationStatus.DOCUMENTS_VERIFIED].includes(s)) return 2;
  if ([ApplicationStatus.OFFERED].includes(s)) return 3;
  if (
    [ApplicationStatus.OFFER_ACCEPTED, ApplicationStatus.ENROLLED].includes(s)
  )
    return 4;
  return 1;
}

function MultiStepBar({
  maxStep,
  activeStep,
  setActiveStep,
}: {
  maxStep: number;
  activeStep: number;
  setActiveStep: (n: number) => void;
}) {
  const steps = [
    { id: 1, label: "Document Validation" },
    { id: 2, label: "Accepted & Waiting Fee" },
    { id: 3, label: "Registration Fee Paid" },
    { id: 4, label: "Enrolled & Registered" },
  ];

  return (
    <div className="card p-8 mb-8 bg-ink-50/30 dark:bg-ink-800/20 border-brand/10">
      <div className="flex items-center justify-between relative px-8">
        <div className="absolute top-5 left-16 right-16 h-0.5 bg-ink-100 dark:bg-ink-800 z-0" />
        <div
          className="absolute top-5 left-16 h-0.5 bg-brand transition-all duration-1000 ease-out z-0"
          style={{
            width:
              maxStep >= steps.length
                ? "calc(100% - 128px)"
                : `calc(${((maxStep - 1) / (steps.length - 1)) * 100}%)`,
          }}
        />
        {steps.map((step) => {
          const isCompleted = maxStep > step.id;
          const isActive = activeStep === step.id;
          const isClickable = step.id <= maxStep;
          return (
            <div
              key={step.id}
              className="relative z-10 flex flex-col items-center"
            >
              <button
                onClick={() => isClickable && setActiveStep(step.id)}
                disabled={!isClickable}
                className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-500 outline-none ${
                  isCompleted
                    ? "bg-emerald-500 text-white shadow-emerald-500/20 rotate-0 cursor-pointer hover:bg-emerald-600"
                    : isActive
                      ? "bg-brand text-white shadow-brand/20 ring-4 ring-brand/10 scale-110 cursor-default"
                      : isClickable
                        ? "bg-white dark:bg-ink-900 border-2 border-brand text-brand cursor-pointer hover:bg-brand/10"
                        : "bg-white dark:bg-ink-900 border-2 border-ink-200 dark:border-ink-700 text-ink-400 cursor-not-allowed opacity-60"
                }`}
              >
                {isCompleted ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : step.id === 3 ? (
                  <CreditCard className="w-5 h-5" />
                ) : step.id === 4 ? (
                  <UserPlus className="w-5 h-5" />
                ) : (
                  <span className="text-[14px] font-black">{step.id}</span>
                )}
              </button>
              <p
                className={`mt-4 text-[10px] font-black uppercase tracking-[0.2em] text-center max-w-[120px] transition-colors duration-500 ${
                  isActive
                    ? "text-brand"
                    : isCompleted
                      ? "text-emerald-600"
                      : "text-ink-400"
                }`}
              >
                {step.label}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const appId = Number(id);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [noteInput, setNoteInput] = useState("");

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [isRequestChangesOpen, setIsRequestChangesOpen] = useState(false);
  const [activeStep, setActiveStep] = useState(1);
  const [selectedLevelId, setSelectedLevelId] = useState<number>(1);

  const appQ = useQuery({
    queryKey: ["admin", "applications", appId],
    queryFn: () => applicationAdminService.show(appId),
    enabled: !!appId,
  });

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
      qc.invalidateQueries({ queryKey: ["admin", "applications", appId] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Failed"),
  });

  const enroll = useMutation({
    mutationFn: (levelId: number) =>
      offerService.initiateEnrollmentByAppId(appId, { level_id: levelId }),
    onSuccess: (res: any) => {
      toast.success("Student enrolled and registration number generated!");
      qc.invalidateQueries({ queryKey: ["admin", "applications", appId] });
      const studentId = res.data?.student_id;
      const regNo = res.data?.regnumber;

      if (studentId) {
        navigate(`/students/${studentId}`);
      } else if (regNo) {
        navigate(`/students?q=${encodeURIComponent(regNo)}`);
      }
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Failed"),
  });

  const issueOffer = useMutation({
    mutationFn: () => {
      // Calculate default expiry: 14 days from now
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + 14);
      const expiresAt = expiry.toISOString().slice(0, 10);
      return manualAdmissionService.admit({
        application_id: appId,
        expires_at: expiresAt,
        notes: "Admitted via direct document approval",
      });
    },
    onSuccess: () => {
      toast.success("Admission offer created and applicant notified!");
      qc.invalidateQueries({ queryKey: ["admin", "applications", appId] });
      qc.invalidateQueries({ queryKey: ["admin", "applications"] });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? "Failed to issue offer"),
  });

  const confirmPayment = useMutation({
    mutationFn: () => applicationAdminService.acceptOfferByAppId(appId),
    onSuccess: () => {
      toast.success(
        "Fee payment confirmed — application is ready for enrollment.",
      );
      qc.invalidateQueries({ queryKey: ["admin", "applications", appId] });
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

  const requestChangesSuccess = () => {
    toast.success("Changes requested and applicant notified.");
    qc.invalidateQueries({ queryKey: ["admin", "applications", appId] });
    qc.invalidateQueries({ queryKey: ["admin", "verifications"] });
  };

  const appData = appQ.data?.data;
  const app = appData?.application;
  const criteria = appData?.merit_criteria;
  const listing = appData?.merit_listing;
  const status =
    (app?.status as ApplicationStatus) || ApplicationStatus.SUBMITTED;
  const maxStep = getStepForStatus(status);

  // Queries for levels and modules
  const levelsQ = useQuery({
    queryKey: ["acmgmt", "levels"],
    queryFn: () => academicsMgmtService.list("levels", { per_page: 100 }),
  });
  const levels = levelsQ.data?.data?.data || [];

  const modulesQ = useQuery({
    queryKey: ["acmgmt", "modules", app?.department_id, selectedLevelId],
    queryFn: () =>
      academicsMgmtService.list("modules", {
        department: app?.department_id,
        level: selectedLevelId,
        per_page: 100,
      }),
    enabled: !!app?.department_id && !!selectedLevelId,
  });
  const modules = modulesQ.data?.data?.data || [];

  useEffect(() => {
    if (status) {
      setActiveStep(getStepForStatus(status));
    }
  }, [status]);

  if (appQ.isLoading)
    return (
      <p className="text-ink-500 text-[13px] flex items-center gap-2 p-4">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </p>
    );
  if (!appData || !app)
    return (
      <p className="text-ink-500 text-[13px] p-4">Application not found.</p>
    );

  const docs = appData.documents ?? [];
  const statusLog = appData.status_log ?? [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Breadcrumb + queue navigation */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Link
          to="/admin/admissions/applications"
          className="inline-flex items-center gap-1 text-[12.5px] text-ink-500 hover:text-brand"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to list
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

      <MultiStepBar
        maxStep={getStepForStatus(status)}
        activeStep={activeStep}
        setActiveStep={setActiveStep}
      />

      {/* Application Header Card */}
      <div className="card p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-brand/10 flex items-center justify-center text-brand shrink-0">
              <FileText className="w-8 h-8" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-widest font-bold text-ink-400">
                Application Reference
              </p>
              <h2 className="text-[24px] font-mono font-black text-brand leading-tight">
                {app.application_number}
              </h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <StatusPill status={status} />
                {app.submitted_at && (
                  <span className="text-[13px] text-ink-500 font-medium">
                    Submitted on{" "}
                    {new Date(app.submitted_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <p className="text-[10px] uppercase tracking-widest font-black text-ink-400">
              Application Options
            </p>
            <div className="flex items-center gap-2">
              <select
                className="input py-1.5 text-[12px] w-40"
                value={status}
                onChange={(e) => {
                  const s = e.target.value as ApplicationStatus;
                  if (
                    window.confirm(
                      `Are you sure you want to change the status to ${s.replace(/_/g, " ")}?`,
                    )
                  ) {
                    updateStatus.mutate(s);
                  }
                }}
                disabled={updateStatus.isPending}
              >
                <option value="" disabled>
                  Change Status
                </option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-8">
          <DetailTile
            icon={Building2}
            label="Faculty"
            value={app.faculty_name ?? `#${app.faculty_id}`}
          />
          <DetailTile
            icon={GraduationCap}
            label="Department"
            value={app.department_name ?? `#${app.department_id}`}
          />
          <DetailTile
            icon={Calendar}
            label="Intake"
            value={app.intake ?? "—"}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">
        {/* LEFT: Step Content */}
        <div className="space-y-6">
          {activeStep === 1 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="space-y-6">
                {/* Personal Details */}
                <section className="card p-6">
                  <SectionHeader
                    title="Personal Details"
                    sub="Identity and contact information."
                    icon={User}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-6">
                    <InfoGroup
                      label="Full Name"
                      value={`${app.first_name} ${app.last_name}`}
                    />
                    <InfoGroup label="Email" value={app.email} icon={Mail} />
                    <InfoGroup label="Phone" value={app.phone} icon={Phone} />
                    <InfoGroup label="Gender" value={app.gender} />
                    <InfoGroup
                      label="Date of Birth"
                      value={app.birthdate}
                      icon={CalendarDays}
                    />
                    <InfoGroup
                      label="Nationality"
                      value={app.nationality}
                      icon={MapPin}
                    />
                    <div className="sm:col-span-2">
                      <InfoGroup
                        label="Address"
                        value={app.address || "Not provided"}
                        icon={MapPin}
                      />
                    </div>
                  </div>
                </section>

                {/* Academic Background */}
                <section className="card p-6">
                  <SectionHeader
                    title="Academic Background"
                    sub="Previous education history."
                    icon={GraduationCap}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-6">
                    <InfoGroup
                      label="Previous School"
                      value={app.prev_school}
                    />
                    <InfoGroup
                      label="Qualification"
                      value={app.prev_qualification}
                    />
                    <InfoGroup label="Mean Grade" value={app.prev_grade} />
                    <InfoGroup
                      label="Graduation Year"
                      value={String(app.graduation_year ?? "—")}
                    />
                  </div>
                </section>

                {/* Admission Algorithm Considerations */}
                <section className="card p-6 border-brand/20 bg-brand/[0.01]">
                  <div className="flex items-center justify-between mb-6">
                    <SectionHeader
                      title="Admission Considerations"
                      sub="How this applicant matches the department algorithm settings."
                      icon={Cpu}
                    />
                    {criteria && (
                      <div
                        className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 ${
                          criteria.algorithm_type === "merit_based"
                            ? "bg-brand/10 text-brand"
                            : criteria.algorithm_type ===
                                "first_come_first_served"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {criteria.algorithm_type === "merit_based" ? (
                          <BarChart2 className="w-3 h-3" />
                        ) : criteria.algorithm_type ===
                          "first_come_first_served" ? (
                          <ClipboardList className="w-3 h-3" />
                        ) : (
                          <UserCheck className="w-3 h-3" />
                        )}
                        {criteria.algorithm_type.replace(/_/g, " ")}
                      </div>
                    )}
                  </div>

                  {!criteria ? (
                    <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/50 flex items-center gap-3 text-[13px] text-amber-800 dark:text-amber-300">
                      <AlertCircle className="w-5 h-5 shrink-0" />
                      No admission algorithm has been configured for this
                      department and intake yet.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
                      <div className="space-y-1">
                        <ConsiderationRow
                          label="Mean Grade"
                          value={app.prev_grade}
                          threshold={criteria.min_grade}
                          met={(() => {
                            if (!criteria.min_grade) return true;
                            if (!app.prev_grade) return false;
                            const appGrade = parseFloat(
                              app.prev_grade.replace("%", ""),
                            );
                            const minGrade = parseFloat(
                              criteria.min_grade.replace("%", ""),
                            );
                            return !isNaN(appGrade) && !isNaN(minGrade)
                              ? appGrade >= minGrade
                              : true;
                          })()}
                        />
                        <ConsiderationRow
                          label="Combination"
                          value={app.combination || "General"}
                          threshold={
                            criteria.required_combinations
                              ? JSON.parse(criteria.required_combinations).join(
                                  ", ",
                                )
                              : "Any"
                          }
                          met={(() => {
                            if (!criteria.required_combinations) return true;
                            const allowed = JSON.parse(
                              criteria.required_combinations,
                            ).map((s: string) => s.toUpperCase());
                            return allowed.includes(
                              app.combination?.toUpperCase(),
                            );
                          })()}
                        />
                      </div>
                      <div className="space-y-1">
                        <ConsiderationRow
                          label="Ranking Status"
                          value={
                            listing
                              ? `Ranked #${listing.rank}`
                              : "Not Generated"
                          }
                          met={listing ? !!listing.is_qualified : undefined}
                        />
                        <ConsiderationRow
                          label="Merit Score"
                          value={
                            listing
                              ? `${Number(listing.merit_score).toFixed(2)}%`
                              : app.merit_score
                                ? `${Number(app.merit_score).toFixed(2)}%`
                                : "—"
                          }
                          threshold={
                            criteria.cutoff_score
                              ? `${criteria.cutoff_score}%`
                              : undefined
                          }
                          met={
                            listing
                              ? criteria.cutoff_score
                                ? Number(listing.merit_score) >=
                                  Number(criteria.cutoff_score)
                                : true
                              : undefined
                          }
                        />
                      </div>
                    </div>
                  )}

                  {listing && (
                    <div className="mt-6 pt-4 border-t border-ink-100 dark:border-ink-800 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-2.5 h-2.5 rounded-full ${listing.is_qualified ? "bg-emerald-500 animate-pulse" : "bg-ink-300"}`}
                        />
                        <span className="text-[12px] font-black text-ink-600 dark:text-ink-400 uppercase tracking-widest">
                          Result:{" "}
                          {listing.is_qualified
                            ? "QUALIFIED FOR ADMISSION"
                            : "REJECTED BY ALGORITHM"}
                        </span>
                      </div>
                      <span className="text-[11px] text-ink-400 italic">
                        Generated{" "}
                        {new Date(listing.generated_at).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </section>

                {/* Document Verification Checklist */}
                <section className="card p-0 overflow-hidden border-brand/20">
                  <div className="p-6 border-b border-ink-100 dark:border-ink-800 flex items-center justify-between flex-wrap gap-4 bg-brand/[0.02]">
                    <SectionHeader
                      title="Required Documents"
                      sub="Review each document for authenticity and readability."
                      icon={FileText}
                    />
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-[10px] uppercase tracking-widest font-black text-ink-400">
                          Progress
                        </p>
                        <p className="text-[16px] font-black text-ink-900 dark:text-white">
                          {
                            docs.filter(
                              (d: any) =>
                                d.verification_status ===
                                VerificationStatus.VERIFIED,
                            ).length
                          }{" "}
                          / {docs.length}{" "}
                          <span className="text-[12px] font-normal text-ink-500 ml-1">
                            Verified
                          </span>
                        </p>
                      </div>
                      {docs.length > 0 && (
                        <div className="w-12 h-12 rounded-full border-4 border-emerald-100 dark:border-emerald-900/30 flex items-center justify-center">
                          <span className="text-[12px] font-black text-emerald-600">
                            {Math.round(
                              (docs.filter(
                                (d: any) =>
                                  d.verification_status ===
                                  VerificationStatus.VERIFIED,
                              ).length /
                                docs.length) *
                                100,
                            )}
                            %
                          </span>
                        </div>
                      )}
                      {docs.length > 0 && (
                        <button
                          onClick={() => {
                            setPreviewIndex(0);
                            setIsPreviewOpen(true);
                          }}
                          className="btn-secondary ml-2 border-brand/20 text-brand hover:bg-brand/5"
                        >
                          <Eye className="w-4 h-4 mr-2" /> Preview All
                        </button>
                      )}
                      {docs.length > 0 && (
                        <Link
                          to={`/admin/admissions/verifications/${app.id}/validate`}
                          className="btn-primary ml-2 shadow-lg shadow-brand/20"
                        >
                          {docs.every(
                            (d: any) =>
                              d.verification_status !==
                              VerificationStatus.PENDING,
                          )
                            ? "Review Validation"
                            : "Start Validation"}{" "}
                          <ChevronRight className="w-4 h-4 ml-1" />
                        </Link>
                      )}
                      {docs.some(
                        (d: any) =>
                          d.verification_status === VerificationStatus.REJECTED,
                      ) &&
                        app.status !== ApplicationStatus.DOCUMENTS_REJECTED && (
                          <button
                            className="btn-secondary ml-2 border-red-200 text-red-600 hover:bg-red-50"
                            onClick={() => setIsRequestChangesOpen(true)}
                          >
                            <AlertCircle className="w-4 h-4 mr-2" />
                            Request Changes
                          </button>
                        )}
                    </div>
                  </div>

                  {docs.length === 0 ? (
                    <div className="p-12 text-center">
                      <FileText className="w-12 h-12 text-ink-200 mx-auto mb-4" />
                      <p className="text-[14px] text-ink-500">
                        No documents uploaded yet.
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-ink-100 dark:divide-ink-800">
                      {docs.map((d: any, idx: number) => (
                        <div
                          key={d.id}
                          className={`p-5 transition-all duration-300 ${
                            d.verification_status ===
                            VerificationStatus.VERIFIED
                              ? "bg-emerald-50/30 dark:bg-emerald-900/5"
                              : d.verification_status ===
                                  VerificationStatus.REJECTED
                                ? "bg-red-50/5 dark:bg-red-900/5"
                                : ""
                          }`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-4 min-w-0">
                              <div
                                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${d.verification_status === VerificationStatus.VERIFIED ? "bg-emerald-50 text-emerald-600" : d.verification_status === VerificationStatus.REJECTED ? "bg-red-50 text-red-600" : "bg-ink-100 text-ink-500"}`}
                              >
                                <FileText className="w-5 h-5" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-[14px] font-black text-ink-900 dark:text-white truncate flex items-center gap-2">
                                  {d.type_name ??
                                    `Document Type #${d.document_type_id}`}
                                  {d.verification_status ===
                                    VerificationStatus.VERIFIED && (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                  )}
                                </p>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  <span className="text-[12px] text-ink-500 truncate max-w-[200px]">
                                    {d.file_original_name}
                                  </span>
                                  <span className="text-ink-300">·</span>
                                  <span className="text-[11px] text-ink-400 font-medium uppercase">
                                    {Math.ceil((d.file_size || 0) / 1024)} KB
                                  </span>
                                  <DocStatusPill
                                    status={d.verification_status}
                                  />
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => {
                                  setPreviewIndex(idx);
                                  setIsPreviewOpen(true);
                                }}
                                className="p-2 rounded-lg hover:bg-ink-100 dark:hover:bg-ink-800 text-ink-500 transition-colors"
                                title="Preview Document"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <Link
                                to={`/admin/admissions/verifications/${app.id}/validate?index=${idx}`}
                                className="p-2 rounded-lg hover:bg-brand/10 text-brand transition-colors"
                                title="Update Validation Status"
                              >
                                <FileCheck2 className="w-4 h-4" />
                              </Link>
                              <a
                                href={verificationService.downloadUrl(
                                  app.id,
                                  d.id,
                                )}
                                target="_blank"
                                rel="noreferrer"
                                className="p-2 rounded-lg hover:bg-ink-100 dark:hover:bg-ink-800 text-ink-500 transition-colors"
                                title="Download Document"
                              >
                                <Download className="w-4 h-4" />
                              </a>
                            </div>
                          </div>

                          {d.verification_comment && (
                            <div className="mt-4 ml-14 animate-in fade-in slide-in-from-top-2 duration-300">
                              <div
                                className={`rounded-2xl p-4 border ${
                                  d.verification_status ===
                                  VerificationStatus.REJECTED
                                    ? "bg-red-50/50 dark:bg-red-900/10 border-red-100 dark:border-red-900/30"
                                    : "bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-900/30"
                                }`}
                              >
                                <p
                                  className={`text-[12px] font-black uppercase tracking-widest flex items-center gap-2 mb-1 ${
                                    d.verification_status ===
                                    VerificationStatus.REJECTED
                                      ? "text-red-600"
                                      : "text-emerald-600"
                                  }`}
                                >
                                  {d.verification_status ===
                                  VerificationStatus.REJECTED ? (
                                    <AlertCircle className="w-3.5 h-3.5" />
                                  ) : (
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                  )}
                                  {d.verification_status ===
                                  VerificationStatus.REJECTED
                                    ? "Rejection Reason"
                                    : "Validator Comment"}
                                </p>
                                <p
                                  className={`text-[13px] font-medium ${
                                    d.verification_status ===
                                    VerificationStatus.REJECTED
                                      ? "text-red-700 dark:text-red-400"
                                      : "text-emerald-700 dark:text-emerald-400"
                                  }`}
                                >
                                  {d.verification_comment}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {docs.length > 0 &&
                    docs.filter((d: any) => d.verification_status === "pending")
                      .length === 0 &&
                    nextApp && (
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
                            navigate(
                              `/admin/admissions/applications/${nextApp.id}`,
                            )
                          }
                        >
                          Review Next <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                </section>
              </div>

              {/* Step 1 Actions & Next */}
              <div className="flex items-center justify-between mt-4">
                <div className="flex gap-2">
                  {(status === ApplicationStatus.SUBMITTED ||
                    status === ApplicationStatus.DOCUMENTS_UNDER_REVIEW) && (
                    <>
                      <button
                        className="btn-primary py-2 px-6 shadow-lg shadow-brand/20"
                        onClick={() => {
                          if (
                            docs.some(
                              (d) =>
                                d.verification_status ===
                                VerificationStatus.PENDING,
                            )
                          ) {
                            toast.error("Please review all documents first.");
                            return;
                          }
                          if (
                            window.confirm(
                              "Approve all documents and move to next step?",
                            )
                          ) {
                            updateStatus.mutate(
                              ApplicationStatus.DOCUMENTS_VERIFIED,
                            );
                          }
                        }}
                        disabled={updateStatus.isPending}
                      >
                        <CheckCircle2 className="w-4 h-4 mr-2" /> Approve All
                        Documents
                      </button>
                      <button
                        className="btn-secondary py-2 px-6 border-red-200 text-red-600 hover:bg-red-50"
                        onClick={() => setIsRequestChangesOpen(true)}
                      >
                        <AlertCircle className="w-4 h-4 mr-2" /> Request Changes
                      </button>
                    </>
                  )}
                </div>
                {maxStep >= 2 && (
                  <button
                    className="btn-secondary ml-auto"
                    onClick={() => setActiveStep(2)}
                  >
                    Proceed to Step 2 <ChevronRight className="w-4 h-4 ml-2" />
                  </button>
                )}
              </div>
            </div>
          )}

          {activeStep === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <section className="card p-8 text-center">
                <Mail className="w-16 h-16 text-brand/20 mx-auto mb-4" />
                <h3 className="text-xl font-black text-ink-900 dark:text-white mb-2">
                  Admission Offer
                </h3>
                <p className="text-ink-500 text-[14px] mb-8 max-w-sm mx-auto">
                  Documents have been verified. You can now issue an admission
                  offer to the applicant.
                </p>
                {status === ApplicationStatus.DOCUMENTS_VERIFIED ? (
                  <button
                    className="btn-primary py-3 px-8 text-[14px] flex items-center justify-center gap-2 mx-auto shadow-xl shadow-brand/20"
                    onClick={() => {
                      if (
                        window.confirm(
                          "Generate admission offer and notify applicant?",
                        )
                      ) {
                        issueOffer.mutate();
                      }
                    }}
                    disabled={issueOffer.isPending}
                  >
                    <Mail className="w-5 h-5" /> Issue Admission Offer
                  </button>
                ) : (
                  <div className="flex flex-col items-center">
                    <p className="text-emerald-600 font-bold flex items-center gap-2 mb-4">
                      <CheckCircle2 className="w-5 h-5" /> Admission Offer
                      Issued
                    </p>
                    {maxStep >= 3 && (
                      <button
                        className="btn-secondary"
                        onClick={() => setActiveStep(3)}
                      >
                        Proceed to Step 3{" "}
                        <ChevronRight className="w-4 h-4 ml-2" />
                      </button>
                    )}
                  </div>
                )}
              </section>
            </div>
          )}

          {activeStep === 3 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <section className="card p-8 text-center">
                <CreditCard className="w-16 h-16 text-emerald-500/20 mx-auto mb-4" />
                <h3 className="text-xl font-black text-ink-900 dark:text-white mb-2">
                  Registration Fee
                </h3>
                <p className="text-ink-500 text-[14px] mb-8 max-w-sm mx-auto">
                  Applicant has received the offer. Confirm fee payment to
                  proceed.
                </p>
                {status === ApplicationStatus.OFFERED ? (
                  <button
                    className="btn-primary py-3 px-8 text-[14px] flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 shadow-xl shadow-emerald-500/20 mx-auto"
                    onClick={() => {
                      if (
                        window.confirm("Simulate registration fee payment?")
                      ) {
                        confirmPayment.mutate();
                      }
                    }}
                    disabled={confirmPayment.isPending}
                  >
                    <CreditCard className="w-5 h-5" /> Confirm Fee Payment
                  </button>
                ) : (
                  <div className="flex flex-col items-center">
                    <p className="text-emerald-600 font-bold flex items-center gap-2 mb-4">
                      <CheckCircle2 className="w-5 h-5" /> Fee Payment Confirmed
                    </p>
                    {maxStep >= 4 && (
                      <button
                        className="btn-secondary"
                        onClick={() => setActiveStep(4)}
                      >
                        Proceed to Step 4{" "}
                        <ChevronRight className="w-4 h-4 ml-2" />
                      </button>
                    )}
                  </div>
                )}
              </section>
            </div>
          )}

          {activeStep === 4 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <section className="card overflow-hidden text-center">
                <div className="p-8">
                  <UserPlus className="w-16 h-16 text-indigo-500/20 mx-auto mb-4" />
                  <h3 className="text-xl font-black text-ink-900 dark:text-white mb-2">
                    Finalize Enrollment
                  </h3>
                  <p className="text-ink-500 text-[14px] mb-8 max-w-sm mx-auto">
                    Fee payment is confirmed. Please review the enrollment
                    details before generating the official registration number.
                  </p>

                  {/* Enrollment Details Summary */}
                  <div className="text-left bg-ink-50 dark:bg-ink-800/30 rounded-2xl p-6 border border-ink-100 dark:border-ink-800 mb-8 max-w-3xl mx-auto">
                    <h4 className="text-[11px] font-black uppercase tracking-widest text-ink-400 mb-4 border-b border-ink-100 dark:border-ink-800 pb-2">
                      Program Details
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <InfoGroup label="Faculty" value={app.faculty_name} />
                      <InfoGroup
                        label="Department"
                        value={app.department_name}
                      />
                      <InfoGroup label="Intake Session" value={app.intake} />
                      <InfoGroup
                        label="Academic Year"
                        value={app.academic_year_label || "Current"}
                      />

                      <div className="sm:col-span-2 pt-2 border-t border-ink-100 dark:border-ink-800">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-[11px] uppercase tracking-wider text-indigo-400 font-bold">
                            Subjects & Modules
                          </p>
                          <div className="flex items-center gap-2">
                            <label className="text-[11px] font-bold text-ink-500 uppercase">
                              Assign Level:
                            </label>
                            <select
                              className="input py-1 px-2 text-[12px] min-w-[120px]"
                              value={selectedLevelId}
                              onChange={(e) =>
                                setSelectedLevelId(Number(e.target.value))
                              }
                            >
                              {levels.map((lvl: any) => (
                                <option key={lvl.id} value={lvl.id}>
                                  {lvl.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <p className="text-[13px] text-indigo-900 dark:text-indigo-200 leading-relaxed mb-3">
                          Upon enrollment, the student will be assigned to the
                          standard curriculum for{" "}
                          <strong>{app.department_name}</strong> at the selected
                          level. The following core subjects will be registered
                          automatically.
                        </p>

                        {modulesQ.isLoading ? (
                          <div className="flex items-center gap-2 text-[12px] text-ink-500 py-2">
                            <Loader2 className="w-4 h-4 animate-spin" /> Loading
                            modules...
                          </div>
                        ) : modules.length > 0 ? (
                          <div className="bg-white dark:bg-ink-950/50 rounded-xl border border-ink-100 dark:border-ink-800 max-h-60 overflow-y-auto mt-2">
                            <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                              {modules.map((m: any) => (
                                <li
                                  key={m.id}
                                  className="p-3 flex items-start gap-3"
                                >
                                  <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
                                    <FileText className="w-3.5 h-3.5 text-indigo-500" />
                                  </div>
                                  <div>
                                    <p className="text-[12px] font-black text-ink-900 dark:text-white leading-tight">
                                      {m.module_name}
                                    </p>
                                    <p className="text-[11px] text-ink-400 font-mono mt-0.5">
                                      {m.module_code} · {m.module_credits}{" "}
                                      Credits
                                    </p>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : (
                          <div className="p-4 rounded-xl border border-dashed border-ink-200 dark:border-ink-800 text-center">
                            <p className="text-[12px] text-ink-500">
                              No modules found for this department at the
                              selected level.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {status === ApplicationStatus.OFFER_ACCEPTED ? (
                    <button
                      className="btn-primary py-3 px-8 text-[14px] flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 shadow-xl shadow-green-500/20 mx-auto"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Finalize registration at level ID ${selectedLevelId} and generate Registration Number?`,
                          )
                        ) {
                          enroll.mutate(selectedLevelId);
                        }
                      }}
                      disabled={enroll.isPending}
                    >
                      {enroll.isPending ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <UserPlus className="w-5 h-5" />
                      )}
                      Confirm & Enroll Student
                    </button>
                  ) : status === ApplicationStatus.ENROLLED ? (
                    <div className="flex flex-col items-center gap-3">
                      <p className="text-green-600 font-bold flex items-center gap-2 justify-center">
                        <CheckCircle2 className="w-5 h-5" /> Student is fully
                        enrolled.
                      </p>
                      <button
                        onClick={() => {
                          if (app.student_id) {
                            navigate(`/students/${app.student_id}`);
                          } else {
                            // Fallback to search by email if ID not yet synced
                            navigate(
                              `/students?q=${encodeURIComponent(app.email)}`,
                            );
                          }
                        }}
                        className="btn-secondary border-green-200 text-green-700 hover:bg-green-50 shadow-sm"
                      >
                        <ExternalLink className="w-4 h-4 mr-2" /> View Student
                        Profile
                      </button>
                    </div>
                  ) : null}
                </div>
              </section>
            </div>
          )}
        </div>

        {/* RIGHT: Status History + Internal Notes + Financing */}
        <div className="space-y-6">
          {/* Status History */}
          <section className="card p-6">
            <SectionHeader title="Status History" sub="Progress tracking." />
            <div className="mt-6 space-y-4">
              {statusLog.length > 0 ? (
                <div className="relative pl-4 space-y-6 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-0.5 before:bg-ink-100 dark:before:bg-ink-800">
                  {statusLog.map((l: any, idx: number) => (
                    <div key={idx} className="relative">
                      <div className="absolute -left-[19px] top-1.5 w-2.5 h-2.5 rounded-full bg-brand ring-4 ring-white dark:ring-ink-900" />
                      <p className="text-[12.5px] font-bold text-ink-900 dark:text-white capitalize">
                        {l.to_status.replace(/_/g, " ")}
                        <span className="text-[11px] font-medium text-ink-400 ml-2">
                          {l.actor_type}
                        </span>
                      </p>
                      <p className="text-[11px] text-ink-400 mt-0.5">
                        {new Date(l.created_at).toLocaleString()}
                      </p>
                      {l.notes && (
                        <p className="text-[12px] text-ink-500 mt-1 italic">
                          "{l.notes}"
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[12px] text-ink-400 text-center py-4">
                  No history available.
                </p>
              )}
            </div>
          </section>

          {/* Financing */}
          <section className="card p-6">
            <SectionHeader title="Financing" sub="" />
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
          </section>

          {/* Internal Notes */}
          <section className="card p-6 border-brand/20 shadow-sm">
            <SectionHeader
              title="Internal Review Notes"
              sub="Admin-only — never shown to the applicant."
              icon={MessageSquarePlus}
            />
            <div className="mt-4 space-y-3">
              <textarea
                className="input min-h-[100px] text-[13px] bg-brand/5 focus:bg-white transition-colors"
                placeholder="Admin-only notes…"
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
              />
              <div className="flex justify-end">
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
                  Save Note
                </button>
              </div>
              {app.internal_notes && (
                <div className="rounded-xl bg-brand/5 p-4 text-[13px] leading-relaxed whitespace-pre-wrap text-ink-800 dark:text-ink-200 border border-brand/10">
                  {app.internal_notes}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      <DocumentPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        documents={docs}
        initialIndex={previewIndex}
        applicationId={appId}
      />
      <RequestChangesModal
        isOpen={isRequestChangesOpen}
        onClose={() => setIsRequestChangesOpen(false)}
        applicationId={appId}
        documents={docs}
        onSuccess={requestChangesSuccess}
      />
    </div>
  );
}

/* ── Shared sub-components ─────────────────────────────────────── */

function ConsiderationRow({
  label,
  value,
  threshold,
  met,
}: {
  label: string;
  value: any;
  threshold?: any;
  met?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-ink-100 dark:border-ink-800 last:border-0">
      <div className="flex flex-col">
        <span className="text-[11px] font-black uppercase tracking-wider text-ink-400">
          {label}
        </span>
        <span className="text-[14px] font-bold text-ink-800 dark:text-ink-200">
          {value || "—"}{" "}
          {threshold && (
            <span className="text-ink-400 font-medium ml-1">
              · Target: {threshold}
            </span>
          )}
        </span>
      </div>
      {met !== undefined && (
        <div
          className={`w-6 h-6 rounded-full flex items-center justify-center ${met ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"}`}
        >
          {met ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <XCircle className="w-4 h-4" />
          )}
        </div>
      )}
    </div>
  );
}

function SectionHeader({
  title,
  sub,
  icon: Icon,
}: {
  title: string;
  sub: string;
  icon?: any;
}) {
  return (
    <div className="flex items-center gap-3 mb-1">
      {Icon && (
        <div className="w-8 h-8 rounded-xl bg-brand/10 flex items-center justify-center text-brand shrink-0">
          <Icon className="w-4 h-4" />
        </div>
      )}
      <div>
        <h3 className="text-[15px] font-black text-ink-900 dark:text-white leading-tight">
          {title}
        </h3>
        {sub && <p className="text-[12px] text-ink-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function DetailTile({
  icon: Icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: string;
}) {
  return (
    <div className="p-4 rounded-2xl bg-ink-50/50 dark:bg-ink-800/30 border border-ink-100 dark:border-ink-700/50 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-white dark:bg-ink-800 flex items-center justify-center text-brand shadow-sm">
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-ink-400 font-bold">
          {label}
        </p>
        <p className="text-[13.5px] font-bold text-ink-800 dark:text-ink-100 truncate">
          {value || "—"}
        </p>
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
  value?: string | null;
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
          {value || "—"}
        </p>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  if (!status) return null;
  const isOffer = status.includes("offer");
  const isVerified =
    status === ApplicationStatus.DOCUMENTS_VERIFIED ||
    status === ApplicationStatus.ENROLLED;
  return (
    <span
      className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-tight ${
        isVerified
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20"
          : isOffer
            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/20"
            : "bg-brand/10 text-brand"
      }`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function DocStatusPill({ status }: { status: string }) {
  const configs: Record<string, { cls: string; label: string }> = {
    [VerificationStatus.VERIFIED]: {
      cls: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20",
      label: "Verified",
    },
    [VerificationStatus.REJECTED]: {
      cls: "text-red-600 bg-red-50 dark:bg-red-900/20",
      label: "Rejected",
    },
    [VerificationStatus.PENDING]: {
      cls: "text-amber-600 bg-amber-50 dark:bg-amber-900/20",
      label: "Pending",
    },
  };
  const cfg = configs[status] ?? configs.pending;
  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-tight ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  );
}
