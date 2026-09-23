-- ──────────────────────────────────────────────────────────────────────────────
-- Migration 133: In-system notification centre.
-- Date: 2026-08-17
--
-- The `notifications` table has existed since the comprehensive schema but had
-- exactly one writer (FinesController) and no read API or UI at all — anything
-- written to it was invisible. This migration gives it the few columns a real
-- notification centre needs, so the leave approval flow (and every future
-- module) can tell people what happened inside the system as well as by email:
--
--   * title        — a short headline, so the UI is not one long sentence
--   * entity_type / entity_id — deep-link target + lets a module find and
--                    supersede its own earlier notification for the same record
--   * read_at      — when it was read, not just that it was
--   * severity     — drives the colour/urgency treatment in the bell
--
-- Idempotent — safe to re-run.
-- ──────────────────────────────────────────────────────────────────────────────

-- ── Repair the primary key first ────────────────────────────────────────────
-- Same legacy defect migration 081 fixed for the leave tables: on some
-- environments this table was created without PRIMARY KEY / AUTO_INCREMENT on
-- `id`, so every INSERT fails with 1364 "Field 'id' doesn't have a default
-- value". Nothing could ever be written, which is part of why the table sat
-- unused.
SET @has_pk = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications' AND INDEX_NAME = 'PRIMARY');
SET @sql = IF(@has_pk = 0,
  'ALTER TABLE `notifications` ADD PRIMARY KEY (`id`)',
  'SELECT ''notifications already has a primary key''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @is_ai = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications'
    AND COLUMN_NAME = 'id' AND EXTRA LIKE '%auto_increment%');
SET @sql = IF(@is_ai = 0,
  'ALTER TABLE `notifications` MODIFY `id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT',
  'SELECT ''notifications.id already auto_increment''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── New columns (each guarded independently) ─────────────────────────────────
SET @has_col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications' AND COLUMN_NAME = 'title');
SET @sql = IF(@has_col = 0,
  'ALTER TABLE `notifications` ADD COLUMN `title` VARCHAR(150) NULL DEFAULT NULL AFTER `type`',
  'SELECT ''notifications.title already exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications' AND COLUMN_NAME = 'entity_type');
SET @sql = IF(@has_col = 0,
  'ALTER TABLE `notifications` ADD COLUMN `entity_type` VARCHAR(60) NULL DEFAULT NULL AFTER `link`',
  'SELECT ''notifications.entity_type already exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications' AND COLUMN_NAME = 'entity_id');
SET @sql = IF(@has_col = 0,
  'ALTER TABLE `notifications` ADD COLUMN `entity_id` INT(10) UNSIGNED NULL DEFAULT NULL AFTER `entity_type`',
  'SELECT ''notifications.entity_id already exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications' AND COLUMN_NAME = 'severity');
SET @sql = IF(@has_col = 0,
  'ALTER TABLE `notifications` ADD COLUMN `severity` ENUM(''info'',''success'',''warning'',''danger'') NOT NULL DEFAULT ''info'' AFTER `entity_id`',
  'SELECT ''notifications.severity already exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications' AND COLUMN_NAME = 'read_at');
SET @sql = IF(@has_col = 0,
  'ALTER TABLE `notifications` ADD COLUMN `read_at` DATETIME NULL DEFAULT NULL AFTER `is_read`',
  'SELECT ''notifications.read_at already exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- `message` at 255 chars truncates a sentence naming a leave type, a person and
-- two dates. Widen it — no data loss, the column only grows.
ALTER TABLE `notifications` MODIFY `message` TEXT NOT NULL;

-- ── Indexes for the two queries the bell actually runs ──────────────────────
SET @has_idx = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications' AND INDEX_NAME = 'idx_notif_user_unread');
SET @sql = IF(@has_idx = 0,
  'ALTER TABLE `notifications` ADD INDEX `idx_notif_user_unread` (`user_id`, `is_read`, `created_at`)',
  'SELECT ''idx_notif_user_unread already exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_idx = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications' AND INDEX_NAME = 'idx_notif_entity');
SET @sql = IF(@has_idx = 0,
  'ALTER TABLE `notifications` ADD INDEX `idx_notif_entity` (`entity_type`, `entity_id`)',
  'SELECT ''idx_notif_entity already exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill read_at for anything already marked read, so the UI never shows a
-- read notification with no timestamp.
UPDATE `notifications` SET `read_at` = `created_at` WHERE `is_read` = 1 AND `read_at` IS NULL;
