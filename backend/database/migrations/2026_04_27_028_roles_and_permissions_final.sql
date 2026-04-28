-- =============================================================================
-- 2026_04_27_028_roles_and_permissions_final.sql
--
-- Single, authoritative RBAC seed — replaces 025 and 026.
-- Safe to run multiple times (idempotent throughout).
--
-- What this does:
--   §1  Canonical permission categories (12) — no hardcoded IDs
--   §2  All 53 permissions, grouped by category
--   §3  Fix role ID 1: was mislabelled "applicant" → must be "superadmin"
--   §4  Ensure all 8 system roles exist (no hardcoded IDs)
--   §5  Rebuild role_permissions for every role (slug-based, no ID hardcoding)
--   §6  Fix orphaned users whose role_id points to a non-existent role
-- =============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- =============================================================================
-- §1  CANONICAL PERMISSION CATEGORIES
--     INSERT IGNORE preserves IDs assigned on first run across re-runs.
--     12 categories — identified by name (the unique natural key).
-- =============================================================================
INSERT IGNORE INTO `permission_categories` (`name`, `description`) VALUES
('Administration',        'System-wide controls: users, roles, permissions, logs.'),
('System Settings',       'Global configuration: academic years, terms, basics.'),
('Academic Registry',     'Students, departments, modules, degrees, schools, timetable.'),
('Modules Management',    'Module schedules, assignments, registrations, marks.'),
('Examinations',          'Exam scheduling, results, and official transcripts.'),
('Attendance',            'Student attendance recording and tracking.'),
('Admissions',            'Prospective-student pipeline: requirements, applications, offers.'),
('HR Management',         'Staff, employees, payroll, and leave management.'),
('Finance',               'Student fees, payments, expenses, and financial reports.'),
('Student Clearance',     'Final-year clearance process for graduation.'),
('External Portals',      'Self-service portal access for applicants and students.'),
('Applicant Self-Service','Applicant-facing profile and document management.');

-- Resolve category IDs by name — no hardcoded IDs anywhere below
SET @cat_admin    = (SELECT id FROM permission_categories WHERE name = 'Administration'         LIMIT 1);
SET @cat_system   = (SELECT id FROM permission_categories WHERE name = 'System Settings'        LIMIT 1);
SET @cat_academic = (SELECT id FROM permission_categories WHERE name = 'Academic Registry'      LIMIT 1);
SET @cat_modules  = (SELECT id FROM permission_categories WHERE name = 'Modules Management'     LIMIT 1);
SET @cat_exams    = (SELECT id FROM permission_categories WHERE name = 'Examinations'           LIMIT 1);
SET @cat_attend   = (SELECT id FROM permission_categories WHERE name = 'Attendance'             LIMIT 1);
SET @cat_admis    = (SELECT id FROM permission_categories WHERE name = 'Admissions'             LIMIT 1);
SET @cat_hr       = (SELECT id FROM permission_categories WHERE name = 'HR Management'          LIMIT 1);
SET @cat_finance  = (SELECT id FROM permission_categories WHERE name = 'Finance'                LIMIT 1);
SET @cat_clear    = (SELECT id FROM permission_categories WHERE name = 'Student Clearance'      LIMIT 1);
SET @cat_portal   = (SELECT id FROM permission_categories WHERE name = 'External Portals'       LIMIT 1);
SET @cat_self     = (SELECT id FROM permission_categories WHERE name = 'Applicant Self-Service' LIMIT 1);

-- =============================================================================
-- §2  ALL 53 PERMISSIONS, GROUPED BY CATEGORY
--     ON DUPLICATE KEY UPDATE on slug: re-runs move drifted slugs back to the
--     correct category and refresh the human-readable name/description.
-- =============================================================================

-- ── 1. Administration ────────────────────────────────────────────────────────
INSERT INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
(@cat_admin, 'Manage Roles',       'MANAGE_ROLES',       'Create, update and delete system roles.'),
(@cat_admin, 'Manage Permissions', 'MANAGE_PERMISSIONS', 'Organise permission categories and slugs.'),
(@cat_admin, 'Manage Users',       'MANAGE_USERS',       'Full user management: create, edit, activate, deactivate.'),
(@cat_admin, 'View System Logs',   'VIEW_SYSTEM_LOGS',   'Read system activity and audit logs.')
ON DUPLICATE KEY UPDATE
    `category_id` = VALUES(`category_id`),
    `name`        = VALUES(`name`),
    `description` = VALUES(`description`);

