-- 2026_04_27_022_seed_all_permissions.sql
-- Seeds all system permissions and assigns them to the Superadmin role.

-- 1. Ensure Categories Exist
INSERT IGNORE INTO `permission_categories` (`name`, `description`) VALUES
('Administration',     'System-wide administrative controls and user management.'),
('Academic Registry',  'Management of students, programs, and academic records.'),
('Modules Management', 'Course scheduling, assignments and registrations.'),
('Finance & Accounts', 'Handling of student fees, payroll, and accounting.'),
('Examinations',       'Planning and recording of examinations and results.'),
('HR Management',      'Management of staff, employees, and leave records.'),
('System Settings',    'Global system configurations like years, terms, and basics.'),
('Admissions',         'Prospective-student pipeline: requirements, verification, offers.'),
('External Portal',    'Permissions for applicant and student self-service portals.'),
('Attendance',         'Recording and tracking student attendance.'),
('Student Clearance',  'Final year clearance process for graduation.');

-- Resolve IDs
SET @cat_admin     = (SELECT id FROM permission_categories WHERE name = 'Administration'     LIMIT 1);
SET @cat_academic  = (SELECT id FROM permission_categories WHERE name = 'Academic Registry'  LIMIT 1);
SET @cat_modules   = (SELECT id FROM permission_categories WHERE name = 'Modules Management' LIMIT 1);
SET @cat_finance   = (SELECT id FROM permission_categories WHERE name = 'Finance & Accounts' LIMIT 1);
SET @cat_exams     = (SELECT id FROM permission_categories WHERE name = 'Examinations'       LIMIT 1);
SET @cat_hr        = (SELECT id FROM permission_categories WHERE name = 'HR Management'      LIMIT 1);
SET @cat_system    = (SELECT id FROM permission_categories WHERE name = 'System Settings'    LIMIT 1);
SET @cat_admissions= (SELECT id FROM permission_categories WHERE name = 'Admissions'         LIMIT 1);
SET @cat_portal    = (SELECT id FROM permission_categories WHERE name = 'External Portal'    LIMIT 1);
SET @cat_attendance= (SELECT id FROM permission_categories WHERE name = 'Attendance'         LIMIT 1);
SET @cat_clearance = (SELECT id FROM permission_categories WHERE name = 'Student Clearance'  LIMIT 1);

-- 2. Insert Permissions
INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
-- Administration
(@cat_admin, 'Manage Roles', 'MANAGE_ROLES', 'Create, update and delete system roles.'),
(@cat_admin, 'Manage Permissions', 'MANAGE_PERMISSIONS', 'Organize permissions and categories.'),
(@cat_admin, 'Manage Users', 'MANAGE_USERS', 'Administrative user management.'),
(@cat_admin, 'View System Logs', 'VIEW_SYSTEM_LOGS', 'Access system activity logs.'),

-- System Settings
(@cat_system, 'Manage Academic Years', 'MANAGE_ACADEMIC_YEARS', 'CRUD for academic years.'),
(@cat_system, 'Manage Academic Terms', 'MANAGE_ACADEMIC_TERMS', 'CRUD for academic terms.'),
(@cat_system, 'View System Basics', 'VIEW_SYSTEM_BASICS', 'Access basic system info.'),
(@cat_system, 'View Settings', 'VIEW_SETTINGS', 'View global system settings.'),
(@cat_system, 'Manage Settings', 'MANAGE_SETTINGS', 'Modify global system settings.'),

-- Academic Registry
(@cat_academic, 'View Student Profiles', 'VIEW_STUDENTS', 'Search and view student records.'),
(@cat_academic, 'Manage Students', 'MANAGE_STUDENTS', 'Create and edit student records.'),
(@cat_academic, 'Manage Academics', 'MANAGE_ACADEMICS', 'Manage general academic structure.'),
(@cat_academic, 'Manage Degrees', 'MANAGE_DEGREES', 'CRUD for degrees.'),
(@cat_academic, 'Manage Facilities', 'MANAGE_FACILITIES', 'Manage rooms/facilities.'),
(@cat_academic, 'Manage Departments', 'MANAGE_DEPARTMENTS', 'CRUD for departments.'),
(@cat_academic, 'Manage Options', 'MANAGE_OPTIONS', 'CRUD for department options.'),
(@cat_academic, 'Manage Levels', 'MANAGE_LEVELS', 'CRUD for levels.'),
(@cat_academic, 'Manage Modules', 'MANAGE_MODULES', 'CRUD for modules.'),
(@cat_academic, 'Manage Schools', 'MANAGE_SCHOOLS', 'CRUD for schools.'),
(@cat_academic, 'View Timetable', 'VIEW_TIMETABLE', 'View academic timetable.'),
(@cat_academic, 'Manage Timetable', 'MANAGE_TIMETABLE', 'Create/edit academic timetable.'),

