import { useMemo } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  GraduationCap,
  LayoutDashboard,
  Users,
  FileText,
  BookOpen,
  Upload,
  Search,
  ShieldCheck,
  CalendarDays,
  Wallet,
  ClipboardList,
  Briefcase,
  Sparkles,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  Loader2,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { PERMISSIONS } from "@/constants";
import { isSuperadmin } from "@/utils/permissions";
import { applicantService } from "@/services/admissionService";
import type { ApplicationStatus } from "@/types/admission";

/* ─── animation variants ─────────────────────────────────────────── */
const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.45, ease: "easeOut" },
  }),
};

/* ─── helpers ────────────────────────────────────────────────────── */
function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatNow(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/* ─── quick-action cards ─────────────────────────────────────────── */
/**
 * Each card declares which roles or permissions unlock it. The visible list
 * is derived from the signed-in user — no hardcoded "everyone in group X
 * sees the same thing" buckets.
 *
 *   - `roles`        → only these exact roles see the card (overrides perms)
 *   - `permissions`  → ANY of these RBAC slugs grants access
 *   - `hideForRoles` → explicit denylist for product-level decisions
 *   - both undefined → visible to every authenticated user
 */
interface QA {
  to: string;
  icon: React.ElementType;
  label: string;
  sub: string;
  accent: string;
  roles?: string[];
  permissions?: string[];
  hideForRoles?: string[];
}

const QUICK_ACTIONS: QA[] = [
  // Universal — every signed-in user (except student/applicant who land on
  // their portal-specific shortcuts).
  {
    to: "/dashboard",
    icon: LayoutDashboard,
    label: "Dashboard",
    sub: "Overview & key metrics",
    accent:
      "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300",
    hideForRoles: ["student", "applicant"],
  },

  // Student-only — opens the rich self-service profile.
  {
    to: "/me/profile",
    icon: ClipboardList,
    label: "My Profile",
    sub: "Your enrolment & marks",
    accent:
      "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300",
    roles: ["student"],
  },

  // Applicant-only
  {
    to: "/applicant",
    icon: ClipboardList,
    label: "My Application",
    sub: "View & edit details",
    accent:
      "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300",
    roles: ["applicant"],
  },
  {
    to: "/applicant/documents",
    icon: Upload,
    label: "Documents",
    sub: "Upload required files",
    accent: "bg-accent-sky text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
    roles: ["applicant"],
  },
  {
    to: "/apply/track",
    icon: Search,
    label: "Track Status",
    sub: "Check your progress",
    accent:
      "bg-accent-mint text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    roles: ["applicant"],
  },
  {
    to: "/apply",
    icon: FileText,
    label: "New Application",
    sub: "Start fresh application",
    accent:
      "bg-accent-peach text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
    roles: ["applicant"],
  },

  // Admissions admins
  {
    to: "/admin/admissions",
    icon: GraduationCap,
    label: "Admissions",
    sub: "Manage applications",
    accent: "bg-accent-sky text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
    permissions: [
      PERMISSIONS.MANAGE_STUDENT_APPLICATIONS,
      PERMISSIONS.VERIFY_DOCUMENTS,
      PERMISSIONS.MANAGE_ADMISSIONS,
      PERMISSIONS.MANAGE_ADMISSION_REQUIREMENTS,
    ],
  },

  // System admins
  {
    to: "/users",
    icon: Users,
    label: "Users",
    sub: "Manage system users",
    accent:
      "bg-accent-peach text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
    permissions: [PERMISSIONS.MANAGE_USERS],
  },
  {
    to: "/roles",
    icon: ShieldCheck,
    label: "Roles",
    sub: "Permissions & access",
    accent:
      "bg-gold-50 text-gold-700 dark:bg-yellow-900/30 dark:text-yellow-300",
    permissions: [PERMISSIONS.MANAGE_ROLES],
  },

  // Academics — hidden from hr_manager (mirrors sidebar policy)
  {
    to: "/academic/management",
    icon: BookOpen,
    label: "Academics",
    sub: "Degrees, programs & more",
    accent:
      "bg-accent-mint text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    hideForRoles: ["hr_manager"],
    permissions: [
      PERMISSIONS.MANAGE_ACADEMICS,
      PERMISSIONS.MANAGE_DEGREES,
      PERMISSIONS.MANAGE_FACILITIES,
      PERMISSIONS.MANAGE_DEPARTMENTS,
      PERMISSIONS.MANAGE_OPTIONS,
      PERMISSIONS.MANAGE_LEVELS,
      PERMISSIONS.MANAGE_SCHOOLS,
      PERMISSIONS.MANAGE_ACADEMIC_YEARS,
      PERMISSIONS.MANAGE_ACADEMIC_TERMS,
    ],
  },

  // Students registry
  {
    to: "/students",
    icon: GraduationCap,
    label: "Students",
    sub: "Student registry",
    accent: "bg-accent-sky text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
    permissions: [PERMISSIONS.VIEW_STUDENTS],
  },

  // Modules — anyone holding any module-level perm
  {
    to: "/modules",
    icon: BookOpen,
    label: "Modules",
    sub: "Courses & scheduling",
    accent:
      "bg-accent-mint text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    permissions: [
      PERMISSIONS.MANAGE_MODULES,
      PERMISSIONS.MANAGE_MODULE_SCHEDULES,
      PERMISSIONS.MANAGE_MODULE_ASSIGNMENTS,
      PERMISSIONS.MANAGE_MODULE_REGISTRATIONS,
      PERMISSIONS.VIEW_MY_MODULES,
    ],
  },

  // Calendar / academic terms (still useful as a shortcut for staff who set
  // up year + term boundaries)
  {
    to: "/academic/settings",
    icon: CalendarDays,
    label: "Academic settings",
    sub: "Years & terms",
    accent:
      "bg-accent-lilac text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
    permissions: [
      PERMISSIONS.MANAGE_ACADEMIC_YEARS,
      PERMISSIONS.MANAGE_ACADEMIC_TERMS,
      PERMISSIONS.VIEW_SYSTEM_BASICS,
    ],
  },

  // HR
  {
    to: "/hr/staff",
    icon: Briefcase,
    label: "HR",
    sub: "Staff & payroll",
    accent:
      "bg-accent-peach text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
    permissions: [
      PERMISSIONS.VIEW_HR_EMPLOYEES,
      PERMISSIONS.MANAGE_HR_EMPLOYEES,
    ],
  },

  // Finance
  {
    to: "/finance",
    icon: Wallet,
    label: "Finance",
    sub: "Fees & billing",
    accent:
      "bg-accent-lilac text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
    permissions: [PERMISSIONS.VIEW_FINANCE, PERMISSIONS.MANAGE_FINANCE],
  },
];

