-- =============================================================================
-- 2026_04_27_025_comprehensive_permissions_and_roles.sql
-- Single authoritative migration for the full RBAC setup.
--
-- What this does:
--   1. Consolidates permission categories (removes duplicates).
--   2. Seeds / updates every permission slug with the correct category.
--   3. Renames role ID 1 from "applicant" → "superadmin" (the ID has always
--      been used for the super-admin; it was mislabelled by an earlier seed).
--   4. Creates all system roles (superadmin, admin, registrar, hr_manager,
--      lecturer, finance_officer, applicant, student) — no hardcoded IDs.
--   5. Clears and rebuilds role_permissions for every managed role.
--   6. All statements use INSERT IGNORE / ON DUPLICATE KEY so re-runs are safe.
-- =============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- =============================================================================
-- STEP 1 — Canonical permission categories
--          Uses ON DUPLICATE KEY UPDATE so names stay tidy.
-- =============================================================================
INSERT INTO `permission_categories` (`id`, `name`, `description`) VALUES
(1,  'Administration',    'System-wide controls: users, roles, permissions.'),
(2,  'Academic Registry', 'Students, departments, modules, degrees, schools.'),
(3,  'Finance & Accounts','Student fees, billing and accounting.'),
(4,  'Examinations',      'Exam scheduling, results, and transcripts.'),
(5,  'HR Management',     'Staff, employees, payroll, and leave.'),
(6,  'System Settings',   'Global settings: academic years, terms, basics.'),
(8,  'Admissions',        'Prospective-student pipeline: requirements, offers.'),
(20, 'Attendance',        'Student attendance recording and tracking.'),
(21, 'Modules Management','Module schedules, assignments, registrations, marks.'),
(22, 'Student Clearance', 'Final-year clearance process for graduation.'),
(23, 'External Portals',  'Self-service access for applicants and students.')
ON DUPLICATE KEY UPDATE
    `name`        = VALUES(`name`),
    `description` = VALUES(`description`);

-- Remove the orphan duplicates created by earlier migrations
-- (only safe if no permissions reference them — we re-point below)
DELETE FROM `permission_categories`
WHERE `id` IN (11, 33, 34, 35)        -- old "External Portal", duplicate "Finance", "External Portals", "Applicant Self-Service"
  AND NOT EXISTS (
      SELECT 1 FROM `permissions` p WHERE p.category_id = `permission_categories`.`id`
  );

-- =============================================================================
-- STEP 2 — All permissions (INSERT IGNORE = skip if slug already exists,
--           then ON DUPLICATE KEY UPDATE keeps category & name current)
-- =============================================================================

-- ── Administration (cat 1) ────────────────────────────────────────────────────
INSERT INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
(1, 'Manage Roles',        'MANAGE_ROLES',        'Create, update and delete system roles.'),
(1, 'Manage Permissions',  'MANAGE_PERMISSIONS',  'Organise permission categories and slugs.'),
(1, 'Manage Users',        'MANAGE_USERS',        'Full user management: create, edit, deactivate.'),
(1, 'View System Logs',    'VIEW_SYSTEM_LOGS',    'Read system activity and audit logs.')
ON DUPLICATE KEY UPDATE
    `category_id` = VALUES(`category_id`),
    `name`        = VALUES(`name`),
    `description` = VALUES(`description`);

-- ── System Settings (cat 6) ───────────────────────────────────────────────────
INSERT INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
(6, 'Manage Academic Years', 'MANAGE_ACADEMIC_YEARS', 'CRUD for academic years.'),
(6, 'Manage Academic Terms', 'MANAGE_ACADEMIC_TERMS', 'CRUD for academic terms.'),
(6, 'View System Basics',    'VIEW_SYSTEM_BASICS',    'Read basic system info and branding.'),
(6, 'View Settings',         'VIEW_SETTINGS',         'Read global system settings.'),
(6, 'Manage Settings',       'MANAGE_SETTINGS',       'Modify global system settings.')
ON DUPLICATE KEY UPDATE
    `category_id` = VALUES(`category_id`),
    `name`        = VALUES(`name`),
    `description` = VALUES(`description`);

