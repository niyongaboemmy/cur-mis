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
-- Uses a stored procedure for conditional ALTER TABLE (MySQL 5.7 does not
-- support ADD COLUMN IF NOT EXISTS).

DROP PROCEDURE IF EXISTS _mig086_add_fee_payment_cols;

DELIMITER $$
CREATE PROCEDURE _mig086_add_fee_payment_cols()
BEGIN
  -- 2a. source — how the payment entered the system
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'fee_payments'
      AND COLUMN_NAME  = 'source'
  ) THEN
    ALTER TABLE `fee_payments`
      ADD COLUMN `source`
        ENUM('MANUAL','GATEWAY','APPLICATION_TRANSFER') NOT NULL DEFAULT 'MANUAL'
        COMMENT 'How this payment entered the system'
        AFTER `status`;
  END IF;

  -- 2b. source_application_id — FK to student_applications.id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'fee_payments'
      AND COLUMN_NAME  = 'source_application_id'
  ) THEN
    ALTER TABLE `fee_payments`
      ADD COLUMN `source_application_id`
        INT UNSIGNED NULL DEFAULT NULL
        COMMENT 'FK to student_applications.id when source = APPLICATION_TRANSFER'
        AFTER `source`;
  END IF;

  -- 2c. Index on source
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'fee_payments'
      AND INDEX_NAME   = 'idx_fp_source'
  ) THEN
    ALTER TABLE `fee_payments` ADD INDEX `idx_fp_source` (`source`);
  END IF;

  -- 2d. Index on source_application_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'fee_payments'
      AND INDEX_NAME   = 'idx_fp_source_app_id'
  ) THEN
    ALTER TABLE `fee_payments` ADD INDEX `idx_fp_source_app_id` (`source_application_id`);
  END IF;
END$$
DELIMITER ;

CALL _mig086_add_fee_payment_cols();
DROP PROCEDURE IF EXISTS _mig086_add_fee_payment_cols;

-- ── 3. student_applications: add enrolled_student_id column + index
-- ─────────────────────────────────────────────────────────────────────────────
-- Guards the ALTER in a stored procedure for MySQL 5.7 compatibility.
-- The student_applications table may not yet exist on environments where the
-- admissions module has not been deployed; the procedure handles that safely.

DROP PROCEDURE IF EXISTS _mig086_add_sa_cols;

DELIMITER $$
CREATE PROCEDURE _mig086_add_sa_cols()
BEGIN
  -- Only act if the table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'student_applications'
  ) THEN

    -- 3a. enrolled_student_id
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'student_applications'
        AND COLUMN_NAME  = 'enrolled_student_id'
    ) THEN
      ALTER TABLE `student_applications`
        ADD COLUMN `enrolled_student_id`
          VARCHAR(20) NULL DEFAULT NULL
          COMMENT 'Populated at enrollment: mirrors student registration number'
          AFTER `status`;
    END IF;

    -- 3b. Index on enrolled_student_id
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'student_applications'
        AND INDEX_NAME   = 'idx_sa_enrolled_student'
    ) THEN
      ALTER TABLE `student_applications`
        ADD INDEX `idx_sa_enrolled_student` (`enrolled_student_id`);
    END IF;

  END IF;
END$$
DELIMITER ;

CALL _mig086_add_sa_cols();
DROP PROCEDURE IF EXISTS _mig086_add_sa_cols;