-- ── 2. System Settings ───────────────────────────────────────────────────────
INSERT INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
(@cat_system, 'Manage Academic Years', 'MANAGE_ACADEMIC_YEARS', 'Create and update academic years.'),
(@cat_system, 'Manage Academic Terms', 'MANAGE_ACADEMIC_TERMS', 'Create and update academic terms / semesters.'),
(@cat_system, 'View System Basics',    'VIEW_SYSTEM_BASICS',    'Read basic system info, branding and health data.'),
(@cat_system, 'View Settings',         'VIEW_SETTINGS',         'Read global system configuration.'),
(@cat_system, 'Manage Settings',       'MANAGE_SETTINGS',       'Modify global system configuration.')
ON DUPLICATE KEY UPDATE
    `category_id` = VALUES(`category_id`),
    `name`        = VALUES(`name`),
    `description` = VALUES(`description`);

-- ── 3. Academic Registry ─────────────────────────────────────────────────────
INSERT INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
(@cat_academic, 'View Students',      'VIEW_STUDENTS',      'Search and view student records and profiles.'),
(@cat_academic, 'Manage Students',    'MANAGE_STUDENTS',    'Create, edit and manage student records.'),
(@cat_academic, 'Manage Academics',   'MANAGE_ACADEMICS',   'Manage general academic structure and curriculum.'),
(@cat_academic, 'Manage Degrees',     'MANAGE_DEGREES',     'CRUD for degree programmes.'),
(@cat_academic, 'Manage Facilities',  'MANAGE_FACILITIES',  'Manage rooms and physical facilities.'),
(@cat_academic, 'Manage Departments', 'MANAGE_DEPARTMENTS', 'CRUD for departments.'),
(@cat_academic, 'Manage Options',     'MANAGE_OPTIONS',     'CRUD for department options and specialisations.'),
(@cat_academic, 'Manage Levels',      'MANAGE_LEVELS',      'CRUD for study levels (Year 1, Year 2, …).'),
(@cat_academic, 'Manage Modules',     'MANAGE_MODULES',     'CRUD for course modules.'),
(@cat_academic, 'Manage Schools',     'MANAGE_SCHOOLS',     'CRUD for schools and faculties.'),
(@cat_academic, 'View Timetable',     'VIEW_TIMETABLE',     'View the academic timetable.'),
(@cat_academic, 'Manage Timetable',   'MANAGE_TIMETABLE',   'Create and edit the academic timetable.')
ON DUPLICATE KEY UPDATE
    `category_id` = VALUES(`category_id`),
    `name`        = VALUES(`name`),
    `description` = VALUES(`description`);

-- ── 4. Modules Management ────────────────────────────────────────────────────
INSERT INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
(@cat_modules, 'Manage Module Schedules',     'MANAGE_MODULE_SCHEDULES',     'Manage timetable slots for modules.'),
(@cat_modules, 'Manage Module Assignments',   'MANAGE_MODULE_ASSIGNMENTS',   'Assign teaching staff to modules.'),
(@cat_modules, 'Manage Module Registrations', 'MANAGE_MODULE_REGISTRATIONS', 'Manage student registrations per module.'),
(@cat_modules, 'View My Modules',             'VIEW_MY_MODULES',             'View modules the current user is assigned to teach.'),
(@cat_modules, 'View Module Marks',           'VIEW_MODULE_MARKS',           'Read student marks across all modules.'),
(@cat_modules, 'Record Module Marks',         'RECORD_MODULE_MARKS',         'Record and update marks for assigned modules.'),
(@cat_modules, 'Manage Module Marks',         'MANAGE_MODULE_MARKS',         'Override and finalise marks across all modules (admin).')
ON DUPLICATE KEY UPDATE
    `category_id` = VALUES(`category_id`),
    `name`        = VALUES(`name`),
    `description` = VALUES(`description`);

-- ── 5. Examinations ──────────────────────────────────────────────────────────
INSERT INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
(@cat_exams, 'View Exams',   'VIEW_EXAMS',   'View exam schedules and published results.'),
(@cat_exams, 'Manage Exams', 'MANAGE_EXAMS', 'Manage exam scheduling, invigilation and official transcripts.')
ON DUPLICATE KEY UPDATE
    `category_id` = VALUES(`category_id`),
    `name`        = VALUES(`name`),
    `description` = VALUES(`description`);

