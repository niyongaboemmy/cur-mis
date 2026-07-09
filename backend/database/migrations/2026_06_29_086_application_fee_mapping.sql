-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 086: Application Fee → Finance Fee Structure Mapping
-- Safe to re-run: INSERTs check existence first and ALTER TABLE operations
-- are wrapped in stored procedures that guard against duplicate columns/indexes.
-- Compatible with MySQL 5.7+.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Seed settings
-- ─────────────────────────────────────────────────────────────────────────────
-- settings.id has no AUTO_INCREMENT so explicit IDs are required.
-- Each INSERT only runs when the key does not yet exist;
-- the id is derived from MAX(id)+1 at insert time so it never collides.

-- 1a. Which fee_structures record application payments map to (primary key)
INSERT INTO `settings` (`id`, `key_name`, `value`, `description`)
SELECT (SELECT COALESCE(MAX(id), 0) + 1 FROM `settings`),
       'application_fee_mapped_fee_structure_id',
       '',
       'ID of the fee_structures record that application fee payments map to. Leave blank to disable mapping.'
WHERE NOT EXISTS (
  SELECT 1 FROM `settings` WHERE `key_name` = 'application_fee_mapped_fee_structure_id'
);

-- 1b. Fallback fee amount used when no fee structure is mapped
INSERT INTO `settings` (`id`, `key_name`, `value`, `description`)
SELECT (SELECT COALESCE(MAX(id), 0) + 1 FROM `settings`),
       'application_fee_amount',
       '5000',
       'RWF fallback amount charged to applicants when no fee structure is mapped. The mapped fee structure takes priority.'
WHERE NOT EXISTS (
  SELECT 1 FROM `settings` WHERE `key_name` = 'application_fee_amount'
);

-- 1c. Auto-credit toggle
INSERT INTO `settings` (`id`, `key_name`, `value`, `description`)
SELECT (SELECT COALESCE(MAX(id), 0) + 1 FROM `settings`),
       'application_fee_credit_on_enrollment',
       '1',
       '1 = auto-credit mapped invoice when student enrolls; 0 = track for reporting only.'
WHERE NOT EXISTS (
  SELECT 1 FROM `settings` WHERE `key_name` = 'application_fee_credit_on_enrollment'
);

-- ── 2. fee_payments: add source tracking columns + indexes
-- ─────────────────────────────────────────────────────────────────────────────
-- Each ALTER is guarded by an INFORMATION_SCHEMA check + PREPARE/EXECUTE
-- rather than a stored procedure — this migration runner splits multi-
-- statement files on bare `;`, which corrupts CREATE PROCEDURE bodies (and
-- doesn't understand the client-only `DELIMITER` directive at all).

-- 2a. source — how the payment entered the system
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fee_payments' AND COLUMN_NAME = 'source');
SET @stmt := IF(@col = 0,
  "ALTER TABLE `fee_payments` ADD COLUMN `source` ENUM('MANUAL','GATEWAY','APPLICATION_TRANSFER') NOT NULL DEFAULT 'MANUAL' COMMENT 'How this payment entered the system' AFTER `status`",
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- 2b. source_application_id — FK to student_applications.id
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fee_payments' AND COLUMN_NAME = 'source_application_id');
SET @stmt := IF(@col = 0,
  "ALTER TABLE `fee_payments` ADD COLUMN `source_application_id` INT UNSIGNED NULL DEFAULT NULL COMMENT 'FK to student_applications.id when source = APPLICATION_TRANSFER' AFTER `source`",
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- 2c. Index on source
SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fee_payments' AND INDEX_NAME = 'idx_fp_source');
SET @stmt := IF(@idx = 0, 'ALTER TABLE `fee_payments` ADD INDEX `idx_fp_source` (`source`)', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- 2d. Index on source_application_id
SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fee_payments' AND INDEX_NAME = 'idx_fp_source_app_id');
SET @stmt := IF(@idx = 0, 'ALTER TABLE `fee_payments` ADD INDEX `idx_fp_source_app_id` (`source_application_id`)', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ── 3. student_applications: add enrolled_student_id column + index
-- ─────────────────────────────────────────────────────────────────────────────
-- Guarded by INFORMATION_SCHEMA + PREPARE/EXECUTE (see note above on why not
-- a stored procedure). The student_applications table may not yet exist on
-- environments where the admissions module hasn't been deployed.

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES
                     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications');

-- 3a. enrolled_student_id
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications' AND COLUMN_NAME = 'enrolled_student_id');
SET @stmt := IF(@tbl_exists > 0 AND @col = 0,
  "ALTER TABLE `student_applications` ADD COLUMN `enrolled_student_id` VARCHAR(20) NULL DEFAULT NULL COMMENT 'Populated at enrollment: mirrors student registration number' AFTER `status`",
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- 3b. Index on enrolled_student_id
SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications' AND INDEX_NAME = 'idx_sa_enrolled_student');
SET @stmt := IF(@tbl_exists > 0 AND @idx = 0,
  'ALTER TABLE `student_applications` ADD INDEX `idx_sa_enrolled_student` (`enrolled_student_id`)',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;
