-- 2026_09_05_158_widen_student_applications_a2_grades.sql
-- `a2_grades` (migration 057) is a free-text field the applicant types their
-- A2 subject/grade breakdown into. VARCHAR(160) is too narrow for applicants
-- listing several subjects with grades, causing production update failures:
--   SQLSTATE[22001]: String data, right truncated: 1406 Data too long for
--   column 'a2_grades'
-- Widen it well past any real subject list rather than guess a tighter bound.
-- Idempotent: only alters if the column is still narrower than 500 chars.

SET @needs_change := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'student_applications'
    AND COLUMN_NAME  = 'a2_grades'
    AND (CHARACTER_MAXIMUM_LENGTH IS NULL OR CHARACTER_MAXIMUM_LENGTH < 500)
);
SET @sql := IF(@needs_change > 0,
  'ALTER TABLE `student_applications` MODIFY `a2_grades` VARCHAR(500) NULL DEFAULT NULL',
  'SELECT 1');
PREPARE _stmt FROM @sql; EXECUTE _stmt; DEALLOCATE PREPARE _stmt;
