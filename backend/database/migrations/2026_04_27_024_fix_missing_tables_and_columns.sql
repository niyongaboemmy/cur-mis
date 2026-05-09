-- 2026_04_27_024_fix_missing_tables_and_columns.sql
-- Adds the module_marks table, the leave_balances table, and patches
-- leave_types, leave_requests, and hr_payroll with missing columns.
-- Compatible with MySQL 5.7 (uses stored procedures for conditional ALTER).

-- ──────────────────────────────────────────────────────────────────────────
-- 1. module_marks  (one row per module × student × term)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `module_marks` (
  `id`                 INT AUTO_INCREMENT PRIMARY KEY,
  `module_id`          INT NOT NULL,
  `student_regnumber`  VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `academic_term_id`   INT UNSIGNED NOT NULL,
  `cat_marks`          DECIMAL(6,2) NULL,
  `assignment_marks`   DECIMAL(6,2) NULL,
  `exam_marks`         DECIMAL(6,2) NULL,
  `cat_max`            DECIMAL(6,2) NOT NULL DEFAULT 20,
  `assignment_max`     DECIMAL(6,2) NOT NULL DEFAULT 10,
  `exam_max`           DECIMAL(6,2) NOT NULL DEFAULT 70,
  `total`              DECIMAL(6,2) NULL,
  `percentage`         DECIMAL(5,2) NULL,
  `grade`              VARCHAR(4)   NULL,
  `remarks`            TEXT NULL,
  `recorded_by`        INT NULL,
  `created_at`         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_marks` (`module_id`, `student_regnumber`, `academic_term_id`),
  KEY `idx_marks_student_term` (`student_regnumber`, `academic_term_id`),
  KEY `idx_marks_module_term`  (`module_id`, `academic_term_id`),
  CONSTRAINT `fk_marks_module` FOREIGN KEY (`module_id`)
    REFERENCES `modules`(`module_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_marks_term`   FOREIGN KEY (`academic_term_id`)
    REFERENCES `academic_terms`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. leave_balances  (employee leave quota per type per year)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `leave_balances` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id`   INT          NOT NULL,
  `leave_type_id` INT UNSIGNED NOT NULL,
  `year`          YEAR         NOT NULL,
  `total_days`    DECIMAL(5,1) NOT NULL DEFAULT 0,
  `used_days`     DECIMAL(5,1) NOT NULL DEFAULT 0,
  `created_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_lb_emp_type_year` (`employee_id`, `leave_type_id`, `year`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ──────────────────────────────────────────────────────────────────────────
-- 3. leave_types  — add missing columns (MySQL 5.7 compatible)
-- ──────────────────────────────────────────────────────────────────────────
DROP PROCEDURE IF EXISTS _patch_leave_types;
CREATE PROCEDURE _patch_leave_types()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_types' AND COLUMN_NAME = 'description'
  ) THEN
    ALTER TABLE `leave_types` ADD COLUMN `description` TEXT DEFAULT NULL AFTER `name`;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_types' AND COLUMN_NAME = 'color'
  ) THEN
    ALTER TABLE `leave_types` ADD COLUMN `color` VARCHAR(30) NOT NULL DEFAULT '#4FB4FF' AFTER `is_paid`;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_types' AND COLUMN_NAME = 'is_active'
  ) THEN
    ALTER TABLE `leave_types` ADD COLUMN `is_active` TINYINT(1) NOT NULL DEFAULT 1 AFTER `color`;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_types' AND COLUMN_NAME = 'updated_at'
  ) THEN
    ALTER TABLE `leave_types` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
  END IF;
END;
CALL _patch_leave_types();
DROP PROCEDURE IF EXISTS _patch_leave_types;

-- Seed default leave types (only inserts rows not already present by id)
INSERT IGNORE INTO `leave_types` (`id`, `name`, `description`, `days_allowed`, `is_paid`, `color`, `is_active`) VALUES
(1, 'Annual Leave',    'Paid annual leave entitlement',         21, 1, '#10B981', 1),
(2, 'Sick Leave',      'Medical sick leave',                    15, 1, '#F59E0B', 1),
(3, 'Maternity Leave', 'Maternity leave for female employees',  84, 1, '#EC4899', 1),
(4, 'Paternity Leave', 'Paternity leave for male employees',     4, 1, '#6366F1', 1),
(5, 'Unpaid Leave',    'Leave without pay',                     30, 0, '#94A3B8', 1),
(6, 'Compassionate',   'Bereavement / compassionate leave',      5, 1, '#8B5CF6', 1);

-- ──────────────────────────────────────────────────────────────────────────
-- 4. leave_requests  — align schema with LeaveController expectations
-- ──────────────────────────────────────────────────────────────────────────
DROP PROCEDURE IF EXISTS _patch_leave_requests;
CREATE PROCEDURE _patch_leave_requests()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_requests' AND COLUMN_NAME = 'employee_id'
  ) THEN
    ALTER TABLE `leave_requests` ADD COLUMN `employee_id` INT DEFAULT NULL AFTER `id`;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_requests' AND COLUMN_NAME = 'review_comment'
  ) THEN
    ALTER TABLE `leave_requests` ADD COLUMN `review_comment` TEXT DEFAULT NULL AFTER `notes`;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_requests' AND COLUMN_NAME = 'reviewed_by'
  ) THEN
    ALTER TABLE `leave_requests` ADD COLUMN `reviewed_by` INT DEFAULT NULL AFTER `review_comment`;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_requests' AND COLUMN_NAME = 'reviewed_at'
  ) THEN
    ALTER TABLE `leave_requests` ADD COLUMN `reviewed_at` DATETIME DEFAULT NULL AFTER `reviewed_by`;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_requests' AND COLUMN_NAME = 'updated_at'
  ) THEN
    ALTER TABLE `leave_requests` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
  END IF;
