-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 123: Widen employees.employee_position / employee_post
--
-- CONTEXT: both columns were created as VARCHAR(21) in 027_comprehensive_schema
-- and never widened. Production log, 2026-08-05:
--   SQLSTATE[22001]: String data, right truncated: 1406 Data too long for
--   column 'employee_position' — value "Communications Officer" (22 chars).
-- `employee_post` (department/free-text) carries the same risk and is widened
-- alongside it defensively.
--
-- DESIGN: Additive, idempotent (guarded by INFORMATION_SCHEMA on current
-- length so re-running is a no-op once widened).
--
-- NOTE: MODIFY COLUMN rewrites the whole table, which under strict mode
-- re-validates every column on every row — not just the one being altered.
-- `employees` carries pre-existing '0000-00-00' zero-dates in
-- `employee_reg_date` (49 rows as of 2026-08-10) that predate this migration
-- and are otherwise untouched by it; NO_ZERO_DATE/STRICT_TRANS_TABLES turns
-- those into a hard failure on an ALTER that has nothing to do with dates.
-- Relaxed the same way as 116's collation sweep, for the duration of the
-- ALTERs only.
-- ══════════════════════════════════════════════════════════════════════════════

SET @_orig_sql_mode := @@SESSION.sql_mode;
SET SESSION sql_mode = (
  SELECT REPLACE(REPLACE(REPLACE(@@SESSION.sql_mode,
    'STRICT_TRANS_TABLES', ''), 'NO_ZERO_DATE', ''), 'NO_ZERO_IN_DATE', '')
);

SET @len := (SELECT CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees'
               AND COLUMN_NAME = 'employee_position');
SET @stmt := IF(@len IS NOT NULL AND @len < 100,
  'ALTER TABLE `employees` MODIFY COLUMN `employee_position` VARCHAR(100) NOT NULL',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @len := (SELECT CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees'
               AND COLUMN_NAME = 'employee_post');
SET @stmt := IF(@len IS NOT NULL AND @len < 100,
  'ALTER TABLE `employees` MODIFY COLUMN `employee_post` VARCHAR(100) NOT NULL',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ── Restore the caller's sql_mode ─────────────────────────────────────────────
SET SESSION sql_mode = @_orig_sql_mode;
