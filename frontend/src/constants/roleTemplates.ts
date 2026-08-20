import { PERMISSIONS } from './permissions'

export interface RoleTemplate {
  id: string
  name: string
  category: string
  description: string
  permissions: string[]
}

/**
 * Suggested role starting-points for the "Create Role" flow — front-end only.
 * These are conveniences for the admin (prefill name/description + pre-check
 * a sensible permission set they can still edit before saving); nothing here
 * is enforced by the backend. Grounded in the actual 101-slug catalog in
 * backend/app/Constants/Permissions.php — every slug referenced below exists
 * and is actively enforced by real routes/pages, so a template always maps to
 * working access, not aspirational features (VIEW_TIMETABLE/MANAGE_TIMETABLE,
 * MANAGE_OWN_PROFILE and the two portal-access slugs are deliberately never
 * used here — they're reserved/self-service, not staff-role material).
 */
export const ROLE_TEMPLATES: RoleTemplate[] = [
  // ── Finance ──────────────────────────────────────────────────────────────
  {
    id: 'finance-officer',
    name: 'Finance Officer',
    category: 'Finance',
    description:
      'Full day-to-day finance operations — billing, payments, bursaries, sponsors, expenses, refunds and fines. Cannot manage roles or system settings.',
    permissions: [
      PERMISSIONS.VIEW_FINANCE,
      PERMISSIONS.MANAGE_FINANCE,
      PERMISSIONS.VIEW_FINANCE_OVERVIEW,
      PERMISSIONS.VIEW_FINANCE_BILLING,
      PERMISSIONS.VIEW_FINANCE_APPROVALS,
      PERMISSIONS.VIEW_FINANCE_STRUCTURES,
      PERMISSIONS.VIEW_FINANCE_BURSARIES,
      PERMISSIONS.VIEW_FINANCE_SPONSORS,
      PERMISSIONS.VIEW_FINANCE_EXPENSES,
      PERMISSIONS.VIEW_FINANCE_REFUNDS,
      PERMISSIONS.VIEW_FINANCE_BALANCE,
      PERMISSIONS.VIEW_FINANCE_CLEARANCE,
      PERMISSIONS.VIEW_FINANCE_REPORTS,
      PERMISSIONS.VIEW_MOBILE_PAYMENTS,
      PERMISSIONS.VIEW_ONLINE_PAYMENTS_HISTORY,
      PERMISSIONS.VIEW_FINES,
      PERMISSIONS.MANAGE_FINES,
      PERMISSIONS.SEND_FEE_ALERTS,
      PERMISSIONS.VIEW_STUDENT_DIRECTORY_FINANCE,
    ],
  },
  {
    id: 'finance-viewer',
    name: 'Finance Viewer / Auditor',
    category: 'Finance',
    description:
      'Read-only visibility across every finance area for internal audit or oversight — reports, billing, bursaries, budget — with no ability to record or approve transactions.',
    permissions: [
      PERMISSIONS.VIEW_FINANCE,
      PERMISSIONS.VIEW_FINANCE_OVERVIEW,
      PERMISSIONS.VIEW_FINANCE_BILLING,
      PERMISSIONS.VIEW_FINANCE_APPROVALS,
      PERMISSIONS.VIEW_FINANCE_STRUCTURES,
      PERMISSIONS.VIEW_FINANCE_BURSARIES,
      PERMISSIONS.VIEW_FINANCE_SPONSORS,
      PERMISSIONS.VIEW_FINANCE_EXPENSES,
      PERMISSIONS.VIEW_FINANCE_REFUNDS,
      PERMISSIONS.VIEW_FINANCE_BALANCE,
      PERMISSIONS.VIEW_FINANCE_CLEARANCE,
      PERMISSIONS.VIEW_FINANCE_REPORTS,
      PERMISSIONS.VIEW_BUDGET_EXECUTION,
      PERMISSIONS.VIEW_PAYMENT_CALENDAR,
      PERMISSIONS.VIEW_STUDENT_DIRECTORY_FINANCE,
      PERMISSIONS.VIEW_FINES,
    ],
  },
  {
    id: 'budget-analyst',
    name: 'Budget & Planning Analyst',
    category: 'Finance',
    description:
      'Owns budget execution tracking and the fee/payment calendar — distinct authority from day-to-day billing, for planning and financial-control staff.',
    permissions: [
      PERMISSIONS.VIEW_BUDGET_EXECUTION,
      PERMISSIONS.MANAGE_BUDGET_EXECUTION,
      PERMISSIONS.VIEW_PAYMENT_CALENDAR,
      PERMISSIONS.MANAGE_PAYMENT_CALENDAR,
      PERMISSIONS.VIEW_FINANCE_REPORTS,
      PERMISSIONS.VIEW_FINANCE,
    ],
  },

  // ── Admissions ───────────────────────────────────────────────────────────
  {
    id: 'admissions-officer',
    name: 'Admissions Officer',
    category: 'Admissions',
    description:
      'Processes applications end to end — document verification, offers, merit lists and admission requirements configuration.',
    permissions: [
      PERMISSIONS.MANAGE_STUDENT_APPLICATIONS,
      PERMISSIONS.VERIFY_DOCUMENTS,
      PERMISSIONS.MANAGE_ADMISSIONS,
      PERMISSIONS.MANAGE_ADMISSION_REQUIREMENTS,
      PERMISSIONS.VIEW_MERIT_LIST,
      PERMISSIONS.MANAGE_MERIT_LIST,
      PERMISSIONS.GENERATE_DOCUMENTS,
    ],
  },
  {
    id: 'document-verification-officer',
    name: 'Document Verification Officer',
    category: 'Admissions',
    description:
      'Narrow front-line role — checks and approves/rejects applicant-uploaded documents only, without offer or merit-list authority.',
    permissions: [PERMISSIONS.VERIFY_DOCUMENTS, PERMISSIONS.GENERATE_DOCUMENTS],
  },

  // ── Human Resources ──────────────────────────────────────────────────────
  {
    id: 'hr-officer',
    name: 'HR Officer',
    category: 'Human Resources',
    description:
      'Full HR operations — employee records, leave, payroll runs and appraisal cycles.',
    permissions: [
      PERMISSIONS.VIEW_HR_EMPLOYEES,
      PERMISSIONS.MANAGE_HR_EMPLOYEES,
      PERMISSIONS.MANAGE_LEAVE_TYPES,
      PERMISSIONS.VIEW_LEAVE_REQUESTS,
      PERMISSIONS.MANAGE_LEAVE_REQUESTS,
      PERMISSIONS.VIEW_PAYROLL,
      PERMISSIONS.MANAGE_PAYROLL,
      PERMISSIONS.VIEW_APPRAISALS,
      PERMISSIONS.MANAGE_APPRAISALS,
    ],
  },
  {
    id: 'hr-assistant',
    name: 'HR Assistant',
    category: 'Human Resources',
    description:
      'Front-line HR support — views employee records, actions leave requests, sees appraisals. No payroll access.',
    permissions: [
      PERMISSIONS.VIEW_HR_EMPLOYEES,
      PERMISSIONS.VIEW_LEAVE_REQUESTS,
      PERMISSIONS.MANAGE_LEAVE_REQUESTS,
      PERMISSIONS.VIEW_APPRAISALS,
    ],
  },
  {
    id: 'payroll-specialist',
    name: 'Payroll Specialist',
    category: 'Human Resources',
    description:
      'Runs payroll and salary payments only — a distinct authority from general employee-record management, for finance/payroll-desk staff who should not edit HR records.',
    permissions: [PERMISSIONS.VIEW_PAYROLL, PERMISSIONS.MANAGE_PAYROLL],
  },

  // ── Academics & Exams ────────────────────────────────────────────────────
  {
    id: 'exams-officer',
    name: 'Exams & Assessment Officer',
    category: 'Academics & Exams',
    description:
      'Runs the examination lifecycle — scheduling, grading scales, revaluations, deliberations, transcripts and certificates.',
    permissions: [
      PERMISSIONS.VIEW_EXAMS,
      PERMISSIONS.MANAGE_EXAMS,
      PERMISSIONS.MANAGE_GRADING_SCALES,
      PERMISSIONS.MANAGE_REVALUATIONS,
      PERMISSIONS.VIEW_MODULE_MARKS,
      PERMISSIONS.RECORD_MODULE_MARKS,
      PERMISSIONS.MANAGE_MODULE_MARKS,
      PERMISSIONS.MANAGE_DELIBERATIONS,
      PERMISSIONS.MANAGE_GRADUANDS,
      PERMISSIONS.VIEW_GRADUANDS,
      PERMISSIONS.MANAGE_TRANSCRIPT_REQUESTS,
      PERMISSIONS.MANAGE_ACADEMIC_CERTIFICATES,
    ],
  },
  {
    id: 'academic-coordinator',
    name: 'Academic Coordinator / Department Head',
    category: 'Academics & Exams',
    description:
      'Owns a department’s day-to-day academic operations — module catalogue, scheduling, teaching assignments, registrations and analytics.',
    permissions: [
      PERMISSIONS.VIEW_STUDENTS,
      PERMISSIONS.MANAGE_ACADEMICS,
      PERMISSIONS.MANAGE_MODULES,
      PERMISSIONS.MANAGE_MODULE_SCHEDULES,
      PERMISSIONS.MANAGE_MODULE_ASSIGNMENTS,
      PERMISSIONS.MANAGE_MODULE_REGISTRATIONS,
      PERMISSIONS.VIEW_MODULE_MARKS,
      PERMISSIONS.VIEW_ACADEMIC_ANALYTICS,
    ],
  },
  {
    id: 'teaching-staff',
    name: 'Teaching Staff (Limited)',
    category: 'Academics & Exams',
    description:
      'For guest/part-time lecturers — sees only their own assigned modules, records marks and attendance for them.',
    permissions: [
      PERMISSIONS.VIEW_MY_MODULES,
      PERMISSIONS.RECORD_MODULE_MARKS,
      PERMISSIONS.RECORD_ATTENDANCE,
      PERMISSIONS.VIEW_ATTENDANCE,
    ],
  },

  // ── Registry & Academic Structure ────────────────────────────────────────
  {
    id: 'student-records-manager',
    name: 'Student Records Manager',
    category: 'Registry & Academic Structure',
    description:
      'Full authority over student records — create, edit and manage student data and IDs. Broader than the front-line Registry Clerk.',
    permissions: [
      PERMISSIONS.VIEW_STUDENTS,
      PERMISSIONS.MANAGE_STUDENTS,
      PERMISSIONS.MANAGE_STUDENT_IDS,
      PERMISSIONS.GENERATE_DOCUMENTS,
    ],
  },
  {
    id: 'registry-clerk',
    name: 'Registry Clerk',
    category: 'Registry & Academic Structure',
    description:
      'Front-line registry work — looks up student records, issues ID cards, checks attendance and clearance status. View-mostly; no record editing.',
    permissions: [
      PERMISSIONS.VIEW_STUDENTS,
      PERMISSIONS.MANAGE_STUDENT_IDS,
      PERMISSIONS.VIEW_ATTENDANCE,
      PERMISSIONS.VIEW_CLEARANCE,
      PERMISSIONS.GENERATE_DOCUMENTS,
    ],
  },
  {
    id: 'academic-structure-admin',
    name: 'Academic Structure Administrator',
    category: 'Registry & Academic Structure',
    description:
      'Configures the institution’s academic master data — schools, departments, degrees, options, levels, campuses and facilities. Setup-focused, not day-to-day teaching operations.',
    permissions: [
      PERMISSIONS.MANAGE_SCHOOLS,
      PERMISSIONS.MANAGE_DEPARTMENTS,
      PERMISSIONS.MANAGE_DEGREES,
      PERMISSIONS.MANAGE_OPTIONS,
      PERMISSIONS.MANAGE_LEVELS,
      PERMISSIONS.MANAGE_CAMPUSES,
      PERMISSIONS.MANAGE_FACILITIES,
    ],
  },
  {
    id: 'academic-calendar-manager',
    name: 'Academic Calendar Manager',
    category: 'Registry & Academic Structure',
    description:
      'Owns the academic calendar — creating and updating academic years and terms that every other module (billing, attendance, exams) runs against.',
    permissions: [
      PERMISSIONS.MANAGE_ACADEMIC_YEARS,
      PERMISSIONS.MANAGE_ACADEMIC_TERMS,
    ],
  },

  // ── Student Services ─────────────────────────────────────────────────────
  {
    id: 'clearance-officer',
    name: 'Student Clearance Officer',
    category: 'Student Services',
    description:
      'Processes and approves student clearance across academic and finance checkpoints.',
    permissions: [
      PERMISSIONS.VIEW_CLEARANCE,
      PERMISSIONS.MANAGE_CLEARANCE,
      PERMISSIONS.VIEW_FINANCE_CLEARANCE,
    ],
  },
  {
    id: 'front-desk',
    name: 'Front Desk / Student Services',
    category: 'Student Services',
    description:
      'General front-desk support — look up students, share announcements and messages, generate basic documents. Read-mostly.',
    permissions: [
      PERMISSIONS.VIEW_STUDENTS,
      PERMISSIONS.VIEW_ANNOUNCEMENTS,
      PERMISSIONS.VIEW_FORUMS,
      PERMISSIONS.SEND_MESSAGES,
      PERMISSIONS.GENERATE_DOCUMENTS,
    ],
  },

  // ── Gate & Security ──────────────────────────────────────────────────────
  {
    id: 'gate-officer',
    name: 'Gate Security Officer',
    category: 'Gate & Security',
    description:
      'Runs the entry gate scanner — verifies student access on duty. Cannot configure gate settings.',
    permissions: [PERMISSIONS.ACCESS_GATE, PERMISSIONS.VIEW_GATE_LOGS],
  },
  {
    id: 'gate-supervisor',
    name: 'Gate Supervisor',
    category: 'Gate & Security',
    description:
      'Oversees gate operations across shifts — verification plus gate configuration and full log access.',
    permissions: [
      PERMISSIONS.ACCESS_GATE,
      PERMISSIONS.MANAGE_GATE,
      PERMISSIONS.VIEW_GATE_LOGS,
    ],
  },

  // ── Communications ───────────────────────────────────────────────────────
  {
    id: 'communications-officer',
    name: 'Communications Officer',
    category: 'Communications',
    description:
      'Manages campus-wide messaging — announcements, broadcast messages and forum moderation.',
    permissions: [
      PERMISSIONS.SEND_MESSAGES,
      PERMISSIONS.BROADCAST_MESSAGES,
      PERMISSIONS.MANAGE_MESSAGES,
      PERMISSIONS.MANAGE_ANNOUNCEMENTS,
      PERMISSIONS.VIEW_ANNOUNCEMENTS,
      PERMISSIONS.MODERATE_FORUMS,
      PERMISSIONS.VIEW_FORUMS,
    ],
  },

  // ── IT & Systems ─────────────────────────────────────────────────────────
  {
    id: 'it-support',
    name: 'IT / System Support',
    category: 'IT & Systems',
    description:
      'Manages user accounts and system configuration day-to-day. Deliberately excludes MANAGE_ROLES/MANAGE_PERMISSIONS — those stay reserved for superadmin.',
    permissions: [
      PERMISSIONS.VIEW_DASHBOARD,
      PERMISSIONS.VIEW_SYSTEM_LOGS,
      PERMISSIONS.VIEW_SYSTEM_BASICS,
      PERMISSIONS.VIEW_SETTINGS,
      PERMISSIONS.MANAGE_SETTINGS,
      PERMISSIONS.MANAGE_ACADEMIC_SETTINGS,
      PERMISSIONS.MANAGE_USERS,
    ],
  },
]

export const ROLE_TEMPLATE_CATEGORIES = Array.from(
  new Set(ROLE_TEMPLATES.map((t) => t.category)),
)
