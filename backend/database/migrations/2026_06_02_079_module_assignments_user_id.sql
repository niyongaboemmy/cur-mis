-- Migration 079: allow a module assignment (lecturer) to reference a USER
-- directly, not only an HR employee.
--
-- Module scheduling assigns a lecturer via `module_assignments.staff_id`
-- (-> hr_employees). To let ANY non-student/applicant user be assigned as a
-- lecturer (per the unified people directory), add an optional `user_id`.
-- An assignment now references either staff_id (HR employee) or user_id (user
-- account); the lecturer name resolves from whichever is set.
--
-- Idempotent: guarded ADD COLUMN.

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'module_assignments' AND COLUMN_NAME = 'user_id');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `module_assignments` ADD COLUMN `user_id` INT(10) UNSIGNED NULL DEFAULT NULL AFTER `staff_id`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'module_assignments' AND INDEX_NAME = 'idx_ma_user');
SET @stmt := IF(@idx = 0,
  'ALTER TABLE `module_assignments` ADD INDEX `idx_ma_user` (`user_id`)',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;