-- Modules Management
(@cat_modules, 'Manage Module Schedules', 'MANAGE_MODULE_SCHEDULES', 'Manage schedules for modules.'),
(@cat_modules, 'Manage Module Assignments', 'MANAGE_MODULE_ASSIGNMENTS', 'Assign staff to modules.'),
(@cat_modules, 'Manage Module Registrations', 'MANAGE_MODULE_REGISTRATIONS', 'Manage student registrations.'),
(@cat_modules, 'View My Modules', 'VIEW_MY_MODULES', 'View modules assigned to me.'),

-- HR Management
(@cat_hr, 'View HR Employees', 'VIEW_HR_EMPLOYEES', 'Access employee list.'),
(@cat_hr, 'Manage HR Employees', 'MANAGE_HR_EMPLOYEES', 'Manage employee records.'),
(@cat_hr, 'Manage Leave Types', 'MANAGE_LEAVE_TYPES', 'CRUD for leave types.'),
(@cat_hr, 'View Payroll', 'VIEW_PAYROLL', 'View employee payroll data.'),
(@cat_hr, 'Manage Payroll', 'MANAGE_PAYROLL', 'Process and manage payroll.'),
(@cat_hr, 'View Leave Requests', 'VIEW_LEAVE_REQUESTS', 'View employee leave requests.'),
(@cat_hr, 'Manage Leave Requests', 'MANAGE_LEAVE_REQUESTS', 'Approve/Reject leave requests.'),

-- Finance
(@cat_finance, 'View Finance', 'VIEW_FINANCE', 'View financial records and reports.'),
(@cat_finance, 'Manage Finance', 'MANAGE_FINANCE', 'Manage fees, billing and accounting.'),

-- Admissions
(@cat_admissions, 'Manage Admission Requirements', 'MANAGE_ADMISSION_REQUIREMENTS', 'Configure admission checklists.'),
(@cat_admissions, 'Manage Student Applications', 'MANAGE_STUDENT_APPLICATIONS', 'Review applications.'),
(@cat_admissions, 'Verify Documents', 'VERIFY_DOCUMENTS', 'Approve applicant documents.'),
(@cat_admissions, 'Manage Admissions', 'MANAGE_ADMISSIONS', 'Enrollment and intakes.'),
(@cat_admissions, 'View Merit List', 'VIEW_MERIT_LIST', 'View merit lists.'),
(@cat_admissions, 'Manage Merit List', 'MANAGE_MERIT_LIST', 'Modify merit lists.'),

-- Examinations
(@cat_exams, 'View Exams', 'VIEW_EXAMS', 'View exam schedules and results.'),
(@cat_exams, 'Manage Exams', 'MANAGE_EXAMS', 'Manage exam scheduling and transcripts.'),

-- Attendance
(@cat_attendance, 'View Attendance', 'VIEW_ATTENDANCE', 'View student attendance records.'),
(@cat_attendance, 'Record Attendance', 'RECORD_ATTENDANCE', 'Record student attendance.'),
(@cat_attendance, 'Manage Attendance', 'MANAGE_ATTENDANCE', 'Manage attendance settings and logs.'),

-- Student Clearance
(@cat_clearance, 'View Clearance', 'VIEW_CLEARANCE', 'View student clearance status.'),
(@cat_clearance, 'Manage Clearance', 'MANAGE_CLEARANCE', 'Process student clearance.'),

-- External Portals
(@cat_portal, 'Access Applicant Portal', 'ACCESS_APPLICANT_PORTAL', 'Self-service for applicants.'),
(@cat_portal, 'Access Student Portal',   'ACCESS_STUDENT_PORTAL',   'Self-service for students.'),
(@cat_portal, 'Manage Own Profile',      'MANAGE_OWN_PROFILE',      'Profile management for applicants.')
ON DUPLICATE KEY UPDATE 
    `category_id` = VALUES(`category_id`),
    `name` = VALUES(`name`),
    `description` = VALUES(`description`);

-- 3. Assign all to Superadmin (Role ID 1)
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT 1, id FROM `permissions`;
