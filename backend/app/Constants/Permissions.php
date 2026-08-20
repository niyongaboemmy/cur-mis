<?php

declare(strict_types=1);

namespace App\Constants;

class Permissions
{
    public const MANAGE_ROLES = 'MANAGE_ROLES';
    public const MANAGE_PERMISSIONS = 'MANAGE_PERMISSIONS';
    public const MANAGE_USERS = 'MANAGE_USERS';
    public const VIEW_SYSTEM_LOGS = 'VIEW_SYSTEM_LOGS';
    public const VIEW_DASHBOARD = 'VIEW_DASHBOARD';

    // System Settings
    public const MANAGE_ACADEMIC_YEARS = 'MANAGE_ACADEMIC_YEARS';
    public const MANAGE_ACADEMIC_TERMS = 'MANAGE_ACADEMIC_TERMS';
    public const MANAGE_ACADEMIC_SETTINGS = 'MANAGE_ACADEMIC_SETTINGS';
    public const VIEW_SYSTEM_BASICS = 'VIEW_SYSTEM_BASICS';
    public const VIEW_SETTINGS = 'VIEW_SETTINGS';
    public const MANAGE_SETTINGS = 'MANAGE_SETTINGS';

    // Academic Registry
    public const VIEW_STUDENTS = 'VIEW_STUDENTS';
    public const MANAGE_STUDENTS = 'MANAGE_STUDENTS';
    public const MANAGE_STUDENT_IDS = 'MANAGE_STUDENT_IDS';
    public const MANAGE_ACADEMICS = 'MANAGE_ACADEMICS';
    public const MANAGE_DEGREES = 'MANAGE_DEGREES';
    public const MANAGE_FACILITIES = 'MANAGE_FACILITIES';
    public const MANAGE_DEPARTMENTS = 'MANAGE_DEPARTMENTS';
    public const MANAGE_OPTIONS = 'MANAGE_OPTIONS';
    public const MANAGE_LEVELS = 'MANAGE_LEVELS';
    public const MANAGE_MODULES = 'MANAGE_MODULES';
    public const MANAGE_SCHOOLS = 'MANAGE_SCHOOLS';
    public const MANAGE_CAMPUSES = 'MANAGE_CAMPUSES';
    // Reserved for a future dedicated timetable module (RBAC_IMPLEMENTATION_PLAN.md
    // Phase 3) — no timetable route/page exists yet; scheduling today lives
    // under MANAGE_MODULE_SCHEDULES instead.
    public const VIEW_TIMETABLE = 'VIEW_TIMETABLE';
    public const MANAGE_TIMETABLE = 'MANAGE_TIMETABLE';

    // Modules Management Module
    public const MANAGE_MODULE_SCHEDULES = 'MANAGE_MODULE_SCHEDULES';
    public const MANAGE_MODULE_ASSIGNMENTS = 'MANAGE_MODULE_ASSIGNMENTS';
    public const MANAGE_MODULE_REGISTRATIONS = 'MANAGE_MODULE_REGISTRATIONS';
    public const VIEW_MY_MODULES = 'VIEW_MY_MODULES';
    public const VIEW_MODULE_MARKS = 'VIEW_MODULE_MARKS';
    public const RECORD_MODULE_MARKS = 'RECORD_MODULE_MARKS';
    public const MANAGE_MODULE_MARKS = 'MANAGE_MODULE_MARKS';
    /** Confirm a mark sheet (locking it) and re-open a confirmed one. Registry-only. */
    public const CONFIRM_MODULE_MARKS = 'CONFIRM_MODULE_MARKS';
    public const MANAGE_GRADING_SCALES = 'MANAGE_GRADING_SCALES';

