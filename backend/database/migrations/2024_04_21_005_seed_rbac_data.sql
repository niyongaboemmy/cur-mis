-- 2024_04_21_005_seed_rbac_data.sql
-- Seeds the initial categories and permissions for the RBAC system

-- Set the target role ID for Superadmin (usually 1)
SET @superadmin_role_id = 1;

-- 1. Seed Permission Categories
INSERT INTO `permission_categories` (`id`, `name`, `description`) VALUES
(1, 'Administration', 'System-wide administrative controls and user management.'),
(2, 'Academic Registry', 'Management of students, programs, and academic records.'),
(3, 'Finance & Accounts', 'Handling of student fees, billing, and accounting.'),
(4, 'Examinations', 'Planning and recording of examinations and results.')
ON DUPLICATE KEY UPDATE 
    `name` = VALUES(`name`), 
    `description` = VALUES(`description`);

-- 2. Seed Permissions
-- Note: Slugs must match App\Constants\Permissions.php exactly.
INSERT INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
-- Administration
(1, 'Manage Roles', 'MANAGE_ROLES', 'Allows creating, updating and deleting system roles.'),
(1, 'Manage Permissions', 'MANAGE_PERMISSIONS', 'Allows organizing permissions and categories.'),
(1, 'Manage Users', 'MANAGE_USERS', 'Allows administrative user management (CRUD, roles, status).'),
(1, 'View System Logs', 'VIEW_SYSTEM_LOGS', 'Access to system activity logs and audit trails.'),

-- Academic Registry
(2, 'View Student Profiles', 'VIEW_STUDENTS', 'Permission to search and view detailed student records.'),
(2, 'Manage Academic Programs', 'MANAGE_ACADEMICS', 'Manage courses, programs, and curriculum.'),

-- Finance
(3, 'Manage Financial Records', 'MANAGE_FINANCE', 'Access to fee management, billing, and financial reports.'),

-- Examinations
(4, 'Manage Examination Results', 'MANAGE_EXAMS', 'Manage exam scheduling and transcript records.')

ON DUPLICATE KEY UPDATE 
    `category_id` = VALUES(`category_id`),
    `name` = VALUES(`name`),
    `description` = VALUES(`description`);

-- 3. Auto-assign all permissions to the Superadmin role
-- This ensures that the administrator has immediate access to all new features.

-- First, clear existing assignments for Superadmin to prevent duplicates (optional but safe)
DELETE FROM `role_permissions` WHERE `role_id` = @superadmin_role_id;

-- Now link every permission in the table to the Superadmin role
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT @superadmin_role_id, `id` FROM `permissions`;
