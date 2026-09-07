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
  X,
  ZoomIn,
  FileSearch,
  Sparkles,
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
import ModalPortal from "@/components/ui/ModalPortal";
import AdmissionFeesPanel from "@/components/admission/AdmissionFeesPanel";
import PaymentHistoryPanel from "@/components/admission/PaymentHistoryPanel";
import { PERMISSIONS } from "@/constants";
import { usePermission } from "@/utils/permissions";
import { useLevels } from "@/hooks/useLevels";
import ApplicationEditModal from "@/components/admin/ApplicationEditModal";
import ApplicationDeleteModal from "@/components/admin/ApplicationDeleteModal";

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
    {
      id: 1,
      label: "Documents",
      sublabel: "Verify uploads",
      icon: FileSearch,
    },
    {
      id: 2,
      label: "Offered",
      sublabel: "Awaiting fee",
      icon: Sparkles,
    },
    {
      id: 3,
      label: "Admission fees",
      sublabel: "Billed & paid",
      icon: CreditCard,
    },
    {
      id: 4,
      label: "Enrolled",
      sublabel: "Reg # issued",
      icon: UserPlus,
    },
  ];

  // Progress bar fill percentage — sits behind the step circles.
  const progressPct =
    maxStep >= steps.length
      ? 100
      : Math.max(0, ((maxStep - 1) / (steps.length - 1)) * 100);

  return (
    <div className="card overflow-hidden">
      <div className="px-5 sm:px-8 pt-5 pb-2 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-ink-400">
            Admission pipeline
          </p>
          <p className="text-[12.5px] text-ink-500 mt-0.5">
            {maxStep >= steps.length
              ? "All stages complete — student is enrolled."
              : `On stage ${maxStep} of ${steps.length}: ${steps[Math.max(0, maxStep - 1)].label}`}
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-medium text-ink-500">
          <span className="w-2 h-2 rounded-full bg-emerald-500" /> done
          <span className="w-2 h-2 rounded-full bg-brand ml-2" /> current
          <span className="w-2 h-2 rounded-full bg-ink-300 dark:bg-ink-700 ml-2" /> pending
        </div>
      </div>

      <div className="relative px-5 sm:px-12 pt-6 pb-8">
        {/* Track: grey baseline + emerald fill up to maxStep. Anchored so
            the line aligns with the centre of the step circles. */}
        <div className="absolute top-[44px] left-[40px] right-[40px] sm:left-[64px] sm:right-[64px] h-0.5 bg-ink-100 dark:bg-ink-800 rounded-full" />
        <div
          className="absolute top-[44px] left-[40px] sm:left-[64px] h-0.5 bg-gradient-to-r from-emerald-500 to-brand rounded-full transition-all duration-700 ease-out"
          style={{
            width: `calc((100% - 80px) * ${progressPct / 100})`,
          }}
        />

        <div className="relative z-10 grid grid-cols-4 gap-2">
          {steps.map((step) => {
            const Icon = step.icon;
            const isCompleted = maxStep > step.id;
            const isCurrent = maxStep === step.id;
            const isActive = activeStep === step.id;
            const isClickable = step.id <= maxStep;
            const dotClass = isCompleted
              ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
              : isCurrent
                ? "bg-brand text-white shadow-lg shadow-brand/30 ring-4 ring-brand/15"
                : "bg-white dark:bg-ink-800 text-ink-400 border-2 border-ink-200 dark:border-ink-700";

            return (
              <button
                key={step.id}
                onClick={() => isClickable && setActiveStep(step.id)}
                disabled={!isClickable}
                className={
                  "group flex flex-col items-center text-center transition-all " +
                  (isClickable
                    ? "cursor-pointer hover:-translate-y-0.5"
                    : "cursor-not-allowed opacity-60")
                }
              >
                <span
                  className={
                    "w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-300 " +
                    dotClass +
                    (isActive && !isCurrent ? " ring-4 ring-brand/15" : "")
                  }
                >
                  {isCompleted ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <Icon className="w-5 h-5" />
                  )}
                </span>
                <p
                  className={
                    "mt-3 text-[11.5px] font-bold uppercase tracking-wider transition-colors " +
                    (isCurrent
                      ? "text-brand"
                      : isCompleted
                        ? "text-emerald-700 dark:text-emerald-300"
                        : "text-ink-500")
                  }
                >
                  {step.label}
                </p>
                <p
                  className={
                    "text-[10.5px] mt-0.5 transition-colors " +
                    (isCurrent ? "text-ink-600 dark:text-ink-300" : "text-ink-400")
                  }
                >
                  {step.sublabel}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const appId = Number(id);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const canManage = usePermission(PERMISSIONS.MANAGE_ADMISSIONS);
  const [noteInput, setNoteInput] = useState("");

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [isRequestChangesOpen, setIsRequestChangesOpen] = useState(false);
  const [activeStep, setActiveStep] = useState(1);
  const [selectedLevelId, setSelectedLevelId] = useState<number>(1);
  const [photoLightboxOpen, setPhotoLightboxOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

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

  const approveAllDocs = useMutation({
    mutationFn: async (pendingDocIds: number[]) => {
      for (const docId of pendingDocIds) {
        await verificationService.verifyDocument(appId, docId, {
          verification_status: "verified",
        });
      }
      await applicationAdminService.updateStatus(appId, {
        status: ApplicationStatus.DOCUMENTS_VERIFIED,
      });
    },
    onSuccess: () => {
      toast.success("All documents approved");
      qc.invalidateQueries({ queryKey: ["admin", "applications"] });
      qc.invalidateQueries({ queryKey: ["admin", "applications", appId] });
      qc.invalidateQueries({ queryKey: ["admin", "verifications"] });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? "Failed to approve documents"),
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

  const acceptOffer = useMutation({
    mutationFn: () => applicationAdminService.acceptOfferByAppId(appId),
    onSuccess: () => {
      toast.success("Offer accepted. Applicant can now proceed with payment.");
      qc.invalidateQueries({ queryKey: ["admin", "applications", appId] });
      qc.invalidateQueries({ queryKey: ["admin", "applications"] });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? "Failed to accept offer"),
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

  const { levelName: levelNameOf } = useLevels();

  // Queries for levels and modules
  const levelsQ = useQuery({
    queryKey: ["acmgmt", "levels"],
    queryFn: () => academicsMgmtService.list("levels", { per_page: 100 }),
  });
  const levels = levelsQ.data?.data?.data || [];
  // Confirmation prompts name the level the registrar picked — "level ID 3"
  // told them nothing about which year of study they were finalising.
  const selectedLevelLabel =
    (levels as any[]).find((l: any) => Number(l.id) === Number(selectedLevelId))?.name
    ?? `level #${selectedLevelId}`;

  // Selected program (option) the applicant chose. Falls back to department
  // when older applications didn't capture program_id, so the screen still
  // renders something sensible.
  const programId = (app as any)?.program_id ?? null;

  const modulesQ = useQuery({
    queryKey: ["acmgmt", "modules", "byProgram", programId, app?.department_id],
    queryFn: () =>
      academicsMgmtService.list("modules", {
        ...(programId
          ? { program: programId }
          : { department: app?.department_id }),
        per_page: 500,
      }),
    enabled: !!programId || !!app?.department_id,
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

  // The API returns the full requirement checklist: every document required for
  // the applicant's faculty, including the ones with nothing attached yet
  // (id === null). `docs` keeps only real uploads for preview/validation flows.
  const checklist = (appData.documents ?? []) as any[];
  const docs = checklist.filter((d: any) => d.id != null);
  const missingDocs = checklist.filter((d: any) => d.id == null);
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
            <ApplicantAvatarLg
              photoUrl={applicationAdminService.photoUrl(
                appId,
                (app as any).applicant_photo_id ?? null,
              )}
              initials={`${(app.first_name ?? '').charAt(0)}${(app.last_name ?? '').charAt(0)}`.toUpperCase() || '?'}
              onClick={() => {
                if ((app as any).applicant_photo_id) setPhotoLightboxOpen(true);
              }}
            />
            <div>
              <h2 className="text-[20px] font-bold text-ink-900 dark:text-white leading-tight">
                {`${app.first_name ?? ''} ${app.last_name ?? ''}`.trim() || 'Unnamed applicant'}
              </h2>
              <p className="text-[12px] text-ink-500 mt-0.5 truncate">
                {app.email ?? '—'}{app.phone ? ` · ${app.phone}` : ''}
              </p>
              <p className="text-[11px] uppercase tracking-widest font-bold text-ink-400 mt-2">
                Application Reference
              </p>
              <p className="text-[14px] font-mono font-bold text-brand leading-tight">
                {app.application_number}
              </p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <StatusPill status={status} />
                {app.submitted_at && (
                  <span className="text-[12px] text-ink-500 font-medium">
                    Submitted {new Date(app.submitted_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <p className="text-[10px] uppercase tracking-widest font-black text-ink-400">
              Application Options
            </p>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <button
                className="btn-secondary btn-sm"
                onClick={() => setIsEditModalOpen(true)}
                title="Edit applicant information"
              >
                Edit
              </button>
              <button
                className="btn-secondary btn-sm !text-red-600 hover:!bg-red-50 dark:hover:!bg-red-900/10"
                onClick={() => setIsDeleteModalOpen(true)}
                title="Delete application and request resubmission"
              >
                Delete
              </button>
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
                    {s === ApplicationStatus.SUBMITTED ? "Pending" : s.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-8">
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
            icon={MapPin}
            label="Campus"
            value={
              (app as any).campus_name ??
              ((app as any).campus_id ? `#${(app as any).campus_id}` : '—')
            }
          />
          <DetailTile
            icon={CalendarDays}
            label="Mode"
            value={(app as any).mode_of_study ?? '—'}
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
                    sub="Identity, contact and parental info."
                    icon={User}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5 mt-6">
                    <InfoGroup label="Full Name" value={`${app.first_name ?? ''} ${app.last_name ?? ''}`.trim() || '—'} />
                    <InfoGroup label="Father's Name" value={(app as any).father || '—'} />
                    <InfoGroup label="Mother's Name" value={(app as any).mother || '—'} />
                    <InfoGroup label="Gender" value={app.gender === 'M' ? 'Male' : app.gender === 'F' ? 'Female' : (app.gender || '—')} />
                    <InfoGroup label="Date of Birth" value={app.birthdate} icon={CalendarDays} />
                    <InfoGroup label="Marital Status" value={cap((app as any).marital_status) || '—'} />
                    <InfoGroup label="National ID / Passport" value={(app as any).national_id || '—'} />
                    <InfoGroup label="Nationality" value={app.nationality} icon={MapPin} />
                    <InfoGroup label="Country of Residence" value={(app as any).country_of_residence || '—'} icon={MapPin} />
                    <InfoGroup label="Disability" value={(app as any).disability || 'None'} />
                  </div>
                </section>

                {/* Contact */}
                <section className="card p-6">
                  <SectionHeader
                    title="Contact"
                    sub="How we reach the applicant."
                    icon={Phone}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5 mt-6">
                    <InfoGroup label="Phone" value={app.phone || '—'} icon={Phone} />
                    <InfoGroup label="Reference Person Phone" value={(app as any).reference_phone || '—'} icon={Phone} />
                    <InfoGroup label="Email" value={app.email || '—'} icon={Mail} />
                  </div>
                </section>

                {/* Residency */}
                <section className="card p-6">
                  <SectionHeader
                    title="Residency"
                    sub="Where the applicant lives."
                    icon={MapPin}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5 mt-6">
                    <InfoGroup label="Province" value={(app as any).province || '—'} />
                    <InfoGroup label="District" value={(app as any).district || '—'} />
                    <InfoGroup label="Sector" value={(app as any).sector || '—'} />
                    <InfoGroup label="Residence District" value={(app as any).residence_district || '—'} />
                    <div className="sm:col-span-2 lg:col-span-3">
                      <InfoGroup label="Address" value={app.address || 'Not provided'} icon={MapPin} />
                    </div>
                  </div>
                </section>

                {/* Academic Background */}
                <section className="card p-6">
                  <SectionHeader
                    title="Academic Background"
                    sub="Secondary school transcript provided during application."
                    icon={GraduationCap}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5 mt-6">
                    <InfoGroup label="Attended Secondary School" value={app.prev_school || '—'} />
                    <InfoGroup label="Combination / Section" value={(app as any).combination || '—'} />
                    <InfoGroup label="A2 Grades" value={(app as any).a2_grades || '—'} />
                    <InfoGroup label="Principal Passes" value={(app as any).principal_passes != null ? String((app as any).principal_passes) : '—'} />
                    <InfoGroup label="Completion Year" value={app.graduation_year ? String(app.graduation_year) : '—'} />
                    <InfoGroup label="Serial Number" value={(app as any).serial_number || '—'} />
                    <InfoGroup label="Qualification" value={app.prev_qualification || '—'} />
                    <InfoGroup label="Mean Grade" value={app.prev_grade || '—'} />
                  </div>
                </section>

                {/* Programme Selection */}
                <section className="card p-6">
                  <SectionHeader
                    title="Programme Selection"
                    sub="Programme, faculty, campus and intake."
                    icon={GraduationCap}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5 mt-6">
                    <InfoGroup label="Program" value={(app as any).program_name ?? app.department_name ?? '—'} />
                    <InfoGroup label="Faculty" value={app.faculty_name ?? '—'} />
                    <InfoGroup label="Department" value={app.department_name ?? '—'} />
                    <InfoGroup label="Campus" value={(app as any).campus_name ?? '—'} icon={Building2} />
                    <InfoGroup label="Mode of Study" value={(app as any).mode_of_study ?? '—'} />
                    <InfoGroup label="Level" value={(app as any).level_name ?? levelNameOf((app as any).level_id)} />
                    <InfoGroup label="Intake" value={app.intake ?? '—'} />
                    <InfoGroup label="Academic Year" value={(app as any).academic_year_label ?? '—'} />
                  </div>
                </section>

                {/* Application Fee Payment */}
                <section className="card p-6">
                  <SectionHeader
                    title="Application Fee Payment"
                    sub="Bank slip and transaction details."
                    icon={CreditCard}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5 mt-6">
                    <InfoGroup label="Amount Paid" value={(app as any).payment_amount != null ? `${(app as any).payment_amount} ${(app as any).payment_currency ?? 'RWF'}` : '—'} icon={CreditCard} />
                    <InfoGroup label="Transaction ID" value={(app as any).transaction_id || '—'} />
                    <InfoGroup label="Paid At" value={(app as any).paid_at ? new Date((app as any).paid_at).toLocaleString() : '—'} />
                  </div>
                  {(app as any).payment_slip_file_id ? (
                    <div className="mt-6 p-3 rounded-xl border border-ink-100 dark:border-ink-800 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 flex items-center justify-center shrink-0">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-bold text-ink-900 dark:text-white">Payment Slip</p>
                          <p className="text-[11px] text-ink-500">Uploaded with this application — click to preview.</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <a
                          href={applicationAdminService.paymentSlipUrl(appId)}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded-lg hover:bg-ink-100 dark:hover:bg-ink-700 text-ink-500 transition-colors"
                          title="Open payment slip"
                        >
                          <Eye className="w-4 h-4" />
                        </a>
                        <a
                          href={applicationAdminService.paymentSlipUrl(appId)}
                          download
                          className="p-1.5 rounded-lg hover:bg-ink-100 dark:hover:bg-ink-700 text-ink-500 transition-colors"
                          title="Download payment slip"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-6 text-[12px] text-ink-400 italic">No payment slip on file.</p>
                  )}
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
                          / {checklist.length}{" "}
                          <span className="text-[12px] font-normal text-ink-500 ml-1">
                            Verified
                          </span>
                        </p>
                      </div>
                      {checklist.length > 0 && (
                        <div className="w-12 h-12 rounded-full border-4 border-emerald-100 dark:border-emerald-900/30 flex items-center justify-center">
                          <span className="text-[12px] font-black text-emerald-600">
                            {Math.round(
                              (docs.filter(
                                (d: any) =>
                                  d.verification_status ===
                                  VerificationStatus.VERIFIED,
                              ).length /
                                Math.max(checklist.length, 1)) *
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
                      {(docs.some(
                        (d: any) =>
                          d.verification_status === VerificationStatus.REJECTED,
                      ) ||
                        missingDocs.length > 0) &&
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

                  {checklist.length === 0 ? (
                    <div className="p-12 text-center">
                      <FileText className="w-12 h-12 text-ink-200 mx-auto mb-4" />
                      <p className="text-[14px] text-ink-500">
                        No document requirements configured for this faculty.
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-ink-100 dark:divide-ink-800">
                      {checklist.map((d: any) => {
                        const idx = docs.findIndex((u: any) => u.id === d.id);
                        const isMissing = d.id == null;
                        return (
                        <div
                          key={d.id ?? `type-${d.document_type_id}`}
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
                                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isMissing ? "bg-amber-50 text-amber-600" : d.verification_status === VerificationStatus.VERIFIED ? "bg-emerald-50 text-emerald-600" : d.verification_status === VerificationStatus.REJECTED ? "bg-red-50 text-red-600" : "bg-ink-100 text-ink-500"}`}
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
                                  {isMissing ? (
                                    <>
                                      <span className="text-[12px] text-ink-500 italic">
                                        Nothing attached
                                      </span>
                                      <span className="px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-[11px] font-black uppercase tracking-wide">
                                        {d.is_required ? "Required" : "Optional"} · Not uploaded
                                      </span>
                                    </>
                                  ) : (
                                    <>
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
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {isMissing ? null : (
                              <>
                              <button
                                onClick={() => {
                                  setPreviewIndex(Math.max(idx, 0));
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
                              </>
                              )}
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
                        );
                      })}
                    </div>
                  )}

                  {docs.length > 0 &&
                    missingDocs.length === 0 &&
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
                                VerificationStatus.REJECTED,
                            )
                          ) {
                            toast.error(
                              "Some documents are rejected. Use Request Changes instead.",
                            );
                            return;
                          }
                          if (
                            !window.confirm(
                              "Approve all documents and move to next step?",
                            )
                          ) {
                            return;
                          }
                          const pendingIds = docs
                            .filter(
                              (d: any) =>
                                d.verification_status ===
                                VerificationStatus.PENDING,
                            )
                            .map((d: any) => d.id);
                          if (pendingIds.length === 0) {
                            updateStatus.mutate(
                              ApplicationStatus.DOCUMENTS_VERIFIED,
                            );
                          } else {
                            approveAllDocs.mutate(pendingIds);
                          }
                        }}
                        disabled={
                          updateStatus.isPending || approveAllDocs.isPending
                        }
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
              {status === ApplicationStatus.OFFERED ? (
                <section className="card p-8 text-center">
                  <CheckCircle2 className="w-16 h-16 text-amber-500/20 mx-auto mb-4" />
                  <h3 className="text-xl font-black text-ink-900 dark:text-white mb-2">
                    Accept Admission Offer
                  </h3>
                  <p className="text-ink-500 text-[14px] mb-8 max-w-sm mx-auto">
                    Please accept the admission offer to proceed with payment of
                    admission fees.
                  </p>
                  <button
                    className="btn-primary py-3 px-8 text-[14px] flex items-center justify-center gap-2 mx-auto shadow-xl shadow-brand/20"
                    onClick={() => {
                      if (
                        window.confirm(
                          "Accept this admission offer? The applicant will then need to pay admission fees.",
                        )
                      ) {
                        acceptOffer.mutate();
                      }
                    }}
                    disabled={acceptOffer.isPending}
                  >
                    {acceptOffer.isPending ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" /> Accepting...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-5 h-5" /> Accept Offer
                      </>
                    )}
                  </button>
                </section>
              ) : (
                <>
                  {/* The real thing: the applicant's Registration and CURSU bills,
                      priced from the published fee structures and settled through
                      Urubuto Pay. This replaced a "Simulate registration fee
                      payment?" button that moved the application forward without any
                      money changing hands. */}
                  <AdmissionFeesPanel
                    mode="validator"
                    applicationId={appId}
                    canManage={canManage}
                  />

                  <PaymentHistoryPanel
                    studentId={app?.student_id ? String(app.student_id) : undefined}
                    applicationId={appId}
                  />

                  {maxStep >= 4 && (
                    <div className="flex justify-center">
                      <button
                        className="btn-secondary"
                        onClick={() => setActiveStep(4)}
                      >
                        Proceed to Step 4 <ChevronRight className="w-4 h-4 ml-2" />
                      </button>
                    </div>
                  )}
                </>
              )}
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
                      <InfoGroup
                        label="Program"
                        value={
                          (app as any).program_name ??
                          app.department_name ??
                          "—"
                        }
                      />
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
                          <div>
                            <p className="text-[11px] uppercase tracking-wider text-indigo-400 font-bold">
                              Subjects & Modules
                            </p>
                            <p className="text-[11px] text-ink-400 mt-0.5">
                              {modules.length} module
                              {modules.length === 1 ? "" : "s"} in this program
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-[11px] font-bold text-ink-500 uppercase">
                              Start Level:
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
                          Upon enrollment, the student will be admitted to{" "}
                          <strong>
                            {(app as any).program_name ??
                              app.department_name}
                          </strong>
                          . The full curriculum below is registered against the
                          program; the student starts at the selected level.
                        </p>

                        {modulesQ.isLoading ? (
                          <div className="flex items-center gap-2 text-[12px] text-ink-500 py-2">
                            <Loader2 className="w-4 h-4 animate-spin" /> Loading
                            modules...
                          </div>
                        ) : modules.length > 0 ? (
                          <div className="bg-white dark:bg-ink-950/50 rounded-xl border border-ink-100 dark:border-ink-800 max-h-72 overflow-y-auto mt-2">
                            {(() => {
                              const groups = new Map<
                                string | number,
                                any[]
                              >();
                              for (const m of modules as any[]) {
                                const key = m.level ?? "—";
                                if (!groups.has(key)) groups.set(key, []);
                                groups.get(key)!.push(m);
                              }
                              const sortedKeys = Array.from(
                                groups.keys(),
                              ).sort((a, b) => {
                                if (a === "—") return 1;
                                if (b === "—") return -1;
                                return Number(a) - Number(b);
                              });
                              return sortedKeys.map((lvlKey) => {
                                const lvlLabel =
                                  lvlKey === "—"
                                    ? "Unassigned Level"
                                    : levels.find(
                                        (l: any) => l.id === Number(lvlKey),
                                      )?.name || `Level ${lvlKey}`;
                                const items = groups.get(lvlKey)!;
                                return (
                                  <div key={String(lvlKey)}>
                                    <div className="sticky top-0 bg-ink-50 dark:bg-ink-900/80 backdrop-blur px-3 py-1.5 text-[10px] uppercase tracking-widest font-black text-ink-500 border-b border-ink-100 dark:border-ink-800">
                                      {lvlLabel} · {items.length} module
                                      {items.length === 1 ? "" : "s"}
                                    </div>
                                    <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                                      {items.map((m: any) => (
                                        <li
                                          key={m.module_id}
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
                                              {m.module_code} ·{" "}
                                              {m.module_credits} Credits
                                            </p>
                                          </div>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        ) : (
                          <div className="p-4 rounded-xl border border-dashed border-ink-200 dark:border-ink-800 text-center">
                            <p className="text-[12px] text-ink-500">
                              No modules are linked to this program yet.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {status === ApplicationStatus.OFFER_ACCEPTED ? (
                    <button
                      className="btn-primary py-3 px-8 text-[14px] flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 shadow-xl shadow-green-500/20 mx-auto"
                      onClick={async () => {
                        // First check whether this applicant already has a
                        // student row (returning postgraduate scenario). If
                        // so, surface the existing record(s) before enrolling
                        // a new one alongside.
                        try {
                          const check = await applicationAdminService.returningCheck(appId);
                          if (check.data?.is_returning) {
                            const prior = check.data.records[0];
                            const ok = window.confirm(
                              `Heads up: this applicant already has a student record\n` +
                              `(Reg: ${prior?.regnumber ?? 'unknown'}, programme: ${prior?.programme_level ?? 'unknown'}).\n\n` +
                              `A NEW student record will be created alongside it (e.g. for a Masters cohort), linked back via parent_student_id.\n\n` +
                              `Proceed?`,
                            );
                            if (!ok) return;
                          } else if (
                            !window.confirm(
                              `Finalize registration at ${selectedLevelLabel} and generate Registration Number?`,
                            )
                          ) {
                            return;
                          }
                        } catch {
                          // Soft-fail: the check is informational only — fall
                          // back to the original confirm so enrollment isn't
                          // blocked by a network blip.
                          if (
                            !window.confirm(
                              `Finalize registration at ${selectedLevelLabel} and generate Registration Number?`,
                            )
                          ) return;
                        }
                        enroll.mutate(selectedLevelId);
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
          {/* Status History — skip the noisy `draft → draft` save events;
              they're internal autosave traffic, not state transitions
              registry users care about. */}
          {(() => {
            const meaningful = (statusLog as any[]).filter(
              (l) => l.to_status && l.to_status !== 'draft'
            )
            return (
              <section className="card p-6">
                <SectionHeader title="Status History" sub="Decision timeline." />
                <div className="mt-6">
                  {meaningful.length > 0 ? (
                    <ol className="relative pl-5 space-y-5 before:absolute before:left-[6px] before:top-1 before:bottom-1 before:w-px before:bg-ink-100 dark:before:bg-ink-800">
                      {meaningful.map((l: any, idx: number) => {
                        const isCurrent = idx === meaningful.length - 1
                        return (
                          <li key={idx} className="relative">
                            <span
                              className={
                                'absolute -left-[22px] top-1 w-3 h-3 rounded-full ring-4 ring-white dark:ring-ink-900 ' +
                                (isCurrent ? 'bg-brand' : 'bg-ink-300 dark:bg-ink-600')
                              }
                            />
                            <p className="text-[12.5px] font-semibold text-ink-900 dark:text-white capitalize">
                              {l.to_status.replace(/_/g, ' ')}
                              <span className="ml-2 text-[10.5px] font-normal text-ink-400 uppercase tracking-wider">
                                {l.actor_type}
                              </span>
                            </p>
                            <p className="text-[11px] text-ink-400 mt-0.5">
                              {new Date(l.created_at).toLocaleString()}
                            </p>
                            {l.notes && (
                              <p className="text-[12px] text-ink-600 dark:text-ink-300 mt-1 italic leading-snug">
                                "{l.notes}"
                              </p>
                            )}
                          </li>
                        )
                      })}
                    </ol>
                  ) : (
                    <p className="text-[12px] text-ink-400 text-center py-4 italic">
                      Application hasn't transitioned past submission yet.
                    </p>
                  )}
                </div>
              </section>
            )
          })()}

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

          {/* Internal Notes — admin-only thread, latest at the top */}
          <section className="card p-6 border-brand/20 shadow-sm">
            <SectionHeader
              title="Internal Review Notes"
              sub="Admin-only — never shown to the applicant."
              icon={MessageSquarePlus}
            />
            <div className="mt-4 space-y-4">
              {/* Composer */}
              <div className="rounded-xl border border-brand/10 bg-brand/[0.03] p-3">
                <textarea
                  className="input min-h-[80px] text-[13px] bg-white dark:bg-ink-900 focus:bg-white"
                  placeholder="Add a note for your team…"
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  maxLength={1000}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && noteInput.trim()) {
                      addNote.mutate(noteInput.trim())
                    }
                  }}
                />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[10.5px] text-ink-400">
                    {noteInput.length}/1000 · ⌘+Enter to save
                  </span>
                  <button
                    className="btn-primary btn-sm"
                    onClick={() =>
                      noteInput.trim() && addNote.mutate(noteInput.trim())
                    }
                    disabled={!noteInput.trim() || addNote.isPending}
                  >
                    {addNote.isPending && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    )}
                    Save note
                  </button>
                </div>
              </div>

              {/* Thread — parse the appended "[timestamp — actor]: body" lines */}
              {(() => {
                const raw = (app.internal_notes ?? '').trim()
                if (!raw) {
                  return (
                    <p className="text-[12px] italic text-ink-400 text-center py-3">
                      No internal notes yet.
                    </p>
                  )
                }
                // Each entry starts with a "[…]" prefix; split on newlines
                // that begin one. The regex keeps the bracket on the
                // following entry.
                const entries = raw
                  .split(/\n(?=\[)/)
                  .map((line) => {
                    const m = line.match(/^\[([^\]]+)\]:\s*([\s\S]*)$/)
                    if (!m) return { meta: '', body: line.trim() }
                    // meta is "YYYY-MM-DD HH:MM:SS — Author Name"
                    const parts = m[1].split('—').map((s) => s.trim())
                    return {
                      meta: m[1],
                      when: parts[0] ?? '',
                      who: parts[1] ?? '',
                      body: m[2].trim(),
                    }
                  })
                  .reverse() // newest first

                return (
                  <ul className="space-y-2.5">
                    {entries.map((e, i) => (
                      <li
                        key={i}
                        className="rounded-lg border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900 p-3"
                      >
                        <div className="flex items-center justify-between text-[10.5px] text-ink-500">
                          <span className="font-semibold text-ink-700 dark:text-ink-200">
                            {(e as any).who || 'Admin'}
                          </span>
                          <span>{(e as any).when || ''}</span>
                        </div>
                        <p className="text-[12.5px] leading-relaxed text-ink-800 dark:text-ink-200 mt-1.5 whitespace-pre-wrap">
                          {e.body}
                        </p>
                      </li>
                    ))}
                  </ul>
                )
              })()}
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
        documents={checklist}
        onSuccess={requestChangesSuccess}
      />

      <PhotoLightbox
        open={photoLightboxOpen}
        onClose={() => setPhotoLightboxOpen(false)}
        url={applicationAdminService.photoUrl(appId, (app as any).applicant_photo_id ?? null)}
        caption={`${app.first_name ?? ''} ${app.last_name ?? ''}`.trim() || app.application_number}
      />

      <ApplicationEditModal
        open={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        application={appData}
      />

      <ApplicationDeleteModal
        open={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        application={appData}
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

function cap(s?: string | null) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function StatusPill({ status }: { status: string }) {
  if (!status) return null;
  const isOffer = status.includes("offer");
  const isVerified =
    status === ApplicationStatus.DOCUMENTS_VERIFIED ||
    status === ApplicationStatus.ENROLLED;
  // On the admin side, frame `submitted` as "Pending" — that's the queue
  // admins act on, not a state the applicant has finalised.
  const label = status === ApplicationStatus.SUBMITTED ? "Pending" : status.replace(/_/g, " ");
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
      {label}
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

/** Large applicant avatar shown in the detail page header. Clickable
 *  when a photo is set so admins can open the lightbox; falls back to
 *  initials when no photo or when the image fails to load. */
function ApplicantAvatarLg({
  photoUrl, initials, onClick,
}: { photoUrl: string | null; initials: string; onClick?: () => void }) {
  const isClickable = !!photoUrl && !!onClick;
  return (
    <button
      type="button"
      onClick={isClickable ? onClick : undefined}
      className={
        "relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-br from-primary-500/15 to-primary-500/5 dark:from-primary-500/30 dark:to-primary-500/10 flex items-center justify-center text-primary-700 dark:text-primary-200 font-black text-[22px] shrink-0 overflow-hidden ring-1 ring-primary-200/60 dark:ring-primary-900/40 shadow-sm " +
        (isClickable
          ? "cursor-zoom-in hover:ring-2 hover:ring-brand/40 transition-all group"
          : "cursor-default")
      }
      title={isClickable ? "Click to view full size" : undefined}
      aria-label={isClickable ? "Open applicant photo" : "Applicant initials"}
    >
      {photoUrl ? (
        <>
          <img
            src={photoUrl}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => {
              const img = e.currentTarget as HTMLImageElement;
              img.style.display = 'none';
              const span = img.nextElementSibling as HTMLElement | null;
              if (span) span.style.removeProperty('display');
            }}
          />
          <span style={{ display: 'none' }}>{initials}</span>
          {isClickable && (
            <span className="absolute inset-0 bg-ink-900/0 group-hover:bg-ink-900/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
              <ZoomIn className="w-5 h-5 text-white drop-shadow" />
            </span>
          )}
        </>
      ) : (
        <span>{initials}</span>
      )}
    </button>
  );
}

/** Fullscreen photo viewer. Click the backdrop or press Esc to close. */
function PhotoLightbox({
  open, onClose, url, caption,
}: {
  open: boolean
  onClose: () => void
  url: string | null
  caption?: string
}) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open || !url) return null

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[100] bg-ink-900/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
        onClick={onClose}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
        <div
          className="relative max-w-5xl max-h-[90vh] flex flex-col items-center gap-4"
          onClick={(e) => e.stopPropagation()}
        >
          <img
            src={url}
            alt={caption ?? 'Applicant photo'}
            className="max-w-full max-h-[80vh] rounded-lg shadow-2xl object-contain"
          />
          {caption && (
            <p className="text-white/80 text-[13px] font-medium">{caption}</p>
          )}
          <a
            href={url}
            download
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[11.5px] text-white/70 hover:text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <Download className="w-3 h-3" />
            Open in new tab
          </a>
        </div>
      </div>
    </ModalPortal>
  );
}