-- ── 6. Attendance ────────────────────────────────────────────────────────────
INSERT INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
(@cat_attend, 'View Attendance',   'VIEW_ATTENDANCE',   'View student attendance records and session logs.'),
(@cat_attend, 'Record Attendance', 'RECORD_ATTENDANCE', 'Record student attendance for a session.'),
(@cat_attend, 'Manage Attendance', 'MANAGE_ATTENDANCE', 'Manage attendance settings, sessions and override records.')
ON DUPLICATE KEY UPDATE
    `category_id` = VALUES(`category_id`),
    `name`        = VALUES(`name`),
    `description` = VALUES(`description`);

-- ── 7. Admissions ────────────────────────────────────────────────────────────
INSERT INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
(@cat_admis, 'Manage Admission Requirements', 'MANAGE_ADMISSION_REQUIREMENTS', 'Configure document and requirement checklists per intake.'),
(@cat_admis, 'Manage Student Applications',   'MANAGE_STUDENT_APPLICATIONS',   'View, filter, and action student application submissions.'),
(@cat_admis, 'Verify Documents',              'VERIFY_DOCUMENTS',              'Approve or reject applicant-uploaded documents.'),
(@cat_admis, 'Manage Admissions',             'MANAGE_ADMISSIONS',             'Handle enrolment decisions, intakes and admission offers.'),
(@cat_admis, 'View Merit List',               'VIEW_MERIT_LIST',               'View the generated merit/ranking lists.'),
(@cat_admis, 'Manage Merit List',             'MANAGE_MERIT_LIST',             'Modify algorithm settings, run and publish merit lists.')
ON DUPLICATE KEY UPDATE
    `category_id` = VALUES(`category_id`),
    `name`        = VALUES(`name`),
    `description` = VALUES(`description`);

-- ── 8. HR Management ─────────────────────────────────────────────────────────
INSERT INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
(@cat_hr, 'View HR Employees',     'VIEW_HR_EMPLOYEES',     'Read employee list and individual profiles.'),
(@cat_hr, 'Manage HR Employees',   'MANAGE_HR_EMPLOYEES',   'Create and edit employee records, contracts and documents.'),
(@cat_hr, 'Manage Leave Types',    'MANAGE_LEAVE_TYPES',    'CRUD for leave type definitions (Annual, Sick, etc.).'),
(@cat_hr, 'View Leave Requests',   'VIEW_LEAVE_REQUESTS',   'View all employee leave requests and their statuses.'),
(@cat_hr, 'Manage Leave Requests', 'MANAGE_LEAVE_REQUESTS', 'Approve, reject and manage employee leave requests.'),
(@cat_hr, 'View Payroll',          'VIEW_PAYROLL',          'View employee payroll slips and payroll summaries.'),
(@cat_hr, 'Manage Payroll',        'MANAGE_PAYROLL',        'Generate, approve and process monthly payroll runs.')
ON DUPLICATE KEY UPDATE
    `category_id` = VALUES(`category_id`),
    `name`        = VALUES(`name`),
    `description` = VALUES(`description`);

-- ── 9. Finance ───────────────────────────────────────────────────────────────
INSERT INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
(@cat_finance, 'View Finance',   'VIEW_FINANCE',   'Read financial records: invoices, payments, balances.'),
(@cat_finance, 'Manage Finance', 'MANAGE_FINANCE', 'Manage fees, billing, payments, waivers and expense records.')
ON DUPLICATE KEY UPDATE
    `category_id` = VALUES(`category_id`),
    `name`        = VALUES(`name`),
    `description` = VALUES(`description`);

-- ── 10. Student Clearance ────────────────────────────────────────────────────
INSERT INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
(@cat_clear, 'View Clearance',   'VIEW_CLEARANCE',   'View student clearance status and outstanding items.'),
(@cat_clear, 'Manage Clearance', 'MANAGE_CLEARANCE', 'Process, approve and flag student clearance records.')
ON DUPLICATE KEY UPDATE
    `category_id` = VALUES(`category_id`),
    `name`        = VALUES(`name`),
    `description` = VALUES(`description`);