-- ── Academic Registry (cat 2) ─────────────────────────────────────────────────
INSERT INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
(2, 'View Students',        'VIEW_STUDENTS',        'Search and view student records.'),
(2, 'Manage Students',      'MANAGE_STUDENTS',      'Create and edit student records.'),
(2, 'Manage Academics',     'MANAGE_ACADEMICS',     'General academic structure management.'),
(2, 'Manage Degrees',       'MANAGE_DEGREES',       'CRUD for degree programmes.'),
(2, 'Manage Facilities',    'MANAGE_FACILITIES',    'Manage rooms and physical facilities.'),
(2, 'Manage Departments',   'MANAGE_DEPARTMENTS',   'CRUD for departments.'),
(2, 'Manage Options',       'MANAGE_OPTIONS',       'CRUD for department options/specialisations.'),
(2, 'Manage Levels',        'MANAGE_LEVELS',        'CRUD for study levels.'),
(2, 'Manage Modules',       'MANAGE_MODULES',       'CRUD for course modules.'),
(2, 'Manage Schools',       'MANAGE_SCHOOLS',       'CRUD for schools/faculties.'),
(2, 'View Timetable',       'VIEW_TIMETABLE',       'View the academic timetable.'),
(2, 'Manage Timetable',     'MANAGE_TIMETABLE',     'Create and edit the academic timetable.')
ON DUPLICATE KEY UPDATE
    `category_id` = VALUES(`category_id`),
    `name`        = VALUES(`name`),
    `description` = VALUES(`description`);

-- ── Modules Management (cat 21) ───────────────────────────────────────────────
INSERT INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
(21, 'Manage Module Schedules',    'MANAGE_MODULE_SCHEDULES',    'Manage timetable slots for modules.'),
(21, 'Manage Module Assignments',  'MANAGE_MODULE_ASSIGNMENTS',  'Assign staff to modules.'),
(21, 'Manage Module Registrations','MANAGE_MODULE_REGISTRATIONS','Manage student module registrations.'),
(21, 'View My Modules',            'VIEW_MY_MODULES',            'View modules assigned to the current user.'),
(21, 'View Module Marks',          'VIEW_MODULE_MARKS',          'Read student marks for any module.'),
(21, 'Record Module Marks',        'RECORD_MODULE_MARKS',        'Record marks for assigned modules.'),
(21, 'Manage Module Marks',        'MANAGE_MODULE_MARKS',        'Override and finalise marks across all modules.')
ON DUPLICATE KEY UPDATE
    `category_id` = VALUES(`category_id`),
    `name`        = VALUES(`name`),
    `description` = VALUES(`description`);

-- ── HR Management (cat 5) ─────────────────────────────────────────────────────
INSERT INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
(5, 'View HR Employees',     'VIEW_HR_EMPLOYEES',     'Read employee list and profiles.'),
(5, 'Manage HR Employees',   'MANAGE_HR_EMPLOYEES',   'Create and edit employee records.'),
(5, 'Manage Leave Types',    'MANAGE_LEAVE_TYPES',    'CRUD for leave type definitions.'),
(5, 'View Payroll',          'VIEW_PAYROLL',          'View payroll slips and summaries.'),
(5, 'Manage Payroll',        'MANAGE_PAYROLL',        'Process and approve payroll runs.'),
(5, 'View Leave Requests',   'VIEW_LEAVE_REQUESTS',   'View staff leave requests.'),
(5, 'Manage Leave Requests', 'MANAGE_LEAVE_REQUESTS', 'Approve or reject leave requests.')
ON DUPLICATE KEY UPDATE
    `category_id` = VALUES(`category_id`),
    `name`        = VALUES(`name`),
    `description` = VALUES(`description`);

-- ── Finance & Accounts (cat 3) ────────────────────────────────────────────────
INSERT INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
(3, 'View Finance',   'VIEW_FINANCE',   'Read financial records, fees, and reports.'),
(3, 'Manage Finance', 'MANAGE_FINANCE', 'Manage fees, billing, payments, and expenses.')
ON DUPLICATE KEY UPDATE
    `category_id` = VALUES(`category_id`),
    `name`        = VALUES(`name`),
    `description` = VALUES(`description`);

-- ── Admissions (cat 8) ────────────────────────────────────────────────────────
INSERT INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
(8, 'Manage Admission Requirements', 'MANAGE_ADMISSION_REQUIREMENTS', 'Configure admission requirement checklists.'),
(8, 'Manage Student Applications',   'MANAGE_STUDENT_APPLICATIONS',   'Review and process student applications.'),
(8, 'Verify Documents',              'VERIFY_DOCUMENTS',              'Approve or reject applicant documents.'),
(8, 'Manage Admissions',             'MANAGE_ADMISSIONS',             'Handle enrolment, intakes and offers.'),
(8, 'View Merit List',               'VIEW_MERIT_LIST',               'View generated merit lists.'),
(8, 'Manage Merit List',             'MANAGE_MERIT_LIST',             'Modify and publish merit lists.')
ON DUPLICATE KEY UPDATE
    `category_id` = VALUES(`category_id`),
    `name`        = VALUES(`name`),
    `description` = VALUES(`description`);

