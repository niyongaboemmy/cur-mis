-- 2026_10_14_002_multiple_responsibility_roles.sql
-- An employee can hold more than one responsibility (CUR procedure, step 5).
-- employees.responsibility_role now stores a comma-separated list of role codes,
-- for example "dean,internal_auditor". The allowance is the sum of the amounts.
-- Safe to re-run: the column is only widened.

SET @db = DATABASE();

SET @sql = (SELECT IF(
    (SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'responsibility_role') < 255,
  'ALTER TABLE `employees` MODIFY COLUMN `responsibility_role` VARCHAR(255) NULL DEFAULT NULL COMMENT ''Step 5: comma-separated role codes, see PayrollCalculator::RESPONSIBILITY_ROLES''',
  'SELECT 1'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
