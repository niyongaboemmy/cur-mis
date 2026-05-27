-- ============================================================
-- Migration 057 — Student applications: A-Level academic fields.
-- Migration 035 declared these in its header comment but never
-- shipped the ALTER statements. The apply wizard collects them and
-- the model lists them as fillable, so they have to exist for the
-- preview ("Academic background" panel) to render real values
-- instead of dashes.
-- ============================================================

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications' AND COLUMN_NAME = 'a2_grades');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student_applications` ADD COLUMN `a2_grades` VARCHAR(160) NULL DEFAULT NULL AFTER `combination`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications' AND COLUMN_NAME = 'principal_passes');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student_applications` ADD COLUMN `principal_passes` TINYINT UNSIGNED NULL DEFAULT NULL AFTER `a2_grades`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications' AND COLUMN_NAME = 'serial_number');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student_applications` ADD COLUMN `serial_number` VARCHAR(80) NULL DEFAULT NULL AFTER `principal_passes`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;