-- ── Examinations (cat 4) ──────────────────────────────────────────────────────
INSERT INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
(4, 'View Exams',   'VIEW_EXAMS',   'View exam schedules and results.'),
(4, 'Manage Exams', 'MANAGE_EXAMS', 'Manage exam scheduling and transcripts.')
ON DUPLICATE KEY UPDATE
    `category_id` = VALUES(`category_id`),
    `name`        = VALUES(`name`),
    `description` = VALUES(`description`);

-- ── Attendance (cat 20) ───────────────────────────────────────────────────────
INSERT INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
(20, 'View Attendance',   'VIEW_ATTENDANCE',   'View student attendance records.'),
(20, 'Record Attendance', 'RECORD_ATTENDANCE', 'Record student attendance for sessions.'),
(20, 'Manage Attendance', 'MANAGE_ATTENDANCE', 'Manage attendance settings and override records.')
ON DUPLICATE KEY UPDATE
    `category_id` = VALUES(`category_id`),
    `name`        = VALUES(`name`),
    `description` = VALUES(`description`);

-- ── Student Clearance (cat 22) ────────────────────────────────────────────────
INSERT INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
(22, 'View Clearance',   'VIEW_CLEARANCE',   'View student clearance status.'),
(22, 'Manage Clearance', 'MANAGE_CLEARANCE', 'Process and approve student clearance.')
ON DUPLICATE KEY UPDATE
    `category_id` = VALUES(`category_id`),
    `name`        = VALUES(`name`),
    `description` = VALUES(`description`);

-- ── External Portals (cat 23) ─────────────────────────────────────────────────
INSERT INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
(23, 'Access Applicant Portal', 'ACCESS_APPLICANT_PORTAL', 'Self-service portal access for applicants.'),
(23, 'Access Student Portal',   'ACCESS_STUDENT_PORTAL',   'Self-service portal access for enrolled students.'),
(23, 'Manage Own Profile',      'MANAGE_OWN_PROFILE',      'Applicant self-management of their own profile.')
ON DUPLICATE KEY UPDATE
    `category_id` = VALUES(`category_id`),
    `name`        = VALUES(`name`),
    `description` = VALUES(`description`);

-- =============================================================================
-- STEP 3 — Fix role ID 1: was mislabelled "applicant", must be "superadmin".
--          Admin users in the system all carry role_id = 1; the JWT encodes
--          the role name, so controllers checking `role === 'superadmin'` need
--          this corrected.
-- =============================================================================
UPDATE `roles`
SET `name`        = 'superadmin',
    `description` = 'Full system access — can do everything.'
WHERE `id` = 1;

-- =============================================================================
-- STEP 4 — Ensure all system roles exist (by name, not hardcoded id)
-- =============================================================================
INSERT IGNORE INTO `roles` (`name`, `description`) VALUES
('admin',           'Institution administrator — broad access, cannot manage roles/permissions.'),
('registrar',       'Academic registrar — manages students, admissions, and academic structure.'),
('hr_manager',      'HR manager — manages employees, payroll, and leave.'),
('lecturer',        'Teaching staff — records attendance and marks for assigned modules.'),
('finance_officer', 'Finance officer — manages fees, payments, and clearance.'),
('applicant',       'Prospective student — access to the application portal only.'),
('student',         'Enrolled student — access to their own academic and financial records.');

-- =============================================================================
-- STEP 5 — Rebuild role_permissions for every managed role
--          Strategy: delete existing rows for the role then re-insert.
--          Uses slug lookups so no permission IDs are hardcoded.
-- =============================================================================

-- Helper: resolve role IDs by name into @vars for use in INSERT-SELECT
SET @r_superadmin    = (SELECT id FROM roles WHERE name = 'superadmin'     LIMIT 1);
SET @r_admin         = (SELECT id FROM roles WHERE name = 'admin'          LIMIT 1);
SET @r_registrar     = (SELECT id FROM roles WHERE name = 'registrar'      LIMIT 1);
SET @r_hr            = (SELECT id FROM roles WHERE name = 'hr_manager'     LIMIT 1);
SET @r_lecturer      = (SELECT id FROM roles WHERE name = 'lecturer'       LIMIT 1);
SET @r_finance       = (SELECT id FROM roles WHERE name = 'finance_officer'LIMIT 1);
SET @r_applicant     = (SELECT id FROM roles WHERE name = 'applicant'      LIMIT 1);
SET @r_student       = (SELECT id FROM roles WHERE name = 'student'        LIMIT 1);

-- ── 5a. Superadmin — all permissions ─────────────────────────────────────────
DELETE FROM `role_permissions` WHERE `role_id` = @r_superadmin;
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT @r_superadmin, `id` FROM `permissions`;

-- ── 5b. Admin — everything except role/permission management ─────────────────
DELETE FROM `role_permissions` WHERE `role_id` = @r_admin;
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT @r_admin, id FROM `permissions`
WHERE slug NOT IN ('MANAGE_ROLES', 'MANAGE_PERMISSIONS');

