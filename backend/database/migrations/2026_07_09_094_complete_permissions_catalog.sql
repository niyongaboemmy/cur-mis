-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 094: Complete the permissions catalog + fix broken seed statements
--
-- AUDIT: every slug in `App\Constants\Permissions::all()` (95 total, the
-- single source of truth per its own docblock) was checked against every
-- prior migration that seeds `permissions`. Findings:
--
--   1. `2026_05_29_067_fee_fines_and_alerts.sql` inserts VIEW_FINES,
--      MANAGE_FINES, SEND_FEE_ALERTS via
--        INSERT IGNORE INTO permissions (slug, description, created_at) ...
--      omitting `category_id` and `name`, both `NOT NULL` with no DEFAULT
--      (see 2024_04_21_003_create_rbac_tables.sql). That statement cannot
--      succeed against the real schema — it always throws a NOT NULL
--      violation, so these three permissions were never actually seeded.
--
--   2. VIEW_APPRAISALS / MANAGE_APPRAISALS were already fixed in migration
--      093, but never granted to any role (070 seeded no grants either) —
--      HR management staff have no way to use the appraisal module despite
--      AppraisalController already enforcing these permissions.
--
--   3. This migration also re-affirms catalog rows for every OTHER
--      permission slug (idempotent INSERT IGNORE, matching the category
--      each permission was originally seeded under), as a single
--      comprehensive pass — cheap, safe no-ops for anything already correct,
--      and a real fix for anything that silently failed the way #1 did.
--
-- Every category is resolved by name via COALESCE fallback (never a raw
-- numeric id), and every INSERT is IGNORE/idempotent — safe to re-run, and
-- does not touch any existing role_permissions grant except the additive
-- ones explicitly listed in the final section, all backed by a grant
-- pattern that already exists elsewhere in the migration history.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── §1  Resolve every category id up front (name-based, drift-tolerant) ──────

SET @cat_admin       := (SELECT id FROM permission_categories WHERE name = 'Administration' LIMIT 1);
SET @cat_academic    := (SELECT id FROM permission_categories WHERE name = 'Academic Registry' LIMIT 1);
SET @cat_system      := (SELECT id FROM permission_categories WHERE name = 'System Settings' LIMIT 1);
SET @cat_modules     := (SELECT id FROM permission_categories WHERE name = 'Modules Management' LIMIT 1);
SET @cat_hr          := (SELECT id FROM permission_categories WHERE name = 'HR Management' LIMIT 1);
SET @cat_finance     := (SELECT id FROM permission_categories WHERE name = 'Finance' LIMIT 1);
SET @cat_finance     := COALESCE(@cat_finance, (SELECT id FROM permission_categories WHERE name = 'Finance & Accounts' LIMIT 1));
SET @cat_admissions  := (SELECT id FROM permission_categories WHERE name = 'Admissions' LIMIT 1);
SET @cat_exams       := (SELECT id FROM permission_categories WHERE name = 'Examinations' LIMIT 1);
SET @cat_attendance  := (SELECT id FROM permission_categories WHERE name = 'Attendance' LIMIT 1);
SET @cat_clearance   := (SELECT id FROM permission_categories WHERE name = 'Student Clearance' LIMIT 1);
SET @cat_portals     := (SELECT id FROM permission_categories WHERE name = 'External Portals' LIMIT 1);
SET @cat_portals     := COALESCE(@cat_portals, (SELECT id FROM permission_categories WHERE name = 'External Portal' LIMIT 1));
SET @cat_messaging   := (SELECT id FROM permission_categories WHERE name = 'Messaging' LIMIT 1);
SET @cat_gate        := (SELECT id FROM permission_categories WHERE name = 'Gate Management' LIMIT 1);
SET @cat_docgen      := (SELECT id FROM permission_categories WHERE name = 'Document Generation' LIMIT 1);

