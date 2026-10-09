import {
  Home,
  X,
  User as UserIcon,
  Settings,
  GraduationCap,
  CreditCard,
  ClipboardList,
  BookOpen,
  Layers,
  Files,
  Activity,
  Search,
  MessageSquare,
  Megaphone,
  MessagesSquare,
  ShieldCheck,
  LayoutDashboard,
  ClipboardCheck,
  Briefcase,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  ScanLine,
  Wallet,
  CalendarDays,
  Package,
  Presentation,
  LifeBuoy,
  type LucideIcon,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import TopBar from "@/components/layout/TopBar";
import BlueBanner from "@/components/layout/BlueBanner";

import Logo from "@/components/brand/Logo";
// import AiChatWidget from "@/components/layout/AiChatWidget"; // re-enable when ANTHROPIC_API_KEY is set
import { useCurrentUser } from "@/hooks/useAuth";
import { useSystemBasics } from "@/hooks/useSystemBasics";

import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  type Location,
} from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useAuthStore } from "@/store/authStore";
import { PERMISSIONS, LEAVE_STAGE_PERMISSIONS } from "@/constants/permissions";
import { isSuperadmin } from "@/utils/permissions";

/* ------------------------------------------------------------------
 * Nav tree — Home is a direct leaf (no sub-items). Groups with
 * `children` expand when clicked.
 * ------------------------------------------------------------------ */

type NavChild = {
  to: string;
  label: string;
  permissions?: string[];
  roles?: string[];
  hideForRoles?: string[];
  /** Also show to anyone assigned a module (user.is_teaching), whatever their role. */
  showWhenTeaching?: boolean;
};
type NavNode = {
  id: string;
  label: string;
  icon: LucideIcon;
  to?: string;
  action?: string;
  permissions?: string[];
  /**
   * Restrict this node to a specific set of roles. Applied BEFORE the
   * superadmin permission bypass, so role-bound items (e.g. "My Application"
   * for `applicant` only) don't leak into other roles' sidebars.
   */
  roles?: string[];
  /**
   * Hide this node from a specific set of roles even when permissions would
   * normally allow it. Useful when a role technically holds an inherited perm
   * but the product decision is to keep that area out of their workflow
   * (e.g. hr_manager should not see Academics management).
   */
  hideForRoles?: string[];
  /**
   * Show this node to anyone assigned at least one module (`user.is_teaching`),
   * even if their role carries none of `permissions`. Teaching access follows
   * the assignment, not the role — a registrar who picks up a class still needs
   * the teaching workspace.
   */
  showWhenTeaching?: boolean;
  children?: NavChild[];
};