    // HR Management
    public const VIEW_HR_EMPLOYEES = 'VIEW_HR_EMPLOYEES';
    public const MANAGE_HR_EMPLOYEES = 'MANAGE_HR_EMPLOYEES';
    public const MANAGE_LEAVE_TYPES = 'MANAGE_LEAVE_TYPES';
    public const VIEW_PAYROLL = 'VIEW_PAYROLL';
    public const MANAGE_PAYROLL = 'MANAGE_PAYROLL';
    public const VIEW_LEAVE_REQUESTS = 'VIEW_LEAVE_REQUESTS';
    public const MANAGE_LEAVE_REQUESTS = 'MANAGE_LEAVE_REQUESTS';
    public const REQUEST_LEAVE = 'REQUEST_LEAVE';
    /**
     * Per-stage leave approval. Each stage of a leave type's approval chain
     * (`leave_approval_stages.required_permission_slug`) names one of these, so
     * who signs off at which level is configuration, not code.
     *
     * The institution's own signature blocks — the same sequence the mission
     * authorisation form uses — are the role-named slugs: Vice Chancellor, then
     * HR's recommendation, then the Director of Administration & Finance, then
     * the Vice Chancellor's final authorisation. The Vice Chancellor signs twice
     * in that flow, which is why the first review and the final authorisation
     * are separate slugs rather than one.
     *
     * L1/L2 remain available for a leave type that wants a shorter, generic
     * chain instead (see LeaveApprovalService::STAGE_PERMISSIONS).
     */
    public const APPROVE_LEAVE_VC = 'APPROVE_LEAVE_VC';
    public const APPROVE_LEAVE_HR = 'APPROVE_LEAVE_HR';
    public const APPROVE_LEAVE_DAF = 'APPROVE_LEAVE_DAF';
    public const APPROVE_LEAVE_L1 = 'APPROVE_LEAVE_L1';
    public const APPROVE_LEAVE_L2 = 'APPROVE_LEAVE_L2';
    /** Final authorisation — the stage that grants the leave. */
    public const APPROVE_LEAVE_FINAL = 'APPROVE_LEAVE_FINAL';

    // Finance
    public const VIEW_FINANCE         = 'VIEW_FINANCE';
    public const MANAGE_FINANCE       = 'MANAGE_FINANCE';
    public const VIEW_FINANCE_OVERVIEW = 'VIEW_FINANCE_OVERVIEW';
    public const VIEW_FINANCE_BILLING = 'VIEW_FINANCE_BILLING';
    public const VIEW_FINANCE_APPROVALS = 'VIEW_FINANCE_APPROVALS';
    public const VIEW_FINANCE_STRUCTURES = 'VIEW_FINANCE_STRUCTURES';
    public const VIEW_FINANCE_BURSARIES = 'VIEW_FINANCE_BURSARIES';
    public const VIEW_FINANCE_SPONSORS = 'VIEW_FINANCE_SPONSORS';
    public const VIEW_FINANCE_EXPENSES = 'VIEW_FINANCE_EXPENSES';
    public const VIEW_FINANCE_REFUNDS = 'VIEW_FINANCE_REFUNDS';
    public const VIEW_FINANCE_BALANCE = 'VIEW_FINANCE_BALANCE';
    public const VIEW_FINANCE_CLEARANCE = 'VIEW_FINANCE_CLEARANCE';
    public const VIEW_FINANCE_REPORTS = 'VIEW_FINANCE_REPORTS';
    public const VIEW_MOBILE_PAYMENTS = 'VIEW_MOBILE_PAYMENTS';
    public const VIEW_ONLINE_PAYMENTS_HISTORY = 'VIEW_ONLINE_PAYMENTS_HISTORY';
    // Student self-service: view own invoices, payments, and balance
    public const MY_INVOICE           = 'MY_INVOICE';

    // Admissions
    public const MANAGE_ADMISSION_REQUIREMENTS = 'MANAGE_ADMISSION_REQUIREMENTS';
    public const MANAGE_STUDENT_APPLICATIONS = 'MANAGE_STUDENT_APPLICATIONS';
    public const VERIFY_DOCUMENTS = 'VERIFY_DOCUMENTS';
    public const MANAGE_ADMISSIONS = 'MANAGE_ADMISSIONS';
    public const VIEW_MERIT_LIST = 'VIEW_MERIT_LIST';
    public const MANAGE_MERIT_LIST = 'MANAGE_MERIT_LIST';

