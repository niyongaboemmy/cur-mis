-- ============================================================
-- Migration 054 — Credit-transfer / upgrading applicant workflow.
-- Adds flags + exemption-letter tracking on student_applications, and a
-- registry override for the entry level so credit-transfer admits enter
-- mid-programme.
-- ============================================================

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications' AND COLUMN_NAME = 'is_credit_transfer');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student_applications` ADD COLUMN `is_credit_transfer` TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications' AND COLUMN_NAME = 'credit_transfer_from');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student_applications` ADD COLUMN `credit_transfer_from` VARCHAR(255) NULL DEFAULT NULL',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications' AND COLUMN_NAME = 'exemption_letter_status');
SET @stmt := IF(@col = 0,
  "ALTER TABLE `student_applications` ADD COLUMN `exemption_letter_status` ENUM('not_required','pending','received_registry','received_finance','confirmed') NOT NULL DEFAULT 'not_required'",
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications' AND COLUMN_NAME = 'exemption_letter_received_at');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student_applications` ADD COLUMN `exemption_letter_received_at` TIMESTAMP NULL DEFAULT NULL',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications' AND COLUMN_NAME = 'entry_level_override');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student_applications` ADD COLUMN `entry_level_override` VARCHAR(50) NULL DEFAULT NULL',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;
