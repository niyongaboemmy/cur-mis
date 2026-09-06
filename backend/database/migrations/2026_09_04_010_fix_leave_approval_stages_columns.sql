-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: Repair leave_approval_stages / leave_request_approvals schema
-- Date: 2026-09-04
--
-- Production hit:
--   PDOException SQLSTATE[42S22]: Unknown column 'stg.stage_key' in 'SELECT'
--
-- The `leave_approval_stages` table exists on the live DB but is missing the
-- workflow columns that migration 2026_08_17_132 was meant to create (the
-- CREATE TABLE IF NOT EXISTS was a no-op because an earlier, thinner version of
-- the table was already there). LeaveRequestModel::DETAIL_SELECT — used by the
-- admin list, the single-request view and the approval queue — selects
-- stg.stage_key / stage_label / is_final_approval / sla_hours, so every one of
-- those endpoints 500s.
--
-- This migration brings both tables up to the canonical shape. Idempotent —
-- each column is added only when absent, so it is safe to re-run and safe on a
-- DB that already has the full schema.
-- ──────────────────────────────────────────────────────────────────────────────

-- ── 0. Create the tables outright if they are entirely absent ───────────────
CREATE TABLE IF NOT EXISTS `leave_approval_stages` (
  `id`                       INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `leave_type_id`            INT(10) UNSIGNED NOT NULL,
  `stage_order`              TINYINT UNSIGNED NOT NULL,
  `stage_key`                VARCHAR(100)     NOT NULL,
  `stage_label`              VARCHAR(150)     NOT NULL,
  `required_permission_slug` VARCHAR(100)     NOT NULL,
  `is_final_approval`        TINYINT(1)       NOT NULL DEFAULT 0,
  `sla_hours`                INT(10) UNSIGNED          DEFAULT NULL,
  `created_at`               TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`               TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_las_type_order` (`leave_type_id`, `stage_order`),
  KEY `idx_las_permission` (`required_permission_slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `leave_request_approvals` (
  `id`               INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `leave_request_id` INT(10) UNSIGNED NOT NULL,
  `stage_order`      TINYINT UNSIGNED NOT NULL,
  `stage_key`        VARCHAR(100)     NOT NULL,
  `stage_label`      VARCHAR(150)              DEFAULT NULL,
  `actor_id`         INT(10) UNSIGNED          DEFAULT NULL,
  `actor_name`       VARCHAR(150)              DEFAULT NULL,
  `actor_role`       VARCHAR(100)              DEFAULT NULL,
  `decision`         ENUM('submitted','approved','rejected','changes_requested','resubmitted','cancelled') NOT NULL,
  `comment`          TEXT                      DEFAULT NULL,
  `decided_at`       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_lra_request` (`leave_request_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 1. leave_approval_stages: add any missing workflow columns ──────────────
SET @has = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_approval_stages' AND COLUMN_NAME = 'stage_order');
SET @sql = IF(@has = 0,
  'ALTER TABLE `leave_approval_stages` ADD COLUMN `stage_order` TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER `leave_type_id`',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @has = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_approval_stages' AND COLUMN_NAME = 'stage_key');
SET @sql = IF(@has = 0,
  'ALTER TABLE `leave_approval_stages` ADD COLUMN `stage_key` VARCHAR(100) NOT NULL DEFAULT '''' AFTER `stage_order`',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @has = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_approval_stages' AND COLUMN_NAME = 'stage_label');
SET @sql = IF(@has = 0,
  'ALTER TABLE `leave_approval_stages` ADD COLUMN `stage_label` VARCHAR(150) NOT NULL DEFAULT '''' AFTER `stage_key`',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @has = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_approval_stages' AND COLUMN_NAME = 'required_permission_slug');
SET @sql = IF(@has = 0,
  'ALTER TABLE `leave_approval_stages` ADD COLUMN `required_permission_slug` VARCHAR(100) NOT NULL DEFAULT '''' AFTER `stage_label`',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @has = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_approval_stages' AND COLUMN_NAME = 'is_final_approval');
SET @sql = IF(@has = 0,
  'ALTER TABLE `leave_approval_stages` ADD COLUMN `is_final_approval` TINYINT(1) NOT NULL DEFAULT 0 AFTER `required_permission_slug`',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @has = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_approval_stages' AND COLUMN_NAME = 'sla_hours');
SET @sql = IF(@has = 0,
  'ALTER TABLE `leave_approval_stages` ADD COLUMN `sla_hours` INT(10) UNSIGNED DEFAULT NULL AFTER `is_final_approval`',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ── 2. leave_request_approvals: same treatment ─────────────────────────────
SET @has = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_request_approvals' AND COLUMN_NAME = 'stage_key');
SET @sql = IF(@has = 0,
  'ALTER TABLE `leave_request_approvals` ADD COLUMN `stage_key` VARCHAR(100) NOT NULL DEFAULT '''' AFTER `stage_order`',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @has = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_request_approvals' AND COLUMN_NAME = 'stage_label');
SET @sql = IF(@has = 0,
  'ALTER TABLE `leave_request_approvals` ADD COLUMN `stage_label` VARCHAR(150) DEFAULT NULL AFTER `stage_key`',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ── 3. leave_requests.current_stage_order pointer ──────────────────────────
SET @has = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_requests' AND COLUMN_NAME = 'current_stage_order');
SET @sql = IF(@has = 0,
  'ALTER TABLE `leave_requests` ADD COLUMN `current_stage_order` TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER `status`',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