/* ─── main component ─────────────────────────────────────────────── */
export default function WelcomePage() {
  const { user } = useAuthStore();

  const role = user?.role ?? "";
  const userPerms = user?.permissions ?? [];
  const isApplicant = role === "applicant" || user?.is_applicant;
  const isSuper = isSuperadmin(user);

  // Hooks must run unconditionally — all useMemo calls before any early return.
  const firstName = useMemo(
    () => user?.full_name?.split(" ")[0] ?? "there",
    [user],
  );
  const roleLabel = useMemo(() => {
    if (isApplicant) return "Applicant";
    return user?.role_name ?? role ?? "Staff";
  }, [user, isApplicant, role]);

  // Per-role filter — same model as the sidebar in MainLayout.
  const actions = useMemo(() => {
    return QUICK_ACTIONS.filter((qa) => {
      if (qa.hideForRoles?.includes(role)) return false;
      if (qa.roles && qa.roles.length > 0) return qa.roles.includes(role);
      // No permission requirement → universally visible
      if (!qa.permissions || qa.permissions.length === 0) return true;
      // Superadmin sees every permission-gated card; everyone else needs a match
      if (isSuper) return true;
      return qa.permissions.some((p) => userPerms.includes(p));
    });
  }, [role, userPerms, isSuper]);

  // Early return AFTER all hooks so Rules of Hooks are satisfied.
  if (isApplicant) {
    return (
      <ApplicantWelcome firstName={user?.full_name?.split(" ")[0] ?? "there"} />
    );
  }

  const isStudent = role === "student";
  const dashLink = isApplicant
    ? "/applicant"
    : isStudent
      ? "/me/profile"
      : "/dashboard";
  const DashIcon = isStudent ? ClipboardList : LayoutDashboard;
  const dashLabel = isStudent ? "Open My Profile" : "Go to Dashboard";
  const dashSub = isStudent
    ? "View your enrolment & marks"
    : "View metrics and overview";
  const greeting = getGreeting();
  const dateLabel = formatNow();

  // Applicants get a dedicated welcome screen. This early return MUST come
  // after every hook above so the hook count stays constant between renders
  // (e.g. when the "/" route instance is reused across a user switch) —
  // otherwise React throws "Rendered more hooks than during the previous render."
  if (isApplicant) {
    return (
      <ApplicantWelcome firstName={user?.full_name?.split(" ")[0] ?? "there"} />
    );
  }

  return (
    <div className="min-h-[calc(100vh-64px)] flex flex-col">
      {/* ── hero banner ─────────────────────────────────────────────── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary-800 via-primary-700 to-primary-900 dark:from-ink-900 dark:via-primary-950 dark:to-ink-900">
        {/* decorative orbs */}
        <div className="pointer-events-none absolute -top-20 -right-20 w-80 h-80 rounded-full bg-white/5 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 w-72 h-72 rounded-full bg-gold-400/10 blur-3xl" />
        <div className="pointer-events-none absolute top-1/2 right-1/4 w-40 h-40 rounded-full bg-primary-400/10 blur-2xl" />

        <div className="relative max-w-[1200px] mx-auto px-6 py-14 md:py-20">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8">
            {/* left — greeting */}
            <div className="max-w-xl">
              {/* role badge */}
              <motion.div
                custom={0}
                variants={fadeUp}
                initial="hidden"
                animate="visible"
                className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/20 px-3 py-1 mb-5"
              >
                <Sparkles className="w-3 h-3 text-gold-300" />
                <span className="text-[11.5px] font-medium text-white/80 uppercase tracking-wider">
                  {roleLabel}
                </span>
              </motion.div>

              <motion.h1
                custom={1}
                variants={fadeUp}
                initial="hidden"
                animate="visible"
                className="text-[32px] md:text-[40px] font-semibold text-white tracking-tight leading-tight"
              >
                {greeting},<br />
                <span className="text-gold-300">{firstName}.</span>
              </motion.h1>

              <motion.p
                custom={2}
                variants={fadeUp}
                initial="hidden"
                animate="visible"
                className="mt-3 text-[14px] text-white/60 flex items-center gap-2"
              >
                <CalendarDays className="w-4 h-4 text-white/40 shrink-0" />
                {dateLabel}
              </motion.p>

              <motion.p
                custom={3}
                variants={fadeUp}
                initial="hidden"
                animate="visible"
                className="mt-4 text-[14px] text-white/70 leading-relaxed max-w-sm"
              >
                You are now signed in to{" "}
                <span className="text-white font-medium">CUR-MIS</span>. Use the
                shortcuts below or navigate to your dashboard to get started.
              </motion.p>
            </div>

            {/* right — primary CTA */}
            <motion.div
              custom={3}
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              className="flex flex-col items-start md:items-end gap-3"
            >
              <Link
                to={dashLink}
                className="inline-flex items-center gap-2.5 rounded-xl bg-gold-400 hover:bg-gold-300 text-primary-900 font-semibold text-[14px] px-7 py-3.5 shadow-lg shadow-gold-400/30 hover:shadow-gold-400/50 transition-all duration-200 hover:-translate-y-0.5 active:scale-95"
              >
                <DashIcon className="w-4.5 h-4.5" />
                {dashLabel}
                <ArrowRight className="w-4 h-4" />
              </Link>
              <p className="text-[11.5px] text-white/40">
                {isApplicant ? "Track your application" : dashSub}
              </p>
            </motion.div>
          </div>
        </div>
      </div>

      {/* ── quick actions ────────────────────────────────────────────── */}
      <div className="flex-1 bg-[rgb(var(--bg-app))] px-6 py-10">
        <div className="max-w-[1200px] mx-auto space-y-8">
          {/* bottom strip */}
          <motion.div
            custom={actions.length + 5}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="pt-4 border-t border-ink-100 dark:border-ink-800 flex items-center justify-between flex-wrap gap-4"
          >
            <p className="text-[12.5px] text-ink-400">
              Signed in as{" "}
              <span className="font-medium text-ink-600 dark:text-ink-300">
                {user?.email}
              </span>
            </p>
            <Link
              to={dashLink}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-brand hover:text-brand/80 transition-colors"
            >
              {isStudent ? "Open my profile" : "Continue to dashboard"}{" "}
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

/* ─── applicant welcome ──────────────────────────────────────────── */

const STATUS_META: Record<
  ApplicationStatus,
  { label: string; tone: string; icon: React.ElementType; copy: string }
> = {
  draft: {
    label: "Draft",
    tone: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    icon: FileText,
    copy: "Pick up where you left off and submit your application.",
  },
  submitted: {
    label: "Submitted",
    tone: "bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300",
    icon: CheckCircle2,
    copy: "Your application has been received. We will review it shortly.",
  },
  documents_under_review: {
    label: "Documents under review",
    tone: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    icon: Clock,
    copy: "Our admissions team is verifying your documents.",
  },
  documents_verified: {
    label: "Documents verified",
    tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    icon: CheckCircle2,
    copy: "All your documents have been verified.",
  },
  documents_rejected: {
    label: "Documents rejected",
    tone: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    icon: XCircle,
    copy: "Some documents need attention. Please review and re-upload.",
  },
  requested_changes: {
    label: "Changes requested",
    tone: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    icon: AlertCircle,
    copy: "The admissions office has requested changes to your application.",
  },
  merit_listed: {
    label: "Merit listed",
    tone: "bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300",
    icon: CheckCircle2,
    copy: "You have been merit-listed. Watch this space for an offer.",
  },
  offered: {
    label: "Offer received",
    tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    icon: Sparkles,
    copy: "Congratulations — you have an admission offer awaiting your response.",
  },
  offer_accepted: {
    label: "Offer accepted",
    tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    icon: CheckCircle2,
    copy: "You have accepted your admission offer. Enrollment is being finalized.",
  },
  offer_declined: {
    label: "Offer declined",
    tone: "bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300",
    icon: XCircle,
    copy: "You declined this admission offer.",
  },
  enrolled: {
    label: "Enrolled",
    tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    icon: CheckCircle2,
    copy: "You are officially enrolled. Welcome to CUR.",
  },
  withdrawn: {
    label: "Withdrawn",
    tone: "bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300",
    icon: XCircle,
    copy: "This application has been withdrawn.",
  },
};

function ApplicantWelcome({ firstName }: { firstName: string }) {
  const greeting = getGreeting();
  const dateLabel = formatNow();

  const appsQ = useQuery({
    queryKey: ["applicant", "applications"],
    queryFn: () => applicantService.listApplications(),
  });
  const apps = appsQ.data?.data ?? [];
  const draft = apps.find((a) => a.status === "draft");
  const active =
    apps.find((a) => a.status === "offered") ??
    apps.find(
      (a) =>
        a.status !== "draft" &&
        a.status !== "withdrawn" &&
        a.status !== "offer_declined",
    ) ??
    apps[0];
  const focusApp = draft ?? active;
  const focusStatus = focusApp?.status as ApplicationStatus | undefined;
  const focusMeta = focusStatus ? STATUS_META[focusStatus] : null;

  // Business rule: an applicant can only start a new application when ALL
  // their existing applications are still drafts. Once anything has been
  // submitted (or moved past draft), they cannot create another one.
  const hasNonDraft = apps.some((a) => a.status !== "draft");
  const canStartNew = !hasNonDraft;

  const primaryCta = draft
    ? {
        to: "/apply",
        label: "Continue Application",
        icon: ArrowRight,
        sub: "Pick up where you left off",
      }
    : apps.length === 0
      ? {
          to: "/apply",
          label: "Start Application",
          icon: ArrowRight,
          sub: "Begin your admission journey",
        }
      : {
          to: "/applicant",
          label: "View My Applications",
          icon: ClipboardList,
          sub: "Track progress and manage details",
        };

  return (
    <div className="min-h-[calc(100vh-64px)] flex flex-col">
      {/* hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary-800 via-primary-700 to-primary-900 dark:from-ink-900 dark:via-primary-950 dark:to-ink-900">
        <div className="pointer-events-none absolute -top-20 -right-20 w-80 h-80 rounded-full bg-white/5 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 w-72 h-72 rounded-full bg-gold-400/10 blur-3xl" />
        <div className="pointer-events-none absolute top-1/2 right-1/4 w-40 h-40 rounded-full bg-primary-400/10 blur-2xl" />

        <div className="relative max-w-[1200px] mx-auto px-6 py-14 md:py-20">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8">
            <div className="max-w-xl">
              <motion.div
                custom={0}
                variants={fadeUp}
                initial="hidden"
                animate="visible"
                className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/20 px-3 py-1 mb-5"
              >
                <Sparkles className="w-3 h-3 text-gold-300" />
                <span className="text-[11.5px] font-medium text-white/80 uppercase tracking-wider">
                  Applicant
                </span>
              </motion.div>

              <motion.h1
                custom={1}
                variants={fadeUp}
                initial="hidden"
                animate="visible"
                className="text-[32px] md:text-[40px] font-semibold text-white tracking-tight leading-tight"
              >
                {greeting},<br />
                <span className="text-gold-300">{firstName}.</span>
              </motion.h1>

              <motion.p
                custom={2}
                variants={fadeUp}
                initial="hidden"
                animate="visible"
                className="mt-3 text-[14px] text-white/60 flex items-center gap-2"
              >
                <CalendarDays className="w-4 h-4 text-white/40 shrink-0" />
                {dateLabel}
              </motion.p>

              <motion.p
                custom={3}
                variants={fadeUp}
                initial="hidden"
                animate="visible"
                className="mt-4 text-[14px] text-white/70 leading-relaxed max-w-sm"
              >
                {draft
                  ? "You have a draft application waiting. Continue when you are ready — your progress is saved."
                  : apps.length === 0
                    ? "Welcome to CUR-MIS. Start your application to begin your admission journey at the Catholic University of Rwanda."
                    : "Welcome back. Track the status of your application and respond to any pending actions below."}
              </motion.p>
            </div>

            <motion.div
              custom={3}
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              className="flex flex-col items-start md:items-end gap-3"
            >
              <Link
                to={primaryCta.to}
                className="inline-flex items-center gap-2.5 rounded-xl bg-gold-400 hover:bg-gold-300 text-primary-900 font-semibold text-[14px] px-7 py-3.5 shadow-lg shadow-gold-400/30 hover:shadow-gold-400/50 transition-all duration-200 hover:-translate-y-0.5 active:scale-95"
              >
                <primaryCta.icon className="w-4.5 h-4.5" />
                {primaryCta.label}
                <ArrowRight className="w-4 h-4" />
              </Link>
              <p className="text-[11.5px] text-white/40">{primaryCta.sub}</p>
            </motion.div>
          </div>
        </div>
      </div>

      {/* body */}
      <div className="flex-1 bg-[rgb(var(--bg-app))] px-6 py-10">
        <div className="max-w-[1200px] mx-auto space-y-8">
          {appsQ.isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-brand" />
            </div>
          ) : focusApp && focusMeta ? (
            <motion.div
              custom={4}
              variants={fadeUp}
              initial="hidden"
              animate="visible"
            >
              <div className="card p-6 md:p-7">
                <div className="flex flex-col md:flex-row md:items-center gap-5">
                  <div
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${focusMeta.tone}`}
                  >
                    <focusMeta.icon className="w-7 h-7" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-bold uppercase tracking-widest text-ink-400">
                        Application
                      </span>
                      <span className="text-[12px] font-mono font-bold text-brand">
                        {focusApp.application_number}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold uppercase tracking-wider ${focusMeta.tone}`}
                      >
                        {focusMeta.label}
                      </span>
                    </div>
                    <h3 className="text-[16px] font-bold text-ink-900 dark:text-white mt-1 truncate">
                      {focusApp.department_name ?? focusApp.faculty_name ?? "—"}
                    </h3>
                    <p className="text-[12.5px] text-ink-500 mt-1 leading-relaxed">
                      {focusMeta.copy}
                    </p>
                  </div>
                  <div className="shrink-0 flex flex-col sm:flex-row md:flex-col gap-2">
                    {draft ? (
                      <Link
                        to="/apply"
                        className="btn-primary btn-sm whitespace-nowrap"
                      >
                        Continue <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    ) : (
                      <Link
                        to="/applicant"
                        className="btn-primary btn-sm whitespace-nowrap"
                      >
                        View Details <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    )}
                    {apps.length > 1 && (
                      <Link
                        to="/applicant"
                        className="text-[12px] font-semibold text-ink-500 hover:text-brand transition-colors text-center"
                      >
                        See all {apps.length}
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ) : null}

          {/* applicant shortcuts */}
          <motion.div
            custom={5}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="space-y-3"
          >
            <div>
              <h2 className="text-[15px] font-semibold text-ink-900 dark:text-white">
                What's next
              </h2>
              <p className="text-[12.5px] text-ink-500 mt-0.5">
                Quick links tailored to your application journey
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <ApplicantShortcut
                to="/applicant"
                icon={ClipboardList}
                label="My Applications"
                sub={
                  apps.length > 0
                    ? `${apps.length} application${apps.length > 1 ? "s" : ""} on file`
                    : "View and manage details"
                }
                accent="bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
              />
              <ApplicantShortcut
                to="/apply/track"
                icon={Search}
                label="Track Status"
                sub="Check progress at any time"
                accent="bg-accent-mint text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
              />
              {(draft || canStartNew) && (
                <ApplicantShortcut
                  to="/apply"
                  icon={FileText}
                  label={draft ? "Continue Draft" : "Start Application"}
                  sub={
                    draft
                      ? "Resume your saved draft"
                      : "Begin a fresh application"
                  }
                  accent="bg-accent-peach text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
                />
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function ApplicantShortcut({
  to,
  icon: Icon,
  label,
  sub,
  accent,
}: {
  to: string;
  icon: React.ElementType;
  label: string;
  sub: string;
  accent: string;
}) {
  return (
    <Link
      to={to}
      className="group card p-4 flex items-center gap-3.5 hover:border-brand/40 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
    >
      <span
        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${accent} transition-all group-hover:scale-110`}
      >
        <Icon className="w-[18px] h-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold text-ink-900 dark:text-white leading-tight">
          {label}
        </p>
        <p className="text-[11.5px] text-ink-500 truncate mt-0.5">{sub}</p>
      </div>
      <ArrowRight className="w-3.5 h-3.5 text-ink-300 shrink-0 group-hover:text-brand group-hover:translate-x-0.5 transition-all" />
    </Link>
  );
}
