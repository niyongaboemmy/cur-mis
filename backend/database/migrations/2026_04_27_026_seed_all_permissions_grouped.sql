-- =============================================================================
-- 2026_04_27_026_seed_all_permissions_grouped.sql
--
-- Single, authoritative, grouped permission seed.
-- Safe to run multiple times: categories use ON DUPLICATE KEY UPDATE on name,
-- permissions use ON DUPLICATE KEY UPDATE on slug.
--
-- Groups (12 categories):
--   1. Administration
--   2. System Settings
--   3. Academic Registry
--   4. Modules Management
--   5. Examinations
--   6. Attendance
--   7. Admissions
--   8. HR Management
--   9. Finance
--  10. Student Clearance
--  11. External Portals
--  12. Applicant Self-Service
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1  Canonical categories
--         Identified by name (the unique natural key for categories).
--         INSERT IGNORE skips the row if the name already exists, so IDs that
--         were assigned on first run are preserved across re-runs.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT IGNORE INTO `permission_categories` (`name`, `description`) VALUES
('Administration',       'System-wide controls: users, roles, permissions, logs.'),
('System Settings',      'Global configuration: academic years, terms, basics.'),
('Academic Registry',    'Students, departments, modules, degrees, schools, timetable.'),
('Modules Management',   'Module schedules, assignments, registrations, marks.'),
('Examinations',         'Exam scheduling, results, and official transcripts.'),
('Attendance',           'Student attendance recording and tracking.'),
('Admissions',           'Prospective-student pipeline: requirements, applications, offers.'),
('HR Management',        'Staff, employees, payroll, and leave management.'),
('Finance',              'Student fees, payments, expenses, and financial reports.'),
('Student Clearance',    'Final-year clearance process for graduation.'),
('External Portals',     'Self-service portal access for applicants and students.'),
('Applicant Self-Service','Applicant-facing profile and document management.');

-- Resolve category IDs by name into session variables
-- (avoids any hardcoded IDs; works regardless of insertion order)
SET @cat_admin    = (SELECT id FROM permission_categories WHERE name = 'Administration'        LIMIT 1);
SET @cat_system   = (SELECT id FROM permission_categories WHERE name = 'System Settings'       LIMIT 1);
SET @cat_academic = (SELECT id FROM permission_categories WHERE name = 'Academic Registry'     LIMIT 1);
SET @cat_modules  = (SELECT id FROM permission_categories WHERE name = 'Modules Management'    LIMIT 1);
SET @cat_exams    = (SELECT id FROM permission_categories WHERE name = 'Examinations'          LIMIT 1);
SET @cat_attend   = (SELECT id FROM permission_categories WHERE name = 'Attendance'            LIMIT 1);
SET @cat_admis    = (SELECT id FROM permission_categories WHERE name = 'Admissions'            LIMIT 1);
SET @cat_hr       = (SELECT id FROM permission_categories WHERE name = 'HR Management'         LIMIT 1);
SET @cat_finance  = (SELECT id FROM permission_categories WHERE name = 'Finance'               LIMIT 1);
SET @cat_clear    = (SELECT id FROM permission_categories WHERE name = 'Student Clearance'     LIMIT 1);
SET @cat_portal   = (SELECT id FROM permission_categories WHERE name = 'External Portals'      LIMIT 1);
SET @cat_self     = (SELECT id FROM permission_categories WHERE name = 'Applicant Self-Service'LIMIT 1);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2  All permissions, grouped by category
--         The slug column has a UNIQUE index → ON DUPLICATE KEY UPDATE moves
--         any slug that drifted to the wrong category back to the right one
--         and refreshes its human-readable name and description.
-- ─────────────────────────────────────────────────────────────────────────────

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

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3  Assign every permission to the superadmin role (resolved by name).
--         INSERT IGNORE means re-runs add any new slugs without touching the
--         existing rows.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM `roles` r
CROSS JOIN `permissions` p
WHERE r.name = 'superadmin';