    // Examinations
    // VIEW_EXAMS/MANAGE_EXAMS: reserved for a future dedicated exam-scheduling
    // module (RBAC_IMPLEMENTATION_PLAN.md Phase 3) — today's exam-adjacent
    // features (deliberation, grading, module marks) are gated by their own
    // specific slugs below, not these.
    public const VIEW_EXAMS = 'VIEW_EXAMS';
    public const MANAGE_EXAMS = 'MANAGE_EXAMS';
    public const MANAGE_REVALUATIONS = 'MANAGE_REVALUATIONS';

    // Attendance
    public const VIEW_ATTENDANCE = 'VIEW_ATTENDANCE';
    public const RECORD_ATTENDANCE = 'RECORD_ATTENDANCE';
    public const MANAGE_ATTENDANCE = 'MANAGE_ATTENDANCE';

    // Student Clearance
    public const VIEW_CLEARANCE = 'VIEW_CLEARANCE';
    public const MANAGE_CLEARANCE = 'MANAGE_CLEARANCE';

    // External portals (role-bound permissions assigned via RBAC seed)
    public const ACCESS_APPLICANT_PORTAL = 'ACCESS_APPLICANT_PORTAL';
    public const ACCESS_STUDENT_PORTAL = 'ACCESS_STUDENT_PORTAL';
    // Gates the whole /api/teacher/* surface and the teacher dashboard UI.
    // Deliberately NOT reusing VIEW_MY_MODULES: the student role holds that slug
    // too, so gating on it would expose the teacher portal to every student.
    public const ACCESS_TEACHER_PORTAL = 'ACCESS_TEACHER_PORTAL';

    // Document Generation
    public const GENERATE_DOCUMENTS = 'GENERATE_DOCUMENTS';

    // Applicant self-service. Not route-gated: the applicant profile-update
    // endpoint (routes/api/applicant.php) is scoped by ApplicantMiddleware's
    // identity check instead, which is stricter than any RBAC grant could be
    // (it ties the row to the JWT's own user ID). Reserved in case a staff-
    // facing "manage own profile" screen is added later.
    public const MANAGE_OWN_PROFILE = 'MANAGE_OWN_PROFILE';

    // Messaging
    public const SEND_MESSAGES      = 'SEND_MESSAGES';
    public const MANAGE_MESSAGES    = 'MANAGE_MESSAGES';
    public const BROADCAST_MESSAGES = 'BROADCAST_MESSAGES';

    // Announcements
    public const VIEW_ANNOUNCEMENTS   = 'VIEW_ANNOUNCEMENTS';
    public const MANAGE_ANNOUNCEMENTS = 'MANAGE_ANNOUNCEMENTS';

    // Forums
    public const VIEW_FORUMS     = 'VIEW_FORUMS';
    public const MODERATE_FORUMS = 'MODERATE_FORUMS';

    // Academic Transcripts Management System (migration 066)
    public const MANAGE_TRANSCRIPT_REQUESTS   = 'MANAGE_TRANSCRIPT_REQUESTS';
    public const MANAGE_GRADUANDS             = 'MANAGE_GRADUANDS';
    public const VIEW_GRADUANDS               = 'VIEW_GRADUANDS';
    public const MANAGE_DELIBERATIONS         = 'MANAGE_DELIBERATIONS';
    public const MANAGE_ACADEMIC_CERTIFICATES = 'MANAGE_ACADEMIC_CERTIFICATES';

    // Fee Fines & Overdue Alerts (migration 067)
    public const VIEW_FINES      = 'VIEW_FINES';
    public const MANAGE_FINES    = 'MANAGE_FINES';
    public const SEND_FEE_ALERTS = 'SEND_FEE_ALERTS';

    // Academic Analytics & Reporting Dashboard
    public const VIEW_ACADEMIC_ANALYTICS = 'VIEW_ACADEMIC_ANALYTICS';

    // Gate Management Module (migration 069)
    public const VIEW_GATE_LOGS = 'VIEW_GATE_LOGS';
    public const MANAGE_GATE    = 'MANAGE_GATE';
    public const ACCESS_GATE    = 'ACCESS_GATE';

