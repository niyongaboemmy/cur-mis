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
-- ══════════════════════════════════════════════════════════════════════════════

-- `ALTER TABLE ... MODIFY` rebuilds every row, which re-validates existing
-- values against the CURRENT session sql_mode. `employees.employee_reg_date`
-- holds legacy `0000-00-00` values (49 of them locally), so under a strict
-- server the rebuild fails with "1292 Incorrect date value" even though this
-- migration only widens two character columns. Relax just the zero-date modes
-- for this session; restored at the end. Same idiom as migration 092.
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
