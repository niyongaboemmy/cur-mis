-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: Add VIEW_ONLINE_PAYMENTS_HISTORY permission
-- Date: 2026-05-16
-- ──────────────────────────────────────────────────────────────────────────────

SET @finance_cat_id = (SELECT `id` FROM `permission_categories` WHERE `name` = 'Finance' LIMIT 1);

INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`) 
VALUES 
    (@finance_cat_id, 'View Online Payments History', 'VIEW_ONLINE_PAYMENTS_HISTORY', 'View the legacy online payments history table from UrubutoPay and other gateways');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`slug` = 'VIEW_ONLINE_PAYMENTS_HISTORY'
WHERE r.`name` IN ('superadmin', 'admin', 'finance_officer');
