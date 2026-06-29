-- Migration 074: backfill the columns the current code expects on `student`
-- but that legacy DB snapshots (exported before migrations 048/051/055/064 ran)
-- are missing.
--
-- Symptom this fixes:
--   GET /api/students?...&std_option=9  ->  500 {"success":false,"message":"Server error."}
--   The std_option filter in StudentController::applyFilterableClauses() emits a
--   `user_id IN (SELECT ... )` sub-clause. On a table without `student.user_id`,
--   MariaDB raises "Unknown column 'user_id'" (SQLSTATE 42S22). That PDOException
--   extends RuntimeException, which ExceptionHandler maps to the generic
--   "Server error." 500 when APP_DEBUG=false.
--
-- Every statement is guarded by INFORMATION_SCHEMA so this is safe to re-run and
-- safe on environments that already have some of the columns.

-- ---------------------------------------------------------------------------
-- 1. user_id  — links a student row to its portal login. (was migration 048)
--    This is the column whose absence causes the std_option 500.
-- ---------------------------------------------------------------------------
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student' AND COLUMN_NAME = 'user_id');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student` ADD COLUMN `user_id` INT(10) UNSIGNED DEFAULT NULL AFTER `id`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ---------------------------------------------------------------------------
-- 2. parent_student_id  — links a returning applicant's new cohort row to the
--    prior one (UG -> Masters). (was migration 051/060)
-- ---------------------------------------------------------------------------
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student' AND COLUMN_NAME = 'parent_student_id');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student` ADD COLUMN `parent_student_id` INT(10) UNSIGNED DEFAULT NULL AFTER `user_id`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student' AND INDEX_NAME = 'idx_student_parent');
SET @stmt := IF(@idx = 0,
  'ALTER TABLE `student` ADD INDEX `idx_student_parent` (`parent_student_id`)',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ---------------------------------------------------------------------------
-- 3. programme_level  — each cohort row carries its own programme tier.
--    (was migration 051/060)
-- ---------------------------------------------------------------------------
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student' AND COLUMN_NAME = 'programme_level');
SET @stmt := IF(@col = 0,
  "ALTER TABLE `student` ADD COLUMN `programme_level` ENUM('undergraduate','pgde','masters','phd','diploma','certificate') NOT NULL DEFAULT 'undergraduate' AFTER `current_level`",
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ---------------------------------------------------------------------------
-- 4. assigned_registry_user_id  — owner of an international student case.
--    (was migration 055/060)
-- ---------------------------------------------------------------------------
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student' AND COLUMN_NAME = 'assigned_registry_user_id');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student` ADD COLUMN `assigned_registry_user_id` INT(10) UNSIGNED NULL DEFAULT NULL',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ---------------------------------------------------------------------------
-- 5. is_international  — drives the International Students page. (was 055/060)
-- ---------------------------------------------------------------------------
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student' AND COLUMN_NAME = 'is_international');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student` ADD COLUMN `is_international` TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ---------------------------------------------------------------------------
-- 6. updated_at  — required by the bulk-campus reassign endpoint
--    (UPDATE student SET campus = ?, updated_at = NOW() ...). (was migration 064)
-- ---------------------------------------------------------------------------
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student' AND COLUMN_NAME = 'updated_at');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;
