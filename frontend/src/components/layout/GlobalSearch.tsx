import {
  Search,
  Home,
  LayoutDashboard,
  GraduationCap,
  Briefcase,
  Files,
  BookOpen,
  CreditCard,
  ClipboardCheck,
  ClipboardList,
  User,
  ShieldCheck,
  Settings,
  Layers,
  Activity,
  Megaphone,
  MessagesSquare,
  Loader2,
  LifeBuoy,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import { PERMISSIONS } from "@/constants";
import { isSuperadmin } from "@/utils/permissions";
import { api } from "@/services/api";
import { useDebounce } from "@/hooks/useDebounce";
import { searchHelp, helpPath } from "@/data/help";

/* ------------------------------------------------------------------ */
/*  Deep (record-level) search — GET /api/search?q=                     */
/* ------------------------------------------------------------------ */

type RecordHit = { id: number; title: string; subtitle: string; to: string };
type DeepSearchResponse = {
  students: RecordHit[];
  staff: RecordHit[];
  applications: RecordHit[];
  announcements: RecordHit[];
  forums: RecordHit[];
};

const RECORD_GROUP_META: Record<
  keyof DeepSearchResponse,
  { label: string; icon: LucideIcon }
> = {
  students: { label: "Students", icon: GraduationCap },
  staff: { label: "Staff", icon: Briefcase },
  applications: { label: "Applications", icon: Files },
  announcements: { label: "Announcements", icon: Megaphone },
  forums: { label: "Forum threads", icon: MessagesSquare },
};

/* ------------------------------------------------------------------ */
/*  Search index                                                         */
/* ------------------------------------------------------------------ */

type SearchEntry = {
  to: string;
  label: string;
  sub?: string;
  /** All terms that should match this entry (label is always checked) */
  keywords: string[];
  icon: LucideIcon;
  group: string;
  /** At least ONE of these permissions needed (superadmin bypasses) */
  permissions?: string[];
  /** Entry is only visible to these roles */
  roles?: string[];
  /** Entry is hidden from these roles */
  hideForRoles?: string[];
};

const SEARCH_INDEX: SearchEntry[] = [
  // ── Home / Dashboard ──────────────────────────────────────────────
  {
    to: "/",
    label: "Home",
    sub: "Welcome screen",
    keywords: ["home", "start", "welcome", "main"],
    icon: Home,
    group: "General",
  },
  {
    to: "/dashboard",
    label: "Dashboard",
    sub: "Analytics & statistics",
    keywords: ["dashboard", "analytics", "overview", "statistics", "reports", "charts", "kpi"],
    icon: LayoutDashboard,
    group: "General",
    permissions: [PERMISSIONS.VIEW_DASHBOARD],
    hideForRoles: ["student", "applicant"],
  },
  {
    to: "/profile",
    label: "My Profile",
    sub: "Account settings and personal info",
    keywords: ["profile", "account", "my account", "personal info", "settings", "password", "change password"],
    icon: User,
    group: "General",
  },

  // ── Students ──────────────────────────────────────────────────────
  {
    to: "/students",
    label: "Students",
    sub: "CUR student registry",
    keywords: ["students", "student list", "registry", "enrolled", "enrollment", "pupil", "learner"],
    icon: GraduationCap,
    group: "Students",
    permissions: [PERMISSIONS.VIEW_STUDENTS],
  },
  {
    to: "/students/alumni",
    label: "Alumni",
    sub: "CUR alumni directory",
    keywords: ["alumni", "graduates", "former students", "graduated", "ex-students", "alum"],
    icon: GraduationCap,
    group: "Students",
    permissions: [PERMISSIONS.VIEW_STUDENTS],
  },

  // ── HR Management ─────────────────────────────────────────────────
  {
    to: "/hr/staff",
    label: "All Staff",
    sub: "Staff directory and contracts",
    keywords: ["staff", "employees", "faculty", "teachers", "lecturers", "hr", "human resources", "personnel", "workforce", "contracts", "staff list"],
    icon: Briefcase,
    group: "HR Management",
    permissions: [PERMISSIONS.VIEW_HR_EMPLOYEES],
  },
  {
    to: "/hr/payroll",
    label: "Payroll",
    sub: "Monthly salary breakdown and payslips",
    keywords: ["payroll", "salary", "salaries", "payslip", "pay slip", "monthly pay", "pay breakdown", "compensation", "remuneration"],
    icon: Briefcase,
    group: "HR Management",
    permissions: [PERMISSIONS.VIEW_HR_EMPLOYEES],
  },
  {
    to: "/hr/payments",
    label: "Salary Payments",
    sub: "Disbursement history and payment records",
    keywords: ["salary payments", "disbursement", "payment history", "pay records", "payroll history", "paid salaries", "payment records"],
    icon: Briefcase,
    group: "HR Management",
    permissions: [PERMISSIONS.VIEW_HR_EMPLOYEES],
  },
  {
    to: "/hr/leave",
    label: "Leave Management",
    sub: "Leave requests, approvals and balances",
    keywords: ["leave", "leave requests", "leave management", "vacation", "time off", "annual leave", "sick leave", "leave approvals", "leave balance", "days off", "absence"],
    icon: Briefcase,
    group: "HR Management",
    permissions: [PERMISSIONS.VIEW_HR_EMPLOYEES],
  },
  {
    to: "/hr/settings",
    label: "Payroll Settings",
    sub: "Deduction rates and custom payroll items",
    keywords: ["payroll settings", "deductions", "deduction rates", "hr settings", "tax", "PAYE", "pension", "RSSB", "maternity", "custom payroll", "allowances", "pay configuration"],
    icon: Briefcase,
    group: "HR Management",
    permissions: [PERMISSIONS.MANAGE_HR_EMPLOYEES],
  },

  // ── Admissions ────────────────────────────────────────────────────
  {
    to: "/admin/admissions/applications",
    label: "Applications",
    sub: "Prospective student applications",
    keywords: ["applications", "applicants", "prospective students", "admission applications", "new applications", "apply", "application list", "application review"],
    icon: Files,
    group: "Admissions",
    permissions: [PERMISSIONS.MANAGE_STUDENT_APPLICATIONS],
  },
  {
    to: "/admin/admissions/verifications",
    label: "Verifications",
    sub: "Documents awaiting review",
    keywords: ["verifications", "document verification", "document review", "verify documents", "check documents", "pending documents", "review applications"],
    icon: Files,
    group: "Admissions",
    permissions: [PERMISSIONS.VERIFY_DOCUMENTS],
  },
  {
    to: "/admin/admissions/merit",
    label: "Merit Lists",
    sub: "Scoring and merit list generation",
    keywords: ["merit", "merit lists", "scoring", "rankings", "admission scoring", "merit ranking", "shortlisting", "merit score", "qualified applicants"],
    icon: Files,
    group: "Admissions",
    permissions: [PERMISSIONS.MANAGE_ADMISSIONS],
  },
  {
    to: "/admin/admissions/offers",
    label: "Admission Offers",
    sub: "Admission offers and enrollment",
    keywords: ["offers", "admission offers", "offer letters", "enrollment", "accepted", "offer management", "enroll students", "admit students"],
    icon: Files,
    group: "Admissions",
    permissions: [PERMISSIONS.MANAGE_ADMISSIONS],
  },
  {
    to: "/admin/admissions/requirements",
    label: "Requirements",
    sub: "Per-faculty document checklist",
    keywords: ["requirements", "document requirements", "checklist", "admission requirements", "required documents", "faculty requirements", "upload requirements"],
    icon: Files,
    group: "Admissions",
    permissions: [PERMISSIONS.MANAGE_ADMISSION_REQUIREMENTS],
  },
  {
    to: "/admin/admissions/document-types",
    label: "Document Types",
    sub: "Catalogue of admission documents",
    keywords: ["document types", "document catalog", "admission documents", "document categories", "doc types", "document list"],
    icon: Files,
    group: "Admissions",
    permissions: [PERMISSIONS.MANAGE_ADMISSION_REQUIREMENTS],
  },
  {
    to: "/admin/admissions/intakes",
    label: "Intakes",
    sub: "Admission intakes and cohorts",
    keywords: ["intakes", "admission intakes", "cohorts", "batches", "intake management", "academic intake", "enrollment period", "intake periods"],
    icon: Files,
    group: "Admissions",
    permissions: [PERMISSIONS.MANAGE_ADMISSIONS],
  },

  // ── Modules ───────────────────────────────────────────────────────
  {
    to: "/modules/catalog",
    label: "Module Catalog",
    sub: "Browse and manage course modules",
    keywords: ["module catalog", "courses", "course catalog", "modules list", "units", "subjects", "course modules", "module list", "browse modules"],
    icon: BookOpen,
    group: "Modules",
    permissions: [PERMISSIONS.MANAGE_MODULES],
  },
  {
    to: "/modules/scheduling",
    label: "Module Scheduling",
    sub: "Timetable and conflict detection",
    keywords: ["module scheduling", "timetable", "schedule", "class schedule", "class timetable", "time slots", "conflict detection", "lecture schedule", "session planning"],
    icon: BookOpen,
    group: "Modules",
    permissions: [PERMISSIONS.MANAGE_MODULE_SCHEDULES],
  },
  {
    to: "/modules/assignments",
    label: "Module Assignments",
    sub: "Faculty-to-module assignments and workload",
    keywords: ["module assignments", "faculty assignments", "lecturer assignments", "workload", "assign lecturers", "teacher modules", "course assignments", "teaching assignments"],
    icon: BookOpen,
    group: "Modules",
    permissions: [PERMISSIONS.MANAGE_MODULE_ASSIGNMENTS],
  },
  {
    to: "/modules/registrations",
    label: "Module Registrations",
    sub: "Student module registrations",
    keywords: ["module registrations", "student registrations", "course enrollment", "registered students", "registration list", "enrolled modules", "registration admin"],
    icon: BookOpen,
    group: "Modules",
    permissions: [PERMISSIONS.MANAGE_MODULE_REGISTRATIONS],
  },
  {
    to: "/my-modules",
    label: "My Registrations",
    sub: "Register for modules and track your courses",
    keywords: ["my modules", "my courses", "my registrations", "enrolled courses", "my subjects", "register module", "student portal modules"],
    icon: BookOpen,
    group: "Modules",
    permissions: [PERMISSIONS.VIEW_MY_MODULES],
  },

  // ── Finance ───────────────────────────────────────────────────────
  {
    to: "/finance",
    label: "Finance Overview",
    sub: "Fees, payments and billing summary",
    keywords: ["finance", "financial", "overview", "fees", "payments", "billing summary", "money", "revenue", "income", "finance overview"],
    icon: CreditCard,
    group: "Finance",
    permissions: [PERMISSIONS.VIEW_FINANCE, PERMISSIONS.MANAGE_FINANCE],
  },
  {
    to: "/finance/billing",
    label: "Billing",
    sub: "Student ledger and invoice management",
    keywords: ["billing", "invoices", "student billing", "fee payment", "ledger", "invoice management", "student ledger", "tuition payment", "payment records", "receipt"],
    icon: CreditCard,
    group: "Finance",
    permissions: [PERMISSIONS.VIEW_FINANCE, PERMISSIONS.MANAGE_FINANCE],
  },
  {
    to: "/finance/approvals",
    label: "Payment Approvals",
    sub: "Approve and validate payment records",
    keywords: ["payment approvals", "approve payments", "validate payments", "pending approvals", "finance approvals", "payment validation"],
    icon: CreditCard,
    group: "Finance",
    permissions: [PERMISSIONS.MANAGE_FINANCE],
  },
  {
    to: "/finance/structures",
    label: "Fee Rates",
    sub: "Configure fee amounts per type and department",
    keywords: ["fee rates", "fee structures", "fee configuration", "tuition rates", "school fees", "fee amounts", "fee setup", "fee management", "cost per department"],
    icon: CreditCard,
    group: "Finance",
    permissions: [PERMISSIONS.MANAGE_FINANCE],
  },
  {
    to: "/finance/bursaries",
    label: "Bursaries",
    sub: "Scholarships and financial aid",
    keywords: ["bursaries", "scholarships", "financial aid", "grants", "sponsorship", "bursary management", "student aid", "fee waiver"],
    icon: CreditCard,
    group: "Finance",
    permissions: [PERMISSIONS.MANAGE_FINANCE],
  },
  {
    to: "/finance/sponsors",
    label: "Sponsors",
    sub: "External sponsors and sponsorship records",
    keywords: ["sponsors", "sponsorship", "external sponsors", "sponsor management", "government sponsorship", "scholarship sponsors"],
    icon: CreditCard,
    group: "Finance",
    permissions: [PERMISSIONS.MANAGE_FINANCE],
  },
  {
    to: "/finance/expenses",
    label: "Expenses",
    sub: "Institutional expense records",
    keywords: ["expenses", "expenditure", "institutional expenses", "expense records", "spending", "costs", "operational costs", "expense management"],
    icon: CreditCard,
    group: "Finance",
    permissions: [PERMISSIONS.MANAGE_FINANCE],
  },
  {
    to: "/finance/balance",
    label: "Account Balance",
    sub: "Institution account balance",
    keywords: ["account balance", "balance", "bank balance", "financial position", "current balance", "net balance"],
    icon: CreditCard,
    group: "Finance",
    permissions: [PERMISSIONS.MANAGE_FINANCE],
  },
  {
    to: "/finance/clearance",
    label: "Clearance",
    sub: "Student financial clearance",
    keywords: ["clearance", "financial clearance", "student clearance", "fee clearance", "graduation clearance", "debt clearance", "cleared students"],
    icon: CreditCard,
    group: "Finance",
    permissions: [PERMISSIONS.MANAGE_FINANCE],
  },
  {
    to: "/finance/refunds",
    label: "Refunds",
    sub: "Student refunds and caution money",
    keywords: ["refunds", "caution money", "caution refund", "fee refund", "student refund", "overpayment", "refund management", "caution deposit"],
    icon: CreditCard,
    group: "Finance",
    permissions: [PERMISSIONS.MANAGE_FINANCE],
  },
  {
    to: "/finance/reports",
    label: "Revenue Reports",
    sub: "Fee collection breakdown by category",
    keywords: ["revenue reports", "finance reports", "fee collection", "revenue", "collection report", "financial report", "income report", "payment summary"],
    icon: CreditCard,
    group: "Finance",
    permissions: [PERMISSIONS.VIEW_FINANCE, PERMISSIONS.MANAGE_FINANCE],
  },
  {
    to: "/my-finance",
    label: "My Finance",
    sub: "Your fees, invoices and payment history",
    keywords: ["my finance", "my fees", "my payments", "student finance", "my invoices", "fee balance", "my tuition", "my account"],
    icon: CreditCard,
    group: "Finance",
    permissions: [PERMISSIONS.ACCESS_STUDENT_PORTAL],
  },

  // ── Attendance ────────────────────────────────────────────────────
  {
    to: "/attendance",
    label: "Attendance",
    sub: "Record and review student attendance",
    keywords: ["attendance", "student attendance", "attendance records", "mark attendance", "absentee", "present", "attendance sheet", "class attendance"],
    icon: ClipboardCheck,
    group: "Attendance",
    permissions: [PERMISSIONS.VIEW_ATTENDANCE, PERMISSIONS.RECORD_ATTENDANCE, PERMISSIONS.MANAGE_ATTENDANCE],
  },

  // ── Exams ─────────────────────────────────────────────────────────
  {
    to: "/exams",
    label: "Exam Schedule",
    sub: "Examination timetable",
    keywords: ["exams", "examinations", "exam schedule", "test schedule", "exam timetable", "exam management"],
    icon: ClipboardList,
    group: "Exams",
    permissions: [PERMISSIONS.MANAGE_EXAMS],
  },
  {
    to: "/exams/results",
    label: "Exam Results",
    sub: "All examination results and grades",
    keywords: ["exam results", "results", "grades", "transcripts", "marks", "grade report", "academic results", "student grades"],
    icon: ClipboardList,
    group: "Exams",
    permissions: [PERMISSIONS.MANAGE_EXAMS],
  },

  // ── Administration ────────────────────────────────────────────────
  {
    to: "/users",
    label: "Users",
    sub: "Staff, faculty and student accounts",
    keywords: ["users", "user management", "accounts", "staff accounts", "user list", "create user", "manage users", "user directory"],
    icon: User,
    group: "Administration",
    permissions: [PERMISSIONS.MANAGE_USERS],
  },
  {
    to: "/roles",
    label: "Roles",
    sub: "Who can do what in the system",
    keywords: ["roles", "role management", "user roles", "assign roles", "role list", "access roles", "permissions roles"],
    icon: ShieldCheck,
    group: "Administration",
    permissions: [PERMISSIONS.MANAGE_ROLES],
  },
  {
    to: "/permissions",
    label: "Permissions",
    sub: "Fine-grained access control",
    keywords: ["permissions", "access control", "authorization", "fine-grained", "permission list", "manage permissions", "role permissions"],
    icon: Settings,
    group: "Administration",
    permissions: [PERMISSIONS.MANAGE_PERMISSIONS],
  },
  {
    to: "/academic/management",
    label: "Academics Management",
    sub: "Degrees, schools, departments, facilities and more",
    keywords: [
      "academics", "academic management", "departments", "schools", "programs",
      "degrees", "faculties", "options", "levels", "campus", "facilities",
      "academic settings", "departments management", "school management",
      "degree programs", "academic structure",
    ],
    icon: Layers,
    group: "Administration",
    hideForRoles: ["hr_manager"],
    permissions: [
      PERMISSIONS.MANAGE_ACADEMICS,
      PERMISSIONS.MANAGE_DEGREES,
      PERMISSIONS.MANAGE_FACILITIES,
      PERMISSIONS.MANAGE_DEPARTMENTS,
      PERMISSIONS.MANAGE_OPTIONS,
      PERMISSIONS.MANAGE_LEVELS,
      PERMISSIONS.MANAGE_SCHOOLS,
    ],
  },
  {
    to: "/logs",
    label: "System Logs",
    sub: "Audit trail across the platform",
    keywords: ["logs", "system logs", "audit trail", "audit log", "activity logs", "security logs", "event log", "history", "user activity", "system activity"],
    icon: Activity,
    group: "Administration",
    permissions: [PERMISSIONS.VIEW_SYSTEM_LOGS],
  },

  // ── Applicant portal (applicant role only) ─────────────────────────
  {
    to: "/applicant",
    label: "My Application",
    sub: "Track your application progress",
    keywords: ["my application", "application status", "track application", "admission status", "applicant portal", "application progress"],
    icon: Files,
    group: "Applicant",
    roles: ["applicant"],
    permissions: [PERMISSIONS.ACCESS_APPLICANT_PORTAL],
  },
  {
    to: "/applicant/documents",
    label: "My Documents",
    sub: "Upload required files for your application",
    keywords: ["my documents", "upload documents", "application documents", "required files", "upload files", "document upload"],
    icon: Files,
    group: "Applicant",
    roles: ["applicant"],
    permissions: [PERMISSIONS.ACCESS_APPLICANT_PORTAL],
  },
];

/* ------------------------------------------------------------------ */
/*  Component                                                            */
/* ------------------------------------------------------------------ */

export default function GlobalSearch() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const hasAccess = useCallback(
    (perms?: string[]) => {
      if (!perms || perms.length === 0) return true;
      if (isSuperadmin(user)) return true;
      return perms.some((p) => (user?.permissions ?? []).includes(p));
    },
    [user],
  );

  const matchesRoles = useCallback(
    (roles?: string[]) => {
      if (!roles || roles.length === 0) return true;
      return roles.includes(user?.role ?? "");
    },
    [user],
  );

  const isVisible = useCallback(
    (e: SearchEntry) => {
      if (e.hideForRoles?.includes(user?.role ?? "")) return false;
      return matchesRoles(e.roles) && hasAccess(e.permissions);
    },
    [hasAccess, matchesRoles, user],
  );

  // Debounced deep (record-level) search — backend filters per-entity by the
  // caller's own permissions, so results here never need client-side gating.
  const debouncedQuery = useDebounce(query, 300);
  const deepSearchQuery = useQuery({
    queryKey: ["global-search", debouncedQuery],
    queryFn: ({ signal }) =>
      api.get<DeepSearchResponse>("/api/search", { q: debouncedQuery }, signal),
    enabled: debouncedQuery.trim().length >= 2,
    staleTime: 15_000,
  });

  const liveEntries = useMemo<SearchEntry[]>(() => {
    const data = deepSearchQuery.data?.data;
    if (!data) return [];
    const entries: SearchEntry[] = [];
    (Object.keys(RECORD_GROUP_META) as (keyof DeepSearchResponse)[]).forEach((key) => {
      const meta = RECORD_GROUP_META[key];
      for (const hit of data[key] ?? []) {
        entries.push({
          to: hit.to,
          label: hit.title,
          sub: hit.subtitle,
          keywords: [],
          icon: meta.icon,
          group: meta.label,
        });
      }
    });
    return entries;
  }, [deepSearchQuery.data]);

  // Help Centre articles are searched from the same box. A user who types
  // "approve leave" is as likely to want the instructions as the queue.
  const helpEntries = useMemo<SearchEntry[]>(() => {
    const q = query.trim();
    if (q.length < 2) return [];
    // minScore 25 keeps the four slots to genuine matches — below that a hit is
    // one shared word, which reads as the wrong answer rather than a near miss.
    return searchHelp(q, 4, 25).map((hit) => ({
      to: helpPath(hit.moduleId, hit.articleId),
      label: hit.title,
      sub: hit.matchedStep ?? hit.summary,
      keywords: [],
      icon: LifeBuoy,
      group: "Help & Guides",
    }));
  }, [query]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const pageResults = SEARCH_INDEX.filter((e) => {
      if (!isVisible(e)) return false;
      if (e.label.toLowerCase().includes(q)) return true;
      if (e.sub?.toLowerCase().includes(q)) return true;
      return e.keywords.some((kw) => kw.toLowerCase().includes(q));
    });

    return [...pageResults, ...liveEntries, ...helpEntries];
  }, [query, isVisible, liveEntries, helpEntries]);

  // Group results by their group label
  const grouped = useMemo(() => {
    const map = new Map<string, SearchEntry[]>();
    for (const r of results) {
      const list = map.get(r.group) ?? [];
      list.push(r);
      map.set(r.group, list);
    }
    return map;
  }, [results]);

  const flatResults = results; // for keyboard tracking

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, flatResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = flatResults[activeIdx];
      if (item) go(item.to);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const go = (to: string) => {
    setOpen(false);
    setQuery("");
    navigate(to);
  };

  // Reset active index when results change
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        inputRef.current &&
        !inputRef.current.contains(e.target as Node) &&
        panelRef.current &&
        !panelRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Global shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const showPanel = open && query.trim().length > 0;

  // Compute flat index offset per group for keyboard tracking
  let flatIdx = 0;

  /**
   * Always-present escape hatch into the Help Centre. It is shown whether or
   * not anything matched: "I searched and found nothing" is precisely the
   * moment a user needs instructions rather than records.
   */
  const helpFooter = (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        go(`/help/search?q=${encodeURIComponent(query.trim())}`);
      }}
      className="w-full flex items-center justify-between gap-3 px-4 py-2.5 border-t border-ink-100 dark:border-ink-700 text-left hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors group/help"
    >
      <span className="flex items-center gap-2.5 min-w-0">
        <span className="flex-shrink-0 p-1.5 rounded-lg bg-primary-100 text-primary-700 dark:bg-primary-800/50 dark:text-primary-200">
          <LifeBuoy className="w-3.5 h-3.5" />
        </span>
        <span className="min-w-0">
          <span className="block text-[12.5px] font-medium text-ink-800 dark:text-ink-100 truncate">
            Search the Help Centre for "{query.trim()}"
          </span>
          <span className="block text-[11px] text-ink-400">
            Step-by-step guides for every module
          </span>
        </span>
      </span>
      <ArrowRight className="w-3.5 h-3.5 flex-shrink-0 text-ink-300 group-hover/help:text-primary-500 group-hover/help:translate-x-0.5 transition-all" />
    </button>
  );

  return (
    <div className="relative w-[280px] lg:w-[400px]">
      {/* Input */}
      {deepSearchQuery.isFetching ? (
        <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400 pointer-events-none animate-spin" />
      ) : (
        <Search className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400 pointer-events-none" />
      )}
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="What do you want to find?"
        aria-label="Global search"
        className="w-full h-10 rounded-full bg-ink-50/80 dark:bg-ink-800 border border-ink-100 dark:border-ink-700 pl-5 pr-11 text-[13.5px] placeholder-ink-400 focus:outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-900/40 transition"
      />
      {/* Shortcut hint */}
      {!query && (
        <span className="absolute right-10 top-1/2 -translate-y-1/2 hidden lg:flex items-center gap-0.5 text-[11px] text-ink-300 pointer-events-none select-none">
          <kbd className="px-1 py-0.5 rounded bg-ink-100 dark:bg-ink-700 font-mono text-ink-400">⌘K</kbd>
        </span>
      )}

      {/* Results panel */}
      {showPanel && (
        <div
          ref={panelRef}
          className="absolute top-[calc(100%+8px)] left-0 w-full min-w-[320px] bg-white dark:bg-ink-800 border border-ink-100 dark:border-ink-700 rounded-2xl shadow-xl overflow-hidden z-50"
        >
          {results.length === 0 ? (
            <div>
              <div className="px-5 pt-8 pb-5 text-center text-[13px] text-ink-400">
                No results for <span className="font-medium text-ink-600 dark:text-ink-200">"{query}"</span>
              </div>
              {helpFooter}
            </div>
          ) : (
            <div className="max-h-[420px] overflow-y-auto py-2">
              {Array.from(grouped.entries()).map(([group, items]) => (
                <div key={group}>
                  <div className="px-4 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink-400 dark:text-ink-500">
                    {group}
                  </div>
                  {items.map((item, itemIdx) => {
                    const thisIdx = flatIdx++;
                    const Icon = item.icon;
                    const isActive = activeIdx === thisIdx;
                    return (
                      <button
                        key={`${group}-${item.to}-${itemIdx}`}
                        onMouseEnter={() => setActiveIdx(thisIdx)}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          go(item.to);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                          isActive
                            ? "bg-primary-50 dark:bg-primary-900/30"
                            : "hover:bg-ink-50 dark:hover:bg-ink-700/50"
                        }`}
                      >
                        <span
                          className={`flex-shrink-0 p-1.5 rounded-lg ${
                            isActive
                              ? "bg-primary-100 text-primary-700 dark:bg-primary-800/50 dark:text-primary-200"
                              : "bg-ink-100 text-ink-500 dark:bg-ink-700 dark:text-ink-300"
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                        </span>
                        <div className="min-w-0">
                          <div
                            className={`text-[13px] font-medium truncate ${
                              isActive
                                ? "text-primary-700 dark:text-primary-200"
                                : "text-ink-800 dark:text-ink-100"
                            }`}
                          >
                            {item.label}
                          </div>
                          {item.sub && (
                            <div className="text-[11.5px] text-ink-400 truncate">{item.sub}</div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))}
              {helpFooter}
              <div className="px-4 py-2 border-t border-ink-100 dark:border-ink-700 flex items-center gap-3 text-[11px] text-ink-300">
                <span><kbd className="font-mono">↑↓</kbd> navigate</span>
                <span><kbd className="font-mono">↵</kbd> open</span>
                <span><kbd className="font-mono">Esc</kbd> close</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
