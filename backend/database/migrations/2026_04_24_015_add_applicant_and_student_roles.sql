-- 2026_04_24_015_add_applicant_and_student_roles.sql
-- Adds the 'applicant' and 'student' roles to the system and assigns them to the roles table.

-- 1. Insert the 'applicant' role if it doesn't exist
INSERT IGNORE INTO `roles` (`id`, `name`, `description`) VALUES (9, 'applicant', 'Applicant Role - External account for prospective students');

-- 2. Insert the 'student' role if it doesn't exist
INSERT IGNORE INTO `roles` (`id`, `name`, `description`) VALUES (10, 'student', 'Student Role - Internal account for enrolled students');

-- 3. Add a permission category for "External Portal" if it doesn't exist
INSERT IGNORE INTO `permission_categories` (`id`, `name`, `description`) VALUES (5, 'External Portal', 'Permissions for applicant and student self-service portals.');

-- 4. Add permissions for applicant/student self-service
INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
(5, 'Access Applicant Portal', 'ACCESS_APPLICANT_PORTAL', 'Allows prospective students to manage their applications and profile.'),
(5, 'Access Student Portal', 'ACCESS_STUDENT_PORTAL', 'Allows enrolled students to access their academic and financial records.');

-- 5. Link permissions to roles
-- Note: Applicants and students usually have access via specialized controllers, but we add these for completeness in the RBAC system.

-- Link ACCESS_APPLICANT_PORTAL to applicant role
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT 9, `id` FROM `permissions` WHERE `slug` = 'ACCESS_APPLICANT_PORTAL';

-- Link ACCESS_STUDENT_PORTAL to student role
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT 10, `id` FROM `permissions` WHERE `slug` = 'ACCESS_STUDENT_PORTAL';
