-- Migration: Add MANAGE_HR_EMPLOYEES and MANAGE_STUDENTS permissions
-- Date: 2026-04-22

-- HR Management: manage employees (create / update / delete)
INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`)
VALUES (5, 'Manage HR Employees', 'MANAGE_HR_EMPLOYEES', 'Create, update, and delete HR employee records.');

-- Academic Registry: manage students (create / update / delete)
INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`)
VALUES (2, 'Manage Students', 'MANAGE_STUDENTS', 'Create, update, and delete student records.');

-- Assign both new permissions to the admin role (role_id = 2)
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT 2, id FROM `permissions` WHERE `slug` IN ('MANAGE_HR_EMPLOYEES', 'MANAGE_STUDENTS');
