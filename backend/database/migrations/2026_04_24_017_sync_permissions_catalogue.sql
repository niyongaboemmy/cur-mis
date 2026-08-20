-- 2026_04_24_017_sync_permissions_catalogue.sql
-- Brings the `permissions` table and `role_permissions` in line with
-- App\Constants\Permissions and the frontend `PERMISSIONS` constant.
--
-- Idempotent: safe to re-run. Resolves category ids by name so it survives
-- re-ordered seeds.
--
-- Scope:
--   1. Ensure every category used by the app exists; drop the stray
--      "Applicant Portal" category (superseded by "External Portal").
--   2. Fix the broken MANAGE_STUDENTS row (slug was stored lowercase —
--      collation is case-insensitive so INSERT IGNORE cannot self-correct it).
--   3. Ensure every permission slug referenced by the backend exists,
--      and each lives under its correct category.
--   4. Drop obsolete slugs (MANAGE_COURSES, MANAGE_COURSE_ASSIGNMENTS,
--      STAFF_ACCESS) that are no longer referenced in code.
--   5. Re-grant every permission to the Superadmin role (id = 1).

-- 1. Categories ──────────────────────────────────────────────────────────────
INSERT IGNORE INTO `permission_categories` (`name`, `description`) VALUES
  ('Administration',     'System-wide administrative controls and user management.'),
  ('Academic Registry',  'Management of students, programs, and academic records.'),
  ('Finance & Accounts', 'Handling of student fees, billing, and accounting.'),
  ('Examinations',       'Planning and recording of examinations and results.'),
  ('HR Management',      'Management of staff, employees, and leave records.'),
  ('System Settings',    'Global system configurations like years, terms, and basics.'),
  ('Admissions',         'Prospective-student pipeline: requirements, verification, offers.'),
  ('External Portal',    'Permissions for applicant and student self-service portals.');

-- Resolve category ids by name
SET @cat_admin     = (SELECT id FROM permission_categories WHERE name = 'Administration'     LIMIT 1);
SET @cat_academic  = (SELECT id FROM permission_categories WHERE name = 'Academic Registry'  LIMIT 1);
SET @cat_finance   = (SELECT id FROM permission_categories WHERE name = 'Finance & Accounts' LIMIT 1);
SET @cat_exams     = (SELECT id FROM permission_categories WHERE name = 'Examinations'       LIMIT 1);
SET @cat_hr        = (SELECT id FROM permission_categories WHERE name = 'HR Management'      LIMIT 1);
SET @cat_system    = (SELECT id FROM permission_categories WHERE name = 'System Settings'    LIMIT 1);
SET @cat_admissions= (SELECT id FROM permission_categories WHERE name = 'Admissions'         LIMIT 1);
SET @cat_portal    = (SELECT id FROM permission_categories WHERE name = 'External Portal'    LIMIT 1);

-- 2. Fix the broken MANAGE_STUDENTS row ─────────────────────────────────────
-- Historical seed stored slug='manage_students' (lowercase) with name='MANAGE_STUDENTS'.
-- PermissionMiddleware does a strict case-sensitive `in_array` check against
-- the constant 'MANAGE_STUDENTS', so the lowercase slug always returns 403.
-- MySQL's default collation is case-insensitive, so INSERT IGNORE cannot
-- rewrite it — we have to UPDATE the existing row.
UPDATE `permissions`
SET `slug` = 'MANAGE_STUDENTS',
    `name` = 'Manage Students',
    `description` = 'Create, update and delete student records.',
    `category_id` = @cat_academic
WHERE BINARY `slug` = 'manage_students';

