-- 2026_04_25_023_add_finance_permissions.sql
-- Adds VIEW_FINANCE and VIEW_ATTENDANCE permissions to the Finance & Accounts
-- and Attendance categories respectively, and grants them to Superadmin.
-- Idempotent: uses INSERT IGNORE throughout.

SET @cat_finance  = (SELECT id FROM permission_categories WHERE name = 'Finance & Accounts' LIMIT 1);
SET @cat_academic = (SELECT id FROM permission_categories WHERE name = 'Academic Registry'  LIMIT 1);

-- Add VIEW_FINANCE (read-only finance access for clerks / auditors)
INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
  (@cat_finance, 'View Finance',    'VIEW_FINANCE',    'Read-only access to student ledgers, invoices and financial reports.'),
  (@cat_academic, 'View Attendance', 'VIEW_ATTENDANCE', 'View attendance records without recording capability.');

-- Grant both new permissions to Superadmin (role id = 1)
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT 1, id FROM `permissions`
WHERE `slug` IN ('VIEW_FINANCE', 'VIEW_ATTENDANCE');