const NAV_TREE: NavNode[] = [
  { id: "home", label: "Home", icon: Home, to: "/" },
  {
    id: "campus-statistics",
    label: "Campus Statistics",
    icon: LayoutDashboard,
    action: "campus-statistics",
    permissions: [PERMISSIONS.VIEW_DASHBOARD],
    // Admin metrics only — hide from external portal roles.
    hideForRoles: ["student", "applicant"],
  },
  {
    id: "support-reporting",
    label: "Support & Reporting",
    icon: LayoutDashboard,
    action: "support-reporting",
    permissions: [PERMISSIONS.VIEW_DASHBOARD],
    // Admin metrics only — hide from external portal roles.
    hideForRoles: ["student", "applicant"],
  },
  {
    id: "student-profile",
    label: "Profile",
    icon: UserIcon,
    to: "/me/profile",
    // Role-scoped: enrolled students see "My Profile" wired to /api/students/me.
    roles: ["student"],
    permissions: [PERMISSIONS.ACCESS_STUDENT_PORTAL],
  },
  {
    id: "student-services",
    label: "Services",
    icon: Briefcase,
    to: "/services",
    // Role-scoped: enrolled students can browse and request services.
    roles: ["student"],
    permissions: [PERMISSIONS.ACCESS_STUDENT_PORTAL],
  },
  {
    id: "applicant-dashboard",
    label: "Applications",
    icon: LayoutDashboard,
    to: "/applicant",
    // Role-scoped: only self-registered applicants have their own application.
    // Admins/superadmins do NOT see this even if they hold the permission.
    roles: ["applicant"],
    permissions: [PERMISSIONS.ACCESS_APPLICANT_PORTAL],
  },
  {
    // Teacher workspace. Gated on ACCESS_TEACHER_PORTAL rather than
    // VIEW_MY_MODULES, because the `student` role holds VIEW_MY_MODULES too and
    // would otherwise see a teaching menu. Every page is additionally scoped
    // server-side to the lecturer's own module assignments.
    id: "my-teaching",
    label: "My Teaching",
    icon: Presentation,
    permissions: [PERMISSIONS.ACCESS_TEACHER_PORTAL],
    showWhenTeaching: true,
    children: [
      {
        to: "/teacher",
        label: "Dashboard",
        permissions: [PERMISSIONS.ACCESS_TEACHER_PORTAL],
        showWhenTeaching: true,
      },
      {
        to: "/teacher/courses",
        label: "My courses",
        permissions: [PERMISSIONS.ACCESS_TEACHER_PORTAL],
        showWhenTeaching: true,
      },
      {
        to: "/teacher/calendar",
        label: "My calendar",
        permissions: [PERMISSIONS.ACCESS_TEACHER_PORTAL],
        showWhenTeaching: true,
      },
      {
        to: "/teacher/exams",
        label: "My exams",
        permissions: [PERMISSIONS.ACCESS_TEACHER_PORTAL],
        showWhenTeaching: true,
      },
      {
        to: "/attendance",
        label: "Attendance",
        permissions: [PERMISSIONS.RECORD_ATTENDANCE, PERMISSIONS.VIEW_ATTENDANCE],
        showWhenTeaching: true,
      },
    ],
  },
  {
    // Self-service payslips — available to every staff account regardless of
    // HR permissions. Hidden from students/applicants (handled by their own
    // portals). Server scopes the data to the signed-in user's employee record.
    id: "my-payroll",
    label: "My Payroll",
    icon: Wallet,
    to: "/me/payroll",
    hideForRoles: ["student", "applicant"],
  },
  {
    // Self-service leave — any staff member with REQUEST_LEAVE can file and
    // track their own leave requests. Hidden from students/applicants.
    id: "my-leave",
    label: "My Leave",
    icon: CalendarDays,
    to: "/me/leave",
    permissions: [PERMISSIONS.REQUEST_LEAVE],
    hideForRoles: ["student", "applicant"],
  },
  {
    id: "students-group",
    label: "Students",
    icon: GraduationCap,
    // Visibility follows the PERMISSIONS below, never the role name. Teaching
    // staff reach their own courses through "My Teaching"; when they are also
    // granted the management permissions here — as a HOD normally is — this
    // section has to stay reachable. Hiding it by role name locked HODs out of
    // grants the Roles screen listed as assigned.
    permissions: [
      PERMISSIONS.VIEW_STUDENTS,
      PERMISSIONS.GENERATE_DOCUMENTS,
      PERMISSIONS.MANAGE_STUDENT_IDS,
    ],
    children: [
      {
        to: "/students",
        label: "All students",
        permissions: [PERMISSIONS.VIEW_STUDENTS],
      },
      {
        to: "/admin/international-students",
        label: "International students",
        permissions: [PERMISSIONS.VIEW_STUDENTS],
      },
      {
        to: "/students/id-cards",
        label: "ID cards",
        permissions: [
          PERMISSIONS.MANAGE_STUDENT_IDS,
          PERMISSIONS.VIEW_STUDENTS,
        ],
      },
      {
        to: "/documents/generate",
        label: "Generate Documents",
        permissions: [PERMISSIONS.GENERATE_DOCUMENTS],
      },
    ],
  },
  {
    id: "hr-management",
    label: "HR Management",
    icon: Briefcase,
    permissions: [
      PERMISSIONS.VIEW_HR_EMPLOYEES,
      PERMISSIONS.MANAGE_HR_EMPLOYEES,
      PERMISSIONS.VIEW_PAYROLL,
      PERMISSIONS.MANAGE_PAYROLL,
      PERMISSIONS.VIEW_APPRAISALS,
      PERMISSIONS.VIEW_LEAVE_REQUESTS,
      PERMISSIONS.MANAGE_LEAVE_REQUESTS,
      ...LEAVE_STAGE_PERMISSIONS,
    ],
    children: [
      {
        to: "/hr/staff",
        label: "All staff",
        permissions: [PERMISSIONS.VIEW_HR_EMPLOYEES],
      },
      {
        to: "/hr/payroll",
        label: "Payroll",
        permissions: [PERMISSIONS.VIEW_PAYROLL, PERMISSIONS.MANAGE_PAYROLL],
      },
      {
        to: "/hr/payments",
        label: "Salary",
        permissions: [PERMISSIONS.VIEW_PAYROLL, PERMISSIONS.MANAGE_PAYROLL],
      },
      {
        to: "/hr/leave",
        label: "Leave",
        permissions: [
          PERMISSIONS.VIEW_HR_EMPLOYEES,
          PERMISSIONS.VIEW_LEAVE_REQUESTS,
          PERMISSIONS.MANAGE_LEAVE_REQUESTS,
        ],
      },
      {
        to: "/hr/leave/approvals",
        label: "Leave Approvals",
        permissions: [
          ...LEAVE_STAGE_PERMISSIONS,
          PERMISSIONS.MANAGE_LEAVE_REQUESTS,
        ],
      },
      {
        to: "/hr/appraisals",
        label: "Appraisals",
        permissions: [PERMISSIONS.VIEW_APPRAISALS, PERMISSIONS.VIEW_HR_EMPLOYEES],
      },
      {
        to: "/hr/settings",
        label: "Payroll Settings",
        permissions: [PERMISSIONS.MANAGE_HR_EMPLOYEES],
      },
      {
        to: "/registrar/report",
        label: "Academic Reports",
        permissions: [PERMISSIONS.VIEW_HR_EMPLOYEES],
      },
      // { to: "/hr/attendance", label: "Attendance",         permissions: [PERMISSIONS.VIEW_HR_EMPLOYEES] },
      // { to: "/hr/documents",  label: "Documents",        permissions: [PERMISSIONS.VIEW_HR_EMPLOYEES] },

      { to: "/hr/monitoring", label: "Monitoring Dashboard", permissions: [PERMISSIONS.VIEW_HR_EMPLOYEES] },
    ],
  },
  // ─── Admissions / Student Management Module ───
  {
    id: "admissions",
    label: "Admissions",
    icon: Files,
    permissions: [
      PERMISSIONS.MANAGE_STUDENT_APPLICATIONS,
      PERMISSIONS.VERIFY_DOCUMENTS,
      PERMISSIONS.MANAGE_ADMISSIONS,
      PERMISSIONS.MANAGE_ADMISSION_REQUIREMENTS,
    ],
    children: [
      {
        to: "/admin/admissions/applications",
        label: "Applications",
        permissions: [PERMISSIONS.MANAGE_STUDENT_APPLICATIONS],
      },
      {
        to: "/admin/admissions/verifications",
        label: "Verifications",
        permissions: [PERMISSIONS.VERIFY_DOCUMENTS],
      },
      {
        to: "/admin/admissions/merit",
        label: "Merit lists",
        // /api/applications/merit is gated on the merit slugs, not on
        // MANAGE_ADMISSIONS — a merit officer needs this link.
        permissions: [
          PERMISSIONS.VIEW_MERIT_LIST,
          PERMISSIONS.MANAGE_MERIT_LIST,
          PERMISSIONS.MANAGE_ADMISSIONS,
        ],
      },
      {
        to: "/admin/admissions/offers",
        label: "Manage Offers & Letters",
        permissions: [PERMISSIONS.MANAGE_ADMISSIONS],
      },
      {
        to: "/admin/admissions/requirements",
        label: "Requirements",
        permissions: [PERMISSIONS.MANAGE_ADMISSION_REQUIREMENTS],
      },
      {
        to: "/admin/admissions/document-types",
        label: "Document types",
        permissions: [PERMISSIONS.MANAGE_ADMISSION_REQUIREMENTS],
      },
      {
        to: "/admin/admissions/student-documents",
        label: "Required student documents",
        permissions: [PERMISSIONS.MANAGE_ADMISSION_REQUIREMENTS],
      },
      {
        to: "/admin/admissions/intakes",
        label: "Intakes",
        permissions: [PERMISSIONS.MANAGE_ADMISSIONS],
      },
    ],
  },
  // ─── Modules Management Module ───
  {
    id: "modules",
    label: "Academics",
    icon: BookOpen,
    // Visibility follows the PERMISSIONS below, never the role name. Teaching
    // staff reach their own courses through "My Teaching"; when they are also
    // granted the management permissions here — as a HOD normally is — this
    // section has to stay reachable. Hiding it by role name locked HODs out of
    // grants the Roles screen listed as assigned.
    permissions: [
      PERMISSIONS.MANAGE_MODULES,
      PERMISSIONS.MANAGE_MODULE_SCHEDULES,
      PERMISSIONS.MANAGE_MODULE_ASSIGNMENTS,
      PERMISSIONS.MANAGE_MODULE_REGISTRATIONS,
      PERMISSIONS.VIEW_MY_MODULES,
      PERMISSIONS.VIEW_MODULE_MARKS,
      PERMISSIONS.RECORD_MODULE_MARKS,
      PERMISSIONS.MANAGE_MODULE_MARKS,
      PERMISSIONS.MANAGE_ACADEMIC_YEARS,
      PERMISSIONS.MANAGE_ACADEMIC_TERMS,
      PERMISSIONS.VIEW_TIMETABLE,
      PERMISSIONS.MANAGE_TIMETABLE,
    ],
    children: [
      // Student self-service — opens the same Program & Marks view that
      // lives under /me/profile so the curriculum, registration state and
      // marks are presented identically across both entry points. Hidden
      // from non-students; teachers get the assignment-driven view below.
      {
        to: "/me/profile?tab=curriculum",
        label: "My modules",
        roles: ["student"],
        permissions: [PERMISSIONS.ACCESS_STUDENT_PORTAL],
      },
      // Teacher / staff self-service — modules the user is assigned to
      // teach. Skipped for students since they have the curriculum view
      // above; admin/superadmin already see the full management children.
      {
        to: "/my-modules?tab=mine",
        label: "My modules",
        permissions: [PERMISSIONS.VIEW_MY_MODULES],
        hideForRoles: ["student", "superadmin", "admin"],
      },
      {
        to: "/academic/settings?tab=faculties",
        label: "Faculties",
        permissions: [
          PERMISSIONS.MANAGE_ACADEMICS,
        ],
        hideForRoles: ["student", "applicant"],
      },
      {
        to: "/academic/settings?tab=departments",
        label: "Departments",
        permissions: [
          PERMISSIONS.MANAGE_DEPARTMENTS,
        ],
        hideForRoles: ["student", "applicant"],
      },
      {
        to: "/academic/settings?tab=options",
        label: "Programs",
        permissions: [
          PERMISSIONS.MANAGE_OPTIONS,
        ],
        hideForRoles: ["student", "applicant"],
      },
      {
        to: "/academic/settings?tab=modules",
        label: "Modules / Courses",
        permissions: [
          PERMISSIONS.MANAGE_MODULES,
        ],
        hideForRoles: ["student", "applicant"],
      },
      {
        to: "/academic/settings?tab=scheduling",
        label: "Scheduling",
        permissions: [
          PERMISSIONS.MANAGE_MODULE_SCHEDULES,
        ],
        hideForRoles: ["student", "applicant"],
      },
      {
        to: "/timetable",
        label: "Timetable",
        permissions: [
          PERMISSIONS.VIEW_TIMETABLE,
          PERMISSIONS.MANAGE_TIMETABLE,
        ],
        hideForRoles: ["applicant"],
      },
      {
        to: "/academic/settings?tab=registrations",
        label: "Registrations",
        permissions: [
          PERMISSIONS.MANAGE_MODULE_REGISTRATIONS,
        ],
        hideForRoles: ["student", "applicant"],
      },
      {
        to: "/academic/settings?tab=years-terms",
        label: "Years & terms",
        permissions: [
          PERMISSIONS.MANAGE_ACADEMIC_YEARS,
          PERMISSIONS.MANAGE_ACADEMIC_TERMS,
        ],
        hideForRoles: ["student", "applicant"],
      },
      {
        to: "/registrar/report",
        label: "Academic Reports",
        permissions: [PERMISSIONS.MANAGE_ACADEMICS],
      },
    ],
  },
  // Academic Records — the whole marks lifecycle in one place: record marks →
  // review them → deliberate → revaluate → graduate → issue transcripts and
  // certificates. These pages all existed before; they were split across the
  // Exam menu and the flat ADMINISTRATION list, and the mark-entry grid
  // (/modules/marks) was routed but reachable only by typing the URL.
  //
  // Hidden from teaching roles for the same reason the Exam menu is: a
  // lecturer reaches their own mark sheets through My Teaching, scoped to
  // their courses. Presentational only — the underlying permissions stay
  // granted, so this hides the duplicate entry point without disabling
  // anything. Each child keeps the exact permissions it carried before the
  // move, so no one gains or loses access.
  {
    id: "academic-records",
    label: "Academic Records",
    icon: ScrollText,
    hideForRoles: ["student", "applicant"],
    permissions: [
      PERMISSIONS.RECORD_MODULE_MARKS,
      PERMISSIONS.MANAGE_MODULE_MARKS,
      PERMISSIONS.VIEW_MODULE_MARKS,
      PERMISSIONS.MANAGE_EXAMS,
      PERMISSIONS.MANAGE_REVALUATIONS,
      PERMISSIONS.VIEW_GRADUANDS,
      PERMISSIONS.MANAGE_GRADUANDS,
      PERMISSIONS.MANAGE_TRANSCRIPT_REQUESTS,
      PERMISSIONS.MANAGE_ACADEMIC_CERTIFICATES,
      PERMISSIONS.MANAGE_GRADING_SCALES,
      PERMISSIONS.VIEW_ACADEMIC_ANALYTICS,
      PERMISSIONS.MANAGE_ACADEMIC_SETTINGS,
    ],
    children: [
      {
        to: "/modules/marks",
        label: "Record marks",
        permissions: [
          PERMISSIONS.RECORD_MODULE_MARKS,
          PERMISSIONS.MANAGE_MODULE_MARKS,
        ],
      },
      {
        to: "/exams/results",
        label: "All marks",
        permissions: [PERMISSIONS.MANAGE_EXAMS],
      },
      {
        to: "/exams/deliberation",
        label: "Deliberation",
        // routes/api/deliberation.php accepts MANAGE_DELIBERATIONS for reads
        // and requires it for session writes; MANAGE_EXAMS stays alongside it
        // so nobody who could reach this page before loses it.
        permissions: [
          PERMISSIONS.MANAGE_DELIBERATIONS,
          PERMISSIONS.MANAGE_EXAMS,
        ],
      },
      {
        to: "/exams/revaluations",
        label: "Revaluations",
        permissions: [PERMISSIONS.MANAGE_REVALUATIONS],
      },
      {
        to: "/academic/graduands",
        label: "Graduand list",
        permissions: [
          PERMISSIONS.VIEW_GRADUANDS,
          PERMISSIONS.MANAGE_GRADUANDS,
        ],
      },
      {
        to: "/academic/transcript-requests",
        label: "Transcripts",
        permissions: [PERMISSIONS.MANAGE_TRANSCRIPT_REQUESTS],
      },
      {
        to: "/academic/certificates",
        label: "Certificates",
        permissions: [PERMISSIONS.MANAGE_ACADEMIC_CERTIFICATES],
      },
      {
        // The institution-wide scale: bulk-saves every band at once and can
        // reset to CUR's standard five-band scale. Preferred over the old
        // /exams/grading-scale page, whose per-band delete could leave a
        // percentage gap that GradingScaleModel::gradePointFor() can't match.
        to: "/academic/grading-scale",
        label: "Grading scale & GPA",
        permissions: [
          PERMISSIONS.MANAGE_GRADING_SCALES,
          PERMISSIONS.VIEW_SYSTEM_BASICS,
        ],
      },
      {
        // Which modules each programme's transcript prints. Modules nobody has
        // ruled on follow the curriculum, so this only ever narrows or widens
        // a programme deliberately.
        to: "/academic/transcript-modules",
        label: "Transcript modules",
        permissions: [
          PERMISSIONS.MANAGE_MODULE_MARKS,
          PERMISSIONS.MANAGE_ACADEMICS,
        ],
      },
      {
        to: "/academic/analytics",
        label: "Reports & analytics",
        permissions: [PERMISSIONS.VIEW_ACADEMIC_ANALYTICS],
      },
      {
        // Institutional documents (fee structures, policies). Uploading and
        // deleting is what MANAGE_ACADEMIC_SETTINGS guards; before this the
        // page had no entry point anywhere outside the Finance hub.
        to: "/academic/system-documents",
        label: "System documents",
        permissions: [
          PERMISSIONS.MANAGE_ACADEMIC_SETTINGS,
          PERMISSIONS.VIEW_SYSTEM_BASICS,
        ],
      },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    icon: CreditCard,
    permissions: [
      PERMISSIONS.VIEW_FINANCE,
      PERMISSIONS.MANAGE_FINANCE,
      PERMISSIONS.VIEW_FINANCE_OVERVIEW,
      PERMISSIONS.VIEW_FINANCE_BILLING,
      PERMISSIONS.VIEW_FINANCE_REPORTS,
      PERMISSIONS.VIEW_FINANCE_STRUCTURES,
      PERMISSIONS.VIEW_FINANCE_BURSARIES,
      PERMISSIONS.VIEW_FINANCE_APPROVALS,
      PERMISSIONS.VIEW_FINANCE_SPONSORS,
      PERMISSIONS.VIEW_FINANCE_EXPENSES,
      PERMISSIONS.VIEW_FINANCE_REFUNDS,
      PERMISSIONS.VIEW_FINANCE_BALANCE,
      PERMISSIONS.VIEW_FINANCE_CLEARANCE,
      PERMISSIONS.VIEW_STUDENT_DIRECTORY_FINANCE,
      PERMISSIONS.VIEW_ONLINE_PAYMENTS_HISTORY,
      PERMISSIONS.VIEW_MOBILE_PAYMENTS,
      PERMISSIONS.VIEW_PAYMENT_CALENDAR,
      PERMISSIONS.MANAGE_PAYMENT_CALENDAR,
      PERMISSIONS.VIEW_BUDGET_EXECUTION,
      PERMISSIONS.MANAGE_BUDGET_EXECUTION,
      PERMISSIONS.VIEW_FINES,
      PERMISSIONS.MANAGE_FINES,
    ],
    hideForRoles: ["student", "applicant"],
    children: [
      {
        to: "/finance",
        label: "Overview",
        permissions: [PERMISSIONS.VIEW_FINANCE_OVERVIEW],
      },
      {
        to: "/finance/billing",
        label: "Billing",
        permissions: [PERMISSIONS.VIEW_FINANCE_BILLING],
      },
      {
        to: "/finance/structures",
        label: "Fee Rates",
        permissions: [PERMISSIONS.VIEW_FINANCE_STRUCTURES],
      },
      {
        to: "/finance/bursaries",
        label: "Bursaries",
        permissions: [PERMISSIONS.VIEW_FINANCE_BURSARIES],
      },
      {
        to: "/finance/reports",
        label: "Reports",
        permissions: [PERMISSIONS.VIEW_FINANCE_REPORTS],
      },
      {
        to: "/finance/fines",
        label: "Fines",
        permissions: [PERMISSIONS.VIEW_FINES, PERMISSIONS.MANAGE_FINES],
      },
      {
        to: "/finance/overdue-alerts",
        label: "Overdue Alerts",
        permissions: [PERMISSIONS.SEND_FEE_ALERTS, PERMISSIONS.MANAGE_FINANCE],
      },
      {
        to: "/registrar/report",
        label: "Academic Reports",
        permissions: [PERMISSIONS.VIEW_FINANCE],
      },
    ],
  },
  // Staff / teachers / admins — full attendance workspace (record + review).
  // Hidden from the student role even when their permissions would allow
  // it, since the student-only entry below points them at their personal
  // attendance summary on the profile page instead.
  {
    id: "attendance",
    label: "Attendance",
    icon: ClipboardCheck,
    to: "/attendance",
    // Lecturers reach their own course attendance through My Teaching; the
    // full workspace stays open to whoever actually holds these permissions.
    hideForRoles: ["student"],
    permissions: [
      PERMISSIONS.VIEW_ATTENDANCE,
      PERMISSIONS.RECORD_ATTENDANCE,
      PERMISSIONS.MANAGE_ATTENDANCE,
    ],
  },
  // Student self-service — opens the same attendance summary that lives
  // under /me/profile, so the student sees only their own per-module
  // attendance numbers without admin/teacher controls.
  {
    id: "student-finance",
    label: "My Finance",
    icon: CreditCard,
    to: "/my-finance",
    roles: ["student"],
    permissions: [PERMISSIONS.ACCESS_STUDENT_PORTAL, PERMISSIONS.MY_INVOICE],
  },
  // Student self-service — submit/track service requests (transcripts,
  // enrollment letters, etc.) and pay/download once approved.
  {
    id: "my-service-requests",
    label: "My Service Requests",
    icon: Package,
    to: "/my/service-requests",
    roles: ["student"],
    permissions: [PERMISSIONS.ACCESS_STUDENT_PORTAL, PERMISSIONS.SUBMIT_SERVICE_REQUEST],
  },
  {
    id: "attendance-student",
    label: "Attendance",
    icon: ClipboardCheck,
    to: "/me/profile?tab=attendance",
    roles: ["student"],
    permissions: [PERMISSIONS.ACCESS_STUDENT_PORTAL],
  },
  {
    id: "exam",
    label: "Exam",
    icon: ClipboardList,
    // Visibility follows the PERMISSIONS below, never the role name. Teaching
    // staff reach their own courses through "My Teaching"; when they are also
    // granted the management permissions here — as a HOD normally is — this
    // section has to stay reachable. Hiding it by role name locked HODs out of
    // grants the Roles screen listed as assigned.

    // Visible to admins/staff with MANAGE_EXAMS *or* to students who hold
    // VIEW_MY_MODULES (so they can see their personal exams + results).
    permissions: [
      PERMISSIONS.VIEW_EXAMS,
      PERMISSIONS.MANAGE_EXAMS,
      PERMISSIONS.VIEW_MY_MODULES,
    ],
    children: [
      // Admin / staff items — gated by MANAGE_EXAMS.
      {
        to: "/exams",
        label: "Exam schedules",
        // VIEW_EXAMS is the read tier the exam GET endpoints now accept.
        permissions: [
          PERMISSIONS.VIEW_EXAMS,
          PERMISSIONS.MANAGE_EXAMS,
          PERMISSIONS.MANAGE_MODULE_SCHEDULES,
        ],
      },
      // Results, Deliberation, Revaluations and the grading scale moved to the
      // Academic Records menu — this one now covers exam sittings only.
      // Student self-service — gated by VIEW_MY_MODULES, hidden from admins
      // who already have the admin views above.
      {
        to: "/my-modules?tab=exams",
        label: "My exams",
        permissions: [PERMISSIONS.VIEW_MY_MODULES],
        hideForRoles: ["superadmin", "admin"],
      },
      {
        to: "/my-modules?tab=marks",
        label: "My results",
        permissions: [PERMISSIONS.VIEW_MY_MODULES],
        hideForRoles: ["superadmin", "admin"],
      },
    ],
  },
];

const ADMIN_TREE: NavNode[] = [
  {
    id: "users",
    label: "Users",
    icon: UserIcon,
    to: "/users",
    permissions: [PERMISSIONS.MANAGE_USERS],
  },
  {
    id: "roles",
    label: "Roles",
    icon: ShieldCheck,
    to: "/roles",
    permissions: [PERMISSIONS.MANAGE_ROLES],
  },
  {
    id: "permissions",
    label: "Permissions",
    icon: Settings,
    to: "/permissions",
    permissions: [PERMISSIONS.MANAGE_PERMISSIONS],
  },
  {
    id: "services",
    label: "Services",
    icon: Package,
    permissions: [
      PERMISSIONS.MANAGE_SERVICE_CATALOG,
      PERMISSIONS.APPROVE_SERVICE_REQUEST_L1,
      PERMISSIONS.APPROVE_SERVICE_REQUEST_L2,
      PERMISSIONS.APPROVE_SERVICE_REQUEST_FINAL,
      PERMISSIONS.VIEW_SERVICE_REQUESTS,
    ],
    children: [
      {
        to: "/admin/service-catalog",
        label: "Service Catalog",
        permissions: [PERMISSIONS.MANAGE_SERVICE_CATALOG],
      },
      {
        to: "/service-requests/queue",
        label: "Service Requests Approval",
        permissions: [
          PERMISSIONS.APPROVE_SERVICE_REQUEST_L1,
          PERMISSIONS.APPROVE_SERVICE_REQUEST_L2,
          PERMISSIONS.APPROVE_SERVICE_REQUEST_FINAL,
        ],
      },
      {
        to: "/service-requests/reports",
        label: "Reports & Dashboard",
        permissions: [PERMISSIONS.VIEW_SERVICE_REQUESTS],
      },
    ],
  },
  {
    id: "system-settings",
    label: "System settings",
    icon: Settings,
    to: "/settings",
    hideForRoles: ["student", "applicant"],
    permissions: [PERMISSIONS.VIEW_SETTINGS, PERMISSIONS.MANAGE_SETTINGS],
  },
  {
    id: "academics-management",
    label: "Settings",
    icon: Layers,
    to: "/academic/management",
    permissions: [
      PERMISSIONS.MANAGE_ACADEMICS,
      PERMISSIONS.MANAGE_DEGREES,
      PERMISSIONS.MANAGE_FACILITIES,
      PERMISSIONS.MANAGE_DEPARTMENTS,
      PERMISSIONS.MANAGE_OPTIONS,
      PERMISSIONS.MANAGE_LEVELS,
      PERMISSIONS.MANAGE_SCHOOLS,
      PERMISSIONS.MANAGE_LEAVE_TYPES,
      PERMISSIONS.MANAGE_CAMPUSES,
      PERMISSIONS.MANAGE_ADMISSIONS,
      PERMISSIONS.MANAGE_ACADEMIC_YEARS,
      PERMISSIONS.MANAGE_ACADEMIC_TERMS,
    ],
  },
  // Grading Scale, Transcript Requests, Graduand Management, Academic
  // Certificates and Academic Analytics moved to the Academic Records menu in
  // the main tree, where they sit alongside the marks they depend on.
  {
    id: "gate-management",
    label: "Gate Management",
    icon: ScanLine,
    to: "/gate",
    hideForRoles: ["student", "applicant"],
    permissions: [
      PERMISSIONS.ACCESS_GATE,
      PERMISSIONS.MANAGE_GATE,
      PERMISSIONS.VIEW_GATE_LOGS,
    ],
  },
  {
    id: "messages",
    label: "Messages",
    icon: MessageSquare,
    to: "/messages",
    permissions: [PERMISSIONS.SEND_MESSAGES],
  },
  {
    id: "announcements",
    label: "Announcements",
    icon: Megaphone,
    to: "/announcements",
    permissions: [PERMISSIONS.VIEW_ANNOUNCEMENTS],
  },
  {
    id: "forums",
    label: "Forums",
    icon: MessagesSquare,
    to: "/forums",
    permissions: [PERMISSIONS.VIEW_FORUMS],
  },
  {
    id: "logs",
    label: "System logs",
    icon: Activity,
    to: "/logs",
    permissions: [PERMISSIONS.VIEW_SYSTEM_LOGS],
  },
  // Help Centre — no `permissions`, so it survives every role filter. A user
  // who cannot reach the guides is exactly the user who needs them.
  {
    id: "help",
    label: "Help & Guides",
    icon: LifeBuoy,
    to: "/help",
  },
];

const ROUTE_TITLES: Record<string, { title: string; sub?: string }> = {
  "/messages": { title: "Messages", sub: "Internal communications" },
  "/announcements": { title: "Announcements", sub: "Exam schedules, results, holidays and notices" },
  "/exams/grading-scale": { title: "Grading scale & GPA", sub: "Configure grade bands and grade points" },
  "/exams/revaluations": { title: "Revaluation requests", sub: "Review and process result re-marks" },
  "/forums": { title: "Discussion forums", sub: "Community discussions" },
  "/": {
    title: "Admin Dashboard",
    sub: "Welcome back to Catholic University of Rwanda",
  },
  "/users": {
    title: "User management",
    sub: "Staff, faculty and student accounts",
  },
  "/roles": { title: "Roles", sub: "Who can do what in the system" },
  "/permissions": { title: "Permissions", sub: "Fine-grained access control" },
  "/admin/service-catalog": {
    title: "Service Catalog",
    sub: "Configure public services and their approval stages",
  },
  "/service-requests/queue": {
    title: "Service Request Approvals",
    sub: "Requests awaiting a decision at your approval stage",
  },
  "/service-requests/reports": {
    title: "Service Requests Report",
    sub: "Volume, approval bottlenecks, revenue, and turnaround across all services",
  },
  "/my/service-requests": {
    title: "My Service Requests",
    sub: "Track your submitted service requests",
  },
  "/logs": { title: "System logs", sub: "Audit trail across the platform" },
  "/help": {
    title: "Help Centre",
    sub: "Step-by-step guides for every module",
  },
  "/help/search": { title: "Help Centre", sub: "Search the guides" },
  "/help/glossary": {
    title: "Glossary",
    sub: "Every word the system uses, explained",
  },
  "/gate": { title: "Gate Management", sub: "Student access verification — payment & registration" },
  "/students": {
    title: "Students",
    sub: "CUR student registry",
  },
  "/academic/settings": {
    title: "Academic settings",
    sub: "Faculties, departments, programs, modules and academic years/terms",
  },
  "/academic/management": {
    title: "Settings",
    sub: "Schools, degrees, facilities, levels, leave types, campuses and intakes",
  },
  "/academic/grading-scale": {
    title: "Grading Scale",
    sub: "Configure percentage bands and GPA points for the institution",
  },
  "/academic/transcript-modules": {
    title: "Transcript Modules",
    sub: "Choose which modules each programme's transcript prints",
  },
  "/academic/transcript-requests": {
    title: "Transcript Requests",
    sub: "Review and dispatch student official transcript requests",
  },
  "/academic/graduands": {
    title: "Graduand Management",
    sub: "Graduation eligibility, degree classification and ceremony management",
  },
  "/academic/certificates": {
    title: "Academic Certificates",
    sub: "Issue, track and dispatch degrees, diplomas and certificates",
  },
  "/academic/analytics": {
    title: "Reports & Analytics",
    sub: "Pass rates, grade distribution and progression trends",
  },

  "/admin/admissions": {
    title: "Admissions",
    sub: "Student Management Module",
  },
  "/admin/admissions/applications": {
    title: "Applications",
    sub: "All prospective student applications",
  },
  "/admin/admissions/verifications": {
    title: "Verifications",
    sub: "Documents awaiting review",
  },
  "/admin/admissions/merit": {
    title: "Merit lists",
    sub: "Configure scoring, generate and publish merit lists",
  },
  "/admin/admissions/offers": {
    title: "Offers",
    sub: "Admission offers + enrollment initiation",
  },
  "/admin/admissions/requirements": {
    title: "Requirements",
    sub: "Per-faculty, per-year document checklist",
  },
  "/admin/admissions/document-types": {
    title: "Document types",
    sub: "Catalogue of possible admission documents",
  },
  "/admin/admissions/student-documents": {
    title: "Required student documents",
    sub: "Checklist per programme category — drives the student Documents tab",
  },

  "/applicant": {
    title: "My Applications",
    sub: "Track your progress and respond to offers.",
  },
  "/applicant/records": {
    title: "Academic Records",
    sub: "Your high school and university transcripts.",
  },
  "/applicant/documents": {
    title: "Documents",
    sub: "Upload required files for your checklist.",
  },
  "/students/new": { title: "Admissions", sub: "New student applications" },
  "/hr/staff": {
    title: "HR Management",
    sub: "Staff directory, roles and contracts",
  },
  "/hr/payroll": {
    title: "Payroll",
    sub: "Monthly salary breakdown and payslips",
  },
  "/me/payroll": {
    title: "My Payroll",
    sub: "Your personal payslip history and salary breakdown",
  },
  "/me/leave": {
    title: "My Leave",
    sub: "Request leave and track your own requests",
  },
  "/notifications": {
    title: "Notifications",
    sub: "Approval outcomes, action-required prompts and system alerts",
  },
  "/teacher": {
    title: "My Teaching",
    sub: "Your courses, students, timetable and records",
  },
  "/teacher/courses": {
    title: "My Courses",
    sub: "Modules you are assigned to teach",
  },
  "/teacher/students": {
    title: "My Students",
    sub: "Everyone registered on a module you teach",
  },
  "/teacher/calendar": {
    title: "My Calendar",
    sub: "Your classes, exam sittings and approved leave",
  },
  "/teacher/exams": {
    title: "My Exams",
    sub: "Exam rooms, candidates and attendance",
  },
  "/hr/payments": {
    title: "Salary Payments",
    sub: "Disbursement history and payment records",
  },
  "/hr/leave": {
    title: "Leave Management",
    sub: "Leave requests, approvals and balances",
  },
  "/hr/leave/approvals": {
    title: "Leave Approvals",
    sub: "Requests waiting at a stage you are authorised to decide",
  },
  "/hr/appraisals": {
    title: "Employee Appraisals",
    sub: "Performance appraisal cycles, KPIs and staff reviews",
  },
  "/hr/attendance": {
    title: "Staff attendance",
    sub: "Daily attendance and timesheets",
  },
  "/hr/documents": {
    title: "Staff documents",
    sub: "Contracts, IDs and HR files",
  },
  "/hr/settings": {
    title: "Payroll Settings",
    sub: "Deduction rates and custom payroll items",
  },
  "/teachers": { title: "Teachers", sub: "Lecturers and faculty members" },
  "/teachers/schedules": {
    title: "Teacher schedules",
    sub: "Weekly teaching assignments",
  },
  "/programs": { title: "Programs", sub: "Academic programs & curriculum" },
  "/finance": { title: "Finance", sub: "Fees, payments and billing" },
  "/finance/billing": {
    title: "Billing",
    sub: "Student ledger and invoice management",
  },
  "/finance/structures": {
    title: "Fee Rates",
    sub: "Configure fee amounts per type, year and department",
  },
  "/finance/bursaries": {
    title: "Bursaries",
    sub: "Scholarship and bursary allocations",
  },
  "/finance/reports": {
    title: "Revenue",
    sub: "Fee collection breakdown by category",
  },
  "/account/salaries": { title: "Salaries", sub: "Staff payroll" },
  "/exams": {
    title: "Exam schedules",
    sub: "Plan, edit and view scheduled exam sessions",
  },
  "/exams/results": {
    title: "Exam results",
    sub: "Record and review marks per module and term",
  },
  "/exams/deliberation": {
    title: "Deliberation",
    sub: "Per-program grid of every active student × every module",
  },
  "/library": { title: "Library", sub: "Books and digital resources" },
  "/class": { title: "Classes", sub: "Class schedules and rooms" },
  "/attendance": {
    title: "Attendance",
    sub: "Record and review student attendance by module and session",
  },
  "/notice": { title: "Notice board", sub: "Announcements and circulars" },
  "/transport": { title: "Transport", sub: "Routes and vehicles" },
  "/hostel": { title: "Hostel", sub: "Accommodation management" },

  // Modules Management Module
  "/modules": {
    title: "Modules",
    sub: "Module catalog, scheduling, assignments & registrations",
  },
  "/modules/catalog": {
    title: "Module Catalog",
    sub: "Browse and manage course modules",
  },
  "/modules/scheduling": {
    title: "Module Scheduling",
    sub: "Timetable entries and conflict detection",
  },
  "/modules/assignments": {
    title: "Module Assignments",
    sub: "Faculty-to-module assignments and workload",
  },
  "/modules/registrations": {
    title: "Module Registrations",
    sub: "Admin view of student module registrations",
  },
  "/modules/marks": {
    title: "Module Marks",
    sub: "Record CAT, partial and final exam marks per module",
  },
  "/my-modules": {
    title: "My Modules",
    sub: "Register for modules and track your courses",
  },
};

const STORAGE_KEY = "cur-mis-sidebar-collapsed";

/**
 * Match a child link's `to` (which may carry a query string, e.g.
 * `/academic/settings?tab=faculties`) against the current router location.
 * Path must match exactly, and every query param declared on the child must
 * appear with the same value on the current URL — extra params on the URL
 * (e.g. filters, page) don't break the match.
 */
function childMatchesLocation(
  childTo: string,
  location: Pick<Location, "pathname" | "search">,
): boolean {
  return entryMatchSpecificity(childTo, location) > 0;
}

/**
 * Returns 0 when `to` doesn't match the current location, otherwise a
 * positive number whose magnitude reflects how *specific* the match is.
 *
 *   • Pathname-only entry (no query in `to`): 1
 *   • Pathname + N query params, each present on the URL with the same
 *     value: 2 + N
 *
 * The runtime keeps the single highest-specificity match active, so an
 * entry like `/me/profile?tab=curriculum` correctly outranks the bare
 * `/me/profile` leaf when both could otherwise claim the active state.
 */
function entryMatchSpecificity(
  to: string,
  location: Pick<Location, "pathname" | "search">,
): number {
  const [path, query = ""] = to.split("?");
  if (location.pathname !== path) return 0;
  if (!query) return 1;
  const want = new URLSearchParams(query);
  const have = new URLSearchParams(location.search);
  let matched = 0;
  for (const [k, v] of want) {
    if (have.get(k) !== v) return 0;
    matched++;
  }
  return 2 + matched;
}

/**
 * Walks both nav trees and returns the `to` URL of the most specific entry
 * that currently matches the location. Drives the sidebar's active state
 * so only that one entry lights up, even when less-specific entries (e.g.
 * a parent leaf vs. a deep-linked child) also pathname-match.
 */
function findActiveEntry(
  trees: readonly (readonly NavNode[])[],
  location: Pick<Location, "pathname" | "search">,
): string | null {
  let bestUrl: string | null = null;
  let bestSpec = 0;
  for (const tree of trees) {
    for (const node of tree) {
      if (node.to) {
        const spec = entryMatchSpecificity(node.to, location);
        if (spec > bestSpec) {
          bestSpec = spec;
          bestUrl = node.to;
        }
      }
      if (node.children) {
        for (const c of node.children) {
          const spec = entryMatchSpecificity(c.to, location);
          if (spec > bestSpec) {
            bestSpec = spec;
            bestUrl = c.to;
          }
        }
      }
    }
  }
  return bestUrl;
}

/* ------------------------------------------------------------------ */

export default function MainLayout() {
  const location = useLocation();
  // Fetch /auth/me once on mount — keeps the Zustand user (role, permissions)
  // in sync with the server. The hook syncs the response back via setUser.
  useCurrentUser();
  // Fetch /system/basics once — active academic year / term become globally
  // available via useSystemStore.
  useSystemBasics();

  // Resolve a single active entry across the whole tree so only one
  // sidebar link highlights at a time — without this, deep-linked
  // children (e.g. /me/profile?tab=curriculum) would light up alongside
  // the broader parent leaf (/me/profile) since both pathname-match.
  const activeUrl = useMemo(
    () => findActiveEntry([NAV_TREE, ADMIN_TREE], location),
    [location.pathname, location.search],
  );

  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile drawer
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [query, setQuery] = useState("");
  const [scrolled, setScrolled] = useState(false);
  const [campusStatisticsOpen, setCampusStatisticsOpen] = useState(false);
  const [supportReportingOpen, setSupportReportingOpen] = useState(false);

  const initiallyOpen = useMemo<Set<string>>(() => {
    const set = new Set<string>();
    for (const node of [...NAV_TREE, ...ADMIN_TREE]) {
      if (node.children?.some((c) => childMatchesLocation(c.to, location)))
        set.add(node.id);
    }
    return set;
  }, []);  

  const [openIds, setOpenIds] = useState<Set<string>>(initiallyOpen);

  // If navigating to a child route, keep its parent expanded
  useEffect(() => {
    setOpenIds((prev) => {
      for (const node of [...NAV_TREE, ...ADMIN_TREE]) {
        if (
          node.children?.some((c) => childMatchesLocation(c.to, location)) &&
          !prev.has(node.id)
        ) {
          const next = new Set(prev);
          next.add(node.id);
          return next;
        }
      }
      return prev;
    });
  }, [location.pathname, location.search]);

  // Close mobile drawer on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Persist collapse state
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    } catch { /* ignore */ }
  }, [collapsed]);

  const toggleGroup = useCallback((id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleCollapse = useCallback(() => setCollapsed((v) => !v), []);
  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const onQuery = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value),
    [],
  );

  const { user } = useAuthStore();

  const hasAccess = useCallback(
    (perms?: string[]) => {
      if (!perms || perms.length === 0) return true;
      if (isSuperadmin(user)) return true;
      return perms.some((p) => (user?.permissions || []).includes(p));
    },
    [user],
  );

  /**
   * Role gate — applied BEFORE `hasAccess`, so role-bound items like
   * "My Application" (applicant-only) are hidden from every other role,
   * including superadmin, regardless of what permissions they hold.
   */
  const matchesRoles = useCallback(
    (roles?: string[]) => {
      if (!roles || roles.length === 0) return true;
      return roles.includes(user?.role ?? "");
    },
    [user],
  );

  const isVisible = useCallback(
    (node: {
      roles?: string[];
      permissions?: string[];
      hideForRoles?: string[];
      showWhenTeaching?: boolean;
    }) => {
      if (node.hideForRoles?.includes(user?.role ?? "")) return false;
      if (node.showWhenTeaching && user?.is_teaching) return matchesRoles(node.roles);
      return matchesRoles(node.roles) && hasAccess(node.permissions);
    },
    [matchesRoles, hasAccess, user],
  );

  const filtered = useMemo<NavNode[]>(() => {
    const q = query.trim().toLowerCase();
    const isApplicant = user?.role === "applicant";
    const applicantNavIds = new Set(["home", "applicant-dashboard"]);

    const filterTree = (tree: NavNode[]) => {
      return tree
        .filter((n) => isVisible(n))
        .filter((n) => !isApplicant || applicantNavIds.has(n.id))
        .map((n) => {
          // If node has children, filter them by role + permissions first
          let filteredChildren = n.children?.filter((c) => isVisible(c));

          // Then filter by search query if exists
          if (q) {
            const matchesParent = n.label.toLowerCase().includes(q);
            const matchingChildren = filteredChildren?.filter((c) =>
              c.label.toLowerCase().includes(q),
            );

            if (
              !matchesParent &&
              (!matchingChildren || matchingChildren.length === 0)
            ) {
              return null;
            }
            if (matchingChildren) {
              filteredChildren = matchingChildren;
            }
          }

          return { ...n, children: filteredChildren };
        })
        .filter(Boolean) as NavNode[];
    };

    return filterTree(NAV_TREE);
  }, [query, hasAccess, user]);

  const filteredAdmin = useMemo<NavNode[]>(() => {
    const q = query.trim().toLowerCase();
    const isApplicant = user?.role === "applicant";

    const filterTree = (tree: NavNode[]) => {
      if (isApplicant) return [];
      return tree
        .filter((n) => hasAccess(n.permissions))
        .map((n) => {
          // If node has children, filter them by permissions first
          let filteredChildren = n.children?.filter((c) =>
            hasAccess(c.permissions),
          );

          // Then filter by search query if exists
          if (q) {
            const matchesParent = n.label.toLowerCase().includes(q);
            const matchingChildren = filteredChildren?.filter((c) =>
              c.label.toLowerCase().includes(q),
            );

            if (
              !matchesParent &&
              (!matchingChildren || matchingChildren.length === 0)
            ) {
              return null;
            }
            if (matchingChildren) {
              filteredChildren = matchingChildren;
            }
          }

          return { ...n, children: filteredChildren };
        })
        .filter(Boolean) as NavNode[];
    };

    return filterTree(ADMIN_TREE);
  }, [query, hasAccess, user]);

  const headerMeta = ROUTE_TITLES[location.pathname] ?? { title: "CUR-MIS" };
  const sidebarWidth = collapsed ? 72 : 240;

  return (
    <div className="h-screen flex flex-col bg-[rgb(var(--bg-app))] text-ink-800 dark:text-ink-100 overflow-hidden">
      {/* Blue banner */}
      <BlueBanner />

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
      {/* ───────────────────────── Sidebar ───────────────────────── */}
      <aside
        style={{ width: sidebarWidth }}
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen shrink-0 bg-white dark:bg-ink-800 border-r border-ink-100 dark:border-ink-700
          transition-[width,transform] duration-300 ease-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
          flex flex-col`}
      >
        {/* Logo header */}
        <div
          className={`h-16 flex items-center justify-between border-b border-ink-100 dark:border-ink-700 shrink-0 ${collapsed ? "px-3" : "px-5"}`}
        >
          {collapsed ? (
            <Logo to="/" size="sm" showText={false} />
          ) : (
            <Logo to="/" size="md" />
          )}
          <button
            onClick={closeSidebar}
            className="lg:hidden icon-btn"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Sidebar search (hidden when collapsed) */}
        {!collapsed && (
          <div className="px-4 pt-4 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={onQuery}
                placeholder="Quick find…"
                className="w-full rounded-lg bg-ink-50 dark:bg-ink-700/40 border border-transparent focus:border-primary-300 focus:bg-white focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-900/40 focus:outline-none text-[13px] pl-9 pr-3 py-2 transition"
              />
            </div>
          </div>
        )}

        {/* Scrollable nav area */}
        <nav
          className={`${collapsed ? "mt-3" : "mt-4"} pb-4 overflow-y-auto no-scrollbar flex-1 space-y-0.5 ${collapsed ? "px-2" : "px-3"}`}
        >
          {filtered.length === 0 && !collapsed && (
            <p className="px-3 py-6 text-[12px] text-ink-400 text-center">
              No matches for “{query}”.
            </p>
          )}

          {filtered.map((node) => (
            <NavNodeItem
              key={node.id}
              node={node}
              collapsed={collapsed}
              isOpen={openIds.has(node.id)}
              activeUrl={activeUrl}
              onToggle={toggleGroup}
              onCampusStatisticsOpen={() => setCampusStatisticsOpen(true)}
              onSupportReportingOpen={() => setSupportReportingOpen(true)}
            />
          ))}

          {/* Admin tools band */}
          {filteredAdmin.length > 0 && (
            <div className="pt-4 mt-4 border-t border-ink-100 dark:border-ink-700 space-y-0.5">
              {!collapsed && (
                <h3 className="nav-group-label mb-1">Administration</h3>
              )}
              {filteredAdmin.map((node) => (
                <NavNodeItem
                  key={node.id}
                  node={node}
                  collapsed={collapsed}
                  isOpen={openIds.has(node.id)}
                  activeUrl={activeUrl}
                  onToggle={toggleGroup}
                  onCampusStatisticsOpen={() => setCampusStatisticsOpen(true)}
                />
              ))}
            </div>
          )}
        </nav>

        {/* Footer — collapse toggle */}
        <div className="border-t border-ink-100 dark:border-ink-700 shrink-0 p-2">
          <button
            onClick={toggleCollapse}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-md text-ink-500 hover:bg-ink-50 hover:text-ink-800 dark:hover:bg-ink-700 dark:hover:text-white transition-colors"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen className="w-4 h-4" />
            ) : (
              <>
                <PanelLeftClose className="w-4 h-4" />
                <span className="text-[12.5px] font-medium">Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-ink-900/50 backdrop-blur-sm lg:hidden"
            onClick={closeSidebar}
          />
        )}
      </AnimatePresence>

      {/* ───────────────────────── Main column ───────────────────────── */}
      {/*
        No `overflow-hidden` on this column — that would clip popovers
        (like the user-profile dropdown) that extend below the header.
        Viewport-lock is already enforced by the root `h-screen + overflow-hidden`;
        vertical scrolling lives on <main> below via `overflow-y-auto`.
      */}
      <div className="flex-1 flex flex-col min-w-0 h-screen">
        <TopBar
          title={headerMeta.title}
          onOpenSidebar={openSidebar}
          scrolled={scrolled}
          showSearch={user?.role !== "applicant"}
          showFilters={
            !!user?.role &&
            user.role !== "applicant" &&
            user.role !== "student"
          }
        />

        {/* Scrollable page content (fills remaining height) */}
        <motion.main
          key={location.pathname}
          onScroll={(e) => {
            const next = e.currentTarget.scrollTop > 4;
            setScrolled((prev) => (prev === next ? prev : next));
          }}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
          // No top padding: content starts flush under the header. Pages that
          // pin a toolbar with `sticky top-0` (the mark sheet's Save/Export bar)
          // were otherwise separated from the topnav by a 24px band of page
          // background before they stuck.
          className="flex-1 overflow-y-auto px-5 sm:px-6 lg:px-8 pb-6"
        >
          <Outlet />
        </motion.main>
      </div>

      {/* AiChatWidget hidden until ANTHROPIC_API_KEY is active */}
      {/* <AiChatWidget /> */}

      {/* Campus Statistics Modal */}
      <AnimatePresence>
        {campusStatisticsOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-ink-900/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4"
            onClick={() => setCampusStatisticsOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full h-full max-h-[90vh] max-w-7xl bg-white dark:bg-ink-800 rounded-lg shadow-2xl flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal header */}
              <div className="flex items-center justify-between p-4 border-b border-ink-200 dark:border-ink-700">
                <h2 className="text-lg font-semibold text-ink-900 dark:text-white">
                  Campus Statistics
                </h2>
                <button
                  onClick={() => setCampusStatisticsOpen(false)}
                  className="p-1 rounded-lg hover:bg-ink-100 dark:hover:bg-ink-700 text-ink-500 hover:text-ink-900 dark:hover:text-white transition-colors"
                  aria-label="Close modal"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Modal body with iframe */}
              <div className="flex-1 overflow-hidden">
                <iframe
                  src="https://cur.ac.rw/umis/documents/registrar_report/campus_statistics.php"
                  className="w-full h-full border-0"
                  title="Campus Statistics"
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Support & Reporting Modal */}
      <AnimatePresence>
        {supportReportingOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-ink-900/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4"
            onClick={() => setSupportReportingOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full h-full max-h-[90vh] max-w-7xl bg-white dark:bg-ink-800 rounded-lg shadow-2xl flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal header */}
              <div className="flex items-center justify-between p-4 border-b border-ink-200 dark:border-ink-700">
                <h2 className="text-lg font-semibold text-ink-900 dark:text-white">
                  Support & Reporting
                </h2>
                <button
                  onClick={() => setSupportReportingOpen(false)}
                  className="p-1 rounded-lg hover:bg-ink-100 dark:hover:bg-ink-700 text-ink-500 hover:text-ink-900 dark:hover:text-white transition-colors"
                  aria-label="Close modal"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Modal body with iframe */}
              <div className="flex-1 overflow-hidden">
                <iframe
                  src="https://cur.ac.rw/umis/documents/registrar_report/index.php"
                  className="w-full h-full border-0"
                  title="Support & Reporting"
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
 * Sub-components
 * ------------------------------------------------------------------ */

type NavNodeItemProps = {
  node: NavNode;
  collapsed: boolean;
  isOpen: boolean;
  /**
   * The single `to` URL the parent layout has resolved as active for the
   * current location. Used in place of NavLink's built-in `isActive` so
   * that less-specific entries (e.g. a `/me/profile` leaf) don't light up
   * when a more-specific child (`/me/profile?tab=curriculum`) wins.
   */
  activeUrl: string | null;
  onToggle: (id: string) => void;
  onCampusStatisticsOpen?: () => void;
  onSupportReportingOpen?: () => void;
};

const NavNodeItem = memo(function NavNodeItem({
  node,
  collapsed,
  isOpen,
  activeUrl,
  onToggle,
  onCampusStatisticsOpen,
  onSupportReportingOpen,
}: NavNodeItemProps) {
  // Leaf route
  if (!node.children) {
    const buttonClasses =
      `${collapsed ? "flex items-center justify-center h-10 w-full rounded-lg transition-colors" : "nav-link"} ` +
      (collapsed
        ? "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-200 hover:bg-primary-100 dark:hover:bg-primary-800/50"
        : "nav-link-active");

    const idleClasses =
      `${collapsed ? "flex items-center justify-center h-10 w-full rounded-lg transition-colors" : "nav-link"} ` +
      (collapsed
        ? "text-ink-500 hover:bg-ink-50 hover:text-ink-900 dark:text-ink-400 dark:hover:bg-ink-700/50 dark:hover:text-white"
        : "nav-link-idle");

    // Handle action-based navigation (e.g., campus-statistics, support-reporting)
    if (node.action === "campus-statistics") {
      return (
        <button
          type="button"
          onClick={onCampusStatisticsOpen}
          title={collapsed ? node.label : undefined}
          className={idleClasses}
        >
          <node.icon className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && <span className="truncate">{node.label}</span>}
        </button>
      );
    }

    if (node.action === "support-reporting") {
      return (
        <button
          type="button"
          onClick={onSupportReportingOpen}
          title={collapsed ? node.label : undefined}
          className={idleClasses}
        >
          <node.icon className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && <span className="truncate">{node.label}</span>}
        </button>
      );
    }

    const isActive = activeUrl === node.to;
    return (
      <NavLink
        to={node.to!}
        end
        title={collapsed ? node.label : undefined}
        className={isActive ? buttonClasses : idleClasses}
      >
        <node.icon className="h-[18px] w-[18px] shrink-0" />
        {!collapsed && <span className="truncate">{node.label}</span>}
      </NavLink>
    );
  }

  const hasActiveChild = node.children.some((c) => c.to === activeUrl);

  // When collapsed, treat groups as an "icon-only" button — click goes to first child.
  if (collapsed) {
    return (
      <NavLink
        to={node.children[0].to}
        title={node.label}
        className={`flex items-center justify-center h-10 w-full rounded-lg transition-colors ${
          hasActiveChild
            ? "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-200"
            : "text-ink-500 hover:bg-ink-50 hover:text-ink-900 dark:text-ink-400 dark:hover:bg-ink-700/50 dark:hover:text-white"
        }`}
      >
        <node.icon className="h-[18px] w-[18px]" />
      </NavLink>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => onToggle(node.id)}
        className={`nav-link w-full text-left ${hasActiveChild ? "nav-link-active" : "nav-link-idle"}`}
      >
        <node.icon className="h-[18px] w-[18px] shrink-0" />
        <span className="truncate flex-1">{node.label}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="mt-0.5 mb-1 space-y-0.5">
              {node.children.map((child) => {
                const isActive = child.to === activeUrl;
                return (
                  <Link
                    key={child.to}
                    to={child.to}
                    aria-current={isActive ? "page" : undefined}
                    className={`nav-sublink ${isActive ? "nav-sublink-active" : "nav-sublink-idle"}`}
                  >
                    {child.label}
                  </Link>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