    // Employee Appraisal Module (migration 070)
    public const VIEW_APPRAISALS   = 'VIEW_APPRAISALS';
    public const MANAGE_APPRAISALS = 'MANAGE_APPRAISALS';

    // RBAC Hardening — Phase 0 (migration 095): slugs required by not-yet-built
    // Finance modules from the client's §6 matrix (Budget Execution, Payment
    // Calendar, Student Directory finance view). Kept module/action-level so
    // Registrar/HR stay excluded by omission from role_permissions, same as
    // every other Finance-only permission in this catalog.
    public const VIEW_BUDGET_EXECUTION    = 'VIEW_BUDGET_EXECUTION';
    public const MANAGE_BUDGET_EXECUTION  = 'MANAGE_BUDGET_EXECUTION';
    public const VIEW_PAYMENT_CALENDAR    = 'VIEW_PAYMENT_CALENDAR';
    public const MANAGE_PAYMENT_CALENDAR  = 'MANAGE_PAYMENT_CALENDAR';
    public const VIEW_STUDENT_DIRECTORY_FINANCE = 'VIEW_STUDENT_DIRECTORY_FINANCE';

    // Public Service Request Platform (migration 112)
    public const MANAGE_SERVICE_CATALOG        = 'MANAGE_SERVICE_CATALOG';
    public const SUBMIT_SERVICE_REQUEST        = 'SUBMIT_SERVICE_REQUEST';
    public const APPROVE_SERVICE_REQUEST_L1    = 'APPROVE_SERVICE_REQUEST_L1';
    public const APPROVE_SERVICE_REQUEST_L2    = 'APPROVE_SERVICE_REQUEST_L2';
    public const APPROVE_SERVICE_REQUEST_FINAL = 'APPROVE_SERVICE_REQUEST_FINAL';
    public const VIEW_SERVICE_REQUESTS         = 'VIEW_SERVICE_REQUESTS';
    public const VOID_SERVICE_REQUEST          = 'VOID_SERVICE_REQUEST';

