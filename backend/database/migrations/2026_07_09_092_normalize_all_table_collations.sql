-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 092: Normalise every table to utf8mb4_general_ci
--
-- CONTEXT: production error logs show "Illegal mix of collations
-- (utf8mb4_general_ci,IMPLICIT) and (utf8mb4_unicode_ci,IMPLICIT)" recurring
-- during normal app traffic — not just in the specific joins migrations 087
-- and 090 already targeted (student_id/regnumber, users.email/employee_
-- username), which are confirmed already applied and already defensively
-- coded with explicit COLLATE in PHP. The mismatch is broader than those:
-- this schema has accumulated tables created under both utf8mb4_general_ci
-- and utf8mb4_unicode_ci over time, and any untouched join between them can
-- still trip error 1267.
--
-- FIX: rather than keep chasing individual joins, bring every table onto ONE
-- collation (utf8mb4_general_ci — what the most recent deliberate fix,
-- migration 090, already standardized on). This closes the mismatch at the
-- schema level, so no future un-audited query can hit it.
--
-- This uses a real cursor-based stored procedure (DELIMITER block) — safe to
-- do here because MigrationService::splitStatements() is now DELIMITER-aware
-- (see the commit that touched MigrationService.php alongside this file).
-- Earlier migrations (086, 090) predate that fix and had to work around it
-- with flat PREPARE/EXECUTE lists instead.
--
-- Idempotent: tables already on utf8mb4_general_ci are skipped by the WHERE
-- clause in the cursor; safe to re-run.
-- ══════════════════════════════════════════════════════════════════════════════

-- `ALTER TABLE ... CONVERT TO` rebuilds every row, which forces MySQL to
-- re-validate existing values against the CURRENT session sql_mode — legacy
-- rows with `0000-00-00` dates (accepted under an older, looser mode when
-- they were written) then fail with "Incorrect date value" even though this
-- migration has nothing to do with dates. Relax just the modes that reject
-- already-stored zero-dates for this session; restore afterward.
SET @_orig_sql_mode := @@SESSION.sql_mode;
SET SESSION sql_mode = (
  SELECT REPLACE(REPLACE(REPLACE(@@SESSION.sql_mode,
    'STRICT_TRANS_TABLES', ''), 'NO_ZERO_DATE', ''), 'NO_ZERO_IN_DATE', '')
);

DROP PROCEDURE IF EXISTS `_normalize_all_table_collations`;

DELIMITER $$
CREATE PROCEDURE `_normalize_all_table_collations`()
BEGIN
  DECLARE done INT DEFAULT 0;
  DECLARE tbl VARCHAR(64);
  DECLARE cur CURSOR FOR
    SELECT TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_TYPE = 'BASE TABLE'
      AND TABLE_COLLATION IS NOT NULL
      AND TABLE_COLLATION <> 'utf8mb4_general_ci';
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;
  -- If any single ALTER fails (e.g. a lock timeout), restore sql_mode before
  -- re-raising, so a partial failure here can't leave later migrations in
  -- the same run with a relaxed session sql_mode.
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    SET SESSION sql_mode = @_orig_sql_mode;
    RESIGNAL;
  END;

  OPEN cur;
  read_loop: LOOP
    FETCH cur INTO tbl;
    IF done THEN
      LEAVE read_loop;
    END IF;

    SET @ddl := CONCAT('ALTER TABLE `', tbl, '` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci');
    PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;
  END LOOP;
  CLOSE cur;
END$$
DELIMITER ;

CALL `_normalize_all_table_collations`();
DROP PROCEDURE `_normalize_all_table_collations`;

SET SESSION sql_mode = @_orig_sql_mode;
