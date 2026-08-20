-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: Announcements permissions
-- Date: 2026-05-16
-- The `announcements` table already exists (comprehensive schema). This migration
-- only registers the VIEW / MANAGE permissions and grants them to roles.
-- ──────────────────────────────────────────────────────────────────────────────

SET @msg_cat_id = (SELECT `id` FROM `permission_categories` WHERE `name` = 'Messaging' LIMIT 1);

INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`)
VALUES
    (@msg_cat_id, 'View Announcements',   'VIEW_ANNOUNCEMENTS',   'See broadcast announcements (exam schedules, results, holidays, notices)'),
    (@msg_cat_id, 'Manage Announcements', 'MANAGE_ANNOUNCEMENTS', 'Create, edit, activate/deactivate and delete broadcast announcements');

-- VIEW: every operational role so the Announcements area appears in their nav.
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`slug` = 'VIEW_ANNOUNCEMENTS'
WHERE r.`name` IN ('superadmin', 'admin', 'registrar', 'hr_manager', 'finance_officer', 'lecturer', 'HOD', 'student', 'gate');

-- MANAGE: registry / administration roles only.
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`slug` = 'MANAGE_ANNOUNCEMENTS'
WHERE r.`name` IN ('superadmin', 'admin', 'registrar');
