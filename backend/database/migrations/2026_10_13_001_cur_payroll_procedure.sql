-- 2026_10_13_001_cur_payroll_procedure.sql
-- Adds the columns needed to store the full CUR "Calculation of Payroll" procedure
-- (basic → housing/transport → gross → responsibility allowance → arrears → PAYE,
-- employee and employer RSSB/RAMA, CBHI, other deductions, net pay).
-- Safe to re-run: every column is added only if missing.

-- ── hr_payroll: procedure components ───────────────────────────────────────
SET @db = DATABASE();

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `hr_payroll` ADD COLUMN `base_gross` DECIMAL(15,2) NOT NULL DEFAULT 0.00 COMMENT ''Step 4: basic + housing + transport''',
  'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'hr_payroll' AND COLUMN_NAME = 'base_gross');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `hr_payroll` ADD COLUMN `responsibility_allowance` DECIMAL(15,2) NOT NULL DEFAULT 0.00 COMMENT ''Step 5''',
  'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'hr_payroll' AND COLUMN_NAME = 'responsibility_allowance');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `hr_payroll` ADD COLUMN `arrears` DECIMAL(15,2) NOT NULL DEFAULT 0.00 COMMENT ''Step 6''',
  'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'hr_payroll' AND COLUMN_NAME = 'arrears');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `hr_payroll` ADD COLUMN `maternity_base` DECIMAL(15,2) NOT NULL DEFAULT 0.00 COMMENT ''Step 9: total gross minus transport''',
  'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'hr_payroll' AND COLUMN_NAME = 'maternity_base');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `hr_payroll` ADD COLUMN `employer_rama` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT ''Step 17: CUR share of RAMA''',
  'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'hr_payroll' AND COLUMN_NAME = 'employer_rama');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `hr_payroll` ADD COLUMN `employer_occupational` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT ''Step 11: 2% employer-only''',
  'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'hr_payroll' AND COLUMN_NAME = 'employer_occupational');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── employees: current responsibility role (drives step 5 each month) ─────
SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `employees` ADD COLUMN `responsibility_role` VARCHAR(40) NULL DEFAULT NULL COMMENT ''Step 5 role code, see PayrollCalculator::RESPONSIBILITY_ROLES''',
  'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'responsibility_role');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- employees.salary now means the monthly BASIC salary (step 1).
-- Existing rows held the old gross figure; they are left as-is and should be
-- reviewed by HR before the next payroll run.
