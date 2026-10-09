import {
  useParams,
  Link,
  useLocation,
  useSearchParams,
  useNavigate,
} from "react-router-dom";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  studentService,
  type StudentPatch,
  type ProgramModuleRow,
} from "@/services/studentService";
import { applicationAdminService } from "@/services/admissionService";
import { authService } from "@/services/authService";
import {
  marksService,
  type HonoursClassification,
  type MyMarksRow,
  type MyMarksTotals,
} from "@/services/marksService";
import { gradeService } from "@/services/gradeService";
import {
  studentIdService,
  type StudentIdCard,
} from "@/services/studentIdService";
import { isPhotoUuid, legacyPhotoUrl } from "@/services/photoHelper";
import { transcriptService } from "@/services/transcriptService";
import { normalizeGrade } from "@/utils/gradingScale";
import { academicService } from "@/services/academicService";
import {
  attendanceService,
  type StudentAttendanceStatus,
} from "@/services/attendanceService";
import { PERMISSIONS } from "@/constants/permissions";
import { usePermission, useAnyPermission } from "@/utils/permissions";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  Loader2,
  User,
  Mail,
  Phone,
  Calendar,
  GraduationCap,
  Globe2,
  Building2,
  BookOpen,
  CheckCircle,
  Clock,
  FileText,
  BarChart,
  Edit,
  Save,
  X,
  Award,
  AlertTriangle,
  Download,
  Percent,
  Eye,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Sparkles,
  MapPin,
  CreditCard,
  CalendarDays,
  FileOutput,
  Heart,
  Accessibility,
  Users as UsersIcon,
  CalendarClock,
  Camera,
  Trash2,
  PlusCircle,
  MinusCircle,
  Lock,
  EyeOff,
  Network,
  AlertCircle,
  UploadCloud,
  RefreshCw,
  Banknote,
  TrendingUp,
  ArrowDownLeft,
  Printer,
} from "lucide-react";
import ModalPortal from "@/components/ui/ModalPortal";
import StatusChangeModal from "@/components/students/StatusChangeModal";
import ProfileChangeRequestModal from "@/components/students/ProfileChangeRequestModal";
import UserAccountPanel from "@/components/account/UserAccountPanel";
import { ledgerService } from "@/services/financeService";
import { FEE_TYPE_LABELS, PAYMENT_METHOD_LABELS } from "@/types/finance";
import InvoiceStatusBadge from "@/components/finance/InvoiceStatusBadge";
import { formatRWF } from "@/utils/formatCurrency";
import CountrySelect from "@/components/ui/CountrySelect";
import LocationSelect from "@/components/ui/LocationSelect";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useLevels } from "@/hooks/useLevels";
import DocumentChecklistModal from "@/components/admin/DocumentChecklistModal";
import {
  ComplianceSummary,
  RequirementList,
  NotifyStudentPanel,
  NoticeHistory,
} from "@/components/students/DocumentCompliancePanel";
import {
  COUNTRY_BY_NAME,
  COUNTRY_BY_NATIONALITY,
  countryFlag,
} from "@/data/countries";

type Tab =
  | "overview"
  | "attendance"
  | "documents"
  | "curriculum"
  | "finance"
  | "transcript"
  | "idcard";
const VALID_TABS: readonly Tab[] = [
  "overview",
  "attendance",
  "documents",
  "curriculum",
  "finance",
  "transcript",
  "idcard",
] as const;

interface StudentDetailsPageProps {
  /**
   * When true, the page renders the authenticated user's own student record
   * via `/api/students/me`. Admin-only actions (edit, photo upload, exemption
   * controls, registry back-link) are hidden, and tabs that depend on
   * VIEW_STUDENTS endpoints are replaced with friendly placeholders.
   */
  selfMode?: boolean;
  /** When set, overrides the :id URL param — used when embedding in a modal. */
  idOverride?: string | number;
}

export default function StudentDetailsPage({
  selfMode = false,
  idOverride,
}: StudentDetailsPageProps = {}) {
  const { id: paramId } = useParams<{ id: string }>();
  const id = idOverride !== undefined ? String(idOverride) : paramId;
  const location = useLocation();
  const [sp, setSp] = useSearchParams();
  // Tab is URL-driven so deep-links like /me/profile?tab=attendance (used by
  // the student-only Attendance entry in the sidebar) land on the right
  // pane on first paint instead of always opening "Overview".
  const tabParam = sp.get("tab") as Tab | null;
  const tab: Tab =
    tabParam && (VALID_TABS as readonly string[]).includes(tabParam)
      ? tabParam
      : "overview";
  const setTab = (t: Tab) => {
    const next = new URLSearchParams(sp);
    next.set("tab", t);
    setSp(next, { replace: true });
  };
  const [isEditing, setIsEditing] = useState(false);
  const [showDocumentChecklist, setShowDocumentChecklist] = useState(false);

  // Allow both admins with MANAGE_STUDENTS and registrars (super admin role includes all permissions)
  const canManageStudents = usePermission(PERMISSIONS.MANAGE_STUDENTS);

  const fromSearch = location.state?.fromSearch;
  const backUrl =
    fromSearch !== undefined ? `/students?${fromSearch}` : "/students?tab=all";

  const studentQ = useQuery({
    queryKey: selfMode ? ["student", "me"] : ["student", id],
    queryFn: () =>
      selfMode ? studentService.me() : studentService.show(Number(id)),
    enabled: selfMode || !!id,
  });

  const navigate = useNavigate();

  const statsQ = useQuery({
    queryKey: ["student-stats"],
    queryFn: () => studentService.stats(),
    staleTime: 60_000,
    // Stats requires VIEW_STUDENTS — students hitting their own profile get a
    // 403 here. Skip the call entirely in self mode; the overview tab falls
    // back to raw values from the student record.
    enabled: !selfMode,
  });

  // Fetch applicant profile photo as fallback when student.photo is empty
  // This pulls photos for enrolled students whose applicant profiles have photos
  const applicantPhotoQ = useQuery({
    queryKey: ["student", id, "applicant-photo"],
    queryFn: async () => {
      // Find the application for this student and get applicant_photo_id
      try {
        const response = await fetch(
          `/api/admin/applications?search=${encodeURIComponent(String(id))}&per_page=1`,
          {
            headers: {
              Authorization: `Bearer ${authService.getToken()}`,
            },
          }
        );
        if (!response.ok) return null;
        const data = await response.json();
        const app = data.data?.[0];
        if (!app?.id || !app?.applicant_photo_id) return null;
        return {
          applicationId: app.id,
          applicant_photo_id: app.applicant_photo_id,
        };
      } catch {
        return null;
      }
    },
    enabled: !selfMode && !!id && !studentQ.data?.data?.photo,
    staleTime: Infinity,
  });

  const student = studentQ.data?.data;
  const stats = statsQ.data?.data;
  const applicantPhoto: { applicationId: number; applicant_photo_id: string } | null | undefined = applicantPhotoQ.data;

  if (studentQ.isLoading) {
    return (
      <div className="flex items-center justify-center p-20">
        <Loader2 className="w-6 h-6 text-brand animate-spin" />
      </div>
    );
  }

  if (studentQ.isError || !student) {
    if (selfMode) {
      // Non-student staff accounts (admins, finance, HR, etc.) don't have a
      // matching `student` record. Show the user-account self-service panel
      // so they can edit their own profile and password from the same URL.
      return <UserAccountPanel />;
    }

    return (
      <div className="max-w-[1000px] mx-auto p-6 text-center">
        <h2 className="text-lg font-semibold text-ink-900 mb-2">
          Student not found
        </h2>
        <Link
          to={backUrl}
          className="btn-secondary inline-flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" /> Back to students
        </Link>
      </div>
    );
  }

  const initials =
    [student.fname, student.lname]
      .filter(Boolean)
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "—";

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">
      {/* Header section */}
      <div className="flex items-center gap-4">
        {!selfMode && (
          <Link to={backUrl} className="btn-secondary p-2">
            <ArrowLeft className="w-5 h-5" />
          </Link>
        )}
        <StudentAvatar
          student={student}
          initials={initials}
          selfMode={selfMode}
        />
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-ink-900 dark:text-white">
              {student.fname} {student.lname}
            </h1>
            {!selfMode && canManageStudents && (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  className="btn-secondary btn-sm flex items-center gap-1.5 h-7 px-2.5"
                >
                  <Edit className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>
                <button
                  onClick={() =>
                    navigate(`/documents/generate?student_id=${student.id}`)
                  }
                  className="btn-secondary btn-sm flex items-center gap-1.5 h-7 px-2.5"
                >
                  <FileOutput className="w-3.5 h-3.5" />
                  <span>Generate Documents</span>
                </button>
                <button
                  onClick={() => setShowDocumentChecklist(true)}
                  className="btn-secondary btn-sm flex items-center gap-1.5 h-7 px-2.5"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Document Checklist</span>
                </button>
              </>
            )}
          </div>
          <p className="text-sm text-ink-500 mt-1 flex items-center gap-3">
            <span className="font-mono bg-ink-100 dark:bg-ink-800 px-2 py-0.5 rounded">
              {student.regnumber || student.index_number || "No ID"}
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                student.student_state === "active"
                  ? "bg-mint-100 text-mint-700"
                  : "bg-ink-100 text-ink-700"
              }`}
            >
              {String(student.student_state || "Unknown").toUpperCase()}
            </span>
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 dark:border-ink-800">
        <TabButton
          active={tab === "overview"}
          onClick={() => setTab("overview")}
          icon={User}
          label="Overview & Stats"
        />
        <TabButton
          active={tab === "attendance"}
          onClick={() => setTab("attendance")}
          icon={Clock}
          label="Attendance"
        />
        <TabButton
          active={tab === "documents"}
          onClick={() => setTab("documents")}
          icon={FileText}
          label="Documents"
        />
        <TabButton
          active={tab === "curriculum"}
          onClick={() => setTab("curriculum")}
          icon={BookOpen}
          label="Program & Marks"
        />
        <TabButton
          active={tab === "finance"}
          onClick={() => setTab("finance")}
          icon={BarChart}
          label="Finance"
        />
        <TabButton
          active={tab === "transcript"}
          onClick={() => setTab("transcript")}
          icon={FileText}
          label="Transcript"
        />
        {!selfMode && (
          <TabButton
            active={tab === "idcard"}
            onClick={() => setTab("idcard")}
            icon={CreditCard}
            label="ID Card"
          />
        )}
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {tab === "overview" && (
          <OverviewTab student={student} stats={stats} selfMode={selfMode} />
        )}
        {tab === "attendance" && <AttendanceTab student={student} selfMode={selfMode} />}
        {tab === "documents" && (
          <DocumentsTab student={student} selfMode={selfMode} onOpenChecklist={() => setShowDocumentChecklist(true)} />
        )}
        {tab === "curriculum" && (
          <ProgramCurriculumTab student={student} selfMode={selfMode} />
        )}
        {tab === "finance" && (
          <StudentFinanceTab student={student} selfMode={selfMode} />
        )}
        {tab === "transcript" && <TranscriptTab student={student} />}
        {tab === "idcard" && !selfMode && <IdCardTab student={student} />}
      </div>

      {!selfMode && isEditing && (
        <EditStudentModal
          student={student}
          stats={stats}
          onClose={() => setIsEditing(false)}
        />
      )}

      {!selfMode && (
        <DocumentChecklistModal
          open={showDocumentChecklist}
          onClose={() => setShowDocumentChecklist(false)}
          studentId={student.id}
          regNumber={student.regnumber || student.index_number || null}
          studentName={`${student.fname} ${student.lname}`}
          programme={String(student.programme_name || (student.application as any)?.program_name || "")}
        />
      )}
    </div>
  );
}

function OverviewTab({
  student,
  stats,
  selfMode = false,
}: {
  student: any;
  stats: any;
  selfMode?: boolean;
}) {
  const app = student?.application ?? null;

  // Prefer the live student record, but fall back to the application for fields
  // we never copied onto students (father, mother, residency, secondary school…).
  const pick = (...vals: any[]) =>
    vals.find((v) => v !== undefined && v !== null && v !== "") ?? null;

  const facultyName =
    stats?.facets?.faculty?.find(
      (f: any) => String(f.value) === String(student.faculty),
    )?.label ??
    app?.faculty_name ??
    student.faculty;
  const deptName =
    stats?.facets?.department?.find(
      (f: any) => String(f.value) === String(student.department),
    )?.label ??
    app?.department_name ??
    student.department;
  const levelName =
    stats?.facets?.current_level?.find(
      (f: any) => String(f.value) === String(student.current_level),
    )?.label ?? student.current_level;
  // The programme is the catalogue option the student is assigned to. The
  // legacy `student.program` column actually stores the learning mode
  // (Day/Evening/Weekend), so we deliberately do NOT fall back to it here —
  // we'd mislabel "Day" as the programme name.
  const programName =
    stats?.facets?.options?.find(
      (o: any) => String(o.value) === String(student.std_option),
    )?.label ??
    app?.program_name ??
    null;

  const fullName =
    `${student.fname ?? ""} ${student.lname ?? ""}`.trim() || "—";
  const genderRaw = pick(student.gender, app?.gender);
  const genderLabel =
    genderRaw === "M"
      ? "Male"
      : genderRaw === "F"
        ? "Female"
        : genderRaw || null;
  const initials =
    [student.fname, student.lname]
      .filter(Boolean)
      .map((p: string) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "—";

  const stateRaw = String(student.student_state ?? "").toLowerCase();
  const stateClass =
    stateRaw === "active"
      ? "bg-mint-100 text-mint-700 ring-mint-200"
      : stateRaw === "graduated"
        ? "bg-blue-100 text-blue-700 ring-blue-200"
        : stateRaw === "suspended"
          ? "bg-red-100 text-red-700 ring-red-200"
          : "bg-ink-100 text-ink-700 ring-ink-200";

  const academicYear = pick(student.acc_year, app?.academic_year_label);
  const campus = pick(app?.campus_name);
  // Learning mode (Day / Evening / Weekend). Lives on the application as
  // `mode_of_study` and on the legacy `student.program` column — we check
  // both so the chip appears for students without a linked application.
  const studyMode = cap(pick(app?.mode_of_study, student.program));

  return (
    <div className="space-y-6">
      {/* Hero profile card */}
      <section className="rounded-2xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-6 sm:p-8">
        <div className="flex flex-col md:flex-row gap-8 items-start">
          {/* large editable photo */}
          <ProfileHeroPhoto
            student={student}
            initials={initials}
            selfMode={selfMode}
            applicantPhoto={applicantPhoto}
          />

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-3xl font-bold text-ink-900 dark:text-white">
                {fullName}
              </h2>
              <span
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold ring-1 ${stateClass}`}
              >
                {String(student.student_state || "Unknown").toUpperCase()}
              </span>
            </div>
            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-500">
              <span className="font-mono bg-ink-100 dark:bg-ink-800 px-2.5 py-1 rounded text-ink-800 dark:text-ink-100 font-semibold">
                {student.regnumber || student.index_number || "No ID"}
              </span>
              {programName && (
                <span className="inline-flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-brand" /> {programName}
                </span>
              )}
              {levelName && (
                <span className="inline-flex items-center gap-1.5">
                  <GraduationCap className="w-4 h-4 text-brand" /> Level{" "}
                  {levelName}
                </span>
              )}
            </p>

            <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {facultyName && (
                <Chip icon={Building2} label="Faculty" value={facultyName} />
              )}
              {deptName && (
                <Chip
                  icon={GraduationCap}
                  label="Department"
                  value={deptName}
                />
              )}
              {academicYear && (
                <Chip icon={Calendar} label="Year" value={academicYear} />
              )}
              {campus && (
                <Chip icon={Building2} label="Campus" value={campus} />
              )}
              {studyMode && (
                <Chip icon={Clock} label="Mode" value={studyMode} />
              )}
            </div>
          </div>
        </div>
      </section>

      {/* International students — visa info banner + editable section.
          Rendered as the first block under the hero so the call-to-action
          is impossible to miss; the banner stays visible until both visa
          dates AND the document have been recorded. */}
      {isStudentInternational(student, app) && (
        <VisaSection
          studentId={student.id}
          selfMode={selfMode}
          studentNationality={pick(student.nationality, app?.nationality) ?? ""}
        />
      )}

      {/* Two-column responsive layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PersonalDetailsSection
          student={student}
          app={app}
          fullName={fullName}
          genderLabel={genderLabel}
          selfMode={selfMode}
        />
        <ContactSection student={student} app={app} selfMode={selfMode} />
      </div>

      <ProgrammeSection
        student={student}
        app={app}
        stats={stats}
        selfMode={selfMode}
      />

      {/* Residency + Academic Background — side by side when both exist */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {(!selfMode ||
          student.province ||
          student.district ||
          student.sector ||
          app?.province ||
          app?.district ||
          app?.sector ||
          app?.residence_district ||
          app?.address) && (
          <ResidencySection student={student} app={app} selfMode={selfMode} />
        )}

        {app && (
          <section className="card p-6">
            <SectionHeader
              title="Academic Background"
              sub="Secondary school transcript."
              icon={GraduationCap}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5 mt-6">
              <InfoGroup
                label="Attended Secondary School"
                value={pick(app?.prev_school)}
              />
              <InfoGroup
                label="Combination / Section"
                value={pick(app?.combination)}
              />
              <InfoGroup label="A2 Grades" value={pick(app?.a2_grades)} />
              <InfoGroup
                label="Principal Passes"
                value={
                  app?.principal_passes != null
                    ? String(app.principal_passes)
                    : null
                }
              />
              <InfoGroup
                label="Completion Year"
                value={
                  app?.graduation_year ? String(app.graduation_year) : null
                }
              />
              <InfoGroup
                label="Serial Number"
                value={pick(app?.serial_number)}
              />
              <InfoGroup
                label="Qualification"
                value={pick(app?.prev_qualification)}
              />
              <InfoGroup label="Mean Grade" value={pick(app?.prev_grade)} />
            </div>
          </section>
        )}
      </div>

      {selfMode && <ChangePasswordSection />}
    </div>
  );
}

/**
 * Renders a country / nationality string prefixed with its flag emoji.
 * Falls back to the raw string (or "—") when the value can't be matched.
 */
