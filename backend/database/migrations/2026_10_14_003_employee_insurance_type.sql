-- 2026_10_14_003_employee_insurance_type.sql
-- Each employee is on RAMA (default) or another insurer such as RADIANT ("OTHER").
-- For OTHER, no RAMA contribution is calculated (employee or CUR share); the insurer
-- premium is recorded as an employee deduction.
-- Safe to re-run: the column is only added if missing.

SET @db = DATABASE();

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `employees` ADD COLUMN `insurance_type` VARCHAR(10) NOT NULL DEFAULT ''RAMA'' COMMENT ''RAMA or OTHER (e.g. RADIANT)''',
  'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'insurance_type');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
