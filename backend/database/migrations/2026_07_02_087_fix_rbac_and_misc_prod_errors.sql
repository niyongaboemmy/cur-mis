-- ══════════════════════════════════════════════════════════════════════════════
-- PRODUCTION MIGRATION — 2026-07-02
-- 2026_07_02_087_fix_rbac_and_misc_prod_errors.sql
--
-- ERRORS FIXED:
--   1146  Table 'role_permissions' doesn't exist          (every auth request)
--   1048  Column 'bank_slip_file_id' cannot be null       (fee payment recording)
--   1054  Unknown column 'o.title' in 'SELECT'            (graduand list)
--   1267  Illegal mix of collations                        (various queries)
--
-- SECTIONS:
--   §1  RBAC tables — CREATE IF NOT EXISTS
--   §2  Seed permission categories (all, including Messaging + Gate Management)
--   §3  Seed all permissions (migrations 005, 025, 062, 065, 067, 068, 069,
--           083 REQUEST_LEAVE, PROD cumulated Gate Management)
--   §4  Seed all roles
--   §5  Assign permissions to roles
--   §6  Fix orphaned users
--   §7  fee_payments.bank_slip_file_id → nullable
--   §8  options.title column + options.code / acro / start_date guard
--   §9  student.regnumber collation → utf8mb4_unicode_ci
--
-- DESIGN: Additive + idempotent. Safe to re-run.
-- ══════════════════════════════════════════════════════════════════════════════

SET FOREIGN_KEY_CHECKS = 0;

