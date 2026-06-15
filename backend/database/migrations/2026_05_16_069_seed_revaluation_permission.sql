-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: Revaluation management permission.
-- Date: 2026-05-16
-- The `revaluations` table already exists (PK/AUTO_INCREMENT added in 066).
-- ──────────────────────────────────────────────────────────────────────────────

SET @exam_cat_id = (SELECT `id` FROM `permission_categories` WHERE `name` = 'Examinations' LIMIT 1);

INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`)
VALUES
    (@exam_cat_id, 'Manage Revaluations', 'MANAGE_REVALUATIONS', 'Review, approve, reject and process student result revaluation requests');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`slug` = 'MANAGE_REVALUATIONS'
WHERE r.`name` IN ('superadmin', 'admin', 'registrar', 'HOD');
