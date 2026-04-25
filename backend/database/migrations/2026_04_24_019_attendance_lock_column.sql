-- 2026_04_24_019_attendance_lock_column.sql
-- Adds a boolean `is_locked` column to attendance_sessions so admins can
-- block a session from further edits by teachers. A session can be
-- `status = closed` (saved) but still unlocked, meaning the teacher who
-- owns it can re-open and edit it. `is_locked = 1` disables teacher edits
-- entirely — only users with MANAGE_ATTENDANCE can unlock/modify.
--
-- Idempotent: checks for the column before ALTERing.

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'attendance_sessions'
    AND COLUMN_NAME  = 'is_locked'
);

SET @sql := IF(@col_exists = 0,
  'ALTER TABLE `attendance_sessions`
     ADD COLUMN `is_locked` TINYINT(1) NOT NULL DEFAULT 0
     AFTER `status`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