-- 3. Permissions ────────────────────────────────────────────────────────────
INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
  -- Administration
  (@cat_admin, 'Manage Roles',        'MANAGE_ROLES',       'Create, update and delete system roles.'),
  (@cat_admin, 'Manage Permissions',  'MANAGE_PERMISSIONS', 'Organize permissions and categories.'),
  (@cat_admin, 'Manage Users',        'MANAGE_USERS',       'Administrative user management (CRUD, roles, status).'),
  (@cat_admin, 'View System Logs',    'VIEW_SYSTEM_LOGS',   'Access system activity logs and audit trails.'),

  -- System Settings
  (@cat_system, 'Manage Academic Years', 'MANAGE_ACADEMIC_YEARS', 'CRUD for academic years and activation.'),
  (@cat_system, 'Manage Academic Terms', 'MANAGE_ACADEMIC_TERMS', 'CRUD for academic terms and activation.'),
  (@cat_system, 'View System Basics',    'VIEW_SYSTEM_BASICS',    'Access system-wide basic info (active year, term, etc.).'),

  -- Academic Registry
  (@cat_academic, 'View Student Profiles', 'VIEW_STUDENTS',      'Search and view detailed student records.'),
  (@cat_academic, 'Manage Students',       'MANAGE_STUDENTS',    'Create, update and delete student records.'),
  (@cat_academic, 'Manage Academics',      'MANAGE_ACADEMICS',   'Manage courses, programs and curriculum.'),
  (@cat_academic, 'Manage Degrees',        'MANAGE_DEGREES',     'CRUD for student degrees.'),
  (@cat_academic, 'Manage Facilities',     'MANAGE_FACILITIES',  'Manage rooms and facilities.'),
  (@cat_academic, 'Manage Departments',    'MANAGE_DEPARTMENTS', 'CRUD for university departments.'),
  (@cat_academic, 'Manage Options',        'MANAGE_OPTIONS',     'CRUD for department options/specializations.'),
  (@cat_academic, 'Manage Levels',         'MANAGE_LEVELS',      'CRUD for academic levels.'),
  (@cat_academic, 'Manage Modules',        'MANAGE_MODULES',     'CRUD for academic modules.'),
  (@cat_academic, 'Manage Schools',        'MANAGE_SCHOOLS',     'CRUD for schools/faculties.'),

  -- Modules Management
  (@cat_academic, 'Manage Module Schedules',     'MANAGE_MODULE_SCHEDULES',     'Create/edit module timetable entries.'),
  (@cat_academic, 'Manage Module Assignments',   'MANAGE_MODULE_ASSIGNMENTS',   'Assign faculty to modules and track workload.'),
  (@cat_academic, 'Manage Module Registrations', 'MANAGE_MODULE_REGISTRATIONS', 'Admin-level access to all student module registrations.'),
  (@cat_academic, 'View My Modules',             'VIEW_MY_MODULES',             'Students view eligible modules and self-register.'),

  -- HR Management
  (@cat_hr, 'View HR Employees',   'VIEW_HR_EMPLOYEES',   'Access to the list of HR employees.'),
  (@cat_hr, 'Manage HR Employees', 'MANAGE_HR_EMPLOYEES', 'Create, update and delete HR employee records.'),
  (@cat_hr, 'Manage Leave Types',  'MANAGE_LEAVE_TYPES',  'CRUD for employee leave types.'),

  -- Finance
  (@cat_finance, 'Manage Finance', 'MANAGE_FINANCE', 'Fee management, billing and financial reports.'),

  -- Admissions
  (@cat_admissions, 'Manage Admission Requirements', 'MANAGE_ADMISSION_REQUIREMENTS', 'Configure per-faculty document checklists and document types.'),
  (@cat_admissions, 'Manage Student Applications',   'MANAGE_STUDENT_APPLICATIONS',   'Review and update admission applications.'),
  (@cat_admissions, 'Verify Documents',              'VERIFY_DOCUMENTS',              'Approve or reject applicant-uploaded documents.'),
  (@cat_admissions, 'Manage Admissions',             'MANAGE_ADMISSIONS',             'Merit lists, offers, enrollment and intakes.'),

  -- Examinations
  (@cat_exams, 'Manage Examinations', 'MANAGE_EXAMS', 'Manage exam scheduling and transcript records.'),

  -- External Portals
  (@cat_portal, 'Access Applicant Portal', 'ACCESS_APPLICANT_PORTAL', 'Prospective students manage their applications and profile.'),
  (@cat_portal, 'Access Student Portal',   'ACCESS_STUDENT_PORTAL',   'Enrolled students access academic and financial records.'),
  (@cat_portal, 'Manage Own Profile',      'MANAGE_OWN_PROFILE',      'Applicant self-service profile management.');