END;
CALL _patch_leave_requests();
DROP PROCEDURE IF EXISTS _patch_leave_requests;

-- Backfill employee_id from staff_id for legacy rows (best-effort mapping)
UPDATE `leave_requests`
SET `employee_id` = `staff_id`
WHERE `employee_id` IS NULL AND `staff_id` IS NOT NULL;

-- Backfill review_comment from notes for historical records
UPDATE `leave_requests`
SET `review_comment` = `notes`
WHERE `review_comment` IS NULL AND `notes` IS NOT NULL AND `notes` != '';

-- Normalise status values to Title Case (controller expects 'Pending', 'Approved', etc.)
ALTER TABLE `leave_requests`
  MODIFY COLUMN `status`
    ENUM('Pending','Approved','Rejected','Cancelled') NOT NULL DEFAULT 'Pending';

-- ──────────────────────────────────────────────────────────────────────────
-- 5. hr_payroll  — add missing breakdown columns used by HrPayrollController
-- ──────────────────────────────────────────────────────────────────────────
DROP PROCEDURE IF EXISTS _patch_hr_payroll;
CREATE PROCEDURE _patch_hr_payroll()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_payroll' AND COLUMN_NAME = 'period_year'
  ) THEN
    ALTER TABLE `hr_payroll` ADD COLUMN `period_year` SMALLINT(4) NOT NULL DEFAULT 0 AFTER `pay_month`;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_payroll' AND COLUMN_NAME = 'period_month'
  ) THEN
    ALTER TABLE `hr_payroll` ADD COLUMN `period_month` TINYINT(2) NOT NULL DEFAULT 0 AFTER `period_year`;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_payroll' AND COLUMN_NAME = 'basic_salary'
  ) THEN
    ALTER TABLE `hr_payroll` ADD COLUMN `basic_salary` DECIMAL(15,2) NOT NULL DEFAULT 0 AFTER `period_month`;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_payroll' AND COLUMN_NAME = 'housing_allowance'
  ) THEN
    ALTER TABLE `hr_payroll` ADD COLUMN `housing_allowance` DECIMAL(15,2) NOT NULL DEFAULT 0 AFTER `basic_salary`;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_payroll' AND COLUMN_NAME = 'transport_allowance'
  ) THEN
    ALTER TABLE `hr_payroll` ADD COLUMN `transport_allowance` DECIMAL(15,2) NOT NULL DEFAULT 0 AFTER `housing_allowance`;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_payroll' AND COLUMN_NAME = 'other_allowances'
  ) THEN
    ALTER TABLE `hr_payroll` ADD COLUMN `other_allowances` DECIMAL(15,2) NOT NULL DEFAULT 0 AFTER `transport_allowance`;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_payroll' AND COLUMN_NAME = 'updated_at'
  ) THEN
    ALTER TABLE `hr_payroll` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
  END IF;
END;
CALL _patch_hr_payroll();
DROP PROCEDURE IF EXISTS _patch_hr_payroll;

-- Add unique constraint for (emp_id, period_year, period_month) if not already present
DROP PROCEDURE IF EXISTS _add_payroll_unique_key;
CREATE PROCEDURE _add_payroll_unique_key()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'hr_payroll'
      AND INDEX_NAME   = 'ux_payroll_emp_period'
  ) THEN
    ALTER TABLE `hr_payroll`
      ADD UNIQUE KEY `ux_payroll_emp_period` (`emp_id`, `period_year`, `period_month`);
  END IF;
END;
CALL _add_payroll_unique_key();
DROP PROCEDURE IF EXISTS _add_payroll_unique_key;

-- Backfill period_year / period_month from pay_month string (format 'YYYY-MM')
UPDATE `hr_payroll`
SET
  `period_year`  = CAST(SUBSTRING_INDEX(`pay_month`, '-', 1) AS UNSIGNED),
  `period_month` = CAST(SUBSTRING_INDEX(`pay_month`, '-', -1) AS UNSIGNED)
WHERE (`period_year` = 0 OR `period_month` = 0)
  AND `pay_month` REGEXP '^[0-9]{4}-[0-9]{1,2}$';

-- ──────────────────────────────────────────────────────────────────────────
-- 6. payroll_config — seed any missing keys
-- ──────────────────────────────────────────────────────────────────────────
INSERT IGNORE INTO `payroll_config` (`config_key`, `config_value`) VALUES
('rssb_employer_rate', '0.0500'),
('rssb_employee_rate', '0.0300'),
('rama_employer_rate', '0.0750'),
('rama_employee_rate', '0.0750'),
('maternity_rate',     '0.0060'),
('cbhi_rate',          '0.0050');
