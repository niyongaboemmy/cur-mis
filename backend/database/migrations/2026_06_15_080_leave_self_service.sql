-- ──────────────────────────────────────────────────────────────────────────────
-- Migration 080: Leave self-service.
-- Date: 2026-06-15
--   1. Adds `user_id` to leave_requests so any staff login (users table) can file
--      a leave request for themselves — the legacy `employees` table has no email
--      and no link to login accounts, so self-service requests are user-scoped.
--   2. Seeds the REQUEST_LEAVE permission and grants it to every staff role so
--      "any staff can request leave" while view/approve stays role-gated.
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. leave_requests.user_id (requesting login account) ------------------------
SET @has_user_id = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_requests' AND COLUMN_NAME = 'user_id'
);
SET @sql = IF(@has_user_id = 0,
  'ALTER TABLE `leave_requests` ADD COLUMN `user_id` INT(10) UNSIGNED DEFAULT NULL COMMENT ''FK → users.id (self-service requester)'' AFTER `staff_id`',
  'SELECT ''leave_requests.user_id already exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_user_idx = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_requests' AND INDEX_NAME = 'idx_lr_user'
);
SET @sql = IF(@has_user_idx = 0,
  'ALTER TABLE `leave_requests` ADD INDEX `idx_lr_user` (`user_id`)',
  'SELECT ''idx_lr_user already exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. REQUEST_LEAVE permission -------------------------------------------------
SET @cat_hr = (SELECT `id` FROM `permission_categories` WHERE `name` = 'HR Management' LIMIT 1);

INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`)
VALUES
    (@cat_hr, 'Request Leave', 'REQUEST_LEAVE', 'Submit your own leave requests and view their status.');

-- Grant to every staff role (everyone except external portal roles).
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`slug` = 'REQUEST_LEAVE'
WHERE r.`name` NOT IN ('applicant', 'student');
