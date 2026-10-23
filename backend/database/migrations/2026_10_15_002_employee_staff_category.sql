-- 2026_10_15_002_employee_staff_category.sql
-- CUR splits staff into Academic and Administrative. Each employee gets one of
-- these categories, or NULL when not yet classified.
-- Safe to re-run: the column is only added when it does not exist.

SET @db = DATABASE();

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'staff_category') = 0,
  'ALTER TABLE `employees` ADD COLUMN `staff_category` VARCHAR(20) NULL DEFAULT NULL COMMENT ''Academic | Administrative'' AFTER `faculty`',
  'SELECT 1'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
