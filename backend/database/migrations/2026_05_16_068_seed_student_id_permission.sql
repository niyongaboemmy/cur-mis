-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: Student ID card permission.
-- Date: 2026-05-16
-- The `student_ids` table already exists (and gained a PK/AUTO_INCREMENT in 066).
-- ──────────────────────────────────────────────────────────────────────────────

SET @reg_cat_id = (SELECT `id` FROM `permission_categories` WHERE `name` = 'Academic Registry' LIMIT 1);

INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`)
VALUES
    (@reg_cat_id, 'Manage Student ID Cards', 'MANAGE_STUDENT_IDS', 'Issue, re-issue, revoke and print student identity cards');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`slug` = 'MANAGE_STUDENT_IDS'
WHERE r.`name` IN ('superadmin', 'admin', 'registrar');
