-- Migration 048: add user_id FK column to student and staff tables (if not already present).
-- Links each record to its portal login in the users table.

-- student
SET @has_student_user_id = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student' AND COLUMN_NAME = 'user_id'
);
SET @sql = IF(@has_student_user_id = 0,
  'ALTER TABLE `student` ADD COLUMN `user_id` INT(10) UNSIGNED DEFAULT NULL AFTER `id`',
  'SELECT ''student.user_id already exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- staff
SET @has_staff_user_id = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'staff' AND COLUMN_NAME = 'user_id'
);
SET @sql = IF(@has_staff_user_id = 0,
  'ALTER TABLE `staff` ADD COLUMN `user_id` INT(10) UNSIGNED DEFAULT NULL AFTER `id`',
  'SELECT ''staff.user_id already exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
