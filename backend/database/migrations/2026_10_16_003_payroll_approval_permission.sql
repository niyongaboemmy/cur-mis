-- 2026_10_16_003_payroll_approval_permission.sql
-- Adds APPROVE_PAYROLL: approve, mark paid and reopen payroll runs, and change rates, roles and hourly rates.
-- Prepare and verify stay under MANAGE_PAYROLL, so the person who approves is not the person who prepares.
--
-- Granted to Superadmin (role id 1) here, the same as the other seeded permissions. Assign it to the
-- Director of Finance (DAF) role in the role screens, and remove it from anyone who only prepares payroll.
--
-- Safe to re-run: INSERT IGNORE and the primary key on role_permissions.

INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`)
SELECT p.`category_id`, 'Approve Payroll', 'APPROVE_PAYROLL',
       'Approve, mark paid and reopen payroll runs; change rates, responsibility amounts and hourly rates.'
  FROM `permissions` p
 WHERE p.`slug` = 'MANAGE_PAYROLL'
 LIMIT 1;

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
  FROM `roles` r
  JOIN `permissions` p ON p.`slug` = 'APPROVE_PAYROLL'
 WHERE r.`id` = 1;
