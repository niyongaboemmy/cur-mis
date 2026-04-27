-- 2026_04_25_021_add_module_schedule_date_range.sql
-- Adds an optional `start_date` / `end_date` window to module_schedules so a
-- recurring schedule can be scoped to a specific date range within its term.
-- Both columns are NULL-able — when null, the schedule is treated as running
-- for the entire term (existing behavior, backwards compatible).
--
-- Idempotent: only ALTERs when the column doesn't already exist.

SET @col_start := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'module_schedules'
    AND COLUMN_NAME  = 'start_date'
);
SET @sql := IF(@col_start = 0,
  'ALTER TABLE `module_schedules` ADD COLUMN `start_date` DATE NULL AFTER `end_time`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_end := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'module_schedules'
    AND COLUMN_NAME  = 'end_date'
);
SET @sql := IF(@col_end = 0,
  'ALTER TABLE `module_schedules` ADD COLUMN `end_date` DATE NULL AFTER `start_date`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
