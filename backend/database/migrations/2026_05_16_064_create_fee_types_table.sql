-- Migration 064: Introduce fee_types lookup table; relax ENUM fee_type columns to VARCHAR(50)
-- Idempotent: all DDL changes are guarded by INFORMATION_SCHEMA existence checks.

SET @_db = DATABASE();
SET FOREIGN_KEY_CHECKS = 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- §1  Create fee_types lookup table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `fee_types` (
  `id`          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `code`        VARCHAR(50)   NOT NULL COMMENT 'Immutable; stored as value in fee_structures/invoices',
  `label`       VARCHAR(100)  NOT NULL,
  `description` TEXT          NULL,
  `is_active`   TINYINT(1)    NOT NULL DEFAULT 1,
  `sort_order`  INT           NOT NULL DEFAULT 0,
  `created_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_fee_type_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- §2  Seed the 10 existing hardcoded fee types (INSERT IGNORE = idempotent)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT IGNORE INTO `fee_types` (`code`, `label`, `sort_order`) VALUES
  ('TUITION',           'Tuition',           1),
  ('REGISTRATION',      'Registration',      2),
  ('ADMISSION',         'Admission',         3),
  ('HOSTEL',            'Hostel',            4),
  ('ACADEMIC_DOCUMENT', 'Academic Document', 5),
  ('FINE',              'Fine',              6),
  ('REPEAT_MODULE',     'Repeat Module',     7),
  ('ARREARS',           'Arrears',           8),
  ('BURSARY_CREDIT',    'Bursary Credit',    9),
  ('MODULE_FEE',        'Module Fee',       10);

-- ─────────────────────────────────────────────────────────────────────────────
-- §3  ALTER fee_structures.fee_type: ENUM → VARCHAR(50)
-- ─────────────────────────────────────────────────────────────────────────────
SET @_q = IF(
  EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @_db
      AND TABLE_NAME   = 'fee_structures'
      AND COLUMN_NAME  = 'fee_type'
      AND DATA_TYPE    = 'enum'
  ),
  'ALTER TABLE `fee_structures` MODIFY COLUMN `fee_type` VARCHAR(50) NOT NULL',
  'SELECT 1'
);
PREPARE _s064a FROM @_q; EXECUTE _s064a; DEALLOCATE PREPARE _s064a;

-- ─────────────────────────────────────────────────────────────────────────────
-- §4  ALTER fee_invoices.fee_type: ENUM → VARCHAR(50)
-- ─────────────────────────────────────────────────────────────────────────────
SET @_q = IF(
  EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @_db
      AND TABLE_NAME   = 'fee_invoices'
      AND COLUMN_NAME  = 'fee_type'
      AND DATA_TYPE    = 'enum'
  ),
  'ALTER TABLE `fee_invoices` MODIFY COLUMN `fee_type` VARCHAR(50) NOT NULL',
  'SELECT 1'
);
PREPARE _s064b FROM @_q; EXECUTE _s064b; DEALLOCATE PREPARE _s064b;

-- ─────────────────────────────────────────────────────────────────────────────
-- §5  ALTER student_fee_overrides.fee_type: ENUM → VARCHAR(50)
-- ─────────────────────────────────────────────────────────────────────────────
SET @_q = IF(
  EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @_db
      AND TABLE_NAME   = 'student_fee_overrides'
      AND COLUMN_NAME  = 'fee_type'
      AND DATA_TYPE    = 'enum'
  ),
  'ALTER TABLE `student_fee_overrides` MODIFY COLUMN `fee_type` VARCHAR(50) NOT NULL',
  'SELECT 1'
);
PREPARE _s064c FROM @_q; EXECUTE _s064c; DEALLOCATE PREPARE _s064c;

SET FOREIGN_KEY_CHECKS = 1;