function withFlag(
  value: string | null | undefined,
  mode: "country" | "nationality",
): React.ReactNode {
  if (!value) return null;
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

/**
 * Treat the student as international when the explicit flag is set OR the
 * nationality (on the student row OR on the linked application) isn't one
 * of the Rwandan demonym spellings.
 */
function isStudentInternational(student: any, app?: any): boolean {
  if (student?.is_international) return true;
  const n = String(student?.nationality ?? app?.nationality ?? "")
    .trim()
    .toLowerCase();
  if (!n) return false;
  return !["rwanda", "rwandan", "rwandese", "rwandaise"].includes(n);
}

/**
 * VisaSection — overview-tab block for international students.
 * Always visible (in selfMode and to admins) so the requirement is
 * impossible to miss. Surfaces current visa info, a missing/expired
 * banner, and an inline edit form for the two dates + country of origin.
 */
function VisaSection({
  studentId,
  selfMode,
  studentNationality,
}: {
  studentId: number;
  selfMode: boolean;
  studentNationality: string;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);

  const visaQ = useQuery<any>({
    queryKey: selfMode ? ["student-visa", "me"] : ["student-visa", studentId],
    queryFn: () =>
      selfMode
        ? (studentService.meVisa() as Promise<any>)
        : (studentService.listVisaRecords(studentId) as Promise<any>),
  });

  // `meVisa` returns `{ is_international, needs_visa, is_expired, current, records }`;
  // `listVisaRecords` (admin) returns `{ records, current }`. Normalize both.
  const raw: any = (visaQ.data as any)?.data ?? {};
  const current = raw.current ?? null;
  const needsVisa =
    typeof raw.needs_visa === "boolean"
      ? raw.needs_visa
      : !current ||
        !current.visa_issue_date ||
        !current.visa_expiry_date ||
        !current.visa_document_file_id;

  // Days until expiry — used to surface the "expires this week" banner.
  const daysToExpiry = (() => {
    if (!current?.visa_expiry_date) return null;
    const expiry = new Date(current.visa_expiry_date + "T00:00:00");
    const today  = new Date(new Date().toDateString());
    return Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
  })();
  const isExpired       = daysToExpiry != null && daysToExpiry < 0;
  const expiringThisWeek = daysToExpiry != null && daysToExpiry >= 0 && daysToExpiry <= 7;

  // Derive country-of-origin from the student's nationality so the field
  // is auto-filled and non-editable. Falls back to the value already on
  // the visa record if no nationality is set on the student.
  const derivedCountry =
    COUNTRY_BY_NATIONALITY[(studentNationality ?? "").toLowerCase()] ??
    COUNTRY_BY_NAME[(studentNationality ?? "").toLowerCase()] ??
    null;
  const lockedCountryName =
    derivedCountry?.name ??
    current?.country_of_origin ??
    studentNationality ??
    "";

  const initialForm = () => ({
    country_of_origin: lockedCountryName,
    visa_issue_date:   current?.visa_issue_date   ?? "",
    visa_expiry_date:  current?.visa_expiry_date  ?? "",
    visa_type:         current?.visa_type         ?? "",
  });
  const [form, setForm] = useState(initialForm);
  useEffect(() => {
    setForm(initialForm());  
  }, [current?.id, lockedCountryName]);

  const saveMutation = useMutation({
    mutationFn: (payload: typeof form) => studentService.meAddVisa(payload),
    onSuccess: () => {
      toast.success("Visa information saved.");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["student-visa"] });
      qc.invalidateQueries({ queryKey: ["student-documents"] });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? "Failed to save visa info."),
  });

  const handleSave = () => {
    if (!form.country_of_origin.trim()) {
      toast.error("Please pick your country of origin.");
      return;
    }
    if (!form.visa_issue_date || !form.visa_expiry_date) {
      toast.error("Both visa obtained date and expiration date are required.");
      return;
    }
    if (form.visa_expiry_date <= form.visa_issue_date) {
      toast.error("Visa expiration date must be after the obtained date.");
      return;
    }
    saveMutation.mutate(form);
  };

  if (visaQ.isLoading) {
    return (
      <section className="card p-6 flex items-center gap-3 text-ink-400">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading visa status…
      </section>
    );
  }

  // The section's tone escalates: needs > expired > expiring this week >
  // healthy. We pick the worst-case state for the styling/badge.
  const alertTone =
    needsVisa || isExpired
      ? "amber"
      : expiringThisWeek
        ? "rose"
        : "ok";
  const wrapperToneClass =
    alertTone === "amber"
      ? "bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-900/50"
      : alertTone === "rose"
        ? "bg-rose-50 dark:bg-rose-900/10 border-rose-200 dark:border-rose-900/50"
        : "bg-white dark:bg-ink-900 border-ink-200 dark:border-ink-800";
  const iconBubbleClass =
    alertTone === "amber"
      ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
      : alertTone === "rose"
        ? "bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300"
        : "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300";

  return (
    <section className={`rounded-2xl border p-6 ${wrapperToneClass}`}>
      <div className="flex items-start gap-4">
        <div
          className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${iconBubbleClass}`}
        >
          {alertTone === "ok" ? (
            <ShieldCheck className="w-5 h-5" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[15px] font-black text-ink-900 dark:text-white">
              Visa Information
            </h3>
            {needsVisa && (
              <span className="px-2 py-0.5 rounded-full bg-amber-600 text-white text-[10px] font-bold uppercase tracking-wider">
                Required
              </span>
            )}
            {isExpired && (
              <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-bold uppercase tracking-wider">
                Expired
              </span>
            )}
            {expiringThisWeek && !isExpired && (
              <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1">
                <CalendarClock className="w-3 h-3" />
                Expires in {daysToExpiry}d
              </span>
            )}
          </div>
          <p className="text-[12.5px] text-ink-600 dark:text-ink-300 mt-1 leading-relaxed">
            {needsVisa
              ? "As an international student you must record your visa obtained date, visa expiration date, and upload the visa document."
              : isExpired
                ? "Your visa has expired. Please renew it and update the dates below, then upload the new visa document."
                : expiringThisWeek
                  ? `Heads up — your visa expires in ${daysToExpiry} day${daysToExpiry === 1 ? "" : "s"}. Renew it before the expiration date and update the information here.`
                  : "Your visa information is on file. Keep it up to date — re-enter the dates after every renewal."}
          </p>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={`btn-sm shrink-0 flex items-center gap-1.5 ${
              needsVisa || isExpired ? "btn-primary" : "btn-secondary"
            }`}
          >
            <Edit className="w-3.5 h-3.5" />
            {current ? "Update" : "Add Visa Info"}
          </button>
        )}
      </div>

      {/* Read-only view */}
      {!editing && current && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4 mt-5">
          <InfoGroup
            label="Country of Origin"
            value={withFlag(current.country_of_origin, "country") ?? withFlag(current.country_of_origin, "nationality")}
            icon={Globe2}
          />
          <InfoGroup
            label="Visa Obtained"
            value={current.visa_issue_date}
            icon={CalendarDays}
          />
          <InfoGroup
            label="Visa Expires"
            value={current.visa_expiry_date}
            icon={CalendarDays}
          />
          <InfoGroup
            label="Visa Type"
            value={current.visa_type || "—"}
            icon={CreditCard}
          />
        </div>
      )}

      {/* Edit form */}
      {editing && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5 mt-5">
          <FieldGroup label="Country of Origin" icon={Globe2}>
            {/* Auto-selected from the student's nationality; not editable. */}
            <div
              className="input w-full flex items-center gap-2 bg-ink-50 dark:bg-ink-800 cursor-not-allowed select-none"
              aria-readonly="true"
              title="Derived from your nationality. Contact registry to change it."
            >
              {derivedCountry ? (
                <>
                  <span aria-hidden className="text-[18px] leading-none">
                    {countryFlag(derivedCountry.code)}
                  </span>
                  <span className="flex-1 truncate">{derivedCountry.name}</span>
                </>
              ) : (
                <>
                  <Globe2 className="w-4 h-4 text-ink-400" />
                  <span className="flex-1 truncate">
                    {lockedCountryName || "—"}
                  </span>
                </>
              )}
              <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
                Auto
              </span>
            </div>
          </FieldGroup>
          <FieldGroup label="Visa Type (optional)" icon={CreditCard}>
            <TextInput
              value={form.visa_type}
              onChange={(e) =>
                setForm((f) => ({ ...f, visa_type: e.target.value }))
              }
              placeholder="e.g. Student"
            />
          </FieldGroup>
          <FieldGroup label="Visa Obtained Date *" icon={CalendarDays}>
            <TextInput
              type="date"
              value={form.visa_issue_date}
              onChange={(e) =>
                setForm((f) => ({ ...f, visa_issue_date: e.target.value }))
              }
            />
          </FieldGroup>
          <FieldGroup label="Visa Expiration Date *" icon={CalendarDays}>
            <TextInput
              type="date"
              value={form.visa_expiry_date}
              onChange={(e) =>
                setForm((f) => ({ ...f, visa_expiry_date: e.target.value }))
              }
            />
          </FieldGroup>
          <div className="sm:col-span-2 flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => {
                setForm(initialForm());
                setEditing(false);
              }}
              disabled={saveMutation.isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary btn-sm flex items-center gap-1.5"
              onClick={handleSave}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending && (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              )}
              Save
            </button>
          </div>
        </div>
      )}

      {/* Document hint — points to the Documents tab where the file lives */}
      {(needsVisa || !current?.visa_document_file_id) && (
        <p className="mt-5 text-[12px] text-amber-800 dark:text-amber-300 inline-flex items-center gap-2">
          <UploadCloud className="w-3.5 h-3.5" />
          Visit the <strong>Documents</strong> tab to upload your visa document
          (PDF, JPG or PNG).
        </p>
      )}
    </section>
  );
}

/**
 * Personal Details — read-only by default. In selfMode the section can be
 * flipped into edit mode, where only the marital_status field is writable.
 * Everything else (name, gender, DOB, ID, nationality, parents) stays
 * locked because those belong to the legal/academic identity captured at
 * enrollment and are admin-only.
 */
/**
 * Hook that picks the right save mutation for a section based on whether
 * we're viewing the page as the student themselves (`/me/profile`) or as an
 * admin. Admins use the full PUT /api/students/:id endpoint; students use
 * the whitelisted PUT /api/students/me. Returns a mutate(patch) helper that
 * accepts the patch keys directly so each section can wire its own form.
 */
function useSectionSave(student: any, selfMode: boolean, sectionLabel: string) {
  const qc = useQueryClient();
  return useMutation<unknown, any, StudentPatch>({
    mutationFn: async (patch) => {
      if (selfMode) return studentService.updateMe(patch as any);
      return studentService.update(student.id, patch);
    },
    onSuccess: () => {
      toast.success(`${sectionLabel} updated.`);
      qc.invalidateQueries({
        queryKey: selfMode
          ? ["student", "me"]
          : ["student", String(student.id)],
      });
    },
    onError: (e: any) =>
      toast.error(
        e?.response?.data?.message ??
          `Failed to update ${sectionLabel.toLowerCase()}`,
      ),
  });
}

function PersonalDetailsSection({
  student,
  app,
  fullName,
  genderLabel,
  selfMode,
}: {
  student: any;
  app: any;
  fullName: string;
  genderLabel: string | null;
  selfMode: boolean;
}) {
  const [editing, setEditing] = useState(false);

  const pick = (...vals: any[]) =>
    vals.find((v) => v !== undefined && v !== null && v !== "") ?? null;

  const buildInitial = () => ({
    fname: (student.fname ?? "") as string,
    lname: (student.lname ?? "") as string,
    gender: ((pick(student.gender, app?.gender) ?? "") as string)
      .toUpperCase()
      .slice(0, 1),
    birthdate: (pick(student.birthdate, app?.birthdate) ?? "") as string,
    marital_status: (
      (pick(student.marital_status, app?.marital_status) ?? "") as string
    ).toLowerCase(),
    id_card: (pick(student.id_card, app?.national_id) ?? "") as string,
    nationality: (pick(student.nationality, app?.nationality) ?? "") as string,
    father: (pick(student.father, app?.father) ?? "") as string,
    mother: (pick(student.mother, app?.mother) ?? "") as string,
    country: (pick(student.country, app?.country_of_residence) ?? "") as string,
    disability: (pick(student.disability, app?.disability) ?? "") as string,
  });
  const [form, setForm] = useState(buildInitial);
  useEffect(() => {
    setForm(buildInitial());  
  }, [student, app]);

  const save = useSectionSave(student, selfMode, "Personal details");
  // Self-service correction path for the identity fields a student cannot
  // edit directly (migration 147). Admins edit them inline instead.
  const [requestOpen, setRequestOpen] = useState(false);
  const set =
    (k: keyof ReturnType<typeof buildInitial>) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSave = () => {
    if (selfMode) {
      save.mutate({ marital_status: form.marital_status || null });
    } else {
      save.mutate({
        fname: form.fname.trim(),
        lname: form.lname.trim(),
        gender: form.gender || null,
        birthdate: form.birthdate || null,
        marital_status: form.marital_status || null,
        id_card: form.id_card.trim() || null,
        nationality: form.nationality.trim() || null,
        father: form.father.trim() || null,
        mother: form.mother.trim() || null,
        country: form.country.trim() || null,
        disability: form.disability.trim() || null,
      });
    }
  };

  // Close editor on a successful save. Mirrored from save.isSuccess so we
  // don't have to inline this in every onSuccess handler.
  useEffect(() => {
    if (save.isSuccess) setEditing(false);
  }, [save.isSuccess]);

  return (
    <section className="card p-6">
      <div className="flex items-start justify-between gap-3">
        <SectionHeader
          title="Personal Details"
          sub="Identity and parental information."
          icon={User}
        />
        <div className="flex items-center gap-2 shrink-0">
          {selfMode && !editing && (
            <button
              type="button"
              onClick={() => setRequestOpen(true)}
              className="btn-ghost btn-sm flex items-center gap-1.5 h-7 px-2.5"
              title="Ask the registry to correct your name, date of birth or ID"
            >
              <Edit className="w-3.5 h-3.5" />
              <span>Request a correction</span>
            </button>
          )}
          {!editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="btn-secondary btn-sm flex items-center gap-1.5 h-7 px-2.5"
            >
              <Edit className="w-3.5 h-3.5" />
              <span>Edit</span>
            </button>
          )}
        </div>
      </div>

      {requestOpen && (
        <ProfileChangeRequestModal
          student={student}
          onClose={() => setRequestOpen(false)}
        />
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5 mt-6">
        {/* First name */}
        {!selfMode && editing ? (
          <FieldGroup label="First Name" icon={User}>
            <TextInput value={form.fname} onChange={set("fname")} />
          </FieldGroup>
        ) : (
          <InfoGroup label="Full Name" value={fullName} icon={User} />
        )}
        {!selfMode && editing && (
          <FieldGroup label="Last Name" icon={User}>
            <TextInput value={form.lname} onChange={set("lname")} />
          </FieldGroup>
        )}

        {/* Gender */}
        {!selfMode && editing ? (
          <FieldGroup label="Gender">
            <select
              value={form.gender}
              onChange={set("gender")}
              className={selectInputClass}
            >
              <option value="">— Select —</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
            </select>
          </FieldGroup>
        ) : (
          <InfoGroup label="Gender" value={genderLabel} />
        )}

        {/* Birthdate */}
        {!selfMode && editing ? (
          <FieldGroup label="Date of Birth" icon={CalendarDays}>
            <TextInput
              type="date"
              value={form.birthdate || ""}
              onChange={set("birthdate")}
            />
          </FieldGroup>
        ) : (
          <InfoGroup
            label="Date of Birth"
            value={pick(student.birthdate, app?.birthdate)}
            icon={CalendarDays}
          />
        )}

        {/* Marital status — both selfMode and admin can edit this. */}
        {editing ? (
          <FieldGroup label="Marital Status" icon={Heart}>
            <select
              value={form.marital_status}
              onChange={set("marital_status")}
              className={selectInputClass}
            >
              <option value="">— Select —</option>
              <option value="single">Single</option>
              <option value="married">Married</option>
              <option value="divorced">Divorced</option>
              <option value="widowed">Widowed</option>
            </select>
          </FieldGroup>
        ) : (
          <InfoGroup
            label="Marital Status"
            value={cap(pick(student.marital_status, app?.marital_status))}
            icon={Heart}
          />
        )}

        {/* Admin-editable identity fields */}
        {!selfMode && editing ? (
          <>
            <FieldGroup label="National ID / Passport" icon={CreditCard}>
              <TextInput value={form.id_card} onChange={set("id_card")} />
            </FieldGroup>
            <FieldGroup label="Nationality" icon={Globe2}>
              <CountrySelect
                mode="nationality"
                value={form.nationality}
                onChange={(v) => setForm((f) => ({ ...f, nationality: v }))}
                placeholder="Select nationality"
              />
            </FieldGroup>
            <FieldGroup label="Father's Name" icon={UsersIcon}>
              <TextInput value={form.father} onChange={set("father")} />
            </FieldGroup>
            <FieldGroup label="Mother's Name" icon={UsersIcon}>
              <TextInput value={form.mother} onChange={set("mother")} />
            </FieldGroup>
            <FieldGroup label="Country of Residence" icon={MapPin}>
              <CountrySelect
                mode="country"
                value={form.country}
                onChange={(v) => setForm((f) => ({ ...f, country: v }))}
                placeholder="Select country"
              />
            </FieldGroup>
            <FieldGroup label="Disability" icon={Accessibility}>
              <TextInput
                value={form.disability}
                onChange={set("disability")}
                placeholder="None"
              />
            </FieldGroup>
          </>
        ) : (
          <>
            <InfoGroup
              label="National ID / Passport"
              value={pick(student.id_card, app?.national_id)}
              icon={CreditCard}
            />
            <InfoGroup
              label="Nationality"
              value={withFlag(pick(student.nationality, app?.nationality), "nationality")}
              icon={Globe2}
            />
            <InfoGroup
              label="Father's Name"
              value={pick(student.father, app?.father)}
              icon={UsersIcon}
            />
            <InfoGroup
              label="Mother's Name"
              value={pick(student.mother, app?.mother)}
              icon={UsersIcon}
            />
            <InfoGroup
              label="Country of Residence"
              value={withFlag(pick(student.country, app?.country_of_residence), "country")}
              icon={MapPin}
            />
            <InfoGroup
              label="Disability"
              value={pick(student.disability, app?.disability) ?? "None"}
              icon={Accessibility}
            />
          </>
        )}
      </div>

      {editing && (
        <SectionEditFooter
          saving={save.isPending}
          onCancel={() => {
            setForm(buildInitial());
            setEditing(false);
          }}
          onSave={handleSave}
        />
      )}
    </section>
  );
}

/**
 * Contact section — phone is the only field a student is allowed to edit.
 * Email is the login identifier (changing it server-side would risk locking
 * the user out) and reference phone belongs to the application record, so
 * both stay read-only.
 */
function ContactSection({
  student,
  app,
  selfMode,
}: {
  student: any;
  app: any;
  selfMode: boolean;
}) {
  const [editing, setEditing] = useState(false);

  const pick = (...vals: any[]) =>
    vals.find((v) => v !== undefined && v !== null && v !== "") ?? null;

  const buildInitial = () => ({
    phone: (pick(student.phone, app?.phone) ?? "") as string,
    email: (pick(student.email, app?.email) ?? "") as string,
  });
  const [form, setForm] = useState(buildInitial);
  useEffect(() => {
    setForm(buildInitial());  
  }, [student.phone, student.email, app?.phone, app?.email]);

  const save = useSectionSave(student, selfMode, "Contact");
  const set =
    (k: keyof ReturnType<typeof buildInitial>) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSave = () => {
    if (selfMode) {
      save.mutate({ phone: form.phone.trim() || null });
    } else {
      save.mutate({
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
      });
    }
  };

  useEffect(() => {
    if (save.isSuccess) setEditing(false);
  }, [save.isSuccess]);

  return (
    <section className="card p-6">
      <div className="flex items-start justify-between gap-3">
        <SectionHeader
          title="Contact"
          sub="How we reach the student."
          icon={Phone}
        />
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="btn-secondary btn-sm flex items-center gap-1.5 h-7 px-2.5 shrink-0"
          >
            <Edit className="w-3.5 h-3.5" />
            <span>Edit</span>
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5 mt-6">
        {editing ? (
          <FieldGroup label="Phone" icon={Phone}>
            <TextInput
              type="tel"
              value={form.phone}
              onChange={set("phone")}
              placeholder="+250 7XX XXX XXX"
            />
          </FieldGroup>
        ) : (
          <InfoGroup
            label="Phone"
            value={pick(student.phone, app?.phone)}
            icon={Phone}
          />
        )}
        <InfoGroup
          label="Reference Person Phone"
          value={pick(app?.reference_phone)}
          icon={Phone}
        />
        <div className="sm:col-span-2">
          {!selfMode && editing ? (
            <FieldGroup label="Email" icon={Mail}>
              <TextInput
                type="email"
                value={form.email}
                onChange={set("email")}
                placeholder="student@example.com"
              />
            </FieldGroup>
          ) : (
            <InfoGroup
              label="Email"
              value={pick(student.email, app?.email)}
              icon={Mail}
            />
          )}
        </div>
      </div>

      {editing && (
        <SectionEditFooter
          saving={save.isPending}
          onCancel={() => {
            setForm(buildInitial());
            setEditing(false);
          }}
          onSave={handleSave}
        />
      )}
    </section>
  );
}

/**
 * Residency — province/district/sector/cell/village live on the student
 * record itself, so students can self-edit them. Address and residence
 * district stay read-only (admin-only on the application record).
 */
function ResidencySection({
  student,
  app,
  selfMode,
}: {
  student: any;
  app: any;
  selfMode: boolean;
}) {
  const [editing, setEditing] = useState(false);

  const pick = (...vals: any[]) =>
    vals.find((v) => v !== undefined && v !== null && v !== "") ?? null;

  const buildInitial = () => ({
    province: (pick(student.province, app?.province) ?? "") as string,
    district: (pick(student.district, app?.district) ?? "") as string,
    sector: (pick(student.sector, app?.sector) ?? "") as string,
    cell: (pick(student.cell) ?? "") as string,
    village: (pick(student.village) ?? "") as string,
  });
  const [form, setForm] = useState(buildInitial);
  useEffect(() => {
    setForm(buildInitial());  
  }, [
    student.province,
    student.district,
    student.sector,
    student.cell,
    student.village,
    app?.province,
    app?.district,
    app?.sector,
  ]);

  const save = useSectionSave(student, selfMode, "Residency");

  const handleSave = () =>
    save.mutate({
      province: form.province.trim() || null,
      district: form.district.trim() || null,
      sector: form.sector.trim() || null,
      cell: form.cell.trim() || null,
      village: form.village.trim() || null,
    });

  useEffect(() => {
    if (save.isSuccess) setEditing(false);
  }, [save.isSuccess]);

  return (
    <section className="card p-6">
      <div className="flex items-start justify-between gap-3">
        <SectionHeader
          title="Residency"
          sub="Where the student lives."
          icon={MapPin}
        />
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="btn-secondary btn-sm flex items-center gap-1.5 h-7 px-2.5 shrink-0"
          >
            <Edit className="w-3.5 h-3.5" />
            <span>Edit</span>
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5 mt-6">
        {editing ? (
          <>
            {/* Cascading picker — district options are scoped to the chosen
                province, and changing a level clears the ones below it so a
                stale district/sector pairing can't be saved. Levels without
                bundled reference data stay free text. */}
            <LocationSelect
              value={{
                province: form.province,
                district: form.district,
                sector:   form.sector,
                cell:     form.cell,
                village:  form.village,
              }}
              onChange={(next) =>
                setForm((f) => ({
                  ...f,
                  province: next.province ?? "",
                  district: next.district ?? "",
                  sector:   next.sector   ?? "",
                  cell:     next.cell     ?? "",
                  village:  next.village  ?? "",
                }))
              }
              renderField={({ label, control }) => (
                <FieldGroup label={label}>{control}</FieldGroup>
              )}
            />
          </>
        ) : (
          <>
            <InfoGroup
              label="Province"
              value={pick(student.province, app?.province)}
            />
            <InfoGroup
              label="District"
              value={pick(student.district, app?.district)}
            />
            <InfoGroup
              label="Sector"
              value={pick(student.sector, app?.sector)}
            />
            <InfoGroup label="Cell" value={pick(student.cell)} />
            <InfoGroup label="Village" value={pick(student.village)} />
          </>
        )}

        {/* Application-level fields stay read-only — they live on the application record. */}
        {pick(app?.residence_district) && (
          <InfoGroup
            label="Residence District"
            value={pick(app?.residence_district)}
          />
        )}
        {(pick(app?.address) || !editing) && (
          <div className="sm:col-span-2">
            <InfoGroup
              label="Address"
              value={pick(app?.address) ?? "Not provided"}
              icon={MapPin}
            />
          </div>
        )}
      </div>

      {editing && (
        <SectionEditFooter
          saving={save.isPending}
          onCancel={() => {
            setForm(buildInitial());
            setEditing(false);
          }}
          onSave={handleSave}
        />
      )}
    </section>
  );
}

/**
 * The states a student can be put into, shared by both editors on this page
 * (the Programme section and the Edit Student Details modal) so the two can
 * never drift apart.
 *
 * Values are the canonical ones the Students list groups on — see
 * StudentController::studentStateVariants(). "graduands" is stored plural
 * because that is what the existing rows hold; the label is singular because
 * it describes one student.
 */
const STUDENT_STATES: ReadonlyArray<{ value: string; label: string }> = [
  { value: "active",    label: "Active" },
  { value: "inactive",  label: "Inactive" },
  { value: "graduated", label: "Graduated" },
  { value: "graduands", label: "Graduand" },
  { value: "suspended", label: "Suspended" },
  { value: "rejected",  label: "Rejected" },
  { value: "dropped",   label: "Dropped out" },
  { value: "dismissed", label: "Dismissed" },
  { value: "deceased",  label: "Deceased" },
];

/**
 * Map a stored state onto one of STUDENT_STATES.
 *
 * `student.student_state` is free text filled in by hand over years, so the
 * column holds "Active" and "ACTIVE" as well as "active", plus one-off
 * spellings like "Graduates" and "resume". A `<select>` whose value matches no
 * option falls back to its FIRST option, so those students' status silently
 * displayed as Active — and saving the form wrote that back, changing a state
 * nobody meant to touch. Folding the value first keeps the box honest.
 *
 * Mirrors the server-side grouping so the form and the list agree.
 */
function normaliseStudentState(raw: string | null | undefined): string {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "") return "active";

  const groups: Record<string, string[]> = {
    active:    ["active", "resume"],
    inactive:  ["inactive", "in-active", "in active"],
    graduated: ["graduated", "graduate", "graduates"],
    graduands: ["graduands", "graduand", "graduants", "graduant"],
    suspended: ["suspended", "suspend"],
    rejected:  ["rejected", "reject"],
    dropped:   ["dropped", "dropout", "drop out", "dropped out", "drop_out"],
    dismissed: ["dismissed", "dismiss"],
    deceased:  ["deceased", "death", "died", "dead"],
  };
  for (const [canonical, spellings] of Object.entries(groups)) {
    if (spellings.includes(value)) return canonical;
  }
  // An unrecognised state (e.g. the 28 "XXX" rows) is left alone rather than
  // being rewritten to Active behind the user's back. The status display falls
  // back to showing the raw value, so it stays visible and intact until
  // somebody deliberately changes it through the Status action.
  return value;
}

/**
 * Programme Details — read-only for students, editable by admins. Changing
 * std_option triggers a server-side recompute of faculty/department to keep
 * the legacy columns in sync with the catalog. Options come from the stats
 * facets so the dropdowns mirror what's exposed on the students list.
 */
function ProgrammeSection({
  student,
  app,
  stats,
  selfMode,
}: {
  student: any;
  app: any;
  stats: any;
  selfMode: boolean;
}) {
  const { levelName: resolveLevelName } = useLevels();
  const [editing, setEditing] = useState(false);

  const pick = (...vals: any[]) =>
    vals.find((v) => v !== undefined && v !== null && v !== "") ?? null;

  const optionFacets = (stats?.facets?.options ?? []) as Array<{
    value: string;
    label: string;
    department_id: number | null;
    faculty_id: number | null;
  }>;
  const levelFacets = (stats?.facets?.current_level ?? []) as FacetLite[];
  const yearFacets = (stats?.facets?.acc_year ?? []) as FacetLite[];
  const facultyFacets = (stats?.facets?.faculty ?? []) as FacetLite[];
  const departmentFacets = (stats?.facets?.department ?? []) as FacetLite[];

  // Same rule as the hero card: never fall back to `student.program` —
  // that column stores the learning mode, not the programme name.
  const programName =
    optionFacets.find((o) => String(o.value) === String(student.std_option))
      ?.label ??
    app?.program_name ??
    null;
  const facultyName =
    facultyFacets.find((f) => String(f.value) === String(student.faculty))
      ?.label ??
    app?.faculty_name ??
    student.faculty ??
    null;
  const deptName =
    departmentFacets.find((f) => String(f.value) === String(student.department))
      ?.label ??
    app?.department_name ??
    student.department ??
    null;
  // Never fall through to the raw `current_level` — it stores a `levels.id`,
  // so the hero card would read "3" where the catalogue says "Year 2".
  const levelName =
    levelFacets.find((f) => String(f.value) === String(student.current_level))
      ?.label ??
    student.level_name ??
    resolveLevelName(student.current_level, "") ??
    null;

  const buildInitial = () => ({
    std_option: student.std_option ? String(student.std_option) : "",
    current_level: student.current_level ? String(student.current_level) : "",
    intake: (student.intake ?? "") as string,
    acc_year: (student.acc_year ?? "") as string,
    registration_date: (student.registration_date ?? "") as string,
    regnumber: (student.regnumber ?? "") as string,
    student_state: normaliseStudentState(student.student_state),
    sponsor: (student.sponsor ?? "") as string,
  });
  const [form, setForm] = useState(buildInitial);
  const [statusOpen, setStatusOpen] = useState(false);
  useEffect(() => {
    setForm(buildInitial());  
  }, [
    student.std_option,
    student.current_level,
    student.intake,
    student.acc_year,
    student.registration_date,
    student.regnumber,
    student.student_state,
    student.sponsor,
  ]);

  const save = useSectionSave(student, selfMode, "Programme details");
  const set =
    (k: keyof ReturnType<typeof buildInitial>) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSave = () =>
    save.mutate({
      std_option: form.std_option || null,
      current_level: form.current_level || null,
      intake: form.intake.trim() || null,
      acc_year: form.acc_year.trim() || null,
      registration_date: form.registration_date || null,
      regnumber: form.regnumber.trim() || null,
      sponsor: form.sponsor.trim() || null,
    });

  useEffect(() => {
    if (save.isSuccess) setEditing(false);
  }, [save.isSuccess]);

  // Selected option preview helps admins see the cascading faculty/department
  // they're about to commit to before they save.
  const selectedOption =
    optionFacets.find((o) => String(o.value) === String(form.std_option)) ??
    null;
  const previewFaculty = selectedOption
    ? (facultyFacets.find(
        (f) => String(f.value) === String(selectedOption.faculty_id),
      )?.label ?? facultyName)
    : facultyName;
  const previewDept = selectedOption
    ? (departmentFacets.find(
        (d) => String(d.value) === String(selectedOption.department_id),
      )?.label ?? deptName)
    : deptName;

  return (
    <section className="card p-6">
      <div className="flex items-start justify-between gap-3">
        <SectionHeader
          title="Programme Details"
          sub="Faculty, department, programme and academic year."
          icon={BookOpen}
        />
        {!selfMode && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="btn-secondary btn-sm flex items-center gap-1.5 h-7 px-2.5 shrink-0"
          >
            <Edit className="w-3.5 h-3.5" />
            <span>Edit</span>
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5 mt-6">
        {editing ? (
          <>
            <FieldGroup label="Program" icon={BookOpen}>
              <select
                value={form.std_option}
                onChange={set("std_option")}
                className={selectInputClass}
              >
                <option value="">— Select program —</option>
                {optionFacets.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </FieldGroup>
            <InfoGroup
              label="Faculty"
              value={previewFaculty}
              icon={Building2}
            />
            <InfoGroup
              label="Department"
              value={previewDept}
              icon={GraduationCap}
            />

            <FieldGroup label="Current Level" icon={CheckCircle}>
              <select
                value={form.current_level}
                onChange={set("current_level")}
                className={selectInputClass}
              >
                <option value="">— Select —</option>
                {levelFacets.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </FieldGroup>
            <FieldGroup label="Academic Year" icon={Calendar}>
              <select
                value={form.acc_year}
                onChange={set("acc_year")}
                className={selectInputClass}
              >
                <option value="">— Select —</option>
                {yearFacets.map((y) => (
                  <option key={y.value} value={y.value}>
                    {y.label}
                  </option>
                ))}
              </select>
            </FieldGroup>
            <FieldGroup label="Registration Date" icon={Calendar}>
              <TextInput
                type="date"
                value={form.registration_date}
                onChange={set("registration_date")}
              />
            </FieldGroup>
            <FieldGroup label="Reg Number">
              <TextInput value={form.regnumber} onChange={set("regnumber")} />
            </FieldGroup>
            <FieldGroup label="Intake" icon={Calendar}>
              <TextInput value={form.intake} onChange={set("intake")} />
            </FieldGroup>
            <FieldGroup label="Sponsor">
              <TextInput value={form.sponsor} onChange={set("sponsor")} />
            </FieldGroup>

            <FieldGroup label="Status">
              {/* Same reason as the modal: changing a status is its own
                  action, with its own evidence rules and audit trail. */}
              <button
                type="button"
                onClick={() => setStatusOpen(true)}
                className={selectInputClass + " text-left flex items-center justify-between gap-2"}
              >
                <span>
                  {STUDENT_STATES.find((o) => o.value === form.student_state)?.label ??
                    form.student_state ??
                    "—"}
                </span>
                <span className="text-[11px] font-semibold text-brand">Change…</span>
              </button>
            </FieldGroup>
          </>
        ) : (
          <>
            <InfoGroup label="Program" value={programName} icon={BookOpen} />
            <InfoGroup label="Faculty" value={facultyName} icon={Building2} />
            <InfoGroup
              label="Department"
              value={deptName}
              icon={GraduationCap}
            />
            <InfoGroup
              label="Current Level"
              value={levelName}
              icon={CheckCircle}
            />
            <InfoGroup
              label="Campus"
              value={pick(app?.campus_name)}
              icon={Building2}
            />
            <InfoGroup
              label="Mode of Study"
              value={cap(pick(app?.mode_of_study, student.program))}
            />
            <InfoGroup
              label="Intake"
              value={pick(student.intake, app?.intake)}
              icon={Calendar}
            />
            <InfoGroup
              label="Academic Year"
              value={pick(student.acc_year, app?.academic_year_label)}
              icon={Calendar}
            />
            <InfoGroup
              label="Registration Date"
              value={pick(student.registration_date)}
              icon={Calendar}
            />
          </>
        )}
      </div>

      {editing && (
        <SectionEditFooter
          saving={save.isPending}
          onCancel={() => {
            setForm(buildInitial());
            setEditing(false);
          }}
          onSave={handleSave}
        />
      )}

      {statusOpen && (
        <StatusChangeModal
          studentId={Number(student.id)}
          studentName={
            `${student.fname ?? ""} ${student.lname ?? ""}`.trim() ||
            (student.regnumber ?? "This student")
          }
          currentState={normaliseStudentState(student.student_state)}
          onClose={() => setStatusOpen(false)}
        />
      )}
    </section>
  );
}

/** Cancel + Save button row used by every editable section. */
function SectionEditFooter({
  saving,
  onCancel,
  onSave,
}: {
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="mt-6 flex items-center justify-end gap-2 pt-4 border-t border-ink-100 dark:border-ink-800">
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        className="btn-secondary btn-sm flex items-center gap-1.5 h-8 px-3"
      >
        <X className="w-3.5 h-3.5" /> Cancel
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="btn-primary btn-sm flex items-center gap-1.5 h-8 px-3"
      >
        {saving ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Save className="w-3.5 h-3.5" />
        )}
        Save
      </button>
    </div>
  );
}

interface FacetLite {
  value: string;
  label: string;
}

/** Plain text input styled to match the FieldGroup wrapper. */
function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="text"
      {...props}
      className={`w-full h-9 px-3 rounded-md border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-900 text-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none ${props.className ?? ""}`}
    />
  );
}

/** Field-styling inputs use this className — share it with selects so the
 *  edit forms look consistent without spelling out the Tailwind chain. */
const selectInputClass =
  "w-full h-9 px-3 rounded-md border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-900 text-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none";

/**
 * Change Password card. Requires the current password before persisting,
 * mirrors the server's 8-char minimum, and clears the form on success.
 */
function ChangePasswordSection() {
  const [show, setShow] = useState({
    current: false,
    next: false,
    confirm: false,
  });
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [err, setErr] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: () =>
      authService.changePassword({
        current_password: form.current,
        new_password: form.next,
      }),
    onSuccess: () => {
      toast.success("Password updated.");
      setForm({ current: "", next: "", confirm: "" });
      setErr(null);
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message ?? "Failed to update password";
      setErr(msg);
      toast.error(msg);
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (form.next.length < 8) {
      setErr("New password must be at least 8 characters.");
      return;
    }
    if (form.next !== form.confirm) {
      setErr("New password and confirmation do not match.");
      return;
    }
    submit.mutate();
  };

  const togglePill = (key: keyof typeof show) => (
    <button
      type="button"
      onClick={() => setShow((s) => ({ ...s, [key]: !s[key] }))}
      className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700 dark:hover:text-ink-200"
      tabIndex={-1}
    >
      {show[key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
    </button>
  );

  return (
    <section className="card p-6">
      <SectionHeader
        title="Change Password"
        sub="Update the password you use to sign in."
        icon={Lock}
      />
      <form
        onSubmit={onSubmit}
        className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl"
      >
        <div>
          <label className="text-[11px] uppercase tracking-wider text-ink-400 font-bold block mb-1.5">
            Current password
          </label>
          <div className="relative">
            <input
              type={show.current ? "text" : "password"}
              value={form.current}
              onChange={(e) =>
                setForm((f) => ({ ...f, current: e.target.value }))
              }
              autoComplete="current-password"
              className="w-full h-9 pl-3 pr-9 rounded-md border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-900 text-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none"
              required
            />
            {togglePill("current")}
          </div>
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wider text-ink-400 font-bold block mb-1.5">
            New password
          </label>
          <div className="relative">
            <input
              type={show.next ? "text" : "password"}
              value={form.next}
              onChange={(e) => setForm((f) => ({ ...f, next: e.target.value }))}
              autoComplete="new-password"
              minLength={8}
              className="w-full h-9 pl-3 pr-9 rounded-md border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-900 text-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none"
              required
            />
            {togglePill("next")}
          </div>
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wider text-ink-400 font-bold block mb-1.5">
            Confirm new password
          </label>
          <div className="relative">
            <input
              type={show.confirm ? "text" : "password"}
              value={form.confirm}
              onChange={(e) =>
                setForm((f) => ({ ...f, confirm: e.target.value }))
              }
              autoComplete="new-password"
              minLength={8}
              className="w-full h-9 pl-3 pr-9 rounded-md border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-900 text-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none"
              required
            />
            {togglePill("confirm")}
          </div>
        </div>

        {err && (
          <div className="sm:col-span-3 text-[12px] text-red-600 dark:text-red-400 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> {err}
          </div>
        )}

        <div className="sm:col-span-3 pt-1">
          <button
            type="submit"
            disabled={submit.isPending}
            className="btn-primary flex items-center gap-1.5 h-9 px-4"
          >
            {submit.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Lock className="w-3.5 h-3.5" />
            )}
            Update password
          </button>
        </div>
      </form>
    </section>
  );
}

/** Wraps an editable form input with the same label styling as InfoGroup. */
function FieldGroup({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon?: any;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wider text-ink-400 font-bold mb-1.5">
        {label}
      </p>
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-3.5 h-3.5 text-ink-300 shrink-0" />}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}

function Chip({
  icon: Icon,
  label,
  value,
}: {
  icon?: any;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-ink-50 dark:bg-ink-800/60 border border-ink-200 dark:border-ink-700 min-w-0">
      {Icon && (
        <div className="w-7 h-7 rounded-md bg-brand/10 text-brand flex items-center justify-center shrink-0 mt-0.5">
          <Icon className="w-3.5 h-3.5" />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-ink-400 font-bold leading-none">
          {label}
        </p>
        <p
          className="text-[13px] text-ink-900 dark:text-white font-semibold truncate mt-0.5"
          title={value}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

/**
 * Large editable photo used inside the overview hero card. In selfMode we
 * route uploads/downloads through `/api/students/me/photo`, which doesn't
 * require admin permissions, so a logged-in student can update their own
 * picture from /me/profile.
 *
 * Shows a local object-URL preview as soon as the file is picked, so the user
 * sees the new image immediately without waiting for the round-trip.
 */
function ProfileHeroPhoto({
  student,
  initials,
  selfMode,
  applicantPhoto,
}: {
  student: any;
  initials: string;
  selfMode: boolean;
  applicantPhoto?: { applicationId: number; applicant_photo_id: string } | null;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);
  // Cache-buster bumped after a successful upload — forces the cached <img>
  // to refetch even when student.photo arrives in a later refetch.
  const [v, setV] = useState(0);
  // Local object-URL preview shown as soon as the user picks a file. Cleared
  // once the server confirms; revoked on unmount to avoid leaking blobs.
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const [confirmRemove, setConfirmRemove] = useState(false);

  const invalidate = () =>
    qc.invalidateQueries({
      queryKey: selfMode ? ["student", "me"] : ["student", String(student.id)],
    });

  const upload = useMutation({
    mutationFn: (f: File) =>
      selfMode
        ? studentService.uploadMyPhoto(f)
        : studentService.uploadPhoto(student.id, f),
    onSuccess: () => {
      toast.success("Profile photo updated.");
      setV((n) => n + 1);
      invalidate();
    },
    onError: (e: any) => {
      // Drop the optimistic preview on failure so the old photo comes back.
      if (preview) {
        URL.revokeObjectURL(preview);
        setPreview(null);
      }
      toast.error(e?.response?.data?.message ?? "Failed to upload photo");
    },
    onSettled: () => {
      // Keep the preview visible briefly until the refetch lands, then drop it.
      setTimeout(() => {
        setPreview((p) => {
          if (p) URL.revokeObjectURL(p);
          return null;
        });
      }, 1500);
    },
  });

  const remove = useMutation({
    mutationFn: () =>
      selfMode
        ? studentService.deleteMyPhoto()
        : studentService.deletePhoto(student.id),
    onSuccess: () => {
      toast.success("Profile photo removed.");
      // Clear any lingering local preview, otherwise the just-deleted image
      // would keep showing until the refetch lands.
      setPreview((p) => {
        if (p) URL.revokeObjectURL(p);
        return null;
      });
      setV((n) => n + 1);
      setConfirmRemove(false);
      invalidate();
    },
    onError: (e: any) => {
      setConfirmRemove(false);
      toast.error(e?.response?.data?.message ?? "Failed to remove photo");
    },
  });

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      toast.error("Photo must be 5 MB or smaller.");
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(f));
    upload.mutate(f);
  };

  // Try student photo first; if not available, check applicant profile via application
  let photoSrc =
    preview ??
    (student.photo
      ? selfMode
        ? studentService.myPhotoUrl(`${student.photo}-${v}`)
        : studentService.photoUrl(student.id, `${student.photo}-${v}`)
      : applicantPhoto && applicantPhoto.applicationId
      ? applicationAdminService.photoUrl(applicantPhoto.applicationId, applicantPhoto.applicant_photo_id)
      : null);

  const busy     = upload.isPending || remove.isPending;
  const hasPhoto = !!student.photo || !!preview;

  return (
    <div className="shrink-0 w-full sm:w-auto flex flex-col items-center sm:items-start gap-3">
      <div className="relative group">
        <div className="w-48 h-48 sm:w-56 sm:h-56 rounded-2xl overflow-hidden bg-ink-100 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 shadow-sm flex items-center justify-center relative">
          <span className="text-6xl font-bold text-ink-400">{initials}</span>
          {photoSrc && (
            <img
              src={photoSrc}
              alt={
                `${student.fname ?? ""} ${student.lname ?? ""}`.trim() ||
                "Student photo"
              }
              className="w-full h-full object-cover absolute inset-0"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          )}

          {(upload.isPending || remove.isPending) && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-white animate-spin" />
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => !busy && fileRef.current?.click()}
          disabled={busy}
          className="absolute bottom-2 right-2 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-white text-xs font-semibold shadow-md hover:bg-brand/90 transition-colors disabled:opacity-60 outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ring-offset-white dark:ring-offset-ink-900"
          aria-label="Change profile photo"
        >
          <Camera className="w-3.5 h-3.5" />
          <span>Change</span>
        </button>
      </div>

      {/* Only offered when there is actually a photo to remove. */}
      {hasPhoto && (
        <button
          type="button"
          onClick={() => setConfirmRemove(true)}
          disabled={busy}
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-red-600 hover:text-red-700 hover:underline disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-red-500 rounded"
        >
          <Trash2 className="w-3.5 h-3.5" />
          {remove.isPending ? "Removing…" : "Remove photo"}
        </button>
      )}

      <p className="text-[11px] text-ink-400 text-center sm:text-left">
        JPEG, PNG or WebP · max 5 MB
      </p>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={onPick}
      />

      <ConfirmDialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        onConfirm={() => remove.mutate()}
        title="Remove profile photo?"
        message="The photo will be deleted permanently. You can upload a new one at any time."
        confirmLabel="Remove"
        variant="danger"
        loading={remove.isPending}
      />
    </div>
  );
}

function SectionHeader({
  title,
  sub,
  icon: Icon,
}: {
  title: string;
  sub?: string;
  icon?: any;
}) {
  return (
    <div className="flex items-center gap-3">
      {Icon && (
        <div className="w-9 h-9 rounded-xl bg-brand/10 flex items-center justify-center text-brand shrink-0">
          <Icon className="w-4 h-4" />
        </div>
      )}
      <div className="min-w-0">
        <h3 className="text-[15px] font-bold text-ink-900 dark:text-white leading-tight">
          {title}
        </h3>
        {sub && (
          <p className="text-[12px] text-ink-500 mt-0.5 truncate">{sub}</p>
        )}
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
  value?: React.ReactNode;
  icon?: any;
}) {
  // String values can be used as a tooltip; non-string ReactNode (e.g. a
  // flag-wrapped span) is rendered as-is without a title attribute.
  const titleAttr = typeof value === "string" ? value : "";
  const isEmpty =
    value === null || value === undefined || value === "" || value === false;
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wider text-ink-400 font-bold mb-1">
        {label}
      </p>
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-3.5 h-3.5 text-ink-300 shrink-0" />}
        <p
          className="text-[14px] text-ink-900 dark:text-white font-medium truncate"
          title={titleAttr}
        >
          {isEmpty ? "—" : value}
        </p>
      </div>
    </div>
  );
}

function cap(s?: string | null): string | null {
  if (!s) return null;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function StudentAvatar({
  student,
  initials,
  selfMode = false,
}: {
  student: any;
  initials: string;
  selfMode?: boolean;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);
  // Bumped after a successful upload so the cached <img> reloads even when
  // the file_server_id stays in transit before the student query refetches.
  const [v, setV] = useState(0);

  const [confirmRemove, setConfirmRemove] = useState(false);

  const invalidate = () =>
    qc.invalidateQueries({
      queryKey: selfMode ? ["student", "me"] : ["student", String(student.id)],
    });

  const upload = useMutation({
    mutationFn: (f: File) =>
      selfMode
        ? studentService.uploadMyPhoto(f)
        : studentService.uploadPhoto(student.id, f),
    onSuccess: () => {
      toast.success("Profile photo updated.");
      setV((n) => n + 1);
      invalidate();
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? "Failed to upload photo"),
  });

  const remove = useMutation({
    mutationFn: () =>
      selfMode
        ? studentService.deleteMyPhoto()
        : studentService.deletePhoto(student.id),
    onSuccess: () => {
      toast.success("Profile photo removed.");
      setV((n) => n + 1);
      setConfirmRemove(false);
      invalidate();
    },
    onError: (e: any) => {
      setConfirmRemove(false);
      toast.error(e?.response?.data?.message ?? "Failed to remove photo");
    },
  });

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      toast.error("Photo must be 5 MB or smaller.");
      return;
    }
    upload.mutate(f);
  };

  const photoSrc = student.photo
    ? selfMode
      ? studentService.myPhotoUrl(`${student.photo}-${v}`)
      : studentService.photoUrl(student.id, `${student.photo}-${v}`)
    : null;

  const busy = upload.isPending || remove.isPending;

  return (
    // Not a <button>: the remove control is nested inside, and a button inside
    // a button is invalid HTML that browsers silently restructure.
    // `group` lives here so both the camera overlay and the remove badge
    // reveal together on hover.
    <div className="group relative shrink-0">
      <div
        role="button"
        tabIndex={busy ? -1 : 0}
        aria-label="Change profile photo"
        title="Change profile photo"
        onClick={() => !busy && fileRef.current?.click()}
        onKeyDown={(e) => {
          if (busy) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileRef.current?.click();
          }
        }}
        className={`relative w-16 h-16 rounded-xl overflow-hidden bg-brand/10 text-brand flex items-center justify-center text-xl font-bold outline-none focus-visible:ring-2 focus-visible:ring-brand ${busy ? "opacity-60" : "cursor-pointer"}`}
      >
        <span>{initials}</span>
        {photoSrc && (
          <img
            src={photoSrc}
            alt={
              `${student.fname ?? ""} ${student.lname ?? ""}`.trim() ||
              "Student photo"
            }
            className="w-full h-full object-cover absolute inset-0"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        )}

        <span className="absolute inset-0 bg-black/45 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          {busy ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Camera className="w-5 h-5" />
          )}
        </span>
      </div>

      {student.photo && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setConfirmRemove(true);
          }}
          disabled={busy}
          title="Remove profile photo"
          aria-label="Remove profile photo"
          className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-600 text-red-600 shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-red-50 dark:hover:bg-red-900/20 transition-opacity disabled:opacity-40"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={onPick}
      />

      <ConfirmDialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        onConfirm={() => remove.mutate()}
        title="Remove profile photo?"
        message="The photo will be deleted permanently. You can upload a new one at any time."
        confirmLabel="Remove"
        variant="danger"
        loading={remove.isPending}
      />
    </div>
  );
}

function TabButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: any;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
        active
          ? "border-brand text-brand"
          : "border-transparent text-ink-500 hover:text-ink-900 dark:hover:text-ink-200 hover:border-ink-300"
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

/**
 * Curriculum view: every module attached to the student's program (option),
 * grouped by level and ordered by module_order. Each module shows the
 * student's marks pulled from the latest term they sat the module. The
 * table can be downloaded as a CSV via the dedicated server endpoint —
 * format mirrors what's on screen so it's printable as-is.
 */
type ModuleFilter =
  | "all"
  | "scheduled"
  | "enrolled"
  | "passed"
  | "failed"
  | "unmarked";

function ProgramCurriculumTab({
  student,
  selfMode = false,
}: {
  student: any;
  selfMode?: boolean;
}) {
  const studentId = student?.id;
  const qc = useQueryClient();
  const canManageMarks = useAnyPermission([PERMISSIONS.RECORD_MODULE_MARKS, PERMISSIONS.MANAGE_MODULE_MARKS]);
  const isAdmin = !selfMode && canManageMarks;
  const [exempting, setExempting] = useState<{
    moduleId: number;
    moduleCode: string;
    moduleName: string;
  } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [enrollPending, setEnrollPending] = useState<number | null>(null);
  const [dropPending, setDropPending] = useState<number | null>(null);
  // IMPORTANT: every hook must run on every render. The early returns below
  // (loading / error / no-program) used to sit between the data hooks and
  // the filter hooks, which made React see "more hooks" once data arrived
  // and crash with "Rendered more hooks than during the previous render".
  // Keep all hook calls above any conditional return.
  const [filter, setFilter] = useState<ModuleFilter>("all");
  // Reset filter when student changes so we don't carry it across navigation.
  useEffect(() => {
    setFilter("all");
  }, [studentId]);

  const dataQ = useQuery({
    queryKey: selfMode
      ? ["student-program-modules", "me"]
      : ["student-program-modules", studentId],
    // Self mode hits /api/students/me/program-modules — no VIEW_STUDENTS
    // required, so the student portal can read its own curriculum.
    queryFn: () =>
      selfMode
        ? studentService.meProgramModules()
        : studentService.programModules(studentId),
    enabled: selfMode || !!studentId,
  });

  const enroll = useMutation({
    mutationFn: (moduleId: number) =>
      studentService.enrollModule(studentId, { module_id: moduleId }),
    onMutate: (moduleId) => setEnrollPending(moduleId),
    onSuccess: () => {
      toast.success("Module enrolled.");
      qc.invalidateQueries({
        queryKey: ["student-program-modules", studentId],
      });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? "Failed to enroll"),
    onSettled: () => setEnrollPending(null),
  });

  const drop = useMutation({
    mutationFn: (registrationId: number) =>
      studentService.dropModule(studentId, registrationId),
    onMutate: (registrationId) => setDropPending(registrationId),
    onSuccess: () => {
      toast.success("Registration dropped.");
      qc.invalidateQueries({
        queryKey: ["student-program-modules", studentId],
      });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? "Failed to drop registration"),
    onSettled: () => setDropPending(null),
  });

  if (dataQ.isLoading) {
    return (
      <div className="flex items-center justify-center p-20">
        <Loader2 className="w-6 h-6 text-brand animate-spin" />
      </div>
    );
  }

  if (dataQ.isError) {
    return (
      <PlaceholderTab
        icon={BookOpen}
        title="Couldn't load curriculum"
        desc={
          (dataQ.error as any)?.response?.data?.message ??
          "An error occurred while loading the program curriculum."
        }
      />
    );
  }

  const payload = dataQ.data?.data;
  const program = payload?.program ?? null;
  const groups = payload?.groups ?? [];

  if (!program) {
    return (
      <PlaceholderTab
        icon={BookOpen}
        title="No program assigned"
        desc="Assign this student to a program/option first — the curriculum will appear here once the link exists."
      />
    );
  }

  const totalModules = groups.reduce(
    (acc, g) => acc + (g.modules?.length ?? 0),
    0,
  );
  const allModules = groups.flatMap((g) => g.modules);
  const completed = allModules.filter(
    (m) => m.marks?.percentage != null && Number(m.marks.percentage) >= 50,
  ).length;
  const failed = allModules.filter(
    (m) => m.marks?.percentage != null && Number(m.marks.percentage) < 50,
  ).length;
  const unmarked = totalModules - completed - failed;
  const scheduled = allModules.filter((m) => m.is_scheduled).length;
  const enrolled = allModules.filter(
    (m) => m.registration?.status === "registered" && !m.marks,
  ).length;
  // Completion = modules the student has passed, out of total. Failed
  // doesn't count as complete — student typically resits.
  const completionPct =
    totalModules > 0 ? Math.round((completed / totalModules) * 100) : 0;
  const passedSegPct = totalModules > 0 ? (completed / totalModules) * 100 : 0;
  const failedSegPct = totalModules > 0 ? (failed / totalModules) * 100 : 0;
  const enrolledSegPct = totalModules > 0 ? (enrolled / totalModules) * 100 : 0;

  const matchesFilter = (m: ProgramModuleRow): boolean => {
    switch (filter) {
      case "scheduled":
        return !!m.is_scheduled;
      case "enrolled":
        return m.registration?.status === "registered" && !m.marks;
      case "passed":
        return m.marks?.percentage != null && Number(m.marks.percentage) >= 50;
      case "failed":
        return m.marks?.percentage != null && Number(m.marks.percentage) < 50;
      case "unmarked":
        return !m.marks;
      default:
        return true;
    }
  };
  const visibleGroups =
    filter === "all"
      ? groups
      : groups
          .map((g) => ({ ...g, modules: g.modules.filter(matchesFilter) }))
          .filter((g) => g.modules.length > 0);
  const visibleCount = visibleGroups.reduce(
    (acc, g) => acc + g.modules.length,
    0,
  );

  const downloadUrl = studentService.programModulesExportUrl(studentId);

  return (
    <div className="space-y-6">
      {/* Hero summary + download. Each card doubles as a filter chip — click
       *  to scope the per-level tables below to that subset, click again or
       *  click "Modules" to clear. */}
      <div className="flex flex-wrap items-center gap-3">
        <SummaryCard
          tone="brand"
          icon={BookOpen}
          label="Modules"
          value={totalModules}
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        <SummaryCard
          tone="indigo"
          icon={CalendarClock}
          label="Scheduled"
          value={scheduled}
          active={filter === "scheduled"}
          onClick={() =>
            setFilter(filter === "scheduled" ? "all" : "scheduled")
          }
        />
        <SummaryCard
          tone="sky"
          icon={GraduationCap}
          label="Enrolled"
          value={enrolled}
          active={filter === "enrolled"}
          onClick={() => setFilter(filter === "enrolled" ? "all" : "enrolled")}
        />
        <SummaryCard
          tone="emerald"
          icon={CheckCircle}
          label="Passed"
          value={completed}
          active={filter === "passed"}
          onClick={() => setFilter(filter === "passed" ? "all" : "passed")}
        />
        <SummaryCard
          tone="amber"
          icon={AlertTriangle}
          label="Failed"
          value={failed}
          active={filter === "failed"}
          onClick={() => setFilter(filter === "failed" ? "all" : "failed")}
        />
        <SummaryCard
          tone="ink"
          icon={Clock}
          label="Unmarked"
          value={unmarked}
          active={filter === "unmarked"}
          onClick={() => setFilter(filter === "unmarked" ? "all" : "unmarked")}
        />
        <div className="ml-auto flex items-center gap-2">
          {isAdmin && (
            <button
              type="button"
              className="btn-secondary btn-sm flex items-center gap-1.5 border-violet-200 text-violet-700 hover:bg-violet-50 dark:border-violet-500/30 dark:text-violet-300 dark:hover:bg-violet-500/10"
              onClick={() => setPickerOpen(true)}
              title="Record an exemption mark on an unmarked module"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Exempt module
            </button>
          )}
          {!selfMode && (
            <a
              href={downloadUrl}
              className="btn-primary btn-sm flex items-center gap-1.5"
              target="_blank"
              rel="noreferrer"
            >
              <Download className="w-3.5 h-3.5" />
              Download CSV
            </a>
          )}
        </div>
      </div>

      {/* Program info + completion progress */}
      <div className="card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-brand/10 text-brand flex items-center justify-center">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-ink-400 font-semibold">
              Program
            </p>
            <p className="text-[14px] font-bold text-ink-900 dark:text-white">
              {program.name}
            </p>
          </div>
          {program.code && (
            <span className="ml-2 font-mono text-[12px] bg-ink-100 dark:bg-ink-800 text-ink-700 dark:text-ink-200 px-2 py-1 rounded">
              {program.code}
            </span>
          )}
          <div className="ml-auto text-right">
            <p className="text-[11px] uppercase tracking-wider text-ink-400 font-semibold">
              Completion
            </p>
            <p className="text-[14px] font-bold text-ink-900 dark:text-white tabular-nums">
              {completed}/{totalModules}{" "}
              <span className="text-ink-400 font-medium">
                · {completionPct}%
              </span>
            </p>
          </div>
        </div>
        {/* Stacked progress bar: passed (emerald) | failed (rose) | enrolled
         *  (sky) | remaining (ink). Read left-to-right as the student's
         *  trajectory through the curriculum. */}
        <div
          className="h-2.5 w-full rounded-full bg-ink-100 dark:bg-ink-700/40 overflow-hidden flex"
          role="progressbar"
          aria-valuenow={completionPct}
          aria-valuemin={0}
          aria-valuemax={100}
          title={`${completed} passed · ${failed} failed · ${enrolled} enrolled · ${totalModules - completed - failed - enrolled} remaining`}
        >
          {passedSegPct > 0 && (
            <div
              className="h-full bg-emerald-500"
              style={{ width: `${passedSegPct}%` }}
            />
          )}
          {failedSegPct > 0 && (
            <div
              className="h-full bg-rose-400"
              style={{ width: `${failedSegPct}%` }}
            />
          )}
          {enrolledSegPct > 0 && (
            <div
              className="h-full bg-sky-400"
              style={{ width: `${enrolledSegPct}%` }}
            />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Passed{" "}
            {completed}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-400" /> Failed{" "}
            {failed}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-sky-400" /> Enrolled{" "}
            {enrolled}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-ink-300 dark:bg-ink-600" />{" "}
            Remaining{" "}
            {Math.max(0, totalModules - completed - failed - enrolled)}
          </span>
        </div>
      </div>

      {/* Active-filter banner */}
      {filter !== "all" && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-brand/5 border border-brand/20 text-[12.5px]">
          <span className="text-ink-700 dark:text-ink-200">
            Filtering by <b className="capitalize">{filter}</b> · {visibleCount}{" "}
            of {totalModules} modules
          </span>
          <button
            type="button"
            onClick={() => setFilter("all")}
            className="inline-flex items-center gap-1 text-brand font-semibold hover:underline"
          >
            <X className="w-3.5 h-3.5" /> Clear filter
          </button>
        </div>
      )}

      {/* Per-level tables */}
      {groups.length === 0 ? (
        <PlaceholderTab
          icon={BookOpen}
          title="Curriculum is empty"
          desc="No modules are mapped to this program yet. Once an admin imports them, they'll appear here."
        />
      ) : visibleGroups.length === 0 ? (
        <PlaceholderTab
          icon={BookOpen}
          title="No modules match this filter"
          desc={`No modules in this program are currently ${filter}. Pick another filter or clear the current one.`}
        />
      ) : (
        visibleGroups.map((g) => (
          <div
            key={`${g.level_id ?? "none"}-${g.level_name}`}
            className={`card overflow-hidden ${g.is_extra ? "ring-1 ring-violet-200 dark:ring-violet-500/20" : ""}`}
          >
            <div
              className={`px-4 py-2.5 border-b flex items-center gap-2 ${
                g.is_extra
                  ? "border-violet-200 dark:border-violet-500/20 bg-violet-50/60 dark:bg-violet-500/5"
                  : "border-ink-100 dark:border-ink-700 bg-ink-50 dark:bg-ink-800/40"
              }`}
            >
              {g.is_extra && (
                <Network className="w-3.5 h-3.5 text-violet-700 dark:text-violet-300 shrink-0" />
              )}
              <span
                className={`text-[12px] font-semibold ${
                  g.is_extra
                    ? "text-violet-800 dark:text-violet-200"
                    : "text-ink-700 dark:text-ink-200"
                }`}
              >
                {g.level_name}
              </span>
              <span
                className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
                  g.is_extra
                    ? "text-violet-700 bg-violet-100 dark:bg-violet-500/20 dark:text-violet-200"
                    : "text-ink-400 bg-ink-100 dark:bg-ink-800"
                }`}
              >
                {g.modules.length} module{g.modules.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-ink-50/60 dark:bg-ink-800/30 border-b border-ink-100 dark:border-ink-700">
                  <tr className="text-ink-400 text-[10px] uppercase">
                    <th className="px-3 py-2 font-bold w-[60px]">Order</th>
                    <th className="px-3 py-2 font-bold">Code</th>
                    <th className="px-3 py-2 font-bold">Module</th>
                    <th className="px-3 py-2 font-bold">Status</th>
                    <th className="px-3 py-2 font-bold text-center">Credits</th>
                    <th className="px-3 py-2 font-bold text-center">CAT</th>
                    <th className="px-3 py-2 font-bold text-center">Assg</th>
                    <th className="px-3 py-2 font-bold text-center">Exam</th>
                    <th className="px-3 py-2 font-bold text-center">
                      Marks/100
                    </th>
                    <th className="px-3 py-2 font-bold text-center">Grade</th>
                    <th className="px-3 py-2 font-bold">Term</th>
                    <th className="px-3 py-2 font-bold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                  {g.modules.map((m) => {
                    const isExempted = !!m.marks?.is_exempted;
                    const hasMarks = !!m.marks;
                    const isRegistered =
                      m.registration?.status === "registered";
                    const wasDropped = m.registration?.status === "dropped";
                    const passed =
                      hasMarks &&
                      m.marks?.percentage != null &&
                      Number(m.marks.percentage) >= 50;
                    const failedMark =
                      hasMarks &&
                      !isExempted &&
                      m.marks?.percentage != null &&
                      Number(m.marks.percentage) < 50;
                    /* Lifecycle pill — shown in its own column so the state is
                     * obvious instead of buried in a tiny badge next to the
                     * module name. Priority: marks > registered > dropped. */
                    let statusPill: { label: string; tone: string; icon: any };
                    if (isExempted)
                      statusPill = {
                        label: "Exempted",
                        tone: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
                        icon: Sparkles,
                      };
                    else if (passed)
                      statusPill = {
                        label: m.marks?.grade
                          ? `Completed · ${m.marks.grade}`
                          : "Completed",
                        tone: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
                        icon: CheckCircle,
                      };
                    else if (failedMark)
                      statusPill = {
                        label: m.marks?.grade
                          ? `Failed · ${m.marks.grade}`
                          : "Failed",
                        tone: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
                        icon: AlertTriangle,
                      };
                    else if (isRegistered)
                      statusPill = {
                        label: "Enrolled",
                        tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
                        icon: CheckCircle,
                      };
                    else if (wasDropped)
                      statusPill = {
                        label: "Dropped",
                        tone: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
                        icon: MinusCircle,
                      };
                    else
                      statusPill = {
                        label: "Not enrolled",
                        tone: "bg-ink-100 text-ink-500 dark:bg-ink-700/40 dark:text-ink-300",
                        icon: Clock,
                      };
                    const StatusIcon = statusPill.icon;
                    const rowAccent = isExempted
                      ? "bg-violet-50/40 dark:bg-violet-500/5"
                      : passed
                        ? "bg-sky-50/40 dark:bg-sky-500/5"
                        : failedMark
                          ? "bg-rose-50/40 dark:bg-rose-500/5"
                          : isRegistered
                            ? "bg-emerald-50/30 dark:bg-emerald-500/5"
                            : "";
                    return (
                      <tr
                        key={`${g.level_id ?? "na"}-${m.module_id}`}
                        className={`hover:bg-ink-50/50 dark:hover:bg-ink-700/20 ${rowAccent}`}
                      >
                        <td className="px-3 py-2 text-ink-500 tabular-nums">
                          {m.module_order ?? "—"}
                        </td>
                        <td className="px-3 py-2 font-mono">{m.module_code}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span>{m.module_name}</span>
                            {m.is_scheduled ? (
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
                                title={
                                  [
                                    m.schedule?.modes,
                                    m.schedule?.semesters,
                                    m.schedule?.years,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ") || "Scheduled"
                                }
                              >
                                <CalendarClock className="w-3 h-3" /> Scheduled
                              </span>
                            ) : (
                              <>
                                {m.marks?.term_label ?? (
                                  <span className="text-ink-400">—</span>
                                )}
                                {m.marks?.year_label && (
                                  <span className="text-ink-400 ml-1">
                                    · {m.marks.year_label}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                          {m.is_scheduled &&
                            (m.schedule?.modes ||
                              m.schedule?.semesters ||
                              m.schedule?.years) && (
                              <p className="text-[11px] text-ink-400 mt-0.5">
                                {[
                                  m.schedule?.modes,
                                  m.schedule?.semesters,
                                  m.schedule?.years,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                            )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold ${statusPill.tone}`}
                            title={
                              isRegistered && m.registration?.term_label
                                ? `Enrolled · ${m.registration.term_label}${m.registration.year_label ? ` · ${m.registration.year_label}` : ""}`
                                : isExempted
                                  ? (m.marks?.exemption_reason ?? "Exempted")
                                  : statusPill.label
                            }
                          >
                            <StatusIcon className="w-3 h-3" />{" "}
                            {statusPill.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          {m.module_credits ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {isExempted ? (
                            <span className="text-ink-400">—</span>
                          ) : (
                            <>
                              {tFmt(m.marks?.cat_marks)}
                              {m.marks?.cat_max != null && (
                                <span className="text-ink-400 text-[11px]">
                                  /{Number(m.marks.cat_max) || "—"}
                                </span>
                              )}
                            </>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {isExempted ? (
                            <span className="text-ink-400">—</span>
                          ) : (
                            <>
                              {tFmt(m.marks?.assignment_marks)}
                              {m.marks?.assignment_max != null && (
                                <span className="text-ink-400 text-[11px]">
                                  /{Number(m.marks.assignment_max) || "—"}
                                </span>
                              )}
                            </>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {isExempted ? (
                            <span className="text-ink-400">—</span>
                          ) : (
                            <>
                              {tFmt(m.marks?.exam_marks)}
                              {m.marks?.exam_max != null && (
                                <span className="text-ink-400 text-[11px]">
                                  /{Number(m.marks.exam_max) || "—"}
                                </span>
                              )}
                            </>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center font-semibold">
                          {m.marks?.percentage != null
                            ? Math.round(Number(m.marks.percentage))
                            : "—"}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {m.marks?.grade ? (
                            <TGradePill grade={m.marks.grade} />
                          ) : (
                            <span className="text-ink-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-ink-500 text-[12px]">
                          {isExempted ? (
                            <span className="italic text-violet-700 dark:text-violet-300">
                              {m.marks?.exemption_reason || "Exemption granted"}
                            </span>
                          ) : (
                            <>
                              {m.marks?.term_label ?? (
                                <span className="text-ink-400">—</span>
                              )}
                              {m.marks?.year_label && (
                                <span className="text-ink-400 ml-1">
                                  · {m.marks.year_label}
                                </span>
                              )}
                            </>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {selfMode ? (
                            <span className="text-ink-300">—</span>
                          ) : hasMarks ? (
                            isExempted && isAdmin ? (
                              <button
                                type="button"
                                className="btn-ghost btn-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                                disabled={
                                  dropPending === m.registration!.id ||
                                  drop.isPending
                                }
                                onClick={() => {
                                  if (
                                    !confirm(
                                      `Drop ${m.module_code} from this student's enrollments?`,
                                    )
                                  )
                                    return;
                                  drop.mutate(m.registration!.id);
                                }}
                                title={`Registered${m.registration?.term_label ? ` · ${m.registration.term_label}` : ""}`}
                              >
                                {dropPending === m.registration!.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <MinusCircle className="w-3.5 h-3.5" />
                                )}
                                Drop
                              </button>
                            ) : (
                              <button
                                type="button"
                                className={`btn-secondary btn-sm ${m.is_scheduled ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-300 dark:hover:bg-emerald-500/10" : ""}`}
                                disabled={
                                  !m.is_scheduled ||
                                  enrollPending === m.module_id ||
                                  enroll.isPending
                                }
                                onClick={() => enroll.mutate(m.module_id)}
                                title={
                                  m.is_scheduled
                                    ? `Enroll into ${m.module_code}`
                                    : "This module has no scheduled offering yet — schedule it before enrolling."
                                }
                              >
                                {enrollPending === m.module_id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <PlusCircle className="w-3.5 h-3.5" />
                                )}
                                Enroll
                              </button>
                            )
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      {exempting && (
        <ExemptionModal
          studentId={studentId}
          studentRegnumber={student?.regnumber ?? ""}
          moduleId={exempting.moduleId}
          moduleCode={exempting.moduleCode}
          moduleName={exempting.moduleName}
          onClose={() => setExempting(null)}
        />
      )}

      {pickerOpen && (
        <ExemptionPickerModal
          studentId={studentId}
          studentRegnumber={student?.regnumber ?? ""}
          modules={allModules}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

function ExemptionModal({
  studentId,
  studentRegnumber,
  moduleId,
  moduleCode,
  moduleName,
  onClose,
}: {
  studentId: number;
  studentRegnumber: string;
  moduleId: number;
  moduleCode: string;
  moduleName: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [percentage, setPercentage] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [termId, setTermId] = useState<number>(0);

  const termsQ = useQuery({
    queryKey: ["academic", "terms"],
    queryFn: () => academicService.listTerms(),
    staleTime: 60_000,
  });
  const terms = termsQ.data?.data ?? [];
  // Pre-select the current term once the list arrives.
  useEffect(() => {
    if (!termId && terms.length) {
      const current = terms.find((t: any) => t.is_current) ?? terms[0];
      if (current?.id) setTermId(current.id);
    }
  }, [terms, termId]);

  const create = useMutation({
    mutationFn: () =>
      studentService.createExemption(studentId, {
        module_id: moduleId,
        academic_term_id: termId,
        percentage: Number(percentage),
        reason: reason.trim() || null,
      }),
    onSuccess: () => {
      toast.success("Exemption recorded.");
      qc.invalidateQueries({
        queryKey: ["student-program-modules", studentId],
      });
      qc.invalidateQueries({ queryKey: ["student-marks", studentRegnumber] });
      onClose();
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? "Failed to record exemption"),
  });

  const pctNum = Number(percentage);
  const valid =
    termId > 0 && Number.isFinite(pctNum) && pctNum >= 0 && pctNum <= 100;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-start justify-center bg-black/60 backdrop-blur-sm p-4 pt-20">
      <div className="bg-white dark:bg-ink-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="p-5 border-b border-ink-100 dark:border-ink-800 flex justify-between items-center bg-violet-50 dark:bg-violet-500/10">
          <div>
            <h2 className="text-lg font-bold text-ink-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-600" /> Exempt module
            </h2>
            <p className="text-[12px] text-ink-500 mt-0.5">
              <span className="font-mono">{moduleCode}</span> · {moduleName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          className="p-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) create.mutate();
          }}
        >
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">
              Academic term <span className="text-red-500">*</span>
            </label>
            <select
              className="input w-full cursor-pointer bg-white dark:bg-ink-900"
              value={termId || ""}
              onChange={(e) => setTermId(Number(e.target.value))}
              required
            >
              <option value="" disabled>
                Select term…
              </option>
              {terms.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                  {t.is_current ? " (current)" : ""}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-ink-500 mt-1">
              The term the exemption is recorded against — usually the term the
              student would have sat the module.
            </p>
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">
              Equivalence mark / 100 <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={percentage}
              onChange={(e) => setPercentage(e.target.value)}
              className="input w-full"
              placeholder="e.g. 75"
              required
            />
            <p className="text-[11px] text-ink-500 mt-1">
              Counts as the student's mark for this module on the transcript.
            </p>
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">
              Reason
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="input w-full"
              placeholder="e.g. Equivalence from prior institution; transferred credit."
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-ink-100 dark:border-ink-800">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary px-4"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!valid || create.isPending}
              className="btn-primary px-4"
            >
              {create.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              Record exemption
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Toolbar-driven exemption picker. Lists every unmarked module in the
 * student's curriculum so the admin can pick one, enter an equivalence mark,
 * a reason, and confirm — all in one dialog. Reuses the same backend
 * exemption endpoint as the per-row flow, just with the module chosen here
 * instead of pre-selected by the row.
 */
function ExemptionPickerModal({
  studentId,
  studentRegnumber,
  modules,
  onClose,
}: {
  studentId: number;
  studentRegnumber: string;
  modules: import("@/services/studentService").ProgramModuleRow[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [moduleId, setModuleId] = useState<number>(0);
  const [percentage, setPercentage] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [termId, setTermId] = useState<number>(0);

  const termsQ = useQuery({
    queryKey: ["academic", "terms"],
    queryFn: () => academicService.listTerms(),
    staleTime: 60_000,
  });
  const terms = termsQ.data?.data ?? [];
  useEffect(() => {
    if (!termId && terms.length) {
      const current = terms.find((t: any) => t.is_current) ?? terms[0];
      if (current?.id) setTermId(current.id);
    }
  }, [terms, termId]);

  // Only modules with no marks at all can be exempted — exempting one that
  // already has a real grade would clobber it.
  const unmarked = useMemo(() => modules.filter((m) => !m.marks), [modules]);
  const selected = unmarked.find((m) => m.module_id === moduleId) ?? null;

  const create = useMutation({
    mutationFn: () =>
      studentService.createExemption(studentId, {
        module_id: moduleId,
        academic_term_id: termId,
        percentage: Number(percentage),
        reason: reason.trim() || null,
      }),
    onSuccess: () => {
      toast.success("Exemption recorded.");
      qc.invalidateQueries({
        queryKey: ["student-program-modules", studentId],
      });
      qc.invalidateQueries({ queryKey: ["student-marks", studentRegnumber] });
      onClose();
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? "Failed to record exemption"),
  });

  const pctNum = Number(percentage);
  const valid =
    moduleId > 0 &&
    termId > 0 &&
    Number.isFinite(pctNum) &&
    pctNum >= 0 &&
    pctNum <= 100 &&
    reason.trim().length > 0;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-start justify-center bg-black/60 backdrop-blur-sm p-4 pt-20">
      <div className="bg-white dark:bg-ink-900 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="p-5 border-b border-ink-100 dark:border-ink-800 flex justify-between items-center bg-violet-50 dark:bg-violet-500/10">
          <div>
            <h2 className="text-lg font-bold text-ink-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-600" /> Exempt a module
            </h2>
            <p className="text-[12px] text-ink-500 mt-0.5">
              Pick an unmarked module and record an equivalence mark. The
              student's transcript will reflect it as if they sat the module.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          className="p-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) create.mutate();
          }}
        >
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">
              Module <span className="text-red-500">*</span>
            </label>
            {unmarked.length === 0 ? (
              <div className="text-[12px] text-ink-500 p-3 rounded-md border border-dashed border-ink-200 dark:border-ink-700">
                Every module in the curriculum already has a mark — there's
                nothing left to exempt.
              </div>
            ) : (
              <select
                className="input w-full cursor-pointer bg-white dark:bg-ink-900"
                value={moduleId || ""}
                onChange={(e) => setModuleId(Number(e.target.value))}
                required
              >
                <option value="" disabled>
                  Select an unmarked module…
                </option>
                {unmarked.map((m) => (
                  <option key={m.module_id} value={m.module_id}>
                    {m.module_code} — {m.module_name}
                  </option>
                ))}
              </select>
            )}
            {selected && (
              <p className="text-[11px] text-ink-500 mt-1">
                {selected.module_credits ?? "—"} credits
                {selected.is_scheduled
                  ? " · currently scheduled"
                  : " · not currently scheduled"}
              </p>
            )}
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">
              Academic term <span className="text-red-500">*</span>
            </label>
            <select
              className="input w-full cursor-pointer bg-white dark:bg-ink-900"
              value={termId || ""}
              onChange={(e) => setTermId(Number(e.target.value))}
              required
            >
              <option value="" disabled>
                Select term…
              </option>
              {terms.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                  {t.is_current ? " (current)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">
              Equivalence mark / 100 <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={percentage}
              onChange={(e) => setPercentage(e.target.value)}
              className="input w-full"
              placeholder="e.g. 75"
              required
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">
              Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="input w-full"
              placeholder="e.g. Equivalence from prior institution; transferred credit."
              required
            />
            <p className="text-[11px] text-ink-500 mt-1">
              A reason is required so the audit log explains why this module was
              exempted.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-ink-100 dark:border-ink-800">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary px-4"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!valid || create.isPending}
              className="btn-primary px-4"
            >
              {create.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              Confirm exemption
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

function SummaryCard({
  tone,
  icon: Icon,
  label,
  value,
  onClick,
  active,
}: {
  tone: "brand" | "emerald" | "amber" | "ink" | "indigo" | "sky";
  icon: any;
  label: string;
  value: number;
  onClick?: () => void;
  active?: boolean;
}) {
  const iconCls = {
    brand: "bg-brand/10 text-brand",
    emerald: "bg-mint-100 text-mint-700",
    amber: "bg-amber-100 text-amber-700",
    ink: "bg-ink-100 text-ink-600",
    indigo:
      "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
    sky: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  }[tone];
  // Active rings echo the icon tone so the selected card reads as "lit up".
  const activeRing = {
    brand: "ring-2 ring-brand/40",
    emerald: "ring-2 ring-mint-400",
    amber: "ring-2 ring-amber-400",
    ink: "ring-2 ring-ink-300 dark:ring-ink-500",
    indigo: "ring-2 ring-indigo-400",
    sky: "ring-2 ring-sky-400",
  }[tone];
  const interactive = !!onClick;
  const baseCls = `card p-4 flex items-center gap-3 transition-all ${
    interactive
      ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-md select-none"
      : ""
  } ${active ? `${activeRing} shadow-md` : ""}`;
  const inner = (
    <>
      <div
        className={`w-10 h-10 rounded-lg flex items-center justify-center ${iconCls}`}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wider text-ink-500 font-semibold">
          {label}
        </p>
        <p className="text-xl font-bold text-ink-900 dark:text-white">
          {value}
        </p>
      </div>
    </>
  );
  return interactive ? (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!active}
      className={`${baseCls} text-left`}
    >
      {inner}
    </button>
  ) : (
    <div className={baseCls}>{inner}</div>
  );
}

function AttendanceTab({ student, selfMode = false }: { student: any; selfMode?: boolean }) {
  // Use the numeric student id — regnumbers like "STD/2026/22699" contain
  // slashes that would break the regnumber-segmented route. The backend
  // resolves the id back to a regnumber server-side.
  const studentId = student?.id as number | string | undefined;

  const summaryQ = useQuery({
    // selfMode hits /api/attendance/me/summary (no permission required); the
    // by-id variant requires VIEW_ATTENDANCE and is used by staff.
    queryKey: selfMode
      ? ["student-attendance", "me"]
      : ["student-attendance", studentId],
    queryFn: () =>
      selfMode
        ? attendanceService.meSummary()
        : attendanceService.studentSummaryById(studentId as number),
    enabled: selfMode || !!studentId,
  });

  if (!selfMode && !studentId) {
    return (
      <PlaceholderTab
        icon={Clock}
        title="No student id"
        desc="This student record is missing an internal id, so attendance can't be loaded."
      />
    );
  }

  if (summaryQ.isLoading) {
    return (
      <div className="card p-12 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-brand animate-spin" />
      </div>
    );
  }

  if (summaryQ.isError) {
    return (
      <PlaceholderTab
        icon={Clock}
        title="Failed to load attendance"
        desc={
          (summaryQ.error as any)?.response?.data?.message ??
          "An error occurred while loading attendance records."
        }
      />
    );
  }

  const data = summaryQ.data?.data;
  const totals = data?.totals;
  const byModule = data?.by_module ?? [];
  const records = data?.recent ?? [];

  const statusBadge = (s: StudentAttendanceStatus) => {
    const map: Record<StudentAttendanceStatus, string> = {
      present: "bg-mint-100 text-mint-700",
      late: "bg-amber-100 text-amber-700",
      absent: "bg-red-100 text-red-700",
      excused: "bg-ink-100 text-ink-700",
      not_recorded: "bg-ink-100 text-ink-500",
    };
    const label = s === "not_recorded" ? "Not recorded" : s;
    return (
      <span
        className={`px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase ${map[s] || "bg-ink-100 text-ink-700"}`}
      >
        {label}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <KpiCard label="Sessions" value={totals?.sessions ?? 0} />
        <KpiCard
          label="Present"
          value={totals?.present ?? 0}
          accent="text-mint-700"
        />
        <KpiCard
          label="Late"
          value={totals?.late ?? 0}
          accent="text-amber-700"
        />
        <KpiCard
          label="Absent"
          value={totals?.absent ?? 0}
          accent="text-red-700"
        />
        <KpiCard
          label="Not Recorded"
          value={totals?.not_recorded ?? 0}
          accent="text-ink-500"
        />
        <KpiCard
          label="Attendance %"
          value={`${totals?.attendance_pct ?? 0}%`}
          accent="text-brand"
        />
      </div>

      {/* Per-module breakdown — driven by module_registrations so every
          module the student is registered to is listed, even with no
          sessions or records yet. */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-ink-100 dark:border-ink-800 flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-brand" />
          <h3 className="text-sm font-semibold text-ink-900 dark:text-white">
            By Registered Module ({byModule.length})
          </h3>
        </div>
        {byModule.length === 0 ? (
          <div className="p-12 text-center text-ink-500 text-[13px]">
            This student has no module registrations yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-ink-50 dark:bg-ink-900/40">
                <tr className="text-ink-500">
                  <th className="px-4 py-2 font-semibold">Code</th>
                  <th className="px-4 py-2 font-semibold">Module</th>
                  <th className="px-4 py-2 font-semibold text-right">
                    Sessions
                  </th>
                  <th className="px-4 py-2 font-semibold text-right">
                    Present
                  </th>
                  <th className="px-4 py-2 font-semibold text-right">Late</th>
                  <th className="px-4 py-2 font-semibold text-right">Absent</th>
                  <th className="px-4 py-2 font-semibold text-right">
                    Excused
                  </th>
                  <th className="px-4 py-2 font-semibold text-right">
                    Not&nbsp;Rec.
                  </th>
                  <th className="px-4 py-2 font-semibold text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {byModule.map((m) => (
                  <tr
                    key={`${m.module_id}-${m.academic_term_id}`}
                    className="border-t border-ink-100 dark:border-ink-800"
                  >
                    <td className="px-4 py-2 font-mono text-ink-700 dark:text-ink-200">
                      {m.module_code}
                    </td>
                    <td className="px-4 py-2 text-ink-900 dark:text-white">
                      {m.module_name}
                    </td>
                    <td className="px-4 py-2 text-right">{m.sessions}</td>
                    <td className="px-4 py-2 text-right text-mint-700">
                      {m.present}
                    </td>
                    <td className="px-4 py-2 text-right text-amber-700">
                      {m.late}
                    </td>
                    <td className="px-4 py-2 text-right text-red-700">
                      {m.absent}
                    </td>
                    <td className="px-4 py-2 text-right text-ink-700">
                      {m.excused}
                    </td>
                    <td className="px-4 py-2 text-right text-ink-500">
                      {m.not_recorded}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold">
                      {m.attendance_pct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* All sessions for registered modules — sessions without a record
          for this student appear as "Not recorded" so the full class
          timeline is visible. */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-ink-100 dark:border-ink-800 flex items-center gap-2">
          <Clock className="w-4 h-4 text-brand" />
          <h3 className="text-sm font-semibold text-ink-900 dark:text-white">
            All Sessions on Registered Modules ({records.length})
          </h3>
        </div>
        {records.length === 0 ? (
          <div className="p-12 text-center text-ink-500 text-[13px]">
            No attendance sessions have been held for this student's registered
            modules yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-ink-50 dark:bg-ink-900/40">
                <tr className="text-ink-500">
                  <th className="px-4 py-2 font-semibold">Date</th>
                  <th className="px-4 py-2 font-semibold">Module</th>
                  <th className="px-4 py-2 font-semibold">Type</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2 font-semibold">Recorded At</th>
                  <th className="px-4 py-2 font-semibold">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr
                    key={r.session_id}
                    className="border-t border-ink-100 dark:border-ink-800"
                  >
                    <td className="px-4 py-2 text-ink-900 dark:text-white">
                      {r.session_date}
                    </td>
                    <td className="px-4 py-2">
                      <div className="font-mono text-ink-700 dark:text-ink-200">
                        {r.module_code}
                      </div>
                      <div className="text-[11px] text-ink-500">
                        {r.module_name}
                      </div>
                    </td>
                    <td className="px-4 py-2">{statusBadge(r.status)}</td>
                    <td className="px-4 py-2 text-ink-500">
                      {r.recorded_at
                        ? new Date(r.recorded_at).toLocaleString()
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-ink-500">
                      {r.remarks || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <div className="card p-4">
      <div className="text-[11px] uppercase tracking-wide text-ink-500 font-semibold">
        {label}
      </div>
      <div
        className={`text-2xl font-bold mt-1 ${accent ?? "text-ink-900 dark:text-white"}`}
      >
        {value}
      </div>
    </div>
  );
}

function DocumentUploadSection() {
  const qc = useQueryClient();
  const [selectedDocType, setSelectedDocType] = useState("");
  const [showUploadForm, setShowUploadForm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("document", file);
      formData.append("document_type_id", selectedDocType);
      return studentService.meUploadDocument(formData as any);
    },
    onSuccess: () => {
      toast.success("Document uploaded successfully.");
      setShowUploadForm(false);
      setSelectedDocType("");
      if (fileRef.current) fileRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["student-documents", "me"] });
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.message ?? "Failed to upload document."),
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && selectedDocType) {
      uploadMutation.mutate(file);
    }
  };

  return (
    <div className="card p-6">
      {!showUploadForm ? (
        <button
          type="button"
          onClick={() => setShowUploadForm(true)}
          className="w-full btn btn-primary flex items-center justify-center gap-2 py-3"
        >
          <UploadCloud className="w-4 h-4" />
          Upload Document
        </button>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-ink-900 dark:text-white mb-2">
              Document Type
            </label>
            <select
              value={selectedDocType}
              onChange={(e) => setSelectedDocType(e.target.value)}
              className="input w-full"
            >
              <option value="">Select a document type...</option>
              <option value="1">National ID</option>
              <option value="2">Passport</option>
              <option value="3">Birth Certificate</option>
              <option value="4">High School Diploma</option>
              <option value="5">Academic Transcript</option>
              <option value="6">Medical Certificate</option>
              <option value="7">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-ink-900 dark:text-white mb-2">
              Select File
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              onChange={handleFileSelect}
              disabled={!selectedDocType || uploadMutation.isPending}
              className="input w-full"
            />
            <p className="text-xs text-ink-500 mt-1">
              Accepted formats: PDF, JPG, PNG, DOC, DOCX
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setShowUploadForm(false);
                setSelectedDocType("");
              }}
              disabled={uploadMutation.isPending}
              className="flex-1 btn btn-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={!selectedDocType || uploadMutation.isPending}
              className="flex-1 btn btn-primary flex items-center justify-center gap-2"
            >
              {uploadMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <UploadCloud className="w-4 h-4" />
              )}
              {uploadMutation.isPending ? "Uploading..." : "Select & Upload"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DocumentsTab({
  student,
  selfMode = false,
  onOpenChecklist,
}: {
  student: any;
  selfMode?: boolean;
  onOpenChecklist?: () => void;
}) {
  const studentId = student.id;
  // "Notify student" in the summary banner scrolls to and opens the compose
  // panel further down instead of duplicating the form.
  const [composeOpen, setComposeOpen] = useState(false);
  const notifyRef = useRef<HTMLDivElement | null>(null);
  const openCompose = () => {
    setComposeOpen(true);
    notifyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const docsQ = useQuery({
    queryKey: selfMode
      ? ["student-documents", "me"]
      : ["student-documents", studentId],
    // Self mode hits /api/students/me/documents — auth-only, no VIEW_STUDENTS required.
    queryFn: () =>
      selfMode
        ? studentService.meDocuments()
        : studentService.listDocuments(studentId),
    enabled: selfMode || !!studentId,
  });

  if (docsQ.isLoading) {
    return (
      <div className="flex items-center justify-center p-20">
        <Loader2 className="w-6 h-6 text-brand animate-spin" />
      </div>
    );
  }

  if (docsQ.isError) {
    return (
      <div className="card p-8 text-center text-rose-600">
        Could not load documents.
      </div>
    );
  }

  const applicationId = docsQ.data?.data?.application_id ?? null;
  const documents = docsQ.data?.data?.documents ?? [];
  const offer = docsQ.data?.data?.admission_offer ?? null;
  const canUpload = docsQ.data?.data?.can_upload ?? false;
  // Required-documents checklist for the student's programme category,
  // computed server-side from the admin-configured requirements.
  const checklist = docsQ.data?.data?.checklist ?? null;
  const contact = docsQ.data?.data?.student_contact;

  if (!applicationId && !offer && !canUpload) {
    return (
      <div className="card p-12 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-full bg-ink-100 dark:bg-ink-800 flex items-center justify-center text-ink-400 mb-4">
          <FileText className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-semibold text-ink-900 dark:text-white">
          No application on file
        </h3>
        <p className="text-ink-500 max-w-md mt-2">
          {selfMode
            ? "You were not enrolled through the admissions portal, so there are no uploaded documents to display."
            : "This student was not enrolled through the admissions portal, so there are no uploaded documents to display."}
        </p>
      </div>
    );
  }

  const counts = documents.reduce(
    (acc: any, d: any) => {
      const s = String(d.verification_status || "pending").toLowerCase();
      acc[s] = (acc[s] ?? 0) + 1;
      return acc;
    },
    { verified: 0, pending: 0, rejected: 0 } as Record<string, number>,
  );

  const outstanding = checklist?.outstanding.length ?? 0;
  const orderRank: Record<string, number> = { rejected: 0, pending: 1, required: 1, verified: 2 };
  // Rejected and pending first — those are the rows that need someone's
  // attention; verified ones are the settled majority.
  const sortedDocs = [...documents].sort(
    (a: any, b: any) =>
      (orderRank[String(a.verification_status || "pending").toLowerCase()] ?? 1) -
      (orderRank[String(b.verification_status || "pending").toLowerCase()] ?? 1),
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <SummaryCard
          tone="ink"
          icon={FileText}
          label="Uploaded"
          value={documents.length + (offer ? 1 : 0)}
        />
        <SummaryCard
          tone="emerald"
          icon={ShieldCheck}
          label="Verified"
          value={(counts.verified ?? 0) + (offer ? 1 : 0)}
        />
        <SummaryCard
          tone="amber"
          icon={ShieldAlert}
          label="Pending"
          value={counts.pending ?? 0}
        />
        <SummaryCard
          tone="brand"
          icon={ShieldX}
          label="Rejected"
          value={counts.rejected ?? 0}
        />
        <SummaryCard
          tone={outstanding > 0 ? "brand" : "emerald"}
          icon={outstanding > 0 ? AlertCircle : CheckCircle}
          label="Missing"
          value={checklist?.configured ? outstanding : 0}
        />
      </div>

      {checklist && (
        <ComplianceSummary
          checklist={checklist}
          selfMode={selfMode}
          onOpenChecklist={!selfMode ? onOpenChecklist : undefined}
          onNotify={!selfMode ? openCompose : undefined}
        />
      )}

      {offer && <AdmissionLetterRow offer={offer} studentId={studentId} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* Uploaded documents — every file on record, whatever its status */}
        <div>
          <h3 className="text-sm font-semibold text-ink-800 dark:text-ink-100 mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Uploaded documents ({documents.length})
          </h3>
          {documents.length === 0 ? (
            <div className="card p-8 text-center text-ink-500 text-sm">
              {selfMode
                ? "No documents have been attached to your admission application yet."
                : "No documents have been attached to this student's admission application yet."}
            </div>
          ) : (
            <div className="card p-0 divide-y divide-ink-100 dark:divide-ink-800 overflow-hidden">
              {sortedDocs.map((d: any) => (
                <DocumentRow
                  key={d.id}
                  doc={d}
                  studentId={studentId}
                  selfMode={selfMode}
                />
              ))}
            </div>
          )}
        </div>

        {/* Required-documents checklist + notify */}
        <div className="space-y-3" ref={notifyRef}>
          <h3 className="text-sm font-semibold text-ink-800 dark:text-ink-100 mb-3 flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            Required documents
            {checklist?.configured && (
              <span className="text-[11px] font-medium text-ink-400">
                · {checklist.programme_category_label}
              </span>
            )}
          </h3>
          {checklist && !selfMode && checklist.configured && outstanding > 0 && (
            <NotifyStudentPanel
              studentId={studentId}
              checklist={checklist}
              contact={contact}
              defaultOpen={composeOpen}
            />
          )}
          {checklist ? (
            <RequirementList
              checklist={checklist}
              studentId={studentId}
              selfMode={selfMode}
            />
          ) : (
            <div className="card p-6 text-center text-ink-500 text-sm">
              Checklist unavailable.
            </div>
          )}
          {!selfMode && checklist?.configured && <NoticeHistory studentId={studentId} />}
        </div>
      </div>

      {selfMode && canUpload && (
        <DocumentUploadSection />
      )}
    </div>
  );
}

/**
 * Standalone row for the admission letter PDF. The letter isn't a stored
 * document — it's regenerated on demand from the admission_offer record —
 * so it gets its own card instead of being shoehorned into DocumentRow.
 * Token-gated download URL works for both admins and the student.
 */
function AdmissionLetterRow({
  offer,
  studentId,
}: {
  offer: {
    letter_token: string;
    status?: string | null;
    letter_sent_at?: string | null;
    application_number?: string | null;
  };
  studentId?: number;
}) {
  const url = studentId
    ? `https://cur.ac.rw/umis/documents/all_certificate/generate_document.php?type=admission_letter&student_id=${studentId}&file_name=Admission_Letter_FORMAT.pdf`
    : studentService.admissionLetterUrl(offer.letter_token);
  const fileName = `admission-letter-${offer.application_number ?? "student"}.pdf`;
  const sent = offer.letter_sent_at
    ? new Date(offer.letter_sent_at).toLocaleDateString()
    : null;

  return (
    <div className="card p-4 flex items-center gap-4">
      <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 flex items-center justify-center shrink-0">
        <Award className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="text-[13.5px] font-semibold text-ink-900 dark:text-white truncate">
            Admission Letter
          </h4>
          <span className="inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
            <ShieldCheck className="w-3 h-3" />
            Official
          </span>
        </div>
        <p className="text-[12px] text-ink-500 truncate mt-0.5">
          {fileName}
          {offer.application_number && (
            <span className="text-ink-400">
              {" "}
              · App #{offer.application_number}
            </span>
          )}
          {sent && <span className="text-ink-400"> · Issued {sent}</span>}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="btn-primary btn-sm flex items-center gap-1.5"
        >
          <Eye className="w-3.5 h-3.5" /> View
        </a>
      </div>
    </div>
  );
}

function DocumentRow({
  doc,
  studentId,
  selfMode = false,
}: {
  doc: any;
  studentId: number;
  selfMode?: boolean;
}) {
  const qc = useQueryClient();
  const status = String(doc.verification_status || "pending").toLowerCase();
  const typeName = doc.type_name || doc.document_type_name || "Document";
  const fileName = doc.file_original_name || "—";
  // Synthetic Visa row — backend mints id = "visa". The visa file lives
  // outside application_documents so it has its own dedicated endpoint.
  const isVisaRow = !!doc.is_visa;
  const hasFile = !!doc.file_server_id;
  // Visa rows show an inline preview by default once a file is on record so
  // the student can confirm the right document was uploaded without leaving
  // the page. Toggle lets them collapse it if it gets in the way.
  const [showPreview, setShowPreview] = useState(isVisaRow && hasFile);
  useEffect(() => {
    if (isVisaRow && hasFile) setShowPreview(true);
  }, [isVisaRow, hasFile, doc.file_server_id]);
  // Self-service download bypasses the VIEW_STUDENTS-gated /:id endpoint
  // and resolves the application from the auth user instead. Visa rows
  // use their own /me/visa/document endpoint (clean URL, no synthetic id
  // in the path).
  const url = !hasFile
    ? null
    : isVisaRow
      ? selfMode
        ? studentService.meVisaDocumentUrl()
        : studentService.visaDocumentUrl(studentId)
      : selfMode
        ? studentService.meDocumentDownloadUrl(doc.id)
        : studentService.documentDownloadUrl(studentId, doc.id);

  // Upload control for the visa row — only the student themselves can
  // upload (selfMode); admins viewing the page see no upload button.
  const visaFileRef = useRef<HTMLInputElement | null>(null);
  const visaUpload = useMutation({
    mutationFn: (file: File) => studentService.meUploadVisaDocument(file),
    onSuccess: () => {
      toast.success("Visa document uploaded.");
      qc.invalidateQueries({ queryKey: ["student-documents", "me"] });
      qc.invalidateQueries({ queryKey: ["student-visa", "me"] });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? "Upload failed."),
  });
  const canUploadVisa = isVisaRow && selfMode;

  const sizeKb = doc.file_size
    ? Math.max(1, Math.round(Number(doc.file_size) / 1024))
    : null;
  const sizeLabel = sizeKb
    ? sizeKb >= 1024
      ? `${(sizeKb / 1024).toFixed(1)} MB`
      : `${sizeKb} KB`
    : null;

  // For the visa row, the "required" state should read as a friendly
  // call-to-action rather than a hard error tone, so swap the palette.
  const statusTone =
    status === "verified"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
      : status === "rejected"
        ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
        : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300";

  const StatusIcon =
    status === "verified"
      ? ShieldCheck
      : status === "rejected"
        ? ShieldX
        : ShieldAlert;

  // Visa rows get a distinct globe icon + tint so they're easy to spot
  // in the document list, and a softly tinted row background when the
  // student still needs to upload the file.
  const iconBubbleClass = isVisaRow
    ? hasFile
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
      : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
    : "bg-brand/10 text-brand";
  const RowIcon = isVisaRow ? Globe2 : FileText;
  const rowToneClass =
    isVisaRow && !hasFile
      ? "bg-amber-50/40 dark:bg-amber-900/5"
      : "hover:bg-ink-50/60 dark:hover:bg-ink-800/40";

  const mime = String(doc.file_mime || "").toLowerCase();
  const isImage = mime.startsWith("image/");
  const isPdf = mime === "application/pdf";

  return (
    <div className={`flex flex-col transition-colors ${rowToneClass}`}>
      <div className="flex items-center gap-4 p-4">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${iconBubbleClass}`}>
          <RowIcon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-[13.5px] font-semibold text-ink-900 dark:text-white truncate">
              {typeName}
            </h4>
            <span
              className={`inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${statusTone}`}
            >
              <StatusIcon className="w-3 h-3" />
              {status === "required" ? "Awaiting upload" : status}
            </span>
            {isVisaRow && hasFile && (
              <span className="inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-600 text-white">
                <CheckCircle className="w-3 h-3" />
                Uploaded
              </span>
            )}
          </div>
          <p className="text-[12px] text-ink-500 truncate mt-0.5">
            {hasFile ? fileName : "No file uploaded yet"}
            {sizeLabel && <span className="text-ink-400"> · {sizeLabel}</span>}
            {doc.uploaded_at && (
              <span className="text-ink-400">
                {" "}
                · Uploaded {new Date(doc.uploaded_at).toLocaleDateString()}
              </span>
            )}
          </p>
          {doc.verification_comment && (
            <p className={`text-[11.5px] mt-1 italic ${isVisaRow && status === "required" ? "text-amber-700 dark:text-amber-300" : "text-rose-600"}`}>
              {doc.verification_comment}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isVisaRow && hasFile && url && (
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className="btn-secondary btn-sm flex items-center gap-1.5"
            >
              <Eye className="w-3.5 h-3.5" />
              {showPreview ? "Hide" : "Preview"}
            </button>
          )}
          {url && (
            <>
              {!isVisaRow && (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary btn-sm flex items-center gap-1.5"
                >
                  <Eye className="w-3.5 h-3.5" /> View
                </a>
              )}
              <a
                href={url}
                download={fileName}
                className="btn-primary btn-sm flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" /> Download
              </a>
            </>
          )}

          {canUploadVisa && (
            <>
              <input
                ref={visaFileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) visaUpload.mutate(file);
                  if (visaFileRef.current) visaFileRef.current.value = "";
                }}
              />
              <button
                type="button"
                className="btn-primary btn-sm flex items-center gap-1.5"
                onClick={() => visaFileRef.current?.click()}
                disabled={visaUpload.isPending}
              >
                {visaUpload.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <UploadCloud className="w-3.5 h-3.5" />
                )}
                {hasFile ? "Replace" : "Upload Visa"}
              </button>
            </>
          )}
        </div>
      </div>

      {isVisaRow && hasFile && url && showPreview && (
        <div className="px-4 pb-4">
          <div className="rounded-lg overflow-hidden border border-ink-200 dark:border-ink-700 bg-ink-50 dark:bg-ink-900/40">
            {isImage ? (
              <a href={url} target="_blank" rel="noreferrer" className="block">
                <img
                  src={url}
                  alt={fileName}
                  className="w-full max-h-[480px] object-contain bg-white dark:bg-ink-900"
                />
              </a>
            ) : isPdf ? (
              <iframe
                src={url}
                title={fileName}
                className="w-full h-[520px] bg-white"
              />
            ) : (
              <div className="p-6 text-center text-[13px] text-ink-500">
                Inline preview not available for this file type.
                <div className="mt-2">
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand font-semibold underline"
                  >
                    Open in a new tab
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Student Finance Tab ──────────────────────────────────────────────────────

function StudentFinanceTab({
  student,
  selfMode = false,
}: {
  student: any;
  selfMode?: boolean;
}) {
  const studentId = student?.regnumber ?? "";

  const ledgerQ = useQuery({
    queryKey: ["finance", "ledger", studentId],
    queryFn: () => ledgerService.getStudentLedger(studentId),
    enabled: !!studentId,
  });

  const ledger = ledgerQ.data?.data;
  const invoices: any[] = ledger?.invoices ?? [];
  const allPayments: any[] = ledger?.payments ?? [];

  // Separate MIS payments vs UrubutoPay legacy transactions
  const misPayments = allPayments.filter((p) => p._source !== "urubutopay");
  const bankTxns    = allPayments.filter((p) => p._source === "urubutopay");

  const totalInvoiced = invoices.reduce((s: number, i: any) => s + Number(i.amount_due ?? 0), 0);
  const totalMisPaid  = misPayments
    .filter((p) => p.status === "confirmed")
    .reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);
  const totalBankPaid = bankTxns
    .filter((p) => !p._is_reversal)
    .reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);
  const totalBankReversed = bankTxns
    .filter((p) => p._is_reversal)
    .reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);
  const totalPaid = totalMisPaid + totalBankPaid - totalBankReversed;

  if (ledgerQ.isLoading) {
    return (
      <div className="card p-12 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-brand" />
      </div>
    );
  }

  if (ledgerQ.isError) {
    return (
      <div className="card p-8 text-center">
        <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-red-400" />
        <p className="text-sm text-red-500">Failed to load finance data.</p>
        <button
          className="btn-secondary btn-sm mt-3"
          onClick={() => ledgerQ.refetch()}
        >
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-4">
          <p className="text-xs text-ink-500 mb-1">Total Invoiced</p>
          <p className="text-xl font-bold text-ink-700 dark:text-ink-200">{formatRWF(totalInvoiced)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-ink-500 mb-1">Total Paid</p>
          <p className="text-xl font-bold text-green-600">{formatRWF(totalPaid)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-ink-500 mb-1">Via UrubutoPay</p>
          <p className="text-xl font-bold text-blue-600">{formatRWF(totalBankPaid)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-ink-500 mb-1">Balance</p>
          <p className={`text-xl font-bold ${(totalInvoiced - totalPaid) > 0 ? "text-red-600" : "text-green-600"}`}>
            {formatRWF(Math.max(0, totalInvoiced - totalPaid))}
          </p>
        </div>
      </div>

      {/* Invoices */}
      <div className="card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-ink-100 dark:border-ink-700 font-medium text-sm flex items-center gap-2 bg-ink-50/50 dark:bg-ink-700/20">
          <FileText className="w-4 h-4 text-ink-400" />
          <span>Invoices</span>
          <span className="text-[10px] bg-ink-100 dark:bg-ink-700 px-1.5 py-0.5 rounded text-ink-500 font-mono">
            {invoices.length}
          </span>
        </div>
        {invoices.length === 0 ? (
          <div className="text-center py-10 text-ink-400 text-sm">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>No invoices found for this student.</p>
            {!selfMode && (
              <Link
                to={`/finance/billing/${studentId}`}
                className="btn-secondary btn-sm mt-3 inline-flex items-center gap-1.5"
              >
                <Banknote className="w-3.5 h-3.5" /> Manage in Ledger
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ink-50 dark:bg-ink-700/50 text-ink-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-2.5 text-left">Invoice #</th>
                  <th className="px-4 py-2.5 text-left">Type</th>
                  <th className="px-4 py-2.5 text-left">Description</th>
                  <th className="px-4 py-2.5 text-right">Due</th>
                  <th className="px-4 py-2.5 text-right">Paid</th>
                  <th className="px-4 py-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                {invoices.map((inv: any) => (
                  <tr key={inv.id} className="hover:bg-ink-50/50 dark:hover:bg-ink-700/30">
                    <td className="px-4 py-2.5 font-mono text-xs">{inv.invoice_number}</td>
                    <td className="px-4 py-2.5 text-xs text-ink-500">
                      {(FEE_TYPE_LABELS as any)[inv.fee_type] ?? inv.fee_type}
                    </td>
                    <td className="px-4 py-2.5 text-xs">{inv.description}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">{formatRWF(inv.amount_due)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-green-600">{formatRWF(inv.amount_paid)}</td>
                    <td className="px-4 py-2.5 text-center">
                      <InvoiceStatusBadge status={inv.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* UrubutoPay / Bank Transactions */}
      <div className="card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-ink-100 dark:border-ink-700 font-medium text-sm flex items-center gap-2 bg-ink-50/50 dark:bg-ink-700/20">
          <TrendingUp className="w-4 h-4 text-blue-500" />
          <span>UrubutoPay / Bank Transactions</span>
          <span className="text-[10px] bg-ink-100 dark:bg-ink-700 px-1.5 py-0.5 rounded text-ink-500 font-mono">
            {bankTxns.length}
          </span>
        </div>
        {bankTxns.length === 0 ? (
          <div className="text-center py-8 text-ink-400 text-sm">
            <TrendingUp className="w-7 h-7 mx-auto mb-2 opacity-30" />
            <p>No UrubutoPay/bank transactions found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ink-50 dark:bg-ink-700/50 text-ink-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-2.5 text-left">Trans Code</th>
                  <th className="px-4 py-2.5 text-left">Payer</th>
                  <th className="px-4 py-2.5 text-left">Channel</th>
                  <th className="px-4 py-2.5 text-left">Reference / Ext. ID</th>
                  <th className="px-4 py-2.5 text-left">Description</th>
                  <th className="px-4 py-2.5 text-left">Date</th>
                  <th className="px-4 py-2.5 text-right">Amount</th>
                  <th className="px-4 py-2.5 text-center">Kind</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                {bankTxns.map((p: any, idx: number) => (
                  <tr
                    key={p.receipt_number || idx}
                    className={`hover:bg-ink-50/50 dark:hover:bg-ink-700/30 ${p._is_reversal ? "opacity-60" : ""}`}
                  >
                    <td className="px-4 py-2.5 font-mono text-xs">{p.receipt_number || "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-ink-600 dark:text-ink-300">
                      {p.student_id || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-ink-500">
                      {(PAYMENT_METHOD_LABELS as any)[p.payment_method] ?? p.payment_method}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-ink-400 font-mono truncate max-w-[160px]">
                      {p.reference_number || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-ink-500 max-w-[200px] truncate">
                      {p.description || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-ink-400">
                      {p.paid_at ? new Date(p.paid_at).toLocaleString() : "—"}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-mono text-xs font-semibold ${p._is_reversal ? "text-red-500" : "text-green-600"}`}>
                      {p._is_reversal ? "−" : "+"}{formatRWF(p.amount)}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {p._is_reversal ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-1.5 py-0.5 rounded-full">
                          <ArrowDownLeft className="w-2.5 h-2.5" /> Reversal
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-1.5 py-0.5 rounded-full">
                          <Banknote className="w-2.5 h-2.5" /> Payment
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MIS recorded payments (fee_payments table) */}
      {misPayments.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-ink-100 dark:border-ink-700 font-medium text-sm flex items-center gap-2 bg-ink-50/50 dark:bg-ink-700/20">
            <Banknote className="w-4 h-4 text-ink-400" />
            <span>Manually Recorded Payments</span>
            <span className="text-[10px] bg-ink-100 dark:bg-ink-700 px-1.5 py-0.5 rounded text-ink-500 font-mono">
              {misPayments.length}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ink-50 dark:bg-ink-700/50 text-ink-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-2.5 text-left">Receipt #</th>
                  <th className="px-4 py-2.5 text-left">Method</th>
                  <th className="px-4 py-2.5 text-left">Reference</th>
                  <th className="px-4 py-2.5 text-left">Date</th>
                  <th className="px-4 py-2.5 text-right">Amount</th>
                  <th className="px-4 py-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                {misPayments.map((p: any) => (
                  <tr key={p.id} className="hover:bg-ink-50/50 dark:hover:bg-ink-700/30">
                    <td className="px-4 py-2.5 font-mono text-xs">{p.receipt_number}</td>
                    <td className="px-4 py-2.5 text-xs text-ink-500">
                      {(PAYMENT_METHOD_LABELS as any)[p.payment_method] ?? p.payment_method}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-ink-400">{p.reference_number ?? "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-ink-400">
                      {p.paid_at ? new Date(p.paid_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold text-green-600">
                      {formatRWF(p.amount)}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                        p.status === "confirmed"
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : p.status === "pending"
                          ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                          : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                      }`}>
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!selfMode && (
        <div className="flex justify-end">
          <Link
            to={`/finance/billing/${studentId}`}
            className="btn-secondary btn-sm inline-flex items-center gap-1.5"
          >
            <FileText className="w-3.5 h-3.5" /> Full Ledger & Record Payment
          </Link>
        </div>
      )}
    </div>
  );
}

function PlaceholderTab({
  icon: Icon,
  title,
  desc,
}: {
  icon: any;
  title: string;
  desc: string;
}) {
  return (
    <div className="card p-12 flex flex-col items-center justify-center text-center">
      <div className="w-16 h-16 rounded-full bg-brand/5 flex items-center justify-center text-brand mb-4">
        <Icon className="w-8 h-8" />
      </div>
      <h3 className="text-lg font-semibold text-ink-900 dark:text-white">
        {title}
      </h3>
      <p className="text-ink-500 max-w-md mt-2">{desc}</p>
    </div>
  );
}

function EditStudentModal({
  student,
  stats,
  onClose,
}: {
  student: any;
  stats: any;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { register, handleSubmit, watch, setValue } = useForm({
    defaultValues: {
      fname: student.fname,
      lname: student.lname,
      email: student.email || "",
      phone: student.phone || "",
      gender: student.gender || "",
      nationality: student.nationality || "",
      // Catalog program (options.id) — the new authoritative academic link.
      std_option: student.std_option ? String(student.std_option) : "",
      current_level: student.current_level || "",
      birthdate: student.birthdate || "",
      regnumber: student.regnumber || "",
      acc_year: student.acc_year || "",
    },
  });

  // Surface the auto-derived faculty/department so the user knows which
  // home faculty the program belongs to before they save.
  const optionFacets = (stats?.facets?.options ?? []) as Array<{
    value: string;
    label: string;
    department_id: number | null;
    faculty_id: number | null;
  }>;
  const watchedOption = watch("std_option");
  const selectedOption =
    optionFacets.find((o) => String(o.value) === String(watchedOption)) ?? null;
  const facultyName =
    stats?.facets?.faculty?.find(
      (f: any) => String(f.value) === String(selectedOption?.faculty_id),
    )?.label ??
    (selectedOption?.faculty_id ? `Faculty #${selectedOption.faculty_id}` : "");
  const departmentName =
    stats?.facets?.department?.find(
      (f: any) => String(f.value) === String(selectedOption?.department_id),
    )?.label ??
    (selectedOption?.department_id
      ? `Department #${selectedOption.department_id}`
      : "");

  const mut = useMutation({
    mutationFn: (data: any) => studentService.update(student.id, data),
    onSuccess: () => {
      toast.success("Student updated successfully!");
      qc.invalidateQueries({ queryKey: ["student", String(student.id)] });
      qc.invalidateQueries({ queryKey: ["students"] });
      onClose();
    },
    onError: (err: any) => {
      const msg =
        err.response?.data?.message ||
        "Failed to update student. Please check all required fields.";
      toast.error(msg);
    },
  });

  const onSubmit = (data: any) => {
    // Clean up empty strings to null for the backend
    const payload = { ...data };
    Object.keys(payload).forEach((key) => {
      if (payload[key] === "") payload[key] = null;
    });
    mut.mutate(payload);
  };
  // Suppress "unused" warning for the helper React Hook Form gives us — we use it
  // implicitly via {...register(...)} on the std_option select.
  void setValue;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
        <div className="bg-white dark:bg-ink-900 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
          <div className="p-5 border-b border-ink-100 dark:border-ink-800 flex justify-between items-center bg-ink-50 dark:bg-ink-900/50">
            <h2 className="text-lg font-bold text-ink-900 dark:text-white flex items-center gap-2">
              <Edit className="w-4 h-4 text-brand" /> Edit Student Details
            </h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-ink-400 hover:bg-ink-200 dark:hover:bg-ink-800 hover:text-ink-900 dark:hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6 overflow-y-auto flex-1">
            <form
              id="edit-student"
              onSubmit={handleSubmit(onSubmit)}
              className="space-y-5"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    {...register("fname")}
                    className="input w-full"
                    required
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">
                    Last Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    {...register("lname")}
                    className="input w-full"
                    required
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">
                    Email
                  </label>
                  <input
                    {...register("email")}
                    type="email"
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">
                    Phone
                  </label>
                  <input {...register("phone")} className="input w-full" />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">
                    Gender
                  </label>
                  <select
                    {...register("gender")}
                    className="input w-full cursor-pointer bg-white dark:bg-ink-900"
                  >
                    <option value="">Select...</option>
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">
                    Nationality
                  </label>
                  <input
                    {...register("nationality")}
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">
                    Reg Number
                  </label>
                  <input {...register("regnumber")} className="input w-full" />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">
                    Birthdate
                  </label>
                  <input
                    {...register("birthdate")}
                    type="date"
                    className="input w-full"
                  />
                </div>

                <div className="sm:col-span-2 pt-2 pb-1">
                  <div className="border-b border-ink-100 dark:border-ink-800" />
                </div>

                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">
                    Status
                  </label>
                  {/* Read-only here on purpose. A status change needs a reason
                      and, for a death, a certificate — captured by the Status
                      action on the Programme card. The server refuses status
                      changes through this form's endpoint, so an editable box
                      here could only ever produce a 422. */}
                  <p className="input w-full bg-ink-50 dark:bg-ink-800/60 text-ink-600 dark:text-ink-300 cursor-not-allowed">
                    {STUDENT_STATES.find(
                      (o) => o.value === normaliseStudentState(student.student_state),
                    )?.label ?? student.student_state ?? "—"}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">
                    Program / Option <span className="text-red-500">*</span>
                  </label>
                  <select
                    {...register("std_option")}
                    className="input w-full cursor-pointer bg-white dark:bg-ink-900"
                    required
                  >
                    <option value="">Select Program...</option>
                    {optionFacets.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {selectedOption && (
                    <p className="text-[11px] text-ink-500 mt-1.5">
                      Faculty/department auto-derived:
                      {facultyName ? (
                        <>
                          {" "}
                          <span className="font-semibold">{facultyName}</span>
                        </>
                      ) : null}
                      {departmentName ? (
                        <>
                          {" "}
                          ·{" "}
                          <span className="font-semibold">
                            {departmentName}
                          </span>
                        </>
                      ) : null}
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">
                    Current Level
                  </label>
                  <select
                    {...register("current_level")}
                    className="input w-full cursor-pointer bg-white dark:bg-ink-900"
                  >
                    <option value="">Select Level...</option>
                    {stats?.facets?.current_level?.map((f: any) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">
                    Academic Year
                  </label>
                  <select
                    {...register("acc_year")}
                    className="input w-full cursor-pointer bg-white dark:bg-ink-900"
                  >
                    <option value="">Select Year...</option>
                    {stats?.facets?.acc_year?.map((f: any) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </form>
          </div>
          <div className="p-4 border-t border-ink-100 dark:border-ink-800 flex justify-end gap-3 bg-ink-50 dark:bg-ink-900/50">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary px-5"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="edit-student"
              disabled={mut.isPending}
              className="btn-primary px-5"
            >
              {mut.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

/* ─── Transcript tab ───────────────────────────────────────────────── */

const TR_STATUS_BADGE: Record<string, string> = {
  pending:    'bg-yellow-100 text-yellow-800',
  approved:   'bg-green-100 text-green-800',
  dispatched: 'bg-blue-100 text-blue-800',
  rejected:   'bg-red-100 text-red-800',
}

function TranscriptTab({ student }: { student: any }) {
  const { levelName } = useLevels();

  // Use the numeric student id — regnumbers may contain slashes that break
  // the regnumber-segmented route. The backend resolves id → regnumber.
  const studentId = student?.id as number | string | undefined;

  const marksQ = useQuery({
    queryKey: ["student-marks", studentId],
    queryFn: () => marksService.studentMarksById(studentId as number),
    enabled: !!studentId,
  });

  const gpaQ = useQuery({
    queryKey: ["student-gpa", studentId],
    queryFn: () => gradeService.gpaById(studentId as number),
    enabled: !!studentId,
  });

  const requestsQ = useQuery({
    queryKey: ["transcript-requests-student", studentId],
    queryFn: () => transcriptService.list({ search: student?.regnumber }),
    enabled: !!studentId,
  });

  const download = useMutation({
    mutationFn: () =>
      marksService.downloadStudentTranscriptById(studentId as number),
    onError: (e: any) =>
      toast.error(
        e?.response?.data?.message ?? "Could not download transcript",
      ),
  });

  if (!studentId) {
    return (
      <div className="card p-8 text-center text-ink-400">
        This student record is missing an internal id, so a transcript cannot be
        generated.
      </div>
    );
  }

  if (marksQ.isLoading) {
    return (
      <div className="card p-8 text-center">
        <Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" />
      </div>
    );
  }

  const data = marksQ.data?.data;
  const totals: MyMarksTotals | undefined = data?.totals;

  // Every module for the student's curriculum, in one list: graded ones as
  // the server computed them, plus every outstanding module the option
  // requires but holds no mark for — the server appends those at 0/0/0
  // AFTER its own totals/average/classification are locked in, so a
  // placeholder can never drag down a real result. They print together,
  // grouped by level like everything else, rather than in a separate panel —
  // "still owed" and "already graded" are both just rows on the sheet.
  const rows: MyMarksRow[] = data?.rows ?? [];

  if (rows.length === 0) {
    return (
      <div className="card p-8 text-center text-ink-400">
        No marks or curriculum modules were found for this student. Once a
        lecturer or admin records marks under{" "}
        <span className="font-mono mx-1">Modules → Marks</span>, or a
        programme is mapped to this student, they will appear here.
      </div>
    );
  }

  // Grouped by level of study, the way the printed transcript is issued — one
  // sheet per level, each with its own totals. Grouping by academic year put
  // every legacy-imported mark under a single "Legacy" heading, which told the
  // reader nothing and matched no document the registry hands out.
  const byLevel = new Map<string, MyMarksRow[]>();
  for (const r of rows) {
    const k =
      r.level === null || r.level === undefined || r.level === ""
        ? "unclassified"
        : String(Number(r.level));
    if (!byLevel.has(k)) byLevel.set(k, []);
    byLevel.get(k)!.push(r);
  }
  const levels = Array.from(byLevel.entries()).sort(([a], [b]) =>
    a === "unclassified" ? 1 : b === "unclassified" ? -1 : Number(a) - Number(b),
  );

  const pendingCount = rows.filter((r) => r.not_marked).length;

  return (
    <div className="space-y-4">
      {/* Summary + download */}
      <div className="card p-4 flex flex-wrap items-center gap-5">
        <TStat
          icon={<BookOpen className="w-4 h-4" />}
          label="Completed modules"
          value={totals?.modules ?? rows.length - pendingCount}
        />
        {pendingCount > 0 && (
          <TStat
            icon={<AlertCircle className="w-4 h-4" />}
            label="Pending"
            value={pendingCount}
            tone="bad"
          />
        )}
        <TStat
          icon={<Award className="w-4 h-4" />}
          label="Total credits"
          value={totals?.total_credits ?? 0}
        />
        <TStat
          icon={<Percent className="w-4 h-4" />}
          label="Weighted avg"
          value={
            totals?.weighted_average != null
              ? `${totals.weighted_average}%`
              : "—"
          }
          highlight
        />
        <TStat
          icon={<GraduationCap className="w-4 h-4" />}
          label="Overall grade"
          value={totals?.overall_grade ?? "—"}
        />
        <TStat
          icon={<GraduationCap className="w-4 h-4" />}
          label="CGPA"
          value={gpaQ.data?.data?.cgpa != null ? gpaQ.data.data.cgpa.toFixed(2) : "—"}
          highlight
        />
        <TStat
          icon={<CheckCircle className="w-4 h-4" />}
          label="Decision"
          value={totals?.decision ?? "—"}
          tone={
            totals?.decision === "Promoted"
              ? "good"
              : totals?.decision === "Repeat"
                ? "bad"
                : undefined
          }
        />

        <button
          className="btn-primary btn-sm ml-auto"
          disabled={download.isPending}
          onClick={() => download.mutate()}
        >
          {download.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5" />
          )}
          {download.isPending ? "Preparing…" : "Download transcript (PDF)"}
        </button>
      </div>

      {/* The class the regulations award — final-level modules only, so it is
          absent for a student who has not reached them yet. */}
      <TClassificationCard classification={totals?.classification} />

      {/* Transcript request history (admin view) */}
      {(requestsQ.data?.data?.data ?? []).length > 0 && (
        <div className="card p-4">
          <h3 className="text-[12px] font-semibold text-ink-500 uppercase mb-3">Transcript Request History</h3>
          <div className="space-y-2">
            {(requestsQ.data?.data?.data ?? []).map((r: any) => (
              <div key={r.id} className="flex items-center justify-between text-[13px] border-b border-ink-100 dark:border-ink-700 pb-2 last:border-0 last:pb-0">
                <div>
                  <span className="font-medium capitalize">{r.request_type}</span>
                  <span className="text-ink-400 ml-2">{r.copies} cop{r.copies !== 1 ? 'ies' : 'y'}</span>
                  {r.purpose && <span className="text-ink-400 ml-2">— {r.purpose}</span>}
                  <span className="text-ink-400 ml-2 text-[11px]">{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
                <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${TR_STATUS_BADGE[r.status] ?? 'bg-gray-100 text-gray-600 dark:bg-ink-700 dark:text-ink-300'}`}>
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* One block per level — the same split the PDF prints as separate sheets */}
      {levels.map(([level, list]) => (
        <div key={level} className="card overflow-hidden">
          <div className="px-4 py-2 border-b border-ink-100 dark:border-ink-700 bg-ink-50 dark:bg-ink-800/40 flex items-center justify-between gap-3">
            <span className="text-[12px] font-semibold text-ink-700 dark:text-ink-200">
              {tLevelLabel(level, levelName(level, ""))}
            </span>
            <span className="text-[11px] text-ink-500 dark:text-ink-400">
              {tLevelSummary(list)}
            </span>
          </div>
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="bg-ink-50/60 dark:bg-ink-800/30 border-b border-ink-100 dark:border-ink-700">
                <th className="px-3 py-2 font-bold text-ink-400 text-[10px] uppercase">
                  #
                </th>
                <th className="px-3 py-2 font-bold text-ink-400 text-[10px] uppercase">
                  Code
                </th>
                <th className="px-3 py-2 font-bold text-ink-400 text-[10px] uppercase">
                  Module
                </th>
                <th className="px-3 py-2 font-bold text-ink-400 text-[10px] uppercase">
                  Term
                </th>
                <th className="px-3 py-2 font-bold text-ink-400 text-[10px] uppercase text-center">
                  Credits
                </th>
                <th className="px-3 py-2 font-bold text-ink-400 text-[10px] uppercase text-center">
                  CAT/60
                </th>
                <th className="px-3 py-2 font-bold text-ink-400 text-[10px] uppercase text-center">
                  EXAM/40
                </th>
                <th className="px-3 py-2 font-bold text-ink-400 text-[10px] uppercase text-center">
                  Total/100
                </th>
                <th className="px-3 py-2 font-bold text-ink-400 text-[10px] uppercase text-center">
                  Grade
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
              {list.map((r, i) => {
                const notMarked = !!r.not_marked;
                return (
                  <tr
                    key={r.id ?? `pending-${r.module_id}-${i}`}
                    className={
                      notMarked
                        ? "bg-amber-50/40 dark:bg-amber-500/5 hover:bg-amber-50/70 dark:hover:bg-amber-500/10"
                        : "hover:bg-ink-50/50 dark:hover:bg-ink-700/20"
                    }
                  >
                    <td className="px-3 py-2 text-ink-500">{i + 1}</td>
                    <td className="px-3 py-2 font-mono">
                      {notMarked ? (
                        <Link
                          to={`/modules/marks?module_id=${r.module_id}`}
                          className="text-amber-700 dark:text-amber-400 font-semibold hover:underline"
                          title="Open this module on the marks sheet"
                        >
                          {r.module_code}
                        </Link>
                      ) : (
                        r.module_code
                      )}
                    </td>
                    <td className="px-3 py-2">{r.module_name}</td>
                    <td className="px-3 py-2 text-ink-500">
                      {notMarked ? (
                        <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                          <AlertCircle className="w-3 h-3" /> {r.term_label}
                        </span>
                      ) : (
                        r.term_label
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">{r.module_credits}</td>
                    <td className="px-3 py-2 text-center">
                      {tFmt(r.cat_marks)}
                      <span className="text-ink-400 text-[11px]">
                        /60
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {tFmt(r.exam_marks)}
                      <span className="text-ink-400 text-[11px]">
                        /40
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center font-semibold">
                      {r.cat_marks != null && r.exam_marks != null
                        ? Math.round(Number(r.cat_marks) + Number(r.exam_marks))
                        : r.percentage != null
                          ? Math.round(Number(r.percentage))
                          : "—"}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {r.grade ? (
                        <TGradePill grade={r.grade} />
                      ) : notMarked ? (
                        <span
                          className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                          title="Not yet marked — click the code to open the marks sheet"
                        >
                          Pending
                        </span>
                      ) : (
                        <span className="text-ink-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

/**
 * The degree classification, as the transcript PDF prints it.
 *
 * Shows the arithmetic behind the class as well as the class itself: a "2i"
 * with nothing beside it is not something the registry can defend to an
 * external verifier, and the caveats say plainly what the record could not
 * confirm — most often a missing Project module.
 *
 * Renders nothing until the student has marks at the final levels; a first-year
 * transcript has no class to state.
 */
function TClassificationCard({
  classification: c,
}: {
  classification?: HonoursClassification | null;
}) {
  if (!c || c.modules === 0) return null;

  const levels = c.levels.join(" & ");

  return (
    <div className="card p-4">
      <h3 className="text-[12px] font-semibold text-ink-500 uppercase mb-2">
        Degree Classification
      </h3>
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex px-2.5 py-1 rounded-full text-[13px] font-bold ${
            c.awarded
              ? "bg-brand/10 text-brand dark:bg-brand/20 dark:text-gold-400"
              : "bg-ink-100 text-ink-500 dark:bg-ink-700 dark:text-ink-300"
          }`}
        >
          {c.label}
        </span>
        {c.awarded ? (
          <span className="text-[12px] text-ink-500 dark:text-ink-400">
            Assessed on levels {levels} — {c.qualifying_credits} of {c.credits}{" "}
            credits at or above the class threshold
            {c.lowest_mark !== null && <>, lowest mark {c.lowest_mark}%</>}.
          </span>
        ) : (
          c.reason && (
            <span className="text-[12px] text-ink-500 dark:text-ink-400">
              Assessed on levels {levels}. {c.reason}
            </span>
          )
        )}
      </div>
      {c.project && (
        <div className="mt-2 text-[12px] text-ink-500 dark:text-ink-400">
          Project: <span className="font-mono">{c.project.code}</span>{" "}
          {c.project.name} — {c.project.mark}% ({c.project.credits} credits)
        </div>
      )}
      {c.caveats.length > 0 && (
        <ul className="mt-2 space-y-1">
          {c.caveats.map((n, i) => (
            <li
              key={i}
              className="text-[11px] italic text-amber-700 dark:text-amber-300"
            >
              {n}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The catalogue name for a level, e.g. "Level 8, Semester 5". */
function tLevelLabel(level: string, name?: string): string {
  if (level === "unclassified") return "Level not recorded";
  const n = Number(level);
  // Just the catalogue name. It already states the semester, so the derived
  // "— Semesters 5 & 6" that used to follow it only ever restated the level
  // in different words, and contradicted the name whenever the two disagreed.
  // Stray whitespace before punctuation comes from the stored name.
  return (name || `Level ${n}`).replace(/\s+([,;:])/g, "$1").trim();
}

/** Credits and weighted average for one level, matching the PDF's TOTAL row. */
function tLevelSummary(list: MyMarksRow[]): string {
  let credits = 0;
  let points = 0;
  let pending = 0;
  for (const r of list) {
    if (r.not_marked) { pending++; continue; }
    if (r.percentage === null || r.percentage === undefined) continue;
    const c = Number(r.module_credits) || 0;
    credits += c;
    points += c * Number(r.percentage);
  }
  const avg = credits > 0 ? (points / credits).toFixed(2) : null;
  const completed = list.length - pending;
  return `${completed} completed${pending ? ` · ${pending} pending` : ""} · ${credits} credits${
    avg !== null ? ` · ${avg}%` : ""
  }`;
}

function TStat({
  icon,
  label,
  value,
  highlight,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
  tone?: "good" | "bad";
}) {
  const valueCls =
    tone === "good"
      ? "text-emerald-600"
      : tone === "bad"
        ? "text-red-600"
        : highlight
          ? "text-brand dark:text-gold-400"
          : "text-ink-900 dark:text-white";
  return (
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 rounded-md bg-brand/10 text-brand dark:bg-brand/20 dark:text-gold-400 flex items-center justify-center">
        {icon}
      </div>
      <div>
        <div className="text-[10px] uppercase font-bold text-ink-400">
          {label}
        </div>
        <div className={`text-base font-bold leading-tight ${valueCls}`}>
          {value}
        </div>
      </div>
    </div>
  );
}

/**
 * A letter grade as CUR issues it — whole letters only. A "B+" reaching here
 * from a stored `module_marks.grade` is folded to "B" rather than shown as a
 * grade the institution does not award; the server does the same on its way
 * out, so this is the second of two doors on the same rule.
 */
function TGradePill({ grade }: { grade: string }) {
  const letter = normalizeGrade(grade) ?? grade;
  const tone =
    letter === "A"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
      : letter === "B"
        ? "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"
        : letter === "C"
          ? "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
          : letter === "D"
            ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
            : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300";
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${tone}`}
    >
      {letter}
    </span>
  );
}

function tFmt(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : "—";
}

/* ─── ID Card tab ─────────────────────────────────────────────────────── */

/** Natural size of the preview document: a 165 x 94mm card plus the 5mm of
 *  page margin around it, at CSS 96dpi. The iframe is laid out at this size and
 *  then scaled, so the card is always drawn at full fidelity and never reflowed. */
const PREVIEW_W = Math.round((165 + 10) * 96 / 25.4);
const PREVIEW_H = Math.round((94 + 10) * 96 / 25.4);

/**
 * The card preview, scaled to fill whatever room the dialog has.
 *
 * A plain iframe rendered the card at its physical size inside whatever box the
 * dialog happened to be, which on a laptop left it small and clipped. Measuring
 * the container and scaling to it means the card is as large as the space
 * allows on any screen, and stays sharp because it is a transform rather than a
 * re-layout.
 */
function CardPreviewFrame({ html }: { html: string }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const fit = () => {
      const { width, height } = el.getBoundingClientRect();
      if (!width || !height) return;
      // Never upscale past 2x — beyond that a 165mm card just looks blurry.
      setScale(Math.min(width / PREVIEW_W, height / PREVIEW_H, 2));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={wrapRef}
      className="flex-1 min-h-[420px] overflow-auto bg-ink-100 dark:bg-ink-900 p-4 grid place-items-center"
    >
      <div style={{ width: PREVIEW_W * scale, height: PREVIEW_H * scale }}>
        <iframe
          srcDoc={html}
          title="ID card preview"
          scrolling="no"
          className="border-0 bg-white"
          style={{
            width: PREVIEW_W,
            height: PREVIEW_H,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        />
      </div>
    </div>
  );
}

function IdCardTab({ student }: { student: any }) {
  const studentId = student?.id as number | string | undefined;
  const canManage = usePermission(PERMISSIONS.MANAGE_STUDENT_IDS);

  const qc = useQueryClient();
  const [preview, setPreview] = useState<string | null>(null);

  const histQ = useQuery({
    queryKey: ["student-id-card", studentId],
    queryFn: () => studentIdService.history(studentId as number),
    enabled: !!studentId,
  });

  const issueMut = useMutation({
    mutationFn: () => studentIdService.issue(studentId as number),
    onSuccess: () => {
      toast.success("ID card issued.");
      qc.invalidateQueries({ queryKey: ["student-id-card", studentId] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Could not issue card."),
  });

  const revokeMut = useMutation({
    mutationFn: (cardId: number) => studentIdService.revoke(cardId),
    onSuccess: () => {
      toast.success("ID card revoked.");
      qc.invalidateQueries({ queryKey: ["student-id-card", studentId] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Could not revoke card."),
  });

  const downloadMut = useMutation({
    mutationFn: () => studentIdService.download(studentId as number),
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Could not download card."),
  });

  const printMut = useMutation({
    mutationFn: () => studentIdService.print(studentId as number),
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Could not print card."),
  });

  const previewMut = useMutation({
    mutationFn: async () => {
      const photo = student?.photo as string | null | undefined;
      // Pass the photo value so the backend can embed it even when student.photo
      // is null in the DB (legacy students whose photo column wasn't migrated).
      const res = await studentIdService.preview(studentId as number, photo ?? undefined);
      let html = res.data?.html ?? '';

      // If the server already embedded a data URI we're done — no client fetch needed.
      if (html.includes('data:image/')) return html;

      // Server set an external URL (couldn't fetch server-side) or showed initials.
      // Try to fetch the photo client-side and swap it in as a data URI so the
      // iframe has no cross-origin dependency.
      if (photo && !isPhotoUuid(photo)) {
        const photoUrl = legacyPhotoUrl(photo);
        try {
          const imgRes = await fetch(photoUrl);
          if (imgRes.ok) {
            const blob = await imgRes.blob();
            const dataUri = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload  = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
            // Replace whichever element the backend used as the photo cell:
            // – an <img data-card-photo> with a legacy URL
            // – a <div data-card-photo> with initials (when server has no photo)
            html = html.replace(
              /<(?:img|div)\s[^>]*data-card-photo="1"[^>]*>(?:[^<]*<\/div>)?/,
              `<img data-card-photo="1" src="${dataUri}" style="width:24mm;height:30mm;object-fit:cover;border:1px solid #94a3b8;" />`
            );
          }
        } catch {
          // Fetch failed (CORS). If the backend left an external URL in the img,
          // the browser will load it directly in the iframe (img tags bypass CORS).
          // If the backend left initials, replace with an img pointing to the URL —
          // it will load in the iframe even across origins.
          html = html.replace(
            /<div\s[^>]*data-card-photo="1"[^>]*>[^<]*<\/div>/,
            `<img data-card-photo="1" src="${photoUrl}" style="width:24mm;height:30mm;object-fit:cover;border:1px solid #94a3b8;" />`
          );
        }
      }

      return html;
    },
    onSuccess: (html) => setPreview(html),
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Could not load preview."),
  });

  if (!studentId) {
    return (
      <div className="card p-8 text-center text-ink-400">
        This student record is missing an internal id, so an ID card cannot be generated.
      </div>
    );
  }

  if (histQ.isLoading) {
    return (
      <div className="card p-8 text-center">
        <Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" />
      </div>
    );
  }

  const active: StudentIdCard | null = histQ.data?.data?.active ?? null;
  const history: StudentIdCard[] = histQ.data?.data?.history ?? [];
  const expired = active ? new Date(active.expiry_date) < new Date() : false;

  return (
    <div className="space-y-4">
      <div className="card p-4 flex flex-wrap items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-brand/10 text-brand grid place-items-center">
          <CreditCard className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <h3 className="font-semibold text-ink-900 dark:text-ink-50">Student ID card</h3>
          {active ? (
            <p className="text-[13px] text-ink-500">
              Barcode <span className="font-mono">{active.barcode}</span> · issued{" "}
              {new Date(active.issue_date).toLocaleDateString()} · expires{" "}
              <span className={expired ? "text-red-600 font-medium" : ""}>
                {new Date(active.expiry_date).toLocaleDateString()}
              </span>
              {expired && " (expired)"}
            </p>
          ) : (
            <p className="text-[13px] text-ink-400">No active card. Issue one to enable printing.</p>
          )}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {active && (
            <>
              <button className="btn-ghost btn-sm" disabled={previewMut.isPending} onClick={() => previewMut.mutate()}>
                {previewMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                Preview
              </button>
              <button className="btn-primary btn-sm" disabled={printMut.isPending} onClick={() => printMut.mutate()}>
                {printMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
                {printMut.isPending ? "Preparing…" : "Print"}
              </button>
              <button className="btn-ghost btn-sm" disabled={downloadMut.isPending} onClick={() => downloadMut.mutate()}>
                {downloadMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                {downloadMut.isPending ? "Preparing…" : "Download PDF"}
              </button>
            </>
          )}
          {canManage && (
            <button className="btn-ghost btn-sm" disabled={issueMut.isPending} onClick={() => issueMut.mutate()}>
              {issueMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {active ? "Re-issue" : "Issue card"}
            </button>
          )}
        </div>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-2 border-b border-ink-100 dark:border-ink-700 bg-ink-50 dark:bg-ink-800/40 text-[12px] font-semibold text-ink-700 dark:text-ink-200">
            Issuance history
          </div>
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="bg-ink-50/60 dark:bg-ink-800/30 border-b border-ink-100 dark:border-ink-700 text-[10px] uppercase text-ink-400">
                <th className="px-3 py-2 font-bold">Barcode</th>
                <th className="px-3 py-2 font-bold">Issued</th>
                <th className="px-3 py-2 font-bold">Expires</th>
                <th className="px-3 py-2 font-bold">Status</th>
                {canManage && <th className="px-3 py-2 font-bold text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {history.map((c) => (
                <tr key={c.id} className="border-b border-ink-50 dark:border-ink-800/60">
                  <td className="px-3 py-2 font-mono text-ink-600 dark:text-ink-300">{c.barcode}</td>
                  <td className="px-3 py-2">{new Date(c.issue_date).toLocaleDateString()}</td>
                  <td className="px-3 py-2">{new Date(c.expiry_date).toLocaleDateString()}</td>
                  <td className="px-3 py-2">
                    {Number(c.is_active)
                      ? <span className="text-emerald-600 font-medium">Active</span>
                      : <span className="text-ink-400">Revoked</span>}
                  </td>
                  {canManage && (
                    <td className="px-3 py-2 text-right">
                      {Number(c.is_active) === 1 && (
                        <button
                          className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500"
                          title="Revoke"
                          disabled={revokeMut.isPending}
                          onClick={() => revokeMut.mutate(c.id)}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Preview modal */}
      {preview !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 backdrop-blur-sm p-4">
          <div className="card w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-ink-100 dark:border-ink-700">
              <h3 className="font-semibold text-ink-900 dark:text-ink-50">ID card preview</h3>
              <button className="p-1 text-ink-400 hover:text-ink-700" onClick={() => setPreview(null)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <CardPreviewFrame html={preview} />
          </div>
        </div>
      )}
    </div>
  );
}
