-- Migration: Seed permissions for the Module Marks tab
-- Date: 2024-04-27

INSERT INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
(2, 'View Module Marks',   'VIEW_MODULE_MARKS',   'Read student marks for any module / term.'),
(2, 'Record Module Marks', 'RECORD_MODULE_MARKS', 'Lecturer marks entry for modules they are assigned to.'),
(2, 'Manage Module Marks', 'MANAGE_MODULE_MARKS', 'Admin-level marks entry across every module / term.')
ON DUPLICATE KEY UPDATE
  `category_id` = VALUES(`category_id`),
  `name`        = VALUES(`name`),
  `description` = VALUES(`description`);

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT 1, `id` FROM `permissions`
WHERE `slug` IN ('VIEW_MODULE_MARKS', 'RECORD_MODULE_MARKS', 'MANAGE_MODULE_MARKS');
