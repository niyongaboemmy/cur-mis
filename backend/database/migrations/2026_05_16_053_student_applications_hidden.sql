-- ============================================================
-- Migration 053 — Hide/restore + pending timeout flags on applications.
-- Task 1.9: registry staff can hide stale pending applications without
-- deleting them, and a configurable timeout auto-hides applications that
-- have been pending for too long.
-- ============================================================

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications' AND COLUMN_NAME = 'is_hidden');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student_applications` ADD COLUMN `is_hidden` TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications' AND COLUMN_NAME = 'hidden_at');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student_applications` ADD COLUMN `hidden_at` TIMESTAMP NULL DEFAULT NULL',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications' AND COLUMN_NAME = 'hidden_by');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student_applications` ADD COLUMN `hidden_by` INT(10) UNSIGNED NULL DEFAULT NULL',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications' AND COLUMN_NAME = 'hidden_reason');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student_applications` ADD COLUMN `hidden_reason` VARCHAR(255) NULL DEFAULT NULL',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications' AND INDEX_NAME = 'idx_sa_is_hidden');
SET @stmt := IF(@idx = 0,
  'ALTER TABLE `student_applications` ADD INDEX `idx_sa_is_hidden` (`is_hidden`)',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Default 30-day timeout for auto-hide. Admin can tune this via Settings.
-- Supplies `id` explicitly so this works even when the column lacks AUTO_INCREMENT.
INSERT INTO `settings` (`id`, `key_name`, `value`, `description`)
SELECT COALESCE((SELECT MAX(`id`) FROM `settings`), 0) + 1,
       'pending_timeout_days',
       '30',
       'Auto-hide pending applications older than this many days.'
 WHERE NOT EXISTS (SELECT 1 FROM `settings` WHERE `key_name` = 'pending_timeout_days');