-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §1  RBAC core tables                                                        ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS `permission_categories` (
  `id`          INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`        VARCHAR(100)     NOT NULL,
  `description` TEXT,
  `created_at`  TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `permissions` (
  `id`          INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `category_id` INT(10) UNSIGNED NOT NULL,
  `name`        VARCHAR(100)     NOT NULL,
  `slug`        VARCHAR(100)     NOT NULL,
  `description` TEXT,
  `created_at`  TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `roles` (
  `id`          INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`        VARCHAR(50)      NOT NULL,
  `description` TEXT,
  `created_at`  TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `role_permissions` (
  `role_id`       INT(10) UNSIGNED NOT NULL,
  `permission_id` INT(10) UNSIGNED NOT NULL,
  `created_at`    TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`role_id`, `permission_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §2  Permission categories (complete canonical set)                          ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

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
(23, 'External Portals',  'Self-service access for applicants and students.'),
(24, 'Messaging',         'Announcements, notifications, and internal messages.'),
(25, 'Gate Management',   'Campus gate access control and gate logs.')
ON DUPLICATE KEY UPDATE
    `name`        = VALUES(`name`),
    `description` = VALUES(`description`);


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §3  Permissions (all migrations consolidated)                               ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

-- ── Administration ────────────────────────────────────────────────────────────
INSERT INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
(1, 'Manage Roles',       'MANAGE_ROLES',       'Create, update and delete system roles.'),
(1, 'Manage Permissions', 'MANAGE_PERMISSIONS', 'Organise permission categories and slugs.'),
(1, 'Manage Users',       'MANAGE_USERS',       'Full user management: create, edit, deactivate.'),
(1, 'View System Logs',   'VIEW_SYSTEM_LOGS',   'Read system activity and audit logs.')
ON DUPLICATE KEY UPDATE `category_id`=VALUES(`category_id`), `name`=VALUES(`name`), `description`=VALUES(`description`);

-- ── System Settings ───────────────────────────────────────────────────────────
INSERT INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
(6, 'Manage Academic Years', 'MANAGE_ACADEMIC_YEARS', 'CRUD for academic years.'),
(6, 'Manage Academic Terms', 'MANAGE_ACADEMIC_TERMS', 'CRUD for academic terms.'),
(6, 'View System Basics',    'VIEW_SYSTEM_BASICS',    'Read basic system info and branding.'),
(6, 'View Settings',         'VIEW_SETTINGS',         'Read global system settings.'),
(6, 'Manage Settings',       'MANAGE_SETTINGS',       'Modify global system settings.')
ON DUPLICATE KEY UPDATE `category_id`=VALUES(`category_id`), `name`=VALUES(`name`), `description`=VALUES(`description`);

-- ── Academic Registry ─────────────────────────────────────────────────────────
INSERT INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
(2, 'View Students',         'VIEW_STUDENTS',        'Search and view student records.'),
(2, 'Manage Students',       'MANAGE_STUDENTS',      'Create and edit student records.'),
(2, 'Manage Academics',      'MANAGE_ACADEMICS',     'General academic structure management.'),
(2, 'Manage Degrees',        'MANAGE_DEGREES',       'CRUD for degree programmes.'),
(2, 'Manage Facilities',     'MANAGE_FACILITIES',    'Manage rooms and physical facilities.'),
(2, 'Manage Departments',    'MANAGE_DEPARTMENTS',   'CRUD for departments.'),
(2, 'Manage Options',        'MANAGE_OPTIONS',       'CRUD for department options/specialisations.'),
(2, 'Manage Levels',         'MANAGE_LEVELS',        'CRUD for study levels.'),
(2, 'Manage Modules',        'MANAGE_MODULES',       'CRUD for course modules.'),
(2, 'Manage Schools',        'MANAGE_SCHOOLS',       'CRUD for schools/faculties.'),
(2, 'View Timetable',        'VIEW_TIMETABLE',       'View the academic timetable.'),
(2, 'Manage Timetable',      'MANAGE_TIMETABLE',     'Create and edit the academic timetable.'),
(2, 'Manage Student ID Cards','MANAGE_STUDENT_IDS',  'Issue, re-issue, revoke and print student identity cards.')
ON DUPLICATE KEY UPDATE `category_id`=VALUES(`category_id`), `name`=VALUES(`name`), `description`=VALUES(`description`);

-- ── Modules Management ────────────────────────────────────────────────────────
INSERT INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
(21, 'Manage Module Schedules',    'MANAGE_MODULE_SCHEDULES',    'Manage timetable slots for modules.'),
(21, 'Manage Module Assignments',  'MANAGE_MODULE_ASSIGNMENTS',  'Assign staff to modules.'),
(21, 'Manage Module Registrations','MANAGE_MODULE_REGISTRATIONS','Manage student module registrations.'),
(21, 'View My Modules',            'VIEW_MY_MODULES',            'View modules assigned to the current user.'),
(21, 'View Module Marks',          'VIEW_MODULE_MARKS',          'Read student marks for any module.'),
(21, 'Record Module Marks',        'RECORD_MODULE_MARKS',        'Record marks for assigned modules.'),
(21, 'Manage Module Marks',        'MANAGE_MODULE_MARKS',        'Override and finalise marks across all modules.')
ON DUPLICATE KEY UPDATE `category_id`=VALUES(`category_id`), `name`=VALUES(`name`), `description`=VALUES(`description`);

-- ── HR Management ─────────────────────────────────────────────────────────────
INSERT INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
(5, 'View HR Employees',     'VIEW_HR_EMPLOYEES',     'Read employee list and profiles.'),
(5, 'Manage HR Employees',   'MANAGE_HR_EMPLOYEES',   'Create and edit employee records.'),
(5, 'Manage Leave Types',    'MANAGE_LEAVE_TYPES',    'CRUD for leave type definitions.'),
(5, 'View Payroll',          'VIEW_PAYROLL',          'View payroll slips and summaries.'),
(5, 'Manage Payroll',        'MANAGE_PAYROLL',        'Process and approve payroll runs.'),
(5, 'View Leave Requests',   'VIEW_LEAVE_REQUESTS',   'View staff leave requests.'),
(5, 'Manage Leave Requests', 'MANAGE_LEAVE_REQUESTS', 'Approve or reject leave requests.'),
(5, 'Request Leave',         'REQUEST_LEAVE',         'Submit your own leave requests and view their status.')
ON DUPLICATE KEY UPDATE `category_id`=VALUES(`category_id`), `name`=VALUES(`name`), `description`=VALUES(`description`);

-- ── Finance & Accounts ────────────────────────────────────────────────────────
INSERT INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
(3, 'View Finance',           'VIEW_FINANCE',           'Read financial records, fees, and reports.'),
(3, 'Manage Finance',         'MANAGE_FINANCE',         'Manage fees, billing, payments, and expenses.'),
(3, 'View Finance Overview',  'VIEW_FINANCE_OVERVIEW',  'Access the finance overview dashboard.'),
(3, 'View Finance Billing',   'VIEW_FINANCE_BILLING',   'Access the finance billing ledger and invoices.'),
(3, 'View Finance Approvals', 'VIEW_FINANCE_APPROVALS', 'Access the finance pending approvals tab.'),
(3, 'View Finance Structures','VIEW_FINANCE_STRUCTURES','Access the fee rates and structures configuration.'),
(3, 'View Finance Bursaries', 'VIEW_FINANCE_BURSARIES', 'Access the student bursaries management tab.'),
(3, 'View Finance Sponsors',  'VIEW_FINANCE_SPONSORS',  'Access the sponsors and scholarships tab.'),
(3, 'View Finance Expenses',  'VIEW_FINANCE_EXPENSES',  'Access the finance expenses management tab.'),
(3, 'View Finance Refunds',   'VIEW_FINANCE_REFUNDS',   'Access the finance refunds processing tab.'),
(3, 'View Finance Balance',   'VIEW_FINANCE_BALANCE',   'Access the student balances tab.'),
(3, 'View Finance Clearance', 'VIEW_FINANCE_CLEARANCE', 'Access the financial clearance tab.'),
(3, 'View Finance Reports',   'VIEW_FINANCE_REPORTS',   'Access the financial reports and analytics tab.')
ON DUPLICATE KEY UPDATE `category_id`=VALUES(`category_id`), `name`=VALUES(`name`), `description`=VALUES(`description`);

-- ── Admissions ────────────────────────────────────────────────────────────────
INSERT INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
(8, 'Manage Admission Requirements', 'MANAGE_ADMISSION_REQUIREMENTS', 'Configure admission requirement checklists.'),
(8, 'Manage Student Applications',   'MANAGE_STUDENT_APPLICATIONS',   'Review and process student applications.'),
(8, 'Verify Documents',              'VERIFY_DOCUMENTS',              'Approve or reject applicant documents.'),
(8, 'Manage Admissions',             'MANAGE_ADMISSIONS',             'Handle enrolment, intakes and offers.'),
(8, 'View Merit List',               'VIEW_MERIT_LIST',               'View generated merit lists.'),
(8, 'Manage Merit List',             'MANAGE_MERIT_LIST',             'Modify and publish merit lists.')
ON DUPLICATE KEY UPDATE `category_id`=VALUES(`category_id`), `name`=VALUES(`name`), `description`=VALUES(`description`);

-- ── Examinations ─────────────────────────────────────────────────────────────
INSERT INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
(4, 'View Exams',          'VIEW_EXAMS',          'View exam schedules and results.'),
(4, 'Manage Exams',        'MANAGE_EXAMS',        'Manage exam scheduling and transcripts.'),
(4, 'Manage Grading Scales','MANAGE_GRADING_SCALES','Configure grading scale bands and grade points.'),
(4, 'Manage Revaluations', 'MANAGE_REVALUATIONS', 'Review, approve, reject and process revaluation requests.')
ON DUPLICATE KEY UPDATE `category_id`=VALUES(`category_id`), `name`=VALUES(`name`), `description`=VALUES(`description`);

-- ── Attendance ────────────────────────────────────────────────────────────────
INSERT INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
(20, 'View Attendance',   'VIEW_ATTENDANCE',   'View student attendance records.'),
(20, 'Record Attendance', 'RECORD_ATTENDANCE', 'Record student attendance for sessions.'),
(20, 'Manage Attendance', 'MANAGE_ATTENDANCE', 'Manage attendance settings and override records.')
ON DUPLICATE KEY UPDATE `category_id`=VALUES(`category_id`), `name`=VALUES(`name`), `description`=VALUES(`description`);

-- ── Student Clearance ─────────────────────────────────────────────────────────
INSERT INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
(22, 'View Clearance',   'VIEW_CLEARANCE',   'View student clearance status.'),
(22, 'Manage Clearance', 'MANAGE_CLEARANCE', 'Process and approve student clearance.')
ON DUPLICATE KEY UPDATE `category_id`=VALUES(`category_id`), `name`=VALUES(`name`), `description`=VALUES(`description`);

-- ── External Portals ──────────────────────────────────────────────────────────
INSERT INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
(23, 'Access Applicant Portal', 'ACCESS_APPLICANT_PORTAL', 'Self-service portal access for applicants.'),
(23, 'Access Student Portal',   'ACCESS_STUDENT_PORTAL',   'Self-service portal access for enrolled students.'),
(23, 'Manage Own Profile',      'MANAGE_OWN_PROFILE',      'Applicant self-management of their own profile.')
ON DUPLICATE KEY UPDATE `category_id`=VALUES(`category_id`), `name`=VALUES(`name`), `description`=VALUES(`description`);

-- ── Messaging ─────────────────────────────────────────────────────────────────
INSERT INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
(24, 'View Announcements',   'VIEW_ANNOUNCEMENTS',   'See broadcast announcements.'),
(24, 'Manage Announcements', 'MANAGE_ANNOUNCEMENTS', 'Create, edit and delete broadcast announcements.')
ON DUPLICATE KEY UPDATE `category_id`=VALUES(`category_id`), `name`=VALUES(`name`), `description`=VALUES(`description`);

-- ── Gate Management ───────────────────────────────────────────────────────────
INSERT INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
(25, 'View Gate Logs',          'VIEW_GATE_LOGS', 'View campus gate access logs.'),
(25, 'Manage Gate',             'MANAGE_GATE',    'Manage gate sessions and settings.'),
(25, 'Access Gate Verification','ACCESS_GATE',    'Perform gate verification scans.')
ON DUPLICATE KEY UPDATE `category_id`=VALUES(`category_id`), `name`=VALUES(`name`), `description`=VALUES(`description`);


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §4  Roles                                                                   ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

-- Ensure superadmin row exists with id=1 (INSERT IGNORE preserves existing id).
INSERT IGNORE INTO `roles` (`id`, `name`, `description`) VALUES
(1, 'superadmin', 'Full system access — can do everything.');

-- Ensure role_id=1 row actually has name 'superadmin' (repair mislabelled early seed).
UPDATE `roles` SET `name` = 'superadmin', `description` = 'Full system access — can do everything.'
WHERE `id` = 1;

INSERT IGNORE INTO `roles` (`name`, `description`) VALUES
('admin',           'Institution administrator — broad access, cannot manage roles/permissions.'),
('registrar',       'Academic registrar — manages students, admissions, and academic structure.'),
('hr_manager',      'HR manager — manages employees, payroll, and leave.'),
('lecturer',        'Teaching staff — records attendance and marks for assigned modules.'),
('finance_officer', 'Finance officer — manages fees, payments, and clearance.'),
('applicant',       'Prospective student — access to the application portal only.'),
('student',         'Enrolled student — access to their own academic and financial records.');


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §5  Role ↔ Permission assignments                                           ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

SET @r_superadmin = (SELECT id FROM `roles` WHERE name = 'superadmin'      LIMIT 1);
SET @r_admin      = (SELECT id FROM `roles` WHERE name = 'admin'           LIMIT 1);
SET @r_registrar  = (SELECT id FROM `roles` WHERE name = 'registrar'       LIMIT 1);
SET @r_hr         = (SELECT id FROM `roles` WHERE name = 'hr_manager'      LIMIT 1);
SET @r_lecturer   = (SELECT id FROM `roles` WHERE name = 'lecturer'        LIMIT 1);
SET @r_finance    = (SELECT id FROM `roles` WHERE name = 'finance_officer'  LIMIT 1);
SET @r_applicant  = (SELECT id FROM `roles` WHERE name = 'applicant'       LIMIT 1);
SET @r_student    = (SELECT id FROM `roles` WHERE name = 'student'         LIMIT 1);

-- Superadmin — all permissions
DELETE FROM `role_permissions` WHERE `role_id` = @r_superadmin;
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT @r_superadmin, `id` FROM `permissions`;

-- Admin — all except role/permission management
DELETE FROM `role_permissions` WHERE `role_id` = @r_admin;
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT @r_admin, `id` FROM `permissions`
WHERE `slug` NOT IN ('MANAGE_ROLES', 'MANAGE_PERMISSIONS');

-- Registrar
DELETE FROM `role_permissions` WHERE `role_id` = @r_registrar;
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT @r_registrar, `id` FROM `permissions`
WHERE `slug` IN (
    'VIEW_STUDENTS','MANAGE_STUDENTS',
    'MANAGE_ACADEMICS','MANAGE_DEGREES','MANAGE_DEPARTMENTS',
    'MANAGE_OPTIONS','MANAGE_LEVELS','MANAGE_MODULES','MANAGE_SCHOOLS',
    'MANAGE_FACILITIES','VIEW_TIMETABLE','MANAGE_TIMETABLE',
    'MANAGE_ACADEMIC_YEARS','MANAGE_ACADEMIC_TERMS',
    'VIEW_SYSTEM_BASICS','VIEW_SETTINGS',
    'MANAGE_MODULE_SCHEDULES','MANAGE_MODULE_ASSIGNMENTS',
    'MANAGE_MODULE_REGISTRATIONS','VIEW_MY_MODULES',
    'VIEW_MODULE_MARKS','MANAGE_MODULE_MARKS',
    'MANAGE_ADMISSION_REQUIREMENTS','MANAGE_STUDENT_APPLICATIONS',
    'VERIFY_DOCUMENTS','MANAGE_ADMISSIONS',
    'VIEW_MERIT_LIST','MANAGE_MERIT_LIST',
    'VIEW_EXAMS','MANAGE_EXAMS',
    'MANAGE_GRADING_SCALES','MANAGE_REVALUATIONS','MANAGE_STUDENT_IDS',
    'VIEW_ATTENDANCE','MANAGE_ATTENDANCE',
    'VIEW_CLEARANCE','MANAGE_CLEARANCE',
    'VIEW_FINANCE',
    'VIEW_ANNOUNCEMENTS','MANAGE_ANNOUNCEMENTS'
);

-- HR Manager
DELETE FROM `role_permissions` WHERE `role_id` = @r_hr;
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT @r_hr, `id` FROM `permissions`
WHERE `slug` IN (
    'VIEW_HR_EMPLOYEES','MANAGE_HR_EMPLOYEES',
    'MANAGE_LEAVE_TYPES','VIEW_LEAVE_REQUESTS','MANAGE_LEAVE_REQUESTS',
    'VIEW_PAYROLL','MANAGE_PAYROLL',
    'VIEW_SYSTEM_BASICS','VIEW_SETTINGS',
    'VIEW_ANNOUNCEMENTS'
);

-- Lecturer
DELETE FROM `role_permissions` WHERE `role_id` = @r_lecturer;
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT @r_lecturer, `id` FROM `permissions`
WHERE `slug` IN (
    'VIEW_STUDENTS',
    'VIEW_MY_MODULES',
    'VIEW_MODULE_MARKS','RECORD_MODULE_MARKS',
    'VIEW_ATTENDANCE','RECORD_ATTENDANCE',
    'VIEW_TIMETABLE',
    'VIEW_SYSTEM_BASICS',
    'REQUEST_LEAVE',
    'VIEW_ANNOUNCEMENTS'
);

-- Finance Officer
DELETE FROM `role_permissions` WHERE `role_id` = @r_finance;
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT @r_finance, `id` FROM `permissions`
WHERE `slug` IN (
    'VIEW_FINANCE','MANAGE_FINANCE',
    'VIEW_FINANCE_OVERVIEW','VIEW_FINANCE_BILLING','VIEW_FINANCE_APPROVALS',
    'VIEW_FINANCE_STRUCTURES','VIEW_FINANCE_BURSARIES','VIEW_FINANCE_SPONSORS',
    'VIEW_FINANCE_EXPENSES','VIEW_FINANCE_REFUNDS','VIEW_FINANCE_BALANCE',
    'VIEW_FINANCE_CLEARANCE','VIEW_FINANCE_REPORTS',
    'VIEW_STUDENTS',
    'VIEW_CLEARANCE','MANAGE_CLEARANCE',
    'VIEW_SYSTEM_BASICS','VIEW_SETTINGS',
    'VIEW_ANNOUNCEMENTS'
);

-- Applicant — portal + own-profile only
DELETE FROM `role_permissions` WHERE `role_id` = @r_applicant;
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT @r_applicant, `id` FROM `permissions`
WHERE `slug` IN ('ACCESS_APPLICANT_PORTAL','MANAGE_OWN_PROFILE');

-- Student — read-only self-service
DELETE FROM `role_permissions` WHERE `role_id` = @r_student;
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT @r_student, `id` FROM `permissions`
WHERE `slug` IN (
    'ACCESS_STUDENT_PORTAL',
    'VIEW_MODULE_MARKS',
    'VIEW_ATTENDANCE',
    'VIEW_FINANCE','VIEW_FINANCE_OVERVIEW','VIEW_FINANCE_BILLING',
    'VIEW_FINANCE_BALANCE',
    'VIEW_CLEARANCE',
    'VIEW_TIMETABLE',
    'VIEW_SYSTEM_BASICS',
    'REQUEST_LEAVE',
    'VIEW_ANNOUNCEMENTS'
);

-- REQUEST_LEAVE: grant to all staff roles that don't have it yet.
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`slug` = 'REQUEST_LEAVE'
WHERE r.`name` NOT IN ('applicant', 'student');


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §6  Fix orphaned users with missing roles                                   ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

-- Repair users whose role_id points to a role that doesn't exist.
UPDATE `users` u
SET u.`role_id` = (SELECT `id` FROM `roles` WHERE `name` = 'student' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM `roles` r WHERE r.`id` = u.`role_id`);


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §7  fee_payments.bank_slip_file_id — make nullable                          ║
-- ║                                                                              ║
-- ║  Error 1048: Column 'bank_slip_file_id' cannot be null.                     ║
-- ║  Cash/manual payments pass NULL for this column. The schema defines it       ║
-- ║  as NULL DEFAULT NULL but the production table has it as NOT NULL.           ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

ALTER TABLE `fee_payments`
  MODIFY COLUMN `bank_slip_file_id` VARCHAR(36) NULL DEFAULT NULL;


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §8  options table — add title, code, acro, start_date columns               ║
-- ║                                                                              ║
-- ║  Error 1054: Unknown column 'o.title' in 'SELECT'                           ║
-- ║  GraduandController queries o.title AS option_title.                         ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

-- title (the full program name used by GraduandController)
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'options' AND COLUMN_NAME = 'title');
SET @stmt := IF(@col = 0,
  "ALTER TABLE `options` ADD COLUMN `title` VARCHAR(255) NULL DEFAULT NULL AFTER `name`",
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Backfill title from name where title is still NULL
UPDATE `options` SET `title` = `name` WHERE `title` IS NULL;

-- code
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'options' AND COLUMN_NAME = 'code');
SET @stmt := IF(@col = 0,
  "ALTER TABLE `options` ADD COLUMN `code` VARCHAR(50) NULL DEFAULT NULL AFTER `title`",
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- acro (acronym used for matching in GraduandController and dep_options joins)
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'options' AND COLUMN_NAME = 'acro');
SET @stmt := IF(@col = 0,
  "ALTER TABLE `options` ADD COLUMN `acro` VARCHAR(50) NULL DEFAULT NULL AFTER `code`",
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- start_date
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'options' AND COLUMN_NAME = 'start_date');
SET @stmt := IF(@col = 0,
  "ALTER TABLE `options` ADD COLUMN `start_date` DATE NULL DEFAULT NULL AFTER `acro`",
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §9  Collation alignment — finance student_id columns → general_ci           ║
-- ║                                                                              ║
-- ║  Error 1267: Illegal mix of collations.                                     ║
-- ║                                                                              ║
-- ║  SAFE DIRECTION: student.regnumber is left unchanged (attempting to alter   ║
-- ║  it to unicode_ci risks a unique-key violation / data-truncation error      ║
-- ║  because two regnumbers that differ only in Unicode normalisation would      ║
-- ║  collide under the new collation).                                          ║
-- ║                                                                              ║
-- ║  Instead, align every finance/clearance student_id column back to the       ║
-- ║  same collation as student.regnumber (utf8mb4_general_ci).                  ║
-- ║  This is idempotent — re-running when already general_ci is a no-op.        ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

ALTER TABLE `fee_payments`
  MODIFY `student_id` VARCHAR(20) NOT NULL COLLATE utf8mb4_general_ci;

ALTER TABLE `fee_invoices`
  MODIFY `student_id` VARCHAR(20) NOT NULL COLLATE utf8mb4_general_ci;

ALTER TABLE `fee_bursaries`
  MODIFY `student_id` VARCHAR(20) NOT NULL COLLATE utf8mb4_general_ci;

ALTER TABLE `student_clearances`
  MODIFY `student_id` VARCHAR(20) NOT NULL COLLATE utf8mb4_general_ci;

-- finance_clearances (created in cumulated migration §11, may not exist yet)
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'finance_clearances'
               AND COLUMN_NAME = 'student_id');
SET @stmt := IF(@col > 0,
  "ALTER TABLE `finance_clearances` MODIFY `student_id` VARCHAR(20) NOT NULL COLLATE utf8mb4_general_ci",
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- student_fee_overrides (guard — table may not exist)
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_fee_overrides'
               AND COLUMN_NAME = 'student_id');
SET @stmt := IF(@col > 0,
  "ALTER TABLE `student_fee_overrides` MODIFY `student_id` VARCHAR(20) NOT NULL COLLATE utf8mb4_general_ci",
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- fee_refunds (guard)
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fee_refunds'
               AND COLUMN_NAME = 'student_id');
SET @stmt := IF(@col > 0,
  "ALTER TABLE `fee_refunds` MODIFY `student_id` VARCHAR(20) NOT NULL COLLATE utf8mb4_general_ci",
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- fee_fines (guard)
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fee_fines'
               AND COLUMN_NAME = 'student_id');
SET @stmt := IF(@col > 0,
  "ALTER TABLE `fee_fines` MODIFY `student_id` VARCHAR(20) NOT NULL COLLATE utf8mb4_general_ci",
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- overdue_alerts (guard)
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'overdue_alerts'
               AND COLUMN_NAME = 'student_id');
SET @stmt := IF(@col > 0,
  "ALTER TABLE `overdue_alerts` MODIFY `student_id` VARCHAR(20) NOT NULL COLLATE utf8mb4_general_ci",
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;


SET FOREIGN_KEY_CHECKS = 1;

-- ══════════════════════════════════════════════════════════════════════════════
-- END OF MIGRATION 2026_07_02_087
-- ══════════════════════════════════════════════════════════════════════════════
