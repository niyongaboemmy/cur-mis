-- 2026_10_15_001_auto_deductions_scope.sql
-- Payroll Settings "Additional Deductions" become automatic percentage deductions
-- that apply to all staff or to selected staff.
--
--   scope    'all'        – applies to every employee
--            'individual' – applies only to the employees in hr_custom_deduction_staff
--   base     'gross'      – percentage of total gross salary (step 7)
--            'net'        – percentage of net salary (step 19, before CBHI)
--   category 'Insurance'  – e.g. RADIANT or another insurer
--            'Other'      – any other percentage deduction
--
-- Safe to re-run: every change checks information_schema first.

CREATE TABLE IF NOT EXISTS `hr_custom_deductions` (
    `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `label`         VARCHAR(100) NOT NULL,
    `description`   VARCHAR(255) DEFAULT NULL,
    `employee_rate` DECIMAL(6,3) NOT NULL DEFAULT 0,
    `employer_rate` DECIMAL(6,3) NOT NULL DEFAULT 0,
    `is_active`     TINYINT(1) NOT NULL DEFAULT 1,
    `sort_order`    INT NOT NULL DEFAULT 0,
    `created_at`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @db = DATABASE();

-- Columns for tables created before this migration.
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'hr_custom_deductions' AND COLUMN_NAME = 'category') = 0,
  'ALTER TABLE `hr_custom_deductions` ADD COLUMN `category` VARCHAR(20) NOT NULL DEFAULT ''Other'' AFTER `description`',
  'SELECT 1'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'hr_custom_deductions' AND COLUMN_NAME = 'base') = 0,
  'ALTER TABLE `hr_custom_deductions` ADD COLUMN `base` VARCHAR(10) NOT NULL DEFAULT ''gross'' AFTER `employer_rate`',
  'SELECT 1'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'hr_custom_deductions' AND COLUMN_NAME = 'scope') = 0,
  'ALTER TABLE `hr_custom_deductions` ADD COLUMN `scope` VARCHAR(12) NOT NULL DEFAULT ''all'' AFTER `base`',
  'SELECT 1'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Selected staff for a deduction whose scope is 'individual'.
CREATE TABLE IF NOT EXISTS `hr_custom_deduction_staff` (
    `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `deduction_id` INT UNSIGNED NOT NULL,
    `emp_id`       INT NOT NULL,
    `created_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uniq_ded_staff` (`deduction_id`, `emp_id`),
    KEY `idx_ded_staff_emp` (`emp_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