-- ── 11. External Portals ─────────────────────────────────────────────────────
INSERT INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
(@cat_portal, 'Access Applicant Portal', 'ACCESS_APPLICANT_PORTAL', 'Self-service portal access for prospective students.'),
(@cat_portal, 'Access Student Portal',   'ACCESS_STUDENT_PORTAL',   'Self-service portal access for enrolled students.')
ON DUPLICATE KEY UPDATE
    `category_id` = VALUES(`category_id`),
    `name`        = VALUES(`name`),
    `description` = VALUES(`description`);

-- ── 12. Applicant Self-Service ───────────────────────────────────────────────
INSERT INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
(@cat_self, 'Manage Own Profile', 'MANAGE_OWN_PROFILE', 'Applicant self-management: edit their own profile and upload documents.')
ON DUPLICATE KEY UPDATE
    `category_id` = VALUES(`category_id`),
    `name`        = VALUES(`name`),
    `description` = VALUES(`description`);

-- =============================================================================
-- §3  FIX ROLE ID 1 — was mislabelled "applicant", must be "superadmin".
--     Admin users all carry role_id = 1; the JWT encodes the role name, so
--     controllers checking `role === 'superadmin'` require this correction.
-- =============================================================================
UPDATE `roles`
SET  `name`        = 'superadmin',
     `description` = 'Full system access — can do everything.'
WHERE `id` = 1;

-- =============================================================================
-- §4  ENSURE ALL 8 SYSTEM ROLES EXIST (no hardcoded IDs)
-- =============================================================================
INSERT IGNORE INTO `roles` (`name`, `description`) VALUES
('superadmin',      'Full system access — can do everything.'),
('admin',           'Institution administrator — broad access, cannot manage roles/permissions.'),
('registrar',       'Academic registrar — manages students, admissions, and academic structure.'),
('hr_manager',      'HR manager — manages employees, payroll, and leave.'),
('lecturer',        'Teaching staff — records attendance and marks for assigned modules.'),
('finance_officer', 'Finance officer — manages fees, payments, and clearance.'),
('applicant',       'Prospective student — access to the application portal only.'),
('student',         'Enrolled student — access to their own academic and financial records.');

-- Resolve role IDs by name — no hardcoded IDs in any permission assignment below
SET @r_superadmin    = (SELECT id FROM roles WHERE name = 'superadmin'      LIMIT 1);
SET @r_admin         = (SELECT id FROM roles WHERE name = 'admin'           LIMIT 1);
SET @r_registrar     = (SELECT id FROM roles WHERE name = 'registrar'       LIMIT 1);
SET @r_hr            = (SELECT id FROM roles WHERE name = 'hr_manager'      LIMIT 1);
SET @r_lecturer      = (SELECT id FROM roles WHERE name = 'lecturer'        LIMIT 1);
SET @r_finance       = (SELECT id FROM roles WHERE name = 'finance_officer' LIMIT 1);
SET @r_applicant     = (SELECT id FROM roles WHERE name = 'applicant'       LIMIT 1);
SET @r_student       = (SELECT id FROM roles WHERE name = 'student'         LIMIT 1);

-- =============================================================================
-- §5  REBUILD ROLE → PERMISSION MATRIX
--     Each role: DELETE existing rows, then INSERT the correct set by slug.
--     Using slug-based lookup means no permission ID is ever hardcoded.
-- =============================================================================

-- ── Superadmin — all permissions ─────────────────────────────────────────────
DELETE FROM `role_permissions` WHERE `role_id` = @r_superadmin;
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT @r_superadmin, `id` FROM `permissions`;

-- ── Admin — everything except role/permission management ─────────────────────
DELETE FROM `role_permissions` WHERE `role_id` = @r_admin;
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT @r_admin, id FROM `permissions`
WHERE slug NOT IN ('MANAGE_ROLES', 'MANAGE_PERMISSIONS');

