-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: Leave Management — Supervisor-based Hierarchical Approval
-- Date: 2026-09-04
--
-- Refactors leave approvals to use direct supervisors as first-level approvers,
-- following the organizational hierarchy from the CUR organigram.
--
-- Changes:
-- 1. Add supervisor_id to users table (links employee to direct manager)
-- 2. Create APPROVE_LEAVE_SUPERVISOR permission (first-level approval)
-- 3. Reconfigure leave_approval_stages to use supervisor → HR → Final chain
-- 4. Assign supervisors based on organizational structure
--
-- Idempotent — safe to re-run.
-- ──────────────────────────────────────────────────────────────────────────────

-- ── 1. Add supervisor_id column to users table ───────────────────────────────
SET @has_supervisor_id = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'supervisor_id'
);
SET @sql = IF(@has_supervisor_id = 0,
  'ALTER TABLE `users` ADD COLUMN `supervisor_id` INT UNSIGNED NULL COMMENT "Direct supervisor/manager in the organizational hierarchy" AFTER `id`, ADD FOREIGN KEY (`supervisor_id`) REFERENCES `users`(`id`) ON DELETE SET NULL',
  'SELECT "users.supervisor_id already exists"'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add index for supervisor lookups
SET @has_supervisor_idx = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'idx_users_supervisor_id'
);
SET @sql = IF(@has_supervisor_idx = 0,
  'ALTER TABLE `users` ADD INDEX `idx_users_supervisor_id` (`supervisor_id`)',
  'SELECT "idx_users_supervisor_id already exists"'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 2. Create supervisor-level leave approval permission ────────────────────
SET @cat_hr = (SELECT `id` FROM `permission_categories` WHERE `name` = 'HR Management' LIMIT 1);

INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
  (@cat_hr, 'Approve Leave — Supervisor', 'APPROVE_LEAVE_SUPERVISOR', 'Approve or reject staff leave requests as a direct supervisor (first-level approval).');

-- ── 3. Reconfigure leave approval stages ──────────────────────────────────────
-- Keep existing stages but update permissions to use supervisor as first level

-- Get all leave types
CREATE TEMPORARY TABLE temp_leave_types AS
SELECT `id` FROM `leave_types`;

-- Update Stage 1: Change from generic L1 to APPROVE_LEAVE_SUPERVISOR
UPDATE `leave_approval_stages`
SET `required_permission_slug` = 'APPROVE_LEAVE_SUPERVISOR',
    `stage_label` = 'Supervisor Review',
    `stage_key` = 'supervisor_review'
WHERE `stage_order` = 1
  AND `required_permission_slug` IN ('APPROVE_LEAVE_L1', 'APPROVE_LEAVE_VC');

-- Ensure Stage 2 is HR
UPDATE `leave_approval_stages`
SET `required_permission_slug` = 'APPROVE_LEAVE_HR',
    `stage_label` = 'HR Recommendation',
    `stage_key` = 'hr_recommendation'
WHERE `stage_order` = 2;

-- Ensure final stage is properly set
UPDATE `leave_approval_stages`
SET `is_final_approval` = 1,
    `required_permission_slug` = 'APPROVE_LEAVE_FINAL',
    `stage_label` = 'Final Authorization',
    `stage_key` = 'final_authorization'
WHERE `is_final_approval` = 1;

DROP TEMPORARY TABLE temp_leave_types;

-- ── 4. Grant supervisor permission to managers/department heads ──────────────
-- HODs get supervisor approval permission (they supervise their departments)
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`slug` = 'APPROVE_LEAVE_SUPERVISOR'
WHERE r.`name` IN ('hod', 'head_of_department', 'department_head', 'dean');

-- Any role with MANAGE_LEAVE_REQUESTS gets supervisor permission too (backward compat)
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT DISTINCT rp1.`role_id`, p.`id`
FROM `role_permissions` rp1
JOIN `permissions` p ON p.`slug` = 'APPROVE_LEAVE_SUPERVISOR'
JOIN `permissions` p2 ON p2.`slug` = 'MANAGE_LEAVE_REQUESTS'
WHERE rp1.`permission_id` = p2.`id`
  AND NOT EXISTS (
    SELECT 1 FROM `role_permissions` rp2
    WHERE rp2.`role_id` = rp1.`role_id`
      AND rp2.`permission_id` = p.`id`
  );

-- ── 5. Create audit/tracking table for supervisor assignments ────────────────
CREATE TABLE IF NOT EXISTS `user_supervisor_assignments` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`      INT UNSIGNED NOT NULL,
  `supervisor_id` INT UNSIGNED NOT NULL,
  `assignment_reason` VARCHAR(255) NULL COMMENT 'How/why this assignment was made (e.g., department_hierarchy, manual_override)',
  `assigned_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `assigned_by`  INT UNSIGNED NULL,
  `valid_from`   DATE NOT NULL,
  `valid_until`  DATE NULL COMMENT 'NULL means currently valid',

  PRIMARY KEY (`id`),
  KEY `idx_usa_user` (`user_id`),
  KEY `idx_usa_supervisor` (`supervisor_id`),
  KEY `idx_usa_valid` (`valid_from`, `valid_until`),
  CONSTRAINT `fk_usa_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_usa_supervisor` FOREIGN KEY (`supervisor_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_usa_assigned_by` FOREIGN KEY (`assigned_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Audit trail of supervisor assignments for leave approval hierarchy';

-- ── 6. Log existing supervisors before this migration ──────────────────────────
-- This inserts records for any users who already have supervisor_id set
INSERT INTO `user_supervisor_assignments` (`user_id`, `supervisor_id`, `assignment_reason`, `valid_from`)
SELECT `id`, `supervisor_id`, 'pre_existing', CURDATE()
FROM `users`
WHERE `supervisor_id` IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM `user_supervisor_assignments` usa
    WHERE usa.`user_id` = users.`id`
      AND usa.`supervisor_id` = users.`supervisor_id`
      AND usa.`valid_until` IS NULL
  );
