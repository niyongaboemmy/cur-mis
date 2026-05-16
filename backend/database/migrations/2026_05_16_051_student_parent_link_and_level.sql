-- ============================================================
-- Migration 051 — Student: returning-applicant support.
-- Adds parent_student_id (link to prior cohort row, e.g. UG ↔ Masters)
-- and programme_level so each row carries its own programme tier.
-- ============================================================

SET @has_parent = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student' AND COLUMN_NAME = 'parent_student_id'
);
SET @sql = IF(@has_parent = 0,
  'ALTER TABLE `student` ADD COLUMN `parent_student_id` INT(10) UNSIGNED DEFAULT NULL AFTER `user_id`',
  'SELECT ''student.parent_student_id already exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_level = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student' AND COLUMN_NAME = 'programme_level'
);
SET @sql = IF(@has_level = 0,
  "ALTER TABLE `student` ADD COLUMN `programme_level` ENUM('undergraduate','pgde','masters','phd','diploma','certificate') NOT NULL DEFAULT 'undergraduate' AFTER `current_level`",
  'SELECT ''student.programme_level already exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Index supports lookups for "all programmes for this person".
SET @has_idx = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student' AND INDEX_NAME = 'idx_student_parent'
);
SET @sql = IF(@has_idx = 0,
  'ALTER TABLE `student` ADD INDEX `idx_student_parent` (`parent_student_id`)',
  'SELECT ''idx_student_parent already exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
