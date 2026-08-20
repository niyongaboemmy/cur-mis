-- Migration: Seed the four new permissions for Modules Management
-- Date: 2024-04-23
--
-- Adds MANAGE_MODULE_SCHEDULES, MANAGE_MODULE_ASSIGNMENTS,
-- MANAGE_MODULE_REGISTRATIONS, VIEW_MY_MODULES and grants them to
-- the Superadmin role (role_id = 1).

INSERT INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
(2, 'Manage Module Schedules',     'MANAGE_MODULE_SCHEDULES',     'Create / edit module timetable entries with conflict detection.'),
(2, 'Manage Module Assignments',   'MANAGE_MODULE_ASSIGNMENTS',   'Assign faculty to modules and track workload.'),
(2, 'Manage Module Registrations', 'MANAGE_MODULE_REGISTRATIONS', 'Admin-level access to all student module registrations.'),
(2, 'View My Modules',             'VIEW_MY_MODULES',             'Students view eligible modules and self-register.')
ON DUPLICATE KEY UPDATE
  `category_id` = VALUES(`category_id`),
  `name`        = VALUES(`name`),
  `description` = VALUES(`description`);

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT 1, `id` FROM `permissions`
WHERE `slug` IN (
  'MANAGE_MODULE_SCHEDULES',
  'MANAGE_MODULE_ASSIGNMENTS',
  'MANAGE_MODULE_REGISTRATIONS',
  'VIEW_MY_MODULES'
);