-- ── Registrar ─────────────────────────────────────────────────────────────────
DELETE FROM `role_permissions` WHERE `role_id` = @r_registrar;
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT @r_registrar, id FROM `permissions`
WHERE slug IN (
    'VIEW_STUDENTS',       'MANAGE_STUDENTS',
    'MANAGE_ACADEMICS',    'MANAGE_DEGREES',      'MANAGE_DEPARTMENTS',
    'MANAGE_OPTIONS',      'MANAGE_LEVELS',        'MANAGE_MODULES',
    'MANAGE_SCHOOLS',      'MANAGE_FACILITIES',
    'VIEW_TIMETABLE',      'MANAGE_TIMETABLE',
    'MANAGE_ACADEMIC_YEARS', 'MANAGE_ACADEMIC_TERMS',
    'VIEW_SYSTEM_BASICS',  'VIEW_SETTINGS',
    'MANAGE_MODULE_SCHEDULES', 'MANAGE_MODULE_ASSIGNMENTS',
    'MANAGE_MODULE_REGISTRATIONS', 'VIEW_MY_MODULES',
    'VIEW_MODULE_MARKS',   'MANAGE_MODULE_MARKS',
    'MANAGE_ADMISSION_REQUIREMENTS', 'MANAGE_STUDENT_APPLICATIONS',
    'VERIFY_DOCUMENTS',    'MANAGE_ADMISSIONS',
    'VIEW_MERIT_LIST',     'MANAGE_MERIT_LIST',
    'VIEW_EXAMS',          'MANAGE_EXAMS',
    'VIEW_ATTENDANCE',     'MANAGE_ATTENDANCE',
    'VIEW_CLEARANCE',      'MANAGE_CLEARANCE',
    'VIEW_FINANCE'
);

-- ── HR Manager ────────────────────────────────────────────────────────────────
DELETE FROM `role_permissions` WHERE `role_id` = @r_hr;
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT @r_hr, id FROM `permissions`
WHERE slug IN (
    'VIEW_HR_EMPLOYEES',   'MANAGE_HR_EMPLOYEES',
    'MANAGE_LEAVE_TYPES',  'VIEW_LEAVE_REQUESTS', 'MANAGE_LEAVE_REQUESTS',
    'VIEW_PAYROLL',        'MANAGE_PAYROLL',
    'VIEW_SYSTEM_BASICS',  'VIEW_SETTINGS'
);

-- ── Lecturer ──────────────────────────────────────────────────────────────────
DELETE FROM `role_permissions` WHERE `role_id` = @r_lecturer;
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT @r_lecturer, id FROM `permissions`
WHERE slug IN (
    'VIEW_STUDENTS',
    'VIEW_MY_MODULES',
    'VIEW_MODULE_MARKS',   'RECORD_MODULE_MARKS',
    'VIEW_ATTENDANCE',     'RECORD_ATTENDANCE',
    'VIEW_TIMETABLE',
    'VIEW_SYSTEM_BASICS'
);

-- ── Finance Officer ───────────────────────────────────────────────────────────
DELETE FROM `role_permissions` WHERE `role_id` = @r_finance;
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT @r_finance, id FROM `permissions`
WHERE slug IN (
    'VIEW_FINANCE',        'MANAGE_FINANCE',
    'VIEW_STUDENTS',
    'VIEW_CLEARANCE',      'MANAGE_CLEARANCE',
    'VIEW_SYSTEM_BASICS',  'VIEW_SETTINGS'
);

-- ── Applicant — portal + own-profile only ────────────────────────────────────
DELETE FROM `role_permissions` WHERE `role_id` = @r_applicant;
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT @r_applicant, id FROM `permissions`
WHERE slug IN (
    'ACCESS_APPLICANT_PORTAL',
    'MANAGE_OWN_PROFILE'
);

-- ── Student — read-only self-service ──────────────────────────────────────────
DELETE FROM `role_permissions` WHERE `role_id` = @r_student;
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT @r_student, id FROM `permissions`
WHERE slug IN (
    'ACCESS_STUDENT_PORTAL',
    'VIEW_MODULE_MARKS',
    'VIEW_ATTENDANCE',
    'VIEW_FINANCE',
    'VIEW_CLEARANCE',
    'VIEW_TIMETABLE'
);

-- =============================================================================
-- §6  FIX ORPHANED USERS
--     Users whose role_id references a non-existent role get reassigned.
-- =============================================================================

-- role_id = 2 with no matching role → hr_manager
UPDATE `users`
SET `role_id` = (SELECT id FROM `roles` WHERE `name` = 'hr_manager' LIMIT 1)
WHERE `role_id` = 2
  AND NOT EXISTS (SELECT 1 FROM `roles` WHERE `id` = 2);

-- Any remaining role_id with no match → student (safest default)
UPDATE `users` u
SET u.`role_id` = (SELECT id FROM `roles` WHERE `name` = 'student' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM `roles` r WHERE r.`id` = u.`role_id`);

SET FOREIGN_KEY_CHECKS = 1;