-- ── 5c. Registrar ─────────────────────────────────────────────────────────────
DELETE FROM `role_permissions` WHERE `role_id` = @r_registrar;
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT @r_registrar, id FROM `permissions`
WHERE slug IN (
    'VIEW_STUDENTS', 'MANAGE_STUDENTS',
    'MANAGE_ACADEMICS', 'MANAGE_DEGREES', 'MANAGE_DEPARTMENTS',
    'MANAGE_OPTIONS', 'MANAGE_LEVELS', 'MANAGE_MODULES', 'MANAGE_SCHOOLS',
    'MANAGE_FACILITIES', 'VIEW_TIMETABLE', 'MANAGE_TIMETABLE',
    'MANAGE_ACADEMIC_YEARS', 'MANAGE_ACADEMIC_TERMS',
    'VIEW_SYSTEM_BASICS', 'VIEW_SETTINGS',
    'MANAGE_MODULE_SCHEDULES', 'MANAGE_MODULE_ASSIGNMENTS',
    'MANAGE_MODULE_REGISTRATIONS', 'VIEW_MY_MODULES',
    'VIEW_MODULE_MARKS', 'MANAGE_MODULE_MARKS',
    'MANAGE_ADMISSION_REQUIREMENTS', 'MANAGE_STUDENT_APPLICATIONS',
    'VERIFY_DOCUMENTS', 'MANAGE_ADMISSIONS',
    'VIEW_MERIT_LIST', 'MANAGE_MERIT_LIST',
    'VIEW_EXAMS', 'MANAGE_EXAMS',
    'VIEW_ATTENDANCE', 'MANAGE_ATTENDANCE',
    'VIEW_CLEARANCE', 'MANAGE_CLEARANCE',
    'VIEW_FINANCE'
);

-- ── 5d. HR Manager ────────────────────────────────────────────────────────────
DELETE FROM `role_permissions` WHERE `role_id` = @r_hr;
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT @r_hr, id FROM `permissions`
WHERE slug IN (
    'VIEW_HR_EMPLOYEES', 'MANAGE_HR_EMPLOYEES',
    'MANAGE_LEAVE_TYPES', 'VIEW_LEAVE_REQUESTS', 'MANAGE_LEAVE_REQUESTS',
    'VIEW_PAYROLL', 'MANAGE_PAYROLL',
    'VIEW_SYSTEM_BASICS', 'VIEW_SETTINGS'
);

-- ── 5e. Lecturer ──────────────────────────────────────────────────────────────
DELETE FROM `role_permissions` WHERE `role_id` = @r_lecturer;
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT @r_lecturer, id FROM `permissions`
WHERE slug IN (
    'VIEW_STUDENTS',
    'VIEW_MY_MODULES',
    'VIEW_MODULE_MARKS', 'RECORD_MODULE_MARKS',
    'VIEW_ATTENDANCE', 'RECORD_ATTENDANCE',
    'VIEW_TIMETABLE',
    'VIEW_SYSTEM_BASICS'
);

-- ── 5f. Finance Officer ───────────────────────────────────────────────────────
DELETE FROM `role_permissions` WHERE `role_id` = @r_finance;
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT @r_finance, id FROM `permissions`
WHERE slug IN (
    'VIEW_FINANCE', 'MANAGE_FINANCE',
    'VIEW_STUDENTS',
    'VIEW_CLEARANCE', 'MANAGE_CLEARANCE',
    'VIEW_SYSTEM_BASICS', 'VIEW_SETTINGS'
);

-- ── 5g. Applicant — portal + own-profile only ─────────────────────────────────
DELETE FROM `role_permissions` WHERE `role_id` = @r_applicant;
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT @r_applicant, id FROM `permissions`
WHERE slug IN (
    'ACCESS_APPLICANT_PORTAL',
    'MANAGE_OWN_PROFILE'
);

-- ── 5h. Student — read-only self-service ──────────────────────────────────────
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
-- STEP 6 — Fix orphaned users whose role_id points to a non-existent role.
--          We resolve target roles by name so no IDs are hardcoded.
-- =============================================================================

-- Users with role_id = 2 (no role was ever created for that id): assign hr_manager
UPDATE `users`
SET `role_id` = (SELECT id FROM `roles` WHERE `name` = 'hr_manager' LIMIT 1)
WHERE `role_id` = 2
  AND NOT EXISTS (SELECT 1 FROM `roles` WHERE `id` = 2);

-- Users with role_id not present in roles at all: fall back to 'student' (safest default)
UPDATE `users` u
SET u.`role_id` = (SELECT id FROM `roles` WHERE `name` = 'student' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM `roles` r WHERE r.`id` = u.`role_id`);

SET FOREIGN_KEY_CHECKS = 1;
