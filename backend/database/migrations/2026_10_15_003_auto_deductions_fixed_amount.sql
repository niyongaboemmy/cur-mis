-- 2026_10_15_003_auto_deductions_fixed_amount.sql
-- Additional Deductions can now be a fixed amount in RWF instead of a percentage.
-- A fixed amount is taken from net pay (step 21, with the other deductions, after CBHI).
--
--   amount_type 'percent' – existing items: employee_rate / employer_rate are percentages (kept as they are)
--               'fixed'   – new items: employee_amount / employer_amount are RWF per payslip
--
-- Safe to re-run: every change checks information_schema first.

SET @db = DATABASE();

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'hr_custom_deductions' AND COLUMN_NAME = 'amount_type') = 0,
  'ALTER TABLE `hr_custom_deductions` ADD COLUMN `amount_type` VARCHAR(10) NOT NULL DEFAULT ''percent'' AFTER `category`',
  'SELECT 1'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'hr_custom_deductions' AND COLUMN_NAME = 'employee_amount') = 0,
  'ALTER TABLE `hr_custom_deductions` ADD COLUMN `employee_amount` DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER `employer_rate`',
  'SELECT 1'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'hr_custom_deductions' AND COLUMN_NAME = 'employer_amount') = 0,
  'ALTER TABLE `hr_custom_deductions` ADD COLUMN `employer_amount` DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER `employee_amount`',
  'SELECT 1'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
