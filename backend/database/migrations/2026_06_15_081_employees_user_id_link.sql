-- Migration 081: link `employees` to `users` (1:1) so a staff user account and
-- its HR employee record are created/maintained together. Login stays on
-- `users`; `employees` holds the HR-only attributes. Additive + idempotent.
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='employees' AND COLUMN_NAME='user_id');
SET @stmt := IF(@col=0,
  'ALTER TABLE `employees` ADD COLUMN `user_id` INT(10) UNSIGNED NULL DEFAULT NULL AFTER `employee_id`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='employees' AND INDEX_NAME='idx_emp_user');
SET @stmt := IF(@idx=0,
  'ALTER TABLE `employees` ADD INDEX `idx_emp_user` (`user_id`)',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;