-- 3b. Re-home permissions that were mis-categorized by earlier seeds ────────
UPDATE `permissions` SET `category_id` = @cat_portal
 WHERE `slug` IN ('ACCESS_APPLICANT_PORTAL', 'ACCESS_STUDENT_PORTAL', 'MANAGE_OWN_PROFILE');

UPDATE `permissions` SET `category_id` = @cat_academic
 WHERE `slug` IN ('MANAGE_STUDENTS', 'VIEW_STUDENTS', 'MANAGE_ACADEMICS', 'MANAGE_DEGREES',
                  'MANAGE_FACILITIES', 'MANAGE_DEPARTMENTS', 'MANAGE_OPTIONS', 'MANAGE_LEVELS',
                  'MANAGE_MODULES', 'MANAGE_SCHOOLS', 'MANAGE_MODULE_SCHEDULES',
                  'MANAGE_MODULE_ASSIGNMENTS', 'MANAGE_MODULE_REGISTRATIONS', 'VIEW_MY_MODULES');

UPDATE `permissions` SET `category_id` = @cat_hr
 WHERE `slug` IN ('VIEW_HR_EMPLOYEES', 'MANAGE_HR_EMPLOYEES', 'MANAGE_LEAVE_TYPES');

UPDATE `permissions` SET `category_id` = @cat_admissions
 WHERE `slug` IN ('MANAGE_ADMISSION_REQUIREMENTS', 'MANAGE_STUDENT_APPLICATIONS',
                  'VERIFY_DOCUMENTS', 'MANAGE_ADMISSIONS');

UPDATE `permissions` SET `category_id` = @cat_system
 WHERE `slug` IN ('MANAGE_ACADEMIC_YEARS', 'MANAGE_ACADEMIC_TERMS', 'VIEW_SYSTEM_BASICS');

UPDATE `permissions` SET `category_id` = @cat_admin
 WHERE `slug` IN ('MANAGE_ROLES', 'MANAGE_PERMISSIONS', 'MANAGE_USERS', 'VIEW_SYSTEM_LOGS');

-- 3c. Drop the stray "Applicant Portal" category now that its sole permission
--     (MANAGE_OWN_PROFILE) has been re-homed to "External Portal".
DELETE FROM `permission_categories`
 WHERE `name` = 'Applicant Portal'
   AND `id` NOT IN (SELECT DISTINCT category_id FROM permissions WHERE category_id IS NOT NULL);

-- 4. Remove obsolete slugs (unused in code) ─────────────────────────────────
DELETE FROM `role_permissions`
 WHERE `permission_id` IN (
    SELECT id FROM `permissions` WHERE `slug` IN ('MANAGE_COURSES', 'MANAGE_COURSE_ASSIGNMENTS', 'STAFF_ACCESS')
 );

DELETE FROM `permissions`
 WHERE `slug` IN ('MANAGE_COURSES', 'MANAGE_COURSE_ASSIGNMENTS', 'STAFF_ACCESS');

-- 5. Grant every permission to Superadmin (role id = 1) ─────────────────────
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT 1, `id` FROM `permissions`;

-- 6. Ensure portal roles still have their baseline permissions ──────────────
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r CROSS JOIN `permissions` p
 WHERE r.name = 'applicant' AND p.slug IN ('ACCESS_APPLICANT_PORTAL', 'MANAGE_OWN_PROFILE');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r CROSS JOIN `permissions` p
 WHERE r.name = 'student' AND p.slug = 'ACCESS_STUDENT_PORTAL';