    /**
     * Get all predefined system permissions.
     *
     * This list is the single source of truth — both the backend RBAC middleware
     * and the frontend `PERMISSIONS` constant must stay aligned with it.
     */
    public static function all(): array
    {
        return [
            self::MANAGE_ROLES,
            self::MANAGE_PERMISSIONS,
            self::MANAGE_USERS,
            self::VIEW_SYSTEM_LOGS,
            self::VIEW_DASHBOARD,
            self::MANAGE_ACADEMIC_YEARS,
            self::MANAGE_ACADEMIC_TERMS,
            self::MANAGE_ACADEMIC_SETTINGS,
            self::VIEW_SYSTEM_BASICS,
            self::VIEW_SETTINGS,
            self::MANAGE_SETTINGS,
            self::VIEW_STUDENTS,
            self::MANAGE_STUDENTS,
            self::MANAGE_STUDENT_IDS,
            self::MANAGE_ACADEMICS,
            self::MANAGE_DEGREES,
            self::MANAGE_FACILITIES,
            self::MANAGE_DEPARTMENTS,
            self::MANAGE_OPTIONS,
            self::MANAGE_LEVELS,
            self::MANAGE_MODULES,
            self::MANAGE_SCHOOLS,
            self::MANAGE_CAMPUSES,
            self::VIEW_TIMETABLE,
            self::MANAGE_TIMETABLE,
            self::MANAGE_MODULE_SCHEDULES,
            self::MANAGE_MODULE_ASSIGNMENTS,
            self::MANAGE_MODULE_REGISTRATIONS,
            self::VIEW_MY_MODULES,
            self::VIEW_MODULE_MARKS,
            self::RECORD_MODULE_MARKS,
            self::MANAGE_MODULE_MARKS,
            self::CONFIRM_MODULE_MARKS,
            self::MANAGE_GRADING_SCALES,
            self::VIEW_HR_EMPLOYEES,
            self::MANAGE_HR_EMPLOYEES,
            self::MANAGE_LEAVE_TYPES,
            self::VIEW_PAYROLL,
            self::MANAGE_PAYROLL,
            self::VIEW_FINANCE,
            self::VIEW_FINANCE_OVERVIEW,
            self::VIEW_FINANCE_BILLING,
            self::VIEW_FINANCE_APPROVALS,
            self::VIEW_FINANCE_STRUCTURES,
            self::VIEW_FINANCE_BURSARIES,
            self::VIEW_FINANCE_SPONSORS,
            self::VIEW_FINANCE_EXPENSES,
            self::VIEW_FINANCE_REFUNDS,
            self::VIEW_FINANCE_BALANCE,
            self::VIEW_FINANCE_CLEARANCE,
            self::VIEW_FINANCE_REPORTS,
            self::VIEW_LEAVE_REQUESTS,
            self::MANAGE_LEAVE_REQUESTS,
            self::REQUEST_LEAVE,
            self::APPROVE_LEAVE_VC,
            self::APPROVE_LEAVE_HR,
            self::APPROVE_LEAVE_DAF,
            self::APPROVE_LEAVE_L1,
            self::APPROVE_LEAVE_L2,
            self::APPROVE_LEAVE_FINAL,
            self::MANAGE_FINANCE,
            self::VIEW_MOBILE_PAYMENTS,
            self::VIEW_ONLINE_PAYMENTS_HISTORY,
            self::MY_INVOICE,
            self::MANAGE_ADMISSION_REQUIREMENTS,
            self::MANAGE_STUDENT_APPLICATIONS,
            self::VERIFY_DOCUMENTS,
            self::MANAGE_ADMISSIONS,
            self::VIEW_MERIT_LIST,
            self::MANAGE_MERIT_LIST,
            self::VIEW_EXAMS,
            self::MANAGE_EXAMS,
            self::MANAGE_REVALUATIONS,
            self::VIEW_ATTENDANCE,
            self::RECORD_ATTENDANCE,
            self::MANAGE_ATTENDANCE,
            self::VIEW_CLEARANCE,
            self::MANAGE_CLEARANCE,
            self::ACCESS_APPLICANT_PORTAL,
            self::ACCESS_STUDENT_PORTAL,
            self::ACCESS_TEACHER_PORTAL,
            self::GENERATE_DOCUMENTS,
            self::MANAGE_OWN_PROFILE,
            self::SEND_MESSAGES,
            self::MANAGE_MESSAGES,
            self::BROADCAST_MESSAGES,
            self::VIEW_ANNOUNCEMENTS,
            self::MANAGE_ANNOUNCEMENTS,
            self::VIEW_FORUMS,
            self::MODERATE_FORUMS,
            self::MANAGE_TRANSCRIPT_REQUESTS,
            self::MANAGE_GRADUANDS,
            self::VIEW_GRADUANDS,
            self::MANAGE_DELIBERATIONS,
            self::MANAGE_ACADEMIC_CERTIFICATES,
            self::VIEW_FINES,
            self::MANAGE_FINES,
            self::SEND_FEE_ALERTS,
            self::VIEW_ACADEMIC_ANALYTICS,
            self::VIEW_GATE_LOGS,
            self::MANAGE_GATE,
            self::ACCESS_GATE,
            self::VIEW_APPRAISALS,
            self::MANAGE_APPRAISALS,
            self::VIEW_BUDGET_EXECUTION,
            self::MANAGE_BUDGET_EXECUTION,
            self::VIEW_PAYMENT_CALENDAR,
            self::MANAGE_PAYMENT_CALENDAR,
            self::VIEW_STUDENT_DIRECTORY_FINANCE,
            self::MANAGE_SERVICE_CATALOG,
            self::SUBMIT_SERVICE_REQUEST,
            self::APPROVE_SERVICE_REQUEST_L1,
            self::APPROVE_SERVICE_REQUEST_L2,
            self::APPROVE_SERVICE_REQUEST_FINAL,
            self::VIEW_SERVICE_REQUESTS,
            self::VOID_SERVICE_REQUEST,
        ];
    }
}
