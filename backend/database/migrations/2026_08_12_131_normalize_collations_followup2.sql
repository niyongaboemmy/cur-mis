-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 131: Normalise every table to utf8mb4_general_ci (2nd follow-up)
--
-- CONTEXT: production log, 2026-08-10, immediately after deploying migration
-- 123 and the 2026-08-10 PROD cumulated migration:
--   PDOException: SQLSTATE[HY000]: General error: 1267 Illegal mix of
--   collations (utf8mb4_unicode_ci,IMPLICIT) and (utf8mb4_general_ci,IMPLICIT)
--   for operation '='
-- Traced to App\Helpers\LecturerScope::hrEmployeeIdForUser(), which runs on
-- every teacher-portal request:
--   SELECT e.id FROM `hr_employees` e
--   JOIN `users` u ON LOWER(TRIM(u.email)) = LOWER(TRIM(e.email))
-- `hr_employees` and `users` were both created without an explicit COLLATE in
-- 027_comprehensive_schema, so each inherited whatever the server's utf8mb4
-- default collation was at CREATE TABLE time — and those defaults disagree
-- between this database and the one 092/116 were normalized against. Same
-- class of bug as 116's header describes, different table pair.
--
-- FIX: re-run the same cursor-based normalize-all-tables sweep as 092/116 so
-- this doesn't turn into more whack-a-mole against individual table names.
-- Idempotent — tables already on utf8mb4_general_ci are skipped.
-- ══════════════════════════════════════════════════════════════════════════════

SET @_orig_sql_mode := @@SESSION.sql_mode;
SET SESSION sql_mode = (
  SELECT REPLACE(REPLACE(REPLACE(@@SESSION.sql_mode,
    'STRICT_TRANS_TABLES', ''), 'NO_ZERO_DATE', ''), 'NO_ZERO_IN_DATE', '')
);

DROP PROCEDURE IF EXISTS `_normalize_all_table_collations_v3`;

DELIMITER $$
CREATE PROCEDURE `_normalize_all_table_collations_v3`()
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

CALL `_normalize_all_table_collations_v3`();
DROP PROCEDURE `_normalize_all_table_collations_v3`;

SET SESSION sql_mode = @_orig_sql_mode;