-- Last-resort fallback so a NOT NULL violation is never possible even if a
-- category name has drifted beyond what's listed above.
SET @cat_fallback    := (SELECT id FROM permission_categories ORDER BY id LIMIT 1);
SET @cat_admin      := COALESCE(@cat_admin, @cat_fallback);
SET @cat_academic   := COALESCE(@cat_academic, @cat_fallback);
SET @cat_system     := COALESCE(@cat_system, @cat_fallback);
SET @cat_modules    := COALESCE(@cat_modules, @cat_fallback);
SET @cat_hr         := COALESCE(@cat_hr, @cat_fallback);
SET @cat_finance    := COALESCE(@cat_finance, @cat_fallback);
SET @cat_admissions := COALESCE(@cat_admissions, @cat_fallback);
SET @cat_exams      := COALESCE(@cat_exams, @cat_fallback);
SET @cat_attendance := COALESCE(@cat_attendance, @cat_fallback);
SET @cat_clearance  := COALESCE(@cat_clearance, @cat_fallback);
SET @cat_portals    := COALESCE(@cat_portals, @cat_fallback);
SET @cat_messaging  := COALESCE(@cat_messaging, @cat_fallback);
SET @cat_gate       := COALESCE(@cat_gate, @cat_fallback);
SET @cat_docgen     := COALESCE(@cat_docgen, @cat_fallback);

-- ── §2  Fix migration 067's broken insert: VIEW_FINES, MANAGE_FINES, SEND_FEE_ALERTS ──

INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
  (@cat_finance, 'View Fines',      'VIEW_FINES',      'View student fines list'),
  (@cat_finance, 'Manage Fines',    'MANAGE_FINES',    'Issue, edit, waive, and delete student fines'),
  (@cat_finance, 'Send Fee Alerts', 'SEND_FEE_ALERTS', 'Trigger overdue fee alert notifications');

-- ── §3  Comprehensive catalog pass — every remaining permission, idempotent ───

INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`)
SELECT category_id, name, slug, description FROM (
    SELECT @cat_admin AS category_id, 'Manage Roles' AS name, 'MANAGE_ROLES' AS slug, 'Create, update and delete system roles.' AS description UNION ALL
    SELECT @cat_admin, 'Manage Permissions', 'MANAGE_PERMISSIONS', 'Organize permissions and categories.' UNION ALL
    SELECT @cat_admin, 'Manage Users', 'MANAGE_USERS', 'Administrative user management (CRUD, roles, status).' UNION ALL
    SELECT @cat_admin, 'View System Logs', 'VIEW_SYSTEM_LOGS', 'View the system audit log.' UNION ALL
    SELECT @cat_admin, 'View Dashboard', 'VIEW_DASHBOARD', 'View the institution-wide analytics/overview dashboard.' UNION ALL

    SELECT @cat_system, 'Manage Academic Years', 'MANAGE_ACADEMIC_YEARS', 'Create and manage academic years.' UNION ALL
    SELECT @cat_system, 'Manage Academic Terms', 'MANAGE_ACADEMIC_TERMS', 'Create and manage academic terms/semesters.' UNION ALL
    SELECT @cat_system, 'View System Basics', 'VIEW_SYSTEM_BASICS', 'View core system reference data.' UNION ALL
    SELECT @cat_system, 'View Settings', 'VIEW_SETTINGS', 'View system settings.' UNION ALL
    SELECT @cat_system, 'Manage Settings', 'MANAGE_SETTINGS', 'Modify system settings.' UNION ALL

    SELECT @cat_academic, 'View Students', 'VIEW_STUDENTS', 'View student records.' UNION ALL
    SELECT @cat_academic, 'Manage Students', 'MANAGE_STUDENTS', 'Create, edit and delete student records.' UNION ALL
    SELECT @cat_academic, 'Manage Student IDs', 'MANAGE_STUDENT_IDS', 'Issue and manage student ID cards.' UNION ALL
    SELECT @cat_academic, 'Manage Academics', 'MANAGE_ACADEMICS', 'Manage academic structure.' UNION ALL
    SELECT @cat_academic, 'Manage Degrees', 'MANAGE_DEGREES', 'Create and manage degree programmes.' UNION ALL
    SELECT @cat_academic, 'Manage Facilities', 'MANAGE_FACILITIES', 'Manage campus facilities.' UNION ALL
    SELECT @cat_academic, 'Manage Departments', 'MANAGE_DEPARTMENTS', 'Create and manage departments.' UNION ALL
    SELECT @cat_academic, 'Manage Options', 'MANAGE_OPTIONS', 'Create and manage academic options.' UNION ALL
    SELECT @cat_academic, 'Manage Levels', 'MANAGE_LEVELS', 'Create and manage academic levels.' UNION ALL
    SELECT @cat_academic, 'Manage Modules', 'MANAGE_MODULES', 'Create and manage course modules.' UNION ALL
    SELECT @cat_academic, 'Manage Schools', 'MANAGE_SCHOOLS', 'Create and manage schools/faculties.' UNION ALL
    SELECT @cat_academic, 'Manage Campuses', 'MANAGE_CAMPUSES', 'CRUD for campuses (physical sites and their locations).' UNION ALL
    SELECT @cat_academic, 'View Timetable', 'VIEW_TIMETABLE', 'View the class timetable.' UNION ALL
    SELECT @cat_academic, 'Manage Timetable', 'MANAGE_TIMETABLE', 'Create and edit the class timetable.' UNION ALL
    SELECT @cat_academic, 'Manage Transcript Requests', 'MANAGE_TRANSCRIPT_REQUESTS', 'Approve, reject and dispatch student transcript requests.' UNION ALL
    SELECT @cat_academic, 'Manage Graduands', 'MANAGE_GRADUANDS', 'Add, approve and manage the graduation list.' UNION ALL
    SELECT @cat_academic, 'View Graduands', 'VIEW_GRADUANDS', 'View graduation eligibility list and graduation list.' UNION ALL
    SELECT @cat_academic, 'Manage Deliberations', 'MANAGE_DELIBERATIONS', 'Create and finalise academic deliberation sessions.' UNION ALL
    SELECT @cat_academic, 'Manage Academic Certificates', 'MANAGE_ACADEMIC_CERTIFICATES', 'Issue, dispatch and revoke academic certificates.' UNION ALL
    SELECT @cat_academic, 'View Academic Analytics', 'VIEW_ACADEMIC_ANALYTICS', 'Access the academic analytics and reporting dashboard.' UNION ALL

    SELECT @cat_modules, 'Manage Module Schedules', 'MANAGE_MODULE_SCHEDULES', 'Schedule module sessions.' UNION ALL
    SELECT @cat_modules, 'Manage Module Assignments', 'MANAGE_MODULE_ASSIGNMENTS', 'Assign lecturers to modules.' UNION ALL
    SELECT @cat_modules, 'Manage Module Registrations', 'MANAGE_MODULE_REGISTRATIONS', 'Manage student module registrations.' UNION ALL
    SELECT @cat_modules, 'View My Modules', 'VIEW_MY_MODULES', 'View modules assigned to the current user.' UNION ALL
    SELECT @cat_modules, 'View Module Marks', 'VIEW_MODULE_MARKS', 'View recorded module marks.' UNION ALL
    SELECT @cat_modules, 'Record Module Marks', 'RECORD_MODULE_MARKS', 'Record module marks.' UNION ALL
    SELECT @cat_modules, 'Manage Module Marks', 'MANAGE_MODULE_MARKS', 'Edit/override recorded module marks.' UNION ALL
    SELECT @cat_modules, 'Manage Grading Scales', 'MANAGE_GRADING_SCALES', 'Configure the institution grading scale.' UNION ALL

    SELECT @cat_hr, 'View HR Employees', 'VIEW_HR_EMPLOYEES', 'View employee records.' UNION ALL
    SELECT @cat_hr, 'Manage HR Employees', 'MANAGE_HR_EMPLOYEES', 'Create, edit and delete employee records.' UNION ALL
    SELECT @cat_hr, 'Manage Leave Types', 'MANAGE_LEAVE_TYPES', 'Configure leave types.' UNION ALL
    SELECT @cat_hr, 'View Payroll', 'VIEW_PAYROLL', 'View payroll slips and summaries.' UNION ALL
    SELECT @cat_hr, 'Manage Payroll', 'MANAGE_PAYROLL', 'Process and manage payroll.' UNION ALL
    SELECT @cat_hr, 'View Leave Requests', 'VIEW_LEAVE_REQUESTS', 'View employee leave requests.' UNION ALL
    SELECT @cat_hr, 'Manage Leave Requests', 'MANAGE_LEAVE_REQUESTS', 'Approve or reject leave requests.' UNION ALL
    SELECT @cat_hr, 'Request Leave', 'REQUEST_LEAVE', 'Submit own leave requests (self-service).' UNION ALL
    SELECT @cat_hr, 'View Appraisals', 'VIEW_APPRAISALS', 'View employee appraisal periods, criteria, and records.' UNION ALL
    SELECT @cat_hr, 'Manage Appraisals', 'MANAGE_APPRAISALS', 'Create appraisal periods/criteria and manage appraisal reviews.' UNION ALL

    SELECT @cat_finance, 'View Finance', 'VIEW_FINANCE', 'View finance module.' UNION ALL
    SELECT @cat_finance, 'Manage Finance', 'MANAGE_FINANCE', 'Manage finance module.' UNION ALL
    SELECT @cat_finance, 'View Finance Overview', 'VIEW_FINANCE_OVERVIEW', 'View the finance overview dashboard.' UNION ALL
    SELECT @cat_finance, 'View Finance Billing', 'VIEW_FINANCE_BILLING', 'View invoices and billing.' UNION ALL
    SELECT @cat_finance, 'View Finance Approvals', 'VIEW_FINANCE_APPROVALS', 'View finance approval queues.' UNION ALL
    SELECT @cat_finance, 'View Finance Structures', 'VIEW_FINANCE_STRUCTURES', 'View fee structures.' UNION ALL
    SELECT @cat_finance, 'View Finance Bursaries', 'VIEW_FINANCE_BURSARIES', 'View bursaries and scholarships.' UNION ALL
    SELECT @cat_finance, 'View Finance Sponsors', 'VIEW_FINANCE_SPONSORS', 'View sponsors.' UNION ALL
    SELECT @cat_finance, 'View Finance Expenses', 'VIEW_FINANCE_EXPENSES', 'View institutional expenses.' UNION ALL
    SELECT @cat_finance, 'View Finance Refunds', 'VIEW_FINANCE_REFUNDS', 'View refund requests.' UNION ALL
    SELECT @cat_finance, 'View Finance Balance', 'VIEW_FINANCE_BALANCE', 'View student balances.' UNION ALL
    SELECT @cat_finance, 'View Finance Clearance', 'VIEW_FINANCE_CLEARANCE', 'View finance clearance records.' UNION ALL
    SELECT @cat_finance, 'View Finance Reports', 'VIEW_FINANCE_REPORTS', 'View finance reports.' UNION ALL
    SELECT @cat_finance, 'View Mobile Payments', 'VIEW_MOBILE_PAYMENTS', 'View UrubutoPay USSD / mobile money payment transactions.' UNION ALL
    SELECT @cat_finance, 'View Online Payments History', 'VIEW_ONLINE_PAYMENTS_HISTORY', 'View the legacy online payments history table from UrubutoPay and other gateways.' UNION ALL
    SELECT @cat_finance, 'View My Invoices', 'MY_INVOICE', 'Students can view their own invoices, payment history and outstanding balance.' UNION ALL

    SELECT @cat_admissions, 'Manage Admission Requirements', 'MANAGE_ADMISSION_REQUIREMENTS', 'Configure admission requirements.' UNION ALL
    SELECT @cat_admissions, 'Manage Student Applications', 'MANAGE_STUDENT_APPLICATIONS', 'Review and process student applications.' UNION ALL
    SELECT @cat_admissions, 'Verify Documents', 'VERIFY_DOCUMENTS', 'Verify applicant-submitted documents.' UNION ALL
    SELECT @cat_admissions, 'Manage Admissions', 'MANAGE_ADMISSIONS', 'Manage the admissions module.' UNION ALL
    SELECT @cat_admissions, 'View Merit List', 'VIEW_MERIT_LIST', 'View the admissions merit list.' UNION ALL
    SELECT @cat_admissions, 'Manage Merit List', 'MANAGE_MERIT_LIST', 'Manage/generate the admissions merit list.' UNION ALL

    SELECT @cat_exams, 'View Exams', 'VIEW_EXAMS', 'View examination records.' UNION ALL
    SELECT @cat_exams, 'Manage Exams', 'MANAGE_EXAMS', 'Create and manage examinations.' UNION ALL
    SELECT @cat_exams, 'Manage Revaluations', 'MANAGE_REVALUATIONS', 'Manage exam revaluation requests.' UNION ALL

    SELECT @cat_attendance, 'View Attendance', 'VIEW_ATTENDANCE', 'View attendance records.' UNION ALL
    SELECT @cat_attendance, 'Record Attendance', 'RECORD_ATTENDANCE', 'Record student attendance.' UNION ALL
    SELECT @cat_attendance, 'Manage Attendance', 'MANAGE_ATTENDANCE', 'Manage/correct attendance records.' UNION ALL

    SELECT @cat_clearance, 'View Clearance', 'VIEW_CLEARANCE', 'View student clearance records.' UNION ALL
    SELECT @cat_clearance, 'Manage Clearance', 'MANAGE_CLEARANCE', 'Manage student clearance workflow.' UNION ALL

    SELECT @cat_portals, 'Access Applicant Portal', 'ACCESS_APPLICANT_PORTAL', 'Self-service portal access for applicants.' UNION ALL
    SELECT @cat_portals, 'Access Student Portal', 'ACCESS_STUDENT_PORTAL', 'Self-service portal access for enrolled students.' UNION ALL
    SELECT @cat_portals, 'Manage Own Profile', 'MANAGE_OWN_PROFILE', 'Applicant self-management of their own profile.' UNION ALL

    SELECT @cat_docgen, 'Generate Documents', 'GENERATE_DOCUMENTS', 'Preview and generate official documents (transcripts, letters, certificates, degree awards, etc.).' UNION ALL

    SELECT @cat_messaging, 'Send Messages', 'SEND_MESSAGES', 'Compose and send internal messages.' UNION ALL
    SELECT @cat_messaging, 'Manage Messages', 'MANAGE_MESSAGES', 'View and manage all conversations (admin-level).' UNION ALL
    SELECT @cat_messaging, 'Broadcast Messages', 'BROADCAST_MESSAGES', 'Send messages to entire role groups.' UNION ALL
    SELECT @cat_messaging, 'View Announcements', 'VIEW_ANNOUNCEMENTS', 'See broadcast announcements.' UNION ALL
    SELECT @cat_messaging, 'Manage Announcements', 'MANAGE_ANNOUNCEMENTS', 'Create, edit and delete broadcast announcements.' UNION ALL
    SELECT @cat_messaging, 'View Forums', 'VIEW_FORUMS', 'View discussion forum categories, threads and posts, and participate.' UNION ALL
    SELECT @cat_messaging, 'Moderate Forums', 'MODERATE_FORUMS', 'Manage categories, pin/lock threads and remove any thread or post.' UNION ALL

    SELECT @cat_gate, 'View Gate Logs', 'VIEW_GATE_LOGS', 'View campus gate access logs.' UNION ALL
    SELECT @cat_gate, 'Manage Gate', 'MANAGE_GATE', 'Manage gate sessions and settings.' UNION ALL
    SELECT @cat_gate, 'Access Gate Verification', 'ACCESS_GATE', 'Perform gate verification scans.'
) AS catalog
WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `permissions`.`slug` = catalog.slug);

-- ── §4  Role grants — only for permissions with clear existing precedent ─────
-- (Every other permission created above is catalog-only by design, matching
-- how migrations 066/067/068 originally shipped them: an admin assigns roles
-- through the Roles & Permissions UI. These specific grants mirror an intent
-- that was ALREADY explicit in an earlier migration, just re-affirmed here
-- in case that migration's own grant step never landed.)

-- VIEW_FINES / MANAGE_FINES / SEND_FEE_ALERTS — finance staff (same roles as
-- other finance-clearance permissions; #2 above is the first time these
-- permissions actually exist, so they have never been grantable before).
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`slug` IN ('VIEW_FINES', 'MANAGE_FINES', 'SEND_FEE_ALERTS')
WHERE r.`name` IN ('superadmin', 'admin', 'finance_officer');

-- VIEW_APPRAISALS / MANAGE_APPRAISALS — HR management (mirrors the exact
-- role set migration 028 gave every other HR Management permission).
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`slug` IN ('VIEW_APPRAISALS', 'MANAGE_APPRAISALS')
WHERE r.`name` IN ('superadmin', 'admin', 'hr_manager');

-- MANAGE_CAMPUSES — superadmin (migration 032's own intended grant).
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`slug` = 'MANAGE_CAMPUSES'
WHERE r.`name` = 'superadmin';

-- Messaging — same role split migration 046 intended.
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`slug` = 'SEND_MESSAGES'
WHERE r.`name` IN ('superadmin', 'admin', 'registrar', 'hr_manager', 'finance_officer', 'lecturer');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`slug` IN ('MANAGE_MESSAGES', 'BROADCAST_MESSAGES')
WHERE r.`name` IN ('superadmin', 'admin');

-- Mobile / online payments history — finance roles (migrations 049/051/053).
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`slug` IN ('VIEW_MOBILE_PAYMENTS', 'VIEW_ONLINE_PAYMENTS_HISTORY')
WHERE r.`name` IN ('superadmin', 'admin', 'finance_officer');

-- MY_INVOICE — student self-service (migration 053's own intended grant).
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`slug` = 'MY_INVOICE'
WHERE r.`name` = 'student';

-- Forums — same role split migration 070 (discussion forums) intended.
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`slug` = 'VIEW_FORUMS'
WHERE r.`name` IN ('superadmin', 'admin', 'registrar', 'hr_manager', 'finance_officer', 'lecturer', 'HOD', 'student');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`slug` = 'MODERATE_FORUMS'
WHERE r.`name` IN ('superadmin', 'admin', 'registrar', 'HOD');
