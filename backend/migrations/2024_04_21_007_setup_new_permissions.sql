-- 2024_04_21_007_setup_new_permissions.sql
-- Setup categories and permissions for new Academic and HR features

SET @superadmin_role_id = 1;

-- 1. Insert New Permission Categories
INSERT INTO `permission_categories` (`id`, `name`, `description`) VALUES
(5, 'HR Management', 'Management of staff, employees, and leave records.'),
(6, 'System Settings', 'Global system configurations like years, terms, and basics.')
ON DUPLICATE KEY UPDATE
    `name` = VALUES(`name`),
    `description` = VALUES(`description`);

-- 2. Insert Permissions
INSERT INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
-- System Settings
(6, 'Manage Academic Years', 'MANAGE_ACADEMIC_YEARS', 'CRUD for academic years and activation/deactivation.'),
(6, 'Manage Academic Terms', 'MANAGE_ACADEMIC_TERMS', 'CRUD for academic terms and activation/deactivation.'),
(6, 'View System Basics', 'VIEW_SYSTEM_BASICS', 'Access to system-wide basic info (active year, term, etc).'),

-- Academic Registry
(2, 'Manage Courses', 'MANAGE_COURSES', 'CRUD for academic courses.'),
(2, 'Manage Degrees', 'MANAGE_DEGREES', 'CRUD for student degrees.'),
(2, 'Manage Course Assignments', 'MANAGE_COURSE_ASSIGNMENTS', 'Assigning staff to courses.'),
(2, 'Manage Facilities', 'MANAGE_FACILITIES', 'Manage rooms and facilities.'),
(2, 'Manage Departments', 'MANAGE_DEPARTMENTS', 'CRUD for university departments.'),
(2, 'Manage Options', 'MANAGE_OPTIONS', 'CRUD for department options/specializations.'),
(2, 'Manage Levels', 'MANAGE_LEVELS', 'CRUD for academic levels.'),
(2, 'Manage Modules', 'MANAGE_MODULES', 'CRUD for academic modules.'),
(2, 'Manage Schools', 'MANAGE_SCHOOLS', 'CRUD for schools/faculties.'),

-- HR Management
(5, 'View HR Employees', 'VIEW_HR_EMPLOYEES', 'Access to the paginated list of HR employees.'),
(5, 'Manage Leave Types', 'MANAGE_LEAVE_TYPES', 'CRUD for employee leave types.')

ON DUPLICATE KEY UPDATE
    `category_id` = VALUES(`category_id`),
    `name` = VALUES(`name`),
    `description` = VALUES(`description`);

-- 3. Auto-assign all permissions to the Superadmin role
-- Instead of deleting, we use INSERT IGNORE to add only new ones
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT @superadmin_role_id, `id` FROM `permissions`;
